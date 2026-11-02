// Engine v2: one named test per rule in the plan, driven only through inputs (time and seeds passed in).
import { describe, it, expect } from 'vitest';
import { Engine, TABLE_DEFAULTS, anteFor, makeConfig } from '../src/engine';
import { verifyDeck, seedCommit, randomSeed } from '../src/fair';
import type { GameConfig, GameEvent, GameState, Input } from '../src/types';

const SEED = (n: number) => n.toString(16).padStart(64, '0');
const T0 = 1_700_000_000_000;

function table(n: number, cfg: Partial<GameConfig> = {}): Engine {
  const e = Engine.create('g1', { turnTime: 0, ...cfg }, T0);
  for (let i = 0; i < n; i++) expect(e.apply({ t: 'join', id: `p${i}`, name: `P${i}`, now: T0 }).error).toBeUndefined();
  return e;
}
let handSeed = 1;
const start = (e: Engine, now = T0, contributions?: string[]) => e.apply({ t: 'start', seed: SEED(handSeed++), now, ...(contributions ? { contributions } : {}) });
const act = (e: Engine, pid: string, type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin', to?: number, now = T0) =>
  e.apply({ t: 'act', pid, action: { type, to }, now });
const toAct = (e: Engine) => e.s.hand!.toAct!;
const total = (e: Engine) => e.s.players.reduce((a, p) => a + p.stack, 0) + (e.s.phase === 'hand' ? e.potTotal() : 0) + (e.s.departed ?? []).reduce((a, p) => a + p.stack, 0);
const buyins = (e: Engine) => e.s.players.concat(e.s.departed ?? []).reduce((a, p) => a + p.buyins, 0);
/** Everyone checks or calls until the hand ends. */
function checkDown(e: Engine, now = T0): void {
  let guard = 0;
  while (e.s.phase === 'hand' && e.s.hand!.toAct && guard++ < 200) {
    const pid = toAct(e);
    act(e, pid, e.legal(pid)!.canCheck ? 'check' : 'call', undefined, now);
  }
}
/** First to act folds until the hand ends. */
function foldOut(e: Engine): void { while (e.s.phase === 'hand' && e.s.hand!.toAct) act(e, toAct(e), 'fold'); }
const chairOf = (e: Engine, id: string | null) => (id ? e.player(id)!.chair : null);

describe('players 2 to 15', () => {
  it('seats up to the table maximum and refuses the next', () => {
    const e = table(15);
    expect(e.apply({ t: 'join', id: 'x', name: 'X', now: T0 }).error).toBe('The table is full');
    const small = table(2, { maxPlayers: 2 });
    expect(small.apply({ t: 'join', id: 'x', name: 'X', now: T0 }).error).toBe('The table is full');
    expect(makeConfig({ maxPlayers: 40 }).maxPlayers).toBe(15);
    expect(makeConfig({ maxPlayers: 1 }).maxPlayers).toBe(2);
  });
  it('refuses duplicate ids, taken chairs, and joins after the game ends', () => {
    const e = table(2);
    expect(e.apply({ t: 'join', id: 'p0', name: 'Again', now: T0 }).error).toBe('Already at the table');
    expect(e.apply({ t: 'join', id: 'z', name: 'Z', chair: 0, now: T0 }).error).toBe('That chair is taken');
    expect(e.apply({ t: 'join', id: 'z', name: 'Z', chair: 99, now: T0 }).error).toBe('That chair is taken');
    expect(e.apply({ t: 'join', id: 'z', name: 'Z', chair: 7, now: T0 }).error).toBeUndefined();
    expect(e.player('z')!.chair).toBe(7);
    e.apply({ t: 'host', cmd: 'end', now: T0 });
    expect(e.apply({ t: 'join', id: 'q', name: 'Q', now: T0 }).error).toBe('The game has ended');
  });
  it('a player joining mid-game waits for the big blind, then is dealt in as the big blind', () => {
    const e = table(4);
    start(e); foldOut(e); // big blind was chair 2
    e.apply({ t: 'join', id: 'late', name: 'Late', now: T0 }); // chair 4
    expect(e.player('late')!.waitForBB).toBe(true);
    start(e); // big blind moves to chair 3
    expect(e.s.hand!.order).not.toContain('late');
    foldOut(e);
    start(e); // big blind reaches chair 4
    expect(e.s.hand!.bbId).toBe('late');
    expect(e.player('late')!.waitForBB).toBe(false);
  });
});

describe('dead button', () => {
  it('the big blind always moves forward; the button moves to where the small blind was', () => {
    const e = table(4);
    start(e);
    expect([chairOf(e, e.s.hand!.buttonId), chairOf(e, e.s.hand!.sbId), chairOf(e, e.s.hand!.bbId)]).toEqual([0, 1, 2]);
    foldOut(e);
    start(e);
    expect([chairOf(e, e.s.hand!.buttonId), chairOf(e, e.s.hand!.sbId), chairOf(e, e.s.hand!.bbId)]).toEqual([1, 2, 3]);
  });
  it('when the small blind leaves, the button is dead for a hand', () => {
    const e = table(4);
    start(e); foldOut(e);
    e.apply({ t: 'host', cmd: 'remove', pid: 'p1', now: T0 }); // last hand's small blind
    start(e);
    const h = e.s.hand!;
    expect(h.buttonId).toBeNull();
    expect(h.buttonChair).toBe(1);
    expect(h.sbId).toBe('p2');
    expect(h.bbId).toBe('p3');
    expect(h.order).toEqual(['p2', 'p3', 'p0']);
    expect(toAct(e)).toBe('p0');
    expect(e.viewFor('p0').button).toBe(-1);
    expect(e.s.log.some((l) => l.text.includes('an empty seat has the button'))).toBe(true);
  });
  it('when the big blind leaves, the small blind is dead for a hand', () => {
    const e = table(4);
    start(e); foldOut(e);
    e.apply({ t: 'host', cmd: 'remove', pid: 'p2', now: T0 }); // last hand's big blind
    start(e);
    const h = e.s.hand!;
    expect(h.sbId).toBeNull();
    expect(h.bbId).toBe('p3');
    expect(h.buttonId).toBe('p1');
    expect(e.potTotal()).toBe(10);
    expect(toAct(e)).toBe('p0');
  });
  it('dropping to two players switches to heads-up rules', () => {
    const e = table(3);
    start(e); foldOut(e);
    e.apply({ t: 'host', cmd: 'remove', pid: 'p0', now: T0 });
    start(e);
    const h = e.s.hand!;
    expect(h.order).toHaveLength(2);
    expect(h.buttonId).toBe(h.sbId);
    expect(toAct(e)).toBe(h.buttonId);
  });
  it('a removed player who is still in the hand leaves when it ends', () => {
    const e = table(3);
    start(e);
    e.apply({ t: 'host', cmd: 'remove', pid: 'p1', now: T0 });
    expect(e.player('p1')!.leaving).toBe(true);
    checkDown(e);
    expect(e.player('p1')).toBeUndefined();
    expect(total(e)).toBe(buyins(e));
  });
});

describe('missed blinds', () => {
  it('a player who sits out while the big blind passes owes it, and can wait for the big blind', () => {
    const e = table(4);
    start(e); foldOut(e); // btn 0, sb 1, bb 2
    e.apply({ t: 'sitOut', pid: 'p3', now: T0 });
    start(e); // bb skips chair 3 and lands on chair 0
    expect(e.s.hand!.bbId).toBe('p0');
    expect(e.player('p3')!.missedBB).toBe(true);
    foldOut(e);
    e.apply({ t: 'sitIn', pid: 'p3', postNow: false, now: T0 });
    expect(e.player('p3')!.waitForBB).toBe(true);
    for (let i = 0; i < 2; i++) { start(e); expect(e.s.hand!.order).not.toContain('p3'); foldOut(e); }
    start(e);
    expect(e.s.hand!.bbId).toBe('p3');
    expect(e.player('p3')!.missedBB).toBe(false);
    expect(e.player('p3')!.waitForBB).toBe(false);
  });
  it('or posts the missed big blind and plays straight away', () => {
    const e = table(4);
    start(e); foldOut(e);
    e.apply({ t: 'sitOut', pid: 'p3', now: T0 });
    start(e); foldOut(e);
    e.apply({ t: 'sitIn', pid: 'p3', postNow: true, now: T0 });
    const r = start(e);
    expect(e.s.hand!.order).toContain('p3');
    expect(r.events!.some((x) => x.t === 'blind' && x.kind === 'missedbb' && x.pid === 'p3')).toBe(true);
    expect(e.player('p3')!.missedBB).toBe(false);
  });
  it('a player sitting out in the small blind owes a dead small blind', () => {
    const e = table(4);
    start(e); foldOut(e); // bb was chair 2
    e.apply({ t: 'sitOut', pid: 'p2', now: T0 });
    start(e); // small blind position is chair 2: dead
    expect(e.s.hand!.sbId).toBeNull();
    expect(e.player('p2')!.missedSB).toBe(true);
    foldOut(e);
    e.apply({ t: 'sitIn', pid: 'p2', postNow: true, now: T0 });
    const r = start(e);
    expect(r.events!.some((x) => x.t === 'blind' && x.kind === 'deadsb' && x.pid === 'p2')).toBe(true);
    expect(e.s.hand!.ps.p2!.streetBet).toBe(0); // dead money is not a bet
    expect(e.s.hand!.ps.p2!.total).toBe(5);
  });
  it('if everyone else is waiting, they are dealt in rather than stalling the table', () => {
    const e = table(3);
    start(e); foldOut(e);
    e.player('p1')!.waitForBB = true; // the big blind moves to p0; both others are waiting
    e.player('p2')!.waitForBB = true;
    expect(e.canStartHand()).toBe(true);
    start(e);
    expect(e.s.hand!.order).toHaveLength(3);
  });
});

describe('sitting out and away', () => {
  it('three hands sat out in a row turns a player to Away; sitting back in clears it', () => {
    const e = table(3);
    e.apply({ t: 'sitOut', pid: 'p2', now: T0 });
    for (let i = 0; i < 3; i++) { start(e); foldOut(e); }
    expect(e.player('p2')!.away).toBe(true);
    expect(e.viewFor('p0').players.find((p) => p.id === 'p2')!.away).toBe(true);
    const r = e.apply({ t: 'sitIn', pid: 'p2', postNow: false, now: T0 });
    expect(r.events).toEqual([{ t: 'sit', pid: 'p2', out: false, away: false }]);
    expect(e.player('p2')!.away).toBe(false);
  });
  it('legacy setSitOut(false) brings a player straight back in', () => {
    const e = table(3);
    e.setSitOut('p1', true);
    e.setSitOut('p1', false);
    expect(e.player('p1')!.sittingOut).toBe(false);
  });
});

describe('antes', () => {
  it('everyone dealt in posts the ante as dead money', () => {
    const e = table(4, { anteFromLevel: 1 });
    expect(e.s.level.ante).toBe(anteFor(10));
    const r = start(e);
    expect(r.events!.filter((x) => x.t === 'ante')).toHaveLength(4);
    expect(e.potTotal()).toBe(15 + 4 * e.s.level.ante);
    expect(e.legal(toAct(e))!.toCall).toBe(10);
    checkDown(e);
    expect(total(e)).toBe(buyins(e));
  });
  it('antes start at the configured level as blinds rise', () => {
    const e = table(3, { blindUpEvery: 1, anteFromLevel: 3 });
    const antes: number[] = [];
    for (let i = 0; i < 4; i++) { start(e); antes.push(e.s.level.ante); foldOut(e); }
    expect(antes[0]).toBe(0);
    expect(antes[1]).toBe(0);
    expect(antes[2]).toBeGreaterThan(0);
  });
  it('a player with fewer chips than the ante is all-in for what they have', () => {
    const e = table(3, { anteFromLevel: 1, bb: 100, sb: 50 });
    e.player('p0')!.stack = 5;
    start(e);
    expect(e.s.hand!.ps.p0!.allIn).toBe(true);
    expect(e.player('p0')!.stack).toBe(0);
  });
});

describe('straddle', () => {
  it('is refused when the table has straddles off', () => {
    const e = table(4);
    expect(e.apply({ t: 'straddle', pid: 'p0', on: true, now: T0 }).error).toBe('Straddles are off at this table');
    expect(e.apply({ t: 'straddle', pid: 'zz', on: true, now: T0 }).error).toBe('Unknown player');
  });
  it('the player after the big blind posts two big blinds and acts last before the flop', () => {
    const e = table(4, { straddle: true });
    e.apply({ t: 'straddle', pid: 'p3', on: true, now: T0 }); // p3 sits after the first big blind (chair 2)
    const r = start(e);
    expect(e.s.hand!.straddleId).toBe('p3');
    expect(r.events!.some((x) => x.t === 'blind' && x.kind === 'straddle' && x.amount === 20)).toBe(true);
    expect(e.s.hand!.currentBet).toBe(20);
    expect(toAct(e)).toBe('p0');
    act(e, 'p0', 'call'); act(e, 'p1', 'call'); act(e, 'p2', 'call');
    expect(toAct(e)).toBe('p3'); // straddler has the option
    act(e, 'p3', 'check');
    expect(e.s.hand!.street).toBe('flop');
  });
  it('raising is refused when nobody else can act, and a raise with no amount is the minimum', () => {
    const e = table(2, { startStack: 1000 });
    start(e);
    const first = toAct(e);
    act(e, first, 'raise'); // no amount: minimum raise to 20
    expect(e.s.hand!.currentBet).toBe(20);
    const other = toAct(e);
    e.player(first)!.stack = 0; // pretend the opener is all-in
    e.s.hand!.ps[first]!.allIn = true;
    expect(act(e, other, 'raise', 100).error).toBe('Raising is not allowed here');
  });
  it('no straddle heads-up', () => {
    const e = table(2, { straddle: true });
    e.apply({ t: 'straddle', pid: 'p0', on: true, now: T0 });
    e.apply({ t: 'straddle', pid: 'p1', on: true, now: T0 });
    start(e);
    expect(e.s.hand!.straddleId).toBeNull();
  });
});

describe('Deal it twice', () => {
  function allInHeadsUp(cfg: Partial<GameConfig> = {}) {
    const e = table(2, { dealItTwice: true, startStack: 101, ...cfg });
    start(e);
    act(e, toAct(e), 'allin');
    const r = act(e, toAct(e), 'call');
    return { e, r };
  }
  it('asks everyone all-in, and deals twice only when all agree', () => {
    const { e, r } = allInHeadsUp();
    expect(r.events!.some((x) => x.t === 'voteTwice')).toBe(true);
    expect(e.s.hand!.vote).not.toBeNull();
    expect(e.viewFor(null).hand!.vote!.pids).toEqual(['p1', 'p0']);
    expect(e.apply({ t: 'vote', pid: 'nobody', yes: true, now: T0 }).error).toBe('Only players in the hand vote');
    expect(e.apply({ t: 'vote', pid: 'p0', yes: true, now: T0 }).events).toEqual([]);
    expect(e.apply({ t: 'vote', pid: 'p0', yes: true, now: T0 }).error).toBe('Already voted');
    const done = e.apply({ t: 'vote', pid: 'p1', yes: true, now: T0 });
    expect(done.events!.some((x) => x.t === 'twice' && x.agreed)).toBe(true);
    const h = e.s.hand!;
    expect(h.board).toHaveLength(5);
    expect(h.board2).toHaveLength(5);
    expect(new Set([...h.board, ...h.board2!]).size).toBe(10); // nothing was dealt before the flop
    expect(h.results!.twice).toBe(true);
    expect(h.results!.pots.map((p) => p.board)).toEqual([1, 2]);
    expect(h.results!.pots.reduce((a, p) => a + p.amount, 0)).toBe(202);
    expect(e.viewFor(null).hand!.board2).toHaveLength(5);
    expect(total(e)).toBe(buyins(e));
    expect(e.apply({ t: 'vote', pid: 'p1', yes: true, now: T0 }).error).toBe('Nothing to vote on');
  });
  it('one "no" deals once', () => {
    const { e } = allInHeadsUp();
    const r = e.apply({ t: 'vote', pid: 'p0', yes: false, now: T0 });
    expect(r.events!.some((x) => x.t === 'twice' && !x.agreed)).toBe(true);
    expect(e.s.hand!.board2).toBeNull();
    expect(e.s.phase).toBe('between');
  });
  it('no answer before the deadline deals once', () => {
    const { e } = allInHeadsUp();
    const dl = e.s.hand!.vote!.deadline;
    expect(e.apply({ t: 'tick', now: dl - 1 }).events).toEqual([]);
    expect(e.apply({ t: 'tick', now: dl }).events!.some((x) => x.t === 'twice')).toBe(true);
    expect(e.s.phase).toBe('between');
  });
  it('the board already dealt is shared by both runs', () => {
    const e = table(2, { dealItTwice: true, startStack: 1000 });
    start(e);
    act(e, toAct(e), 'call'); act(e, toAct(e), 'check'); // flop dealt
    act(e, toAct(e), 'allin'); act(e, toAct(e), 'call');
    e.apply({ t: 'vote', pid: 'p0', yes: true, now: T0 });
    e.apply({ t: 'vote', pid: 'p1', yes: true, now: T0 });
    const h = e.s.hand!;
    expect(h.board2!.slice(0, 3)).toEqual(h.board.slice(0, 3));
    expect(h.burns).toBe(3 + 2);
    expect(total(e)).toBe(buyins(e));
  });
  it('a pause holds the vote; resuming restarts its clock', () => {
    const { e } = allInHeadsUp();
    e.apply({ t: 'host', cmd: 'pause', now: T0 });
    expect(e.apply({ t: 'vote', pid: 'p0', yes: true, now: T0 }).error).toBe('The table is paused');
    expect(e.apply({ t: 'tick', now: T0 + 999_999 }).events).toEqual([]);
    e.apply({ t: 'host', cmd: 'resume', now: T0 + 1_000_000 });
    expect(e.s.hand!.vote!.deadline).toBe(T0 + 1_000_000 + 10_000);
  });
  it('without Deal it twice the board runs out straight away', () => {
    const e = table(2, { startStack: 50 });
    start(e);
    act(e, toAct(e), 'allin');
    act(e, toAct(e), 'call');
    expect(e.s.phase).toBe('between');
    expect(e.s.hand!.vote).toBeNull();
  });
});

describe('rebuys', () => {
  it('follows the table limits and explains each refusal', () => {
    const e = table(2, { startStack: 100, maxRebuys: 1, rebuyBelow: 50 });
    const p = e.player('p0')!;
    expect(e.apply({ t: 'rebuy', pid: 'p0', now: T0 }).error).toBe('Your stack is too big to rebuy');
    p.stack = 60;
    expect(e.apply({ t: 'rebuy', pid: 'p0', now: T0 }).error).toBe('Your stack is too big to rebuy');
    p.stack = 10;
    expect(e.apply({ t: 'rebuy', pid: 'p0', now: T0 }).events).toEqual([{ t: 'rebuy', pid: 'p0', amount: 90 }]);
    p.stack = 0;
    expect(e.apply({ t: 'rebuy', pid: 'p0', now: T0 }).error).toBe('No rebuys left');
    expect(e.apply({ t: 'rebuy', pid: 'zz', now: T0 }).error).toBe('Unknown player');
  });
  it('closes after the set blind level, and is off when rebuys are off', () => {
    const e = table(2, { startStack: 100, rebuyUntilLevel: 1, blindUpEvery: 1 });
    start(e); foldOut(e); start(e); foldOut(e);
    e.player('p0')!.stack = 0;
    expect(e.apply({ t: 'rebuy', pid: 'p0', now: T0 }).error).toBe('Rebuys have closed');
    const off = table(2, { rebuys: false });
    off.player('p0')!.stack = 0;
    expect(off.apply({ t: 'rebuy', pid: 'p0', now: T0 }).error).toBe('Rebuys are off at this table');
  });
  it('not during your own live hand, and not after the game ends', () => {
    const e = table(2, { startStack: 100 });
    start(e);
    e.player('p0')!.stack = 0;
    expect(e.apply({ t: 'rebuy', pid: 'p0', now: T0 }).error).toBe('Rebuy after this hand');
    e.apply({ t: 'host', cmd: 'end', now: T0 });
    expect(e.apply({ t: 'rebuy', pid: 'p0', now: T0 }).error).toBe('The game has ended');
  });
});

describe('turn timer and time bank', () => {
  const C = { turnTime: 20, timeBank: 60 };
  it('nothing happens before the deadline; at the deadline the player checks or folds', () => {
    const e = table(3, C);
    start(e, T0);
    const pid = toAct(e);
    const dl = e.viewFor(pid).hand!.deadline!;
    expect(dl).toBe(T0 + 80_000);
    expect(e.apply({ t: 'tick', now: dl - 1 }).events).toEqual([]);
    const r = e.apply({ t: 'tick', now: dl });
    expect(r.events![0]).toMatchObject({ t: 'act', pid, a: 'fold', auto: true });
    expect(e.player(pid)!.bank).toBe(0);
    expect(e.s.log.some((l) => l.text.endsWith('ran out of time'))).toBe(true);
  });
  it('acting late takes the extra time from the bank', () => {
    const e = table(3, C);
    start(e, T0);
    const pid = toAct(e);
    act(e, pid, 'call', undefined, T0 + 30_000);
    expect(e.player(pid)!.bank).toBe(50);
    const next = toAct(e);
    expect(e.viewFor(next).hand!.deadline).toBe(T0 + 30_000 + 80_000);
  });
  it('a dropped connection on your turn adds 10 s once per hand', () => {
    const e = table(3, C);
    start(e, T0);
    const pid = toAct(e);
    e.apply({ t: 'presence', pid, connected: false, now: T0 + 5_000 });
    expect(e.deadline()).toBe(T0 + 90_000);
    act(e, pid, 'call', undefined, T0 + 85_000);
    expect(e.player(pid)!.bank).toBe(5);
    expect(e.apply({ t: 'presence', pid: 'zz', connected: true, now: T0 }).error).toBe('Unknown player');
  });
  it('banks refill every 10 hands, never above the full bank', () => {
    const e = table(2, C);
    e.player('p0')!.bank = 0;
    e.player('p1')!.bank = 55;
    for (let i = 0; i < 11; i++) { start(e); foldOut(e); }
    expect(e.player('p0')!.bank).toBe(10);
    expect(e.player('p1')!.bank).toBe(60);
  });
  it('pausing stops the clock and resuming restarts the turn time', () => {
    const e = table(3, C);
    start(e, T0);
    e.apply({ t: 'host', cmd: 'pause', now: T0 + 1000 });
    expect(e.apply({ t: 'tick', now: T0 + 500_000 }).events).toEqual([]);
    expect(act(e, toAct(e), 'call').error).toBe('The table is paused');
    expect(start(e).error).toBe('A hand is already running');
    e.apply({ t: 'host', cmd: 'resume', now: T0 + 600_000 });
    expect(e.deadline()).toBe(T0 + 600_000 + 80_000);
  });
  it('no timer when turn time is 0', () => {
    const e = table(2);
    start(e);
    expect(e.deadline()).toBeNull();
    expect(e.apply({ t: 'tick', now: T0 + 1e9 }).events).toEqual([]);
  });
  it('ticks between hands do nothing', () => {
    const e = table(2, C);
    expect(e.apply({ t: 'tick', now: T0 }).events).toEqual([]);
  });
});

describe('host commands', () => {
  it('pause and resume refuse repeats; a paused table does not deal', () => {
    const e = table(2);
    expect(e.apply({ t: 'host', cmd: 'resume', now: T0 }).error).toBe('Not paused');
    e.apply({ t: 'host', cmd: 'pause', now: T0 });
    expect(e.apply({ t: 'host', cmd: 'pause', now: T0 }).error).toBe('Already paused');
    expect(e.canStartHand()).toBe(false);
    expect(start(e).error).toBe('The table is paused');
  });
  it('undo through an input', () => {
    const e = table(3);
    expect(e.apply({ t: 'host', cmd: 'undo', now: T0 }).error).toBe('Nothing to undo');
    start(e);
    const who = toAct(e);
    act(e, who, 'fold');
    const r = e.apply({ t: 'host', cmd: 'undo', now: T0 + 5 });
    expect(r.events![0]).toEqual({ t: 'undo' });
    expect(toAct(e)).toBe(who);
  });
  it('move seats only between hands', () => {
    const e = table(3);
    expect(e.apply({ t: 'host', cmd: 'move', pid: 'p2', dir: -1, now: T0 }).error).toBeUndefined();
    expect(e.player('p2')!.seat).toBe(1);
    start(e);
    expect(e.apply({ t: 'host', cmd: 'move', pid: 'p2', dir: 1, now: T0 }).error).toBe('Move seats between hands');
    expect(e.apply({ t: 'host', cmd: 'move', pid: 'zz', dir: 1, now: T0 }).error).toBe('Unknown player');
    expect(e.apply({ t: 'host', cmd: 'remove', pid: 'zz', now: T0 }).error).toBe('Unknown player');
  });
  it('new blinds without an ante, and the pot is zero between hands', () => {
    const e = table(2);
    expect(e.potTotal()).toBe(0);
    expect(e.apply({ t: 'host', cmd: 'setBlinds', sb: 10, bb: 20, now: T0 }).error).toBeUndefined();
    expect(e.s.log.at(-1)!.text).toBe('Blinds change to 10/20 from the next hand');
  });
  it('auto-act checks when a check is free', () => {
    const e = table(3);
    start(e);
    act(e, toAct(e), 'call'); act(e, toAct(e), 'call');
    const bb = toAct(e);
    expect(bb).toBe(e.s.hand!.bbId);
    e.autoAct(bb);
    expect(e.s.hand!.ps[bb]!.lastAction).toBeNull(); // checked, street moved on
    expect(e.s.hand!.street).toBe('flop');
  });
  it('new blinds apply from the next hand; nonsense blinds are refused', () => {
    const e = table(2);
    start(e);
    expect(e.apply({ t: 'host', cmd: 'setBlinds', sb: 0, bb: 10, now: T0 }).error).toBeDefined();
    expect(e.apply({ t: 'host', cmd: 'setBlinds', sb: 20, bb: 10, now: T0 }).error).toBeDefined();
    expect(e.apply({ t: 'host', cmd: 'setBlinds', sb: 5, bb: 10, ante: 50, now: T0 }).error).toBeDefined();
    expect(e.apply({ t: 'host', cmd: 'setBlinds', sb: 25, bb: 50, ante: 5, now: T0 }).error).toBeUndefined();
    expect(e.s.level.bb).toBe(10);
    foldOut(e);
    const r = start(e);
    expect(e.s.level).toEqual({ sb: 25, bb: 50, ante: 5, n: 2 });
    expect(r.events!.some((x) => x.t === 'level')).toBe(true);
  });
  it('ending the game refunds a hand in progress and blocks everything after', () => {
    const e = table(3, { startStack: 100 });
    start(e);
    act(e, toAct(e), 'raise', 50);
    expect(e.apply({ t: 'host', cmd: 'end', now: T0 }).events).toEqual([{ t: 'ended' }]);
    expect(e.standings().reduce((a, s) => a + s.stack, 0)).toBe(300);
    expect(e.apply({ t: 'host', cmd: 'end', now: T0 }).error).toBe('The game has already ended');
    expect(start(e).error).toBe('The game has ended');
  });
});

describe('fair dealing in the engine', () => {
  it('publishes the deck fingerprint first, reveals the seed after, and the proof checks out', () => {
    const e = table(3);
    const r = start(e);
    const commit = (r.events!.find((x) => x.t === 'handStart') as Extract<GameEvent, { t: 'handStart' }>).deckCommit;
    expect(e.viewFor('p0').hand!.proof).toBeNull();
    const end = (() => { const evs: GameEvent[] = []; while (e.s.phase === 'hand') evs.push(...act(e, toAct(e), 'fold').events!); return evs; })();
    const reveal = end.find((x) => x.t === 'deckReveal') as Extract<GameEvent, { t: 'deckReveal' }>;
    expect(reveal.deckCommit).toBe(commit);
    const proof = e.viewFor('p0').hand!.proof!;
    expect(verifyDeck({ ...proof, commit }).ok).toBe(true);
  });
  it('the same seed deals the same cards', () => {
    const a = table(4), b = table(4);
    a.apply({ t: 'start', seed: SEED(42), now: T0 });
    b.apply({ t: 'start', seed: SEED(42), now: T0 });
    expect(a.s.hand!.ps.p0!.cards).toEqual(b.s.hand!.ps.p0!.cards);
  });
  it('Shared shuffle: the dealer promises its seed first, and every phone\'s seed changes the deck', () => {
    const e = table(3, { sharedShuffle: true });
    const dealer = randomSeed();
    expect(e.apply({ t: 'commitSeed', commit: 'nope', now: T0 }).error).toBe('Bad seed promise');
    e.apply({ t: 'commitSeed', commit: seedCommit(dealer), now: T0 });
    expect(e.apply({ t: 'start', seed: randomSeed(), now: T0 }).error).toBe('The seed does not match the dealer\'s promise');
    expect(e.apply({ t: 'start', seed: dealer, now: T0, contributions: ['bad'] }).error).toBeDefined();
    const phones = [randomSeed(), randomSeed()];
    expect(e.apply({ t: 'start', seed: dealer, now: T0, contributions: phones }).error).toBeUndefined();
    expect(e.apply({ t: 'commitSeed', commit: seedCommit(dealer), now: T0 }).error).toBe('Promise the next seed between hands');
    const commit = e.s.hand!.deckCommit;
    foldOut(e);
    const proof = e.viewFor(null).hand!.proof!;
    expect(proof.contributions).toEqual(phones);
    expect(verifyDeck({ ...proof, commit }).ok).toBe(true);
  });
  it('a hand needs a proper seed and a time', () => {
    const e = table(2);
    expect(e.apply({ t: 'start', seed: 'abc', now: T0 }).error).toBe('A new hand needs a 32-byte seed');
    expect(e.apply({ t: 'tick' } as unknown as Input).error).toBe('Missing time');
  });
});

describe('views', () => {
  it('spectators see public cards only, and never a legal action', () => {
    const e = table(3);
    start(e);
    const v = e.viewFor(null);
    expect(v.me).toBeNull();
    expect(v.legal).toBeNull();
    expect(Object.values(v.hand!.ps).every((p) => p.cards === null)).toBe(true);
    checkDown(e);
    expect(Object.values(e.viewFor(null).hand!.ps).some((p) => p.cards !== null)).toBe(true);
  });
  it('shows a straddle, both boards and the engine version', () => {
    const e = table(2);
    start(e);
    const v = e.viewFor('p0');
    expect(v.engineVersion).toBe(2);
    expect(v.hand!.board2).toBeNull();
    expect(v.hand!.straddleId).toBeNull();
  });
  it('show cards is an input after an uncontested win', () => {
    const e = table(2);
    start(e);
    const first = toAct(e);
    act(e, first, 'fold');
    const winner = e.s.hand!.order.find((p) => p !== first)!;
    expect(e.apply({ t: 'show', pid: first, now: T0 }).events![0]).toMatchObject({ t: 'show' }); // a folded player may show too
    expect(e.apply({ t: 'show', pid: winner, now: T0 }).events![0]).toMatchObject({ t: 'show', pid: winner });
    expect(e.apply({ t: 'show', pid: winner, now: T0 }).error).toBe('Nothing to show');
  });
  it('sit-in and sit-out inputs need a real player', () => {
    const e = table(2);
    expect(e.apply({ t: 'sitOut', pid: 'zz', now: T0 }).error).toBe('Unknown player');
    expect(e.apply({ t: 'sitIn', pid: 'zz', postNow: true, now: T0 }).error).toBe('Unknown player');
  });
});

describe('replay and hand records', () => {
  it('replaying the inputs rebuilds exactly the same table', () => {
    const e = table(5, { turnTime: 20, anteFromLevel: 2, blindUpEvery: 3, dealItTwice: true });
    const snap = e.snapshot();
    const fresh = Engine.fromSnapshot(snap);
    let now = T0;
    let rng = 7;
    const r = () => { rng = (rng * 1103515245 + 12345) % 2 ** 31; return rng / 2 ** 31; };
    for (let h = 0; h < 40; h++) {
      now += 1000;
      if (!fresh.canStartHand()) for (const p of fresh.s.players) if (p.stack === 0) fresh.apply({ t: 'rebuy', pid: p.id, now });
      if (fresh.apply({ t: 'start', seed: SEED(1000 + h), now }).error) continue;
      let guard = 0;
      while (fresh.s.phase === 'hand' && guard++ < 300) {
        now += Math.floor(r() * 40_000);
        const hand = fresh.s.hand!;
        if (hand.vote) { for (const pid of hand.vote.pids) if (fresh.s.hand?.vote) fresh.apply({ t: 'vote', pid, yes: r() < 0.7, now }); continue; }
        if (r() < 0.3) { fresh.apply({ t: 'tick', now }); continue; }
        if (r() < 0.05) { fresh.apply({ t: 'presence', pid: hand.toAct!, connected: false, now }); continue; }
        const pid = hand.toAct!;
        const L = fresh.legal(pid)!;
        const x = r();
        fresh.apply({ t: 'act', pid, now, action: x < 0.15 ? { type: 'fold' } : x < 0.6 ? { type: L.canCheck ? 'check' : 'call' } : x < 0.9 && L.canRaise ? { type: 'raise', to: L.minTo + Math.floor(r() * (L.maxTo - L.minTo + 1)) } : { type: 'allin' } });
      }
      expect(total(fresh)).toBe(buyins(fresh));
    }
    const again = Engine.replay(snap, fresh.inputs);
    expect(JSON.stringify(again.s)).toBe(JSON.stringify(fresh.s));
  });
  it('each finished hand leaves a record that replays to the same result', () => {
    const e = table(4, { turnTime: 20 });
    start(e, T0);
    act(e, toAct(e), 'raise', 40, T0 + 3000);
    e.apply({ t: 'tick', now: T0 + 999_999 });
    checkDown(e, T0 + 1_000_000);
    const rec = e.lastHandRecord!;
    expect(rec.engineVersion).toBe(2);
    expect(rec.inputs[0]!.t).toBe('start');
    const replayed = Engine.replay(rec.before, rec.inputs);
    expect(replayed.s.hand!.results).toEqual(rec.results);
    expect(replayed.s.players.map((p) => p.stack)).toEqual(e.s.players.map((p) => p.stack));
    expect(verifyDeck({ ...rec.proof, commit: rec.deckCommit }).ok).toBe(true);
  });
  it('a replay that hits a refused input says so', () => {
    const e = table(2);
    expect(() => Engine.replay(e.snapshot(), [{ t: 'act', pid: 'p0', action: { type: 'check' }, now: T0 }])).toThrow(/Replay diverged/);
  });
});

describe('saved tables from the first app', () => {
  it('a v1 save between hands loads, keeps stacks, and moves the button on', () => {
    const legacy = {
      v: 1, gameId: 'old', cfg: { startStack: 1000, sb: 5, bb: 10, blindUpEvery: 0, turnTime: 0, rebuys: true },
      level: { sb: 5, bb: 10, n: 1 },
      players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, seat: i, stack: 1000 + i, buyins: 1000, sittingOut: false, leaving: false, connected: false, busted: false })),
      button: 0, handNo: 3, hand: null, phase: 'between', log: [], stats: {}, paused: false,
    } as unknown as GameState;
    const e = new Engine(legacy);
    expect(e.s.v).toBe(2);
    expect(e.s.players.map((p) => p.stack)).toEqual([1000, 1001, 1002]);
    e.startHand(SEED(9), T0);
    expect(chairOf(e, e.s.hand!.bbId)).toBe(0); // button 0 -> next hand button 1, sb 2, bb 0
  });
  it('a v1 save without a turn timer setting gets none', () => {
    const legacy = {
      v: 1, gameId: 'old', cfg: { startStack: 1000, sb: 5, bb: 10, blindUpEvery: 0, rebuys: true },
      level: { sb: 5, bb: 10, n: 1 }, players: [], button: -1, handNo: 0, hand: null, phase: 'lobby', log: [], stats: {}, paused: false,
    } as unknown as GameState;
    expect(new Engine(legacy).s.cfg.turnTime).toBe(0);
  });
  it('a v1 save in the middle of a hand is refunded and continues between hands', () => {
    const legacy = {
      v: 1, gameId: 'old', cfg: { startStack: 1000, sb: 5, bb: 10, blindUpEvery: 0, turnTime: 0, rebuys: true },
      level: { sb: 5, bb: 10, n: 1 },
      players: [0, 1].map((i) => ({ id: `p${i}`, name: `P${i}`, seat: i, stack: 990, buyins: 1000, sittingOut: false, leaving: false, connected: false, busted: false })),
      button: -1, handNo: 1, phase: 'hand', log: [], stats: {}, paused: false,
      hand: { ps: { p0: { total: 10 }, p1: { total: 10 } } },
    } as unknown as GameState;
    const e = new Engine(legacy);
    expect(e.s.phase).toBe('between');
    expect(e.s.players.map((p) => p.stack)).toEqual([1000, 1000]);
    expect(e.s.lastBBChair).toBe(-1);
  });
});

