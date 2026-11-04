// The table's research recording (server side, authoritative). The room tells the tap what happened; the
// tap makes research events and hands them to a sink (a ResearchShipper on the servers). Everything here is
// wrapped so it can never throw into the room, and the heavy part (a finished hand, worked out by
// replaying it) runs after the room has answered the phones.
import { EnvelopeMaker, handEvents, type Envelope, type EventType, type HandEvt } from '@tp/research';
import type { HandRecord, PlayerId } from '@tp/engine';

export interface ResearchSink {
  emit(e: Envelope): void;
}

export interface TapContext {
  code: string;
  server: string;
  gameId(): string | null;
  handNo(): number | null;
  street(): string | null;
  /** Is this seat a signed-in account? */
  isAccount(pid: PlayerId): boolean;
  /** The research device id the player's current connection gave (newer apps), else its account device. */
  deviceOf(pid: PlayerId): string | null;
}

/** Monotonic time on any server (performance.now where it exists). */
const mono = (): number => {
  const p = (globalThis as unknown as { performance?: { now(): number } }).performance;
  return p ? p.now() : Date.now();
};

export class RoomTap {
  readonly maker: EnvelopeMaker;
  private connIds = new WeakMap<object, number>();
  private nextConn = 1;
  constructor(private sink: ResearchSink, private ctx: TapContext, private now: () => number, private defer: (fn: () => void) => void = (fn) => { setTimeout(fn, 0); }) {
    this.maker = new EnvelopeMaker('s', { wall: now, mono }, `server:${ctx.server}`);
  }

  /** A stable small number for a connection (within this server session). */
  conn(c: object): number {
    let n = this.connIds.get(c);
    if (!n) { n = this.nextConn++; this.connIds.set(c, n); }
    return n;
  }

  /** Record an event about `pid` (or the table), now. Never throws. */
  emit(t: EventType, p: Record<string, unknown>, pid: PlayerId | null = null, extra: { d?: string | null; a?: string | null; g?: string | null; h?: number | null; st?: string | null; at?: number } = {}): void {
    try {
      const at = extra.at ?? this.now();
      const who = pid ? (this.ctx.isAccount(pid) ? { a: pid, g: null } : { a: null, g: pid }) : { a: extra.a ?? null, g: extra.g ?? null };
      const d = extra.d !== undefined ? extra.d : pid ? this.ctx.deviceOf(pid) : null;
      const where = { tb: this.ctx.code, gm: this.ctx.gameId(), h: extra.h !== undefined ? extra.h : this.ctx.handNo(), st: extra.st !== undefined ? extra.st : this.ctx.street() };
      this.sink.emit(this.maker.make(t, p, { ...who, d: d ? safeId(d) : null }, where, { tc: at, ts: at }));
    } catch (e) { warn(e); }
  }

  /** A finished hand: replayed after the room has answered (see hand.ts). */
  hand(rec: HandRecord): void {
    this.defer(() => {
      let evs: HandEvt[];
      try { evs = handEvents(rec); } catch (e) { warn(e); return; }
      for (const ev of evs) this.emit(ev.t, ev.p, ev.pid, { h: rec.handNo, st: ev.st, at: ev.at });
    });
  }
}

const SAFE = /^[A-Za-z0-9_:.-]{1,64}$/;
const safeId = (s: string): string | null => (SAFE.test(s) ? s : null);
let warned = 0;
const warn = (e: unknown): void => { if (warned++ < 20) console.error('research tap:', e); };
