// A table server's own research events (the game, connections) on their way to the database: collected for
// a moment and sent in batches, in the background. If the database cannot be reached the events wait (in
// memory, and in the server's storage when it has some) and are tried again with backoff. A server that
// cannot record never slows a table: emit() only appends to an array.
import type { Envelope } from './schema';

export interface ShipperStore {
  /** Batches that could not be sent yet (a Durable Object's storage, files on the Oracle server). */
  load(): Promise<{ key: string; events: Envelope[] }[]>;
  put(key: string, events: Envelope[]): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ShipperDeps {
  write(events: Envelope[]): Promise<boolean>;
  store?: ShipperStore | null;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(h: unknown): void;
  now(): number;
  log?(m: string): void;
  /** Keep a pending send alive (a Durable Object's ctx.waitUntil). */
  keepAlive?(p: Promise<unknown>): void;
}

export interface ShipperOptions { delayMs: number; batchEvents: number; maxWaiting: number; maxBackoffMs: number }
const DEFAULTS: ShipperOptions = { delayMs: 1500, batchEvents: 300, maxWaiting: 50_000, maxBackoffMs: 5 * 60_000 };

export class ResearchShipper {
  private buf: Envelope[] = [];
  private failed: { key: string; events: Envelope[] }[] = [];
  private timer: unknown = null;
  private timerAt = 0;
  private sending: Promise<void> | null = null;
  private tries = 0;
  private retryAt = 0;
  readonly o: ShipperOptions;
  readonly stats = { emitted: 0, sent: 0, dropped: 0, failures: 0 };

  constructor(private d: ShipperDeps, o: Partial<ShipperOptions> = {}) { this.o = { ...DEFAULTS, ...o }; }

  /** Batches a previous run could not send. */
  async start(): Promise<void> {
    try { this.failed = (await this.d.store?.load()) ?? []; } catch (e) { this.d.log?.(`research: store unreadable ${String(e)}`); }
    if (this.failed.length) this.arm(0);
  }

  emit(e: Envelope): void {
    this.stats.emitted++;
    this.buf.push(e);
    if (this.buf.length + this.waitingFailed() > this.o.maxWaiting) { this.buf.shift(); this.stats.dropped++; }
    this.arm(this.buf.length >= this.o.batchEvents ? 0 : this.o.delayMs);
  }

  get waiting(): number { return this.buf.length + this.waitingFailed(); }
  private waitingFailed(): number { return this.failed.reduce((s, f) => s + f.events.length, 0); }

  private arm(ms: number): void {
    const wait = Math.max(ms, this.retryAt - this.d.now());
    const at = this.d.now() + wait;
    if (this.timer !== null) {
      if (this.timerAt <= at) return; // an earlier one is set already
      this.d.clearTimer(this.timer);
    }
    this.timerAt = at;
    this.timer = this.d.setTimer(() => { this.timer = null; const p = this.flush(); this.d.keepAlive?.(p); }, wait);
  }

  /** Send everything waiting (failed batches first). Resolves when done; never throws. */
  flush(): Promise<void> {
    if (this.sending) return this.sending.then(() => this.flush());
    const run = this.flushOnce().finally(() => { this.sending = null; });
    this.sending = run;
    return run;
  }

  private async flushOnce(): Promise<void> {
    if (this.failed.length && this.d.now() < this.retryAt) { this.arm(0); return; }
    // earlier failures first, oldest first
    while (this.failed.length) {
      const f = this.failed[0]!;
      if (!(await this.tryWrite(f.events))) return this.backoff();
      this.failed.shift();
      try { await this.d.store?.remove(f.key); } catch { /* sent anyway; a resend is dropped by id */ }
    }
    while (this.buf.length) {
      const batch = this.buf.splice(0, this.o.batchEvents);
      if (!(await this.tryWrite(batch))) {
        const key = `${Math.floor(this.d.now())}-${batch[0]!.id}`;
        this.failed.push({ key, events: batch });
        try { await this.d.store?.put(key, batch); } catch { /* memory only */ }
        return this.backoff();
      }
    }
    this.tries = 0; this.retryAt = 0;
  }

  private async tryWrite(events: Envelope[]): Promise<boolean> {
    try {
      if (await this.d.write(events)) { this.stats.sent += events.length; return true; }
    } catch (e) { this.d.log?.(`research: write failed ${String(e).slice(0, 200)}`); }
    this.stats.failures++;
    return false;
  }

  private backoff(): void {
    this.tries++;
    this.retryAt = this.d.now() + Math.min(this.o.maxBackoffMs, 2000 * 2 ** Math.min(this.tries, 10));
    this.arm(0);
  }
}
