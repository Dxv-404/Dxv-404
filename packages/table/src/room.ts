// One live table, written once and run anywhere: the Oracle Node server, the Cloudflare Durable Object,
// and later the offline host phone. The room only talks to the outside through three small doors:
// connections (send/close), a clock (now + one wake-up time) and a store (save the table, append hands).
//
// How a table stays correct over bad networks:
// - every phone action carries an actionId; a resend gets the same answer and is never applied twice;
// - every change gets the next seq number; a phone that reconnects says the last seq it saw;
// - each phone gets its own view (only its own hole cards), so nothing secret is ever broadcast;
// - the table is saved after every change as "the table at the start of the hand + the inputs since",
//   which is also exactly the hand's replay log.
import { Engine, randomSeed, sha256hex, toHex, type GameEvent, type GameState, type HandRecord, type Input, type PlayerId } from '@tp/engine';
import { PROTOCOL_VERSION, encode, parseClient, versionOk, type ClientMessage, type ServerMessage, type TableSettings } from '@tp/protocol';

export interface Conn {
  send(text: string): void;
  close(code: number, reason: string): void;
}

export interface RoomClock {
  now(): number;
  /** Wake the room (call room.wake()) at this time; null cancels. Only the latest call counts. */
  schedule(at: number | null): void;
}

export interface RoomStore {
  save(p: Persisted): void;
  appendHand(r: HandRecord): void;
}

/** Everything a table needs to come back after a restart. */
export interface Persisted {
  v: 1;
  code: string;
  /** The table between hands (or at the start of the hand in progress). */
  base: GameState;
  /** Inputs applied since `base`; replaying them gives the live table. */
  inputs: Input[];
  seq: number;
  host: PlayerId | null;
  /** sha256 of each seat's token. */
  tokens: Record<PlayerId, string>;
  running: boolean;
  nextDealAt: number | null;
  createdAt: number;
  /** Recent answers per seat, so a tap resent across a restart is still applied once. */
  acks?: Record<PlayerId, Ack[]>;
  /** Crew-only table: the crew whose members may sit and watch. */
  crew?: string | null;
  /** Seats that belong to signed-in accounts. */
  accountSeats?: PlayerId[];
}

export interface RoomOptions {
  /** Pause between hands so everyone sees the result. */
  handPauseMs?: number;
  /** Most messages one connection may send in `rateWindowMs`. */
  rateLimit?: number;
  rateWindowMs?: number;
  /** How many updates are kept so a reconnecting phone can be sent what it missed. */
  keepUpdates?: number;
  /** A dropped phone is shown as "connection lost" only if it has not reconnected within this time. */
  offlineAfterMs?: number;
  /** Where shuffle seeds come from (tests pass a repeatable one). */
  seed?: () => string;
  /** Checks an account ticket (phones that are signed in send one). Needed for crew-only tables. */
  identify?: (ticket: string, table: string) => Promise<Identity | null>;
}

interface ConnState { pid: PlayerId | null; hello: boolean; spectator: boolean; windowStart: number; count: number; lastReact: number; device?: string; checking?: boolean }

/** Who a ticket belongs to, as the accounts database answers (see check_ticket). */
export interface Identity { account: string; device: string; name: string; crews: string[] }
export type Ack = Extract<ServerMessage, { t: 'ack' }>;

const hashToken = (t: string): string => sha256hex(t);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACKS_KEPT = 64;
const ACKS_SAVED = 16;
const REACT_GAP_MS = 800;

