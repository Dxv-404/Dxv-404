import { describe, expect, it } from 'vitest';
import { Engine, parseCard, type Action, type GameEvent } from '@tp/engine';
import { parseServer, type ServerMessage } from '@tp/protocol';
import { DramaTracker, FOLLOW_UP_MS, SCENE_MS, holdMs, isComeback, pileTier, positions, type Moment } from '../src/drama';
import { TableRoom, newSeatToken, type Conn } from '../src/room';

describe('positions (the plan\'s rules and worked examples)', () => {
  it('7k 8k 4k 2k: 8k dominant, 7k and 4k contenders, 2k desperate', () => {
    expect(positions({ a: 7000, b: 8000, c: 4000, d: 2000 })).toEqual({ a: 'contender', b: 'dominant', c: 'contender', d: 'desperate' });
  });
  it('550 1k 3k 4k: 550 desperate, 1k desperate contender, 3k contender, 4k dominant', () => {
    expect(positions({ a: 550, b: 1000, c: 3000, d: 4000 })).toEqual({ a: 'desperate', b: 'desperateContender', c: 'contender', d: 'dominant' });
  });
  it('players level with the biggest stack are all dominant', () => {
    expect(positions({ a: 5000, b: 5000, c: 1000 })).toEqual({ a: 'dominant', b: 'dominant', c: 'desperate' });
  });
  it('anyone under a quarter of the average is desperate even if not the smallest', () => {
    // average 10.15k: 2k and 2.5k are under 1/4 (2537)
    expect(positions({ a: 2000, b: 2500, c: 18000, d: 18100 })).toMatchObject({ a: 'desperate', b: 'desperate', c: 'contender', d: 'dominant' });
  });
  it('the smallest stack at or above half the average is not desperate', () => {
    expect(positions({ a: 2800, b: 4000, c: 5000 })).toMatchObject({ a: 'desperateContender', b: 'contender', c: 'dominant' });
  });
});

describe('piles and comebacks', () => {
  it('pile tier: under 1x, 1-3x, over 3x the hand-start stack', () => {
    expect(pileTier(500, 1000)).toBe(0);
    expect(pileTier(1000, 1000)).toBe(1);
    expect(pileTier(3000, 1000)).toBe(1);
    expect(pileTier(3001, 1000)).toBe(2);
  });
  it('a comeback: behind when turned up and after the flop, ahead on the river', () => {
    const shown = { a: ['Ah', 'Kh'], b: ['Qs', 'Qd'] };
    expect(isComeback('a', shown, [], ['2c', '7d', '9s', '4h', 'Ac'])).toBe(true);
    // won on the flop: not a comeback
    expect(isComeback('a', shown, [], ['Ac', '7d', '9s', '4h', '2c'])).toBe(false);
    // ahead when turned up: not a comeback
    expect(isComeback('b', shown, [], ['2c', '7d', '9s', '4h', '3c'])).toBe(false);
    // turned up on the turn, behind, hits the river
    expect(isComeback('a', shown, ['2c', '7d', '9s', '4h'], ['2c', '7d', '9s', '4h', 'Kc'])).toBe(true);
  });
});

