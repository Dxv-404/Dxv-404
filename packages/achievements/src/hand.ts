// The achievements a finished hand can earn. One small rule per achievement, each reading only the facts
// of the hand (facts.ts) and, where it needs them, the earlier hands of the night. Nothing here knows
// about servers, databases or screens.
//
// Words used the same way throughout:
//   "won"       was paid from a pot and ended the hand with more chips than before it
//   "lost"      reached the showdown and was paid nothing
//   "raised"    made a bet or a raise (an all-in that only calls is a call)
//   "the board they saw"  the board cards face up when a player folded, or all of them
import { best, catOf, isPocketPair, istHour, isSecondBest, madeNow, nothing, startingHand } from './cards';
import { ACHIEVEMENT } from './defs';
import type { ActionFact, Earned, HandFacts, NightSoFar, Pid } from './facts';

export const PEEKS_FOR_TRUST_ISSUES = 20;
/** Double Up needs a real stack to double: at least this many big blinds before the hand. */
export const DOUBLE_UP_MIN_BB = 10;
/** Night Owl: a hand that ends from 2:00 to 4:59 in the morning, India time. */
export const NIGHT_OWL_HOURS: readonly [number, number] = [2, 5];

const net = (h: HandFacts, p: Pid): number => (h.stackAfter[p] ?? 0) - (h.stackBefore[p] ?? 0);
export const wonHand = (h: HandFacts, p: Pid): boolean => (h.awards[p] ?? 0) > 0 && net(h, p) > 0;
const lostShowdown = (h: HandFacts, p: Pid): boolean => h.showdown.includes(p) && !(h.awards[p] ?? 0);
const acts = (h: HandFacts, p: Pid): ActionFact[] => h.actions.filter((a) => a.pid === p);
const raised = (a: ActionFact): boolean => a.kind === 'bet' || a.kind === 'raise';
/** The board a player saw: up to their fold, or all that was dealt. */
function seen(h: HandFacts, p: Pid, board: readonly string[] = h.board): string[] {
  const fold = h.actions.find((a) => a.pid === p && a.kind === 'fold');
  return board.slice(0, fold ? fold.board : board.length);
}
const boards = (h: HandFacts): string[][] => (h.board2 ? [h.board, h.board2] : [h.board]);
/** The player's best hand on any board they saw, when their own cards are part of it. `by` says what
 * "part of it" means: 'cat' (the board alone is a lower kind of hand: quads on the board are nobody's
 * quads) or 'score' (the board alone is simply worse). */
function ownBest(h: HandFacts, p: Pid, ok: (b: { score: number; cat: number; ranks: number[] }) => boolean, by: 'cat' | 'score' = 'cat'): boolean {
  return boards(h).some((bd) => {
    const s = seen(h, p, bd);
    const b = best(h.hole[p]!, s);
    if (!b || !ok(b)) return false;
    return by === 'cat' ? catOf(s) < b.cat : s.length < 5 || best([], s)!.score < b.score;
  });
}

// ---------------------------------------------------------------- the cards you hold
const quads = (h: HandFacts, p: Pid): boolean => wonHand(h, p) && ownBest(h, p, (b) => b.cat === 7);
const straightFlush = (h: HandFacts, p: Pid): boolean => ownBest(h, p, (b) => b.cat >= 8);
const royal = (h: HandFacts, p: Pid): boolean => ownBest(h, p, (b) => b.cat === 9);
const wheel = (h: HandFacts, p: Pid): boolean => wonHand(h, p) && ownBest(h, p, (b) => (b.cat === 4 || b.cat === 8) && b.ranks[0] === 3);
function sevenDeuce(h: HandFacts, p: Pid): boolean {
  const [a, b] = h.hole[p]!;
  return wonHand(h, p) && [a!.charAt(0), b!.charAt(0)].sort().join('') === '27' && a!.charAt(1) !== b!.charAt(1);
}
function setMining(h: HandFacts, p: Pid): boolean {
  const hole = h.hole[p]!;
  if (!isPocketPair(hole) || h.board.length < 3 || seen(h, p).length < 3) return false;
  return h.board.slice(0, 3).some((c) => c.charAt(0) === hole[0]!.charAt(0));
}
const pocketRockets = (h: HandFacts, p: Pid): boolean => lostShowdown(h, p) && h.hole[p]!.every((c) => c.charAt(0) === 'A');
const cooler = (h: HandFacts, p: Pid): boolean => lostShowdown(h, p) && ownBest(h, p, (b) => b.cat >= 6, 'score');
function boardPlays(h: HandFacts, p: Pid): boolean {
  if (h.showdown.length < 2 || !h.showdown.includes(p) || h.board.length < 5 || h.board2 || !(h.awards[p] ?? 0)) return false;
  const table = best([], h.board)!.score;
  return h.showdown.every((q) => best(h.hole[q]!, h.board)!.score === table);
}