export class TableRoom {
  readonly code: string;
  engine: Engine | null = null;
  seq = 0;
  host: PlayerId | null = null;
  running = false;
  /** Crew-only table (set by the first player's settings). */
  crew: string | null = null;
  nextDealAt: number | null = null;
  createdAt: number;
  private base: GameState | null = null;
  private inputs: Input[] = [];
  private tokens: Record<PlayerId, string> = {};
  /** Seats taken by signed-in accounts: only a ticket for that account may use them. */
  private accountSeats = new Set<PlayerId>();
  private conns = new Map<Conn, ConnState>();
  private acks = new Map<PlayerId, Map<string, Ack>>();
  private recent: { seq: number; events: GameEvent[] }[] = [];
  private lastRecord: HandRecord | null = null;
  /** Players whose last connection dropped, and when they will be shown as gone. */
  private goingOffline = new Map<PlayerId, number>();
  /** Inside one incoming message or wake-up, saves are collected into one at the end. */
  private batchDepth = 0;
  private needSave = false;
  private readonly opt: Required<RoomOptions>;

  constructor(code: string, private clock: RoomClock, private store: RoomStore, saved?: Persisted | null, opt: RoomOptions = {}) {
    this.code = code;
    this.opt = { handPauseMs: 4000, rateLimit: 40, rateWindowMs: 2000, keepUpdates: 200, offlineAfterMs: 3000, seed: randomSeed, identify: async () => null, ...opt };
    this.createdAt = clock.now();
    if (saved) this.restore(saved);
  }

  // ---------------- doors in ----------------
  connect(conn: Conn): void {
    this.conns.set(conn, { pid: null, hello: false, spectator: false, windowStart: this.clock.now(), count: 0, lastReact: 0 });
  }

  disconnect(conn: Conn): void {
    const st = this.conns.get(conn);
    if (!st) return;
    this.conns.delete(conn);
    if (st.pid && this.engine?.player(st.pid) && !this.connsOf(st.pid).length) {
      this.goingOffline.set(st.pid, this.clock.now() + this.opt.offlineAfterMs);
      this.reschedule();
    }
  }

  message(conn: Conn, raw: string): void {
    this.batch(() => this.onMessage(conn, raw));
  }

  private onMessage(conn: Conn, raw: string): void {
    const st = this.conns.get(conn);
    if (!st) return;
    const now = this.clock.now();
    if (now - st.windowStart >= this.opt.rateWindowMs) { st.windowStart = now; st.count = 0; }
    if (++st.count > this.opt.rateLimit) return this.send(conn, { t: 'error', code: 'rate_limited', message: 'Too many messages' });
    const p = parseClient(raw);
    if (!p.ok) return this.send(conn, { t: 'error', code: 'bad_message', message: p.error });
    const m = p.msg;
    if (m.t === 'ping') return this.send(conn, { t: 'pong', c: m.c, s: now, seq: this.seq });
    if (m.t === 'hello') return this.hello(conn, st, m);
    if (!st.hello) return this.send(conn, { t: 'error', code: 'need_hello', message: 'Say hello first' });
    if (m.t === 'react') return this.react(conn, st, m.reaction);
    if (m.t === 'seed') return; // Shared shuffle arrives in a later phase
    if (!st.pid || !this.engine) return this.ack(conn, null, m.actionId, 'Spectators cannot play');
    const pid = st.pid;
    const done = this.acks.get(pid)?.get(m.actionId);
    if (done) return this.send(conn, done); // a resend: same answer, applied once
    this.ack(conn, pid, m.actionId, this.handle(pid, m, now));
  }

  /** The clock door: called at (or after) the time last passed to clock.schedule. */
  wake(): void {
    this.batch(() => this.onWake());
  }

  private onWake(): void {
    const now = this.clock.now();
    const e = this.engine;
    if (e && e.s.phase === 'hand' && !e.s.paused) {
      const due = this.handDeadline();
      if (due !== null && now >= due) this.apply({ t: 'tick', now });
    }
    for (const [pid, at] of this.goingOffline) {
      if (now < at) continue;
      this.goingOffline.delete(pid);
      if (!this.connsOf(pid).length && this.engine?.player(pid)?.connected) this.apply({ t: 'presence', pid, connected: false, now });
    }
    if (this.nextDealAt !== null && now >= this.nextDealAt) {
      this.nextDealAt = null;
      this.tryDeal(now);
    }
    this.reschedule();
  }

