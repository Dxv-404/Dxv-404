import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Engine, niceRound } from '../src/engine';
import type { Action, Legal } from '../src/types';

const total = (e: Engine) => e.s.players.reduce((a, p) => a + p.stack, 0) + (e.s.phase === 'hand' ? e.potTotal() : 0);

/** Pick an action from a number in [0,1) and the legal set. */
function pick(L: Legal, r: number, r2: number): Action {
  if (r < 0.12) return { type: 'fold' };
  if (r < 0.5) return { type: L.canCheck ? 'check' : 'call' };
  if (r < 0.85 && L.canRaise) return { type: 'raise', to: L.minTo + Math.floor(r2 * (L.maxTo - L.minTo + 1)) };
  if (r < 0.92) return { type: 'allin' };
  return { type: L.canCheck ? 'check' : 'call' };
}

/** Play one whole hand with a random-number stream; returns false if something broke. */
function playHand(e: Engine, rnd: () => number): void {
  e.startHand();
  let guard = 0;
  while (e.s.phase === 'hand') {
    const pid = e.s.hand!.toAct!;
    const L = e.legal(pid)!;
    const res = e.act(pid, pick(L, rnd(), rnd()));
    if (res.error) throw new Error(res.error);
    if (++guard > 400) throw new Error('stuck hand');
  }
}

describe('engine properties (fast-check)', () => {
  const game = fc.record({
    players: fc.integer({ min: 2, max: 15 }),
    stack: fc.integer({ min: 20, max: 5000 }),
    bb: fc.integer({ min: 2, max: 50 }),
    blindUp: fc.constantFrom(0, 3, 10),
    seed: fc.array(fc.double({ min: 0, max: 0.999999, noNaN: true }), { minLength: 64, maxLength: 64 }),
  });

  it('never creates or loses chips, never goes negative, never sticks', () => {
    fc.assert(fc.property(game, (g) => {
      const e = Engine.newGame({ startStack: g.stack, sb: Math.max(1, g.bb >> 1), bb: g.bb, blindUpEvery: g.blindUp }, Array.from({ length: g.players }, (_, i) => `P${i}`));
      let k = 0;
      const rnd = () => g.seed[k++ % g.seed.length]!;
      const T = total(e);
      for (let h = 0; h < 25 && e.canStartHand(); h++) {
        playHand(e, rnd);
        expect(total(e)).toBe(T);
        for (const p of e.s.players) expect(p.stack).toBeGreaterThanOrEqual(0);
      }
    }), { numRuns: 200 });
  });

  it('a seat view never shows another live player\'s hidden cards or the deck', () => {
    fc.assert(fc.property(game, (g) => {
      const e = Engine.newGame({ startStack: g.stack, bb: g.bb, sb: Math.max(1, g.bb >> 1) }, Array.from({ length: g.players }, (_, i) => `P${i}`));
      let k = 0;
      const rnd = () => g.seed[k++ % g.seed.length]!;
      e.startHand();
      let guard = 0;
      while (e.s.phase === 'hand' && guard++ < 400) {
        for (const viewer of e.s.players) {
          const v = e.viewFor(viewer.id);
          expect(JSON.stringify(v)).not.toContain('"deck"');
          for (const [pid, hp] of Object.entries(v.hand?.ps ?? {})) {
            const mine = pid === viewer.id;
            const revealed = e.s.hand!.revealed[pid] || e.s.hand!.shown[pid];
            if (!mine && !revealed) expect(hp.cards).toBeNull();
            if (mine) expect(hp.cards).toHaveLength(2);
          }
        }
        const pid = e.s.hand!.toAct!;
        e.act(pid, pick(e.legal(pid)!, rnd(), rnd()));
      }
    }), { numRuns: 60 });
  });

  it('uses each card at most once per hand (52 card limit holds at 15 players)', () => {
    const e = Engine.newGame({}, Array.from({ length: 15 }, (_, i) => `P${i}`));
    e.startHand();
    // everyone calls down to see all five board cards
    while (e.s.phase === 'hand') {
      const pid = e.s.hand!.toAct!;
      const L = e.legal(pid)!;
      e.act(pid, { type: L.canCheck ? 'check' : 'call' });
    }
    const h = e.s.hand!;
    const seen = [...h.board, ...Object.values(h.ps).flatMap((p) => p.cards)];
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(15 * 2 + 5);
    expect(h.burns).toBe(3);
  });
});

