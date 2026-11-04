import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Engine, type HandRecord } from '@tp/engine';
import {
  ClockSync, EnvelopeMaker, EVENT_TYPES, RateLimiter, ResearchQueue, ResearchShipper, SampleStream, checkBatch, checkEnvelope, decodeSamples,
  databaseWriter, handEvents, ingest, runArchive, archiveDb, type ArchiveRow, type Envelope, type SendResult,
} from '../src';

const maker = (src: 'c' | 's' = 'c') => { let t = 1_800_000_000_000; let m = 0; return new EnvelopeMaker(src, { wall: () => (t += 10), mono: () => (m += 1.25) }, '0.5.0+test'); };

/** Fake timers the queue/shipper use: run by hand. */
function fakeTimers() {
  let now = 0; const timers: { at: number; fn: () => void; id: number }[] = []; let id = 0;
  return {
    now: () => now, setTimer: (fn: () => void, ms: number) => { timers.push({ at: now + ms, fn, id: ++id }); return id; },
    clearTimer: (h: unknown) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    async advance(ms: number) { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); await new Promise((r) => setTimeout(r, 0)); } },
    get pending() { return timers.length; },
  };
}

describe('envelopes', () => {
  it('number events 1, 2, 3 within a session, with both clocks and the app version', () => {
    const m = maker();
    const a = m.make('ui.tap', { k: 'x' }, { d: 'dev-1', g: 'g123' }, { tb: 'ABCD', h: 3, st: 'flop' });
    const b = m.make('ui.tap', { k: 'y' });
    expect([a.q, b.q]).toEqual([1, 2]);
    expect(a.s).toBe(b.s);
    expect(a.id).not.toBe(b.id);
    expect(a.tm).toBe(1.25);
    expect(a.app).toBe('0.5.0+test');
    expect(checkEnvelope(a)).toBeNull();
    expect(a.tb).toBe('ABCD');
    expect(b.tb).toBeUndefined();
  });

  it('refuse what does not have the shape: ids, clocks, sequence, types, sources', () => {
    const good = maker().make('ui.tap', {});
    const bad = (patch: Record<string, unknown>) => checkEnvelope({ ...good, ...patch });
    expect(bad({ id: 'x' })).toBe('id');
    expect(bad({ sv: 2 })).toBe('sv');
    expect(bad({ t: 'Bad Type' })).toBe('t');
    expect(bad({ tc: 5 })).toBe('tc');
    expect(bad({ tm: -1 })).toBe('tm');
    expect(bad({ q: 0 })).toBe('q');
    expect(bad({ a: 'not-uuid' })).toBe('a');
    expect(bad({ tb: 'lower' })).toBe('tb');
    expect(bad({ st: 'sideways' })).toBe('st');
    expect(bad({ d: 'has space' })).toBe('d');
    expect(checkEnvelope({ ...good, src: 's' }, 'c')).toBe('src'); // a phone cannot send server events
    expect(checkEnvelope({ ...good, src: 'w' }, 'c')).toBeNull(); // its service worker can
    expect(checkEnvelope(null)).toBe('not an object');
  });

  it('batches: sizes, JSON, and bad events dropped one by one', () => {
    const m = maker();
    const ok = m.make('ui.tap', {});
    const r = checkBatch(JSON.stringify({ events: [ok, { ...ok, id: 'nope' }] }), 'c');
    expect('ok' in r && r.ok.length).toBe(1);
    expect('rejected' in r && r.rejected[0]!.why).toBe('id');
    expect(checkBatch('{', 'c')).toEqual({ error: 'not JSON' });
    expect(checkBatch('{}', 'c')).toEqual({ error: 'no events' });
    expect(checkBatch('x'.repeat(600_000), 'c')).toEqual({ error: 'too large' });
    expect(checkBatch(JSON.stringify({ events: new Array(1001).fill(ok) }), 'c')).toEqual({ error: 'too many events' });
    const big = { ...ok, p: 'x'.repeat(70_000) };
    expect(checkBatch(JSON.stringify({ events: [big] }), 'c')).toMatchObject({ rejected: [{ why: 'too large' }] });
  });

  it('every event type is in the data dictionary', async () => {
    const { readFileSync } = await import('node:fs');
    const doc = readFileSync(new URL('../../../docs/research-data.md', import.meta.url), 'utf8');
    for (const t of Object.keys(EVENT_TYPES)) expect(doc, t).toContain(`\`${t}\``);
  });
});

