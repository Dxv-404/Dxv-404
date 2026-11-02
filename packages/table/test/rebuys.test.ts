// v3 rebuys at a live table: the host's settings are checked and clamped by the server, rebuys go through only at
// 0 chips, and an offline night carried on from a checkpoint keeps everyone's rebuys.
import { describe, expect, it } from 'vitest';
import { TableSettings, parseServer, type ServerMessage } from '@tp/protocol';
import { TableRoom, newSeatToken, type Conn, type Persisted } from '../src/room';

class FakeConn implements Conn {
  inbox: ServerMessage[] = [];
  send(text: string): void { const p = parseServer(text); if (!p.ok) throw new Error(p.error); this.inbox.push(p.msg); }
  close(): void { /* closed */ }
  ack(id: string) { return this.inbox.find((m) => m.t === 'ack' && m.actionId === id) as Extract<ServerMessage, { t: 'ack' }> | undefined; }
  view() { return [...this.inbox].reverse().find((m) => m.t === 'update' || m.t === 'welcome')!.view as Record<string, unknown>; }
}

function setup(settings: Record<string, unknown>, opts: Record<string, unknown> = {}, saved: Persisted | null = null) {
  let now = 1000;
  const saves: Persisted[] = [];
  const clock = { now: () => now, schedule: () => {} };
  const league: { kind: string; payload: unknown }[] = [];
  const store = { save: (p: Persisted) => saves.push(JSON.parse(JSON.stringify(p)) as Persisted), appendHand: () => {}, league: (kind: 'hand' | 'end', _id: string, payload: unknown) => { league.push({ kind, payload }); } };
  const room = new TableRoom('RBYS', clock, store, saved, { handPauseMs: 1000, ...opts });
  const tokens: Record<string, string> = {};
  const join = (pid: string, first = false) => {
    const c = new FakeConn();
    room.connect(c);
    tokens[pid] ??= newSeatToken();
    room.message(c, JSON.stringify({ t: 'hello', v: 1, table: 'RBYS', player: pid, lastSeq: 0, token: tokens[pid], name: pid.toUpperCase(), ...(first ? { settings } : {}) }));
    return c;
  };
  let n = 0;
  const send = (c: FakeConn, m: Record<string, unknown>) => { const actionId = `r${n++}`; room.message(c, JSON.stringify({ ...m, actionId })); return actionId; };
  return { room, join, send, saves, tokens, league, get now() { return now; }, set now(v: number) { now = v; } };
}

describe('rebuy settings', () => {
  it('the protocol takes the rebuy settings and refuses nonsense', () => {
    expect(TableSettings.safeParse({ rebuys: true, maxRebuys: 2, rebuyAmount: 1500, rebuyUntilLevel: 6 }).success).toBe(true);
    expect(TableSettings.safeParse({ rebuyAmount: -1 }).success).toBe(false);
    expect(TableSettings.safeParse({ rebuyAmount: 1.5 }).success).toBe(false);
    expect(TableSettings.safeParse({ rebuyUntilLevel: 101 }).success).toBe(false);
    expect(TableSettings.safeParse({ maxRebuys: -1 }).success).toBe(false);
    expect(TableSettings.safeParse({ rebuyBelow: 1000 }).success).toBe(false); // top-ups cannot be asked for
  });

  it('the server keeps a custom amount between 20 and 500 big blinds', () => {
    const lo = setup({ startStack: 1000, sb: 10, bb: 20, rebuyAmount: 100 });
    lo.join('a', true);
    expect(lo.room.engine!.s.cfg.rebuyAmount).toBe(400);
    const hi = setup({ startStack: 1000, sb: 10, bb: 20, rebuyAmount: 999_999 });
    hi.join('a', true);
    expect(hi.room.engine!.s.cfg.rebuyAmount).toBe(10_000);
    const ok = setup({ startStack: 1000, sb: 10, bb: 20, rebuyAmount: 1500, maxRebuys: 2 });
    const a = ok.join('a', true);
    expect(ok.room.engine!.s.cfg).toMatchObject({ rebuyAmount: 1500, maxRebuys: 2, rebuyBelow: 1 });
    expect(a.view().rebuy).toMatchObject({ amount: 1500, max: 2, left: 2, atZero: true });
  });

  it('closing after a level only when blinds go up; rebuys off clears the rest', () => {
    const flat = setup({ blindUpEvery: 0, rebuyUntilLevel: 4 });
    flat.join('a', true);
    expect(flat.room.engine!.s.cfg.rebuyUntilLevel).toBe(0);
    const up = setup({ blindUpEvery: 10, rebuyUntilLevel: 4 });
    up.join('a', true);
    expect(up.room.engine!.s.cfg.rebuyUntilLevel).toBe(4);
    const off = setup({ rebuys: false, maxRebuys: 2, rebuyAmount: 5000, blindUpEvery: 10, rebuyUntilLevel: 4 });
    off.join('a', true);
    expect(off.room.engine!.s.cfg).toMatchObject({ rebuys: false, maxRebuys: 0, rebuyAmount: 0, rebuyUntilLevel: 0 });
  });
});