// ---------------------------------------------------------------- how you play
/** Bet with nothing after the flop, and everyone folded. */
export function stoneColdBluff(h: HandFacts, p: Pid): boolean {
  if (h.showdown.length || !wonHand(h, p)) return false;
  const last = [...h.actions].reverse().find(raised);
  if (!last || last.pid !== p || last.board < 3) return false;
  return nothing(h.hole[p]!, h.board.slice(0, last.board));
}
function heroCall(h: HandFacts, p: Pid): boolean {
  if (!h.showdown.includes(p) || !wonHand(h, p) || h.board2) return false;
  const last = acts(h, p).at(-1);
  if (!last || last.kind !== 'call' || last.street !== 'river' || last.toCall <= 0) return false;
  return best(h.hole[p]!, h.board)!.cat <= 1;
}
/** The fold, and the player whose bet was folded to, when it was a great one. */
function greatFold(h: HandFacts, p: Pid): { bettor: Pid } | null {
  const i = h.actions.findIndex((a) => a.pid === p && a.kind === 'fold');
  const fold = h.actions[i];
  if (!fold || fold.toCall <= 0 || fold.board < 3) return null;
  const bet = h.actions.slice(0, i).reverse().find((a) => raised(a) && a.street === fold.street && a.pid !== p);
  if (!bet) return null;
  const bd = h.board.slice(0, fold.board);
  const mine = best(h.hole[p]!, bd)!;
  // two pair or better of their own: a pair in the hand with a pair on the board is not a hand anyone is proud to fold
  if (mine.cat < Math.max(2, catOf(bd) + 2)) return null;
  return best(h.hole[bet.pid]!, bd)!.score > mine.score ? { bettor: bet.pid } : null;
}
function checkRaise(h: HandFacts, p: Pid): boolean {
  if (!wonHand(h, p)) return false;
  const mine = acts(h, p);
  return mine.some((a, i) => a.kind === 'check' && mine.slice(i + 1).some((b) => b.street === a.street && b.kind === 'raise'));
}
function theTrap(h: HandFacts, p: Pid): boolean {
  if (!wonHand(h, p) || h.pot <= 30 * h.bb || h.board.length < 3) return false;
  const onFlop = acts(h, p).filter((a) => a.street === 'flop');
  if (!onFlop.length || onFlop.some((a) => a.kind !== 'check' && a.kind !== 'call')) return false;
  const flop = h.board.slice(0, 3);
  const c = catOf([...h.hole[p]!, ...flop]);
  return c >= 3 && c > catOf(flop);
}
/** Someone else at the showdown had a better hand on these board cards. */
const behindOn = (h: HandFacts, p: Pid, bd: readonly string[]): boolean => {
  const mine = madeNow(h.hole[p]!, bd);
  return h.showdown.some((q) => q !== p && madeNow(h.hole[q]!, bd) > mine);
};
/** Needed both cards: behind on the flop, still behind with the turn alone and with the river alone. */
function runnerRunner(h: HandFacts, p: Pid): boolean {
  if (h.showdown.length < 2 || !h.showdown.includes(p) || !wonHand(h, p) || h.board.length < 5 || h.board2) return false;
  const flop = h.board.slice(0, 3);
  return behindOn(h, p, flop) && behindOn(h, p, [...flop, h.board[3]!]) && behindOn(h, p, [...flop, h.board[4]!]) && !behindOn(h, p, h.board);
}
function survivor(h: HandFacts, p: Pid): boolean {
  if (h.showdown.length < 2 || !h.showdown.includes(p) || !wonHand(h, p)) return false;
  const shove = acts(h, p).find((a) => a.allIn);
  return !!shove && shove.board < 5 && behindOn(h, p, h.board.slice(0, shove.board));
}
function tenHighHero(h: HandFacts, p: Pid): boolean {
  if (h.showdown.length < 2 || !h.showdown.includes(p) || !wonHand(h, p) || h.board.length < 5) return false;
  return boards(h).some((bd) => { const b = best(h.hole[p]!, bd)!; return b.cat === 0 && b.ranks[0]! <= 8; });
}
function secondBest(h: HandFacts, p: Pid): boolean {
  if (!lostShowdown(h, p) || h.board.length < 5 || h.board2) return false;
  return isSecondBest(h.hole[p]!, h.board);
}