describe('engine rules', () => {
  it('will not start a hand while one is running, or after the game ended (regression: pot vanished)', () => {
    const e = Engine.newGame({}, ['A', 'B', 'C']);
    e.startHand();
    const before = JSON.stringify(e.s);
    expect(e.startHand()).toEqual([]);
    expect(JSON.stringify(e.s)).toBe(before);
    expect(total(e)).toBe(3000);
    e.endGame();
    expect(e.startHand()).toEqual([]);
  });

  it('refuses actions out of turn and illegal actions without changing state', () => {
    const e = Engine.newGame({}, ['A', 'B', 'C']);
    e.startHand();
    const h = e.s.hand!;
    const notMe = h.order.find((p) => p !== h.toAct)!;
    const before = JSON.stringify(e.s);
    expect(e.act(notMe, { type: 'call' }).error).toBe('Not your turn');
    expect(e.act(h.toAct!, { type: 'check' }).error).toBe('Cannot check');
    expect(e.act(h.toAct!, { type: 'nonsense' as never }).error).toBe('Unknown action');
    expect(JSON.stringify(e.s)).toBe(before);
    expect(e.canUndo()).toBe(false);
  });

  it('BB with the option can check; nothing to call is refused', () => {
    const e = Engine.newGame({}, ['A', 'B', 'C']);
    e.startHand();
    const [sb, bb, btn] = e.s.hand!.order as [string, string, string];
    e.act(btn, { type: 'call' });
    e.act(sb, { type: 'call' });
    expect(e.act(bb, { type: 'call' }).error).toBe('Nothing to call');
    expect(e.act(bb, { type: 'check' }).error).toBeUndefined();
    expect(e.s.hand!.street).toBe('flop');
  });

  it('clamps raises to the legal range and refuses raises when nobody else can act', () => {
    const e = Engine.newGame({ startStack: 1000 }, ['A', 'B']);
    e.startHand();
    const btn = e.s.hand!.toAct!;
    e.act(btn, { type: 'raise', to: 5 }); // below min -> clamped to min
    expect(e.s.hand!.currentBet).toBe(20);
    const other = e.s.hand!.toAct!;
    e.act(other, { type: 'raise', to: 999_999 }); // above max -> all-in
    expect(e.player(other)!.stack).toBe(0);
    const L = e.legal(btn)!;
    expect(L.canRaise).toBe(false); // only a call or fold is left
  });

  it('short big blind still sets the full call amount', () => {
    const e = Engine.newGame({ startStack: 1000, sb: 5, bb: 10 }, ['A', 'B', 'C']);
    e.s.players[2]!.stack = 4; // seat 2 will be BB on the first hand (button moves to seat 0)
    e.startHand();
    const h = e.s.hand!;
    expect(h.bbId).toBe(e.s.players[2]!.id);
    expect(h.ps[h.bbId!]!.total).toBe(4);
    expect(h.ps[h.bbId!]!.allIn).toBe(true);
    expect(h.currentBet).toBe(10);
  });

  it('returns an uncalled bet', () => {
    const e = Engine.newGame({}, ['A', 'B', 'C']);
    e.startHand();
    const [sb, bb, btn] = e.s.hand!.order as [string, string, string];
    e.act(btn, { type: 'raise', to: 300 });
    e.act(sb, { type: 'fold' });
    const res = e.act(bb, { type: 'fold' });
    expect(res.events!.some((x) => x.t === 'refund' && x.pid === btn && x.amount === 290)).toBe(true);
    expect(e.player(btn)!.stack).toBe(1015);
  });

  it('gives the odd chip to the first winner left of the button', () => {
    const e = Engine.newGame({ startStack: 1000, sb: 5, bb: 10 }, ['A', 'B', 'C']);
    e.startHand();
    const h = e.s.hand!;
    const [sb, bb, btn] = h.order as [string, string, string];
    h.ps[sb]!.cards = [0, 1]; h.ps[bb]!.cards = [4, 5]; h.ps[btn]!.cards = [8, 9];
    // The board is a royal flush, so everyone still in plays the board.
    // The deck pops from the end: burn, flop x3, burn, turn, burn, river.
    const royal = [48, 44, 40, 36, 32];
    h.deck = [royal[4]!, 2, royal[3]!, 3, royal[2]!, royal[1]!, royal[0]!, 6];
    e.act(btn, { type: 'call' });
    e.act(sb, { type: 'fold' }); // 5 dead chips: pot is 25, split two ways
    e.act(bb, { type: 'check' });
    while (e.s.phase === 'hand') e.act(e.s.hand!.toAct!, { type: 'check' });
    const awards = e.s.hand!.results!.pots[0]!.awards;
    const amounts = Object.fromEntries(awards.map((a) => [a.pid, a.amount]));
    expect(amounts).toEqual({ [bb]: 13, [btn]: 12 }); // BB sits first left of the button among winners
  });

  it('reveals all hands and runs the board out when betting is closed', () => {
    const e = Engine.newGame({ startStack: 100 }, ['A', 'B']);
    e.startHand();
    const first = e.s.hand!.toAct!;
    e.act(first, { type: 'allin' });
    const res = e.act(e.s.hand!.toAct!, { type: 'call' });
    expect(e.s.hand!.runout).toBe(true);
    expect(e.s.hand!.board).toHaveLength(5);
    expect(res.events!.filter((x) => x.t === 'street')).toHaveLength(3);
    expect(e.s.phase).toBe('between');
  });

  it('winner of an uncontested pot can show, but only between hands', () => {
    const e = Engine.newGame({}, ['A', 'B']);
    e.startHand();
    const first = e.s.hand!.toAct!;
    const other = e.s.hand!.order.find((p) => p !== first)!;
    expect(e.showCards(first)).toEqual([]);
    e.act(first, { type: 'fold' });
    const ev = e.showCards(other);
    expect(ev[0]).toMatchObject({ t: 'show', pid: other });
    expect(e.viewFor(first).hand!.ps[other]!.cards).toHaveLength(2);
  });

  it('auto-acts by checking when possible, else folding', () => {
    const e = Engine.newGame({}, ['A', 'B', 'C']);
    e.startHand();
    const pid = e.s.hand!.toAct!;
    e.autoAct(pid);
    expect(e.s.hand!.ps[pid]!.folded).toBe(true);
    expect(e.autoAct(pid)).toBeNull();
  });

  it('blinds always go up at each new level (regression: 10 used to stay 10)', () => {
    const e = Engine.newGame({ sb: 1, bb: 2, blindUpEvery: 1 }, ['A', 'B']);
    let prev = 0;
    for (let i = 0; i < 25; i++) {
      e.startHand();
      expect(e.s.level.bb).toBeGreaterThan(prev);
      prev = e.s.level.bb;
      e.act(e.s.hand!.toAct!, { type: 'fold' });
      for (const p of e.s.players) p.stack = 1e9;
    }
  });

  it('raises blinds on schedule with friendly numbers', () => {
    const e = Engine.newGame({ sb: 5, bb: 10, blindUpEvery: 2 }, ['A', 'B']);
    const levels: number[] = [];
    for (let i = 0; i < 6; i++) {
      e.startHand();
      levels.push(e.s.level.bb);
      e.act(e.s.hand!.toAct!, { type: 'fold' });
      for (const p of e.s.players) p.stack = 1000;
    }
    expect(levels).toEqual([10, 10, 15, 15, 20, 20]);
    expect([niceRound(7), niceRound(13), niceRound(37), niceRound(0.4)]).toEqual([6, 15, 40, 1]);
  });
});

