// Table drama (design: the "Drama scenes & reactions" plan): which dramatic moment a hand has just produced,
// worked out from public information only (actions, stacks, cards already face up), never from anyone's hidden
// cards, so a scene can never give a hand away.
//
// The same tracker runs in two places and must agree:
// - every phone (apps/web/src/drama), to play the scenes;
// - the table server (room.ts), to give the player to act the scene's length back on their turn timer, and to
//   deal the next hand that much later.
// It is fed exactly what a phone gets: each update's events and the table view after them.
import { evalBest, parseCard, type GameEvent } from '@tp/engine';

// ---------------------------------------------------------------- who's who
export type Position = 'dominant' | 'contender' | 'desperateContender' | 'desperate';
export const POSITIONS: readonly Position[] = ['dominant', 'contender', 'desperateContender', 'desperate'];

/**
 * Each player's position, from all the stacks at the table when the hand starts (plan, "Who's who"):
 * - dominant: the biggest stack (anyone level with it too);
 * - desperate: the smallest stack and under half the average, or anyone under a quarter of the average;
 * - contender: not dominant, and at least 3/4 of the average;
 * - desperate contender: everyone else (under 3/4 of the average, not desperate).
 */
export function positions(stacks: Readonly<Record<string, number>>): Record<string, Position> {
  const ids = Object.keys(stacks);
  const out: Record<string, Position> = {};
  if (!ids.length) return out;
  const vals = ids.map((id) => stacks[id]!);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const max = Math.max(...vals), min = Math.min(...vals);
  for (const id of ids) {
    const s = stacks[id]!;
    if (s >= max) out[id] = 'dominant';
    else if ((s <= min && s < avg / 2) || s < avg / 4) out[id] = 'desperate';
    else if (s >= (avg * 3) / 4) out[id] = 'contender';
    else out[id] = 'desperateContender';
  }
  return out;
}

// ---------------------------------------------------------------- moments
export type InHandKind = 'allin' | 'allinAnswered' | 'bigBet' | 'bigBetAnswered' | 'fold';
export type ResultKind = 'allinResult' | 'comeback' | 'bigPot' | 'split' | 'rebuy' | 'lastStanding';
export type MomentKind = InHandKind | ResultKind;
export const IN_HAND: readonly InHandKind[] = ['allin', 'allinAnswered', 'bigBet', 'bigBetAnswered', 'fold'];
export const RESULTS: readonly ResultKind[] = ['allinResult', 'comeback', 'bigPot', 'split', 'rebuy', 'lastStanding'];
export type Role = 'opener' | 'answerer' | 'target';
export type Outcome = 'won' | 'out' | 'lost' | 'split';
/** A winner's chip pile: under 1x, 1-3x, over 3x what they started the hand with (net win). */
export type PileTier = 0 | 1 | 2;

/** How long each moment plays (ms). In-hand scenes are short so the game keeps moving. */
export const SCENE_MS: Record<MomentKind, number> = {
  allin: 1800, allinAnswered: 1600, bigBet: 1400, bigBetAnswered: 1400, fold: 1200,
  allinResult: 3500, comeback: 3500, bigPot: 3000, split: 3000, rebuy: 3000, lastStanding: 5000,
};
/** A second all-in on the same street: a quick follow-up, not a full scene. */
export const FOLLOW_UP_MS = 800;
/** In-hand scenes (follow-ups included) a hand may have. */
export const MAX_IN_HAND = 3;

export interface CastMember { pid: string; position: Position; outcome: Outcome; amount: number; pile: PileTier | null }

export interface Moment {
  kind: MomentKind;
  handNo: number;
  /** The player the moment is about (the one who shoved, called, folded, won, rebought). */
  pid: string;
  role: Role;
  position: Position;
  /** For the answered moments: a call, or a re-raise / re-shove. */
  variant?: 'call' | 'raise';
  /** The player the bet was aimed at (or, for an answer or a fold, the one who made the bet). */
  target: { pid: string; position: Position } | null;
  /** Plays as a 0.8 s follow-up (a second all-in on the same street). */
  followUp: boolean;
  /** How long it plays. */
  ms: number;
  /** Results: everyone the result is about (winners first), with how it went for them. */
  cast?: CastMember[];
  /** Results: the night's biggest pot so far (the red seal crown). */
  crown?: boolean;
  /** Results: this hand's in-hand moments, so the result can call back to them (the first act). */
  act1?: { pid: string; kind: InHandKind; variant?: 'call' | 'raise' }[];
}