describe('the app queue', () => {
  function setup(send: (body: string, beacon: boolean) => Promise<SendResult>, o = {}) {
    const t = fakeTimers();
    let saved: Envelope[] = [];
    const store = { load: () => saved, save: (e: Envelope[]) => { saved = e.slice(); } };
    const clock: [number, number, number][] = [];
    const q = new ResearchQueue({ send, store, now: t.now, setTimer: t.setTimer, clearTimer: t.clearTimer, onClock: (t0, st, t3) => clock.push([t0, st, t3]) }, { flushEveryMs: 1000, ...o });
    return { q, t, store, get saved() { return saved; }, set saved(v) { saved = v; }, clock };
  }

  it('flushes batches every few seconds, in order, and takes a clock sample from each answer', async () => {
    const bodies: string[] = [];
    const s = setup(async (b) => { bodies.push(b); return { ok: true, serverTime: 5000 }; }, { batchEvents: 2 });
    const m = maker();
    s.q.start();
    for (let i = 0; i < 5; i++) s.q.push(m.make('ui.tap', { i }));
    expect(bodies).toHaveLength(0); // nothing sent while the player taps
    await s.t.advance(1000); await s.t.advance(1000); await s.t.advance(1000);
    expect(bodies.map((b) => (JSON.parse(b) as { events: Envelope[] }).events.map((e) => e.q))).toEqual([[1, 2], [3, 4], [5]]);
    expect(s.q.length).toBe(0);
    expect(s.clock).toHaveLength(3);
    expect(s.q.stats.sent).toBe(5);
  });

  it('keeps a failed batch and retries with backoff; a refused batch is dropped', async () => {
    let mode: 'fail' | 'ok' | 'refuse' = 'fail';
    let calls = 0;
    const s = setup(async () => { calls++; return mode === 'ok' ? { ok: true } : mode === 'refuse' ? { ok: false, retry: false } : { ok: false, retry: true }; });
    const m = maker();
    s.q.start();
    s.q.push(m.make('ui.tap', {}));
    await s.t.advance(1000);
    expect(calls).toBe(1);
    expect(s.q.length).toBe(1);
    expect(s.saved).toHaveLength(1); // kept across a reload while it waits
    await s.t.advance(1000);
    expect(calls).toBe(1); // first backoff: 2 s
    await s.t.advance(1000);
    expect(calls).toBe(2);
    await s.t.advance(4000);
    expect(calls).toBe(3); // second: 4 s
    mode = 'ok';
    await s.t.advance(8000);
    expect(s.q.length).toBe(0);
    mode = 'refuse';
    s.q.push(m.make('ui.tap', {}));
    await s.t.advance(1000);
    expect(s.q.length).toBe(0);
    expect(s.q.stats.refused).toBe(1);
  });

  it('a send that throws counts as a failure, never reaches the app', async () => {
    const s = setup(async () => { throw new Error('offline'); });
    s.q.start();
    s.q.push(maker().make('ui.tap', {}));
    await s.t.advance(1000);
    expect(s.q.length).toBe(1);
    expect(s.q.stats.failures).toBe(1);
  });

  it('caps: the oldest events go first, and are counted', () => {
    const s = setup(async () => ({ ok: true }), { maxEvents: 3 });
    const m = maker();
    for (let i = 0; i < 5; i++) s.q.push(m.make('ui.tap', { i }));
    expect(s.q.length).toBe(3);
    expect(s.q.stats.dropped).toBe(2);
    const s2 = setup(async () => ({ ok: true }), { maxBytes: 600 });
    for (let i = 0; i < 5; i++) s2.q.push(m.make('ui.tap', { i }));
    expect(s2.q.size).toBeLessThanOrEqual(600);
    expect(s2.q.stats.dropped).toBeGreaterThan(0);
  });

  it('hide() saves everything and beacons the head; a reload puts saved events back in front', async () => {
    const sent: { body: string; beacon: boolean }[] = [];
    const s = setup(async (body, beacon) => { sent.push({ body, beacon }); return { ok: true }; });
    const m = maker();
    s.q.push(m.make('ui.tap', { i: 1 }));
    s.q.push(m.make('ui.tap', { i: 2 }));
    s.q.hide();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.beacon).toBe(true);
    expect(s.saved).toHaveLength(2);
    // the next page load
    const s2 = setup(async () => ({ ok: true }));
    s2.saved = s.saved;
    s2.q.push(maker().make('ui.tap', { i: 3 }));
    s2.q.start();
    expect(s2.q.length).toBe(3);
    expect(s2.q.stats.restored).toBe(2);
    s2.q.start(); // twice does nothing
    expect(s2.q.length).toBe(3);
  });

  it('an unreadable store starts empty', () => {
    const t = fakeTimers();
    const q = new ResearchQueue({ send: async () => ({ ok: true }), store: { load: () => { throw new Error('x'); }, save: () => {} }, now: t.now, setTimer: t.setTimer, clearTimer: t.clearTimer });
    q.start();
    expect(q.length).toBe(0);
  });

  it('pushing costs little (overhead measured)', () => {
    const s = setup(async () => ({ ok: true }));
    const m = maker();
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) s.q.push(m.make('ui.tap', { k: 'act-fold', x: 100, y: 200, i }));
    const per = (performance.now() - t0) / 2000;
    expect(per).toBeLessThan(0.2); // ms per event, typically ~0.01
  });
});

