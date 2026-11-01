import { describe, expect, it } from 'vitest';
import { Engine, cardStr, randomSeed, type HandRecord } from '@tp/engine';
import { decide, rng, STRATEGIES } from '@tp/bots';
import { publicReplay, slimRecord, handPlayers, Recorder, type OutboxItem, type Send } from '../src/record';

/** Bots play n hands at 6 seats; every finished hand's record is returned. */
function play(n: number, seed: number): HandRecord[] {
  const r = rng(seed);
  const e = Engine.create('g', { startStack: 1000, turnTime: 0, dealItTwice: true }, 0);
  for (let i = 0; i < 6; i++) e.apply({ t: 'join', id: `p${i}`, name: `P${i}`, now: 0 });
  const out: HandRecord[] = [];
  let now = 1;
  while (out.length < n) {
    for (const p of e.s.players) if (p.stack === 0) e.apply({ t: 'rebuy', pid: p.id, now });
    e.apply({ t: 'start', seed: randomSeed(), now: now++ });
    let guard = 0;
    while (e.s.phase === 'hand' && guard++ < 300) {
      const h = e.s.hand!;
      if (h.vote) { for (const pid of h.vote.pids) if (e.s.hand?.vote) e.apply({ t: 'vote', pid, yes: r() < 0.5, now }); continue; }
      const pid = h.toAct!;
      const a = decide(e.viewFor(pid), STRATEGIES[Number(pid.slice(1)) % 4]!, r)!;
      e.apply({ t: 'act', pid, action: a, now: now++ });
    }
    if (r() < 0.2) e.apply({ t: 'show', pid: e.s.hand!.order[0]!, now }); // sometimes someone shows after
    out.push(e.lastHandRecord!);
  }
  return out;
}

describe('league records', () => {
  const hands = play(500, 7);

  it('a public replay never contains a hidden hole card or the shuffle seed (500 hands)', () => {
    let checked = 0;
    for (const rec of hands) {
      const json = JSON.stringify(publicReplay(rec));
      expect(json).not.toContain(rec.proof.dealerSeed);
      const end = Engine.replay(rec.before, rec.inputs).s.hand!;
      for (const pid of end.order) {
        const visible = end.revealed[pid] || end.shown[pid];
        const cards = end.ps[pid]!.cards.map(cardStr);
        if (visible) continue;
        // the two cards together must never appear (single cards can be on the board)
        expect(json).not.toContain(JSON.stringify(cards));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(300); // how many depends on the random shuffles; usually about 500-600
  });

  it('cards that were shown are in the replay; each player gets only their own cards in the rows', () => {
    let shown = 0;
    for (const rec of hands) {
      const end = Engine.replay(rec.before, rec.inputs).s.hand!;
      const rp = publicReplay(rec);
      const last = rp.frames.at(-1)!;
      rp.keys.forEach((k, n) => {
        if (end.revealed[k] || end.shown[k]) { expect(last.cards?.[n]).toEqual(end.ps[k]!.cards.map(cardStr)); shown++; }
        else expect(last.cards?.[n]).toBeUndefined();
      });
      const { rows } = handPlayers(rec, (pid) => (pid === 'p0' ? 'acc-0' : null));
      for (const row of rows) expect(row.cards === undefined).toBe(row.key !== 'p0');
    }
    expect(shown).toBeGreaterThan(50);
  });

  it('the slim record (no previous hand, no log) replays to exactly the same hand, and is smaller', () => {
    let full = 0, slim = 0, pub = 0;
    for (const rec of hands) {
      const s = slimRecord(rec);
      expect(s.before.hand).toBeNull();
      expect(Engine.replay(s.before, s.inputs).s.hand!.results).toEqual(rec.results);
      full += JSON.stringify(rec).length; slim += JSON.stringify(s).length; pub += JSON.stringify(publicReplay(rec)).length;
    }
    console.log(`per hand: full record ${Math.round(full / hands.length)} B, slim ${Math.round(slim / hands.length)} B, public replay ${Math.round(pub / hands.length)} B`);
    expect(slim).toBeLessThan(full * 0.7);
    expect(pub / hands.length).toBeLessThan(3000);
  });
});

describe('recorder', () => {
  const memory = () => { const m = new Map<string, OutboxItem>(); return { m, store: { load: async () => [...m.values()].sort((a, b) => a.id.localeCompare(b.id)), put: async (it: OutboxItem) => void m.set(it.id, { ...it }), remove: async (id: string) => void m.delete(id) } }; };

  it('after a restart the outbox is sent in the order it was made (not alphabetically), and the end goes last', async () => {
    const { m, store } = memory();
    let t = 1000;
    const down: Send = async () => { throw new Error('offline'); };
    const r1 = new Recorder(store, async () => 'tok', down, () => t);
    for (const n of [1, 2, 9, 10, 11]) await r1.add('record_hand', `g1:${n}`, { n });
    await r1.add('record_game_end', 'g1:end', { end: true });
    expect(m.size).toBe(6);
    // the server restarts; the store lists items alphabetically (g1:1, g1:10, g1:11, g1:2, g1:9, g1:end)
    const sent: string[] = [];
    const up: Send = async (_fn, body) => { sent.push(body); return 'ok'; };
    const r2 = new Recorder(store, async () => 'tok', up, () => (t += 1_000_000));
    await r2.start();
    await r2.flush();
    expect(sent.map((b) => JSON.parse(b).n ?? 'end')).toEqual([1, 2, 9, 10, 11, 'end']);
    expect(r2.pending).toBe(0);
  });

  it('a game end waits while any of its hands is still unsent', async () => {
    const { store } = memory();
    let fail = true, t = 0;
    const sent: string[] = [];
    const send: Send = async (fn, body) => { if (fn === 'record_hand' && fail) throw new Error('down'); sent.push(fn); return 'ok'; };
    const r = new Recorder(store, async () => 'tok', send, () => t);
    await r.add('record_hand', 'g2:1', {});
    await r.add('record_game_end', 'g2:end', {});
    expect(sent).toEqual([]); // the hand failed, so the end did not go first
    fail = false; t += 60_000;
    await r.flush();
    expect(sent).toEqual(['record_hand', 'record_game_end']);
  });

  it('a record the database refuses is set aside, not retried for ever; flush waits for a running send', async () => {
    const { store } = memory();
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    const send: Send = async (_fn, body) => { if (body.includes('slow')) await gate; return body.includes('bad') ? 'refused' : 'ok'; };
    const r = new Recorder(store, async () => 'tok', send);
    const first = r.add('record_hand', 'g3:1', { slow: true });
    const second = r.flush(); // while the first send is still waiting
    let done = false;
    void second.then(() => { done = true; });
    await new Promise((x) => setTimeout(x, 10));
    expect(done).toBe(false);
    release();
    await first; await second;
    expect(r.pending).toBe(0);
    await r.add('record_hand', 'g3:2', { bad: true });
    expect(r.refused.map((x) => x.id)).toEqual(['g3:2']);
    expect(r.pending).toBe(0);
  });
});
