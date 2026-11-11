// One block per achievement a hand can earn: a hand that counts, and hands that look close but must not.
import { describe, expect, it } from 'vitest';
import { checkHand, knockouts, stoneColdBluff } from '../src/hand';
import { isSecondBest, nothing, startingHand } from '../src/cards';
import type { HandFacts, NightSoFar } from '../src/facts';
import { hand } from './helpers';

const got = (h: HandFacts, p: string, night?: NightSoFar): string[] => checkHand(h, night).filter((e) => e.pid === p).map((e) => (e.tier ? `${e.id}:${e.tier}` : e.id));
const BET = 'preflop: a bet 200, b call';

describe('Quads', () => {
  it('winning with four of a kind counts', () => {
    expect(got(hand({ hole: { a: '9s 9h', b: 'Ac Kd' }, board: '9d 9c 2s 5h Kc', acts: 'river: a bet 500, b call' }), 'a')).toContain('quads');
  });
  it('quads lying on the board are nobody\'s, and folding quads is not winning', () => {
    expect(got(hand({ hole: { a: 'Ac Kd', b: 'Qs Jd' }, board: '9s 9h 9d 9c 2s', acts: 'river: a bet 500, b call' }), 'a')).not.toContain('quads');
    expect(got(hand({ hole: { a: '9s 9h', b: 'Ac Kd' }, board: '9d 9c 2s 5h Kc', acts: 'river: b bet 500, a fold' }), 'a')).not.toContain('quads');
  });
});

describe('Straight Flush', () => {
  it('making one counts, win or fold', () => {
    const h = { hole: { a: '8h 9h', b: 'Kd Ks' }, board: '5h 6h 7h Kc 2d' };
    expect(got(hand({ ...h, acts: 'river: a bet 500, b call' }), 'a')).toContain('straight_flush');
    expect(got(hand({ ...h, acts: 'river: b bet 500, a fold' }), 'a')).toContain('straight_flush');
    expect(got(hand({ ...h, acts: 'river: a bet 500, b call' }), 'a')).not.toContain('royal');
  });
  it('folding before it arrives does not count', () => {
    expect(got(hand({ hole: { a: '8h 9h', b: 'Kd Ks' }, board: '5h 6h Kc 7h 2d', acts: 'flop: b bet 500, a fold' }), 'a')).not.toContain('straight_flush');
  });
});

describe('Royal', () => {
  it('a royal flush counts (and is a straight flush too)', () => {
    const g = got(hand({ hole: { a: 'Ah Kh', b: '2c 2d' }, board: 'Qh Jh Th 2s 3d', acts: 'river: a bet 500, b call' }), 'a');
    expect(g).toContain('royal');
    expect(g).toContain('straight_flush');
  });
  it('a royal on the board is nobody\'s', () => {
    const g = got(hand({ hole: { a: '2c 3d', b: '4c 5d' }, board: 'Ah Kh Qh Jh Th', acts: 'river: a check, b check' }), 'a');
    expect(g).not.toContain('royal');
    expect(g).not.toContain('straight_flush');
  });
});

describe('The Wheel', () => {
  it('winning with A-2-3-4-5 counts', () => {
    expect(got(hand({ hole: { a: 'As 4d', b: 'Kh Jc' }, board: '2c 3h 5s Kd Qc', acts: 'river: a bet 300, b call' }), 'a')).toContain('the_wheel');
  });
  it('a six-high straight, or a wheel that loses, does not', () => {
    expect(got(hand({ hole: { a: '6s 4d', b: 'Kh Jc' }, board: '2c 3h 5s Kd Qc', acts: 'river: a bet 300, b call' }), 'a')).not.toContain('the_wheel');
    expect(got(hand({ hole: { a: 'As 4d', b: '6h 7c' }, board: '2c 3h 5s 4h Qc', acts: 'river: a bet 300, b call' }), 'a')).not.toContain('the_wheel');
  });
});

describe('Seven-Deuce Glory', () => {
  it('winning a pot with 7-2 offsuit counts', () => {
    expect(got(hand({ hole: { a: '7s 2d', b: 'Ac Kd' }, acts: 'preflop: b bet 200, a raise 800, b fold' }), 'a')).toContain('seven_deuce');
  });
  it('suited 7-2, or losing with it, does not', () => {
    expect(got(hand({ hole: { a: '7s 2s', b: 'Ac Kd' }, acts: 'preflop: b bet 200, a raise 800, b fold' }), 'a')).not.toContain('seven_deuce');
    expect(got(hand({ hole: { a: '7s 2d', b: 'Ac Kd' }, board: 'Ah 9c 4d Js 3c', acts: `${BET}` }), 'a')).not.toContain('seven_deuce');
  });
});

