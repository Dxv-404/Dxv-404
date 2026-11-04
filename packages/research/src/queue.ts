// The app's research queue: events wait in memory and go out in batches every few seconds, never in the
// way of the game. Nothing here throws into the app, and nothing here blocks: sending is asynchronous, and
// the queue is capped (oldest dropped first, and counted) so a phone that cannot reach the server for hours
// stays small.
//
// - flush(): the next batch, in order; a batch the server took is removed, a failed one stays and is tried
//   again with backoff (2 s, 4 s, ... up to a minute); a batch the server refused as malformed is dropped;
// - hide(): the page is going away (background, lock, close): the whole queue is saved (storage that
//   survives a reload) and the head of it is sent with a beacon. Beaconed events stay queued: the database
//   drops duplicates by event id, so sending twice is harmless and losing nothing is the point;
// - start(): events saved by an earlier page load are put back in front (they keep their ids and sessions).
import type { Envelope } from './schema';

export type SendResult = { ok: true; serverTime?: number } | { ok: false; retry: boolean };

export interface QueueDeps {
  /** Send a batch (body is JSON text). beacon: the page is going away (sendBeacon / keepalive). */
  send(body: string, beacon: boolean): Promise<SendResult>;
  /** Saved events (a capped store that survives reloads), or nothing. */
  store?: { load(): Envelope[]; save(events: Envelope[]): void } | null;
  /** Monotonic clock (ms) and timers. */
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(h: unknown): void;
  /** A request's round trip: sent at t0, server clock st, answered at t3 (monotonic ms). */
  onClock?(t0: number, st: number, t3: number, wall0: number): void;
}

export interface QueueOptions {
  flushEveryMs: number;
  /** Most events, and bytes, kept waiting (memory and saved). */
  maxEvents: number;
  maxBytes: number;
  /** One batch. */
  batchEvents: number;
  batchBytes: number;
  /** A beacon's limit (browsers take about 64 KB). */
  beaconBytes: number;
  maxBackoffMs: number;
}

export const QUEUE_DEFAULTS: QueueOptions = {
  flushEveryMs: 4000, maxEvents: 6000, maxBytes: 1_500_000, batchEvents: 400, batchBytes: 200_000, beaconBytes: 60_000, maxBackoffMs: 60_000,
};

interface Item { e: Envelope; bytes: number }

export class ResearchQueue {
  private items: Item[] = [];
  private bytes = 0;
  private inFlight = 0; // events at the head of `items` currently being sent
  private timer: unknown = null;
  private failures = 0;
  private nextTryAt = 0;
  private started = false;
  private dirty = false;
  readonly o: QueueOptions;
  /** Counters (sent with the queue's own perf.capture event by the app). */
  readonly stats = { queued: 0, sent: 0, dropped: 0, refused: 0, batches: 0, failures: 0, beacons: 0, restored: 0, bytesSent: 0 };

  constructor(private deps: QueueDeps, o: Partial<QueueOptions> = {}) {
    this.o = { ...QUEUE_DEFAULTS, ...o };
  }

  /** Put back what an earlier page load saved, then start the flush timer. */
  start(): void {
    if (this.started) return;
    this.started = true;
    try {
      const saved = this.deps.store?.load() ?? [];
      const have = new Set(this.items.map((i) => i.e.id));
      const back = saved.filter((e) => e && typeof e.id === 'string' && !have.has(e.id)).map((e) => ({ e, bytes: size(e) }));
      this.items = back.concat(this.items);
      this.bytes += back.reduce((s, i) => s + i.bytes, 0);
      this.stats.restored += back.length;
      this.trim();
    } catch { /* unreadable: start empty */ }
    this.arm();
  }

  get length(): number { return this.items.length; }
  get size(): number { return this.bytes; }

  push(e: Envelope): void {
    const it = { e, bytes: size(e) };
    this.items.push(it);
    this.bytes += it.bytes;
    this.stats.queued++;
    this.dirty = true;
    this.trim();
    if (this.started && this.timer === null) this.arm();
  }

