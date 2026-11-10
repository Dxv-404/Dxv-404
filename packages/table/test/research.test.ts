// Research recording on the table server: every connection, message and hand becomes research events,
// every player's hole cards (folded too) and the full deck are recorded, decision snapshots hold exactly
// what the player could see, and nothing the recording does can disturb the game.
import { describe, expect, it } from 'vitest';
import { parseServer, type ServerMessage } from '@tp/protocol';
import { checkEnvelope, type Envelope } from '@tp/research';
import { TableRoom, newSeatToken, type Conn } from '../src/room';

class FakeConn implements Conn {
  inbox: ServerMessage[] = [];
  send(text: string): void { const p = parseServer(text); if (!p.ok) throw new Error(p.error); this.inbox.push(p.msg); }
  close(): void {}
}

function setup(research: { emit(e: Envelope): void } | undefined, settings: Record<string, unknown> = {}) {
  let now = 1_800_000_000_000;
  let wake: number | null = null;
  const deferred: (() => void)[] = [];
  const room = new TableRoom('ABCD', { now: () => now, schedule: (at) => { wake = at; } }, { save: () => {}, appendHand: () => {} }, null,
    { handPauseMs: 1000, ...(research ? { research } : {}), seed: () => 'ab'.repeat(32) });
  // (the tap defers hand work with setTimeout; tests run it by hand)
  const realSet = globalThis.setTimeout;
  const tokens: Record<string, string> = {};
  const conns: Record<string, FakeConn> = {};
  const join = (pid: string, extra: Record<string, unknown> = {}) => {
    const c = new FakeConn();
    room.connect(c);
    tokens[pid] ??= newSeatToken();
    const host = !room.engine ? { settings: { startStack: 1000, sb: 5, bb: 10, turnTime: 20, timeBank: 30, ...settings } } : {};
    room.message(c, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: pid, lastSeq: 0, token: tokens[pid], name: pid.toUpperCase(), rs: { d: `dev-${pid}-0000`, s: `ses-${pid}-0000` }, ...host, ...extra }));
    conns[pid] = c;
    return c;
  };
  let n = 0;
  const send = (pid: string, m: Record<string, unknown>) => { const actionId = `a${n++}`; room.message(conns[pid]!, JSON.stringify({ ...m, actionId })); return actionId; };
  return {
    room, join, send, conns, deferred, realSet,
    advance(ms: number) { now += ms; if (wake !== null && now >= wake) room.wake(); },
    get now() { return now; },
  };
}

async function flushTimers(): Promise<void> { await new Promise((r) => setTimeout(r, 5)); }