describe('Set Mining', () => {
  it('a pocket pair that flops a set counts', () => {
    expect(got(hand({ hole: { a: '8s 8d', b: 'Ac Kd' }, board: '8c Kh 2d', acts: `${BET} | flop: a bet 300, b fold` }), 'a')).toContain('set_mining');
  });
  it('a set on the turn, or a flop seen after folding, does not', () => {
    expect(got(hand({ hole: { a: '8s 8d', b: 'Ac Kd' }, board: 'Kh 2d 4c 8c', acts: `${BET} | flop: a check, b check | turn: a bet 300, b fold` }), 'a')).not.toContain('set_mining');
    expect(got(hand({ hole: { a: '8s 8d', b: 'Ac Kd', c: 'Qs Qd' }, board: '8c Kh 2d', acts: 'preflop: b bet 300, c call, a fold | flop: b bet 300, c fold' }), 'a')).not.toContain('set_mining');
  });
});

describe('Pocket Rockets, Grounded', () => {
  it('losing a showdown with aces counts', () => {
    expect(got(hand({ hole: { a: 'As Ad', b: '7c 7d' }, board: '7h 2s 9d Kc 4h', acts: BET }), 'a')).toContain('pocket_rockets');
  });
  it('folding aces, or winning with them, does not', () => {
    expect(got(hand({ hole: { a: 'As Ad', b: '7c 7d' }, board: '7h 2s 9d', acts: `${BET} | flop: b bet 500, a fold` }), 'a')).not.toContain('pocket_rockets');
    expect(got(hand({ hole: { a: 'As Ad', b: '7c 7d' }, board: '8h 2s 9d Kc 4h', acts: BET }), 'a')).not.toContain('pocket_rockets');
  });
});

describe('Cooler', () => {
  it('losing a showdown with a full house counts', () => {
    expect(got(hand({ hole: { a: 'Ks Kd', b: '9c 9d' }, board: 'Kc 9h 9s 2d 4c', acts: BET }), 'a')).toContain('cooler');
  });
  it('losing with a flush, or with the board\'s own full house, does not', () => {
    expect(got(hand({ hole: { a: 'As 5s', b: '9c 9d' }, board: 'Ks 9h 9s 2s 2c', acts: BET }), 'a')).not.toContain('cooler');
    expect(got(hand({ hole: { a: '2c 3d', b: 'Ah Kh' }, board: 'Kc Kd Ks 9h 9s', acts: BET }), 'a')).not.toContain('cooler');
  });
});

describe('Board Plays', () => {
  it('a pot split because the board is everyone\'s best hand counts for all of them', () => {
    const h = hand({ hole: { a: '2c 3d', b: '4c 5d' }, board: 'Ah Kd Qs Jc Th', acts: BET });
    expect(got(h, 'a')).toContain('board_plays');
    expect(got(h, 'b')).toContain('board_plays');
  });
  it('a split with the same hole cards, or a board someone beats, does not', () => {
    expect(got(hand({ hole: { a: 'As Kd', b: 'Ac Kh' }, board: '2s 7d 9h Jc 3d', acts: BET }), 'a')).not.toContain('board_plays');
    expect(got(hand({ hole: { a: 'Ac Kd', b: 'Jh 3c' }, board: '2s 2d 7h 9c Jd', acts: BET }), 'b')).not.toContain('board_plays');
  });
});

