// What the checker reads. A finished hand is boiled down to plain facts (cards as "As", chips as numbers,
// one line per action), so the rules in hand.ts can be read and tested without an engine in the way.
// `factsFromRecord` makes those facts from the stored hand record (the table just before the hand plus
// every input: private.hand_records in the database, Engine.lastHandRecord on a table server) by
// replaying it with the rules engine, so it sees exactly what the table saw.
import { Engine, cardStr, type HandRecord } from '@tp/engine';

export type Pid = string;
export type StreetName = 'preflop' | 'flop' | 'turn' | 'river';

export interface ActionFact {
  pid: Pid;
  street: StreetName;
  /** An all-in is filed as what it did: a call, a bet or a raise (see `allIn`). */
  kind: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  /** Chips this action added to the pot. */
  put: number;
  /** What the player had to call before acting (0: nobody had bet). */
  toCall: number;
  /** The action left the player all-in. */
  allIn: boolean;
  /** The clock ran out and the table acted for the player (a timeout). */
  auto: boolean;
  /** Board cards face up when the player acted: 0, 3, 4 or 5. */
  board: number;
}

export interface HandFacts {
  game: string;
  handNo: number;
  /** When the hand ended, ms since 1970. */
  endedAt: number;
  bb: number;
  /** Everyone dealt in, in acting order. */
  order: Pid[];
  /** Both hole cards of every player dealt in (never sent to a phone: the checker runs on the server). */
  hole: Record<Pid, string[]>;
  board: string[];
  /** The second board when the hand was dealt twice. */
  board2: string[] | null;
  actions: ActionFact[];
  /** Players whose cards were turned up at a showdown (empty when the hand was won by folds). */
  showdown: Pid[];
  /** Chips each player was paid from the pots (not counting an uncalled bet coming back). */
  awards: Record<Pid, number>;
  /** All the pots together. */
  pot: number;
  stackBefore: Record<Pid, number>;
  stackAfter: Record<Pid, number>;
  /** Chips each player had bought in for when the hand began (the first buy-in plus rebuys). */
  buyins: Record<Pid, number>;
  /** How often each player peeked at their cards in this hand. The server does not get this yet: the
   * phone must report it with each action (plan: "card peeks for Trust Issues"). Without it Trust Issues
   * is never given. */
  peeks?: Record<Pid, number>;
}

/** The facts of one hand from its stored record. Throws when the record does not replay. */
export function factsFromRecord(rec: HandRecord, extra: { peeks?: Record<Pid, number> } = {}): HandFacts {
  const e = Engine.fromSnapshot({ ...rec.before, hand: null, log: [] });
  const actions: ActionFact[] = [];
  for (const input of rec.inputs) {
    const h0 = e.s.hand;
    const live = h0 && e.s.phase === 'hand' ? h0 : null;
    const pre = live ? { street: live.street, bet: live.currentBet, board: live.board.length, toAct: live.toAct, mine: live.toAct ? (live.ps[live.toAct]?.streetBet ?? 0) : 0, stack: live.toAct ? (e.player(live.toAct)?.stack ?? 0) : 0 } : null;
    const r = e.apply(input);
    if (r.error) throw new Error(`hand ${rec.handNo} does not replay: ${r.error}`);
    if (!pre) continue; // the 'start' input itself (blinds are not actions)
    for (const ev of r.events ?? []) {
      if (ev.t !== 'act') continue;
      const raised = ev.a === 'bet' || ev.a === 'raise' || (ev.a === 'allin' && (ev.to ?? 0) > pre.bet);
      const kind: ActionFact['kind'] = ev.a === 'fold' || ev.a === 'check' ? ev.a : raised ? (pre.bet === 0 ? 'bet' : 'raise') : 'call';
      actions.push({
        pid: ev.pid, street: pre.street, kind, put: ev.amount ?? 0, toCall: Math.min(Math.max(pre.bet - pre.mine, 0), pre.stack),
        allIn: ev.a === 'allin', auto: ev.auto === true, board: pre.board,
      });
    }
  }
  const h = e.s.hand;
  if (!h || !h.results) throw new Error(`hand ${rec.handNo} did not finish`);
  const before = new Map(rec.before.players.map((p) => [p.id, p]));
  const after = new Map(e.s.players.concat(e.s.departed ?? []).map((p) => [p.id, p]));
  const f: HandFacts = {
    game: rec.gameId, handNo: rec.handNo, endedAt: rec.endedAt, bb: e.s.level.bb,
    order: h.order.slice(), hole: {}, board: h.board.map(cardStr), board2: h.board2 ? h.board2.map(cardStr) : null,
    actions, showdown: h.results.showdown ? h.order.filter((pid) => !h.ps[pid]!.folded) : [],
    awards: {}, pot: h.results.pots.reduce((s, p) => s + p.amount, 0), stackBefore: {}, stackAfter: {}, buyins: {},
  };
  for (const pid of h.order) {
    f.hole[pid] = h.ps[pid]!.cards.map(cardStr);
    f.stackBefore[pid] = before.get(pid)?.stack ?? 0;
    f.stackAfter[pid] = after.get(pid)?.stack ?? 0;
    f.buyins[pid] = before.get(pid)?.buyins ?? 0;
  }
  for (const pot of h.results.pots) for (const a of pot.awards) f.awards[a.pid] = (f.awards[a.pid] ?? 0) + a.amount;
  if (extra.peeks) f.peeks = extra.peeks;
  return f;
}

/** One achievement one player earned. */
export interface Earned {
  id: string;
  pid: Pid;
  /** Counted achievements (Stone Cold Bluff, Regular): which tier this is, from 1. */
  tier?: number;
  /** 'now': tell the player straight away. 'night': hold it for the night summary, because it rests on
   * cards nobody showed (Great Fold) or is only known when the night or season is over. */
  reveal: 'now' | 'night';
  game: string | null;
  hand: number | null;
  /** When it was earned, ms since 1970. */
  at: number;
  /** Extra words for the page, e.g. Nemesis: whose problem. */
  detail?: Record<string, string | number>;
}

/** The player's own counts before tonight, for the counted achievements. */
export interface Career { hands: number; bluffs: number }

/** What the checker knows about the night when a hand ends. */
export interface NightSoFar {
  /** The earlier hands of this game, oldest first. */
  hands: HandFacts[];
  /** Counts from before this game. Left out, they count as 0 (so tiers would be given too early: a
   * table server must pass them). */
  career?: Record<Pid, Career>;
  /** What each player already has ("quads", or "regular:2" for a tier), earlier tonight included, so
   * nothing is announced twice. */
  owned?: Record<Pid, readonly string[]>;
}
