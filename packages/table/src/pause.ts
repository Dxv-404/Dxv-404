// How long the table waits after a hand before dealing the next one (design: tools/design/gen/v3results.py,
// "After a hand: the order and the timing"). The server, the QR host and the phones all use these numbers,
// so the "Next hand in N" bar on a phone drains to the moment the server really deals.
import { CATEGORY, type GameEvent, type HandResults } from '@tp/engine';

/** Everyone folded: a short winner line, then the next hand (1.2 s + 1.8 s hold). */
export const FOLD_PAUSE_MS = 3000;
/** A showdown (tiers 1 to 3): scene, winner, everyone else flips, hold: 8 s in all. */
export const SHOWDOWN_PAUSE_MS = 8000;
/** Tier 4 (straight flush, royal flush): the long scene, then the same steps: 10.5 s. */
export const LEGEND_PAUSE_MS = 10_500;
/** All-in before the river: the hands stay up with their chances this long before the rest of the board comes. */
export const RUNOUT_FIRST_MS = 1000;
/** All-in before the river: each card (flop, turn, river) dealt slowly, this far apart. */
export const RUNOUT_STREET_MS = 1400;

/** The hand category (0 high card .. 9 royal flush) of the best winning hand, or -1 without a showdown. */
export function bestCategory(results: HandResults): number {
  if (!results.showdown) return -1;
  let best = -1;
  for (const p of results.pots) if (p.hand) best = Math.max(best, (CATEGORY as readonly string[]).indexOf(p.hand.name));
  return best;
}

/** Streets dealt in the same update as the win of a hand that was all-in before the river (dealt slowly on phones). */
export function runoutStreets(events: readonly GameEvent[], runout: boolean): number {
  if (!runout) return 0;
  return events.filter((e) => e.t === 'street' && e.board !== 2).length;
}

/** Time from the end of a hand (its win) to the next deal. */
export function resultsPauseMs(results: HandResults, streets = 0): number {
  if (!results.showdown) return FOLD_PAUSE_MS;
  const base = bestCategory(results) >= 8 ? LEGEND_PAUSE_MS : SHOWDOWN_PAUSE_MS;
  return base + (streets > 0 ? RUNOUT_FIRST_MS + streets * RUNOUT_STREET_MS : 0);
}