describe('Stone Cold Bluff', () => {
  const bluff = (hole: string, board = '2s 7d 9h', more: Partial<Parameters<typeof hand>[0]> = {}) =>
    hand({ hole: { a: hole, b: 'As 8s' }, board, acts: `${BET} | flop: a bet 400, b fold`, ...more });
  it('betting with no pair and no draw until everyone folds counts', () => {
    expect(got(bluff('Qc Jd'), 'a')).toContain('stone_cold_bluff:1');
  });
  it('a pair, a flush draw, a gutshot, a steal before the flop and a called bet do not', () => {
    expect(stoneColdBluff(bluff('9c Jd'), 'a')).toBe(false);
    expect(stoneColdBluff(bluff('Qs Js', '2s 7s 9h'), 'a')).toBe(false);
    expect(stoneColdBluff(bluff('Tc Jd', '7d 8h 2s'), 'a')).toBe(false);
    expect(stoneColdBluff(hand({ hole: { a: 'Qc Jd', b: 'As 8s' }, acts: 'preflop: a bet 300, b fold' }), 'a')).toBe(false);
    expect(stoneColdBluff(hand({ hole: { a: 'Qc Jd', b: 'As 8s' }, board: '2s 7d 9h 3c 4d', acts: `${BET} | flop: a bet 400, b call` , win: ['a'] }), 'a')).toBe(false);
  });
  it('on the river only the made hand matters (a missed draw is a bluff)', () => {
    expect(nothing(['Qs', 'Js'], ['2s', '7s', '9h', '3c', '4d'])).toBe(true);
    expect(nothing(['Qs', 'Js'], ['2s', '7s', '9h', '3c'])).toBe(false);
    expect(nothing(['Ac', '4d'], ['2s', '3s', '9h'])).toBe(false); // the ace plays low: a gutshot to the wheel
  });
  it('tiers come at the 1st, 10th and 50th, counting earlier nights and earlier tonight', () => {
    expect(got(bluff('Qc Jd'), 'a', { hands: [], career: { a: { hands: 0, bluffs: 9 } } })).toContain('stone_cold_bluff:2');
    expect(got(bluff('Qc Jd'), 'a', { hands: [], career: { a: { hands: 0, bluffs: 3 } } }).join()).not.toContain('stone_cold_bluff');
    expect(got(bluff('Qc Jd', undefined, { no: 2 }), 'a', { hands: [bluff('Kc Jd')] }).join()).not.toContain('stone_cold_bluff');
    expect(got(bluff('Qc Jd', undefined, { no: 2 }), 'a', { hands: [bluff('Kc Jd')], career: { a: { hands: 0, bluffs: 48 } } })).toContain('stone_cold_bluff:3');
  });
});

describe('Hero Call', () => {
  const h = (hole: string, acts: string, b = 'Qc Jc') => hand({ hole: { a: hole, b }, board: 'Kh 8d 3c 2s 6h', acts });
  it('calling a river bet with one pair and winning counts', () => {
    expect(got(h('Ks 5d', 'river: b bet 500, a call'), 'a')).toContain('hero_call');
  });
  it('two pair, a losing call, or a call before the river does not', () => {
    expect(got(h('Ks 8s', 'river: b bet 500, a call'), 'a')).not.toContain('hero_call');
    expect(got(h('8s 5d', 'river: b bet 500, a call', 'Kc Jc'), 'a')).not.toContain('hero_call');
    expect(got(h('Ks 5d', 'turn: b bet 500, a call | river: b check, a check'), 'a')).not.toContain('hero_call');
  });
});

describe('Great Fold', () => {
  it('folding two pair to a bet from a better hand counts, and is held for the night', () => {
    const e = checkHand(hand({ hole: { a: 'Ks Qd', b: '7c 7d' }, board: 'Kh Qc 7s', acts: `${BET} | flop: b bet 500, a fold` })).find((x) => x.id === 'great_fold');
    expect(e).toMatchObject({ pid: 'a', reveal: 'night' });
  });
  it('is told straight away when the bettor\'s cards were shown at a showdown anyway', () => {
    const e = checkHand(hand({ hole: { a: 'Ks Qd', b: '7c 7d', c: 'Ah Kd' }, board: 'Kh Qc 7s 2d 3h', acts: 'preflop: a bet 200, b call, c call | flop: b bet 500, c call, a fold' })).find((x) => x.id === 'great_fold');
    expect(e).toMatchObject({ pid: 'a', reveal: 'now' });
  });
  it('folding to a bluff, or folding one pair, does not', () => {
    expect(got(hand({ hole: { a: 'Ks Qd', b: 'Ac 5d' }, board: 'Kh Qc 7s', acts: `${BET} | flop: b bet 500, a fold` }), 'a')).not.toContain('great_fold');
    expect(got(hand({ hole: { a: 'Ks Jd', b: '7c 7d' }, board: 'Kh Qc 7s', acts: `${BET} | flop: b bet 500, a fold` }), 'a')).not.toContain('great_fold');
  });
  it('a pair in the hand on a paired board is not two pair worth the name; a set on one is', () => {
    expect(got(hand({ hole: { a: 'Ks Jd', b: '7c 7d' }, board: 'Kh 4c 4s', acts: `${BET} | flop: b bet 500, a fold`, win: ['b'] }), 'a')).not.toContain('great_fold');
    expect(got(hand({ hole: { a: '4h Jd', b: 'Kc Kd' }, board: 'Kh 4c 4s', acts: `${BET} | flop: b bet 500, a fold` }), 'a')).toContain('great_fold');
  });
  it('nothing else in the checker is held back from a hand', () => {
    const h = hand({ hole: { a: 'Ks Qd', b: '7c 7d' }, board: 'Kh Qc 7s', acts: `${BET} | flop: b bet 500, a fold` });
    expect(checkHand(h).filter((x) => x.reveal === 'night').map((x) => x.id)).toEqual(['great_fold']);
  });
});

