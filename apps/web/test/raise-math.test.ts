import { describe, it, expect } from 'vitest';
import { Engine } from '@tp/engine';
import * as M from '../src/table/raise-math';

// The board's example: blinds 10/20, pot 1,300, a stack of 1,840, a minimum raise to 240.
const BOARD: M.Spot = { minTo: 240, maxTo: 1840, currentBet: 120, toCall: 120, pot: 1060, bb: 20, isBet: false };
const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

describe('raise amounts', () => {
  it('clamps to the minimum raise and the stack, in whole chips', () => {
    expect(M.clampTo(BOARD, 10)).toBe(240);
    expect(M.clampTo(BOARD, 99999)).toBe(1840);
    expect(M.clampTo(BOARD, 650.4)).toBe(650);
    expect(M.clampTo(BOARD, Number.NaN)).toBe(240);
  });

  it('− and + move one big blind at small amounts, five with Shift, and stop at the ends', () => {
    expect(M.stepTo(BOARD, 650, 1)).toBe(660); // snaps up to the next multiple of the step
    expect(M.stepTo(BOARD, 660, 1)).toBe(680);
    expect(M.stepTo(BOARD, 650, -1)).toBe(640);
    expect(M.stepTo(BOARD, 650, 1, 5)).toBe(740);
    expect(M.stepTo(BOARD, 240, -1)).toBe(240);
    expect(M.stepTo(BOARD, 1830, 1)).toBe(1840);
    expect(M.stepTo(BOARD, 1840, 1)).toBe(1840);
    expect(M.stepTo(BOARD, 250, -1, 5)).toBe(240);
  });

  it('− and + steps grow with the bet (big blind 100)', () => {
    const big: M.Spot = { minTo: 200, maxTo: 100000, currentBet: 100, toCall: 100, pot: 150, bb: 100, isBet: false };
    expect(M.stepTo(big, 1237, 1)).toBe(1300);
    expect(M.stepTo(big, 1237, -1)).toBe(1200);
    expect(M.stepTo(big, 3000, 1)).toBe(3100);
    expect(M.stepTo(big, 6000, 1)).toBe(6200);
    expect(M.stepTo(big, 15000, 1)).toBe(15500);
    expect(M.stepTo(big, 40000, 1)).toBe(42000);
    expect(M.stepTo(big, 40000, -1)).toBe(38000);
    expect(M.stepTo(big, 200, -1)).toBe(200);
    expect(M.stepTo(big, 99000, 1)).toBe(100000);
    expect(M.niceStep(1237, 100)).toBe(100);
    expect(M.niceStep(15000, 100)).toBe(500);
    expect(M.niceStep(40000, 100)).toBe(2000);
    expect(M.niceStep(10, 1)).toBe(1);
  });

  it('presets: a pot-sized raise first matches the bet, then raises by the pot', () => {
    // pot 1,060 + 120 to call = 1,180 after the call; pot raise = 120 + 1,180
    const ps = Object.fromEntries(M.presets(BOARD).map((p) => [p.key, p.to]));
    expect(ps).toEqual({ min: 240, half: 120 + 590, tq: 120 + 885, pot: 1300, all: 1840 });
    expect(M.presets(BOARD).map((p) => p.label)).toEqual(['Min', '½ pot', '¾ pot', 'Pot', 'All-in']);
  });

  it('presets never leave the legal range', () => {
    const short: M.Spot = { ...BOARD, maxTo: 500 };
    const ps = M.presets(short);
    expect(ps.every((p) => p.to >= short.minTo && p.to <= short.maxTo)).toBe(true);
    expect(ps.find((p) => p.key === 'pot')!.to).toBe(500);
    const tinyPot: M.Spot = { minTo: 20, maxTo: 2000, currentBet: 0, toCall: 0, pot: 30, bb: 20, isBet: true };
    expect(M.presets(tinyPot).find((p) => p.key === 'half')!.to).toBe(20); // half of 30 is under the minimum bet
    expect(M.presets(tinyPot).find((p) => p.key === 'pot')!.to).toBe(30);
  });

  it('↑ and ↓ walk the presets in order', () => {
    expect(M.nextPreset(BOARD, 240, 1)).toBe(710);
    expect(M.nextPreset(BOARD, 700, 1)).toBe(710);
    expect(M.nextPreset(BOARD, 710, 1)).toBe(1005);
    expect(M.nextPreset(BOARD, 1300, 1)).toBe(1840);
    expect(M.nextPreset(BOARD, 1840, 1)).toBe(1840);
    expect(M.nextPreset(BOARD, 1840, -1)).toBe(1300);
    expect(M.nextPreset(BOARD, 711, -1)).toBe(710);
    expect(M.nextPreset(BOARD, 240, -1)).toBe(240);
  });

  it('the lit preset is the one picked while the amount is its own', () => {
    const short: M.Spot = { ...BOARD, maxTo: 1300 }; // pot and all-in are the same amount
    expect(M.selected(short, 1300, 'pot')).toBe('pot');
    expect(M.selected(short, 1300, null)).toBe('all');
    expect(M.selected(BOARD, 710, null)).toBe('half');
    expect(M.selected(BOARD, 730, 'half')).toBe(null);
  });

  it('typing: above the stack is all-in, below the minimum raises the minimum', () => {
    expect(M.typedTo(BOARD, '1200')).toEqual({ to: 1200, below: false, over: false });
    expect(M.typedTo(BOARD, '99999')).toEqual({ to: 1840, below: false, over: true });
    expect(M.typedTo(BOARD, '1840')).toEqual({ to: 1840, below: false, over: true });
    expect(M.typedTo(BOARD, '12')).toEqual({ to: 240, below: true, over: false });
    expect(M.typedTo(BOARD, '')).toEqual({ to: 240, below: true, over: false });
  });

  it('typing keys: digits, 00, delete, no leading zeros, not endlessly long', () => {
    let d = '';
    for (const k of ['0', '1', '2', '0', '0']) d = M.typeKey(BOARD, d, k);
    expect(d).toBe('1200');
    expect(M.typeKey(BOARD, d, '⌫')).toBe('120');
    expect(M.typeKey(BOARD, d, 'Backspace')).toBe('120');
    expect(M.typeKey(BOARD, d, 'x')).toBe('1200');
    expect(M.typeKey(BOARD, '18400', '0')).toBe('18400'); // five digits is already more than 1,840
    expect(M.typeKey(BOARD, '', '0')).toBe('');
  });

  it('the slider: curved, ends exact, round amounts between, positions round-trip', () => {
    expect(M.sliderTo(BOARD, 0)).toBe(240);
    expect(M.sliderTo(BOARD, -1)).toBe(240);
    expect(M.sliderTo(BOARD, 1)).toBe(1840);
    expect(M.sliderTo(BOARD, 0.999)).toBe(1840);
    // halfway along the track is a quarter of the way through the range: 240 + 1,600 / 4
    expect(M.sliderTo(BOARD, 0.5)).toBe(640);
    expect(M.sliderPos(BOARD, 240)).toBe(0);
    expect(M.sliderPos(BOARD, 1840)).toBe(1);
    expect(M.sliderPos(BOARD, 640)).toBe(0.5);
    expect(M.sliderPos({ ...BOARD, maxTo: 240 }, 240)).toBe(1);
    // finer near the minimum: the first tenth of the track moves less than 20 chips
    expect(M.sliderTo(BOARD, 0.1) - 240).toBeLessThanOrEqual(20);
    // never runs backwards
    let last = 0;
    for (let i = 0; i <= 200; i++) { const v = M.sliderTo(BOARD, i / 200); expect(v).toBeGreaterThanOrEqual(last); last = v; }
    // bigger stacks snap to bigger round amounts
    const big: M.Spot = { minTo: 200, maxTo: 100000, currentBet: 100, toCall: 100, pot: 150, bb: 100, isBet: false };
    expect(M.sliderTo(big, 0.7) % 1000).toBe(0);
  });

  it('holding: repeats every 120 ms, every 60 ms after a second', () => {
    expect(M.HOLD_START).toBeGreaterThanOrEqual(120);
    expect(M.holdEvery(0)).toBe(120);
    expect(M.holdEvery(999)).toBe(120);
    expect(M.holdEvery(1000)).toBe(60);
    expect(M.holdEvery(5000)).toBe(60);
  });

  it('words: bet or raise, and all-in at the top', () => {
    const bet: M.Spot = { ...BOARD, isBet: true, currentBet: 0, toCall: 0, minTo: 20 };
    expect(M.title(BOARD)).toBe('Raise');
    expect(M.title(bet)).toBe('Bet');
    expect(M.goLabel(BOARD, 650, fmt)).toBe('Raise to 650');
    expect(M.goLabel(bet, 650, fmt)).toBe('Bet 650');
    expect(M.goLabel(BOARD, 1840, fmt)).toBe('All-in 1,840');
    expect(M.underLabel(BOARD, 650, fmt)).toBe('raise to · min 240');
    expect(M.underLabel(bet, 650, fmt)).toBe('bet · min 20');
    expect(M.underLabel(BOARD, 1840, fmt)).toBe('all your chips');
    expect(M.actionFor(BOARD, 650)).toEqual({ type: 'raise', to: 650 });
    expect(M.actionFor(bet, 60)).toEqual({ type: 'bet', to: 60 });
    expect(M.actionFor(BOARD, 1840)).toEqual({ type: 'allin' });
    expect(M.actionFor(BOARD, 5)).toEqual({ type: 'raise', to: 240 });
  });

  it('every amount it can send is one the engine takes as it is', () => {
    const e = Engine.newGame({ startStack: 1000, sb: 10, bb: 20 }, ['A', 'B', 'C']);
    for (const p of e.s.players) p.connected = true;
    e.startHand();
    const pid = e.s.hand!.toAct!;
    const L = e.legal(pid)!;
    const s: M.Spot = { minTo: L.minTo, maxTo: L.maxTo, currentBet: L.currentBet, toCall: L.toCall, pot: L.pot, bb: 20, isBet: L.isBet };
    const amounts = [...M.presets(s).map((p) => p.to), M.stepTo(s, s.minTo, 1, 3), M.sliderTo(s, 0.37), M.typedTo(s, '5').to, M.typedTo(s, '777').to];
    for (const to of amounts) {
      const g = Engine.fromSnapshot(e.s);
      const a = M.actionFor(s, to);
      const r = g.act(pid, a);
      expect(r.error, `${to}`).toBeUndefined();
      expect(g.s.hand!.ps[pid]!.streetBet).toBe(a.type === 'allin' ? L.maxTo : to);
    }
  });
});
