// The achievements a finished night decides. Hands here are only stacks before and after: that is all
// these rules read (plus who won the last hand, and timeouts).
import { describe, expect, it } from 'vitest';
import { checkNight, netSeries, standings, type NightFacts, type NightPlayer } from '../src/night';
import type { HandFacts } from '../src/facts';
import { hand } from './helpers';

const START = 5000;
/** A night from each player's stack after every hand ("a: 5200 5400 ..."); everyone is dealt every hand
 * unless their entry is null. `buy` gives the chips bought in by each hand when there were rebuys. */
function night(stacks: Record<string, (number | null)[]>, o: { buy?: Record<string, number[]>; places?: Record<string, number>; rebuys?: Record<string, number>; auto?: Record<string, number[]> } = {}): NightFacts {
  const pids = Object.keys(stacks), n = stacks[pids[0]!]!.length;
  const hands: HandFacts[] = [];
  const cur: Record<string, number> = Object.fromEntries(pids.map((p) => [p, START]));
  for (let i = 0; i < n; i++) {
    const order = pids.filter((p) => stacks[p]![i] !== null);
    const h: HandFacts = { game: 'g1', handNo: i + 1, endedAt: 1_794_000_000_000 + i * 60_000, bb: 100, order, hole: {}, board: [], board2: null, actions: [], showdown: [], awards: {}, pot: 0, stackBefore: {}, stackAfter: {}, buyins: {} };
    for (const p of order) {
      const buy = o.buy?.[p]?.[i] ?? START, prevBuy = i ? (o.buy?.[p]?.[i - 1] ?? START) : buy;
      h.hole[p] = ['As', 'Kd'];
      h.stackBefore[p] = cur[p]! + (buy - prevBuy);
      h.stackAfter[p] = stacks[p]![i]!;
      h.buyins[p] = buy;
      if (h.stackAfter[p]! > h.stackBefore[p]!) h.awards[p] = h.stackAfter[p]! - h.stackBefore[p]!;
      if (o.auto?.[p]?.includes(i + 1)) h.actions.push({ pid: p, street: 'preflop', kind: 'fold', put: 0, toCall: 100, allIn: false, auto: true, board: 0 });
      cur[p] = stacks[p]![i]!;
    }
    hands.push(h);
  }
  const st = standings(hands);
  const players: NightPlayer[] = st.map((s) => ({ pid: s.pid, place: o.places?.[s.pid] ?? s.place, rebuys: o.rebuys?.[s.pid] ?? s.rebuys }));
  return { game: 'g1', startStack: START, endedAt: hands.at(-1)!.endedAt, hands, players };
}
const got = (n: NightFacts, p: string): string[] => checkNight(n).filter((e) => e.pid === p).map((e) => e.id);
const flat = (v: number, n: number): number[] => Array.from({ length: n }, () => v);

describe('places and chips from the hands', () => {
  it('ranks by chips won and counts rebuys seen between hands', () => {
    const n = night({ a: [6000, 9000], b: [4000, 5500], c: [5000, 2500] }, { buy: { b: [5000, 7000] } });
    expect(netSeries(n.hands).at(-1)).toEqual({ a: 4000, b: -1500, c: -2500 });
    expect(standings(n.hands)).toEqual([{ pid: 'a', place: 1, rebuys: 0 }, { pid: 'b', place: 2, rebuys: 1 }, { pid: 'c', place: 3, rebuys: 0 }]);
  });
});

describe('Phoenix', () => {
  it('winning the night after falling under 20% of the starting stack counts', () => {
    const n = night({ a: [900, 4000, 9000], b: [7000, 5000, 3000], c: [7100, 6000, 3000] });
    expect(got(n, 'a')).toContain('phoenix');
    expect(checkNight(n).find((e) => e.id === 'phoenix')).toMatchObject({ hand: 1, reveal: 'night' });
  });
  it('exactly 20%, not winning, or a two-player night does not', () => {
    expect(got(night({ a: [1000, 4000, 9000], b: [7000, 5000, 3000], c: [7000, 6000, 3000] }), 'a')).not.toContain('phoenix');
    expect(got(night({ a: [900, 4000, 5500], b: [7000, 5000, 6500], c: [7100, 6000, 3000] }), 'a')).not.toContain('phoenix');
    expect(got(night({ a: [900, 4000, 9000], b: [9100, 6000, 1000] }), 'a')).not.toContain('phoenix');
  });
});