describe('Check-Raise', () => {
  it('check, raise the bettor on the same street, and win counts', () => {
    expect(got(hand({ hole: { a: 'As Ad', b: 'Kc Qc' }, board: '2s 7d 9h', acts: `${BET} | flop: a check, b bet 200, a raise 600, b fold` }), 'a')).toContain('check_raise');
  });
  it('losing after it, or betting a later street, does not', () => {
    expect(got(hand({ hole: { a: 'As Ad', b: '9c 9d' }, board: '2s 7d 9h Jc 3d', acts: `${BET} | flop: a check, b bet 200, a raise 600, b call` }), 'a')).not.toContain('check_raise');
    expect(got(hand({ hole: { a: 'As Ad', b: 'Kc Qc' }, board: '2s 7d 9h Jc', acts: `${BET} | flop: a check, b check | turn: a bet 300, b fold` }), 'a')).not.toContain('check_raise');
  });
});

describe('The Trap', () => {
  const line = 'preflop: b bet 300, a call | flop: a check, b bet 500, a call | turn: a check, b bet 1200, a call | river: a bet 2000, b call';
  it('slow-playing a flopped set into a pot over 30 big blinds counts', () => {
    expect(got(hand({ hole: { a: '8s 8d', b: 'Ac Kc' }, board: '8c Kh 2d 5s 9c', acts: line }), 'a')).toContain('the_trap');
  });
  it('raising the flop, a small pot, or trips that are the board\'s do not', () => {
    expect(got(hand({ hole: { a: '8s 8d', b: 'Ac Kc' }, board: '8c Kh 2d 5s 9c', acts: 'preflop: b bet 300, a call | flop: a check, b bet 500, a raise 1500, b call | river: a bet 2000, b call' }), 'a')).not.toContain('the_trap');
    expect(got(hand({ hole: { a: '8s 8d', b: 'Ac Kc' }, board: '8c Kh 2d 5s 9c', acts: 'preflop: b bet 300, a call | flop: a check, b bet 500, a call' }), 'a')).not.toContain('the_trap');
    expect(got(hand({ hole: { a: 'Ac Kc', b: 'Qs Jd' }, board: '8c 8h 8d 5s 2c', acts: line }), 'a')).not.toContain('the_trap');
  });
});

describe('Runner-Runner', () => {
  const line = `${BET} | flop: b bet 300, a call | turn: b bet 600, a call | river: b check, a bet 1000, b call`;
  it('behind on the flop and the turn, ahead on the river, counts', () => {
    expect(got(hand({ hole: { a: 'Ah Kh', b: '9c 9d' }, board: '9s 2h 5c Qh 3h', acts: line }), 'a')).toContain('runner_runner');
  });
  it('a river card that would have been enough on its own does not', () => {
    // behind a pair of nines on the flop and the turn, but the river ace wins with or without the turn
    expect(got(hand({ hole: { a: 'Ah Kh', b: '9c 8d' }, board: '9s 2h 5c Qd Ac', acts: line }), 'a')).not.toContain('runner_runner');
  });
  it('getting there on the turn, or leading all the way, does not', () => {
    expect(got(hand({ hole: { a: 'Ah Kh', b: '9c 9d' }, board: '9s 2h Qh 5h 3c', acts: line }), 'a')).not.toContain('runner_runner');
    expect(got(hand({ hole: { a: 'Ah Kh', b: '9c 9d' }, board: '2h 5h Qh 9s 3c', acts: line }), 'a')).not.toContain('runner_runner');
  });
});

