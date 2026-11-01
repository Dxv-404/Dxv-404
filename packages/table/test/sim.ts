// A small simulated world for testing the table over a bad network, fast and repeatably:
// one clock, one event queue, a room, and phones whose messages can be delayed, lost or cut off.
import { TableRoom, type Conn, type Persisted, type RoomOptions } from '../src/room';
import { TableClient, type ClientOptions, type SocketLike, type Timers } from '../src/client';
import type { HandRecord } from '@tp/engine';
import { rng } from '@tp/bots';

export interface NetConfig { latency: [number, number]; loss: number; dropEveryMs?: number }

export class World {
  now = 1_700_000_000_000;
  private q: { at: number; n: number; fn: () => void }[] = [];
  private n = 0;
  saved: Persisted | null = null;
  hands: HandRecord[] = [];
  room: TableRoom;
  r: () => number;
  wakeAt: number | null = null;
  private wakeId = 0;
  saves = 0;

  constructor(public net: NetConfig, seed = 1, public roomOpts: RoomOptions = { handPauseMs: 200 }, code = 'SIM1') {
    this.r = rng(seed);
    const sr = rng(seed * 7919);
    this.roomOpts = { seed: () => Array.from({ length: 64 }, () => Math.floor(sr() * 16).toString(16)).join(''), ...roomOpts };
    this.room = this.makeRoom(code, null);
  }

  makeRoom(code: string, saved: Persisted | null): TableRoom {
    return new TableRoom(code, {
      now: () => this.now,
      schedule: (at) => {
        const id = ++this.wakeId;
        this.wakeAt = at;
        if (at !== null) this.at(Math.max(at, this.now), () => { if (id === this.wakeId) this.room.wake(); });
      },
    }, { save: (p) => { this.saved = JSON.parse(JSON.stringify(p)) as Persisted; this.saves++; }, appendHand: (h) => this.hands.push(h) }, saved, this.roomOpts);
  }

  /** Simulate a server restart: a new room built from what was saved. Open connections are cut. */
  restartServer(): void {
    for (const s of this.sockets) s.cut();
    this.room = this.makeRoom(this.room.code, this.saved);
  }

  at(t: number, fn: () => void): unknown { const e = { at: t, n: this.n++, fn }; this.q.push(e); return e; }
  cancel(h: unknown): void { const i = this.q.indexOf(h as never); if (i >= 0) this.q.splice(i, 1); }

  /** Run events until `until` (absolute time) or until the queue empties. */
  run(until: number, stop?: () => boolean): void {
    while (this.q.length) {
      let bi = 0;
      for (let i = 1; i < this.q.length; i++) { const a = this.q[i]!, b = this.q[bi]!; if (a.at < b.at || (a.at === b.at && a.n < b.n)) bi = i; }
      const e = this.q[bi]!;
      if (e.at > until) break;
      this.q.splice(bi, 1);
      this.now = Math.max(this.now, e.at);
      e.fn();
      if (stop?.()) return;
    }
    this.now = Math.max(this.now, until);
  }

  timers(): Timers { return { now: () => this.now, set: (fn, ms) => this.at(this.now + ms, fn), clear: (h) => this.cancel(h) }; }

  delay(): number { const [a, b] = this.net.latency; return a + this.r() * (b - a); }

  sockets = new Set<SimSocket>();
  /** If false, sockets refuse to open (the phone has no signal). */
  reachable = (_player: string): boolean => true;

  client(o: Omit<ClientOptions, 'open' | 'timers' | 'url' | 'table'> & { table?: string }): TableClient {
    return new TableClient({
      url: 'sim', table: this.room.code, retryMs: 1500, pingEveryMs: 4000, silentMs: 12_000, random: this.r, ...o,
      timers: this.timers(),
      open: () => { const s = new SimSocket(this, o.player); this.sockets.add(s); return s; },
    });
  }
}

/** One phone's connection. Messages may arrive late, be lost (both ways), or the line may be cut. */
export class SimSocket implements SocketLike {
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  open = false;
  dead = false;
  private lastUp = 0;
  private lastDown = 0;
  private room: TableRoom;
  /** The server's end of the line. */
  readonly server: Conn = { send: (t) => this.sendDown(t), close: () => this.cut() };

  constructor(private w: World, public player: string) {
    this.room = w.room;
    w.at(w.now + w.delay(), () => {
      if (this.dead) return;
      if (!w.reachable(player)) { this.cut(); return; }
      this.open = true;
      this.room.connect(this.server);
      this.onopen?.({});
      if (w.net.dropEveryMs) { const t = w.r() * 2 * w.net.dropEveryMs; w.at(w.now + t, () => this.cut()); }
    });
  }

  // phone -> server (keeps order like TCP: later messages never overtake earlier ones)
  send(text: string): void {
    if (!this.open || this.dead) return;
    if (this.w.r() < this.w.net.loss) return;
    const t = (this.lastUp = Math.max(this.lastUp, this.w.now + this.w.delay()));
    this.w.at(t, () => { if (!this.dead) this.room.message(this.server, text); });
  }

  // server -> phone
  sendDown(text: string): void {
    if (this.dead) return;
    if (this.w.r() < this.w.net.loss) return;
    const t = (this.lastDown = Math.max(this.lastDown, this.w.now + this.w.delay()));
    this.w.at(t, () => { if (!this.dead) this.onmessage?.({ data: text }); });
  }

  close(): void { this.cut(); }

  /** The line goes dead: both sides find out (after a delay, like a real timeout). */
  cut(): void {
    if (this.dead) return;
    this.dead = true;
    this.w.sockets.delete(this);
    const wasOpen = this.open;
    this.open = false;
    this.w.at(this.w.now + this.w.delay(), () => { if (wasOpen) this.room.disconnect(this.server); this.onclose?.({}); });
  }
}