// ---------------------------------------------------------------- a real engine, fed to a tracker
type Seat = { name: string; stack: number };
function table(seats: Seat[], cfg: Record<string, unknown> = {}) {
  const e = Engine.newGame({ startStack: 1000, sb: 10, bb: 20, turnTime: 0, ...cfg }, seats.map((s) => s.name));
  e.s.players.forEach((p, i) => { p.stack = seats[i]!.stack; p.connected = true; });
  const tr = new DramaTracker();
  const all: Moment[] = [];
  const feed = (ev: GameEvent[]) => { const m = tr.feed(ev, e.viewFor(null)); all.push(...m); return m; };
  const id = (name: string) => e.s.players.find((p) => p.name === name)!.id;
  return {
    e, tr, all, id,
    start(holes?: string[][], board?: string[]) {
      const ev = e.startHand();
      if (holes && board) rig(e, holes, board);
      return feed(ev);
    },
    /** `name` acts (must be the player to act). */
    act(name: string, a: Action) {
      expect(e.s.hand?.toAct, `${name} to act`).toBe(id(name));
      const r = e.act(id(name), a);
      expect(r.error).toBeUndefined();
      return feed(r.events!);
    },
    toAct: () => e.s.players.find((p) => p.id === e.s.hand?.toAct)?.name ?? null,
    /** Everyone left checks or calls to the end. */
    callDown() { const out: Moment[] = []; for (let g = 0; g < 50 && e.s.hand?.toAct; g++) { const n = this.toAct()!; out.push(...this.act(n, { type: e.legal(e.s.hand.toAct)!.canCheck ? 'check' : 'call' })); } return out; },
  };
}
function rig(e: Engine, holes: string[][], board: string[]): void {
  const h = e.s.hand!;
  e.s.players.forEach((p, i) => { const c = holes[i]; if (c && h.ps[p.id]) h.ps[p.id]!.cards = c.map(parseCard); });
  const used = new Set([...holes.flat(), ...board]);
  const rest = [...'23456789TJQKA'].flatMap((r) => [...'shdc'].map((s) => r + s)).filter((c) => !used.has(c)).map(parseCard);
  const [f1, f2, f3, tn, rv] = board.map(parseCard) as [number, number, number, number, number];
  const burn = () => rest.pop()!;
  h.deck = [...rest.slice(0, -3), rv, burn(), tn, burn(), f3, f2, f1, burn()];
}