describe('Survivor', () => {
  const allin = (a: string, b: string, board: string) => hand({ hole: { a, b }, board, acts: 'preflop: a allin, b call', stacks: { a: 2000, b: 10_000 } });
  it('all-in behind and winning counts', () => {
    expect(got(allin('7c 7d', 'As Ah', '7h 2s 9d Kc 4h'), 'a')).toContain('survivor');
  });
  it('all-in ahead, or behind and losing, does not; nor does an all-in on the river', () => {
    expect(got(allin('As Ah', '7c 7d', '8h 2s 9d Kc 4h'), 'a')).not.toContain('survivor');
    expect(got(allin('7c 7d', 'As Ah', '8h 2s 9d Kc 4h'), 'a')).not.toContain('survivor');
    expect(got(hand({ hole: { a: '7c 7d', b: 'As Ah' }, board: '7h 2s 9d Kc 4h', acts: 'river: a allin, b call', stacks: { a: 2000, b: 10_000 } }), 'a')).not.toContain('survivor');
  });
});

describe('Ten-High Hero', () => {
  it('winning a showdown with ten-high counts', () => {
    expect(got(hand({ hole: { a: '9c 4d', b: '7c 5d' }, board: '2s 3d 6h 8c Td', acts: BET }), 'a')).toContain('ten_high_hero');
  });
  it('jack-high, losing with ten-high, or winning by a fold does not', () => {
    expect(got(hand({ hole: { a: 'Jc 4d', b: '7c 5d' }, board: '2s 3d 6h 8c Td', acts: BET }), 'a')).not.toContain('ten_high_hero');
    expect(got(hand({ hole: { a: '9c 4d', b: '7c 5d' }, board: '2s 3d 6h 8c Td', acts: BET }), 'b')).not.toContain('ten_high_hero');
    expect(got(hand({ hole: { a: '9c 4d', b: '7c 5d' }, board: '2s 3d 6h 8c Td', acts: `${BET} | river: a bet 300, b fold` }), 'a')).not.toContain('ten_high_hero');
  });
});

describe('Second Best', () => {
  it('losing with the second-best hand the board allows counts', () => {
    // best: four sevens; second best: aces full of sevens
    expect(got(hand({ hole: { a: 'As Ac', b: '7h 7d' }, board: 'Ah Kd 7s 7c 2d', acts: BET }), 'a')).toContain('second_best');
  });
  it('the third-best hand, and the winner, do not', () => {
    const h = hand({ hole: { a: 'Ks Kc', b: '7h 7d' }, board: 'Ah Kd 7s 7c 2d', acts: BET });
    expect(got(h, 'a')).not.toContain('second_best');
    expect(got(h, 'b')).not.toContain('second_best');
    expect(isSecondBest(['7h', '7d'], ['Ah', 'Kd', '7s', '7c', '2d'])).toBe(false); // the best hand is not the second best
  });
});

describe('Double Up', () => {
  const h = (stack: number, board = '8h 2s 9d Kc 4h') => hand({ hole: { a: 'As Ah', b: '7c 7d' }, board, acts: 'preflop: a allin, b call', stacks: { a: stack, b: 10_000 } });
  it('doubling a real stack in one hand counts', () => {
    expect(got(h(1500), 'a')).toContain('double_up');
  });
  it('doubling a few chips, or winning less than double, does not', () => {
    expect(got(h(500), 'a')).not.toContain('double_up');
    expect(got(hand({ hole: { a: 'As Ah', b: '7c 7d' }, board: '8h 2s 9d Kc 4h', acts: 'preflop: a bet 500, b call', stacks: { a: 1500, b: 10_000 } }), 'a')).not.toContain('double_up');
  });
});

describe('Bounty Hunter', () => {
  const bust = (victim: string, no: number) => hand({ hole: { a: 'As Ah', [victim]: '2c 7d' }, board: 'Ks 9d 4h 3c Jd', acts: `preflop: ${victim} allin, a call`, stacks: { a: 20_000, [victim]: 1000 }, no });
  it('the third knockout of the night counts, once', () => {
    expect(knockouts(bust('b', 1))).toEqual({ a: 1 });
    expect(got(bust('d', 3), 'a', { hands: [bust('b', 1), bust('c', 2)] })).toContain('bounty_hunter');
    expect(got(bust('e', 4), 'a', { hands: [bust('b', 1), bust('c', 2), bust('d', 3)] })).not.toContain('bounty_hunter');
  });
  it('two knockouts do not', () => {
    expect(got(bust('c', 2), 'a', { hands: [bust('b', 1)] })).not.toContain('bounty_hunter');
  });
});

