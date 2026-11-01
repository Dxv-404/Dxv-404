// Cards are integers 0..51. rank = c >> 2 (0 = deuce .. 12 = ace), suit = c & 3.
export type Card = number;

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc'; // spades, hearts, diamonds, clubs
export const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const RANK_NAME = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'] as const;
export const RANK_PLURAL = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'] as const;

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;
export const cardStr = (c: Card): string => RANKS.charAt(c >> 2) + SUITS.charAt(c & 3);

/** "As" -> card number. Throws on anything that is not a real card. */
export function parseCard(s: string): Card {
  const r = RANKS.indexOf(s.charAt(0));
  const u = SUITS.indexOf(s.charAt(1));
  if (s.length !== 2 || r < 0 || u < 0) throw new Error(`Not a card: ${s}`);
  return (r << 2) | u;
}

export function freshDeck(): Card[] {
  const d: Card[] = [];
  for (let i = 0; i < 52; i++) d.push(i);
  return d;
}

/** Source of uniform 32-bit random words. Defaults to the platform CSPRNG. */
export type RandomWords = (out: Uint32Array) => void;
interface WebCrypto { getRandomValues(a: Uint32Array): Uint32Array }
/** The platform CSPRNG (Web Crypto), available in browsers, Workers and Node 20+. */
export const cryptoWords: RandomWords = (out) => { (globalThis as unknown as { crypto: WebCrypto }).crypto.getRandomValues(out); };

/** Unbiased integer in [0, n) by rejection sampling. */
export function randInt(n: number, words: RandomWords = cryptoWords): number {
  if (!Number.isInteger(n) || n < 1 || n > 0x100000000) throw new Error(`randInt range: ${n}`);
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n;
  let x: number;
  do { words(buf); x = buf[0]!; } while (x >= limit);
  return x % n;
}

/** Fisher–Yates in place. */
export function shuffle<T>(deck: T[], words: RandomWords = cryptoWords): T[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randInt(i + 1, words);
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
  return deck;
}

// ---------- Hand evaluation ----------
export const CATEGORY = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush',
] as const;

export interface Eval5 { score: number; cat: number; ranks: number[] }
export interface EvalBest extends Eval5 { cards: Card[]; name: string; desc: string }

/** Score a 5-card hand. Higher is better. */
export function eval5(cards: Card[]): Eval5 {
  const r = cards.map(rankOf).sort((a, b) => b - a);
  const s = cards.map(suitOf);
  const flush = s.every((x) => x === s[0]);
  const counts = new Map<number, number>();
  for (const x of r) counts.set(x, (counts.get(x) ?? 0) + 1);
  // groups sorted by count desc then rank desc
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const g0 = groups[0]!, g1 = groups[1];
  let straightHigh = -1;
  if (counts.size === 5) {
    if (r[0]! - r[4]! === 4) straightHigh = r[0]!;
    else if (r[0] === 12 && r[1] === 3 && r[4] === 0) straightHigh = 3; // wheel A-2-3-4-5
  }
  let cat: number, ranks: number[];
  if (straightHigh >= 0 && flush) { cat = straightHigh === 12 ? 9 : 8; ranks = [straightHigh]; }
  else if (g0[1] === 4) { cat = 7; ranks = [g0[0], g1![0]]; }
  else if (g0[1] === 3 && g1![1] === 2) { cat = 6; ranks = [g0[0], g1![0]]; }
  else if (flush) { cat = 5; ranks = r; }
  else if (straightHigh >= 0) { cat = 4; ranks = [straightHigh]; }
  else if (g0[1] === 3) { cat = 3; ranks = groups.map((g) => g[0]); }
  else if (g0[1] === 2 && g1![1] === 2) { cat = 2; ranks = groups.map((g) => g[0]); }
  else if (g0[1] === 2) { cat = 1; ranks = groups.map((g) => g[0]); }
  else { cat = 0; ranks = r; }
  // royal flush shares the straight-flush scale so comparisons stay correct
  let score = cat === 9 ? 8 : cat;
  for (let i = 0; i < 5; i++) score = score * 13 + (ranks[i] ?? 0);
  return { score, cat, ranks };
}

const COMBOS: Record<number, number[][]> = {};
function combos(n: number): number[][] {
  const hit = COMBOS[n];
  if (hit) return hit;
  const out: number[][] = [];
  const rec = (start: number, acc: number[]): void => {
    if (acc.length === 5) { out.push(acc.slice()); return; }
    for (let i = start; i < n; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return (COMBOS[n] = out);
}

/** Best 5 of 5..7 cards. */
export function evalBest(cards: Card[]): EvalBest | null {
  if (cards.length < 5) return null;
  let best: (Eval5 & { cards: Card[] }) | null = null;
  for (const idx of combos(cards.length)) {
    const hand = idx.map((i) => cards[i]!);
    const e = eval5(hand);
    if (!best || e.score > best.score) best = { ...e, cards: hand };
  }
  const b = best!;
  const res: EvalBest = { ...b, name: CATEGORY[b.cat]!, desc: '' };
  res.desc = describe(res);
  return res;
}

export function describe(e: Eval5): string {
  const R = e.ranks;
  const n = (i: number): string => RANK_NAME[R[i]!]!;
  const p = (i: number): string => RANK_PLURAL[R[i]!]!;
  switch (e.cat) {
    case 9: return 'Royal Flush';
    case 8: return `Straight Flush, ${n(0)} high`;
    case 7: return `Four of a Kind, ${p(0)}`;
    case 6: return `Full House, ${p(0)} full of ${p(1)}`;
    case 5: return `Flush, ${n(0)} high`;
    case 4: return `Straight, ${n(0)} high`;
    case 3: return `Three of a Kind, ${p(0)}`;
    case 2: return `Two Pair, ${p(0)} and ${p(1)}`;
    case 1: return `Pair of ${p(0)}`;
    default: return `${n(0)} high`;
  }
}

/** Describe the best hand from any number of known cards (2..7), for the live hint. */
export function describePartial(cards: Card[]): string {
  if (cards.length >= 5) return evalBest(cards)!.desc;
  const r = cards.map(rankOf).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const x of r) counts.set(x, (counts.get(x) ?? 0) + 1);
  const g = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const g0 = g[0]!, g1 = g[1];
  if (g0[1] === 4) return `Four of a Kind, ${RANK_PLURAL[g0[0]]}`;
  if (g0[1] === 3) return `Three of a Kind, ${RANK_PLURAL[g0[0]]}`;
  if (g0[1] === 2 && g1 && g1[1] === 2) return `Two Pair, ${RANK_PLURAL[g0[0]]} and ${RANK_PLURAL[g1[0]]}`;
  if (g0[1] === 2) return `Pair of ${RANK_PLURAL[g0[0]]}`;
  return `${RANK_NAME[r[0]!]} high`;
}
