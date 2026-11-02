// Who won, and with what (design: tools/design/gen/v3results.py, v3motion.py, v3sys.py "Results").
//
// After a hand the table goes through these steps (the screen keeps time, render.ts draws each one):
//   runout  all-in before the river: the hands are up with their chances, the rest of the board comes slowly
//   scene   the theme's win scene, with the winner card rising in at 1 s
//   winner  back at the table: the winner's seat glows, their cards flip up, the best five lift, a pill names it
//   all     0.6 s later everyone else who reached the showdown turns over, 80 ms apart, each hand named
//   hold    the end state, until the next deal ("Next hand in N")
//   fold    everyone folded: no scene, no cards, a pill names the winner
// Everything here is plain computing (words, best five, chances, the split line) so it can be unit tested.
import { RANK_NAME, RANK_PLURAL, eval5, evalBest, parseCard, type HandEval, type HandResults } from '@tp/engine';

export type Step = 'runout' | 'scene' | 'winner' | 'all' | 'hold' | 'fold';
export interface ResStage {
  step: Step;
  /** runout: the board as dealt so far */
  board?: string[];
  /** runout: each all-in player's chance to win, in % */
  chances?: Record<string, number>;
  /** when the next hand is dealt (performance.now() ms) and the whole pause; null when not known */
  next?: { at: number; total: number } | null;
  /** a tap moves on to the next step */
  skip?: boolean;
}

const fmt = (n: number): string => Math.round(n).toLocaleString('en-IN');
const low = (s: string): string => s.toLowerCase();
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const listNames = (n: string[]): string => (n.length <= 1 ? (n[0] ?? 'Someone') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);

/** Category (0 high card .. 9 royal flush) and ranks of a best five, e.g. ['Kh','Ks','Kc','7d','7h']. */
function rankOf(best: string[]): { cat: number; ranks: number[] } | null {
  if (best.length !== 5) return null;
  try { const e = eval5(best.map(parseCard)); return { cat: e.cat, ranks: e.ranks }; } catch { return null; }
}

/** The hand in words: "Full house, kings full of sevens", "Three sevens", "Pair of tens", "Ace high". */
export function handWords(ev: Pick<HandEval, 'best' | 'desc'>): string {
  const r = rankOf(ev.best);
  if (!r) return cap(low(ev.desc));
  const n = (i: number) => low(RANK_NAME[r.ranks[i]!]!), p = (i: number) => low(RANK_PLURAL[r.ranks[i]!]!);
  switch (r.cat) {
    case 9: return 'Royal flush';
    case 8: return `Straight flush, ${n(0)} high`;
    case 7: return `Four ${p(0)}`;
    case 6: return `Full house, ${p(0)} full of ${p(1)}`;
    case 5: return `Flush, ${n(0)} high`;
    case 4: return `Straight, ${n(0)} high`;
    case 3: return `Three ${p(0)}`;
    case 2: return `Two pair, ${p(0)} and ${p(1)}`;
    case 1: return `Pair of ${p(0)}`;
    default: return cap(`${n(0)} high`);
  }
}

/** The short name on a seat tag (it fits under the seat): "Full house", "Three kings", "Two pair", "One pair", "Ace high". */
export function handShort(ev: Pick<HandEval, 'best' | 'desc'>): string {
  const r = rankOf(ev.best);
  if (!r) return cap(low(ev.desc.split(',')[0]!));
  const p = (i: number) => low(RANK_PLURAL[r.ranks[i]!]!);
  return ['', 'One pair', 'Two pair', `Three ${p(0)}`, 'Straight', 'Flush', 'Full house', `Four ${p(0)}`, 'Straight flush', 'Royal flush'][r.cat]
    || cap(`${low(RANK_NAME[r.ranks[0]!]!)} high`);
}

/** The card that decided a tie between equal made hands ("ace kicker"), if the hand has one. */
export function kickerWord(ev: Pick<HandEval, 'best'>): string | null {
  const r = rankOf(ev.best);
  if (!r) return null;
  const at = r.cat === 1 ? 1 : r.cat === 2 ? 2 : r.cat === 3 ? 1 : r.cat === 7 ? 1 : -1;
  const k = at >= 0 ? r.ranks[at] : undefined;
  return k === undefined ? null : `${low(RANK_NAME[k]!)} kicker`;
}

/** Tier 1..4 of a hand category (as tiers.ts): the label on the winner card. */
export const TIER_LABEL = ['', 'Tier 1 · small win', 'Tier 2 · good hand', 'Tier 3 · big hand', 'Tier 4 · legendary'];

/** The board cards that are in any winner's best five (they lift; the rest dim). */
export function bestOnBoard(board: string[], bests: string[][]): Set<string> {
  const all = new Set(bests.flat());
  return new Set(board.filter((c) => all.has(c)));
}

export interface Winner { pid: string; name: string; amount: number; ev: HandEval | null }
export interface Summary {
  winners: Winner[];
  total: number;
  /** two or more players shared the same pots with the same hand */
  split: boolean;
  /** the pill on the felt */
  title: string; line: string;
  /** the best winning hand (for the tier and the winner card's best five) */
  best: HandEval | null;
}