describe('Flawless', () => {
  const up = Array.from({ length: 12 }, (_, i) => START + 200 * (i + 1));
  it('winning with no rebuys and never under the starting stack counts', () => {
    expect(got(night({ a: up, b: flat(4000, 12), c: flat(3600, 12) }), 'a')).toContain('flawless');
  });
  it('one dip under the start, a rebuy, or a very short night does not', () => {
    const dip = up.slice(); dip[3] = 4900;
    expect(got(night({ a: dip, b: flat(4000, 12), c: flat(3600, 12) }), 'a')).not.toContain('flawless');
    expect(got(night({ a: up, b: flat(4000, 12), c: flat(3600, 12) }, { rebuys: { a: 1 } }), 'a')).not.toContain('flawless');
    expect(got(night({ a: up.slice(0, 5), b: flat(4000, 5), c: flat(3600, 5) }), 'a')).not.toContain('flawless');
  });
});

describe('Wire to Wire', () => {
  const lead: number[] = Array.from({ length: 22 }, (_, i) => (i < 6 ? 4000 : 9000));
  it('leading from hand 10 to the end, and winning, counts (trailing before hand 10 is fine)', () => {
    expect(got(night({ a: lead, b: flat(5500, 22), c: flat(3000, 22) }), 'a')).toContain('wire_to_wire');
  });
  it('losing the lead once after hand 10, or a night under 20 hands, does not', () => {
    const slip = lead.slice(); slip[15] = 5000;
    expect(got(night({ a: slip, b: flat(5500, 22), c: flat(3000, 22) }), 'a')).not.toContain('wire_to_wire');
    expect(got(night({ a: lead.slice(0, 15), b: flat(5500, 15), c: flat(3000, 15) }), 'a')).not.toContain('wire_to_wire');
  });
  it('the lead is chips won, so a rebuy stack does not count as leading', () => {
    const b = flat(9500, 22);
    expect(got(night({ a: lead, b, c: flat(3000, 22) }, { buy: { b: flat(15_000, 22) } }), 'a')).toContain('wire_to_wire');
  });
});

describe('Rebuy Royalty', () => {
  const four = { a: [6000], b: [5500], c: [4500], d: [4000] };
  it('two rebuys and a top-three finish among four or more counts', () => {
    expect(got(night(four, { places: { c: 3 }, rebuys: { c: 2 } }), 'c')).toContain('rebuy_royalty');
  });
  it('one rebuy, fourth place, or a three-player night does not', () => {
    expect(got(night(four, { rebuys: { c: 1 } }), 'c')).not.toContain('rebuy_royalty');
    expect(got(night(four, { rebuys: { d: 2 } }), 'd')).not.toContain('rebuy_royalty');
    expect(got(night({ a: [6000], b: [5500], c: [3500] }, { rebuys: { c: 2 } }), 'c')).not.toContain('rebuy_royalty');
  });
});

describe('Last Hand, Best Hand', () => {
  it('winning the last hand and taking the lead with it counts', () => {
    const n = night({ a: [5000, 4800, 7800], b: [5500, 6200, 4200], c: [4500, 4000, 3000] });
    expect(got(n, 'a')).toContain('last_hand_best_hand');
    expect(checkNight(n).find((e) => e.id === 'last_hand_best_hand')!.hand).toBe(3);
  });
  it('already leading, or winning the hand but not the night, does not', () => {
    expect(got(night({ a: [5000, 6500, 7800], b: [5500, 5200, 4200], c: [4500, 3300, 3000] }), 'a')).not.toContain('last_hand_best_hand');
    expect(got(night({ a: [5000, 4000, 4800], b: [5500, 7000, 6200], c: [4500, 4000, 4000] }), 'a')).not.toContain('last_hand_best_hand');
  });
});

describe('Iron Focus', () => {
  it('30 hands with no timeout counts', () => {
    expect(got(night({ a: flat(5000, 30), b: flat(5000, 30) }), 'a')).toContain('iron_focus');
  });
  it('29 hands, or one timeout, does not', () => {
    expect(got(night({ a: flat(5000, 29), b: flat(5000, 29) }), 'a')).not.toContain('iron_focus');
    const n = night({ a: flat(5000, 30), b: flat(5000, 30) }, { auto: { a: [12] } });
    expect(got(n, 'a')).not.toContain('iron_focus');
    expect(got(n, 'b')).toContain('iron_focus');
  });
  it('hands sat out do not count towards the 30', () => {
    const a: (number | null)[] = flat(5000, 32); a[3] = null; a[4] = null; a[5] = null;
    expect(got(night({ b: flat(5000, 32), a }), 'a')).not.toContain('iron_focus');
  });
});

describe('what is already owned', () => {
  it('is not given again', () => {
    const n = night({ a: flat(5000, 30), b: flat(5000, 30) });
    expect(checkNight(n, { a: ['iron_focus'] }).map((e) => e.pid)).toEqual(['b']);
    expect(hand({ hole: { a: 'As Ah' } }).order).toEqual(['a']);
  });
});
