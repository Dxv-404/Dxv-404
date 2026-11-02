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
import { Engine, TABLE_DEFAULTS, clampRebuyAmount, isSeed, randomSeed, seedCommit, sha256hex, toHex, type GameEvent, type GameState, type HandRecord, type Input, type PlayerId } from '@tp/engine';
import { PROTOCOL_VERSION, encode, parseClient, versionOk, type ClientMessage, type ServerMessage, type TableSettings } from '@tp/protocol';
import { handPlayers, publicReplay, slimRecord, type EndPlayerRow, type GameInfo } from './record';

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
  /** League and history: a finished hand or the end of the game, ready to record (see record.ts). */
  league?(kind: 'hand' | 'end', id: string, payload: unknown): void;
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
  /** The league's id for this game, when it began, and whether it is casual. */
  game?: { id: string; startedAt: string; casual: boolean; bigBlind: number; startStack: number; ended: boolean; announced?: boolean };
  /** Lowest stack each player had (for the comeback trophy). */
  minStacks?: Record<PlayerId, number>;
  /** Offline: the checkpoint this table was carried on from (phones holding another copy are pointed out). */
  continuedFrom?: string | null;
}

/** A push notification the server sends for the table (to accounts' phones that allowed it). */
export interface PushRequest { kind: 'turn' | 'crewTable'; accounts?: string[]; crew?: string; except?: string[]; title: string; body: string; url: string; tag: string }

export interface RoomOptions {
  /** Send push notifications (online servers only; a backup for phones whose app is in the background). */
  push?: (p: PushRequest) => void;
  /** How long a player's turn waits before their phone is pushed (if the app is not on screen). */
  turnPushMs?: number;
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
  /** Which server this is, as the league records it. */
  server?: GameInfo['server'];
  /** A started game nobody has been connected to for this long ends by itself (and is recorded). */
  autoEndAfterMs?: number;
  /** The host has been gone this long while someone else is at the table: hosting passes to them. */
  hostHandoverMs?: number;
  /** Most sockets one table holds (players plus watchers); more are turned away, so nobody can flood it. */
  maxConnections?: number;
  /** A phone sends something (at least a ping) every few seconds; one silent this long has vanished and is closed. */
  silentCloseMs?: number;
  /** A socket that has not said hello by then is closed. */
  helloWithinMs?: number;
  /**
   * The offline host phone. Phones say who they are (no internet to check tickets: the league counts the
   * night only once players confirm it online), at most 10 players (a hotspot's limit), every phone keeps a
   * checkpoint of the table between hands (so another phone can carry the night on), and the shuffle is
   * shared (each phone adds randomness, so the host phone alone cannot choose the deck).
   */
  offline?: boolean;
  /** Each phone adds a random seed to every deck (on by default offline). */
  sharedShuffle?: boolean;
  /** How long the shared shuffle waits for phones' seeds before dealing anyway. */
  shuffleWaitMs?: number;
  /** Checks an account ticket (phones that are signed in send one). Needed for crew-only tables. */
  identify?: (ticket: string, table: string) => Promise<Identity | null>;
}

interface ConnState { pid: PlayerId | null; hello: boolean; spectator: boolean; hidden?: boolean; windowStart: number; count: number; lastReact: number; lastSeen: number; device?: string; checking?: boolean }

/** Who a ticket belongs to, as the accounts database answers (see check_ticket). */
export interface Identity { account: string; device: string; name: string; crews: string[] }
export type Ack = Extract<ServerMessage, { t: 'ack' }>;