/** Who won what, in words (design: "Riya wins 1,300 · Full house, kings full of sevens", "Split pot · 650 each"). */
export function summarize(R: HandResults, nameOf: (pid: string) => string): Summary {
  const amt = new Map<string, number>();
  const potsOf = new Map<string, string[]>();
  for (const p of R.pots) for (const a of p.awards) {
    amt.set(a.pid, (amt.get(a.pid) ?? 0) + a.amount);
    potsOf.set(a.pid, [...(potsOf.get(a.pid) ?? []), p.label]);
  }
  const total = R.pots.reduce((s, p) => s + p.amount, 0);
  const winners: Winner[] = [...amt.entries()].map(([pid, amount]) => ({ pid, name: nameOf(pid), amount, ev: R.evals[pid] ?? null }))
    .sort((a, b) => b.amount - a.amount);
  const best = R.pots.map((p) => p.hand).filter((h): h is HandEval => !!h).sort((a, b) => b.score - a.score)[0] ?? null;
  if (!R.showdown || !winners.length) {
    const w = winners[0];
    return { winners, total, split: false, best: null, title: 'Everyone folded', line: `${w?.name ?? 'Someone'} wins ${fmt(w?.amount ?? total)} · cards stay hidden` };
  }
  const key = (w: Winner) => `${(potsOf.get(w.pid) ?? []).join('|')}#${w.ev?.score ?? ''}`;
  const split = winners.length > 1 && winners.every((w) => key(w) === key(winners[0]!));
  if (split) {
    const same = winners.every((w) => w.amount === winners[0]!.amount);
    const ev = winners[0]!.ev;
    const k = ev ? kickerWord(ev) : null;
    // "kings and nines" for two pair (as the design says it), the hand in words otherwise
    const words = ev ? low(handWords(ev)).replace(/^two pair, /, '') : '';
    return {
      winners, total, split, best,
      title: `Split pot · ${same ? `${fmt(winners[0]!.amount)} each` : winners.map((w) => fmt(w.amount)).join(' / ')}`,
      line: `${listNames(winners.map((w) => w.name).sort((a, b) => a.localeCompare(b)))}: ${words}${k ? `, ${k}` : ''}`,
    };
  }
  const title = winners.map((w) => `${w.name} wins ${fmt(w.amount)}`).join(' · ');
  const top = winners[0]!.ev ?? best;
  return { winners, total, split, best, title, line: top ? handWords(top) : '' };
}

// ---------------- chances (all-in before the river) ----------------
/** A repeatable random number generator (so every phone shows the same chances). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DECK = [...'23456789TJQKA'].flatMap((r) => [...'shdc'].map((s) => r + s));

/**
 * Each player's chance (whole %, adding up to 100) to win from here: every way the rest of the board can come
 * (exactly when one or two cards are left, else about 3,000 / players sampled boards). A tie shares its win.
 */
export function chances(hands: Record<string, string[]>, board: string[], samples = 0): Record<string, number> {
  const ids = Object.keys(hands).filter((k) => hands[k]!.length === 2);
  const out: Record<string, number> = {};
  if (!ids.length) return out;
  const known = new Set([...board, ...ids.flatMap((k) => hands[k]!)]);
  const rest = DECK.filter((c) => !known.has(c));
  const need = 5 - board.length;
  const win: Record<string, number> = Object.fromEntries(ids.map((k) => [k, 0]));
  const hole = ids.map((k) => hands[k]!.map(parseCard));
  const base = board.map(parseCard);
  let runs = 0;
  const score = (extra: string[]) => {
    const b = base.concat(extra.map(parseCard));
    const s = hole.map((h) => evalBest(h.concat(b))!.score);
    const top = Math.max(...s);
    const at = ids.filter((_k, i) => s[i] === top);
    for (const k of at) win[k]! += 1 / at.length;
    runs++;
  };
  if (need <= 0) score([]);
  else if (need === 1) for (const c of rest) score([c]);
  else if (need === 2) for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) score([rest[i]!, rest[j]!]);
  else {
    let seed = 7;
    for (const c of known) seed = (seed * 31 + c.charCodeAt(0) * 7 + c.charCodeAt(1)) >>> 0;
    const r = rng(seed);
    const pick = rest.slice();
    const N = samples || Math.round(3000 / ids.length); // about 0.2 s on a phone
    for (let n = 0; n < N; n++) {
      for (let i = 0; i < need; i++) { const j = i + Math.floor(r() * (pick.length - i)); [pick[i], pick[j]] = [pick[j]!, pick[i]!]; }
      score(pick.slice(0, need));
    }
  }
  // whole numbers that add up to 100 (largest remainders get the leftover points)
  const raw = ids.map((k) => (100 * win[k]!) / runs);
  const fl = raw.map(Math.floor);
  let left = 100 - fl.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - fl[i]!, i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; fl[i]! += 1; left--; }
  ids.forEach((k, i) => { out[k] = fl[i]!; });
  return out;
}

/** "Riya 71% · Tara 29%" (best chance first). */
export const chancesLine = (c: Record<string, number>, nameOf: (pid: string) => string): string =>
  Object.entries(c).sort((a, b) => b[1] - a[1]).map(([pid, x]) => `${nameOf(pid)} ${x}%`).join(' · ');

/** The runout pill's title for a board of n cards. */
export const runoutTitle = (n: number): string => (n < 3 ? 'All-in · dealing the flop' : n === 3 ? 'All-in · dealing the turn' : n === 4 ? 'All-in · dealing the river' : 'All-in · the board is out');

/** Seconds on the next-hand bar. */
export const nextLabel = (leftMs: number, skip: boolean, lap: boolean): string =>
  leftMs <= 250 ? 'Dealing the next hand' : `Next hand in ${Math.ceil(leftMs / 1000)}${skip ? ` · ${lap ? 'Space' : 'tap'} to skip` : ''}`;
