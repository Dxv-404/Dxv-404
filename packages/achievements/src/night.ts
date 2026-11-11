// The achievements only a finished night can decide: who won it and how the stacks moved on the way.
// A "night" is one game. Winning it means finishing first of at least three players (the same games the
// league counts).
import { timedOut, wonHand } from './hand';
import type { Earned, HandFacts, Pid } from './facts';

export interface NightPlayer {
  pid: Pid;
  /** 1 = won the night. */
  place: number;
  rebuys: number;
}
export interface NightFacts {
  game: string;
  /** The first buy-in everyone started with. */
  startStack: number;
  endedAt: number;
  /** Every hand of the game, oldest first. */
  hands: HandFacts[];
  /** The final results (the database's game_players rows, or `standings(hands)`). */
  players: NightPlayer[];
}

export const NIGHT_MIN_PLAYERS = 3;
/** Flawless needs a real night: dealt into at least this many hands. */
export const FLAWLESS_MIN_HANDS = 10;
/** Wire to Wire: the lead is watched from this hand on, and the night must be at least twice as long. */
export const WIRE_FROM_HAND = 10;
export const IRON_FOCUS_HANDS = 30;
export const PHOENIX_BELOW = 0.2;

/** Chips won or lost so far (stack minus everything bought in) for every player after each hand. A player
 * not dealt in keeps their last number. */
export function netSeries(hands: readonly HandFacts[]): Record<Pid, number>[] {
  const cur: Record<Pid, number> = {};
  return hands.map((h) => {
    for (const p of h.order) cur[p] = (h.stackAfter[p] ?? 0) - (h.buyins[p] ?? 0);
    return { ...cur };
  });
}

/** Final places from the hands alone (by chips won; ties share a place) and rebuys seen between hands.
 * A rebuy after a player's last hand cannot be seen here: use the database's results when there are any. */
export function standings(hands: readonly HandFacts[]): NightPlayer[] {
  const last = netSeries(hands).at(-1) ?? {};
  const rebuys: Record<Pid, number> = {}, bought: Record<Pid, number> = {};
  for (const h of hands) for (const p of h.order) {
    const b = h.buyins[p] ?? 0;
    if (bought[p] !== undefined && b > bought[p]!) rebuys[p] = (rebuys[p] ?? 0) + 1;
    bought[p] = b;
  }
  const pids = Object.keys(last);
  return pids.map((pid) => ({ pid, place: 1 + pids.filter((q) => last[q]! > last[pid]!).length, rebuys: rebuys[pid] ?? 0 }));
}

/** Every achievement the finished night earned. All are held for the night summary. */
export function checkNight(n: NightFacts, owned: Readonly<Record<Pid, readonly string[]>> = {}): Earned[] {
  const out: Earned[] = [];
  const series = netSeries(n.hands);
  const lastHand = n.hands.at(-1);
  const real = n.players.length >= NIGHT_MIN_PLAYERS;
  for (const pl of n.players) {
    const p = pl.pid;
    const give = (id: string, hand: number | null = null): void => {
      if (!(owned[p] ?? []).includes(id)) out.push({ id, pid: p, reveal: 'night', game: n.game, hand, at: n.endedAt });
    };
    const mine = n.hands.filter((h) => h.order.includes(p));
    const won = real && pl.place === 1;
    const low = mine.find((h) => (h.stackAfter[p] ?? 0) < PHOENIX_BELOW * n.startStack);
    if (won && low) give('phoenix', low.handNo);
    if (won && pl.rebuys === 0 && mine.length >= FLAWLESS_MIN_HANDS && mine.every((h) => (h.stackAfter[p] ?? 0) >= n.startStack)) give('flawless');
    if (won && n.hands.length >= 2 * WIRE_FROM_HAND && series.slice(WIRE_FROM_HAND - 1).every((s) => s[p] !== undefined && s[p] === Math.max(...Object.values(s)))) give('wire_to_wire');
    if (pl.rebuys >= 2 && pl.place <= 3 && n.players.length > 3) give('rebuy_royalty');
    if (won && lastHand && n.hands.length >= 2 && wonHand(lastHand, p)) {
      const before = series.at(-2)!, after = series.at(-1)!;
      const others = (s: Record<Pid, number>): number => Math.max(...Object.entries(s).filter(([q]) => q !== p).map(([, v]) => v));
      if ((before[p] ?? 0) < others(before) && after[p]! > others(after)) give('last_hand_best_hand', lastHand.handNo);
    }
    if (mine.length >= IRON_FOCUS_HANDS && !mine.some((h) => timedOut(h, p))) give('iron_focus');
  }
  return out;
}
