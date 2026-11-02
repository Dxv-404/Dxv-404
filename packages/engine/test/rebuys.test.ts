// v3 rebuys: offered only at 0 chips, between hands (no top-ups); the host sets how many (1, 2, 3, no limit), how
// big (the starting stack or 20 to 500 big blinds) and until when (never, or after a blind level).
import { describe, it, expect } from 'vitest';
import { Engine, clampRebuyAmount, makeConfig, rebuyChips, rebuyRange } from '../src/engine';
import type { GameConfig, GameState } from '../src/types';

const SEED = (n: number) => n.toString(16).padStart(64, '0');
const T0 = 1_700_000_000_000;
let seedN = 9000;

function table(n: number, cfg: Partial<GameConfig> = {}): Engine {
  const e = Engine.create('rb', { turnTime: 0, startStack: 1000, sb: 10, bb: 20, ...cfg }, T0);
  for (let i = 0; i < n; i++) expect(e.apply({ t: 'join', id: `p${i}`, name: `P${i}`, now: T0 }).error).toBeUndefined();
  return e;
}
const start = (e: Engine) => e.apply({ t: 'start', seed: SEED(seedN++), now: T0 });
const rebuy = (e: Engine, pid: string) => e.apply({ t: 'rebuy', pid, now: T0 });
const toAct = (e: Engine) => e.s.hand!.toAct!;
function foldOut(e: Engine): void { while (e.s.phase === 'hand' && e.s.hand!.toAct) e.apply({ t: 'act', pid: toAct(e), action: { type: 'fold' }, now: T0 }); }
/** Play hands where everyone goes all-in until somebody is out of chips; returns who. */
function bustSomeone(e: Engine): string {
  for (let k = 0; k < 40; k++) {
    expect(start(e).error).toBeUndefined();
    while (e.s.phase === 'hand' && e.s.hand!.toAct) {
      const pid = toAct(e);
      const L = e.legal(pid)!;
      e.apply({ t: 'act', pid, action: { type: L.canRaise || L.toCall < e.player(pid)!.stack ? 'allin' : 'call' }, now: T0 });
    }
    const out = e.s.players.find((p) => p.stack === 0);
    if (out) return out.id;
  }
  throw new Error('nobody busted');
}
/** Chips on the table always equal chips bought. */
const conserved = (e: Engine) => {
  const all = e.s.players.concat(e.s.departed ?? []);
  expect(all.reduce((a, p) => a + p.stack, 0) + (e.s.phase === 'hand' ? e.potTotal() : 0)).toBe(all.reduce((a, p) => a + p.buyins, 0));
};

describe('rebuys: only at 0 chips, between hands', () => {
  it('a real bust-out can rebuy for the starting stack; the busted flag clears and they are dealt in next hand', () => {
    const e = table(2, { maxRebuys: 2 });
    const out = bustSomeone(e);
    const p = e.player(out)!;
    expect(p.busted).toBe(true);
    expect(e.viewFor(out).rebuy).toMatchObject({ on: true, amount: 1000, max: 2, used: 0, left: 2, can: true, why: null, atZero: true, closed: false });
    expect(rebuy(e, out).events).toEqual([{ t: 'rebuy', pid: out, amount: 1000 }]);
    expect(p).toMatchObject({ stack: 1000, buyins: 2000, rebuysUsed: 1, busted: false });
    expect(e.viewFor(out).rebuy).toMatchObject({ used: 1, left: 1, can: false, why: 'You can rebuy once you are out of chips' });
    conserved(e);
    expect(start(e).error).toBeUndefined();
    expect(e.s.hand!.ps[out]).toBeDefined();
  });

  it('no top-ups: any chips at all refuse a rebuy', () => {
    const e = table(2);
    for (const stack of [1, 19, 999, 1000, 5000]) {
      e.player('p0')!.stack = stack;
      expect(rebuy(e, 'p0').error).toBe('You can rebuy once you are out of chips');
    }
    e.player('p0')!.stack = 0;
    expect(rebuy(e, 'p0').error).toBeUndefined();
  });

  it('refused during your own live hand (all-in with nothing behind), allowed for a player not dealt in', () => {
    const e = table(3);
    expect(start(e).error).toBeUndefined();
    const inHand = e.s.hand!.order[0]!;
    e.player(inHand)!.stack = 0; // as if all-in
    expect(rebuy(e, inHand).error).toBe('Rebuy after this hand');
    foldOut(e);
    // someone out of chips and not dealt in may rebuy while the others play: they are in from the next hand
    const f = table(3);
    f.player('p2')!.stack = 0;
    f.player('p2')!.busted = true;
    expect(start(f).error).toBeUndefined();
    expect(f.s.hand!.ps.p2).toBeUndefined();
    expect(rebuy(f, 'p2').events).toEqual([{ t: 'rebuy', pid: 'p2', amount: 1000 }]);
    expect(f.s.hand!.ps.p2).toBeUndefined(); // not added to the hand in progress
    foldOut(f);
    expect(start(f).error).toBeUndefined();
    expect(f.s.hand!.ps.p2).toBeDefined();
  });
});

