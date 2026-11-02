// Authoritative No-Limit Texas Hold'em engine, v2.
//
// Pure logic: no DOM, no network, no storage, no clock and no randomness of its own. Every change
// arrives as an Input (with the time and, for a new hand, the shuffle seed passed in), so a table
// can be rebuilt exactly by replaying its inputs. Each call returns events for screens to animate;
// viewFor() produces what one seat (or a spectator) may see.
//
// The older method-style API (startHand(), act(), rebuy() ...) is kept so the current app keeps
// working; those calls fall back to the real clock and a fresh random seed when none is given.
import { evalBest, cardStr } from './cards';
import { combineSeeds, deckCommit, deckFromSeed, isSeed, randomSeed, seedCommit } from './fair';
import type {
  Action, ActResult, Award, GameConfig, GameEvent, GameState, Hand, HandEval, HandPlayer, HandPlayerView,
  HandRecord, Input, Legal, Player, PlayerId, PotResult, RebuyView, Standing, View,
} from './types';

/** Bumped whenever a rule changes how a hand plays out. Stored with every hand so old hands replay correctly. */
export const ENGINE_VERSION = 2;

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
const rid = (n: number): string => Math.random().toString(36).slice(2, 2 + n);
const round1 = (x: number): number => Math.round(x * 10) / 10;

/** Round a blind to a friendly number. */
export function niceRound(x: number): number {
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  let best = steps[0]! * mag;
  for (const s of steps) if (Math.abs(s * mag - x) < Math.abs(best - x)) best = s * mag;
  return Math.max(1, Math.round(best));
}

export const anteFor = (bb: number): number => Math.max(1, niceRound(bb / 10));

/** Defaults for a new online or offline table (the plan's answers: 20 s per action + 60 s bank). */
export const TABLE_DEFAULTS: GameConfig = {
  startStack: 1000, sb: 5, bb: 10, blindUpEvery: 0,
  turnTime: 20, timeBank: 60, bankRefill: 10, bankRefillEvery: 10, disconnectGrace: 10,
  rebuys: true, maxRebuys: 0, rebuyBelow: 0, rebuyAmount: 0, rebuyUntilLevel: 0,
  anteFromLevel: 0, straddle: false, dealItTwice: false, dealItTwiceVote: 10,
  sharedShuffle: false, maxPlayers: 15,
};

/** A custom rebuy is 20 to 500 big blinds. */
export const REBUY_MIN_BB = 20;
export const REBUY_MAX_BB = 500;
/** The allowed custom rebuy range for a big blind. */
export const rebuyRange = (bb: number): [number, number] => [REBUY_MIN_BB * Math.max(1, bb), REBUY_MAX_BB * Math.max(1, bb)];
/** A custom rebuy amount brought into the allowed range (0 stays 0: the starting stack). */
export function clampRebuyAmount(amount: number, bb: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const [lo, hi] = rebuyRange(bb);
  return Math.min(hi, Math.max(lo, Math.round(amount)));
}
/** Chips one rebuy gives at a table. */
export const rebuyChips = (c: Pick<GameConfig, 'rebuyAmount' | 'startStack'>): number => c.rebuyAmount || c.startStack;

export function makeConfig(c: Partial<GameConfig> = {}): GameConfig {
  const cfg = { ...TABLE_DEFAULTS, ...c };
  // a rebuy only at 0 chips, between hands: no top-ups (tables saved before kept their own rule)
  if (!cfg.rebuyBelow) cfg.rebuyBelow = 1;
  cfg.rebuyAmount = clampRebuyAmount(cfg.rebuyAmount ?? 0, cfg.bb);
  cfg.maxRebuys = Math.max(0, Math.floor(cfg.maxRebuys || 0));
  cfg.rebuyUntilLevel = Math.max(0, Math.floor(cfg.rebuyUntilLevel || 0));
  cfg.maxPlayers = Math.min(15, Math.max(2, Math.floor(cfg.maxPlayers)));
  return cfg;
}

interface BuiltPot { amount: number; elig: PlayerId[] }

interface Plan {
  dealt: Player[];
  button: Player | null;
  sb: Player | null;
  bb: Player;
  buttonChair: number;
  sbChair: number;
  bbChair: number;
}

export class Engine {
  s: GameState;
  undoStack: GameState[] = [];
  /** Inputs applied through apply() since this engine was created or restored. */
  inputs: Input[] = [];
  /** Set when a hand ends after being started through apply(): everything needed to replay it. */
  lastHandRecord: HandRecord | null = null;
  private handBefore: GameState | null = null;
  private handInputs: Input[] = [];

  constructor(state: GameState) {
    this.s = Engine.migrate(state);
  }

  /** Bring older saved tables (v1, from the first app) up to the current shape. */
  static migrate(state: GameState): GameState {
    const st = state as GameState & { v: number };
    if (st.v === 2) return state;
    const cfg = makeConfig({ ...(st.cfg as Partial<GameConfig>), turnTime: st.cfg.turnTime ?? 0, maxPlayers: 15 });
    const players = st.players.map((p) => Engine.fillPlayer(p, p.seat, cfg));
    const v2: GameState = {
      ...st, v: 2, cfg, players,
      level: { ...st.level, ante: st.level.ante ?? 0 },
      lastButtonChair: -1, lastSBChair: -1, lastBBChair: -1,
      pendingLevel: null, nextSeedCommit: null, now: 0,
    };
    // A v1 hand in progress cannot be continued safely; refund it and carry on between hands.
    if (v2.hand && v2.phase === 'hand') {
      for (const [pid, hp] of Object.entries(v2.hand.ps)) { const p = v2.players.find((x) => x.id === pid); if (p) p.stack += hp.total; }
      v2.phase = 'between';
    }
    v2.hand = null;
    if (st.button >= 0 && players.length >= 2) {
      // Re-derive positions so the next hand moves the button one seat on, as before.
      const n = players.length;
      v2.lastButtonChair = st.button % n;
      v2.lastSBChair = (st.button + 1) % n;
      v2.lastBBChair = (st.button + 2) % n;
    }
    return v2;
  }

  private static fillPlayer(p: Partial<Player> & { id: PlayerId; name: string; stack: number }, chair: number, cfg: GameConfig): Player {
    return {
      seat: chair, chair, buyins: p.stack, rebuysUsed: 0, sittingOut: false, away: false, sitOutHands: 0,
      leaving: false, connected: false, busted: false, waitForBB: false, missedSB: false, missedBB: false,
      postMissed: false, wantsStraddle: false, bank: cfg.timeBank,
      ...p,
    } as Player;
  }

  // ---------------- setup ----------------
  /** A new, empty table. Players join through apply({ t: 'join' }). */
  static create(gameId: string, config: Partial<GameConfig> = {}, now = 0): Engine {
    const cfg = makeConfig(config);
    return new Engine({
      v: 2, gameId, cfg,
      level: { sb: cfg.sb, bb: cfg.bb, n: 1, ante: cfg.anteFromLevel === 1 ? anteFor(cfg.bb) : 0 },
      players: [], button: -1, lastButtonChair: -1, lastSBChair: -1, lastBBChair: -1,
      handNo: 0, hand: null, phase: 'lobby', log: [], stats: {}, paused: false,
      pendingLevel: null, nextSeedCommit: null, now,
    });
  }

