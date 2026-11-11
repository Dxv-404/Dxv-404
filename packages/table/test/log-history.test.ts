import { describe, expect, it } from 'vitest';
import type { HandRecord, LogLine } from '@tp/engine';
import { parseServer, type ServerMessage } from '@tp/protocol';
import { TableRoom, newSeatToken, type Conn, type Persisted } from '../src/room';
import { LogHistory } from '../src/log-history';

class FakeConn implements Conn {
  inbox: ServerMessage[] = [];
  send(text: string): void { const p = parseServer(text); if (!p.ok) throw new Error(p.error); this.inbox.push(p.msg); }
  close(): void { /* not needed */ }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    return [...this.inbox].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined;
  }
}

function table() {
  let now = 1000, wake: number | null = null, n = 0;
  const saves: Persisted[] = [];
  const logs: Record<number, LogLine[]> = {};
  let resets = 0;
  const clock = { now: () => now, schedule: (at: number | null) => { wake = at; } };
  const store = {
    save: (p: Persisted) => saves.push(JSON.parse(JSON.stringify(p)) as Persisted), appendHand: (_h: HandRecord) => { /* not needed */ },
    saveLog: (h: number, lines: LogLine[] | null) => { if (lines) logs[h] = JSON.parse(JSON.stringify(lines)) as LogLine[]; else delete logs[h]; },
    resetLog: () => { resets++; },
  };
  const tokens: Record<string, string> = {};
  const make = (saved: Persisted | null, history: Record<number, LogLine[]> | null) => new TableRoom('ABCD', clock, store, saved, { handPauseMs: 1000, history });
  let room = make(null, null);
  const join = (pid: string) => {
    const c = new FakeConn();
    room.connect(c);
    tokens[pid] ??= newSeatToken();
    room.message(c, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: pid, lastSeq: 0, token: tokens[pid], name: pid.toUpperCase(), ...(room.engine ? {} : { settings: {} }) }));
    return c;
  };
  const send = (c: FakeConn, m: Record<string, unknown>) => room.message(c, JSON.stringify({ ...m, actionId: `a${n++}` }));
  const playHand = (c: Record<string, FakeConn>, thinkMs = 700) => {
    let guard = 0;
    while (room.engine!.s.phase === 'hand' && guard++ < 60) {
      const e = room.engine!, pid = e.s.hand!.toAct!, L = e.legal(pid)!;
      now += thinkMs;
      send(c[pid]!, { t: 'act', handNo: e.s.handNo, action: { type: L.canCheck ? 'check' : 'call' } });
    }
  };
  const next = () => { now += 1000; if (wake !== null && now >= wake) room.wake(); };
  return { get room() { return room; }, saves, logs, join, send, playHand, next, restart: () => { room = make(saves.at(-1)!, logs); room.settleAfterRestart(); }, get resets() { return resets; } };
}