describe('Regular', () => {
  const h = hand({ hole: { a: 'As Ah', b: '7c 7d' }, acts: 'preflop: a bet 300, b fold', no: 3 });
  it('the 100th hand gives the first tier, counting earlier tonight', () => {
    expect(got(h, 'a', { hands: [], career: { a: { hands: 99, bluffs: 0 }, b: { hands: 40, bluffs: 0 } } })).toContain('regular:1');
    expect(got(h, 'a', { hands: [hand({ hole: { a: '2c 3d', b: '4c 5d' }, no: 1 }), hand({ hole: { a: '2c 3d', b: '4c 5d' }, no: 2 })], career: { a: { hands: 97, bluffs: 0 } } })).toContain('regular:1');
    expect(got(h, 'a', { hands: [], career: { a: { hands: 499, bluffs: 0 } } })).toContain('regular:2');
    expect(got(h, 'a', { hands: [], career: { a: { hands: 4999, bluffs: 0 } } })).toContain('regular:4');
  });
  it('other hands give nothing, and a tier already owned is not given again', () => {
    expect(got(h, 'b', { hands: [], career: { a: { hands: 99, bluffs: 0 }, b: { hands: 40, bluffs: 0 } } }).join()).not.toContain('regular');
    expect(got(h, 'a', { hands: [], career: { a: { hands: 99, bluffs: 0 } }, owned: { a: ['regular:1'] } }).join()).not.toContain('regular');
  });
});

describe('Night Owl', () => {
  const at = (hh: number, mm: number) => hand({ hole: { a: 'As Ah', b: '7c 7d' }, acts: 'preflop: a bet 300, b fold', at: Date.UTC(2026, 10, 7, hh, mm) });
  it('a hand after 2:00 in the morning, India time, counts for everyone dealt in', () => {
    expect(got(at(20, 45), 'a')).toContain('night_owl'); // 02:15 in India
    expect(got(at(20, 45), 'b')).toContain('night_owl');
  });
  it('1:59, and five in the morning, do not', () => {
    expect(got(at(20, 29), 'a')).not.toContain('night_owl');
    expect(got(at(23, 30), 'a')).not.toContain('night_owl');
  });
});

describe('Trust Issues', () => {
  it('20 peeks in one hand counts; 19, or no count from the phone, does not', () => {
    const h = hand({ hole: { a: 'As Ah', b: '7c 7d' }, acts: 'preflop: a bet 300, b fold', peeks: { a: 20, b: 19 } });
    expect(got(h, 'a')).toContain('trust_issues');
    expect(got(h, 'b')).not.toContain('trust_issues');
    expect(got(hand({ hole: { a: 'As Ah', b: '7c 7d' }, acts: 'preflop: a bet 300, b fold' }), 'a')).not.toContain('trust_issues');
  });
});

describe('Same Again', () => {
  const win = (hole: string, no: number, acts = 'preflop: b bet 200, a raise 800, b fold') => hand({ hole: { a: hole, b: '7c 7d' }, acts, no });
  it('winning two hands in a row with the same starting hand counts', () => {
    expect(startingHand(['Ks', 'As'])).toBe('AKs');
    expect(startingHand(['7d', '7c'])).toBe('77');
    expect(got(win('As Ks', 2), 'a', { hands: [win('Ah Kh', 1)] })).toContain('same_again');
  });
  it('suited then offsuit, a lost hand before, or a hand in between does not', () => {
    expect(got(win('As Kd', 2), 'a', { hands: [win('Ah Kh', 1)] })).not.toContain('same_again');
    expect(got(win('As Ks', 2), 'a', { hands: [win('Ah Kh', 1, 'preflop: b bet 300, a fold')] })).not.toContain('same_again');
    expect(got(win('As Ks', 3), 'a', { hands: [win('Ah Kh', 1), win('2c 9d', 2, 'preflop: b bet 300, a fold')] })).not.toContain('same_again');
  });
});

describe('Gone Fishing', () => {
  const out = (no: number) => hand({ hole: { a: '2c 9d', b: '7c 7d' }, acts: 'preflop: b bet 300, a fold*', no });
  const fine = (no: number) => hand({ hole: { a: '2c 9d', b: '7c 7d' }, acts: 'preflop: b bet 300, a fold', no });
  it('timing out three hands in a row counts', () => {
    expect(got(out(3), 'a', { hands: [out(1), out(2)] })).toContain('gone_fishing');
  });
  it('two in a row, or a hand played in between, does not', () => {
    expect(got(out(2), 'a', { hands: [out(1)] })).not.toContain('gone_fishing');
    expect(got(out(4), 'a', { hands: [out(1), fine(2), out(3)] })).not.toContain('gone_fishing');
    expect(got(fine(3), 'a', { hands: [out(1), out(2)] })).not.toContain('gone_fishing');
  });
});