  /** Over the caps: the oldest events not being sent right now go first. */
  private trim(): void {
    while ((this.items.length > this.o.maxEvents || this.bytes > this.o.maxBytes) && this.items.length > this.inFlight) {
      const [it] = this.items.splice(this.inFlight, 1);
      this.bytes -= it!.bytes;
      this.stats.dropped++;
    }
  }

  private arm(): void {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = null;
    if (!this.items.length) return;
    const wait = Math.max(this.o.flushEveryMs, this.nextTryAt - this.deps.now());
    this.timer = this.deps.setTimer(() => { this.timer = null; void this.flush(); }, wait);
  }

  /** Send the next batch (if nothing is on its way and no backoff is running). Resolves when answered. */
  async flush(force = false): Promise<void> {
    if (this.inFlight || !this.items.length) return this.arm();
    if (!force && this.deps.now() < this.nextTryAt) return this.arm();
    const batch = this.head(this.o.batchEvents, this.o.batchBytes);
    this.inFlight = batch.length;
    const t0 = this.deps.now();
    const wall0 = Date.now();
    let r: SendResult;
    try { r = await this.deps.send(body(batch), false); } catch { r = { ok: false, retry: true }; }
    const t3 = this.deps.now();
    this.inFlight = 0;
    this.stats.batches++;
    if (r.ok) {
      this.remove(batch);
      this.stats.sent += batch.length;
      this.stats.bytesSent += batch.reduce((s, i) => s + i.bytes, 0);
      this.failures = 0; this.nextTryAt = 0;
      if (r.serverTime !== undefined) try { this.deps.onClock?.(t0, r.serverTime, t3, wall0); } catch { /* ignore */ }
    } else if (!r.retry) {
      this.remove(batch);
      this.stats.refused += batch.length;
    } else {
      this.failures++;
      this.stats.failures++;
      this.nextTryAt = this.deps.now() + Math.min(this.o.maxBackoffMs, 2000 * 2 ** Math.min(this.failures - 1, 8));
      this.save(); // they may wait a while: keep them across a reload
    }
    this.arm();
  }

  /** The page is going away: save everything, and beacon the head of the queue. */
  hide(): void {
    this.save(true);
    if (!this.items.length) return;
    const batch = this.head(this.o.batchEvents, this.o.beaconBytes);
    this.stats.beacons++;
    try { void this.deps.send(body(batch), true).catch(() => {}); } catch { /* beacon refused: they are saved */ }
  }

  /** Save the waiting events (only when something changed, unless forced). */
  save(force = false): void {
    if (!this.deps.store || (!force && !this.dirty)) return;
    try { this.deps.store.save(this.items.map((i) => i.e)); this.dirty = false; } catch { /* storage full or blocked */ }
  }

  /** The first events, within count and byte limits (always at least one). */
  private head(n: number, maxBytes: number): Item[] {
    const out: Item[] = [];
    let b = 0;
    for (const it of this.items) {
      if (out.length >= n || (out.length && b + it.bytes > maxBytes)) break;
      out.push(it); b += it.bytes;
    }
    return out;
  }

  private remove(batch: Item[]): void {
    const gone = new Set(batch);
    const before = this.items.length;
    this.items = this.items.filter((i) => !gone.has(i));
    if (this.items.length !== before) this.dirty = true;
    for (const i of batch) this.bytes -= i.bytes;
    if (this.bytes < 0) this.bytes = 0;
    // (not saved here: a reload resending events already sent is harmless, the database keeps each id once)
  }

  stop(): void { if (this.timer !== null) this.deps.clearTimer(this.timer); this.timer = null; this.started = false; }
}

const size = (e: Envelope): number => { try { return JSON.stringify(e).length + 1; } catch { return 1000; } };
const body = (batch: Item[]): string => `{"events":[${batch.map((i) => JSON.stringify(i.e)).join(',')}]}`;