describe('defaults', () => {
  it('match the decisions: 20 s per action, 60 s bank, 15 players, straddle and Deal it twice off', () => {
    expect(TABLE_DEFAULTS).toMatchObject({ turnTime: 20, timeBank: 60, maxPlayers: 15, straddle: false, dealItTwice: false });
    // new tables: a rebuy only at 0 chips (no top-ups), for the starting stack
    expect(makeConfig({ startStack: 500 }).rebuyBelow).toBe(1);
    expect(makeConfig({ startStack: 500 }).rebuyAmount).toBe(0);
  });
});

describe('pots: chips no live player can win', () => {
  it('what a folded player put in above every live player joins the pot below (not a pot nobody can win)', () => {
    const e = table(3, { startStack: 1000 });
    start(e);
    const h = e.s.hand!;
    const [a, b, c] = h.order as [string, string, string];
    // a put in 300 and folded; b is all-in for 100, c is all-in for 200
    h.ps[a]!.total = 300; h.ps[a]!.folded = true;
    h.ps[b]!.total = 100; h.ps[b]!.allIn = true;
    h.ps[c]!.total = 200; h.ps[c]!.allIn = true;
    const pots = e.buildPots();
    expect(pots).toEqual([{ amount: 300, elig: [b, c] }, { amount: 300, elig: [c] }]);
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(600); // every chip is in a pot someone can win
  });
});