  /** Legacy: a table with players already seated, no timer by default (the first app ran its own). */
  static newGame(config: Partial<GameConfig>, names: string[]): Engine {
    const e = Engine.create(rid(8), { turnTime: 0, ...config });
    for (const n of names) e.addPlayer(n);
    e.s.log = [];
    return e;
  }

  static makePlayer(name: string, seat: number, stack: number): Player {
    return Engine.fillPlayer({ id: 'p' + rid(7), name: Engine.cleanName(name), stack }, seat, TABLE_DEFAULTS);
  }

  static cleanName(name: string): string {
    return String(name).trim().slice(0, 14) || 'Player';
  }

  /** Restore from a snapshot. */
  static fromSnapshot(state: GameState): Engine { return new Engine(clone(state)); }

  /** Rebuild a table by replaying inputs on top of a snapshot. Same inputs, same table, every time. */
  static replay(snapshot: GameState, inputs: Input[]): Engine {
    const e = Engine.fromSnapshot(snapshot);
    for (const i of inputs) {
      const r = e.apply(i);
      if (r.error) throw new Error(`Replay diverged at ${i.t}: ${r.error}`);
    }
    return e;
  }

  snapshot(): GameState { return clone(this.s); }

  player(id: PlayerId): Player | undefined { return this.s.players.find((p) => p.id === id); }

  private P(id: PlayerId): Player {
    const p = this.player(id);
    /* v8 ignore next -- invariant: only ever called with ids the engine itself tracks */
    if (!p) throw new Error(`Unknown player ${id}`);
    return p;
  }

  private get H(): Hand {
    /* v8 ignore next -- invariant: only called while a hand exists */
    if (!this.s.hand) throw new Error('No hand in progress');
    return this.s.hand;
  }

  private hp(id: PlayerId): HandPlayer {
    const x = this.H.ps[id];
    /* v8 ignore next -- invariant: only called for players dealt into the hand */
    if (!x) throw new Error(`Player ${id} is not in this hand`);
    return x;
  }

  // ---------------- the input door ----------------
  /** Apply one input. Refused inputs change nothing and are not recorded. */
  apply(input: Input): ActResult {
    const res = this.dispatch(input);
    if (res.error) return res;
    this.inputs.push(input);
    if (this.handBefore) this.handInputs.push(input);
    this.finishRecordIfEnded();
    return res;
  }

  private dispatch(i: Input): ActResult {
    if (typeof i.now !== 'number' || !Number.isFinite(i.now)) return { error: 'Missing time' };
    const ok = (events: GameEvent[]): ActResult => { this.s.now = Math.max(this.s.now, i.now); return { events }; };
    switch (i.t) {
      case 'join': {
        if (this.player(i.id)) return { error: 'Already at the table' };
        if (this.s.phase === 'ended') return { error: 'The game has ended' };
        if (this.s.players.length >= this.s.cfg.maxPlayers) return { error: 'The table is full' };
        if (i.chair !== undefined && (i.chair < 0 || i.chair >= this.s.cfg.maxPlayers || this.s.players.some((p) => p.chair === i.chair))) return { error: 'That chair is taken' };
        this.addPlayer(i.name, { id: i.id, chair: i.chair, waitForBB: i.waitForBB ?? this.s.handNo > 0 });
        return ok([{ t: 'seat' }]);
      }
      case 'start': {
        if (!isSeed(i.seed)) return { error: 'A new hand needs a 32-byte seed' };
        const before = this.snapshot();
        const r = this.startHandChecked(i.seed, i.contributions ?? [], i.now);
        if (r.error) return r;
        this.handBefore = before;
        this.handInputs = [];
        return ok(r.events!);
      }
      case 'act': {
        const r = this.act(i.pid, i.action, i.now);
        return r.error ? r : ok(r.events!);
      }
      case 'tick': return ok(this.tick(i.now));
      case 'presence': {
        const p = this.player(i.pid);
        if (!p) return { error: 'Unknown player' };
        return ok(this.setPresence(p, i.connected));
      }
      case 'sitOut': {
        const p = this.player(i.pid);
        if (!p) return { error: 'Unknown player' };
        this.setSitOut(i.pid, true);
        return ok([{ t: 'sit', pid: i.pid, out: true, away: p.away }]);
      }
      case 'sitIn': {
        const p = this.player(i.pid);
        if (!p) return { error: 'Unknown player' };
        this.sitIn(p, i.postNow);
        return ok([{ t: 'sit', pid: i.pid, out: false, away: false }]);
      }
      case 'rebuy': {
        const why = this.whyNoRebuy(i.pid);
        if (why) return { error: why };
        return ok(this.rebuy(i.pid));
      }
      case 'straddle': {
        const p = this.player(i.pid);
        if (!p) return { error: 'Unknown player' };
        if (!this.s.cfg.straddle) return { error: 'Straddles are off at this table' };
        p.wantsStraddle = i.on;
        return ok([]);
      }
      case 'vote': return this.vote(i.pid, i.yes, i.now);
      case 'show': {
        const ev = this.showCards(i.pid);
        return ev.length ? ok(ev) : { error: 'Nothing to show' };
      }
      case 'commitSeed': {
        if (!/^[0-9a-f]{64}$/.test(i.commit)) return { error: 'Bad seed promise' };
        if (this.s.phase === 'hand') return { error: 'Promise the next seed between hands' };
        this.s.nextSeedCommit = i.commit;
        return ok([]);
      }
      case 'host': return this.host(i);
    }
  }

  private host(i: Extract<Input, { t: 'host' }>): ActResult {
    const s = this.s;
    const ok = (events: GameEvent[]): ActResult => { s.now = Math.max(s.now, i.now); return { events }; };
    switch (i.cmd) {
      case 'pause':
        if (s.paused) return { error: 'Already paused' };
        s.paused = true;
        this.logLine('Host paused the table');
        return ok([{ t: 'paused', paused: true }]);
      case 'resume':
        if (!s.paused) return { error: 'Not paused' };
        s.paused = false;
        // time spent paused never counts against the player to act
        if (s.hand?.toAct) s.hand.turnStartedAt = i.now;
        if (s.hand?.vote) s.hand.vote.deadline = i.now + s.cfg.dealItTwiceVote * 1000;
        this.logLine('Host resumed the table');
        return ok([{ t: 'paused', paused: false }]);
      case 'undo': {
        if (!this.canUndo()) return { error: 'Nothing to undo' };
        s.now = Math.max(s.now, i.now);
        return ok(this.undo()!);
      }
      case 'end':
        if (s.phase === 'ended') return { error: 'The game has already ended' };
        this.endGame();
        return ok([{ t: 'ended' }]);
      case 'move': {
        if (!this.player(i.pid)) return { error: 'Unknown player' };
        if (s.phase === 'hand') return { error: 'Move seats between hands' };
        this.movePlayer(i.pid, i.dir);
        return ok([{ t: 'seat' }]);
      }
      case 'remove': {
        if (!this.player(i.pid)) return { error: 'Unknown player' };
        this.removePlayer(i.pid);
        return ok([{ t: 'seat' }]);
      }
      case 'setBlinds': {
        const ante = i.ante ?? 0;
        if (!(Number.isInteger(i.sb) && Number.isInteger(i.bb) && Number.isInteger(ante) && i.sb >= 1 && i.bb >= i.sb && ante >= 0 && ante <= i.bb)) return { error: 'Blinds must be whole numbers with the big blind at least the small' };
        s.pendingLevel = { sb: i.sb, bb: i.bb, ante };
        this.logLine(`Blinds change to ${i.sb}/${i.bb}${ante ? ` (ante ${ante})` : ''} from the next hand`);
        return ok([]);
      }
    }
  }