describe('clock sync', () => {
  it('estimates the offset from the shortest round trip, and hands out raw samples once', () => {
    const c = new ClockSync(4);
    expect(c.estimate()).toBeNull();
    c.add({ k: 'http', t0: 100, st: 10_150, t3: 300 }); // rtt 200
    c.add({ k: 'ws', t0: 400, st: 10_420, t3: 440 }); // rtt 40: best
    c.add({ k: 'ws', t0: 500, st: 1, t3: 400 }); // t3 < t0: ignored
    expect(c.estimate()).toEqual({ offset: 10_000, rtt: 40, n: 2 });
    expect(c.take()).toEqual([['http', 100, 10150, 300], ['ws', 400, 10420, 440]]);
    expect(c.take()).toEqual([]);
    for (let i = 0; i < 6; i++) c.add({ k: 'ping', t0: i, st: 1000 + i, t3: i + 10 });
    expect(c.estimate()!.n).toBe(4);
  });
});

describe('sample batches', () => {
  it('delta-code samples at a capped rate and decode back exactly (to the unit)', () => {
    const s = new SampleStream({ x: 1, y: 1, a: 100 }, 33);
    expect(s.add(1000, { x: 10, y: 20, a: 0.5 })).toBe(true);
    expect(s.add(1010, { x: 11, y: 20, a: 0.5 })).toBe(false); // too soon (30 Hz)
    s.add(1033, { x: 15, y: 18, a: 0.51 });
    s.add(1070, { x: 15, y: null, a: 0.49 });
    s.add(1105, { x: 12, y: 19, a: 0.5 });
    const b = s.take()!;
    expect(b.dt).toEqual([33, 37, 35]);
    expect(b.c.x).toEqual([10, 5, 0, -3]);
    const d = decodeSamples(b);
    expect(d.t).toEqual([1000, 1033, 1070, 1105]);
    expect(d.cols.x).toEqual([10, 15, 15, 12]);
    expect(d.cols.y).toEqual([20, 18, null, 19]);
    expect(d.cols.a).toEqual([0.5, 0.51, 0.49, 0.5]);
    expect(s.take()).toBeNull();
    const f = new SampleStream({ v: 1 }, 0, 2);
    f.add(1, { v: 1 }); f.add(2, { v: 2 });
    expect(f.full).toBe(true);
    expect(f.add(3, { v: 3 })).toBe(false);
    expect(f.count).toBe(2);
  });
});

