// The pause after a hand follows the result (design v3results.py): 3 s when everyone folded, about 8 s after a
// showdown (10.5 s for a straight or royal flush), plus the slow board when the hand was all-in before the river.
import { describe, expect, it } from 'vitest';
import { parseServer, type ServerMessage } from '@tp/protocol';
import { TableRoom, newSeatToken, type Conn, type RoomOptions } from '../src/room';
import { FOLD_PAUSE_MS, RUNOUT_FIRST_MS, RUNOUT_STREET_MS, bestCategory, resultsPauseMs, runoutStreets } from '../src/pause';
import { SCENE_MS } from '../src/drama';

class FakeConn implements Conn {
  inbox: ServerMessage[] = [];
  send(text: string): void { const p = parseServer(text); if (!p.ok) throw new Error(p.error); this.inbox.push(p.msg); }
  close(): void {}
}

function setup(opts: RoomOptions = {}) {
  let now = 1000;
  let wake: number | null = null;
  const room = new TableRoom('ABCD', { now: () => now, schedule: (at: number | null) => { wake = at; } }, { save: () => {}, appendHand: () => {} }, null, opts);
  const conns: Record<string, FakeConn> = {};
  for (const pid of ['a', 'b']) {
    const c = new FakeConn();
    room.connect(c);
    room.message(c, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: pid, lastSeq: 0, token: newSeatToken(), name: pid.toUpperCase(), ...(pid === 'a' ? { settings: {} } : {}) }));
    conns[pid] = c;
  }
  let n = 0;
  const send = (pid: string, m: Record<string, unknown>) => room.message(conns[pid]!, JSON.stringify({ ...m, actionId: `x${n++}` }));
  const act = (type: string) => { const e = room.engine!; send(e.s.hand!.toAct!, { t: 'act', handNo: e.s.handNo, action: { type } }); };
  const playOut = () => {
    const e = room.engine!;
    for (let i = 0; i < 12 && e.s.phase === 'hand'; i++) act(e.legal(e.s.hand!.toAct!)!.canCheck ? 'check' : 'call');
  };
  return {
    room, send, act, playOut,
    get now() { return now; },
    get left() { return room.nextDealAt! - now; },
    advance(ms: number) { now += ms; if (wake !== null && now >= wake) room.wake(); },
  };
}

describe('the pause after a hand', () => {
  it('everyone folded: the next hand comes 3 s later', () => {
    const t = setup();
    t.send('a', { t: 'host', cmd: 'deal' });
    t.act('fold');
    expect(t.room.engine!.s.phase).toBe('between');
    expect(t.left).toBe(3000);
    t.advance(2999); expect(t.room.engine!.s.handNo).toBe(1);
    t.advance(1); expect(t.room.engine!.s.handNo).toBe(2);
  });

  it('a showdown: 8 s (10.5 s for a straight flush or better); all-in before the flop adds the slow board', () => {
    const t = setup();
    const e = () => t.room.engine!;
    t.send('a', { t: 'host', cmd: 'deal' });
    t.playOut();
    const res = e().s.hand!.results!;
    expect(res.showdown).toBe(true);
    expect(t.left).toBe(bestCategory(res) >= 8 ? 10_500 : 8000);
    t.advance(t.left);
    expect(e().s.handNo).toBe(2);
    t.act('allin');
    t.act('call');
    expect(e().s.phase).toBe('between');
    expect(e().s.hand!.runout).toBe(true);
    // the call over the all-in is a drama scene (drama.ts): the next hand waits for it too
    expect(t.left).toBe(resultsPauseMs(e().s.hand!.results!) + RUNOUT_FIRST_MS + 3 * RUNOUT_STREET_MS + SCENE_MS.allinAnswered);
  });

  it('a fixed pause (tests, HAND_PAUSE_MS) is used after every hand', () => {
    const t = setup({ handPauseMs: 250 });
    t.send('a', { t: 'host', cmd: 'deal' });
    t.playOut();
    expect(t.left).toBe(250);
    t.advance(250);
    t.act('fold');
    expect(t.left).toBe(250);
  });

  it('the rules', () => {
    const pot = (name: string | null) => ({ label: 'the pot', amount: 100, awards: [{ pid: 'a', amount: 100 }], hand: name ? { score: 1, name, desc: name, best: [] } : null });
    expect(resultsPauseMs({ pots: [pot(null)], evals: {}, showdown: false })).toBe(FOLD_PAUSE_MS);
    expect(resultsPauseMs({ pots: [pot(null)], evals: {}, showdown: false }, 3)).toBe(FOLD_PAUSE_MS);
    expect(resultsPauseMs({ pots: [pot('Full House')], evals: {}, showdown: true })).toBe(8000);
    expect(resultsPauseMs({ pots: [pot('High Card')], evals: {}, showdown: true })).toBe(8000);
    expect(resultsPauseMs({ pots: [pot('One Pair'), pot('Royal Flush')], evals: {}, showdown: true })).toBe(10_500);
    expect(resultsPauseMs({ pots: [pot('Flush')], evals: {}, showdown: true }, 2)).toBe(8000 + RUNOUT_FIRST_MS + 2 * RUNOUT_STREET_MS);
    expect(bestCategory({ pots: [pot('Straight Flush')], evals: {}, showdown: true })).toBe(8);
    expect(runoutStreets([{ t: 'street', street: 'turn', cards: ['2h'] }, { t: 'street', street: 'river', cards: ['3h'] }, { t: 'street', street: 'river', cards: ['4h'], board: 2 }], true)).toBe(2);
    expect(runoutStreets([{ t: 'street', street: 'river', cards: ['3h'] }], false)).toBe(0);
  });
});