// heads-up and 3-way tables: the button acts first preflop heads-up; with 3+ the player after the big blind
describe('in-hand moments', () => {
  it('an all-in, then a call over it: opener and answerer, the target is the other player', () => {
    const t = table([{ name: 'A', stack: 7000 }, { name: 'B', stack: 8000 }, { name: 'C', stack: 4000 }, { name: 'D', stack: 2000 }]);
    t.start();
    // the first to act preflop shoves
    const first = t.toAct()!;
    const [m] = t.act(first, { type: 'allin' });
    expect(m).toMatchObject({ kind: 'allin', role: 'opener', pid: t.id(first), followUp: false, ms: SCENE_MS.allin });
    expect(m!.target?.pid).toBe(t.id(t.toAct()!));
    const second = t.toAct()!;
    const [a] = t.act(second, { type: 'call' });
    expect(a).toMatchObject({ kind: 'allinAnswered', role: 'answerer', variant: 'call', pid: t.id(second) });
    expect(a!.target?.pid).toBe(t.id(first));
  });

  it('positions come from the hand-start stacks (worked example 7k 8k 4k 2k)', () => {
    const t = table([{ name: 'A', stack: 7000 }, { name: 'B', stack: 8000 }, { name: 'C', stack: 4000 }, { name: 'D', stack: 2000 }]);
    t.start();
    // three shoves (the fourth would be over the three-scene limit)
    for (let g = 0; g < 3 && t.e.s.hand?.toAct; g++) {
      const n = t.toAct()!;
      const m = t.act(n, { type: 'allin' }).find((x) => x.pid === t.id(n));
      const want = { A: 'contender', B: 'dominant', C: 'contender', D: 'desperate' }[n];
      expect(m?.position, n).toBe(want);
    }
  });

  it('a second all-in on the same street is a 0.8 s follow-up; at most three in-hand scenes a hand', () => {
    const t = table([{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }, { name: 'C', stack: 1000 }, { name: 'D', stack: 1000 }, { name: 'E', stack: 1000 }]);
    t.start();
    const ms: Moment[] = [];
    for (let g = 0; g < 5 && t.e.s.hand?.toAct; g++) ms.push(...t.act(t.toAct()!, { type: 'allin' }));
    expect(ms.filter((m) => m.kind.startsWith('allin') && m.kind !== 'allinResult').map((m) => [m.kind, m.followUp])).toEqual([['allin', false], ['allinAnswered', false], ['allinAnswered', true]]);
    expect(ms[2]!.ms).toBe(FOLLOW_UP_MS);
  });

  it('a big bet (3/4 of the stack, not all-in) aims at the next player; a big call and a re-raise answer it', () => {
    const t = table([{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }, { name: 'C', stack: 4000 }]);
    t.start();
    // 3-way: A is the button and acts first preflop
    const n1 = t.toAct()!;
    const [bb] = t.act(n1, { type: 'raise', to: 800 });
    expect(bb).toMatchObject({ kind: 'bigBet', role: 'opener', pid: t.id(n1) });
    expect(bb!.target?.pid).toBe(t.id(t.toAct()!));
    const n2 = t.toAct()!;
    // the small blind (B, 1000) calls 790 of its 990: a big call
    const [c] = t.act(n2, { type: 'call' });
    expect(c).toMatchObject({ kind: 'bigBetAnswered', variant: 'call', pid: t.id(n2), target: { pid: t.id(n1) } });
    const n3 = t.toAct()!;
    // the big blind (C, 4000) re-raises: an answer over a big bet, whatever its size
    const [r] = t.act(n3, { type: 'raise', to: 1600 });
    expect(r).toMatchObject({ kind: 'bigBetAnswered', variant: 'raise', pid: t.id(n3) });
  });

  it('a small bet is no moment; one big-bet scene per player per hand', () => {
    const t = table([{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }]);
    t.start();
    expect(t.act(t.toAct()!, { type: 'raise', to: 60 })).toEqual([]);
    expect(t.act(t.toAct()!, { type: 'call' })).toEqual([]);
    // flop: the first to act bets big
    const n = t.toAct()!;
    expect(t.act(n, { type: 'bet', to: 750 })[0]?.kind).toBe('bigBet');
    const m = t.toAct()!;
    // m calls 750 of 940: a big call
    expect(t.act(m, { type: 'call' })[0]?.kind).toBe('bigBetAnswered');
    // the turn: m has had its big scene this hand, so a second big bet is no scene
    const k = t.toAct()!;
    expect(t.act(k, { type: 'check' })).toEqual([]);
    expect(t.act(t.toAct()!, { type: 'bet', to: 150 }).filter((x) => x.kind === 'bigBet')).toEqual([]);
  });

  it('the fold: folding to a big bet or all-in after putting a quarter of the stack in', () => {
    const t = table([{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }]);
    t.start();
    const n = t.toAct()!;
    t.act(n, { type: 'raise', to: 300 });
    const m = t.toAct()!;
    t.act(m, { type: 'call' });
    // flop: m (300 in of 1000) faces a big bet and folds
    const first = t.toAct()!;
    t.act(first, { type: 'bet', to: 600 });
    const [f] = t.act(t.toAct()!, { type: 'fold' });
    expect(f).toMatchObject({ kind: 'fold', role: 'answerer', target: { pid: t.id(first) } });
  });

  it('folding with little in, or to a small bet, is no moment', () => {
    const t = table([{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }]);
    t.start();
    t.act(t.toAct()!, { type: 'allin' });
    expect(t.act(t.toAct()!, { type: 'fold' })).toEqual([]); // only the big blind in
  });
});

