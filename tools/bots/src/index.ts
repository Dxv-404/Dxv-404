// Bot players for tests and load tests. A bot decides only from a seat's view, exactly what a
// real phone would see, so the same bots can later play through the network protocol.
import { evalBest, parseCard, rankOf, type Action, type View } from '@tp/engine';

export type Rng = () => number;
export type Strategy = 'random' | 'caller' | 'tight' | 'maniac';
export const STRATEGIES: Strategy[] = ['random', 'caller', 'tight', 'maniac'];

/** Small fast deterministic generator (mulberry32) so bot games replay exactly from a seed. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const passive = (v: View): Action => ({ type: v.legal!.canCheck ? 'check' : 'call' });
const raiseTo = (v: View, frac: number): Action => {
  const L = v.legal!;
  return { type: 'raise', to: Math.round(L.minTo + frac * (L.maxTo - L.minTo)) };
};

/** 0 (rubbish) .. 1 (monster), from the cards this seat can see. */
export function strength(v: View): number {
  const me = v.me ? v.hand?.ps[v.me] : undefined;
  if (!me?.cards || !v.hand) return 0;
  const hole = me.cards.map(parseCard);
  const board = v.hand.board.map(parseCard);
  if (board.length === 0) {
    const [a, b] = hole.map(rankOf).sort((x, y) => y - x) as [number, number];
    const pair = a === b, suited = (hole[0]! & 3) === (hole[1]! & 3);
    if (pair) return 0.5 + a / 24;
    return Math.min(0.95, (a + b) / 30 + (suited ? 0.08 : 0) + (a - b <= 2 ? 0.05 : 0));
  }
  return (evalBest(hole.concat(board))!.cat + 1) / 10;
}

/** The bot's move for this view, or null if it is not this seat's turn. */
export function decide(v: View, strategy: Strategy, r: Rng): Action | null {
  const L = v.legal;
  if (!L) return null;
  switch (strategy) {
    case 'caller': return passive(v);
    case 'maniac':
      if (L.canRaise && r() < 0.7) return r() < 0.15 ? { type: 'allin' } : raiseTo(v, r() * 0.5);
      return passive(v);
    case 'tight': {
      const s = strength(v);
      if (s >= 0.75 && L.canRaise) return raiseTo(v, Math.min(1, (s - 0.7) * 2));
      if (s >= 0.45 || L.canCheck) return passive(v);
      return L.toCall <= L.pot / 6 && r() < 0.5 ? passive(v) : { type: 'fold' };
    }
    case 'random': {
      const x = r();
      if (x < 0.12) return { type: 'fold' };
      if (x < 0.55) return passive(v);
      if (x < 0.88 && L.canRaise) return raiseTo(v, r());
      if (x < 0.93) return { type: 'allin' };
      return passive(v);
    }
  }
}