  private finishRecordIfEnded(): void {
    const s = this.s, h = s.hand;
    if (!this.handBefore || !h || !h.results || s.phase === 'hand') return;
    const inputs = this.handInputs.slice(); // starts with the 'start' input itself
    this.lastHandRecord = {
      engineVersion: h.engineVersion, gameId: s.gameId, handNo: h.id, before: this.handBefore,
      inputs, results: clone(h.results), deckCommit: h.deckCommit,
      proof: { dealerSeed: h.seedInfo.dealerSeed, contributions: h.seedInfo.contributions, dealerSeedCommit: h.seedInfo.dealerSeedCommit },
      board: h.board.map(cardStr), board2: h.board2 ? h.board2.map(cardStr) : null,
      startedAt: h.startedAt, endedAt: h.endedAt!,
    };
    this.handBefore = null;
    this.handInputs = [];
  }

  // ---------------- seats ----------------
  private reseat(): void {
    const s = this.s;
    s.players.sort((a, b) => a.chair - b.chair);
    s.players.forEach((p, i) => (p.seat = i));
    const btnId = s.hand?.buttonId;
    const bp = btnId ? this.player(btnId) : s.players.find((p) => p.chair === s.lastButtonChair);
    s.button = bp ? bp.seat : -1;
  }

  private freeChair(): number {
    for (let c = 0; c < this.s.cfg.maxPlayers; c++) if (!this.s.players.some((p) => p.chair === c)) return c;
    return -1;
  }

  addPlayer(name: string, opts: { id?: PlayerId; chair?: number; waitForBB?: boolean } = {}): Player {
    const chair = opts.chair ?? this.freeChair();
    const p = Engine.fillPlayer({ id: opts.id ?? 'p' + rid(7), name: Engine.cleanName(name), stack: this.s.cfg.startStack }, chair, this.s.cfg);
    // someone who left and comes back gets their own chips back (not a fresh stack): leaving must not wipe a
    // loss or skip the rebuy limit
    const old = opts.id ? (this.s.departed ?? []).find((d) => d.id === opts.id) : undefined;
    if (old) {
      p.stack = old.stack; p.buyins = old.buyins; p.rebuysUsed = old.rebuysUsed; p.busted = old.busted; p.bank = old.bank;
      this.s.departed = this.s.departed!.filter((d) => d.id !== old.id);
    }
    p.waitForBB = !!opts.waitForBB;
    this.s.players.push(p);
    this.reseat();
    this.logLine(`${p.name} joins the table`);
    return p;
  }

  removePlayer(id: PlayerId): void {
    const p = this.player(id);
    if (!p) return;
    const inHand = this.s.hand?.ps[id];
    if (inHand && !inHand.folded && this.s.phase === 'hand') {
      p.leaving = true; // removed after the hand
      return;
    }
    this.s.departed = (this.s.departed ?? []).concat([{ ...p }]);
    this.s.players = this.s.players.filter((x) => x.id !== id);
    this.reseat();
  }

  movePlayer(id: PlayerId, dir: number): void {
    const arr = this.s.players;
    const i = arr.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const a = arr[i]!, b = arr[j]!;
    [a.chair, b.chair] = [b.chair, a.chair];
    this.reseat();
  }

  private whyNoRebuy(id: PlayerId): string | null {
    const s = this.s, p = this.player(id), c = s.cfg;
    if (!p) return 'Unknown player';
    if (s.phase === 'ended') return 'The game has ended';
    if (!c.rebuys) return 'Rebuys are off at this table';
    const inHand = s.hand?.ps[id];
    if (s.phase === 'hand' && inHand && !inHand.folded) return 'Rebuy after this hand';
    if (p.stack > 0 && c.rebuyBelow <= 1) return 'You can rebuy once you are out of chips';
    if (p.stack >= c.rebuyBelow || p.stack >= rebuyChips(c)) return 'Your stack is too big to rebuy';
    if (c.maxRebuys > 0 && p.rebuysUsed >= c.maxRebuys) return 'No rebuys left';
    if (c.rebuyUntilLevel > 0 && s.level.n > c.rebuyUntilLevel) return 'Rebuys have closed';
    return null;
  }

  /** The table's rebuy rules, and for `pid` how many are left and whether they may rebuy now. */
  rebuyView(pid: PlayerId | null): RebuyView {
    const c = this.s.cfg, p = pid ? this.player(pid) : undefined;
    const used = p?.rebuysUsed ?? 0;
    const why = p ? this.whyNoRebuy(p.id) : 'You are watching';
    return {
      on: !!c.rebuys, amount: rebuyChips(c), max: c.maxRebuys || 0, untilLevel: c.rebuyUntilLevel || 0,
      closed: (c.rebuyUntilLevel || 0) > 0 && this.s.level.n > c.rebuyUntilLevel,
      atZero: (c.rebuyBelow || 0) <= 1, used, left: c.maxRebuys > 0 ? Math.max(0, c.maxRebuys - used) : null,
      can: !why, why,
    };
  }

  rebuy(id: PlayerId): GameEvent[] {
    if (this.whyNoRebuy(id)) return [];
    const p = this.P(id);
    const add = rebuyChips(this.s.cfg) - p.stack;
    p.stack += add;
    p.buyins += add;
    p.rebuysUsed += 1;
    p.busted = false;
    p.sittingOut = false;
    p.away = false;
    p.sitOutHands = 0;
    this.logLine(`${p.name} rebuys for ${add}`);
    return [{ t: 'rebuy', pid: id, amount: add }];
  }

  setSitOut(id: PlayerId, v: boolean): void {
    const p = this.player(id);
    if (!p) return;
    if (v) { p.sittingOut = true; return; }
    this.sitIn(p, true);
  }

  private sitIn(p: Player, postNow: boolean): void {
    p.sittingOut = false;
    p.away = false;
    p.sitOutHands = 0;
    if (p.missedBB || p.missedSB) {
      if (postNow) { p.postMissed = true; p.waitForBB = false; }
      else p.waitForBB = true;
    }
  }

  private setPresence(p: Player, connected: boolean): GameEvent[] {
    p.connected = connected;
    const h = this.s.hand;
    // one grace period per hand if the connection drops on your turn
    if (!connected && h && this.s.phase === 'hand' && h.toAct === p.id && this.s.cfg.turnTime > 0) h.graceUsed[p.id] = true;
    return [{ t: 'presence', pid: p.id, connected }];
  }

  logLine(text: string): void {
    this.s.log.push({ h: this.s.handNo, text });
    if (this.s.log.length > 80) this.s.log.splice(0, this.s.log.length - 80);
  }

  /** Players who may be dealt in, in chair order (waiting players included: they may be the big blind). */
  private candidates(): Player[] {
    return this.s.players.filter((p) => p.stack > 0 && !p.sittingOut && !p.leaving);
  }

  canStartHand(): boolean {
    return this.s.phase !== 'hand' && this.s.phase !== 'ended' && !this.s.paused && this.plan() !== null;
  }

