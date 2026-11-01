// The original engine tests from the vanilla-JS app, moved to Vitest unchanged in meaning.
// They prove the TypeScript move kept the rules exactly as they were.
import { describe, it, expect } from 'vitest';
import { Engine } from '../src/engine';
import { evalBest, parseCard } from '../src/cards';
import type { Action } from '../src/types';

const ev = (s: string) => evalBest(s.split(' ').map(parseCard))!;
const total = (e: Engine) => e.s.players.reduce((a, p) => a + p.stack, 0) + (e.s.phase === 'hand' ? e.potTotal() : 0);

describe('legacy: evaluator', () => {
  it('names and orders hands', () => {
    expect(ev('As Ks Qs Js Ts 2c 3d').name).toBe('Royal Flush');
    expect(ev('Ah 2c 3d 4s 5h 9c Kd').desc).toBe('Straight, Five high');
    expect(ev('6h 2c 3d 4s 5h 9c Kd').score).toBeGreaterThan(ev('Ah 2c 3d 4s 5h 9c Kd').score);
    expect(ev('Kh Kd 7s 7c 2h 2d Ac').desc).toBe('Two Pair, Kings and Sevens');
    expect(ev('Kh Kd Ks 7c 7h 2d 2c').desc).toBe('Full House, Kings full of Sevens');
    expect(ev('Ah Ad Kc 9s 7d 4c 2h').score).toBeGreaterThan(ev('Ah Ad Qc 9s 7d 4c 2h').score);
    expect(ev('2h 3h 4h 7h 9h Ah Kd').name).toBe('Flush');
    expect(ev('2h 3h 4h 5h Ah 9c Kd').desc).toBe('Straight Flush, Five high');
  });
});

describe('legacy: random simulation', () => {
  it('conserves chips and never gets stuck over 300 games', () => {
    let hands = 0, showdowns = 0, sidepots = 0, splits = 0;
    for (let g = 0; g < 300; g++) {
      const n = 2 + (g % 8);
      const e = Engine.newGame({ startStack: 200 + (g % 5) * 137, sb: 5, bb: 10, blindUpEvery: g % 3 === 0 ? 5 : 0 }, Array.from({ length: n }, (_, i) => 'P' + i));
      const T = total(e);
      for (let k = 0; k < 60 && e.canStartHand(); k++) {
        e.startHand(); hands++;
        let guard = 0;
        while (e.s.phase === 'hand') {
          const pid = e.s.hand!.toAct;
          expect(pid).toBeTruthy();
          const L = e.legal(pid!)!;
          expect(L).toBeTruthy();
          const r = Math.random();
          let a: Action;
          if (r < 0.15) a = { type: 'fold' };
          else if (r < 0.5) a = { type: L.canCheck ? 'check' : 'call' };
          else if (r < 0.85 && L.canRaise) a = { type: 'raise', to: L.minTo + Math.floor(Math.random() * (L.maxTo - L.minTo + 1)) };
          else if (r < 0.92) a = { type: 'allin' };
          else a = { type: L.canCheck ? 'check' : 'call' };
          const res = e.act(pid!, a);
          expect(res.error, `${res.error} ${JSON.stringify(a)} ${JSON.stringify(L)}`).toBeUndefined();
          expect(total(e)).toBe(T);
          if (++guard > 500) throw new Error('stuck');
        }
        const R = e.s.hand!.results!;
        if (R.showdown) showdowns++;
        if (R.pots.length > 1) sidepots++;
        if (R.pots.some((p) => p.awards.length > 1)) splits++;
        expect(total(e)).toBe(T);
        for (const p of e.s.players) expect(p.stack).toBeGreaterThanOrEqual(0);
      }
    }
    expect(hands).toBeGreaterThan(1000);
    expect(showdowns).toBeGreaterThan(0);
    expect(sidepots).toBeGreaterThan(0);
    expect(splits).toBeGreaterThan(0);
  });
});

describe('legacy: scenarios', () => {
  it('heads-up: button posts SB, acts first preflop, BB acts first after', () => {
    const e = Engine.newGame({ startStack: 1000, sb: 5, bb: 10 }, ['A', 'B']);
    e.startHand();
    const h = e.s.hand!;
    expect(h.sbId).toBe(h.buttonId);
    expect(h.toAct).toBe(h.buttonId);
    e.act(h.toAct!, { type: 'call' });
    expect(e.s.hand!.toAct).toBe(h.bbId);
    e.act(h.bbId!, { type: 'check' });
    expect(e.s.hand!.street).toBe('flop');
    expect(e.s.hand!.toAct).toBe(h.bbId);
  });

  it('incomplete all-in raise does not reopen betting', () => {
    const e = Engine.newGame({ startStack: 1000, sb: 5, bb: 10 }, ['A', 'B', 'C']);
    e.startHand();
    const [sb, bb, btn] = e.s.hand!.order as [string, string, string];
    e.player(btn)!.stack = 1000;
    e.act(btn, { type: 'raise', to: 100 });
    e.player(sb)!.stack = 120;
    e.act(sb, { type: 'allin' });
    expect(e.s.hand!.currentBet).toBe(125);
    e.act(bb, { type: 'call' });
    const L = e.legal(btn)!;
    expect(L.canRaise).toBe(false);
    expect(L.toCall).toBe(25);
  });

  it('builds a main pot and a side pot', () => {
    const e = Engine.newGame({ startStack: 1000, sb: 5, bb: 10 }, ['A', 'B', 'C']);
    e.startHand();
    const [sb, bb, btn] = e.s.hand!.order as [string, string, string];
    e.player(btn)!.stack = 50;
    e.act(btn, { type: 'allin' });
    e.act(sb, { type: 'raise', to: 300 });
    e.act(bb, { type: 'call' });
    while (e.s.phase === 'hand') e.act(e.s.hand!.toAct!, { type: 'check' });
    const pots = e.s.hand!.results!.pots;
    expect(pots.map((p) => p.amount)).toEqual([150, 500]);
  });

  it('undo restores the previous action', () => {
    const e = Engine.newGame({}, ['A', 'B', 'C']);
    e.startHand();
    const who = e.s.hand!.toAct!;
    e.act(who, { type: 'fold' });
    expect(e.canUndo()).toBe(true);
    e.undo();
    expect(e.s.hand!.toAct).toBe(who);
    expect(e.s.hand!.ps[who]!.folded).toBe(false);
  });
});