describe('leaving and coming back', () => {
  it('a player who is removed and joins again gets their own chips back, not a fresh stack', () => {
    const e = table(3, { startStack: 1000, rebuys: true, maxRebuys: 1 });
    start(e);
    // p0 loses chips by betting and folding
    while (e.s.phase === 'hand' && toAct(e) !== 'p0') act(e, toAct(e), 'call');
    act(e, 'p0', 'raise', 300);
    foldOut(e);
    expect(e.player('p0')!.stack).not.toBe(1000);
    const before = { stack: e.player('p0')!.stack, buyins: e.player('p0')!.buyins, rebuysUsed: e.player('p0')!.rebuysUsed };
    expect(e.apply({ t: 'host', cmd: 'remove', pid: 'p0', now: T0 }).error).toBeUndefined();
    expect(e.player('p0')).toBeUndefined();
    expect(e.apply({ t: 'join', id: 'p0', name: 'P0', now: T0 }).error).toBeUndefined();
    const back = e.player('p0')!;
    expect({ stack: back.stack, buyins: back.buyins, rebuysUsed: back.rebuysUsed }).toEqual(before);
    expect((e.s.departed ?? []).some((d) => d.id === 'p0')).toBe(false); // counted once in the final standings
    expect(total(e)).toBe(buyins(e));
  });
});
