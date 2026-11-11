// After a crew's night: the crew's whole history goes through the achievement checker again (the same run
// as the first fill, @tp/achievements crew.ts) and what everyone has earned is recorded. The database keeps
// the first time each was earned and ignores repeats, so running it after every night is safe. Never in the
// way of the game: it runs once the night's result is stored, and a failure only waits for the next night.
import { recordBody, runHistory, type CrewExport } from '@tp/achievements';
import type { Signer } from './record';
import type { Rpc } from './push';

export interface AchievementsDeps { sign: Signer; rpc: Rpc; log?: (m: string) => void }

/** The crew of a "record_game_end" body, if it was a crew game. */
export function crewOfEnd(body: string): { crew: string; game: string } | null {
  try {
    const g = (JSON.parse(body) as { game?: { id?: string; crew?: string | null; casual?: boolean } }).game;
    return g?.id && g.crew && !g.casual ? { crew: g.crew, game: g.id } : null;
  } catch { return null; }
}

export async function achievementsAfterNight(crew: string, game: string, d: AchievementsDeps): Promise<string> {
  const ask = JSON.stringify({ crew, game });
  const x = (await d.rpc('achievements_feed', ask, await d.sign(ask))) as CrewExport | null;
  if (!x?.crew) return 'no crew';
  const report = runHistory(x);
  const out = JSON.stringify(recordBody(report, `night:${game}`, true));
  const res = String(await d.rpc('record_achievements', out, await d.sign(out)));
  d.log?.(`achievements: ${x.crew.name} after ${game.slice(0, 8)}: ${report.hands} hands, ${report.players.reduce((n, p) => n + p.earned.length, 0)} held in all, ${res}`);
  return res;
}