describe('research recording on the table server', () => {
  it('records connections, seats, messages and every hand, with all hole cards and the deck', async () => {
    const got: Envelope[] = [];
    const t = setup({ emit: (e) => got.push(e) });
    t.join('a'); t.join('b'); t.join('c');
    t.send('a', { t: 'host', cmd: 'deal' });
    // play the hand out: whoever is to act calls/checks, except c who folds; a raise along the way
    let guard = 0;
    while (t.room.engine!.s.phase === 'hand' && guard++ < 40) {
      const e = t.room.engine!;
      const pid = e.s.hand!.toAct!;
      const L = e.legal(pid)!;
      t.advance(700);
      if (pid === 'c') t.send(pid, { t: 'act', handNo: e.s.handNo, action: { type: 'fold' } });
      else if (pid === 'a' && e.s.hand!.street === 'flop' && L.canRaise && L.currentBet === 0) t.send(pid, { t: 'act', handNo: e.s.handNo, action: { type: 'bet', to: 40 } });
      else t.send(pid, { t: 'act', handNo: e.s.handNo, action: { type: L.canCheck ? 'check' : 'call' } });
    }
    await flushTimers();
    for (const e of got) expect(checkEnvelope(e, 's')).toBeNull();
    // one session, numbered without gaps
    expect(new Set(got.map((e) => e.s)).size).toBe(1);
    expect(got.map((e) => e.q)).toEqual(got.map((_, i) => i + 1));
    const types = got.map((e) => e.t);
    for (const ty of ['conn.open', 'conn.hello', 'seat.join', 'table.open', 'msg.in', 'hand.start', 'hand.decision', 'hand.action', 'hand.street', 'hand.end']) expect(types).toContain(ty);
    // the app's device id from hello is on the player's events
    expect(got.find((e) => e.t === 'seat.join' && e.g === 'b')!.d).toBe('dev-b-0000');
    const start = got.find((e) => e.t === 'hand.start')!;
    const sp = start.p as { holes: Record<string, string[]>; deck: string[]; seed: { combined: string } };
    expect(Object.keys(sp.holes).sort()).toEqual(['a', 'b', 'c']);
    expect(sp.deck).toHaveLength(52);
    expect(new Set(sp.deck).size).toBe(52);
    expect(sp.seed.combined).toMatch(/^[0-9a-f]{64}$/);
    const end = got.find((e) => e.t === 'hand.end')!.p as { holes: Record<string, string[]>; folded: string[]; inputs: unknown[]; before: unknown };
    expect(end.folded).toEqual(['c']);
    expect(end.holes.c).toHaveLength(2); // the folded hand too
    expect(end.before).toBeTruthy();
    // decisions: exactly what the player saw (their own cards only), legal actions, the timer
    const decs = got.filter((e) => e.t === 'hand.decision');
    for (const d of decs) {
      const p = d.p as { pid: string; legal: { minTo: number; maxTo: number }; deadline: number; view: { hand: { ps: Record<string, { cards: string[] | null }> }; players: Record<string, unknown>[]; log?: unknown } };
      expect(p.legal).toBeTruthy();
      expect(p.deadline).toBeGreaterThan(0);
      for (const [pid, hp] of Object.entries(p.view.hand.ps)) expect(hp.cards === null).toBe(pid !== p.pid);
      expect(p.view.log).toBeUndefined();
      expect(p.view.players.every((x) => !('name' in x))).toBe(true);
    }
    const acts = got.filter((e) => e.t === 'hand.action').map((e) => e.p as { a: string; decisionMs: number; sizePot: number | null; to: number | null });
    expect(decs.length).toBe(acts.length);
    expect(acts.every((a) => a.decisionMs === 700)).toBe(true);
    const bet = acts.find((a) => a.a === 'bet')!;
    expect(bet.to).toBe(40);
    expect(bet.sizePot).toBeCloseTo(40 / 30, 3);
    // every action message, with its id, when it arrived and the answer
    const msgs = got.filter((e) => e.t === 'msg.in').map((e) => e.p as { actionId: string; ok: boolean; rx: number });
    expect(msgs.length).toBeGreaterThanOrEqual(acts.length + 1);
    expect(msgs.every((m) => m.ok && m.actionId && m.rx > 0)).toBe(true);
  });

  it('records timeouts, sitting out, watchers, leaving and the rebuy offer', async () => {
    const got: Envelope[] = [];
    const t = setup({ emit: (e) => got.push(e) }, { turnTime: 5, timeBank: 0, rebuys: true });
    t.join('a'); t.join('b');
    t.join('w', { spectate: true });
    t.send('a', { t: 'host', cmd: 'deal' });
    t.advance(5000); // the player to act times out
    await flushTimers();
    const act = got.find((e) => e.t === 'hand.action')!.p as { timeout: boolean; auto: boolean };
    expect(act.timeout).toBe(true);
    expect(got.some((e) => e.t === 'conn.hello' && (e.p as { watch: boolean }).watch)).toBe(true);
    t.send('b', { t: 'sit', out: true });
    expect(got.some((e) => e.t === 'game.input' && (e.p as { input: { t: string } }).input.t === 'sitOut')).toBe(true);
    t.room.disconnect(t.conns.b!);
    expect(got.some((e) => e.t === 'conn.close' && (e.p as { pid: string }).pid === 'b')).toBe(true);
  });

  it('a game ended in the middle of a hand keeps that hand (hand.cut): the table before it and every input, enough to replay it', async () => {
    const got: Envelope[] = [];
    const t = setup({ emit: (e) => got.push(e) });
    t.join('a'); t.join('b'); t.join('c');
    t.send('a', { t: 'host', cmd: 'deal' });
    const e = t.room.engine!;
    const first = e.s.hand!.toAct!;
    t.send(first, { t: 'act', handNo: e.s.handNo, action: { type: 'call' } });
    const cards = Object.fromEntries(Object.entries(e.s.hand!.ps).map(([id, hp]) => [id, JSON.parse(JSON.stringify(hp.cards))]));
    t.send('a', { t: 'host', cmd: 'end' });
    await flushTimers();
    const cut = got.find((x) => x.t === 'hand.cut');
    expect(cut).toBeDefined();
    const p = cut!.p as { handNo: number; inputs: unknown[]; before: unknown; hand: { ps: Record<string, { cards: unknown }> } };
    expect(cut!.h).toBe(1);
    expect(p.handNo).toBe(1);
    expect(p.before).toBeTruthy();
    expect(p.inputs.length).toBeGreaterThanOrEqual(2); // the deal and the call
    // every player's hole cards travel with the cut hand, so it can be replayed exactly
    for (const [id, c] of Object.entries(cards)) expect(p.hand.ps[id]?.cards).toEqual(c);
  });

  it('a recording that throws never stops the game', async () => {
    const t = setup({ emit: () => { throw new Error('sink down'); } });
    t.join('a'); t.join('b');
    t.send('a', { t: 'host', cmd: 'deal' });
    expect(t.room.engine!.s.phase).toBe('hand');
    const e = t.room.engine!;
    t.send(e.s.hand!.toAct!, { t: 'act', handNo: 1, action: { type: 'fold' } });
    await flushTimers();
    expect(e.s.hand!.results).toBeTruthy();
  });

  it('an older app (no research ids in hello) plays the same', () => {
    const got: Envelope[] = [];
    const t = setup({ emit: (e) => got.push(e) });
    const c = new FakeConn();
    t.room.connect(c);
    t.room.message(c, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: 'old', lastSeq: 0, token: newSeatToken(), name: 'Old', settings: {} }));
    expect(c.inbox.find((m) => m.t === 'welcome')).toBeTruthy();
    expect(got.find((e) => e.t === 'seat.join')!.d).toBeNull();
  });
});