  // ---------------- messages ----------------
  private hello(conn: Conn, st: ConnState, m: Extract<ClientMessage, { t: 'hello' }>): void {
    const fail = (code: Extract<ServerMessage, { t: 'error' }>['code'], message: string) => { this.send(conn, { t: 'error', code, message }); conn.close(4000, code); };
    if (!versionOk(m.v)) return fail('version', 'Please update the app');
    if (m.table !== this.code) return fail('no_table', 'Wrong table');
    if (st.hello || st.checking) return this.send(conn, { t: 'error', code: 'bad_message', message: 'Already said hello' });
    if (!m.ticket) return this.seat(conn, st, m, null);
    // a signed-in phone: ask the accounts database who it is, then carry on
    st.checking = true;
    this.opt.identify(m.ticket, this.code).then(
      (who) => this.batch(() => {
        st.checking = false;
        if (this.conns.get(conn) !== st) return; // gone while we were checking
        if (!who) return fail('ticket', 'Your table pass has expired. Please try again.');
        this.seat(conn, st, m, who);
      }),
      () => this.batch(() => { st.checking = false; if (this.conns.get(conn) === st) fail('server', 'Could not check your account. Please try again.'); }),
    );
  }

  /** Seat (or watch) after the hello is checked. `who` is set for signed-in phones. */
  private seat(conn: Conn, st: ConnState, m: Extract<ClientMessage, { t: 'hello' }>, who: Identity | null): void {
    const now = this.clock.now();
    const fail = (code: Extract<ServerMessage, { t: 'error' }>['code'], message: string) => { this.send(conn, { t: 'error', code, message }); conn.close(4000, code); };
    const crew = this.engine ? this.crew : (m.settings?.crew ?? null);
    if (crew && !who?.crews.includes(crew)) return fail('not_allowed', 'This table is for crew members');
    if (who && m.player !== who.account) return fail('not_allowed', 'That seat belongs to another account');
    const watch = (): void => {
      if (!this.engine) return fail('no_table', 'This table has not started');
      st.hello = true; st.spectator = true; st.pid = null;
      this.welcome(conn, null, m.lastSeq);
    };
    if (m.spectate || (!m.token && !who)) return watch();
    if (!who) {
      // account ids belong to signed-in phones: without a ticket nobody can sit as an account
      if (UUID.test(m.player) || this.accountSeats.has(m.player)) return fail('not_allowed', 'Sign in to take this seat');
      const tokenHash = hashToken(m.token!);
      if (this.tokens[m.player] && this.tokens[m.player] !== tokenHash) return fail('not_allowed', 'That seat belongs to another phone');
    }
    // the same account on a second phone watches instead of taking the seat (one seat per account)
    if (who && this.connsOf(m.player).some((c) => { const o = this.conns.get(c)!; return o.device && o.device !== who.device; })) {
      st.device = who.device;
      return watch();
    }
    if (!this.engine) { this.create(m.settings, now); this.crew = crew; }
    const e = this.engine!;
    if (!e.player(m.player)) {
      const name = m.name ?? who?.name;
      if (!name) return fail('bad_message', 'A name is needed to join');
      const r = this.apply({ t: 'join', id: m.player, name: this.uniqueName(name), now });
      if (r) return fail(r === 'The table is full' ? 'table_full' : 'not_allowed', r);
      if (m.token && !who) this.tokens[m.player] = hashToken(m.token);
      if (who) this.accountSeats.add(m.player);
      if (!this.host) this.host = m.player;
      this.persist();
    }
    // one live connection per seat: a newer one (another tab, a reconnect racing the old socket) wins
    for (const old of this.connsOf(m.player)) {
      this.conns.delete(old);
      this.send(old, { t: 'error', code: 'replaced', message: 'This seat opened somewhere else' });
      old.close(4001, 'replaced');
    }
    this.goingOffline.delete(m.player); // back before anyone noticed
    // mark the player back before this connection counts as listening, so its first message is the welcome
    if (!e.player(m.player)!.connected) this.apply({ t: 'presence', pid: m.player, connected: true, now });
    st.hello = true; st.pid = m.player; if (who) st.device = who.device;
    this.welcome(conn, m.player, m.lastSeq);
    this.tryDeal(now); // a returning or new player may be all a waiting table needs
    this.reschedule();
  }