/** The scene time the table should give back to the clock for these moments (in-hand scenes and rebuys). */
export function holdMs(ms: readonly Moment[]): number {
  return ms.filter((m) => !(RESULTS as readonly string[]).includes(m.kind) || m.kind === 'rebuy').reduce((a, m) => a + m.ms, 0);
}

// ---------------------------------------------------------------- the public table
/** What the tracker reads from a table view (an engine View fits). */
export interface DramaView {
  handNo: number;
  players: readonly { id: string; stack: number; rebuysUsed?: number; busted?: boolean }[];
  hand: {
    ps: Readonly<Record<string, { total: number; streetBet: number; folded: boolean; allIn: boolean }>>;
    board: readonly string[];
    board2?: readonly string[] | null;
  } | null;
  rebuy?: { on: boolean; closed: boolean; max: number } | null;
}

interface HandTrack {
  handNo: number;
  start: Record<string, number>;
  pos: Record<string, Position>;
  committed: Record<string, number>;
  streetBet: Record<string, number>;
  currentBet: number;
  /** The latest bet that puts pressure on the street (an all-in or a big bet), and who made it. */
  pressure: { kind: 'allin' | 'bigbet'; by: string } | null;
  aggressor: string | null;
  allInPlayers: Set<string>;
  scenes: number;
  bigUsed: Set<string>;
  foldUsed: Set<string>;
  streetAllin: { opener: boolean; answer: boolean };
  board: string[];
  revealBoard: string[] | null;
  shown: Record<string, string[]>;
  act1: { pid: string; kind: InHandKind; variant?: 'call' | 'raise' }[];
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** Preflop strength from two cards everyone can see (a pair beats any two; then high card, then kicker). */
function holeScore(cards: readonly string[]): number {
  const r = cards.map((c) => '23456789TJQKA'.indexOf(c[0]!)).sort((a, b) => b - a);
  if (r.length < 2) return -1;
  return r[0] === r[1] ? 1000 + r[0]! : r[0]! * 15 + r[1]!;
}
function strength(cards: readonly string[], board: readonly string[]): number {
  if (board.length < 3) return holeScore(cards);
  return evalBest([...cards, ...board].map(parseCard))?.score ?? -1;
}

/**
 * Was `winner` behind every other shown hand's made hand when the hands were turned face up, and still not ahead
 * after the flop, so that the turn or river won it? Only face-up cards are used.
 */
export function isComeback(winner: string, shown: Readonly<Record<string, readonly string[]>>, revealBoard: readonly string[], finalBoard: readonly string[]): boolean {
  const mine = shown[winner];
  const others = Object.keys(shown).filter((p) => p !== winner);
  if (!mine || !others.length || revealBoard.length >= 5 || finalBoard.length < 5) return false;
  const behind = (board: readonly string[]): boolean => {
    const me = strength(mine, board);
    return others.some((o) => strength(shown[o]!, board) > me);
  };
  if (!behind(revealBoard)) return false;
  // still behind on every board before the turn (the flop, if it came after the reveal)
  if (revealBoard.length < 3 && behind(finalBoard.slice(0, 3)) === false) return false;
  return true;
}

export function pileTier(net: number, startStack: number): PileTier {
  const r = startStack > 0 ? net / startStack : 3.01;
  return r < 1 ? 0 : r <= 3 ? 1 : 2;
}

/**
 * Follows one table, update by update, and says which moments each update produced (in order). One tracker per
 * table; feed it every update's events with the view after them.
 */
export class DramaTracker {
  private h: HandTrack | null = null;
  /** The biggest pot seen tonight, and how many hands this tracker has seen end. */
  biggest = 0;
  ended = 0;