describe('table management', () => {
  it('adds, moves and removes players between hands', () => {
    const e = Engine.newGame({}, ['A', 'B']);
    const c = e.addPlayer('  Charlie the very long name  ');
    expect(c.name).toBe('Charlie the ve');
    expect(c.seat).toBe(2);
    e.movePlayer(c.id, -1);
    expect(e.player(c.id)!.seat).toBe(1);
    e.movePlayer(c.id, -5); // out of range: ignored
    expect(e.player(c.id)!.seat).toBe(1);
    e.removePlayer(c.id);
    expect(e.s.players.map((p) => p.seat)).toEqual([0, 1]);
    e.removePlayer('nobody');
    expect(Engine.makePlayer('', 0, 10).name).toBe('Player');
  });

  it('a player leaving mid-hand stays until the hand ends, then is listed as departed', () => {
    const e = Engine.newGame({}, ['A', 'B', 'C']);
    e.startHand();
    const leaver = e.s.hand!.order[0]!;
    e.removePlayer(leaver);
    expect(e.player(leaver)!.leaving).toBe(true);
    while (e.s.phase === 'hand') {
      const pid = e.s.hand!.toAct!;
      e.act(pid, { type: e.legal(pid)!.canCheck ? 'check' : 'call' });
    }
    expect(e.player(leaver)).toBeUndefined();
    expect(e.standings().some((s) => s.id === leaver)).toBe(true);
  });

  it('rebuys only when allowed, not mid-hand, and only at 0 chips', () => {
    const e = Engine.newGame({ startStack: 100 }, ['A', 'B']);
    const a = e.s.players[0]!;
    expect(e.rebuy(a.id)).toEqual([]); // full stack
    a.stack = 30;
    expect(e.rebuy(a.id)).toEqual([]); // no top-ups
    a.stack = 0;
    expect(e.rebuy(a.id)).toEqual([{ t: 'rebuy', pid: a.id, amount: 100 }]);
    expect(a.buyins).toBe(200);
    e.startHand();
    a.stack = 0;
    expect(e.rebuy(a.id)).toEqual([]); // in a live hand
    const noRebuy = Engine.newGame({ rebuys: false }, ['A', 'B']);
    noRebuy.s.players[0]!.stack = 1;
    expect(noRebuy.rebuy(noRebuy.s.players[0]!.id)).toEqual([]);
    expect(e.rebuy('nobody')).toEqual([]);
  });

  it('sitting out skips the deal; a lone eligible player cannot start a hand', () => {
    const e = Engine.newGame({}, ['A', 'B', 'C']);
    e.setSitOut(e.s.players[1]!.id, true);
    e.startHand();
    expect(e.s.hand!.order).not.toContain(e.s.players[1]!.id);
    e.act(e.s.hand!.toAct!, { type: 'fold' });
    e.setSitOut(e.s.players[2]!.id, true);
    expect(e.canStartHand()).toBe(false);
    expect(e.startHand()).toEqual([]);
    e.setSitOut('nobody', true);
  });

  it('ending mid-hand refunds what was put in, and standings sort by net', () => {
    const e = Engine.newGame({ startStack: 100 }, ['A', 'B', 'C']);
    e.startHand();
    const s = e.endGame();
    expect(s.reduce((a, x) => a + x.stack, 0)).toBe(300);
    expect(e.s.phase).toBe('ended');
    expect(s.every((x) => x.net === 0)).toBe(true);
  });

  it('keeps only the last 80 log lines', () => {
    const e = Engine.newGame({}, ['A', 'B']);
    for (let i = 0; i < 100; i++) e.logLine(`line ${i}`);
    expect(e.s.log).toHaveLength(80);
    expect(e.s.log[79]!.text).toBe('line 99');
  });

  it('undo is refused across streets and keeps at most 10 steps', () => {
    const e = Engine.newGame({}, ['A', 'B']);
    expect(e.undo()).toBeNull();
    e.startHand();
    e.act(e.s.hand!.toAct!, { type: 'call' });
    e.act(e.s.hand!.toAct!, { type: 'check' }); // deals the flop
    expect(e.canUndo()).toBe(false);
    for (let i = 0; i < 15; i++) e.pushUndo();
    expect(e.undoStack.length).toBe(10);
  });

  it('shows side pots mid-hand only when someone is all-in', () => {
    const e = Engine.newGame({ startStack: 1000 }, ['A', 'B', 'C']);
    e.startHand();
    const [sb, , btn] = e.s.hand!.order as [string, string, string];
    expect(e.viewFor(sb).hand!.pots).toBeNull();
    e.player(btn)!.stack = 40;
    e.act(btn, { type: 'allin' });
    const pots = e.viewFor(sb).hand!.pots!;
    expect(pots.length).toBeGreaterThan(0);
  });
});