  private handle(pid: PlayerId, m: Exclude<ClientMessage, { t: 'hello' | 'ping' | 'react' | 'seed' }>, now: number): string | null {
    const e = this.engine!;
    const handNo = 'handNo' in m ? m.handNo : null;
    if (handNo !== null && (e.s.phase !== 'hand' || e.s.handNo !== handNo) && m.t !== 'show') return 'That hand is over';
    switch (m.t) {
      case 'act': return this.apply({ t: 'act', pid, action: m.action.to === undefined ? { type: m.action.type } : { type: m.action.type, to: m.action.to }, now });
      case 'sit': {
        const r = this.apply(m.out ? { t: 'sitOut', pid, now } : { t: 'sitIn', pid, postNow: !!m.postNow, now });
        if (!r && !m.out) this.tryDeal(now);
        return r;
      }
      case 'rebuy': { const r = this.apply({ t: 'rebuy', pid, now }); if (!r) this.tryDeal(now); return r; }
      case 'vote': return this.apply({ t: 'vote', pid, yes: m.yes, now });
      case 'straddle': return this.apply({ t: 'straddle', pid, on: m.on, now });
      case 'show': return e.s.handNo === m.handNo ? this.apply({ t: 'show', pid, now }) : 'That hand is over';
      case 'host': {
        if (pid !== this.host) return 'Only the host can do that';
        if (m.cmd === 'deal') {
          if (e.s.phase === 'hand') return 'A hand is already running';
          const r = this.deal(now);
          if (!r) this.running = true;
          this.persist();
          return r;
        }
        let input: Input;
        if (m.cmd === 'move' || m.cmd === 'remove') {
          if (!m.pid) return 'Which player?';
          input = m.cmd === 'move' ? { t: 'host', cmd: 'move', pid: m.pid, dir: m.dir ?? 1, now } : { t: 'host', cmd: 'remove', pid: m.pid, now };
        } else if (m.cmd === 'setBlinds') {
          if (m.sb === undefined || m.bb === undefined) return 'Blinds needed';
          input = { t: 'host', cmd: 'setBlinds', sb: m.sb, bb: m.bb, ...(m.ante !== undefined ? { ante: m.ante } : {}), now };
        } else input = { t: 'host', cmd: m.cmd, now };
        const r = this.apply(input);
        if (!r && m.cmd === 'remove') {
          for (const c of this.connsOf(m.pid!)) { const st = this.conns.get(c)!; st.pid = null; st.spectator = true; }
          if (this.host === m.pid) this.host = this.pickHost(m.pid);
        }
        if (!r && m.cmd === 'end') { this.running = false; this.nextDealAt = null; }
        if (!r && m.cmd === 'resume') this.tryDeal(now);
        this.persist();
        return r;
      }
    }
  }

  private react(conn: Conn, st: ConnState, reaction: Extract<ClientMessage, { t: 'react' }>['reaction']): void {
    if (!st.pid) return;
    const now = this.clock.now();
    if (now - st.lastReact < REACT_GAP_MS) return this.send(conn, { t: 'error', code: 'rate_limited', message: 'One reaction at a time' });
    st.lastReact = now;
    this.broadcastRaw({ t: 'react', from: st.pid, reaction, at: now });
  }

  // ---------------- the table ----------------
  private create(settings: TableSettings | undefined, now: number): void {
    const rules = { ...settings };
    delete rules.crew; // the crew belongs to the room, not the rules
    this.engine = Engine.create(this.code, rules, now);
    this.base = this.engine.snapshot();
    this.inputs = [];
  }

