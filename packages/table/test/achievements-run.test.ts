import { describe, it, expect } from 'vitest';
import { achievementsAfterNight, achievementsDue, crewOfEnd } from '../src/achievements-run';

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
    expect(calls[1]![1]).toEqual({ ref: 'night:game-0001', crew: 'c1', earned: [], counts: [] });
    expect(calls.every((c) => c[2].startsWith('sig('))).toBe(true);
    expect(logs[0]).toContain('Crew');
  });

  it('a crew the database does not know records nothing', async () => {
    const calls: string[] = [];
    const res = await achievementsAfterNight('c1', 'g', { sign: async () => 's', rpc: async (fn) => { calls.push(fn); return { v: 1, crew: null, members: [], seasons: [], games: [], hands: [] }; } });
    expect(res).toBe('no crew');
    expect(calls).toEqual(['achievements_feed']);
  });

  it('crews with a game the checker has not seen are run, each under a call of its own', async () => {
    const recorded: { ref: string; crew: string }[] = [];
    const rpc = async (fn: string, body: string): Promise<unknown> => {
      if (fn === 'achievements_due') return ['c1', 'c2'];
      if (fn === 'achievements_feed') { const c = (JSON.parse(body) as { crew: string }).crew; if (c === 'c2') throw new Error('down'); return { v: 1, crew: { id: c, name: c }, members: [], seasons: [], games: [], hands: [] }; }
      recorded.push(JSON.parse(body) as { ref: string; crew: string });
      return 'ok';
    };
    const logs: string[] = [];
    expect(await achievementsDue({ sign: async () => 's', rpc, log: (m) => logs.push(m) }, () => 1234)).toBe(1);
    expect(recorded).toMatchObject([{ ref: 'due:c1:1234', crew: 'c1' }]);
    expect(logs.some((l) => l.includes('c2') && l.includes('down'))).toBe(true); // one crew failing does not stop the rest
  });
});