describe('after the cards', () => {
  it('an all-in result: winner, knocked-out loser, pile tier from the net win over the start stack', () => {
    const t = table([{ name: 'A', stack: 500 }, { name: 'B', stack: 4000 }]);
    // B is the button heads-up and acts first; A has aces
    t.start([['As', 'Ah'], ['Kd', '7c']], ['2c', '9d', 'Js', '4h', '3s']);
    t.act(t.toAct()!, { type: 'call' });
    t.act(t.toAct()!, { type: 'allin' });
    const ms = t.act(t.toAct()!, { type: 'call' });
    const res = ms.find((m) => m.kind === 'allinResult')!;
    expect(res.pid).toBe(t.id('A'));
    expect(res.cast!.find((c) => c.pid === t.id('A'))).toMatchObject({ outcome: 'won', amount: 1000, pile: 1 });
    expect(res.cast!.find((c) => c.pid === t.id('B'))).toMatchObject({ outcome: 'lost', pile: null });
    expect(res.act1!.map((x) => x.kind)).toEqual(['allin', 'allinAnswered']);
  });

  it('a knockout that ends the game with no rebuys is the last one standing', () => {
    const t = table([{ name: 'A', stack: 500 }, { name: 'B', stack: 4000 }], { rebuys: false });
    t.start([['Kd', '7c'], ['As', 'Ah']], ['2c', '9d', 'Js', '4h', '3s']);
    t.act(t.toAct()!, { type: 'allin' });
    const ms = t.act(t.toAct()!, { type: 'call' });
    const last = ms.find((m) => m.kind === 'lastStanding')!;
    expect(last.pid).toBe(t.id('B'));
    expect(last.cast!.find((c) => c.pid === t.id('A'))?.outcome).toBe('out');
    expect(last.ms).toBe(5000);
  });

  it('a knockout with rebuys open is an all-in result (out), not the last one standing', () => {
    const t = table([{ name: 'A', stack: 500 }, { name: 'B', stack: 4000 }], { rebuys: true });
    t.start([['Kd', '7c'], ['As', 'Ah']], ['2c', '9d', 'Js', '4h', '3s']);
    t.act(t.toAct()!, { type: 'allin' });
    const ms = t.act(t.toAct()!, { type: 'call' });
    expect(ms.find((m) => m.kind === 'allinResult')?.cast?.find((c) => c.pid === t.id('A'))?.outcome).toBe('out');
  });

  it('a comeback: behind when turned up, wins on the river', () => {
    const t = table([{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }]);
    t.start([['Qs', 'Qd'], ['Ah', 'Kh']], ['2c', '7d', '9s', '4h', 'Ac']);
    t.act(t.toAct()!, { type: 'allin' });
    const ms = t.act(t.toAct()!, { type: 'call' });
    expect(ms.find((m) => m.kind === 'comeback')?.pid).toBe(t.id('B'));
  });

  it('a split all-in pot is a split', () => {
    const t = table([{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }]);
    t.start([['Ad', '9c'], ['Ac', '9d']], ['Ks', '7h', '2d', 'Kc', '3h']);
    t.act(t.toAct()!, { type: 'allin' });
    const ms = t.act(t.toAct()!, { type: 'call' });
    const s = ms.find((m) => m.kind === 'split')!;
    expect(s.cast!.every((c) => c.outcome === 'split')).toBe(true);
  });

  it('a big pot without an all-in (3/4 of the winner\'s start stack) is a big pot win; a small one is nothing', () => {
    const t = table([{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }]);
    t.start([['As', 'Ah'], ['Kd', '7c']], ['2c', '9d', 'Js', '4h', '3s']);
    t.act(t.toAct()!, { type: 'raise', to: 400 });
    t.act(t.toAct()!, { type: 'call' });
    const ms = t.callDown();
    expect(ms.find((m) => m.kind === 'bigPot')?.pid).toBe(t.id('A'));
    const u = table([{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }]);
    u.start([['As', 'Ah'], ['Kd', '7c']], ['2c', '9d', 'Js', '4h', '3s']);
    expect(u.callDown().filter((m) => m.kind !== 'bigBet')).toEqual([]);
  });

  it('the crown goes to the night\'s biggest pot once a few hands have been played', () => {
    const t = table([{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }]);
    for (let i = 0; i < 3; i++) { t.start(); t.callDown(); }
    t.start([['As', 'Ah'], ['Kd', '7c']], ['2c', '9d', 'Js', '4h', '3s']);
    t.act(t.toAct()!, { type: 'raise', to: 500 });
    t.act(t.toAct()!, { type: 'call' });
    const ms = t.callDown();
    expect(ms.find((m) => m.kind === 'bigPot')?.crown).toBe(true);
  });

  it('a rebuy is a moment; its time is held, results are not', () => {
    const t = table([{ name: 'A', stack: 1000 }, { name: 'B', stack: 1000 }], { rebuys: true });
    const p = t.e.s.players[0]!;
    t.e.s.players[1]!.stack += p.stack; p.stack = 0; p.busted = true;
    const r = t.e.apply({ t: 'rebuy', pid: p.id, now: 1 });
    expect(r.error).toBeUndefined();
    const ms = t.tr.feed(r.events!, t.e.viewFor(null));
    expect(ms).toMatchObject([{ kind: 'rebuy', pid: p.id, ms: SCENE_MS.rebuy }]);
    expect(holdMs(ms)).toBe(SCENE_MS.rebuy);
    expect(holdMs([{ ...ms[0]!, kind: 'allinResult', ms: 3500 }])).toBe(0);
  });

  it('a tracker that joins mid-hand (a reconnect) carries on from the view', () => {
    const t = table([{ name: 'A', stack: 1000 }, { name: 'B', stack: 3000 }]);
    t.start();
    const late = new DramaTracker();
    const r = t.e.act(t.e.s.hand!.toAct!, { type: 'allin' });
    const ms = late.feed(r.events!, t.e.viewFor(null));
    expect(ms[0]?.kind).toBe('allin');
  });
});