  /** Apply one input; on success bump seq, tell everyone and save. Returns an error text or null. */
  private apply(input: Input): string | null {
    const e = this.engine!;
    const r = e.apply(input);
    if (r.error !== undefined) return r.error;
    const events = r.events;
    if (e.s.phase === 'hand') this.inputs.push(input);
    else { this.base = e.snapshot(); this.inputs = []; }
    this.seq++;
    this.recent.push({ seq: this.seq, events });
    if (this.recent.length > this.opt.keepUpdates) this.recent.shift();
    const rec = e.lastHandRecord;
    if (rec && rec !== this.lastRecord) {
      this.lastRecord = rec;
      this.store.appendHand(rec);
      if (this.running && e.s.phase !== 'ended') this.nextDealAt = input.now + this.opt.handPauseMs;
    }
    for (const [c, st] of this.conns) if (st.hello) this.send(c, { t: 'update', seq: this.seq, events: events as unknown as Record<string, unknown>[], view: this.view(st.pid), host: this.host, at: input.now });
    this.persist();
    this.reschedule();
    return null;
  }

  private deal(now: number): string | null {
    return this.apply({ t: 'start', seed: this.opt.seed(), now });
  }

  private tryDeal(now: number): void {
    const e = this.engine;
    if (!e || !this.running || e.s.paused || e.s.phase === 'hand' || e.s.phase === 'ended') return;
    if (this.nextDealAt !== null && now < this.nextDealAt) return;
    this.nextDealAt = null;
    if (e.canStartHand()) this.deal(now);
  }

  /** When the hand in progress next needs the clock: the turn timer or the Deal it twice vote. */
  private handDeadline(): number | null {
    const e = this.engine;
    if (!e || e.s.phase !== 'hand' || e.s.paused) return null;
    return e.s.hand?.vote ? e.s.hand.vote.deadline : e.deadline();
  }

  private reschedule(): void {
    const times = [this.handDeadline(), this.nextDealAt, ...this.goingOffline.values()].filter((x): x is number => x !== null);
    this.clock.schedule(times.length ? Math.min(...times) : null);
  }