describe('ingestion', () => {
  const batch = (n: number, patch: Record<string, unknown> = {}) => { const m = maker(); return JSON.stringify({ events: Array.from({ length: n }, () => ({ ...m.make('ui.tap', {}, { d: 'dev-1' }), ...patch })) }); };

  it('checks, stamps the server clock, forwards and answers with the server time', async () => {
    let got: Envelope[] = [];
    const r = await ingest(batch(3), { now: () => 1_900_000_000_000, limiter: new RateLimiter(), forward: async (e) => { got = e; return true; } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, st: 1_900_000_000_000, accepted: 3, rejected: 0 });
    expect(got.every((e) => e.ts === 1_900_000_000_000)).toBe(true);
  });

  it('refuses malformed batches, server events from phones, too much from one device; 503 when the store is down', async () => {
    const lim = new RateLimiter({ batches: 2, bytes: 1e9 }, () => 0);
    const deps = { now: () => 1, limiter: lim, forward: async () => true };
    expect((await ingest('nope', deps)).status).toBe(400);
    expect((await ingest('x'.repeat(600_000), deps)).status).toBe(413);
    const r = await ingest(batch(2, { src: 's' }), deps);
    expect(r.body).toMatchObject({ accepted: 0, rejected: 2 });
    await ingest(batch(1), deps);
    await ingest(batch(1), deps);
    expect((await ingest(batch(1), deps)).status).toBe(429);
    expect((await ingest(batch(1), { now: () => 1, limiter: new RateLimiter(), forward: async () => false })).status).toBe(503);
    expect((await ingest(batch(1), { now: () => 1, limiter: new RateLimiter(), forward: async () => { throw new Error('down'); } })).status).toBe(503);
  });

  it('rate limits refill over time, per device', () => {
    let t = 0;
    const lim = new RateLimiter({ batches: 1, bytes: 100 }, () => t, 2);
    expect(lim.take('a', 50)).toBe(true);
    expect(lim.take('a', 10)).toBe(false);
    expect(lim.take('b', 10)).toBe(true);
    expect(lim.take('c', 10)).toBe(true); // (evicts the oldest key)
    t = 60_000;
    expect(lim.take('a', 100)).toBe(true);
    expect(lim.take('a', 1000)).toBe(false);
  });

  it('writes to the database through the signed function', async () => {
    const calls: { url: string; body: string }[] = [];
    const w = databaseWriter('https://db', 'anon', async (b) => `sig:${b.length}`, async (url, init) => { calls.push({ url, body: init.body }); return { ok: true, status: 200, text: async () => '{}' }; });
    expect(await w([maker().make('ui.tap', {})])).toBe(true);
    expect(calls[0]!.url).toBe('https://db/rest/v1/rpc/research_ingest');
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ p_sig: expect.stringMatching(/^sig:/) });
    const bad = databaseWriter('https://db', 'anon', async () => 's', async () => ({ ok: false, status: 500, text: async () => 'boom' }));
    await expect(bad([])).rejects.toThrow(/500/);
  });
});

describe('the server shipper', () => {
  it('batches, retries with backoff, keeps failures in its store, and catches up after a restart', async () => {
    const t = fakeTimers();
    const store = new Map<string, Envelope[]>();
    const st = { load: async () => [...store].map(([key, events]) => ({ key, events })), put: async (k: string, e: Envelope[]) => { store.set(k, e); }, remove: async (k: string) => { store.delete(k); } };
    let up = false; const written: Envelope[][] = [];
    const sh = new ResearchShipper({ write: async (e) => { if (!up) throw new Error('down'); written.push(e); return true; }, store: st, setTimer: t.setTimer, clearTimer: t.clearTimer, now: t.now }, { delayMs: 1000, batchEvents: 3 });
    const m = maker('s');
    for (let i = 0; i < 4; i++) sh.emit(m.make('hand.action', { i }));
    await t.advance(0);
    expect(store.size).toBe(1); // the first batch failed and was kept
    expect(sh.waiting).toBe(4);
    // a restart: a new shipper finds the stored batch
    up = true;
    const sh2 = new ResearchShipper({ write: async (e) => { written.push(e); return true; }, store: st, setTimer: t.setTimer, clearTimer: t.clearTimer, now: t.now });
    await sh2.start();
    await t.advance(0);
    expect(written.flat().length).toBe(3);
    expect(store.size).toBe(0);
    // the first shipper's own retry (after backoff) sends everything
    await t.advance(5000);
    expect(written.flat().length).toBe(3 + 4);
    expect(sh.stats.sent).toBe(4);
  });

  it('drops the oldest when far too much waits', async () => {
    const t = fakeTimers();
    const sh = new ResearchShipper({ write: async () => false, setTimer: t.setTimer, clearTimer: t.clearTimer, now: t.now }, { maxWaiting: 2 });
    const m = maker('s');
    for (let i = 0; i < 4; i++) sh.emit(m.make('hand.action', { i }));
    expect(sh.stats.dropped).toBe(2);
  });
});

