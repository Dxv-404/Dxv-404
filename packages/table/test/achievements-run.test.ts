import { describe, it, expect } from 'vitest';
import { achievementsAfterNight, crewOfEnd } from '../src/achievements-run';

const end = (g: object) => JSON.stringify({ game: g, endedAt: '2026-11-11T00:00:00Z', players: [] });

describe('achievements after a night', () => {
  it('only a crew game that counts starts the run', () => {
    expect(crewOfEnd(end({ id: 'g1', crew: 'c1', casual: false }))).toEqual({ crew: 'c1', game: 'g1' });
    expect(crewOfEnd(end({ id: 'g1', crew: null }))).toBeNull();
    expect(crewOfEnd(end({ id: 'g1', crew: 'c1', casual: true }))).toBeNull();
    expect(crewOfEnd('not json')).toBeNull();
  });

  it('asks for the crew, runs the checker and records the result once per night, signed', async () => {
    const calls: [string, unknown, string][] = [];
    const rpc = async (fn: string, body: string, sig: string): Promise<unknown> => {
      calls.push([fn, JSON.parse(body), sig]);
      if (fn === 'achievements_feed') return { v: 1, crew: { id: 'c1', name: 'Crew' }, members: [], seasons: [], games: [], hands: [] };
      return 'ok';
    };
    const logs: string[] = [];
    const res = await achievementsAfterNight('c1', 'game-0001', { sign: async (b) => `sig(${b.length})`, rpc, log: (m) => logs.push(m) });
    expect(res).toBe('ok');
    expect(calls.map((c) => c[0])).toEqual(['achievements_feed', 'record_achievements']);
    expect(calls[0]![1]).toEqual({ crew: 'c1', game: 'game-0001' });
    expect(calls[1]![1]).toEqual({ ref: 'night:game-0001', earned: [], counts: [] });
    expect(calls.every((c) => c[2].startsWith('sig('))).toBe(true);
    expect(logs[0]).toContain('Crew');
  });

  it('a crew the database does not know records nothing', async () => {
    const calls: string[] = [];
    const res = await achievementsAfterNight('c1', 'g', { sign: async () => 's', rpc: async (fn) => { calls.push(fn); return { v: 1, crew: null, members: [], seasons: [], games: [], hands: [] }; } });
    expect(res).toBe('no crew');
    expect(calls).toEqual(['achievements_feed']);
  });
});