// ---------------------------------------------------------------- your nights (the parts a hand decides)
const doubleUp = (h: HandFacts, p: Pid): boolean => {
  const b = h.stackBefore[p] ?? 0;
  return b >= DOUBLE_UP_MIN_BB * h.bb && (h.stackAfter[p] ?? 0) >= 2 * b;
};
/** Who knocked players out in this hand: whoever won the most from it gets every bust (ties share them). */
export function knockouts(h: HandFacts): Record<Pid, number> {
  const bust = h.order.filter((p) => (h.stackBefore[p] ?? 0) > 0 && (h.stackAfter[p] ?? 0) === 0).length;
  const out: Record<Pid, number> = {};
  if (!bust) return out;
  const top = Math.max(...h.order.map((p) => net(h, p)));
  if (top <= 0) return out;
  for (const p of h.order) if (net(h, p) === top) out[p] = bust;
  return out;
}
export const timedOut = (h: HandFacts, p: Pid): boolean => h.actions.some((a) => a.pid === p && a.auto);
const nightOwl = (h: HandFacts): boolean => { const hr = istHour(h.endedAt); return hr >= NIGHT_OWL_HOURS[0] && hr < NIGHT_OWL_HOURS[1]; };

/** Every achievement this hand earned, for every player dealt in. Hands of `night` must be the same game's
 * earlier hands, oldest first. */
export function checkHand(h: HandFacts, night: NightSoFar = { hands: [] }): Earned[] {
  const out: Earned[] = [];
  for (const p of h.order) {
    if (h.hole[p]?.length !== 2) continue;
    const owned = new Set(night.owned?.[p] ?? []);
    const give = (id: string, more: Partial<Earned> = {}): void => {
      if (!ACHIEVEMENT[id]) throw new Error(`unknown achievement ${id}`);
      if (owned.has(more.tier ? `${id}:${more.tier}` : id)) return;
      out.push({ id, pid: p, reveal: 'now', game: h.game, hand: h.handNo, at: h.endedAt, ...more });
    };
    /** A counted achievement: give every tier the count reaches with this hand. */
    const count = (id: string, before: number, add: number): void => {
      ACHIEVEMENT[id]!.tiers!.forEach((t, i) => { if (before < t.at && before + add >= t.at) give(id, { tier: i + 1 }); });
    };
    const mine = night.hands.filter((x) => x.order.includes(p)); // the hands this player was dealt, oldest first
    const career = night.career?.[p] ?? { hands: 0, bluffs: 0 };

    if (quads(h, p)) give('quads');
    if (straightFlush(h, p)) give('straight_flush');
    if (royal(h, p)) give('royal');
    if (wheel(h, p)) give('the_wheel');
    if (sevenDeuce(h, p)) give('seven_deuce');
    if (setMining(h, p)) give('set_mining');
    if (pocketRockets(h, p)) give('pocket_rockets');
    if (cooler(h, p)) give('cooler');
    if (boardPlays(h, p)) give('board_plays');

    if (stoneColdBluff(h, p)) count('stone_cold_bluff', career.bluffs + mine.filter((x) => stoneColdBluff(x, p)).length, 1);
    if (heroCall(h, p)) give('hero_call');
    const gf = greatFold(h, p);
    // the bettor's cards stay face down unless the hand went to a showdown: telling the folder now would show them
    if (gf) give('great_fold', { reveal: h.showdown.includes(gf.bettor) ? 'now' : 'night' });
    if (checkRaise(h, p)) give('check_raise');
    if (theTrap(h, p)) give('the_trap');
    if (runnerRunner(h, p)) give('runner_runner');
    if (survivor(h, p)) give('survivor');
    if (tenHighHero(h, p)) give('ten_high_hero');
    if (secondBest(h, p)) give('second_best');

    if (doubleUp(h, p)) give('double_up');
    const ko = knockouts(h)[p] ?? 0;
    if (ko) {
      const before = night.hands.reduce((s, x) => s + (knockouts(x)[p] ?? 0), 0);
      if (before < 3 && before + ko >= 3) give('bounty_hunter');
    }
    count('regular', career.hands + mine.length, 1);
    if (nightOwl(h)) give('night_owl');

    if ((h.peeks?.[p] ?? 0) >= PEEKS_FOR_TRUST_ISSUES) give('trust_issues');
    const prev = mine.at(-1);
    if (prev && wonHand(h, p) && wonHand(prev, p) && startingHand(h.hole[p]!) === startingHand(prev.hole[p]!)) give('same_again');
    if (timedOut(h, p) && mine.length >= 2 && mine.slice(-2).every((x) => timedOut(x, p))) give('gone_fishing');
  }
  return out;
}