// ---------------------------------------------------------------- the server holds the clock
class FakeConn implements Conn {
  inbox: ServerMessage[] = [];
  send(text: string): void { const p = parseServer(text); if (!p.ok) throw new Error(p.error); this.inbox.push(p.msg); }
  close(): void {}
}
function room(drama = true) {
  let now = 1000;
  const clock = { now: () => now, schedule: () => {} };
  const r = new TableRoom('ABCD', clock, { save: () => {}, appendHand: () => {} }, null, { handPauseMs: 1000, drama });
  const conns: Record<string, FakeConn> = {};
  let n = 0;
  for (const pid of ['a', 'b', 'c']) {
    const c = new FakeConn(); r.connect(c); conns[pid] = c;
    r.message(c, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: pid, lastSeq: 0, token: newSeatToken(), name: pid.toUpperCase(), ...(pid === 'a' ? { settings: { turnTime: 20, timeBank: 0 } } : {}) }));
  }
  const send = (pid: string, m: Record<string, unknown>) => r.message(conns[pid]!, JSON.stringify({ ...m, actionId: `x${n++}` }));
  send('a', { t: 'host', cmd: 'deal' });
  return { r, send, conns, get now() { return now; }, set now(v: number) { now = v; } };
}

describe('the turn timer pauses for a scene (room)', () => {
  it('an all-in gives the next player the scene\'s length on top of their turn', () => {
    const t = room();
    const e = t.r.engine!;
    const pid = e.s.hand!.toAct!;
    t.now += 3000;
    t.send(pid, { t: 'act', handNo: e.s.handNo, action: { type: 'allin' } });
    expect(e.deadline()).toBe(t.now + SCENE_MS.allin + 20_000);
    // the phones see the later deadline in the same update
    const up = [...t.conns.a!.inbox].reverse().find((m) => m.t === 'update') as Extract<ServerMessage, { t: 'update' }>;
    expect((up.view as { hand: { deadline: number } }).hand.deadline).toBe(t.now + SCENE_MS.allin + 20_000);
    // time spent in the scene is not charged to the bank: acting right after it is on time
    const next = e.s.hand!.toAct!;
    t.now += SCENE_MS.allin + 19_000;
    t.send(next, { t: 'act', handNo: e.s.handNo, action: { type: 'call' } });
    expect(e.s.hand?.ps[next]?.lastAction).not.toBe('fold');
  });
  it('an ordinary call is not held; with drama off nothing is', () => {
    const t = room();
    const e = t.r.engine!;
    t.send(e.s.hand!.toAct!, { t: 'act', handNo: e.s.handNo, action: { type: 'call' } });
    expect(e.deadline()).toBe(t.now + 20_000);
    const u = room(false);
    const f = u.r.engine!;
    u.send(f.s.hand!.toAct!, { t: 'act', handNo: f.s.handNo, action: { type: 'allin' } });
    expect(f.deadline()).toBe(u.now + 20_000);
  });
  it('an all-in called to the end: the next hand waits for the in-hand scenes', () => {
    const t = room();
    const e = t.r.engine!;
    t.send(e.s.hand!.toAct!, { t: 'act', handNo: e.s.handNo, action: { type: 'fold' } });
    t.send(e.s.hand!.toAct!, { t: 'act', handNo: e.s.handNo, action: { type: 'allin' } });
    t.send(e.s.hand!.toAct!, { t: 'act', handNo: e.s.handNo, action: { type: 'call' } });
    expect(e.s.phase).not.toBe('hand');
    expect(t.r.nextDealAt).toBe(t.now + 1000 + SCENE_MS.allinAnswered);
  });
});