  private waiting(p: Player): boolean {
    return p.waitForBB || ((p.missedBB || p.missedSB) && !p.postMissed);
  }

  /** Who is dealt in and where the button and blinds go. Dead-button rule: the big blind always moves
   *  forward to the next player; the small blind sits where the big blind was; the button where the
   *  small blind was, even if that chair is now empty. */
  private plan(): Plan | null {
    const s = this.s;
    const cands = this.candidates();
    if (cands.length < 2) return null;
    const N = s.cfg.maxPlayers;
    const atChair = (ps: Player[], c: number) => ps.find((p) => p.chair === c) ?? null;

    if (s.lastBBChair < 0) {
      // First hand: button on the first chair, blinds to its left; nobody waits.
      const dealt = cands;
      if (dealt.length === 2) return { dealt, button: dealt[0]!, sb: dealt[0]!, bb: dealt[1]!, buttonChair: dealt[0]!.chair, sbChair: dealt[0]!.chair, bbChair: dealt[1]!.chair };
      return { dealt, button: dealt[0]!, sb: dealt[1]!, bb: dealt[2]!, buttonChair: dealt[0]!.chair, sbChair: dealt[1]!.chair, bbChair: dealt[2]!.chair };
    }

    let bb: Player | null = null;
    for (let k = 1; k <= N && !bb; k++) bb = atChair(cands, (s.lastBBChair + k) % N);
    let dealt = cands.filter((p) => p === bb || !this.waiting(p));
    if (dealt.length < 2) dealt = cands; // everyone else is waiting: deal them in rather than stall
    const big = bb!;
    if (dealt.length === 2) {
      const other = dealt.find((p) => p !== big)!;
      return { dealt, button: other, sb: other, bb: big, buttonChair: other.chair, sbChair: other.chair, bbChair: big.chair };
    }
    const sbChair = s.lastBBChair;
    const buttonChair = s.lastSBChair;
    const sbP = atChair(dealt, sbChair);
    const sb = sbP && sbP !== big ? sbP : null;
    const btnP = atChair(dealt, buttonChair);
    const button = btnP && btnP !== big && btnP !== sb ? btnP : null;
    return { dealt, button, sb, bb: big, buttonChair, sbChair, bbChair: big.chair };
  }

  // ---------------- hand flow ----------------
  /** Legacy entry: deals with a fresh random seed and the real clock. Tables driven by inputs use apply({t:'start'}). */
  startHand(seed?: string, now?: number): GameEvent[] {
    const r = this.startHandChecked(seed ?? randomSeed(), [], now ?? Date.now());
    return r.events ?? [];
  }

  private startHandChecked(dealerSeed: string, contributions: string[], now: number): ActResult {
    const s = this.s;
    if (s.phase === 'hand') return { error: 'A hand is already running' };
    if (s.phase === 'ended') return { error: 'The game has ended' };
    if (s.paused) return { error: 'The table is paused' };
    const plan = this.plan();
    if (!plan) return { error: 'Need at least two players with chips' };
    if (s.nextSeedCommit && seedCommit(dealerSeed) !== s.nextSeedCommit) return { error: 'The seed does not match the dealer\'s promise' };
    let seed: string;
    try { seed = combineSeeds(dealerSeed, contributions); } catch (e) { return { error: (e as Error).message }; }

    this.undoStack = [];
    s.now = Math.max(s.now, now);
    s.handNo += 1;
    const ev: GameEvent[] = [];

    // blind levels: the host's change first, otherwise the schedule
    if (s.pendingLevel) {
      s.level = { ...s.pendingLevel, n: s.level.n + 1 };
      s.pendingLevel = null;
      ev.push({ t: 'level', level: s.level });
    } else if (s.cfg.blindUpEvery > 0 && s.handNo > 1 && (s.handNo - 1) % s.cfg.blindUpEvery === 0) {
      const bb = Math.max(niceRound(s.level.bb * 1.5), s.level.bb + 1);
      const n = s.level.n + 1;
      s.level = { bb, sb: Math.max(1, Math.round(bb / 2)), n, ante: s.cfg.anteFromLevel > 0 && n >= s.cfg.anteFromLevel ? anteFor(bb) : 0 };
      this.logLine(`Blinds up: ${s.level.sb}/${s.level.bb}${s.level.ante ? `, ante ${s.level.ante}` : ''}`);
      ev.push({ t: 'level', level: s.level });
    }
    // time banks refill every N hands
    if (s.cfg.bankRefillEvery > 0 && s.handNo > 1 && (s.handNo - 1) % s.cfg.bankRefillEvery === 0) {
      for (const p of s.players) p.bank = Math.min(s.cfg.timeBank, round1(p.bank + s.cfg.bankRefill));
    }
    // sitting out three hands in a row turns a player to Away
    for (const p of s.players) if (p.sittingOut && p.stack > 0) { p.sitOutHands += 1; if (p.sitOutHands >= 3) p.away = true; }

    // missed blinds: anyone sitting out whom the big or small blind passed over owes them
    const N = s.cfg.maxPlayers;
    if (s.lastBBChair >= 0) {
      for (let k = 1; k < N; k++) {
        const c = (s.lastBBChair + k) % N;
        if (c === plan.bbChair) break;
        const p = s.players.find((x) => x.chair === c);
        if (p && p.sittingOut && p.stack > 0) p.missedBB = true;
      }
      const sbSeat = s.players.find((x) => x.chair === plan.sbChair);
      if (sbSeat && sbSeat.sittingOut && sbSeat.stack > 0) sbSeat.missedSB = true;
    }

    // order of action: dealt players by chair starting left of the button chair
    const dist = (c: number) => (c - plan.buttonChair - 1 + N) % N;
    const order = plan.dealt.slice().sort((a, b) => dist(a.chair) - dist(b.chair)).map((p) => p.id);
    const deck = deckFromSeed(seed);
    const hand: Hand = {
      id: s.handNo, deck, board: [], board2: null, burns: 0, street: 'preflop', order, ps: {},
      currentBet: 0, lastFullRaise: s.level.bb, toAct: null, lastAggressor: null, results: null,
      revealed: {}, shown: {}, sbId: plan.sb?.id ?? null, bbId: plan.bb.id, straddleId: null,
      buttonId: plan.button?.id ?? null, buttonChair: plan.buttonChair, sbChair: plan.sbChair, bbChair: plan.bbChair,
      runout: false, startedAt: now, endedAt: null, turnStartedAt: now, graceUsed: {}, vote: null,
      deckCommit: deckCommit(seed, deck),
      seedInfo: { dealerSeed, contributions: [...contributions], seed, dealerSeedCommit: s.nextSeedCommit },
      engineVersion: ENGINE_VERSION,
    };
    for (const pid of order) {
      hand.ps[pid] = { cards: [], streetBet: 0, total: 0, folded: false, allIn: false, acted: false, actedAt: 0, lastAction: null };
    }
    s.nextSeedCommit = null;
    s.hand = hand;
    s.phase = 'hand';
    s.lastButtonChair = plan.buttonChair;
    s.lastSBChair = plan.sbChair;
    s.lastBBChair = plan.bbChair;
    this.reseat();
    ev.push({ t: 'handStart', handNo: s.handNo, buttonId: hand.buttonId, level: s.level, deckCommit: hand.deckCommit });

    // antes (dead money), then blinds
    if (s.level.ante > 0) for (const pid of order) ev.push(this.postDead(pid, s.level.ante, 'ante'));
    if (plan.sb) ev.push(this.post(plan.sb.id, s.level.sb, 'sb'));
    ev.push(this.post(plan.bb.id, s.level.bb, 'bb'));
    // players coming back who chose to post what they missed
    for (const p of plan.dealt) {
      const owes = p !== plan.bb && p !== plan.sb && p.postMissed;
      if (owes && p.missedSB) ev.push(this.postDead(p.id, s.level.sb, 'deadsb'));
      if (owes && p.missedBB) ev.push(this.post(p.id, s.level.bb, 'missedbb'));
      p.missedBB = false; p.missedSB = false; p.postMissed = false; p.waitForBB = false;
    }
    hand.currentBet = s.level.bb; // even if the big blind is short, others call the full blind
    hand.lastFullRaise = s.level.bb;

    // straddle: the first player after the big blind may post two big blinds
    let lastBlind = plan.bb.id;
    if (s.cfg.straddle && order.length >= 3) {
      const utg = order[(order.indexOf(plan.bb.id) + 1) % order.length]!;
      const up = this.P(utg);
      if (up.wantsStraddle && utg !== plan.sb?.id && up.stack > 0) {
        ev.push(this.post(utg, 2 * s.level.bb - hand.ps[utg]!.streetBet, 'straddle'));
        hand.straddleId = utg;
        hand.currentBet = Math.max(hand.currentBet, hand.ps[utg]!.streetBet);
        lastBlind = utg;
      }
    }

    // deal two cards each, one at a time, starting left of the button
    for (let round = 0; round < 2; round++) for (const pid of order) hand.ps[pid]!.cards.push(deck.pop()!);
    ev.push({ t: 'dealHole', order: order.slice() });
    const bn = hand.buttonId ? this.P(hand.buttonId).name : 'an empty seat';
    this.logLine(`Hand #${s.handNo} — ${bn} has the button`);

    const first = this.nextToAct(lastBlind);
    if (!first) ev.push(...this.closeRound());
    else ev.push(this.setTurn(first));
    return { events: ev };
  }