  feed(events: readonly GameEvent[], v: DramaView): Moment[] {
    const out: Moment[] = [];
    // awarded in this update (so a hand that starts and ends in one update still knows its start stacks)
    const awarded: Record<string, number> = {};
    for (const e of events) if (e.t === 'win') for (const p of e.results.pots) for (const a of p.awards) awarded[a.pid] = (awarded[a.pid] ?? 0) + a.amount;
    const refunded: Record<string, number> = {};
    for (const e of events) if (e.t === 'refund') refunded[e.pid] = (refunded[e.pid] ?? 0) + e.amount;
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      switch (e.t) {
        case 'handStart': this.begin(e.handNo, v, awarded, refunded, true); break;
        case 'ante': case 'blind': this.commit(e.pid, e.amount, e.t === 'blind' ? e.amount : 0); break;
        case 'refund': { const h = this.h; if (h) { h.committed[e.pid] = (h.committed[e.pid] ?? 0) - e.amount; h.streetBet[e.pid] = (h.streetBet[e.pid] ?? 0) - e.amount; } break; }
        case 'street': {
          const h = this.ensure(v);
          if (!h || e.board === 2) break;
          h.board.push(...e.cards);
          h.streetBet = {}; h.currentBet = 0; h.pressure = null; h.aggressor = null; h.streetAllin = { opener: false, answer: false };
          break;
        }
        case 'reveal': {
          const h = this.ensure(v);
          if (!h) break;
          if (!h.revealBoard) h.revealBoard = h.board.slice();
          Object.assign(h.shown, e.cards);
          break;
        }
        case 'act': {
          const h = this.ensure(v);
          if (!h) break;
          const next = events.slice(i + 1).find((x): x is Extract<GameEvent, { t: 'turn' }> => x.t === 'turn');
          const m = this.act(h, e, next?.pid ?? null);
          if (m) out.push(m);
          break;
        }
        case 'win': { const m = this.result(e.results, v, awarded); if (m) out.push(m); break; }
        case 'rebuy': {
          const stacks = Object.fromEntries(v.players.filter((p) => p.stack > 0).map((p) => [p.id, p.stack]));
          const pos = positions(stacks)[e.pid] ?? 'desperate';
          out.push({ kind: 'rebuy', handNo: v.handNo, pid: e.pid, role: 'opener', position: pos, target: null, followUp: false, ms: SCENE_MS.rebuy });
          break;
        }
        case 'undo': break;
        default: break;
      }
    }
    return out;
  }

  /** The hand's start, from the view (stack + chips put in, less anything won or refunded in this update). */
  private begin(handNo: number, v: DramaView, awarded: Record<string, number>, refunded: Record<string, number>, fresh: boolean): HandTrack | null {
    if (!v.hand) { this.h = null; return null; }
    const start: Record<string, number> = {};
    for (const pid of Object.keys(v.hand.ps)) {
      const p = v.players.find((x) => x.id === pid);
      if (!p) continue;
      start[pid] = p.stack + v.hand.ps[pid]!.total - (awarded[pid] ?? 0) + (refunded[pid] ?? 0);
    }
    const h: HandTrack = {
      handNo, start, pos: positions(start), committed: {}, streetBet: {}, currentBet: 0, pressure: null, aggressor: null,
      allInPlayers: new Set(), scenes: 0, bigUsed: new Set(), foldUsed: new Set(), streetAllin: { opener: false, answer: false },
      board: [], revealBoard: null, shown: {}, act1: [],
    };
    if (!fresh) {
      // joined mid-hand (a reconnect, a restarted server): carry on from what the view shows now
      for (const [pid, hp] of Object.entries(v.hand.ps)) {
        h.committed[pid] = hp.total; h.streetBet[pid] = hp.streetBet;
        if (hp.allIn) h.allInPlayers.add(pid);
      }
      h.currentBet = Math.max(0, ...Object.values(h.streetBet));
      h.board = v.hand.board.slice();
    }
    this.h = h;
    return h;
  }

  private ensure(v: DramaView): HandTrack | null {
    if (this.h && this.h.handNo === v.handNo) return this.h;
    return this.begin(v.handNo, v, {}, {}, false);
  }