describe('rebuys: how many', () => {
  it.each([1, 2, 3])('a limit of %i is enforced, then "No rebuys left"', (max) => {
    const e = table(2, { maxRebuys: max });
    for (let k = 0; k < max; k++) {
      e.player('p0')!.stack = 0;
      expect(rebuy(e, 'p0').error).toBeUndefined();
      expect(e.viewFor('p0').rebuy.left).toBe(max - k - 1);
    }
    e.player('p0')!.stack = 0;
    expect(rebuy(e, 'p0').error).toBe('No rebuys left');
    expect(e.viewFor('p0').rebuy).toMatchObject({ used: max, left: 0, can: false, why: 'No rebuys left' });
    expect(e.player('p0')!.buyins).toBe(1000 * (max + 1));
  });

  it('no limit: 0 means as many as you like', () => {
    const e = table(2, { maxRebuys: 0 });
    for (let k = 0; k < 25; k++) { e.player('p0')!.stack = 0; expect(rebuy(e, 'p0').error).toBeUndefined(); }
    expect(e.viewFor('p0').rebuy).toMatchObject({ max: 0, left: null, used: 25 });
  });
});

describe('rebuys: how big', () => {
  it('a custom amount is what the stack becomes, and what counts as bought in', () => {
    const e = table(3, { rebuyAmount: 1500 });
    expect(e.s.cfg.rebuyAmount).toBe(1500);
    expect(e.viewFor('p1').rebuy.amount).toBe(1500);
    e.player('p1')!.stack = 0;
    expect(rebuy(e, 'p1').events).toEqual([{ t: 'rebuy', pid: 'p1', amount: 1500 }]);
    expect(e.player('p1')).toMatchObject({ stack: 1500, buyins: 2500 });
    const st = e.standings().find((s) => s.id === 'p1')!;
    expect(st.buyins).toBe(2500);
    expect(st.net).toBe(-1000); // 1,500 chips for 2,500 bought: down 1,000
  });

  it('a custom amount is kept between 20 and 500 big blinds', () => {
    expect(rebuyRange(20)).toEqual([400, 10000]);
    expect(clampRebuyAmount(100, 20)).toBe(400);
    expect(clampRebuyAmount(20000, 20)).toBe(10000);
    expect(clampRebuyAmount(1234.4, 20)).toBe(1234);
    expect(clampRebuyAmount(0, 20)).toBe(0);
    expect(clampRebuyAmount(-5, 20)).toBe(0);
    expect(clampRebuyAmount(Number.NaN, 20)).toBe(0);
    expect(makeConfig({ bb: 10, rebuyAmount: 50 }).rebuyAmount).toBe(200);
    expect(makeConfig({ bb: 10, rebuyAmount: 99999 }).rebuyAmount).toBe(5000);
    expect(rebuyChips(makeConfig({ startStack: 700 }))).toBe(700);
    expect(rebuyChips(makeConfig({ startStack: 700, bb: 10, rebuyAmount: 300 }))).toBe(300);
  });
});

describe('rebuys: when they close', () => {
  it('open through the set level, closed after it (and the view says so)', () => {
    const e = table(2, { rebuyUntilLevel: 2, blindUpEvery: 1 });
    start(e); foldOut(e); // level 1
    start(e); foldOut(e); // level 2
    expect(e.s.level.n).toBe(2);
    e.player('p0')!.stack = 0;
    expect(e.viewFor('p0').rebuy).toMatchObject({ closed: false, can: true, untilLevel: 2 });
    expect(rebuy(e, 'p0').error).toBeUndefined();
    start(e); foldOut(e); // level 3
    e.player('p0')!.stack = 0;
    expect(rebuy(e, 'p0').error).toBe('Rebuys have closed');
    expect(e.viewFor('p0').rebuy).toMatchObject({ closed: true, can: false, why: 'Rebuys have closed' });
    expect(e.viewFor(null).rebuy).toMatchObject({ closed: true, can: false, why: 'You are watching' });
  });
  it('never closes when the level is 0', () => {
    const e = table(2, { blindUpEvery: 1 });
    for (let k = 0; k < 6; k++) { start(e); foldOut(e); }
    e.player('p0')!.stack = 0;
    expect(rebuy(e, 'p0').error).toBeUndefined();
  });
});