  private setTurn(pid: PlayerId): GameEvent {
    const h = this.H;
    h.toAct = pid;
    h.turnStartedAt = this.s.now;
    return { t: 'turn', pid, deadline: this.deadline() };
  }

  /** When the player to act will be timed out, or null if there is no timer. */
  deadline(): number | null {
    const s = this.s, h = s.hand;
    if (!h || !h.toAct || s.cfg.turnTime <= 0 || s.phase !== 'hand') return null;
    const p = this.P(h.toAct);
    const grace = h.graceUsed[h.toAct] ? s.cfg.disconnectGrace : 0;
    return h.turnStartedAt + Math.round((s.cfg.turnTime + p.bank + grace) * 1000);
  }

  post(pid: PlayerId, amount: number, kind: 'sb' | 'bb' | 'straddle' | 'missedbb'): GameEvent {
    const p = this.P(pid);
    const hp = this.hp(pid);
    const amt = Math.min(amount, p.stack);
    p.stack -= amt;
    hp.streetBet += amt;
    hp.total += amt;
    if (p.stack === 0) hp.allIn = true;
    const what = { sb: 'small blind', bb: 'big blind', straddle: 'a straddle of', missedbb: 'a missed big blind of' }[kind];
    this.logLine(`${p.name} posts ${what} ${amt}`);
    return { t: 'blind', pid, amount: amt, kind };
  }

  /** Antes and a missed small blind go into the pot without counting as a bet. */
  private postDead(pid: PlayerId, amount: number, kind: 'ante' | 'deadsb'): GameEvent {
    const p = this.P(pid);
    const hp = this.hp(pid);
    const amt = Math.min(amount, p.stack);
    p.stack -= amt;
    hp.total += amt;
    if (p.stack === 0) hp.allIn = true;
    this.logLine(`${p.name} posts ${kind === 'ante' ? 'an ante of' : 'a dead small blind of'} ${amt}`);
    return kind === 'ante' ? { t: 'ante', pid, amount: amt } : { t: 'blind', pid, amount: amt, kind: 'deadsb' };
  }

  /** Next player (after `fromId` in order) who still needs to act this round. */
  nextToAct(fromId: PlayerId): PlayerId | null {
    const h = this.H;
    const ord = h.order;
    const start = ord.indexOf(fromId);
    for (let k = 1; k <= ord.length; k++) {
      const pid = ord[(start + k) % ord.length]!;
      const hp = h.ps[pid]!;
      if (hp.folded || hp.allIn) continue;
      if (!hp.acted || hp.streetBet < h.currentBet) return pid;
    }
    return null;
  }

  livePlayers(): PlayerId[] { const h = this.H; return h.order.filter((pid) => !h.ps[pid]!.folded); }
  canActPlayers(): PlayerId[] { const h = this.H; return h.order.filter((pid) => { const hp = h.ps[pid]!; return !hp.folded && !hp.allIn; }); }

  /** What `pid` may do right now, or null if it is not their turn. */
  legal(pid: PlayerId): Legal | null {
    const s = this.s, h = s.hand;
    if (!h || s.phase !== 'hand' || h.toAct !== pid) return null;
    const p = this.P(pid), hp = this.hp(pid);
    const toCall = Math.min(h.currentBet - hp.streetBet, p.stack);
    const maxTo = hp.streetBet + p.stack;
    const reopened = !hp.acted || (h.currentBet - hp.actedAt) >= h.lastFullRaise;
    const othersCanAct = this.canActPlayers().filter((x) => x !== pid).length > 0;
    const canRaise = reopened && p.stack > toCall && othersCanAct;
    const minTo = Math.min(h.currentBet === 0 ? s.level.bb : h.currentBet + h.lastFullRaise, maxTo);
    return {
      toCall, canCheck: toCall === 0, canCall: toCall > 0, canRaise, isBet: h.currentBet === 0,
      minTo, maxTo, currentBet: h.currentBet, streetBet: hp.streetBet, pot: this.potTotal(),
    };
  }

  potTotal(): number {
    const h = this.s.hand;
    if (!h) return 0;
    return Object.values(h.ps).reduce((a, hp) => a + hp.total, 0);
  }

  /** Saves the table so the host can undo the next action. */
  pushUndo(): void {
    this.undoStack.push(clone(this.s));
    if (this.undoStack.length > 10) this.undoStack.shift();
  }

  canUndo(): boolean {
    const prev = this.undoStack[this.undoStack.length - 1];
    if (!prev || !this.s.hand || !prev.hand) return false;
    return prev.hand.id === this.s.hand.id && prev.hand.board.length === this.s.hand.board.length && this.s.phase === 'hand';
  }

  undo(): GameEvent[] | null {
    if (!this.canUndo()) return null;
    const now = this.s.now;
    const cur = this.s;
    this.s = this.undoStack.pop()!;
    this.s.now = now;
    // a rebuy by someone out of this hand is not an action in it: undoing an action keeps it
    for (const p of this.s.players) {
      const q = cur.players.find((x) => x.id === p.id);
      if (!q || q.rebuysUsed <= p.rebuysUsed || this.s.hand?.ps[p.id]) continue;
      Object.assign(p, { stack: q.stack, buyins: q.buyins, rebuysUsed: q.rebuysUsed, busted: q.busted, sittingOut: q.sittingOut, away: q.away, sitOutHands: q.sitOutHands });
    }
    this.H.turnStartedAt = now;
    this.logLine('Dealer undoes the last action');
    return [{ t: 'undo' }, { t: 'turn', pid: this.H.toAct, deadline: this.deadline() }];
  }

