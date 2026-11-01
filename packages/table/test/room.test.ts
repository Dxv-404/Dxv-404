import { describe, expect, it } from 'vitest';
import { Engine, type HandRecord } from '@tp/engine';
import { parseServer, type ServerMessage } from '@tp/protocol';
import { TableRoom, newSeatToken, type Conn, type Persisted } from '../src/room';

class FakeConn implements Conn {
  inbox: ServerMessage[] = [];
  closed: string | null = null;
  send(text: string): void { const p = parseServer(text); if (!p.ok) throw new Error(p.error); this.inbox.push(p.msg); }
  close(_code: number, reason: string): void { this.closed = reason; }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    return [...this.inbox].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined;
  }
}

function setup(opts = {}) {
  let now = 1000;
  let wake: number | null = null;
  const saves: Persisted[] = [];
  const hands: HandRecord[] = [];
  const clock = { now: () => now, schedule: (at: number | null) => { wake = at; } };
  const store = { save: (p: Persisted) => saves.push(JSON.parse(JSON.stringify(p)) as Persisted), appendHand: (h: HandRecord) => hands.push(h) };
  const room = new TableRoom('ABCD', clock, store, null, { handPauseMs: 1000, ...opts });
  const tokens: Record<string, string> = {};
  const join = (pid: string, extra: Record<string, unknown> = {}) => {
    const c = new FakeConn();
    room.connect(c);
    tokens[pid] ??= newSeatToken();
    // the first phone is the host: its hello carries the table's settings
    const host = !room.engine && !extra.settings && !extra.spectate ? { settings: {} } : {};
    room.message(c, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: pid, lastSeq: 0, token: tokens[pid], name: pid.toUpperCase(), ...host, ...extra }));
    return c;
  };
  let n = 0;
  const send = (c: FakeConn, m: Record<string, unknown>) => { const actionId = `a${n++}`; room.message(c, JSON.stringify({ ...m, actionId })); return actionId; };
  return {
    room, saves, hands, tokens, join, send, clock, store,
    get now() { return now; }, set now(v: number) { now = v; },
    get wake() { return wake; },
    advance(ms: number) { now += ms; if (wake !== null && now >= wake) room.wake(); },
  };
}

const actFor = (room: TableRoom, conns: Record<string, FakeConn>, send: (c: FakeConn, m: Record<string, unknown>) => string) => {
  const e = room.engine!;
  const pid = e.s.hand!.toAct!;
  const L = e.legal(pid)!;
  return send(conns[pid]!, { t: 'act', handNo: e.s.handNo, action: { type: L.canCheck ? 'check' : 'call' } });
};

