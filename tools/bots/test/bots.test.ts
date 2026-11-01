import { describe, it, expect } from 'vitest';
import { Engine } from '@tp/engine';
import { decide, rng, strength, STRATEGIES } from '../src/index';
import { playGame } from '../src/run';

describe('bots', () => {
  it('every strategy only ever makes legal moves, across table sizes and rules', () => {
    for (const players of [2, 3, 6, 9, 15]) {
      const rep = playGame({ seed: players * 31, players, hands: 120, config: { dealItTwice: true, straddle: true, anteFromLevel: 2, blindUpEvery: 15 } });
      expect(rep.hands).toBe(120);
      expect(rep.chipErrors).toBe(0);
      expect(rep.stuck).toBe(0);
      expect(rep.replayOk).toBe(true);
    }
  });
  it('a bot only acts on its own turn', () => {
    const e = Engine.create('t', {}, 0);
    e.apply({ t: 'join', id: 'a', name: 'A', now: 0 });
    e.apply({ t: 'join', id: 'b', name: 'B', now: 0 });
    e.apply({ t: 'start', seed: '2'.repeat(64), now: 0 });
    const waiting = e.s.hand!.order.find((p) => p !== e.s.hand!.toAct)!;
    for (const s of STRATEGIES) expect(decide(e.viewFor(waiting), s, rng(1))).toBeNull();
    expect(strength(e.viewFor(null))).toBe(0);
  });
  it('the tight bot rates strong hands higher', () => {
    const e = Engine.create('t', {}, 0);
    e.apply({ t: 'join', id: 'a', name: 'A', now: 0 });
    e.apply({ t: 'join', id: 'b', name: 'B', now: 0 });
    e.apply({ t: 'start', seed: '3'.repeat(64), now: 0 });
    const h = e.s.hand!;
    h.ps.a!.cards = [48, 49]; // pair of aces
    h.ps.b!.cards = [0, 21]; // 2s 7h
    expect(strength(e.viewFor('a'))).toBeGreaterThan(strength(e.viewFor('b')));
  });
  it('same seed, same game', () => {
    expect(playGame({ seed: 9, players: 4, hands: 50 })).toEqual(playGame({ seed: 9, players: 4, hands: 50 }));
  });
});
