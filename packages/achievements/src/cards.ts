// Card helpers for the rules: strength of a hand at any moment of a hand, draws, the nuts on a board.
import { RANKS, evalBest, parseCard, rankOf, suitOf, freshDeck, type Card } from '@tp/engine';

export const parse = (cards: readonly string[]): Card[] => cards.map(parseCard);

/** Best five of hole + board: its score (higher wins), category 0..9 and ranks. Null before the flop. */
export function best(hole: readonly string[], board: readonly string[]): { score: number; cat: number; ranks: number[] } | null {
  const b = evalBest(parse([...hole, ...board]));
  return b ? { score: b.score, cat: b.cat, ranks: b.ranks } : null;
}

/** Category of any 2 to 7 cards (pairs and sets count before there are five). */
export function catOf(cards: readonly string[]): number {
  if (cards.length >= 5) return evalBest(parse(cards))!.cat;
  const n = new Map<number, number>();
  for (const c of parse(cards)) n.set(rankOf(c), (n.get(rankOf(c)) ?? 0) + 1);
  const g = [...n.values()].sort((a, b) => b - a);
  return g[0] === 4 ? 7 : g[0] === 3 ? 3 : g[0] === 2 && g[1] === 2 ? 2 : g[0] === 2 ? 1 : 0;
}

/** How strong a hand is right now, comparable between players on the same board. Before the flop there
 * are only two cards: a pair beats no pair, then the higher cards. (A made-hand comparison, not equity.) */
export function madeNow(hole: readonly string[], board: readonly string[]): number {
  const b = best(hole, board);
  if (b) return b.score;
  const r = parse(hole).map(rankOf).sort((x, y) => y - x);
  return r[0] === r[1] ? 1000 + r[0]! : r[0]! * 13 + r[1]!;
}

export const isPocketPair = (hole: readonly string[]): boolean => hole.length === 2 && hole[0]!.charAt(0) === hole[1]!.charAt(0);

/** "AKs", "72o", "77": the starting hand as players name it. */
export function startingHand(hole: readonly string[]): string {
  const [a, b] = parse(hole).sort((x, y) => rankOf(y) - rankOf(x)) as [Card, Card];
  const s = RANKS.charAt(rankOf(a)) + RANKS.charAt(rankOf(b));
  return rankOf(a) === rankOf(b) ? s : s + (suitOf(a) === suitOf(b) ? 's' : 'o');
}

/** No pair and no draw: the hole cards pair nothing, make no straight or flush, and (with cards to come)
 * are not four to a flush or four to a straight (open-ended or gutshot) either. */
export function nothing(hole: readonly string[], board: readonly string[]): boolean {
  if (board.length < 3 || isPocketPair(hole)) return false;
  const hr = parse(hole).map(rankOf), br = parse(board).map(rankOf);
  if (hr.some((r) => br.includes(r))) return false;
  const all = [...hole, ...board];
  if (catOf(all) > catOf(board)) return false; // only a straight or a flush could have done that
  if (board.length === 5) return true;
  for (let s = 0; s < 4; s++) {
    if (parse(hole).some((c) => suitOf(c) === s) && parse(all).filter((c) => suitOf(c) === s).length >= 4) return false;
  }
  const has = (ranks: number[], r: number): boolean => ranks.includes(r === -1 ? 12 : r); // the ace also plays low
  for (let lo = -1; lo <= 8; lo++) {
    let withHole = 0, boardOnly = 0;
    for (let r = lo; r < lo + 5; r++) { if (has(hr, r) || has(br, r)) withHole++; if (has(br, r)) boardOnly++; }
    if (withHole >= 4 && boardOnly < 4) return false;
  }
  return true;
}

/** Is this the second-best hand anyone could hold on this five-card board? Exactly one better hand must
 * be possible. Stops as soon as two better ones are found, so an ordinary losing hand costs almost nothing. */
export function isSecondBest(hole: readonly string[], board: readonly string[]): boolean {
  const b = parse(board);
  const mine = evalBest([...parse(hole), ...b])!.score;
  const rest = freshDeck().filter((c) => !b.includes(c));
  let better = -1;
  for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
    const s = evalBest([rest[i]!, rest[j]!, ...b])!.score;
    if (s <= mine || s === better) continue;
    if (better >= 0) return false;
    better = s;
  }
  return better >= 0;
}

/** The India-time hour (0..23) and day number (days since 1970 in India time) of a moment. India has no
 * summer time: always UTC+5:30. */
const IST = 5.5 * 3_600_000;
export const istHour = (ms: number): number => Math.floor((((ms + IST) % 86_400_000) + 86_400_000) % 86_400_000 / 3_600_000);
export const istDay = (ms: number): number => Math.floor((ms + IST) / 86_400_000);
/** Weeks run Monday to Sunday in India time (1 January 1970 was a Thursday). */
export const istWeek = (ms: number): number => Math.floor((istDay(ms) + 3) / 7);
