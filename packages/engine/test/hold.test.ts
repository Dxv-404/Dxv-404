import { describe, expect, it } from 'vitest';
import { Engine } from '../src';

// The table server holds the turn timer while a drama scene plays (packages/table/src/drama.ts).
describe('hold: the turn starts after a scene', () => {
  const game = () => {
    const e = Engine.create('g1', { turnTime: 20, timeBank: 0 }, 0);
    e.apply({ t: 'join', id: 'a', name: 'A', now: 0 });
    e.apply({ t: 'join', id: 'b', name: 'B', now: 0 });
    return e;
  };
  it('is refused without a hand, with a bad length, or while paused', () => {
    const e = game();
    expect(e.apply({ t: 'hold', ms: 1000, now: 1 }).error).toBeTruthy();
    expect(e.apply({ t: 'start', seed: '0'.repeat(64), now: 10 }).error).toBeUndefined();
    expect(e.apply({ t: 'hold', ms: 0, now: 11 }).error).toBeTruthy();
    expect(e.apply({ t: 'hold', ms: 60_000, now: 11 }).error).toBeTruthy();
    expect(e.apply({ t: 'host', cmd: 'pause', now: 12 }).error).toBeUndefined();
    expect(e.apply({ t: 'hold', ms: 1000, now: 13 }).error).toBeTruthy();
  });
  it('moves the deadline by the scene; holds in a row add up', () => {
    const e = game();
    e.apply({ t: 'start', seed: '0'.repeat(64), now: 10 });
    expect(e.deadline()).toBe(10 + 20_000);
    const r = e.apply({ t: 'hold', ms: 1800, now: 500 });
    expect(r.events).toEqual([{ t: 'turn', pid: e.s.hand!.toAct, deadline: 500 + 1800 + 20_000 }]);
    e.apply({ t: 'hold', ms: 800, now: 600 });
    expect(e.deadline()).toBe(500 + 1800 + 800 + 20_000);
  });
});