describe('rebuys at the table', () => {
  it('a rebuy with chips is refused; at 0 chips it goes through and the next deal includes them', () => {
    const t = setup({ startStack: 1000, sb: 10, bb: 20, maxRebuys: 1, rebuyAmount: 600 });
    const a = t.join('a', true), b = t.join('b'), c = t.join('c');
    const refused = t.send(b, { t: 'rebuy' });
    expect(b.ack(refused)).toMatchObject({ ok: false, error: 'You can rebuy once you are out of chips' });
    const e = t.room.engine!;
    e.player('b')!.stack = 0; e.player('b')!.busted = true; // as if b lost it all
    const r = t.send(b, { t: 'rebuy' });
    expect(b.ack(r)).toMatchObject({ ok: true });
    expect(e.player('b')).toMatchObject({ stack: 600, rebuysUsed: 1, busted: false });
    expect(c.view().players).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'b', rebuysUsed: 1, stack: 600 })]));
    expect(b.view().rebuy).toMatchObject({ used: 1, left: 0 });
    e.player('b')!.stack = 0;
    const again = t.send(b, { t: 'rebuy' });
    expect(b.ack(again)).toMatchObject({ ok: false, error: 'No rebuys left' });
    void a;
  });

  it('the view says when the next hand is dealt (for the bust-out bar)', () => {
    const t = setup({ startStack: 1000, sb: 10, bb: 20 });
    const conns: Record<string, FakeConn> = { a: t.join('a', true), b: t.join('b') };
    const a = conns.a!;
    t.send(a, { t: 'host', cmd: 'deal' });
    const e = t.room.engine!;
    expect(a.view().nextDealAt).toBeNull(); // mid-hand
    while (e.s.phase === 'hand') t.send(conns[e.s.hand!.toAct!]!, { t: 'act', handNo: e.s.handNo, action: { type: 'fold' } });
    expect(a.view().nextDealAt).toBe(t.now + 1000);
  });

  it('an offline night carried on from a checkpoint keeps the rebuy rules and what everyone used', () => {
    const t = setup({ startStack: 1000, sb: 10, bb: 20, maxRebuys: 2, rebuyAmount: 800, blindUpEvery: 5, rebuyUntilLevel: 3 }, { offline: true, sharedShuffle: false });
    t.join('a', true); const b = t.join('b'); t.join('c');
    const e = t.room.engine!;
    e.player('b')!.stack = 0; e.player('b')!.busted = true;
    expect(b.ack(t.send(b, { t: 'rebuy' }))).toMatchObject({ ok: true });
    const cp = t.room.checkpoint()!;
    const carried = TableRoom.fromCheckpoint(cp.data, 'c');
    const t2 = setup({}, { offline: true, sharedShuffle: false }, carried);
    const e2 = t2.room.engine!;
    expect(e2.s.cfg).toMatchObject({ maxRebuys: 2, rebuyAmount: 800, rebuyUntilLevel: 3, rebuyBelow: 1 });
    expect(e2.player('b')).toMatchObject({ stack: 800, rebuysUsed: 1, buyins: 1800 });
    Object.assign(t2.tokens, t.tokens); // the same phones
    const b2 = t2.join('b');
    expect(b2.view().rebuy).toMatchObject({ used: 1, left: 1, amount: 800 });
    e2.player('b')!.stack = 0;
    expect(b2.ack(t2.send(b2, { t: 'rebuy' }))).toMatchObject({ ok: true });
    e2.player('b')!.stack = 0;
    expect(b2.ack(t2.send(b2, { t: 'rebuy' }))).toMatchObject({ ok: false, error: 'No rebuys left' });
  });

  it('the league counts every rebuy as money in, at its real size', () => {
    const t = setup({ startStack: 1000, sb: 10, bb: 20, rebuyAmount: 2500 });
    const conns: Record<string, FakeConn> = { a: t.join('a', true), b: t.join('b') };
    t.send(conns.a!, { t: 'host', cmd: 'deal' });
    const e = t.room.engine!;
    // b goes all-in and a calls until someone is out of chips, then they rebuy
    let rebought = 0;
    for (let k = 0; k < 60 && rebought < 2; k++) {
      if (e.s.phase !== 'hand') { t.send(conns.a!, { t: 'host', cmd: 'deal' }); if ((e.s.phase as string) !== 'hand') break; }
      while (e.s.phase === 'hand') {
        const pid = e.s.hand!.toAct!;
        const L = e.legal(pid)!;
        t.send(conns[pid]!, { t: 'act', handNo: e.s.handNo, action: { type: L.canRaise ? 'allin' : 'call' } });
      }
      for (const p of e.s.players) if (p.stack === 0) { expect(conns[p.id]!.ack(t.send(conns[p.id]!, { t: 'rebuy' }))).toMatchObject({ ok: true }); rebought++; }
    }
    expect(rebought).toBeGreaterThan(0);
    t.send(conns.a!, { t: 'host', cmd: 'end' });
    const end = t.league.find((l) => l.kind === 'end')!.payload as { players: { key: string; buyins: number; final: number }[] };
    expect(end.players.reduce((a, p) => a + p.buyins, 0)).toBe(2000 + rebought * 2500);
    expect(end.players.reduce((a, p) => a + p.final - p.buyins, 0)).toBe(0);
  });
});
