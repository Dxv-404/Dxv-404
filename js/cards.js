// Cards are integers 0..51. rank = c >> 2 (0 = deuce .. 12 = ace), suit = c & 3.
export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc'; // spades, hearts, diamonds, clubs
export const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const RANK_NAME = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
export const RANK_PLURAL = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

export const rankOf = (c) => c >> 2;
export const suitOf = (c) => c & 3;
export const cardStr = (c) => RANKS[c >> 2] + SUITS[c & 3];
export const parseCard = (s) => (RANKS.indexOf(s[0]) << 2) | SUITS.indexOf(s[1]);

export function freshDeck() {
  const d = [];
  for (let i = 0; i < 52; i++) d.push(i);
  return d;
}

function randInt(n) {
  // unbiased integer in [0, n) using crypto
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n;
  let x;
  do { globalThis.crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
  return x % n;
}

export function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ---------- Hand evaluation ----------
export const CATEGORY = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush',
];

// Score a 5-card hand. Higher is better. Returns { score, cat, ranks } where
// ranks are the tiebreak ranks in significance order.
export function eval5(cards) {
  const r = cards.map(rankOf).sort((a, b) => b - a);
  const s = cards.map(suitOf);
  const flush = s.every((x) => x === s[0]);
  const counts = new Map();
  for (const x of r) counts.set(x, (counts.get(x) || 0) + 1);
  // groups sorted by count desc then rank desc
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  let straightHigh = -1;
  if (counts.size === 5) {
    if (r[0] - r[4] === 4) straightHigh = r[0];
    else if (r[0] === 12 && r[1] === 3 && r[4] === 0) straightHigh = 3; // wheel A-2-3-4-5
  }
  let cat, ranks;
  if (straightHigh >= 0 && flush) { cat = straightHigh === 12 ? 9 : 8; ranks = [straightHigh]; }
  else if (groups[0][1] === 4) { cat = 7; ranks = [groups[0][0], groups[1][0]]; }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { cat = 6; ranks = [groups[0][0], groups[1][0]]; }
  else if (flush) { cat = 5; ranks = r; }
  else if (straightHigh >= 0) { cat = 4; ranks = [straightHigh]; }
  else if (groups[0][1] === 3) { cat = 3; ranks = groups.map((g) => g[0]); }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { cat = 2; ranks = groups.map((g) => g[0]); }
  else if (groups[0][1] === 2) { cat = 1; ranks = groups.map((g) => g[0]); }
  else { cat = 0; ranks = r; }
  // royal flush shares the straight-flush scale so comparisons stay correct
  let score = (cat === 9 ? 8 : cat);
  for (let i = 0; i < 5; i++) score = score * 13 + (ranks[i] ?? 0);
  return { score, cat, ranks };
}

const COMBOS = {};
function combos(n) {
  if (COMBOS[n]) return COMBOS[n];
  const out = [];
  const rec = (start, acc) => {
    if (acc.length === 5) { out.push(acc.slice()); return; }
    for (let i = start; i < n; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return (COMBOS[n] = out);
}

// Best 5 of 5..7 cards.
export function evalBest(cards) {
  if (cards.length < 5) return null;
  let best = null;
  for (const idx of combos(cards.length)) {
    const hand = idx.map((i) => cards[i]);
    const e = eval5(hand);
    if (!best || e.score > best.score) best = { ...e, cards: hand };
  }
  best.name = CATEGORY[best.cat];
  best.desc = describe(best);
  return best;
}

export function describe(e) {
  const R = e.ranks;
  switch (e.cat) {
    case 9: return 'Royal Flush';
    case 8: return `Straight Flush, ${RANK_NAME[R[0]]} high`;
    case 7: return `Four of a Kind, ${RANK_PLURAL[R[0]]}`;
    case 6: return `Full House, ${RANK_PLURAL[R[0]]} full of ${RANK_PLURAL[R[1]]}`;
    case 5: return `Flush, ${RANK_NAME[R[0]]} high`;
    case 4: return `Straight, ${RANK_NAME[R[0]]} high`;
    case 3: return `Three of a Kind, ${RANK_PLURAL[R[0]]}`;
    case 2: return `Two Pair, ${RANK_PLURAL[R[0]]} and ${RANK_PLURAL[R[1]]}`;
    case 1: return `Pair of ${RANK_PLURAL[R[0]]}`;
    default: return `${RANK_NAME[R[0]]} high`;
  }
}

// Describe the best hand from any number of known cards (2..7), for the live hint.
export function describePartial(cards) {
  if (cards.length >= 5) return evalBest(cards).desc;
  const r = cards.map(rankOf).sort((a, b) => b - a);
  const counts = new Map();
  for (const x of r) counts.set(x, (counts.get(x) || 0) + 1);
  const g = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (g[0][1] === 4) return `Four of a Kind, ${RANK_PLURAL[g[0][0]]}`;
  if (g[0][1] === 3) return `Three of a Kind, ${RANK_PLURAL[g[0][0]]}`;
  if (g[0][1] === 2 && g[1] && g[1][1] === 2) return `Two Pair, ${RANK_PLURAL[g[0][0]]} and ${RANK_PLURAL[g[1][0]]}`;
  if (g[0][1] === 2) return `Pair of ${RANK_PLURAL[g[0][0]]}`;
  return `${RANK_NAME[r[0]]} high`;
}