  act(pid: PlayerId, action: Action, now?: number): ActResult {
    const s = this.s, h = s.hand;
    const L = this.legal(pid);
    if (!L || !h) return { error: 'Not your turn' };
    if (s.paused) return { error: 'The table is paused' };
    const p = this.P(pid), hp = this.hp(pid);
    let type = action.type;
    if (!['fold', 'check', 'call', 'bet', 'raise', 'allin'].includes(type)) return { error: 'Unknown action' };
    if (type === 'check' && !L.canCheck) return { error: 'Cannot check' };
    if (type === 'call' && !L.canCall) return { error: 'Nothing to call' };
    if ((type === 'bet' || type === 'raise') && !L.canRaise) return { error: 'Raising is not allowed here' };
    this.pushUndo();
    if (now !== undefined) {
      s.now = Math.max(s.now, now);
      this.chargeBank(p, h);
    }
    const ev: GameEvent[] = [];
    const say = (text: string): void => this.logLine(`${p.name} ${text}`);

    if (type === 'allin') {
      if (L.canRaise && L.maxTo > h.currentBet) type = 'raise';
      else if (L.canCall) type = 'call';
      else type = 'check';
      action = { type, to: L.maxTo };
    }

    if (type === 'fold') {
      hp.folded = true; hp.acted = true; hp.lastAction = 'fold';
      say('folds');
      ev.push({ t: 'act', pid, a: 'fold' });
    } else if (type === 'check') {
      hp.acted = true; hp.actedAt = h.currentBet; hp.lastAction = 'check';
      say('checks');
      ev.push({ t: 'act', pid, a: 'check' });
    } else if (type === 'call') {
      const amt = L.toCall;
      p.stack -= amt; hp.streetBet += amt; hp.total += amt;
      if (p.stack === 0) hp.allIn = true;
      hp.acted = true; hp.actedAt = h.currentBet; hp.lastAction = hp.allIn ? 'allin' : 'call';
      say(hp.allIn ? `calls ${amt} and is all-in` : `calls ${amt}`);
      ev.push({ t: 'act', pid, a: hp.allIn ? 'allin' : 'call', amount: amt, to: hp.streetBet });
    } else {
      let to = Math.floor(Number(action.to) || 0);
      to = Math.max(Math.min(to, L.maxTo), L.minTo);
      const amt = to - hp.streetBet;
      const raiseSize = to - h.currentBet;
      const wasBet = h.currentBet === 0;
      p.stack -= amt; hp.streetBet = to; hp.total += amt;
      if (p.stack === 0) hp.allIn = true;
      if (raiseSize >= h.lastFullRaise) h.lastFullRaise = raiseSize; // full raise reopens action
      h.currentBet = to;
      h.lastAggressor = pid;
      hp.acted = true; hp.actedAt = to;
      hp.lastAction = hp.allIn ? 'allin' : (wasBet ? 'bet' : 'raise');
      say(hp.allIn ? `goes all-in for ${to}` : wasBet ? `bets ${to}` : `raises to ${to}`);
      ev.push({ t: 'act', pid, a: hp.lastAction, amount: amt, to });
    }

    if (this.livePlayers().length === 1) {
      ev.push(...this.finishUncontested());
      return { events: ev };
    }
    const next = this.nextToAct(pid);
    if (next) ev.push(this.setTurn(next));
    else ev.push(...this.closeRound());
    return { events: ev };
  }

  /** Time past the per-action allowance comes out of the bank (after any disconnect grace). */
  private chargeBank(p: Player, h: Hand): void {
    const c = this.s.cfg;
    if (c.turnTime <= 0) return;
    const elapsed = (this.s.now - h.turnStartedAt) / 1000;
    const grace = h.graceUsed[p.id] ? c.disconnectGrace : 0;
    const over = elapsed - c.turnTime - grace;
    if (over > 0) p.bank = Math.max(0, round1(p.bank - over));
  }

  /** Clock input: times out the player to act, or settles an unanswered Deal it twice vote. */
  tick(now: number): GameEvent[] {
    const s = this.s, h = s.hand;
    s.now = Math.max(s.now, now);
    if (s.paused || !h || s.phase !== 'hand') return [];
    if (h.vote) return now >= h.vote.deadline ? this.resolveVote(false) : [];
    const d = this.deadline();
    if (d === null || now < d) return [];
    const pid = h.toAct!;
    this.P(pid).bank = 0;
    const L = this.legal(pid)!;
    const events = this.act(pid, { type: L.canCheck ? 'check' : 'fold' }).events!;
    const first = events[0];
    if (first && first.t === 'act') first.auto = true;
    this.logLine(`${this.P(pid).name} ran out of time`);
    return events;
  }

  /** Return the uncalled part of the biggest bet this round. */
  returnUncalled(): GameEvent[] {
    const h = this.H;
    const bets = h.order.map((pid) => ({ pid, b: h.ps[pid]!.streetBet })).sort((a, b) => b.b - a.b);
    const top = bets[0]!, second = bets[1]!;
    if (top.b > second.b) {
      const extra = top.b - second.b;
      const hp = h.ps[top.pid]!;
      const p = this.P(top.pid);
      hp.streetBet -= extra; hp.total -= extra;
      p.stack += extra;
      if (hp.allIn && p.stack > 0) hp.allIn = false;
      this.logLine(`Uncalled ${extra} returned to ${p.name}`);
      return [{ t: 'refund', pid: top.pid, amount: extra }];
    }
    return [];
  }

  closeRound(): GameEvent[] {
    const h = this.H;
    const ev: GameEvent[] = [...this.returnUncalled()];
    ev.push({ t: 'collect' });
    for (const pid of h.order) {
      const hp = h.ps[pid]!;
      hp.streetBet = 0; hp.acted = false; hp.actedAt = 0;
      if (!hp.folded && !hp.allIn) hp.lastAction = null;
    }
    h.currentBet = 0;
    h.lastFullRaise = this.s.level.bb;
    h.toAct = null;

    // (a hand won by folds never gets here: act() finishes it first)
    if (h.street === 'river') return ev.concat(this.showdown());

    if (this.canActPlayers().length <= 1) {
      // no more betting possible: turn cards up and run it out (maybe twice)
      h.runout = true;
      ev.push(this.revealAll());
      if (this.s.cfg.dealItTwice) {
        const pids = this.livePlayers();
        h.vote = { pids, yes: {}, deadline: this.s.now + this.s.cfg.dealItTwiceVote * 1000 };
        ev.push({ t: 'voteTwice', pids, deadline: h.vote.deadline });
        return ev;
      }
      return ev.concat(this.runOut(false));
    }
    ev.push(this.dealStreet());
    // first to act after the flop: first live player left of the button (the last seat in order acts last)
    const first = this.nextToAct(h.order[h.order.length - 1]!);
    ev.push(this.setTurn(first!));
    return ev;
  }