describe('the table log', () => {
  it('every line is numbered and says what it is as data: who, what, how much, the pot after', () => {
    const t = table();
    const c = { a: t.join('a'), b: t.join('b'), c: t.join('c') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    t.playHand(c);
    const log = t.room.engine!.s.log;
    expect(log.map((l) => l.n)).toEqual(log.map((_, i) => i + 1));
    expect(log.find((l) => l.k === 'hand')).toMatchObject({ h: 1, sb: 5, bb: 10, players: 3, pot: 15 });
    expect(log.filter((l) => l.k === 'post').map((l) => l.what)).toEqual(['sb', 'bb']);
    const call = log.find((l) => l.k === 'act' && l.a === 'call')!;
    expect(call).toMatchObject({ amt: 10, to: 10, pot: 25, st: 'preflop', ms: 700 });
    expect(call.text).toBe(`${call.who} calls 10`);
    expect(log.filter((l) => l.k === 'street').map((l) => [l.st, l.cards!.length, l.fresh])).toEqual([['flop', 3, 3], ['turn', 4, 1], ['river', 5, 1]]);
    expect(log.filter((l) => l.k === 'show')).toHaveLength(3);
    const wins = log.filter((l) => l.k === 'win');
    expect(wins.reduce((s, l) => s + l.amt!, 0)).toBe(30);
    expect(wins[0]!.cards).toHaveLength(5);
    expect(wins[0]!.desc).toBeTruthy();
  });

  it('a screen is sent its own decision times and nobody else’s', () => {
    const t = table();
    const c = { a: t.join('a'), b: t.join('b'), c: t.join('c') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    t.playHand(c);
    for (const pid of ['a', 'b', 'c'] as const) {
      const lines = (c[pid].last('update')!.view as { log: LogLine[] }).log.filter((l) => l.k === 'act');
      expect(lines.length).toBeGreaterThan(3);
      expect(lines.filter((l) => l.pid === pid).every((l) => l.ms === 700)).toBe(true);
      expect(lines.filter((l) => l.pid !== pid).every((l) => l.ms === undefined)).toBe(true);
      t.room.message(c[pid], JSON.stringify({ t: 'log' }));
      const page = c[pid].last('log')!.hands.flatMap((h) => h.lines as LogLine[]).filter((l) => l.k === 'act');
      expect(page.some((l) => l.pid === pid && l.ms === 700)).toBe(true);
      expect(page.filter((l) => l.pid !== pid).every((l) => l.ms === undefined)).toBe(true);
    }
    // someone watching gets no times at all
    const w = new FakeConn();
    t.room.connect(w);
    t.room.message(w, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: 'w', lastSeq: 0, spectate: true }));
    t.room.message(w, JSON.stringify({ t: 'log' }));
    expect(w.last('log')!.hands.flatMap((h) => h.lines as LogLine[]).every((l) => l.ms === undefined)).toBe(true);
  });

  it('the whole night is kept (the engine keeps 80 lines), served a page at a time, oldest hand first', () => {
    const t = table();
    const c = { a: t.join('a'), b: t.join('b'), c: t.join('c') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    for (let i = 0; i < 30; i++) { t.playHand(c); t.next(); }
    const handNo = t.room.engine!.s.handNo;
    expect(handNo).toBeGreaterThan(29);
    expect(t.room.engine!.s.log.length).toBe(80);
    t.room.message(c.b, JSON.stringify({ t: 'log' }));
    const p1 = c.b.last('log')!;
    expect(p1.hands).toHaveLength(12);
    expect(p1.hands.at(-1)!.h).toBe(handNo);
    expect(p1.more).toBe(true);
    const seen = new Map<number, LogLine[]>();
    let page = p1;
    for (let guard = 0; guard < 10; guard++) {
      for (const h of page.hands) seen.set(h.h, h.lines as LogLine[]);
      if (!page.more) break;
      t.room.message(c.b, JSON.stringify({ t: 'log', before: page.hands[0]!.h }));
      page = c.b.last('log')!;
      expect(page.before).toBeDefined();
    }
    // every hand of the night, each whole: the blinds, its "hand" line, and a win at the end
    for (let h = 1; h < handNo; h++) {
      const lines = seen.get(h)!;
      expect(lines[0]!.k, `hand ${h}`).toBe('post');
      expect(lines.filter((l) => l.k === 'hand'), `hand ${h}`).toHaveLength(1);
      expect(lines.at(-1)!.k, `hand ${h}`).toBe('win');
    }
    const all = [...seen.entries()].sort((x, y) => x[0] - y[0]).flatMap(([, l]) => l).map((l) => l.n!);
    expect(all).toEqual(all.map((_, i) => i + 1)); // no line lost, none twice
    expect(seen.get(0)!.map((l) => l.k)).toEqual(['join', 'join', 'join']);
  });

  it('is saved a hand at a time and comes back after a restart, the hand in progress included', () => {
    const t = table();
    let c = { a: t.join('a'), b: t.join('b'), c: t.join('c') };
    t.send(c.a, { t: 'host', cmd: 'deal' });
    for (let i = 0; i < 8; i++) { t.playHand(c); t.next(); }
    const e = t.room.engine!, pid = e.s.hand!.toAct!;
    t.send(c[pid as 'a'], { t: 'act', handNo: e.s.handNo, action: { type: 'call' } });
    expect(Object.keys(t.logs).map(Number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]); // hand 9 is being played: not saved yet
    const before = (() => { t.room.message(c.a, JSON.stringify({ t: 'log' })); return c.a.last('log')!; })();
    t.restart();
    c = { a: t.join('a'), b: t.join('b'), c: t.join('c') };
    t.room.message(c.a, JSON.stringify({ t: 'log' }));
    const after = c.a.last('log')!;
    const strip = (p: typeof after) => p.hands.map((h) => ({ h: h.h, lines: (h.lines as LogLine[]).filter((l) => l.k !== 'join').map((l) => l.text) }));
    expect(strip(after)).toEqual(strip(before));
    expect(after.hands.at(-1)!.h).toBe(9);
  });

  it('a line the dealer takes back leaves the history too', () => {
    const h = new LogHistory();
    const L = (n: number, hand: number, text: string): LogLine => ({ n, h: hand, text });
    h.sync([L(1, 0, 'A joins'), L(2, 1, 'Hand #1'), L(3, 1, 'A bets 40'), L(4, 1, 'B calls 40')]);
    h.sync([L(2, 1, 'Hand #1'), L(3, 1, 'A bets 40'), L(4, 1, 'Dealer undoes the last action')]);
    expect(h.page(undefined, null).hands).toEqual([{ h: 0, lines: [L(1, 0, 'A joins')] }, { h: 1, lines: [L(2, 1, 'Hand #1'), L(3, 1, 'A bets 40'), L(4, 1, 'Dealer undoes the last action')] }]);
    const saved: Record<number, LogLine[] | null> = {};
    h.flush((n, lines) => { saved[n] = lines; });
    expect(Object.keys(saved)).toEqual(['0', '1']);
    h.sync([L(3, 1, 'A bets 40'), L(4, 1, 'Dealer undoes the last action')]);
    h.flush((n) => { throw new Error(`hand ${n} was saved again though nothing changed`); });
  });

  it('lines written before lines were numbered are left alone', () => {
    const h = new LogHistory();
    h.sync([{ h: 3, text: 'old line' }]);
    expect(h.size).toBe(0);
  });
});