describe('table room', () => {
  it('first hello creates the table with its settings and makes that player host', () => {
    const t = setup();
    const a = t.join('a', { settings: { startStack: 500, sb: 5, bb: 10, turnTime: 15 } });
    const w = a.last('welcome')!;
    expect(w.you).toBe('a');
    expect(w.host).toBe('a');
    expect(t.room.engine!.s.cfg.startStack).toBe(500);
    expect(t.room.engine!.s.cfg.turnTime).toBe(15);
    // settings from later players are ignored
    t.join('b', { settings: { startStack: 9999 } });
    expect(t.room.engine!.s.cfg.startStack).toBe(500);
  });

  it('only the host (whose hello carries settings) creates a table; a friend who is early is told to wait', () => {
    const t = setup();
    const early = new FakeConn(); t.room.connect(early);
    t.room.message(early, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: 'friend', lastSeq: 0, token: newSeatToken(), name: 'Friend' }));
    expect(early.last('error')).toMatchObject({ code: 'no_table', message: 'This table has not started yet' });
    expect(t.room.engine).toBeNull();
    const host = t.join('host', { settings: { startStack: 700 } });
    expect(host.last('welcome')!.host).toBe('host');
    const friend = t.join('friend');
    expect(friend.last('welcome')!.host).toBe('host');
    expect(t.room.engine!.s.cfg.startStack).toBe(700);
  });

  it('a seat token protects the seat; the right token rejoins it', () => {
    const t = setup();
    t.join('a');
    const thief = new FakeConn();
    t.room.connect(thief);
    t.room.message(thief, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: 'a', lastSeq: 0, token: newSeatToken(), name: 'X' }));
    expect(thief.last('error')!.code).toBe('not_allowed');
    expect(thief.closed).toBe('not_allowed');
    const again = t.join('a');
    expect(again.last('welcome')!.you).toBe('a');
  });

  it('refuses wrong versions, wrong tables, bad JSON, nameless joins, and messages before hello', () => {
    const t = setup();
    const c = new FakeConn();
    t.room.connect(c);
    t.room.message(c, 'not json');
    expect(c.last('error')!.code).toBe('bad_message');
    t.room.message(c, JSON.stringify({ t: 'rebuy', actionId: 'x1' }));
    expect(c.last('error')!.code).toBe('need_hello');
    t.room.message(c, JSON.stringify({ t: 'hello', v: 99, table: 'ABCD', player: 'a', lastSeq: 0, token: newSeatToken() }));
    expect(c.last('error')!.code).toBe('version');
    const d = new FakeConn(); t.room.connect(d);
    t.room.message(d, JSON.stringify({ t: 'hello', v: 1, table: 'ZZZZ', player: 'a', lastSeq: 0, token: newSeatToken() }));
    expect(d.last('error')!.code).toBe('no_table');
    const s = new FakeConn(); t.room.connect(s);
    t.room.message(s, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: 's', lastSeq: 0, spectate: true }));
    expect(s.last('error')!.code).toBe('no_table'); // nothing to watch yet
    const ok = t.join('a');
    const n = new FakeConn(); t.room.connect(n);
    t.room.message(n, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: 'n', lastSeq: 0, token: newSeatToken() }));
    expect(n.last('error')!.code).toBe('bad_message'); // a name is needed to sit down
    t.room.message(ok, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: 'a', lastSeq: 0, token: t.tokens.a }));
    expect(ok.last('error')!.message).toMatch(/Already/);
  });

  it('the host deals; a non-host cannot; hands then follow on their own', () => {
    const t = setup();
    const c = { a: t.join('a'), b: t.join('b'), c: t.join('c') };
    const bad = t.send(c.b, { t: 'host', cmd: 'deal' });
    expect(c.b.last('ack')).toMatchObject({ actionId: bad, ok: false, error: 'Only the host can do that' });
    t.send(c.a, { t: 'host', cmd: 'deal' });
    expect(t.room.engine!.s.phase).toBe('hand');
    expect(t.send(c.a, { t: 'host', cmd: 'deal' })).toBeTruthy();
    expect(c.a.last('ack')!.error).toBe('A hand is already running');
    let guard = 0;
    while (t.room.engine!.s.phase === 'hand' && guard++ < 50) actFor(t.room, c, t.send);
    expect(t.hands).toHaveLength(1);
    expect(t.room.engine!.s.phase).toBe('between');
    expect(t.wake).toBe(t.now + 1000);
    t.advance(1000);
    expect(t.room.engine!.s.handNo).toBe(2);
  });

  it('each phone sees only its own hole cards; spectators see none', () => {
    const t = setup();
    const c = { a: t.join('a'), b: t.join('b') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    const spec = new FakeConn(); t.room.connect(spec);
    t.room.message(spec, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: 'zz', lastSeq: 0, spectate: true }));
    const va = c.a.last('update')!.view as unknown as ReturnType<Engine['viewFor']>;
    const vb = c.b.last('update')!.view as unknown as ReturnType<Engine['viewFor']>;
    expect(va.hand!.ps.a!.cards).toHaveLength(2);
    expect(va.hand!.ps.b!.cards).toBeNull();
    expect(vb.hand!.ps.a!.cards).toBeNull();
    const vs = spec.last('welcome')!.view as unknown as ReturnType<Engine['viewFor']>;
    expect(vs.hand!.ps.a!.cards).toBeNull();
    expect(vs.me).toBeNull();
    // a spectator cannot act
    t.room.message(spec, JSON.stringify({ t: 'rebuy', actionId: 'z1' }));
    expect(spec.last('ack')!.ok).toBe(false);
  });

  it('a resent action is applied once and gets the same answer', () => {
    const t = setup();
    const c = { a: t.join('a'), b: t.join('b') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    const e = t.room.engine!;
    const pid = e.s.hand!.toAct!;
    const msg = JSON.stringify({ t: 'act', actionId: 'same-1', handNo: e.s.handNo, action: { type: 'call' } });
    const seq0 = t.room.seq;
    t.room.message(c[pid as 'a'], msg);
    t.room.message(c[pid as 'a'], msg);
    expect(t.room.seq).toBe(seq0 + 1);
    const acks = c[pid as 'a'].inbox.filter((m) => m.t === 'ack' && m.actionId === 'same-1');
    expect(acks).toHaveLength(2);
    expect(acks[0]).toEqual(acks[1]);
  });

  it('an action for a finished hand is refused politely', () => {
    const t = setup();
    const c = { a: t.join('a'), b: t.join('b') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    t.send(c.a, { t: 'act', handNo: 99, action: { type: 'fold' } });
    expect(c.a.last('ack')!.error).toBe('That hand is over');
  });

  it('seq numbers rise by one per change and every phone gets every update', () => {
    const t = setup();
    const c = { a: t.join('a'), b: t.join('b'), c: t.join('c') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    for (let i = 0; i < 4 && t.room.engine!.s.phase === 'hand'; i++) actFor(t.room, c, t.send);
    for (const conn of Object.values(c)) {
      const seqs = conn.inbox.filter((m) => m.t === 'update').map((m) => (m as { seq: number }).seq);
      for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBe(seqs[i - 1]! + 1);
      expect(seqs.at(-1)).toBe(t.room.seq);
    }
  });

  it('reconnecting with a recent seq gets the missed events; an old one gets just the table', () => {
    const t = setup({ keepUpdates: 3 });
    const c = { a: t.join('a'), b: t.join('b') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    const lastSeq = t.room.seq;
    actFor(t.room, c, t.send);
    const r = new FakeConn(); t.room.connect(r);
    t.room.message(r, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: 'b', lastSeq, token: t.tokens.b }));
    expect(r.last('welcome')!.missed!.length).toBeGreaterThan(0);
    for (let i = 0; i < 5 && t.room.engine!.s.phase === 'hand'; i++) actFor(t.room, { a: c.a, b: r }, t.send);
    const r2 = new FakeConn(); t.room.connect(r2);
    t.room.message(r2, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: 'b', lastSeq: 1, token: t.tokens.b }));
    expect(r2.last('welcome')!.missed).toBeUndefined();
  });

  it('a second connection for the same seat replaces the first', () => {
    const t = setup();
    const a1 = t.join('a');
    const a2 = t.join('a');
    expect(a1.last('error')!.code).toBe('replaced');
    expect(a1.closed).toBe('replaced');
    expect(a2.last('welcome')!.you).toBe('a');
  });

  it('presence: losing the last connection marks the player disconnected; coming back marks them back', () => {
    const t = setup();
    t.join('a');
    const b = t.join('b');
    t.room.disconnect(b);
    expect(t.room.engine!.player('b')!.connected).toBe(true); // a short blip is not shown
    t.advance(3000);
    expect(t.room.engine!.player('b')!.connected).toBe(false);
    t.join('b');
    expect(t.room.engine!.player('b')!.connected).toBe(true);
    t.room.disconnect(new FakeConn()); // unknown connection: nothing happens
  });

  it('a quick reconnect is invisible to the rest of the table', () => {
    const t = setup();
    t.join('a');
    const b = t.join('b');
    const seq = t.room.seq;
    t.room.disconnect(b);
    t.advance(1500);
    t.join('b');
    t.advance(5000);
    expect(t.room.engine!.player('b')!.connected).toBe(true);
    expect(t.room.seq).toBe(seq); // nothing was announced
  });

  it('the turn timer folds or checks for a player who does not act', () => {
    const t = setup();
    const c = { a: t.join('a', { settings: { turnTime: 5, timeBank: 0 } }), b: t.join('b') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    const pid = t.room.engine!.s.hand!.toAct!;
    expect(t.wake).toBe(t.now + 5000);
    t.advance(4999);
    expect(t.room.engine!.s.hand!.toAct).toBe(pid);
    t.advance(1);
    const ev = c.a.last('update')!.events as { t: string; auto?: boolean }[];
    expect(ev.some((x) => x.t === 'act' && x.auto)).toBe(true);
  });

  it('reactions reach everyone, at most one every 0.8 s per player; spectators cannot react', () => {
    const t = setup();
    const a = t.join('a'), b = t.join('b');
    t.room.message(a, JSON.stringify({ t: 'react', reaction: 'gg' }));
    expect(b.last('react')).toMatchObject({ from: 'a', reaction: 'gg' });
    t.room.message(a, JSON.stringify({ t: 'react', reaction: 'gg' }));
    expect(a.last('error')!.code).toBe('rate_limited');
    t.now += 800;
    t.room.message(a, JSON.stringify({ t: 'react', reaction: '🔥' }));
    expect(b.last('react')!.reaction).toBe('🔥');
    t.room.message(a, JSON.stringify({ t: 'react', reaction: 'free text chat' }));
    expect(a.last('error')!.code).toBe('bad_message');
    const s = new FakeConn(); t.room.connect(s);
    t.room.message(s, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: 's', lastSeq: 0, spectate: true }));
    const before = b.inbox.length;
    t.room.message(s, JSON.stringify({ t: 'react', reaction: 'gg' }));
    expect(b.inbox.length).toBe(before);
  });

  it('a flood of messages is cut off', () => {
    const t = setup({ rateLimit: 5, rateWindowMs: 1000 });
    const a = t.join('a');
    for (let i = 0; i < 10; i++) t.room.message(a, JSON.stringify({ t: 'ping', c: i }));
    expect(a.inbox.filter((m) => m.t === 'pong')).toHaveLength(4);
    expect(a.last('error')!.code).toBe('rate_limited');
    t.now += 1000;
    t.room.message(a, JSON.stringify({ t: 'ping', c: 1 }));
    expect(a.last('pong')!.seq).toBe(t.room.seq);
  });

  it('host controls: pause, resume, setBlinds, move, remove (hands host on), end', () => {
    const t = setup();
    const c = { a: t.join('a'), b: t.join('b'), c: t.join('c') };
    const ok = (id: string, conn = c.a) => conn.inbox.find((m) => m.t === 'ack' && m.actionId === id) as { ok: boolean; error?: string };
    expect(ok(t.send(c.a, { t: 'host', cmd: 'setBlinds', sb: 20, bb: 40 })).ok).toBe(true);
    expect(ok(t.send(c.a, { t: 'host', cmd: 'setBlinds' })).error).toBe('Blinds needed');
    expect(ok(t.send(c.a, { t: 'host', cmd: 'move' })).error).toBe('Which player?');
    expect(ok(t.send(c.a, { t: 'host', cmd: 'move', pid: 'b', dir: 1 })).ok).toBe(true);
    t.send(c.a, { t: 'host', cmd: 'deal' });
    expect(t.room.engine!.s.level.bb).toBe(40);
    expect(ok(t.send(c.a, { t: 'host', cmd: 'pause' })).ok).toBe(true);
    expect(t.wake).toBeNull();
    expect(ok(t.send(c.a, { t: 'host', cmd: 'resume' })).ok).toBe(true);
    expect(t.wake).not.toBeNull();
    // the host leaves the table: hosting passes to someone still connected
    expect(ok(t.send(c.a, { t: 'host', cmd: 'remove', pid: 'a' })).ok).toBe(true);
    expect(['b', 'c']).toContain(t.room.host);
    const h = c[t.room.host as 'b'];
    expect(ok(t.send(h, { t: 'host', cmd: 'end' }), h).ok).toBe(true);
    expect(t.room.engine!.s.phase).toBe('ended');
    expect(t.room.running).toBe(false);
  });

  it('sitting out, sitting back in, rebuys and straddles go through', () => {
    const t = setup();
    const c = { a: t.join('a', { settings: { straddle: true } }), b: t.join('b'), c: t.join('c') };
    const ok = (id: string, conn: FakeConn) => (conn.inbox.find((m) => m.t === 'ack' && m.actionId === id) as { ok: boolean }).ok;
    expect(ok(t.send(c.c, { t: 'sit', out: true }), c.c)).toBe(true);
    expect(t.room.engine!.player('c')!.sittingOut).toBe(true);
    expect(ok(t.send(c.c, { t: 'sit', out: false }), c.c)).toBe(true);
    expect(ok(t.send(c.b, { t: 'straddle', on: true }), c.b)).toBe(true);
    expect(ok(t.send(c.b, { t: 'rebuy' }), c.b)).toBe(false); // full stack: nothing to top up
  });

  it('saves after every change and comes back after a restart, mid-hand, exactly as it was', () => {
    const t = setup();
    const c = { a: t.join('a'), b: t.join('b'), c: t.join('c') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    actFor(t.room, c, t.send);
    const before = t.room.engine!.snapshot();
    const saved = t.saves.at(-1)!;
    expect(saved.inputs.length).toBeGreaterThan(0); // mid-hand: the hand's inputs so far
    const room2 = new TableRoom('ABCD', t.clock, t.store, saved, { handPauseMs: 1000 });
    room2.settleAfterRestart();
    const after = room2.engine!.snapshot();
    // the same table, except that nobody is connected to a just-restarted server (which also starts the
    // once-per-hand disconnect grace for the player to act)
    const same = (g: typeof before) => ({ ...g, players: g.players.map((p) => ({ ...p, connected: true })), log: [], hand: { ...g.hand!, graceUsed: {} } });
    expect(same(after)).toEqual(same(before));
    expect(room2.engine!.s.players.every((p) => !p.connected)).toBe(true);
    expect(room2.host).toBe('a');
    expect(room2.seq).toBeGreaterThan(saved.seq);
    // the hand finishes on the restored room and its log replays identically
    const conns = { a: new FakeConn(), b: new FakeConn(), c: new FakeConn() };
    for (const [pid, conn] of Object.entries(conns)) { room2.connect(conn); room2.message(conn, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: pid, lastSeq: 0, token: t.tokens[pid] })); }
    let n = 0;
    const send = (conn: FakeConn, m: Record<string, unknown>) => { const id = `r${n++}`; room2.message(conn, JSON.stringify({ ...m, actionId: id })); return id; };
    let guard = 0;
    while (room2.engine!.s.phase === 'hand' && guard++ < 60) actFor(room2, conns, send);
    const rec = t.hands.at(-1)!;
    expect(rec.handNo).toBe(1);
    const replayed = Engine.replay(rec.before, rec.inputs);
    expect(replayed.s.hand!.results).toEqual(rec.results);
  });

  it('a resent tap is still applied once after a restart', () => {
    const t = setup();
    const c = { a: t.join('a'), b: t.join('b') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    const e = t.room.engine!;
    const pid = e.s.hand!.toAct! as 'a';
    const msg = JSON.stringify({ t: 'act', actionId: 'keep-1', handNo: e.s.handNo, action: { type: 'call' } });
    t.room.message(c[pid], msg);
    const room2 = new TableRoom('ABCD', t.clock, t.store, t.saves.at(-1)!, {});
    room2.settleAfterRestart();
    const seq = room2.seq;
    const again = new FakeConn(); room2.connect(again);
    room2.message(again, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: pid, lastSeq: 0, token: t.tokens[pid] }));
    const seqAfterHello = room2.seq;
    room2.message(again, msg);
    expect(room2.seq).toBe(seqAfterHello);
    expect(again.last('ack')).toMatchObject({ actionId: 'keep-1', ok: true });
    expect(seqAfterHello).toBeGreaterThan(seq);
  });

  it('a sleeping server wakes with its sockets: adopted connections keep their seats, nobody is marked gone', () => {
    const t = setup();
    const c = { a: t.join('a'), b: t.join('b') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    expect(t.room.connInfo(c.a)).toEqual({ pid: 'a', hello: true });
    expect(t.room.connInfo(new FakeConn())).toBeNull();
    const woke = new TableRoom('ABCD', t.clock, t.store, t.saves.at(-1)!, {});
    woke.adopt(c.a, 'a'); woke.adopt(c.b, 'b');
    const seq = woke.seq;
    woke.settleAfterRestart();
    expect(woke.seq).toBe(seq);
    expect(woke.engine!.s.players.every((p) => p.connected)).toBe(true);
    const pid = woke.engine!.s.hand!.toAct! as 'a';
    woke.message(c[pid], JSON.stringify({ t: 'act', actionId: 'w1', handNo: woke.engine!.s.handNo, action: { type: 'call' } }));
    expect(c[pid].last('ack')).toMatchObject({ actionId: 'w1', ok: true });
    new TableRoom('ZZZZ', t.clock, t.store, null, {}).settleAfterRestart(); // nothing to settle
  });

  it('a started game that everyone has left ends by itself after 20 minutes, and is recorded once', () => {
    const t = setup();
    const league: [string, string][] = [];
    (t.store as { league?: (k: string, id: string) => void }).league = (k, id) => league.push([k, id]);
    const c = { a: t.join('a'), b: t.join('b') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    t.room.disconnect(c.a); t.room.disconnect(c.b);
    t.advance(3000); // both shown as gone
    t.advance(10 * 60_000);
    expect(t.room.engine!.s.phase).not.toBe('ended');
    // someone comes back for a moment: the clock starts again when they leave
    const back = t.join('a');
    t.room.disconnect(back);
    t.advance(15 * 60_000);
    expect(t.room.engine!.s.phase).not.toBe('ended');
    for (let i = 0; i < 30 && t.room.engine!.s.phase !== 'ended'; i++) t.advance(60_000);
    expect(t.room.engine!.s.phase).toBe('ended');
    expect(league.filter(([k]) => k === 'end')).toHaveLength(1);
    expect(t.room.running).toBe(false);
  });

  it('a table that never dealt does not end by itself', () => {
    const t = setup();
    const a = t.join('a');
    t.room.disconnect(a);
    t.advance(3000);
    t.advance(60 * 60_000);
    expect(t.room.engine!.s.phase).toBe('lobby');
  });

  it('stats and connection counts', () => {
    const t = setup();
    expect(t.room.stats().phase).toBe('new');
    expect(t.room.persisted()).toBeNull();
    t.join('a');
    expect(t.room.stats()).toMatchObject({ players: 1, connections: 1, phase: 'lobby' });
    expect(t.room.connectionCount).toBe(1);
    const quiet = new FakeConn();
    t.room.connect(quiet);
    expect(t.room.hasSaidHello(quiet)).toBe(false);
    expect(t.room.hasSaidHello(new FakeConn())).toBe(false);
  });
});