describe('a finished hand as research events', () => {
  function playHand(): HandRecord {
    const e = Engine.create('G', { startStack: 1000, sb: 5, bb: 10, turnTime: 20, timeBank: 30, dealItTwice: true }, 1000);
    for (const id of ['a', 'b', 'c']) e.apply({ t: 'join', id, name: id, now: 1000 });
    e.apply({ t: 'start', seed: 'cd'.repeat(32), now: 2000 });
    let now = 2000;
    // everyone all-in preflop: the deal-it-twice vote, then the board runs out
    for (let i = 0; i < 10 && e.s.hand && !e.s.hand.results; i++) {
      now += 1500;
      const h = e.s.hand;
      if (h.vote) { for (const pid of h.vote.pids) e.apply({ t: 'vote', pid, yes: true, now }); continue; }
      const pid = h.toAct!;
      e.apply({ t: 'act', pid, action: pid === 'c' ? { type: 'fold' } : { type: 'allin' }, now });
    }
    e.apply({ t: 'show', pid: 'c', now: now + 100 });
    return e.lastHandRecord!;
  }

  it('has every hole card, the deck, decisions, actions with sizes, streets, the vote and the end', () => {
    const rec = playHand();
    const evs = handEvents(rec);
    const types = evs.map((e) => e.t);
    expect(types[0]).toBe('hand.start');
    expect(types[types.length - 1]).toBe('hand.end');
    for (const t of ['hand.decision', 'hand.action', 'hand.street', 'hand.vote']) expect(types).toContain(t);
    const start = evs[0]!.p as { holes: Record<string, string[]>; deck: string[] };
    expect(Object.keys(start.holes).sort()).toEqual(['a', 'b', 'c']);
    // the deck order explains the hole cards (dealt from the top)
    expect(start.deck).toHaveLength(52);
    const end = evs[evs.length - 1]!.p as { holes: Record<string, string[]>; twice: boolean; inputs: unknown[]; net: Record<string, number> };
    expect(end.holes).toEqual(start.holes);
    expect(end.inputs.length).toBe(rec.inputs.length);
    expect(Object.values(end.net).reduce((a, b) => a + b, 0)).toBe(0);
    const actions = evs.filter((e) => e.t === 'hand.action').map((e) => e.p as { a: string; decisionMs: number; sizeStack: number | null });
    expect(actions.every((a) => a.decisionMs === 1500)).toBe(true);
    expect(actions.some((a) => a.a === 'allin' && a.sizeStack === 1)).toBe(true);
  });

  it('a hand that cannot be replayed throws (the tap catches it)', () => {
    const rec = playHand();
    expect(() => handEvents({ ...rec, inputs: [{ t: 'act', pid: 'zz', action: { type: 'call' }, now: 1 }] })).toThrow(/does not replay/);
  });
});