  private vote(pid: PlayerId, yes: boolean, now: number): ActResult {
    const h = this.s.hand;
    if (!h || !h.vote || this.s.phase !== 'hand') return { error: 'Nothing to vote on' };
    if (this.s.paused) return { error: 'The table is paused' };
    if (!h.vote.pids.includes(pid)) return { error: 'Only players in the hand vote' };
    if (pid in h.vote.yes) return { error: 'Already voted' };
    this.s.now = Math.max(this.s.now, now);
    h.vote.yes[pid] = yes;
    if (!yes) return { events: this.resolveVote(false) };
    if (h.vote.pids.every((x) => h.vote!.yes[x])) return { events: this.resolveVote(true) };
    return { events: [] };
  }

  private resolveVote(agreed: boolean): GameEvent[] {
    const h = this.H;
    h.vote = null;
    this.logLine(agreed ? 'Everyone agrees: the rest of the board is dealt twice' : 'The board is dealt once');
    return [{ t: 'twice', agreed }, ...this.runOut(agreed)];
  }

  private runOut(twice: boolean): GameEvent[] {
    const h = this.H;
    const ev: GameEvent[] = [];
    const before = h.board.length;
    while (h.board.length < 5) ev.push(this.dealStreet());
    if (twice) {
      const b2 = h.board.slice(0, before);
      while (b2.length < 5) {
        h.deck.pop(); h.burns += 1;
        const cards: number[] = [];
        for (let i = 0, n = b2.length === 0 ? 3 : 1; i < n; i++) cards.push(h.deck.pop()!);
        b2.push(...cards);
        const street = b2.length === 3 ? 'flop' : b2.length === 4 ? 'turn' : 'river';
        ev.push({ t: 'street', street, cards: cards.map(cardStr), board: 2 });
      }
      h.board2 = b2;
      this.logLine(`Second board: ${b2.map(cardStr).join(' ')}`);
    }
    return ev.concat(this.showdown());
  }

  dealStreet(): GameEvent {
    const h = this.H;
    h.deck.pop(); h.burns += 1; // burn
    let cards: number[], street: Hand['street'];
    if (h.board.length === 0) { cards = [h.deck.pop()!, h.deck.pop()!, h.deck.pop()!]; street = 'flop'; }
    else if (h.board.length === 3) { cards = [h.deck.pop()!]; street = 'turn'; }
    else { cards = [h.deck.pop()!]; street = 'river'; }
    h.board.push(...cards);
    h.street = street;
    this.logLine(`${street.charAt(0).toUpperCase() + street.slice(1)}: ${h.board.map(cardStr).join(' ')}`);
    return { t: 'street', street, cards: cards.map(cardStr) };
  }

  revealAll(): GameEvent {
    const h = this.H;
    const cards: Record<PlayerId, string[]> = {};
    for (const pid of this.livePlayers()) { h.revealed[pid] = true; cards[pid] = h.ps[pid]!.cards.map(cardStr); }
    return { t: 'reveal', cards };
  }

  buildPots(): BuiltPot[] {
    const h = this.H;
    const contrib = h.order.map((pid) => ({ pid, amt: h.ps[pid]!.total, live: !h.ps[pid]!.folded }));
    const levels = [...new Set(contrib.filter((c) => c.amt > 0).map((c) => c.amt))].sort((a, b) => a - b);
    const pots: BuiltPot[] = [];
    let prev = 0;
    for (const lvl of levels) {
      let amount = 0;
      for (const c of contrib) amount += Math.max(0, Math.min(c.amt, lvl) - prev);
      const elig = contrib.filter((c) => c.live && c.amt >= lvl).map((c) => c.pid);
      prev = lvl;
      const last = pots[pots.length - 1];
      // chips no live player can win (a folded player put in the most) join the pot below them
      if (elig.length === 0 && last) { last.amount += amount; continue; }
      if (last && last.elig.length === elig.length && last.elig.every((x) => elig.includes(x))) last.amount += amount;
      else pots.push({ amount, elig });
    }
    return pots;
  }

  /** Chairs clockwise from the button chair (1 = first left of the button). */
  distFromButton(pid: PlayerId): number {
    const N = this.s.cfg.maxPlayers;
    return ((this.P(pid).chair - this.H.buttonChair) + N) % N || N;
  }

  private evalBoard(board: number[], live: PlayerId[]): Record<PlayerId, HandEval> {
    const h = this.H;
    const evals: Record<PlayerId, HandEval> = {};
    for (const pid of live) {
      const e = evalBest(h.ps[pid]!.cards.concat(board))!;
      evals[pid] = { score: e.score, name: e.name, desc: e.desc, best: e.cards.map(cardStr) };
    }
    return evals;
  }

  private award(amount: number, elig: PlayerId[], evals: Record<PlayerId, HandEval>): { awards: Award[]; winners: PlayerId[] } {
    const best = Math.max(...elig.map((pid) => evals[pid]!.score));
    const winners = elig.filter((pid) => evals[pid]!.score === best).sort((a, b) => this.distFromButton(a) - this.distFromButton(b));
    const share = Math.floor(amount / winners.length);
    let odd = amount - share * winners.length;
    const awards = winners.map((pid) => {
      const amt = share + (odd > 0 ? 1 : 0);
      if (odd > 0) odd -= 1;
      this.P(pid).stack += amt;
      return { pid, amount: amt };
    });
    return { awards, winners };
  }

  showdown(): GameEvent[] {
    const h = this.H;
    const ev: GameEvent[] = [];
    const live = this.livePlayers();
    // showing order: last aggressor of the final street first, else left of button
    let showOrder = live.slice().sort((a, b) => this.distFromButton(a) - this.distFromButton(b));
    if (h.lastAggressor && live.includes(h.lastAggressor) && !h.runout) {
      const i = showOrder.indexOf(h.lastAggressor);
      showOrder = showOrder.slice(i).concat(showOrder.slice(0, i));
    }
    const evals = this.evalBoard(h.board, live);
    const evals2 = h.board2 ? this.evalBoard(h.board2, live) : undefined;
    if (!h.runout) {
      const cards: Record<PlayerId, string[]> = {};
      for (const pid of showOrder) { h.revealed[pid] = true; cards[pid] = h.ps[pid]!.cards.map(cardStr); }
      ev.push({ t: 'reveal', cards, order: showOrder });
    }
    const pots = this.buildPots();
    const results: PotResult[] = [];
    pots.forEach((pot, i) => {
      const label = pots.length === 1 ? 'the pot' : i === 0 ? 'the main pot' : `side pot ${i}`;
      // dealt twice: each pot is split in half, the odd chip going to the first board
      const runs: { amount: number; evals: Record<PlayerId, HandEval>; board?: 1 | 2; suffix: string }[] = evals2
        ? [{ amount: Math.ceil(pot.amount / 2), evals, board: 1, suffix: ' (first board)' }, { amount: Math.floor(pot.amount / 2), evals: evals2, board: 2, suffix: ' (second board)' }]
        : [{ amount: pot.amount, evals, suffix: '' }];
      for (const run of runs) {
        const { awards, winners } = this.award(run.amount, pot.elig, run.evals);
        for (const a of awards) this.logLine(`${this.P(a.pid).name} wins ${a.amount} from ${label}${run.suffix} with ${run.evals[a.pid]!.desc}`);
        const r: PotResult = { label: label + run.suffix, amount: run.amount, awards, hand: run.evals[winners[0]!]! };
        if (run.board) r.board = run.board;
        results.push(r);
      }
    });
    h.results = { pots: results, evals, showdown: true };
    if (evals2) { h.results.evals2 = evals2; h.results.twice = true; }
    this.endHand();
    ev.push({ t: 'win', results: h.results }, this.deckRevealEvent());
    return ev;
  }

