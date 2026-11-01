import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseClient, parseServer, encode, versionOk, PROTOCOL_VERSION, MAX_CLIENT_BYTES, REACTIONS, type ClientMessage } from '../src/index';
import { Engine } from '@tp/engine';

const ok: ClientMessage[] = [
  { t: 'hello', v: PROTOCOL_VERSION, table: 'QK7P', player: 'u_123', lastSeq: 0 },
  { t: 'hello', v: PROTOCOL_VERSION, table: 'QK7P', player: 'u_123', lastSeq: 41, token: 'abcdefghijklmnop', name: 'Riya', spectate: true },
  { t: 'act', actionId: 'a1', handNo: 3, action: { type: 'raise', to: 240 } },
  { t: 'act', actionId: 'a2', handNo: 3, action: { type: 'fold' } },
  { t: 'sit', actionId: 'a3', out: false, postNow: true },
  { t: 'rebuy', actionId: 'a4' },
  { t: 'vote', actionId: 'a5', handNo: 3, yes: true },
  { t: 'straddle', actionId: 'a6', on: true },
  { t: 'show', actionId: 'a7', handNo: 3 },
  { t: 'seed', handNo: 4, seed: 'a'.repeat(64) },
  { t: 'react', reaction: '🔥' },
  { t: 'host', actionId: 'a8', cmd: 'setBlinds', sb: 10, bb: 20, ante: 2 },
  { t: 'host', actionId: 'a9', cmd: 'move', pid: 'u_2', dir: -1 },
  { t: 'ping', c: 123.5 },
];

describe('phone -> server messages', () => {
  it('accepts every well-formed message and round-trips it through JSON', () => {
    for (const m of ok) {
      const r = parseClient(encode(m));
      expect(r.ok, JSON.stringify(m)).toBe(true);
      if (r.ok) expect(r.msg).toEqual(m);
    }
  });
  it('refuses junk with a reason, never a crash', () => {
    const bad: unknown[] = [
      '{', 'null', '[]', '{"t":"nope"}', { t: 'act', actionId: 'a', handNo: 0, action: { type: 'fold' } },
      { t: 'act', actionId: 'a b', handNo: 1, action: { type: 'fold' } },
      { t: 'act', actionId: 'a', handNo: 1, action: { type: 'raise', to: -5 } },
      { t: 'act', actionId: 'a', handNo: 1, action: { type: 'steal' } },
      { t: 'hello', v: 1, table: 'q', player: 'x', lastSeq: 0 },
      { t: 'seed', handNo: 1, seed: 'XYZ' },
      { t: 'react', reaction: 'free text is not allowed' },
      { t: 'host', actionId: 'a', cmd: 'drop table' },
    ];
    for (const b of bad) {
      const r = parseClient(b);
      expect(r.ok, JSON.stringify(b)).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    }
  });
  it('drops oversized messages before parsing them', () => {
    const r = parseClient('x'.repeat(MAX_CLIENT_BYTES + 1));
    expect(r).toEqual({ ok: false, error: 'Message too large' });
  });
  it('never throws on random input', () => {
    fc.assert(fc.property(fc.oneof(fc.string(), fc.jsonValue()), (x) => { expect(() => parseClient(x)).not.toThrow(); }), { numRuns: 2000 });
  });
  it('reactions are a fixed list', () => {
    expect(REACTIONS.length).toBeGreaterThan(5);
    for (const r of REACTIONS) expect(parseClient({ t: 'react', reaction: r }).ok).toBe(true);
  });
});

describe('server -> phone messages', () => {
  it('carries real engine views and events', () => {
    const e = Engine.create('g', {}, 0);
    e.apply({ t: 'join', id: 'a', name: 'A', now: 0 });
    e.apply({ t: 'join', id: 'b', name: 'B', now: 0 });
    const r = e.apply({ t: 'start', seed: '1'.repeat(64), now: 1 });
    const update = { t: 'update' as const, seq: 1, events: r.events as unknown as Record<string, unknown>[], view: e.viewFor('a') as unknown as Record<string, unknown>, host: 'a' };
    const p = parseServer(JSON.stringify(update));
    expect(p.ok).toBe(true);
    for (const m of [
      { t: 'welcome', v: 1, seq: 0, you: null, host: null, view: {}, serverTime: 5 },
      { t: 'ack', actionId: 'a1', ok: false, error: 'Not your turn' },
      { t: 'react', from: 'a', reaction: 'gg' },
      { t: 'seedRequest', handNo: 2, dealerSeedCommit: 'b'.repeat(64) },
      { t: 'pong', c: 1, s: 2, seq: 0 },
      { t: 'error', code: 'version', message: 'Please update the app' },
    ]) expect(parseServer(m).ok, JSON.stringify(m)).toBe(true);
    expect(parseServer({ t: 'update', seq: 0, events: [], view: {} }).ok).toBe(false);
  });
});

describe('versions', () => {
  it('accepts the current version and the one before, nothing else', () => {
    expect(versionOk(PROTOCOL_VERSION)).toBe(true);
    expect(versionOk(PROTOCOL_VERSION + 1)).toBe(false);
    expect(versionOk(0)).toBe(false);
  });
});

describe('Phase 2 additions', () => {
  it('table settings: accepted within bounds, refused outside or unknown', () => {
    const hello = (settings: unknown) => parseClient({ t: 'hello', v: 1, table: 'AB12', player: 'p1', lastSeq: 0, token: 'x'.repeat(16), name: 'A', settings });
    expect(hello({ startStack: 2000, sb: 10, bb: 20, turnTime: 20, timeBank: 60 }).ok).toBe(true);
    expect(hello({ sb: 20, bb: 10 }).ok).toBe(false);
    expect(hello({ maxPlayers: 16 }).ok).toBe(false);
    expect(hello({ cheat: true }).ok).toBe(false);
  });
  it('a short seat token is refused', () => {
    expect(parseClient({ t: 'hello', v: 1, table: 'AB12', player: 'p1', lastSeq: 0, token: 'short' }).ok).toBe(false);
  });
  it('welcome may carry missed events; pong carries the server seq', () => {
    expect(parseServer({ t: 'welcome', v: 1, seq: 3, you: 'p1', host: 'p1', view: {}, serverTime: 1, missed: [{ t: 'collect' }] }).ok).toBe(true);
    expect(parseServer({ t: 'pong', c: 1, s: 2 }).ok).toBe(false);
  });
});

describe('message size limits', () => {
  it('a big server message (a long night’s table) is accepted; a phone message over 8 KB is not', () => {
    const view = { log: Array.from({ length: 300 }, (_, i) => ({ text: `line ${i} `.repeat(5) })) };
    const big = JSON.stringify({ t: 'welcome', v: 1, seq: 1, you: 'a', host: 'a', view, serverTime: 1 });
    expect(big.length).toBeGreaterThan(8 * 1024);
    expect(parseServer(big).ok).toBe(true);
    expect(parseServer('x'.repeat(300 * 1024)).ok).toBe(false);
    expect(parseClient(JSON.stringify({ t: 'ping', c: 1, pad: 'x'.repeat(9000) })).ok).toBe(false);
  });
});