  /** Two players called Riya at one table: the second becomes "Riya 2" (names are cut to 14 at the table). */
  private uniqueName(name: string): string {
    const taken = new Set(this.engine!.s.players.map((p) => p.name.toLowerCase()));
    const base = Engine.cleanName(name);
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) {
      const tag = ` ${n}`;
      const candidate = base.slice(0, 14 - tag.length).trimEnd() + tag;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  private pickHost(not: PlayerId): PlayerId | null {
    const others = this.engine!.s.players.filter((p) => p.id !== not && !p.leaving);
    return others.find((p) => p.connected)?.id ?? others[0]?.id ?? null;
  }

  // ---------------- doors out ----------------
  private view(pid: PlayerId | null): Record<string, unknown> {
    return this.engine!.viewFor(pid) as unknown as Record<string, unknown>;
  }

  private welcome(conn: Conn, pid: PlayerId | null, lastSeq: number): void {
    const missed = lastSeq > 0 && lastSeq < this.seq && this.recent[0] && this.recent[0].seq <= lastSeq + 1
      ? this.recent.filter((u) => u.seq > lastSeq).flatMap((u) => u.events) as unknown as Record<string, unknown>[]
      : undefined;
    this.send(conn, { t: 'welcome', v: PROTOCOL_VERSION, seq: this.seq, you: pid, host: this.host, view: this.view(pid), serverTime: this.clock.now(), ...(missed ? { missed } : {}) });
  }

  private ack(conn: Conn, pid: PlayerId | null, actionId: string, error: string | null): void {
    const a: Ack = error ? { t: 'ack', actionId, ok: false, error } : { t: 'ack', actionId, ok: true };
    if (pid) {
      let m = this.acks.get(pid);
      if (!m) this.acks.set(pid, (m = new Map()));
      m.set(actionId, a);
      if (m.size > ACKS_KEPT) m.delete(m.keys().next().value!);
      if (!error) this.persist();
    }
    this.send(conn, a);
  }

  private send(conn: Conn, m: ServerMessage): void {
    try { conn.send(encode(m)); } catch { /* a dead socket: its close event cleans up */ }
  }

  private broadcastRaw(m: ServerMessage): void {
    const text = encode(m);
    for (const [c, st] of this.conns) if (st.hello) try { c.send(text); } catch { /* see send */ }
  }

  private connsOf(pid: PlayerId): Conn[] {
    return [...this.conns].filter(([, st]) => st.pid === pid).map(([c]) => c);
  }

  // ---------------- saving ----------------
  persisted(): Persisted | null {
    if (!this.engine || !this.base) return null;
    const acks: Record<PlayerId, Ack[]> = {};
    for (const [pid, m] of this.acks) acks[pid] = [...m.values()].slice(-ACKS_SAVED);
    return {
      v: 1, code: this.code, base: this.base, inputs: this.inputs, seq: this.seq, host: this.host, tokens: this.tokens,
      running: this.running, nextDealAt: this.nextDealAt, createdAt: this.createdAt, acks, crew: this.crew, accountSeats: [...this.accountSeats],
    };
  }

  private persist(): void {
    if (this.batchDepth) { this.needSave = true; return; }
    const p = this.persisted();
    if (p) this.store.save(p);
  }

  private batch(fn: () => void): void {
    this.batchDepth++;
    try { fn(); } finally {
      if (--this.batchDepth === 0 && this.needSave) { this.needSave = false; this.persist(); }
    }
  }

  private restore(p: Persisted): void {
    // replaying the inputs since the last hand boundary rebuilds the live table exactly, mid-hand included
    this.engine = Engine.replay(p.base, p.inputs);
    this.lastRecord = this.engine.lastHandRecord;
    this.base = p.base; this.inputs = p.inputs.slice();
    this.seq = p.seq; this.host = p.host; this.tokens = { ...p.tokens };
    this.running = p.running; this.nextDealAt = p.nextDealAt; this.createdAt = p.createdAt; this.crew = p.crew ?? null; this.accountSeats = new Set(p.accountSeats ?? []);
    for (const [pid, list] of Object.entries(p.acks ?? {})) this.acks.set(pid, new Map(list.map((a) => [a.actionId, a])));
  }

  /**
   * After a restore, connections that survived (a Durable Object waking from hibernation keeps its
   * sockets) are handed back with the seat they had said hello for.
   */
  adopt(conn: Conn, pid: PlayerId | null): void {
    this.conns.set(conn, { pid, hello: true, spectator: pid === null, windowStart: this.clock.now(), count: 0, lastReact: 0 });
  }

  /** Call once after a restore (and any adopt calls): players with no connection are shown as gone. */
  settleAfterRestart(): void {
    const e = this.engine;
    if (!e) return;
    const now = Math.max(this.clock.now(), e.s.now);
    for (const pl of e.s.players) if (pl.connected && !this.connsOf(pl.id).length) this.apply({ t: 'presence', pid: pl.id, connected: false, now });
    this.reschedule();
  }

  /** What a connection said hello as (kept by servers that may sleep, like a Durable Object). */
  connInfo(conn: Conn): { pid: PlayerId | null; hello: boolean } | null {
    const st = this.conns.get(conn);
    return st ? { pid: st.pid, hello: st.hello } : null;
  }

  /** Numbers for /health and tests. */
  stats(): { players: number; connections: number; handNo: number; phase: string } {
    return { players: this.engine?.s.players.length ?? 0, connections: this.conns.size, handNo: this.engine?.s.handNo ?? 0, phase: this.engine?.s.phase ?? 'new' };
  }

  get connectionCount(): number { return this.conns.size; }

  /** Has this connection introduced itself? (Servers close connections that never do.) */
  hasSaidHello(conn: Conn): boolean { return !!this.conns.get(conn)?.hello; }
}

/** A fresh random seat token for a phone (keep it in the phone's storage). */
export function newSeatToken(): string {
  const b = new Uint8Array(24);
  (globalThis as unknown as { crypto: { getRandomValues(a: Uint8Array): Uint8Array } }).crypto.getRandomValues(b);
  return toHex(b);
}