  finishUncontested(): GameEvent[] {
    const h = this.H;
    const ev: GameEvent[] = [...this.returnUncalled(), { t: 'collect' }];
    for (const pid of h.order) h.ps[pid]!.streetBet = 0;
    const winner = this.livePlayers()[0]!;
    const amount = this.potTotal();
    this.P(winner).stack += amount;
    this.logLine(`${this.P(winner).name} wins ${amount} uncontested`);
    h.results = { pots: [{ label: 'the pot', amount, awards: [{ pid: winner, amount }], hand: null }], evals: {}, showdown: false };
    this.endHand();
    ev.push({ t: 'win', results: h.results }, this.deckRevealEvent());
    return ev;
  }

  private deckRevealEvent(): GameEvent {
    const h = this.H;
    return { t: 'deckReveal', dealerSeed: h.seedInfo.dealerSeed, contributions: h.seedInfo.contributions, deckCommit: h.deckCommit };
  }

  endHand(): void {
    const s = this.s, h = this.H;
    h.toAct = null;
    h.endedAt = s.now;
    s.phase = 'between';
    for (const pot of h.results!.pots) for (const a of pot.awards) {
      const st = (s.stats[a.pid] ??= { won: 0, biggest: 0 });
      st.won += 1;
      st.biggest = Math.max(st.biggest, a.amount);
    }
    for (const p of s.players) if (p.stack === 0) p.busted = true;
    const leaving = s.players.filter((p) => p.leaving);
    if (leaving.length) {
      s.departed = (s.departed ?? []).concat(leaving.map((p) => ({ ...p })));
      s.players = s.players.filter((p) => !p.leaving);
    }
    this.reseat();
    this.undoStack = [];
  }

  /** Winner of an uncontested pot may choose to show. */
  showCards(pid: PlayerId): GameEvent[] {
    const h = this.s.hand;
    const hp = h?.ps[pid];
    if (!h || !hp || this.s.phase !== 'between' || h.shown[pid] || h.revealed[pid]) return [];
    h.shown[pid] = true;
    this.logLine(`${this.P(pid).name} shows ${hp.cards.map(cardStr).join(' ')}`);
    return [{ t: 'show', pid, cards: hp.cards.map(cardStr) }];
  }

  /** Timer / away handling: check if possible, otherwise fold. */
  autoAct(pid: PlayerId): ActResult | null {
    const L = this.legal(pid);
    if (!L) return null;
    return this.act(pid, { type: L.canCheck ? 'check' : 'fold' });
  }

  endGame(): Standing[] {
    this.s.phase = 'ended';
    const h = this.s.hand;
    if (h && !h.results) {
      // refund chips in the middle of an unfinished hand
      for (const [pid, hp] of Object.entries(h.ps)) {
        const p = this.player(pid);
        if (p) p.stack += hp.total;
      }
    }
    this.s.hand = null;
    return this.standings();
  }

  standings(): Standing[] {
    const all = this.s.players.concat(this.s.departed ?? []);
    return all.map((p) => ({
      id: p.id, name: p.name, stack: p.stack, buyins: p.buyins, net: p.stack - p.buyins,
      won: this.s.stats[p.id]?.won ?? 0, biggest: this.s.stats[p.id]?.biggest ?? 0,
    })).sort((a, b) => b.net - a.net);
  }

  // ---------------- views ----------------
  /** What `pid` may see; pass null for a spectator (public cards only). */
  viewFor(pid: PlayerId | null): View {
    const s = this.s, h = s.hand;
    const c = s.cfg;
    const v: View = {
      gameId: s.gameId, phase: s.phase, handNo: s.handNo, level: s.level,
      cfg: { startStack: c.startStack, rebuys: c.rebuys, turnTime: c.turnTime, blindUpEvery: c.blindUpEvery, timeBank: c.timeBank, dealItTwice: c.dealItTwice, straddle: c.straddle, maxPlayers: c.maxPlayers, maxRebuys: c.maxRebuys || 0, rebuyUntilLevel: c.rebuyUntilLevel || 0 },
      rebuy: this.rebuyView(pid),
      stats: pid && this.player(pid) ? { won: s.stats[pid]?.won ?? 0, biggest: s.stats[pid]?.biggest ?? 0 } : null,
      button: s.button, paused: s.paused,
      players: s.players.map((p) => ({
        id: p.id, name: p.name, seat: p.seat, chair: p.chair, stack: p.stack, sittingOut: p.sittingOut, away: p.away,
        connected: p.connected, busted: p.busted, leaving: p.leaving, buyins: p.buyins, bank: p.bank,
        waitForBB: p.waitForBB, missedSB: p.missedSB, missedBB: p.missedBB, rebuysUsed: p.rebuysUsed,
      })),
      log: s.log.slice(-30), me: pid, hand: null, legal: null, canUndo: this.canUndo(), engineVersion: ENGINE_VERSION,
    };
    if (h) {
      const ps: Record<PlayerId, HandPlayerView> = {};
      for (const id of h.order) {
        const hp = h.ps[id]!;
        const show = id === pid || h.revealed[id] || h.shown[id];
        ps[id] = {
          streetBet: hp.streetBet, total: hp.total, folded: hp.folded, allIn: hp.allIn,
          lastAction: hp.lastAction, inHand: true,
          cards: show ? hp.cards.map(cardStr) : null,
          revealed: !!(h.revealed[id] || h.shown[id]),
        };
      }
      const ended = !!h.results;
      v.hand = {
        id: h.id, board: h.board.map(cardStr), board2: h.board2 ? h.board2.map(cardStr) : null, street: h.street, order: h.order, ps,
        toAct: h.toAct, currentBet: h.currentBet, pot: this.potTotal(),
        collected: Object.values(h.ps).reduce((a, x) => a + x.total - x.streetBet, 0),
        sbId: h.sbId, bbId: h.bbId, straddleId: h.straddleId, buttonId: h.buttonId, results: h.results, runout: h.runout,
        pots: s.phase === 'hand' ? this.livePotsPreview() : null,
        deadline: this.deadline(),
        deckCommit: h.deckCommit,
        proof: ended ? { dealerSeed: h.seedInfo.dealerSeed, contributions: h.seedInfo.contributions, dealerSeedCommit: h.seedInfo.dealerSeedCommit } : null,
        vote: h.vote ? { pids: h.vote.pids, deadline: h.vote.deadline, voted: Object.keys(h.vote.yes) } : null,
      };
      v.legal = pid ? this.legal(pid) : null;
    }
    return v;
  }

  /** Pots made only of collected chips (for showing side pots mid-hand). */
  livePotsPreview(): { amount: number; n: number }[] | null {
    const h = this.H;
    const anyAllIn = h.order.some((pid) => h.ps[pid]!.allIn);
    if (!anyAllIn) return null;
    return this.buildPots().map((p) => ({ amount: p.amount, n: p.elig.length }));
  }
}