  private commit(pid: string, amount: number, streetAmount: number): void {
    const h = this.h;
    if (!h) return;
    h.committed[pid] = (h.committed[pid] ?? 0) + amount;
    if (streetAmount) {
      h.streetBet[pid] = (h.streetBet[pid] ?? 0) + streetAmount;
      h.currentBet = Math.max(h.currentBet, h.streetBet[pid]!);
    }
  }

  private act(h: HandTrack, e: Extract<GameEvent, { t: 'act' }>, nextPid: string | null): Moment | null {
    const pid = e.pid;
    const startStack = h.start[pid] ?? 0;
    const stackBefore = startStack - (h.committed[pid] ?? 0);
    const amt = e.amount ?? 0;
    const facing = h.currentBet > (h.streetBet[pid] ?? 0);
    const pressure = h.pressure && h.pressure.by !== pid ? h.pressure : null;
    const to = e.to ?? (h.streetBet[pid] ?? 0) + amt;
    const raised = (e.a === 'bet' || e.a === 'raise' || e.a === 'allin') && to > h.currentBet;
    const prevAggressor = h.aggressor && h.aggressor !== pid ? h.aggressor : null;
    let kind: InHandKind | null = null;
    let role: Role = 'opener';
    let variant: 'call' | 'raise' | undefined;
    let target: string | null = null;

    if (e.a === 'fold') {
      if (pressure && facing && (h.committed[pid] ?? 0) >= startStack / 4 && !h.foldUsed.has(pid)) {
        kind = 'fold'; role = 'answerer'; target = pressure.by; h.foldUsed.add(pid);
      }
    } else if (e.a === 'check') {
      // nothing
    } else {
      const allIn = e.a === 'allin';
      if (allIn) {
        if (pressure?.kind === 'allin' && facing) { kind = 'allinAnswered'; role = 'answerer'; variant = raised ? 'raise' : 'call'; target = pressure.by; }
        else if (!raised && pressure?.kind === 'bigbet') { kind = 'bigBetAnswered'; role = 'answerer'; variant = 'call'; target = pressure.by; }
        else { kind = 'allin'; role = 'opener'; target = prevAggressor ?? nextPid; }
      } else if (e.a === 'call') {
        if (pressure?.kind === 'allin') { kind = 'allinAnswered'; role = 'answerer'; variant = 'call'; target = pressure.by; }
        else if (amt >= stackBefore * 0.75 && stackBefore > 0) { kind = 'bigBetAnswered'; role = 'answerer'; variant = 'call'; target = pressure?.by ?? prevAggressor; }
      } else {
        // a bet or a raise that leaves chips behind
        const big = stackBefore > 0 && amt >= stackBefore * 0.75;
        if (pressure?.kind === 'allin') { kind = 'allinAnswered'; role = 'answerer'; variant = 'raise'; target = pressure.by; }
        else if (pressure?.kind === 'bigbet') { kind = 'bigBetAnswered'; role = 'answerer'; variant = 'raise'; target = pressure.by; }
        else if (big) { kind = 'bigBet'; role = 'opener'; target = prevAggressor ?? nextPid; }
      }
      // the street's state moves on
      h.committed[pid] = (h.committed[pid] ?? 0) + amt;
      h.streetBet[pid] = to;
      if (raised) { h.currentBet = to; h.aggressor = pid; }
      if (allIn) h.allInPlayers.add(pid);
      if (raised) {
        // the bet everyone now faces: an all-in, a big bet (or a re-raise over one), or an ordinary raise
        if (allIn) h.pressure = { kind: 'allin', by: pid };
        else if (pressure?.kind === 'allin') { /* a raise behind a short all-in: the all-in still stands */ }
        else if (pressure || (stackBefore > 0 && amt >= stackBefore * 0.75)) h.pressure = { kind: 'bigbet', by: pid };
        else h.pressure = null;
      }
    }
    if (!kind) return null;
    // limits: at most three in-hand scenes a hand; one big-bet (or big-call) scene per player per hand
    if (h.scenes >= MAX_IN_HAND) return null;
    if ((kind === 'bigBet' || kind === 'bigBetAnswered')) {
      if (h.bigUsed.has(pid)) return null;
      h.bigUsed.add(pid);
    }
    let followUp = false;
    if (kind === 'allin' || kind === 'allinAnswered') {
      const slot = kind === 'allin' ? 'opener' : 'answer';
      if (h.streetAllin[slot]) followUp = true;
      h.streetAllin[slot] = true;
    }
    h.scenes++;
    h.act1.push({ pid, kind, ...(variant ? { variant } : {}) });
    const tp = target && target !== pid ? target : null;
    return {
      kind, handNo: h.handNo, pid, role, position: h.pos[pid] ?? 'contender', ...(variant ? { variant } : {}),
      target: tp ? { pid: tp, position: h.pos[tp] ?? 'contender' } : null,
      followUp, ms: followUp ? FOLLOW_UP_MS : SCENE_MS[kind],
    };
  }