describe('rebuys: undo, saves and replays', () => {
  it('undoing an action in the hand keeps a rebuy made meanwhile by someone not in it', () => {
    const e = table(3);
    e.player('p2')!.stack = 0; e.player('p2')!.busted = true;
    start(e);
    const first = toAct(e);
    e.apply({ t: 'act', pid: first, action: { type: 'call' }, now: T0 });
    expect(rebuy(e, 'p2').error).toBeUndefined();
    expect(e.apply({ t: 'host', cmd: 'undo', now: T0 }).error).toBeUndefined();
    expect(toAct(e)).toBe(first); // the call is undone
    expect(e.player('p2')).toMatchObject({ stack: 1000, buyins: 2000, rebuysUsed: 1, busted: false }); // the rebuy is not
    foldOut(e);
  });

  it('a rebuy and the hands after it replay exactly', () => {
    const e = table(2, { maxRebuys: 3, rebuyAmount: 800 });
    const snap = e.snapshot();
    const from = e.inputs.length;
    const out = bustSomeone(e);
    rebuy(e, out);
    start(e); foldOut(e);
    const again = Engine.replay(snap, e.inputs.slice(from));
    expect(again.s.players).toEqual(e.s.players);
  });

  it('tables saved before v3 load and keep their own rule (top-ups to the starting stack)', () => {
    const e = table(2);
    const old = e.snapshot() as GameState & { cfg: Partial<GameConfig> };
    old.cfg.rebuyBelow = 1000; // what makeConfig used to store
    delete old.cfg.rebuyAmount;
    const back = Engine.fromSnapshot(old as GameState);
    back.player('p0')!.stack = 400;
    expect(back.apply({ t: 'rebuy', pid: 'p0', now: T0 }).events).toEqual([{ t: 'rebuy', pid: 'p0', amount: 600 }]);
    expect(back.viewFor('p0').rebuy).toMatchObject({ amount: 1000, atZero: false, max: 0 });
    // the very first app's tables (v1) load with the new rule
    const v1 = Engine.fromSnapshot({ v: 1, gameId: 'old', cfg: { startStack: 1000, sb: 5, bb: 10, blindUpEvery: 0, turnTime: 0, rebuys: true }, level: { sb: 5, bb: 10, n: 1 }, players: [{ id: 'a', name: 'A', seat: 0, stack: 0, buyins: 1000 }, { id: 'b', name: 'B', seat: 1, stack: 2000, buyins: 1000 }], button: 0, handNo: 3, hand: null, phase: 'between', log: [], stats: {}, paused: false } as unknown as GameState);
    expect(v1.apply({ t: 'rebuy', pid: 'a', now: T0 }).events).toEqual([{ t: 'rebuy', pid: 'a', amount: 1000 }]);
    expect(v1.apply({ t: 'rebuy', pid: 'b', now: T0 }).error).toBe('You can rebuy once you are out of chips');
  });

  it('a player who leaves out of chips and comes back keeps their rebuys used', () => {
    const e = table(3, { maxRebuys: 1 });
    e.player('p0')!.stack = 0;
    rebuy(e, 'p0');
    e.player('p0')!.stack = 0; e.player('p0')!.busted = true;
    e.apply({ t: 'host', cmd: 'remove', pid: 'p0', now: T0 });
    e.apply({ t: 'join', id: 'p0', name: 'P0', now: T0 });
    expect(e.player('p0')).toMatchObject({ stack: 0, rebuysUsed: 1 });
    expect(rebuy(e, 'p0').error).toBe('No rebuys left');
  });

  it('the view tells a player their night so far', () => {
    const e = table(2);
    start(e); foldOut(e);
    const v = e.viewFor('p0');
    expect(v.stats).not.toBeNull();
    expect(v.cfg).toMatchObject({ maxRebuys: 0, rebuyUntilLevel: 0 });
    expect(e.viewFor(null).stats).toBeNull();
    const won = e.s.players.find((p) => (e.s.stats[p.id]?.won ?? 0) > 0)!;
    expect(e.viewFor(won.id).stats!.biggest).toBeGreaterThan(0);
  });
});