const hashToken = (t: string): string => sha256hex(t);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACKS_KEPT = 64;
const ACKS_SAVED = 16;
const REACT_GAP_MS = 800;
/** Many phones' hotspots take only 8 to 10 devices: offline tables stop at 10 players. */
export const OFFLINE_MAX_PLAYERS = 10;
/** Watchers a table takes (players do not count). */
export const MAX_WATCHERS = 20;
const OFFLINE_FULL = 'This offline table is full. For more than 10 players, play online.';

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
  /** This game in the league (made with the table). */
  game: NonNullable<Persisted['game']> | null = null;
  private minStacks: Record<PlayerId, number> = {};
  /** The turn whose player is pushed if they have not looked by `at`. */
  private turnPush: { pid: PlayerId; key: string; at: number; sent: boolean } | null = null;
  /** Since when no player has been connected (for ending abandoned games). */
  private emptySince: number | null = null;
  /** When hosting passes on if the host is still gone (see hostHandoverMs). */
  private hostHandoverAt: number | null = null;
  /** Shared shuffle: the dealer's seed is promised; phones' seeds are collected until `until`. */
  private pendingDeal: { seed: string; handNo: number; got: Map<PlayerId, string>; until: number } | null = null;
  /** Offline: the checkpoint phones last got, and the one this table was continued from. */
  private checkpointHash: string | null = null;
  private checkpointLater = false;
  private checkpointCache: { seq: number; data: string; hash: string } | null = null;
  private continuedFrom: string | null = null;
  private conns = new Map<Conn, ConnState>();
  private acks = new Map<PlayerId, Map<string, Ack>>();
  private recent: { seq: number; events: GameEvent[] }[] = [];
  private lastRecord: HandRecord | null = null;
  /** Players whose last connection dropped, and when they will be shown as gone. */
  private goingOffline = new Map<PlayerId, number>();
  /** Inside one incoming message or wake-up, saves are collected into one at the end. */
  private batchDepth = 0;
  private needSave = false;
  private readonly opt: Required<Omit<RoomOptions, 'push'>> & Pick<RoomOptions, 'push'>;

  constructor(code: string, private clock: RoomClock, private store: RoomStore, saved?: Persisted | null, opt: RoomOptions = {}) {
    this.code = code;
    this.opt = { handPauseMs: 4000, rateLimit: 40, rateWindowMs: 2000, keepUpdates: 200, offlineAfterMs: 3000, seed: randomSeed, identify: async () => null, server: 'test', turnPushMs: 3000, autoEndAfterMs: 20 * 60_000, hostHandoverMs: 60_000, maxConnections: 60, silentCloseMs: 30_000, helloWithinMs: 15_000, offline: false, sharedShuffle: !!opt.offline, shuffleWaitMs: 1500, ...opt };
    if (this.opt.offline) this.opt.maxConnections = Math.min(this.opt.maxConnections, OFFLINE_MAX_PLAYERS + 4);
    this.createdAt = clock.now();
    if (saved) this.restore(saved);
  }

  // ---------------- doors in ----------------
  connect(conn: Conn): void {
    if (this.conns.size >= this.opt.maxConnections) {
      this.send(conn, { t: 'error', code: 'table_full', message: 'This table has too many phones connected' });
      return conn.close(4000, 'table_full');
    }
    this.conns.set(conn, { pid: null, hello: false, spectator: false, windowStart: this.clock.now(), count: 0, lastReact: 0, lastSeen: this.clock.now() });
    this.reschedule();
  }

  disconnect(conn: Conn): void {
    const st = this.conns.get(conn);
    if (!st) return;
    this.conns.delete(conn);
    if (st.pid && this.engine?.player(st.pid) && !this.connsOf(st.pid).length) {
      this.goingOffline.set(st.pid, this.clock.now() + this.opt.offlineAfterMs);
      this.trackEmpty();
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
    st.lastSeen = now;
    if (now - st.windowStart >= this.opt.rateWindowMs) { st.windowStart = now; st.count = 0; }
    if (++st.count > this.opt.rateLimit) return this.send(conn, { t: 'error', code: 'rate_limited', message: 'Too many messages' });
    const p = parseClient(raw);
    if (!p.ok) return this.send(conn, { t: 'error', code: 'bad_message', message: p.error });
    const m = p.msg;
    if (m.t === 'ping') return this.send(conn, { t: 'pong', c: m.c, s: now, seq: this.seq });
    if (m.t === 'hello') return this.hello(conn, st, m);
    if (!st.hello) return this.send(conn, { t: 'error', code: 'need_hello', message: 'Say hello first' });
    if (m.t === 'react') return this.react(conn, st, m.reaction);
    if (m.t === 'bg') { st.hidden = m.hidden; return; }
    if (m.t === 'seed') return this.onSeed(st, m.handNo, m.seed);
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
    // vanished phones (no signal, app killed) and sockets that never said hello are closed here, so every
    // server finds them the same way (a sleeping Cloudflare table has no ping timer of its own)
    for (const [c, st] of [...this.conns]) {
      const limit = st.hello ? this.opt.silentCloseMs : this.opt.helloWithinMs;
      if (now - st.lastSeen < limit || st.checking) continue;
      try { c.close(4004, st.hello ? 'silent' : 'no hello'); } catch { /* already gone */ }
      this.disconnect(c);
    }
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
    const endAt = this.autoEndAt();
    if (endAt !== null && now >= endAt) {
      // everyone left without pressing End game: end it so the night counts and the table can be cleared
      this.running = false; this.nextDealAt = null;
      if (!this.apply({ t: 'host', cmd: 'end', now })) this.endToLeague();
    }
    if (this.pendingDeal && now >= this.pendingDeal.until) this.finishDeal(now); // phones that did not answer in time are left out
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
    if (this.opt.offline) {
      // no internet to check who this is: the phone's word is taken here, and confirmed online later
      if (m.cp && this.continuedFrom && m.cp !== this.continuedFrom) {
        this.broadcastRaw({ t: 'notice', text: `${(m.name ?? 'A player').slice(0, 20)}'s phone has a different copy of the last hand than the phone carrying the table on.` });
      }
      const c = m.claim;
      return this.seat(conn, st, m, c && c.account === m.player ? { account: c.account, device: c.device, name: m.name ?? 'Player', crews: c.crews } : null);
    }
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
      if ([...this.conns.values()].filter((o) => o.hello && o.spectator).length >= MAX_WATCHERS) return fail('table_full', `${MAX_WATCHERS} people are already watching this table`);
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
    // only the host's hello (it carries the table's settings) creates the table; a friend who connects
    // first must not create it with default settings and become the host
    if (!this.engine && !m.settings) return fail('no_table', 'This table has not started yet');
    if (!this.engine) { this.create(m.settings, now); this.crew = crew; }
    const e = this.engine!;
    if (!e.player(m.player)) {
      const name = m.name ?? who?.name;
      if (!name) return fail('bad_message', 'A name is needed to join');
      const r = this.apply({ t: 'join', id: m.player, name: this.uniqueName(name), now });
      if (r) return fail(r === 'The table is full' ? 'table_full' : 'not_allowed', r === 'The table is full' && this.opt.offline ? OFFLINE_FULL : r);
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
    this.trackEmpty();
    this.welcome(conn, m.player, m.lastSeq);
    if (this.opt.offline) this.sendCheckpoint(conn);
    this.tryDeal(now); // a returning or new player may be all a waiting table needs
    this.reschedule();
  }

  private handle(pid: PlayerId, m: Exclude<ClientMessage, { t: 'hello' | 'ping' | 'react' | 'seed' | 'bg' }>, now: number): string | null {
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
        if (!r && m.cmd === 'end') { this.running = false; this.nextDealAt = null; this.endToLeague(); }
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
    delete rules.casual;
    if (this.opt.offline) rules.maxPlayers = Math.min(rules.maxPlayers ?? OFFLINE_MAX_PLAYERS, OFFLINE_MAX_PLAYERS);
    // rebuys: only at 0 chips; a custom size within 20 to 500 big blinds; closing after a level only when blinds go up
    const bb = rules.bb ?? TABLE_DEFAULTS.bb;
    if (rules.rebuyAmount !== undefined) rules.rebuyAmount = clampRebuyAmount(rules.rebuyAmount, bb);
    if (!rules.blindUpEvery) rules.rebuyUntilLevel = 0;
    if (rules.rebuys === false) { rules.maxRebuys = 0; rules.rebuyAmount = 0; rules.rebuyUntilLevel = 0; }
    this.engine = Engine.create(this.code, rules, now);
    const c = this.engine.s.cfg;
    this.game = { id: newGameId(), startedAt: new Date(now).toISOString(), casual: !!settings?.casual, bigBlind: c.bb, startStack: c.startStack, ended: false };
    this.base = this.engine.snapshot();
    this.inputs = [];
  }

  /** Apply one input; on success bump seq, tell everyone and save. Returns an error text or null. */
  private apply(input: Input): string | null {
    const e = this.engine!;
    const r = e.apply(input);
    if (r.error !== undefined) return r.error;
    // the shuffle seed stays on the server (it would let any phone work out folded hands); the database keeps it
    // for a fairness check on request
    const events = r.events.filter((ev) => ev.t !== 'deckReveal');
    if (e.s.phase === 'hand') this.inputs.push(input);
    else { this.base = e.snapshot(); this.inputs = []; }
    this.seq++;
    this.recent.push({ seq: this.seq, events });
    if (this.recent.length > this.opt.keepUpdates) this.recent.shift();
    for (const p of e.s.players) this.minStacks[p.id] = Math.min(this.minStacks[p.id] ?? p.stack, p.stack);
    const rec = e.lastHandRecord;
    if (rec && rec !== this.lastRecord) {
      this.lastRecord = rec;
      this.store.appendHand(rec);
      this.toLeague(rec);
      if (this.running && e.s.phase !== 'ended') this.nextDealAt = input.now + this.opt.handPauseMs;
      if (this.opt.offline) this.checkpointLater = true;
    }
    for (const [c, st] of this.conns) if (st.hello) this.send(c, { t: 'update', seq: this.seq, events: events as unknown as Record<string, unknown>[], view: this.view(st.pid), host: this.host, at: input.now });
    this.persist();
    if (this.checkpointLater) { this.checkpointLater = false; for (const c of this.conns.keys()) this.sendCheckpoint(c); }
    this.foldLeaving(input.now);
    this.reschedule();
    return null;
  }

  /**
   * A player the host removed mid-hand leaves when the hand ends, but the hand would wait for them to act
   * (for ever at a table with no turn timer). When it is their turn they fold (or check) at once.
   */
  private foldLeaving(now: number): void {
    const e = this.engine!;
    const pid = e.s.phase === 'hand' && !e.s.paused ? e.s.hand?.toAct : null;
    if (!pid || !e.player(pid)?.leaving) return;
    const L = e.legal(pid);
    this.apply({ t: 'act', pid, action: { type: L?.canCheck ? 'check' : 'fold' }, now });
  }

  private deal(now: number): string | null {
    if (!this.opt.sharedShuffle) return this.apply({ t: 'start', seed: this.opt.seed(), now });
    if (this.pendingDeal) return null; // already collecting seeds for this deal
    // shared shuffle: promise the dealer's seed first, then let every phone add one of its own
    const seed = this.opt.seed();
    const commit = seedCommit(seed);
    const r = this.apply({ t: 'commitSeed', commit, now });
    if (r) return r;
    const handNo = this.engine!.s.handNo + 1;
    this.pendingDeal = { seed, handNo, got: new Map(), until: now + this.opt.shuffleWaitMs };
    for (const [c, st] of this.conns) if (st.hello && st.pid) this.send(c, { t: 'seedRequest', handNo, dealerSeedCommit: commit });
    if (!this.seedsExpected().length) return this.finishDeal(now);
    this.reschedule();
    return null;
  }

  /** Players whose phones should add a seed: connected players who will be dealt in. */
  private seedsExpected(): PlayerId[] {
    const e = this.engine!;
    // a phone with its screen locked keeps its socket for a while but answers nothing: do not wait for it
    const now = this.clock.now();
    const heard = (pid: PlayerId) => [...this.conns.values()].some((st) => st.pid === pid && now - st.lastSeen < 10_000);
    return e.s.players.filter((p) => p.stack > 0 && !p.sittingOut && heard(p.id)).map((p) => p.id);
  }

  private onSeed(st: ConnState, handNo: number, seed: string): void {
    const p = this.pendingDeal;
    if (!p || !st.pid || handNo !== p.handNo || p.got.has(st.pid) || !isSeed(seed)) return;
    p.got.set(st.pid, seed);
    if (this.seedsExpected().every((pid) => p.got.has(pid))) this.finishDeal(this.clock.now());
  }

  private finishDeal(now: number): string | null {
    const p = this.pendingDeal!;
    this.pendingDeal = null;
    const r = this.apply({ t: 'start', seed: p.seed, contributions: [...p.got.values()], now });
    if (r && this.running) this.nextDealAt = now + this.opt.handPauseMs; // someone left meanwhile: try again shortly
    this.reschedule();
    return r;
  }

  private tryDeal(now: number): void {
    const e = this.engine;
    if (!e || !this.running || e.s.paused || e.s.phase === 'hand' || e.s.phase === 'ended' || this.pendingDeal) return;
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
    this.checkHost(this.clock.now());
    this.watchTurn(this.clock.now());
    const times = [this.turnPush && !this.turnPush.sent ? this.turnPush.at : null, this.handDeadline(), this.nextDealAt, this.autoEndAt(), this.hostHandoverAt, this.nextSilentCheck(), this.pendingDeal?.until ?? null, ...this.goingOffline.values()].filter((x): x is number => x !== null);
    this.clock.schedule(times.length ? Math.min(...times) : null);
  }

  /**
   * Push notifications: a signed-in player whose turn has waited turnPushMs while their app is not on screen
   * (closed, locked or in the background) is pushed once for that turn; a crew table that has started tells
   * the crew's other members once.
   */
  private watchTurn(now: number): void {
    const e = this.engine;
    if (!e || !this.opt.push || this.opt.offline) return;
    if (this.crew && this.game && !this.game.announced && e.s.handNo >= 1) {
      this.game.announced = true;
      const hostName = e.player(this.host ?? '')?.name ?? 'Someone';
      this.opt.push({ kind: 'crewTable', crew: this.crew, except: [...this.accountSeats], title: 'A crew table just started', body: `${hostName} is playing at table ${this.code}. Tap to join.`, url: `/#/t/${this.code}`, tag: `table-${this.code}` });
    }
    const h = e.s.phase === 'hand' && !e.s.paused ? e.s.hand : null;
    const pid = h?.toAct ?? null;
    if (!pid || !this.accountSeats.has(pid)) { this.turnPush = null; return; }
    const key = `${e.s.handNo}:${pid}:${h!.turnStartedAt ?? 0}`;
    if (this.turnPush?.key !== key) this.turnPush = { pid, key, at: now + this.opt.turnPushMs, sent: false };
    const tp = this.turnPush;
    if (tp.sent || now < tp.at) return;
    tp.sent = true;
    const looking = this.connsOf(pid).some((c) => !this.conns.get(c)!.hidden);
    if (!looking) this.opt.push({ kind: 'turn', accounts: [pid], title: 'Your turn', body: `Table ${this.code} is waiting for you.`, url: `/#/t/${this.code}`, tag: `turn-${this.code}` });
  }

  /**
   * A host whose phone died would leave the table with nobody able to deal, pause or end the game. After
   * hostHandoverMs gone, hosting passes to a player who is here (the old host does not get it back).
   */
  private checkHost(now: number): void {
    const e = this.engine;
    const away = !!e && e.s.phase !== 'ended' && !!this.host && !this.connsOf(this.host).length;
    if (!away) { this.hostHandoverAt = null; return; }
    if (this.hostHandoverAt === null) { this.hostHandoverAt = now + this.opt.hostHandoverMs; return; }
    if (now < this.hostHandoverAt) return;
    const next = e!.s.players.find((p) => p.id !== this.host && !p.leaving && this.connsOf(p.id).length);
    // nobody here to take over: look again later (the game ends by itself if everyone stays gone)
    if (!next) { this.hostHandoverAt = now + this.opt.hostHandoverMs; return; }
    this.hostHandoverAt = null;
    this.host = next.id;
    this.announce();
  }

  // ---------------- offline checkpoints ----------------
  /**
   * The table between hands, as every phone keeps it: no cards (the finished hand is left out), no
   * answers to old taps. Another phone with the host app can carry the night on from it.
   */
  checkpoint(): { handNo: number; data: string; hash: string } | null {
    if (!this.engine || !this.base) return null;
    if (this.checkpointCache?.seq === this.seq) return { handNo: this.base.handNo, data: this.checkpointCache.data, hash: this.checkpointCache.hash };
    const base: GameState = { ...this.base, hand: null, log: [] };
    const cp: Persisted = {
      v: 1, code: this.code, base, inputs: [], seq: 0, host: this.host, tokens: this.tokens, running: false, nextDealAt: null, createdAt: this.createdAt,
      crew: this.crew, accountSeats: [...this.accountSeats], ...(this.game ? { game: { ...this.game } } : {}), minStacks: this.minStacks,
    };
    const data = JSON.stringify(cp);
    const hash = sha256hex(data);
    this.checkpointCache = { seq: this.seq, data, hash };
    return { handNo: base.handNo, data, hash };
  }

  private sendCheckpoint(conn: Conn): void {
    const st = this.conns.get(conn);
    if (!st?.hello || !st.pid) return; // players keep it, watchers do not
    const cp = this.checkpoint();
    if (!cp) return;
    this.checkpointHash = cp.hash;
    this.send(conn, { t: 'checkpoint', handNo: cp.handNo, hash: cp.hash, data: cp.data });
  }

  /**
   * Carry a night on from a checkpoint a phone kept (the host phone died). The hand in progress when it
   * died is gone: stacks are as they were before it. `host` is the player whose phone carries it on.
   */
  static fromCheckpoint(data: string, host: PlayerId): Persisted {
    const p = JSON.parse(data) as Persisted;
    if (p.v !== 1 || !p.base || !Array.isArray(p.base.players) || p.base.hand !== null) throw new Error('Not a table checkpoint');
    if (!p.base.players.some((x) => x.id === host)) throw new Error('That player is not at this table');
    Engine.replay(p.base, []); // must load
    return { ...p, inputs: [], acks: {}, host, running: false, nextDealAt: null, continuedFrom: sha256hex(data) } as Persisted;
  }

  /** A change outside the rules engine (who hosts): numbered like any other update so phones keep in step. */
  private announce(): void {
    this.seq++;
    this.recent.push({ seq: this.seq, events: [] });
    if (this.recent.length > this.opt.keepUpdates) this.recent.shift();
    const at = this.clock.now();
    for (const [c, st] of this.conns) if (st.hello) this.send(c, { t: 'update', seq: this.seq, events: [], view: this.view(st.pid), host: this.host, at });
    this.persist();
  }

  /** When the quietest socket would count as vanished (see onWake). */
  private nextSilentCheck(): number | null {
    let at: number | null = null;
    for (const st of this.conns.values()) {
      const t = st.lastSeen + (st.hello ? this.opt.silentCloseMs : this.opt.helloWithinMs);
      if (at === null || t < at) at = t;
    }
    return at;
  }

  /** Notice when the last player leaves, or someone comes back. */
  private trackEmpty(): void {
    const e = this.engine;
    if (!e) return;
    const anyone = e.s.players.some((p) => this.connsOf(p.id).length > 0);
    if (anyone) this.emptySince = null;
    else if (this.emptySince === null) this.emptySince = this.clock.now();
  }

  private autoEndAt(): number | null {
    const e = this.engine;
    if (this.emptySince === null || !e || e.s.phase === 'ended' || e.s.handNo === 0) return null;
    return this.emptySince + this.opt.autoEndAfterMs;
  }

  private gameInfo(): GameInfo {
    const g = this.game!;
    return { id: g.id, crew: this.crew, table: this.code, server: this.opt.server, casual: g.casual, startStack: g.startStack, bigBlind: g.bigBlind, startedAt: g.startedAt };
  }

  private accountOf = (pid: PlayerId): string | null => (this.accountSeats.has(pid) ? pid : null);

  /** A finished hand goes to history and the league (worked out from the engine's own record). */
  private toLeague(rec: HandRecord): void {
    if (!this.store.league || !this.game) return;
    try {
      const { rows, pot } = handPlayers(rec, this.accountOf);
      this.store.league('hand', `${this.game.id}:${rec.handNo}`, {
        game: this.gameInfo(),
        hand: { no: rec.handNo, playedAt: new Date(rec.endedAt).toISOString(), deckCommit: rec.deckCommit, pot, replay: publicReplay(rec), full: slimRecord(rec), players: rows },
      });
    } catch (err) { console.error(`table ${this.code}: hand ${rec.handNo} not recorded`, err); }
  }

  /** The night is over: final chips against buy-ins, once. */
  private endToLeague(): void {
    if (!this.store.league || !this.game || this.game.ended) return;
    this.game.ended = true;
    const e = this.engine!;
    if (e.s.handNo === 0) { this.persist(); return; } // opened and closed without a hand: nothing to record
    const everyone = e.s.players.concat(e.s.departed ?? []);
    const seen = new Set<PlayerId>();
    const players: EndPlayerRow[] = [];
    for (const p of everyone) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      players.push({ key: p.id, account: this.accountOf(p.id), name: p.name, buyins: p.buyins, final: p.stack, minStack: Math.min(this.minStacks[p.id] ?? p.stack, p.stack) });
    }
    this.store.league('end', `${this.game.id}:end`, { game: this.gameInfo(), endedAt: new Date(this.clock.now()).toISOString(), players });
    this.persist();
  }

  /** Two players called Riya at one table: the second becomes "Riya 2" (names are cut to 14 at the table). */
  private uniqueName(name: string): string {
    const key = (n: string): string => n.normalize('NFKC').toLowerCase();
    const taken = new Set(this.engine!.s.players.map((p) => key(p.name)));
    // invisible and control characters (zero-width spaces, right-to-left marks) could make a second "Riya"
    // look exactly like the first, or break other phones' layouts: they go, and so do runs of spaces
    const base = Engine.cleanName(name.normalize('NFKC').replace(/[\p{C}]/gu, '').replace(/\s+/g, ' '));
    if (!taken.has(key(base))) return base;
    for (let n = 2; ; n++) {
      const tag = ` ${n}`;
      const candidate = base.slice(0, 14 - tag.length).trimEnd() + tag;
      if (!taken.has(key(candidate))) return candidate;
    }
  }

  private pickHost(not: PlayerId): PlayerId | null {
    const others = this.engine!.s.players.filter((p) => p.id !== not && !p.leaving);
    return others.find((p) => p.connected)?.id ?? others[0]?.id ?? null;
  }

  // ---------------- doors out ----------------
  private view(pid: PlayerId | null): Record<string, unknown> {
    const v = this.engine!.viewFor(pid);
    if (v.hand) v.hand = { ...v.hand, proof: null }; // see apply(): the seed never goes to phones
    // when the next hand will be dealt (server clock): a busted player's rebuy sheet drains a bar to it
    const e = this.engine!;
    const dealing = this.running && v.phase === 'between' && !e.s.paused && e.canStartHand();
    return { ...v, nextDealAt: dealing ? this.nextDealAt : null } as unknown as Record<string, unknown>;
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
      running: this.running, nextDealAt: this.nextDealAt, createdAt: this.createdAt, acks, crew: this.crew, accountSeats: [...this.accountSeats], ...(this.game ? { game: this.game } : {}), minStacks: this.minStacks,
      ...(this.continuedFrom ? { continuedFrom: this.continuedFrom } : {}),
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
    this.running = p.running; this.nextDealAt = p.nextDealAt; this.createdAt = p.createdAt; this.crew = p.crew ?? null; this.accountSeats = new Set(p.accountSeats ?? []); this.game = p.game ?? null; this.minStacks = { ...(p.minStacks ?? {}) }; this.continuedFrom = p.continuedFrom ?? null;
    for (const [pid, list] of Object.entries(p.acks ?? {})) this.acks.set(pid, new Map(list.map((a) => [a.actionId, a])));
  }

  /**
   * After a restore, connections that survived (a Durable Object waking from hibernation keeps its
   * sockets) are handed back with the seat they had said hello for.
   */
  adopt(conn: Conn, pid: PlayerId | null): void {
    this.conns.set(conn, { pid, hello: true, spectator: pid === null, windowStart: this.clock.now(), count: 0, lastReact: 0, lastSeen: this.clock.now() });
  }

  /** Call once after a restore (and any adopt calls): players with no connection are shown as gone. */
  settleAfterRestart(): void {
    const e = this.engine;
    if (!e) return;
    const now = Math.max(this.clock.now(), e.s.now);
    for (const pl of e.s.players) if (pl.connected && !this.connsOf(pl.id).length) this.apply({ t: 'presence', pid: pl.id, connected: false, now });
    this.trackEmpty();
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

function newGameId(): string {
  const b = new Uint8Array(16);
  (globalThis as unknown as { crypto: { getRandomValues(a: Uint8Array): Uint8Array } }).crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40; b[8] = (b[8]! & 0x3f) | 0x80; // a version 4 UUID
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A fresh random seat token for a phone (keep it in the phone's storage). */
export function newSeatToken(): string {
  const b = new Uint8Array(24);
  (globalThis as unknown as { crypto: { getRandomValues(a: Uint8Array): Uint8Array } }).crypto.getRandomValues(b);
  return toHex(b);
}