  private result(R: Extract<GameEvent, { t: 'win' }>['results'], v: DramaView, awarded: Record<string, number>): Moment | null {
    const h = this.h && this.h.handNo === v.handNo ? this.h : this.ensure(v);
    this.ended++;
    const pot = sum(R.pots.map((p) => p.amount));
    const earlier = this.ended > 3;
    const crown = earlier && pot > this.biggest;
    this.biggest = Math.max(this.biggest, pot);
    if (!h || !R.showdown) return null;
    const start = h.start;
    const anyAllIn = h.allInPlayers.size > 0 || Object.values(v.hand?.ps ?? {}).some((p) => p.allIn);
    const winners = Object.keys(awarded).sort((a, b) => awarded[b]! - awarded[a]!);
    const main = R.pots[0];
    const mainWinners = [...new Set(main?.awards.map((a) => a.pid) ?? [])];
    const isSplit = mainWinners.length > 1;
    const star = mainWinners.sort((a, b) => (awarded[b] ?? 0) - (awarded[a] ?? 0))[0] ?? winners[0];
    if (!star) return null;
    const involved = [...new Set([...winners, ...Object.keys(R.evals)])];
    const stackOf = (pid: string) => v.players.find((p) => p.id === pid)?.stack ?? 0;
    const cast: CastMember[] = involved.map((pid) => {
      const won = awarded[pid] ?? 0;
      const net = won - (h.committed[pid] ?? v.hand?.ps[pid]?.total ?? 0);
      const outcome: Outcome = won > 0 ? (isSplit && mainWinners.includes(pid) ? 'split' : 'won') : stackOf(pid) === 0 ? 'out' : 'lost';
      return { pid, position: h.pos[pid] ?? 'contender', outcome, amount: won, pile: won > 0 ? pileTier(Math.max(0, net), start[pid] ?? 0) : null };
    }).sort((a, b) => b.amount - a.amount);
    const knockedOut = cast.some((c) => c.outcome === 'out');
    const r = v.rebuy;
    const canRebuy = (pid: string) => !!r?.on && !r.closed && (r.max === 0 || (v.players.find((p) => p.id === pid)?.rebuysUsed ?? 0) < r.max);
    const alive = v.players.filter((p) => p.stack > 0);
    const last = knockedOut && alive.length === 1 && !v.players.some((p) => p.stack === 0 && canRebuy(p.id));
    let kind: ResultKind | null = null;
    if (last) kind = 'lastStanding';
    else if (anyAllIn) {
      if (isSplit) kind = 'split';
      else if (!R.twice && h.revealBoard && isComeback(star, h.shown, h.revealBoard, v.hand?.board ?? h.board)) kind = 'comeback';
      else kind = 'allinResult';
    } else if (pot >= (start[star] ?? Infinity) * 0.75) kind = isSplit ? 'split' : 'bigPot';
    if (!kind) return null;
    const mine = cast.find((c) => c.pid === star)!;
    const others = cast.filter((c) => c.pid !== star);
    const tgt = others.find((c) => c.outcome === 'out') ?? others.find((c) => c.outcome === 'split') ?? others[0] ?? null;
    return {
      kind, handNo: v.handNo, pid: star, role: 'opener', position: mine.position,
      target: tgt ? { pid: tgt.pid, position: tgt.position } : null,
      followUp: false, ms: SCENE_MS[kind], cast, crown, act1: h.act1.slice(),
    };
  }
}