describe('the archive job', () => {
  const sha = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
  function world(n: number) {
    const rows: (ArchiveRow & { day: string; received: number })[] = [];
    for (let i = 0; i < n; i++) rows.push({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, type: i % 3 ? 'ui.tap' : 'hand.action', day: '2026-10-01', received: 1, p: { i } });
    const files = new Map<string, Uint8Array>();
    const commits: unknown[] = [];
    const db = {
      upkeep: async () => ({}),
      days: async () => (rows.length ? [{ day: '2026-10-01', rows: rows.length }] : []),
      page: async (_d: string, _c: string, limit: number) => rows.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, limit).map(({ day: _x, received: _r, ...r }) => r),
      commit: async (c: { first: string; last: string; rows: number; ids_sha256: string }) => {
        commits.push(c);
        const sl = rows.filter((r) => r.id >= c.first && r.id <= c.last);
        const h = await sha(new TextEncoder().encode(sl.map((r) => r.id).sort().join(',')));
        if (sl.length !== c.rows || h !== c.ids_sha256) return { ok: false };
        for (const r of sl) rows.splice(rows.indexOf(r), 1);
        return { ok: true, deleted: sl.length };
      },
      subjects: async () => [{ key: 'a:x', rid: 'r' }],
    };
    let corrupt = false;
    const bucket = {
      put: async (k: string, d: Uint8Array) => { files.set(k, corrupt ? d.slice(1) : d); },
      get: async (k: string) => files.get(k) ?? null,
    };
    const deps = { db, bucket, gzip: async (d: Uint8Array) => new Uint8Array(gzipSync(d)), gunzip: async (d: Uint8Array) => new Uint8Array(gunzipSync(d)), sha256: sha, now: () => Date.parse('2026-10-20T00:00:00Z'), log: () => {} };
    return { rows, files, commits, deps, setCorrupt: (v: boolean) => { corrupt = v; } };
  }

  it('archives by day and type, verifies, then deletes; the manifest has counts and checksums', async () => {
    const w = world(25);
    const r = await runArchive(w.deps, { pageRows: 10 });
    expect(r.errors).toEqual([]);
    expect(r.rows).toBe(25);
    expect(r.slices).toBe(3);
    expect(w.rows).toHaveLength(0);
    const keys = [...w.files.keys()];
    expect(keys.some((k) => /^research\/v1\/day=2026-10-01\/type=ui\.tap\/part-.*\.ndjson\.gz$/.test(k))).toBe(true);
    expect(keys.some((k) => k.includes('type=hand.action'))).toBe(true);
    expect(keys.some((k) => k.startsWith('research/v1/subjects/'))).toBe(true);
    const manifests = keys.filter((k) => k.includes('manifest-'));
    expect(manifests).toHaveLength(3);
    const m = JSON.parse(new TextDecoder().decode(w.files.get(manifests[0]!)!)) as { rows: number; files: { key: string; rows: number; sha256: string }[] };
    expect(m.files.reduce((s, f) => s + f.rows, 0)).toBe(m.rows);
    for (const f of m.files) expect(await sha(w.files.get(f.key)!)).toBe(f.sha256);
    // every row is in exactly one file
    let lines = 0;
    for (const k of keys.filter((x) => x.endsWith('.ndjson.gz'))) lines += gunzipSync(w.files.get(k)!).toString().trim().split('\n').length;
    expect(lines).toBe(25);
  });

  it('never deletes when the upload does not read back right', async () => {
    const w = world(5);
    w.setCorrupt(true);
    const r = await runArchive(w.deps);
    expect(r.errors[0]).toMatch(/read back/);
    expect(w.rows).toHaveLength(5);
    expect(w.commits).toHaveLength(0);
  });

  it('stops when the database refuses the delete (rows changed): nothing lost', async () => {
    const w = world(5);
    w.deps.db.commit = async () => ({ ok: false });
    const r = await runArchive(w.deps);
    expect(r.refused).toBe(1);
    expect(w.rows).toHaveLength(5);
  });

  it('is idempotent: a second run with nothing new does nothing, a crash before the delete redoes the same files', async () => {
    const w = world(4);
    const realCommit = w.deps.db.commit;
    w.deps.db.commit = async () => { throw new Error('crash'); };
    await runArchive(w.deps);
    const first = new Map(w.files);
    w.deps.db.commit = realCommit;
    const r = await runArchive(w.deps);
    expect(r.rows).toBe(4);
    for (const [k, v] of first) if (!k.includes('subjects')) expect(Buffer.from(w.files.get(k)!).equals(Buffer.from(v))).toBe(true);
    const again = await runArchive(w.deps);
    expect(again.rows).toBe(0);
  });

  it('respects the per-run budget', async () => {
    const w = world(30);
    const r = await runArchive(w.deps, { pageRows: 10, maxRows: 20 });
    expect(r.rows).toBe(20);
    expect(w.rows).toHaveLength(10);
  });

  it('talks to the signed database functions', async () => {
    const calls: [string, unknown][] = [];
    const db = archiveDb(async (fn, body) => { calls.push([fn, body]); return fn === 'research_archive_commit' ? { ok: true } : []; });
    await db.upkeep(); await db.days(14); await db.page('2026-10-01', 'c', 5); await db.commit({ day: 'd', cutoff: 'c', first: 'f', last: 'l', rows: 1, ids_sha256: 'h', key: 'k' }); await db.subjects!();
    expect(calls.map((c) => c[0])).toEqual(['research_upkeep', 'research_archive_days', 'research_archive_page', 'research_archive_commit', 'research_subjects']);
  });
});
