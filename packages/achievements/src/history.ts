// The achievements that come from a crew's history: seasons, weeks in a row, who keeps finishing above
// whom. The caller hands over plain lists (from the database); days and weeks are India time.
import { istWeek } from './cards';
import type { Earned, Pid } from './facts';

export interface HistoryNight {
  game: string;
  endedAt: number;
  /** Who opened the table (crew_tables.opened_by for the table's code), when known. */
  host: Pid | null;
  players: { pid: Pid; place: number }[];
}
export interface HistorySeason { id: string; name: string; closed: boolean; closedAt: number; ranks: { pid: Pid; rank: number | null }[] }
export interface HistoryMember { pid: Pid; joined: number; left?: number | null }
export interface HistoryFacts {
  /** The crew's finished games, in any order. */
  nights: HistoryNight[];
  seasons: HistorySeason[];
  /** The crew's members with the dates they joined (and left), for Full House Party. */
  members: HistoryMember[];
  names?: Record<Pid, string>;
}

export const WEEKS_IN_A_ROW = 4;
export const NEMESIS_NIGHTS = 3;
export const HOST_GAMES = 10;
/** Full House Party means something only with a few members. */
export const PARTY_MIN_MEMBERS = 3;

/** Longest run of weeks in a row with a night, and the run still going at `now` (this week or last). */
export function weekStreaks(nightTimes: readonly number[], now: number): { longest: number; current: number } {
  const weeks = [...new Set(nightTimes.map(istWeek))].sort((a, b) => a - b);
  let longest = 0, run = 0, prev = NaN;
  for (const w of weeks) { run = w === prev + 1 ? run + 1 : 1; longest = Math.max(longest, run); prev = w; }
  const last = weeks.at(-1);
  return { longest, current: last !== undefined && istWeek(now) - last <= 1 ? run : 0 };
}

export function checkHistory(f: HistoryFacts): Earned[] {
  const out: Earned[] = [];
  const has = new Set<string>();
  const give = (id: string, pid: Pid, n: { game: string | null; at: number }, detail?: Earned['detail']): void => {
    if (has.has(`${id} ${pid}`)) return;
    has.add(`${id} ${pid}`);
    out.push({ id, pid, reveal: 'night', game: n.game, hand: null, at: n.at, ...(detail ? { detail } : {}) });
  };
  const nights = [...f.nights].sort((a, b) => a.endedAt - b.endedAt);
  const ref = (n: HistoryNight) => ({ game: n.game, at: n.endedAt });

  // Every Week: four India-time weeks in a row with at least one night each
  const run: Record<Pid, { week: number; n: number }> = {};
  for (const n of nights) for (const { pid } of n.players) {
    const w = istWeek(n.endedAt), r = run[pid];
    if (r && r.week === w) continue;
    run[pid] = { week: w, n: r && r.week === w - 1 ? r.n + 1 : 1 };
    if (run[pid]!.n >= WEEKS_IN_A_ROW) give('every_week', pid, ref(n));
  }

  // Podium and Champion: only seasons that are over count
  for (const s of f.seasons) if (s.closed) for (const r of s.ranks) {
    if (r.rank === null) continue;
    if (r.rank <= 3) give('podium', r.pid, { game: null, at: s.closedAt }, { season: s.name });
    if (r.rank === 1) give('champion', r.pid, { game: null, at: s.closedAt }, { season: s.name });
  }

  // Nemesis: above the same player three times running, counting only the nights both played
  const above: Record<string, number> = {};
  for (const n of nights) for (const a of n.players) for (const b of n.players) {
    if (a.pid === b.pid) continue;
    const k = `${a.pid} ${b.pid}`;
    above[k] = a.place < b.place ? (above[k] ?? 0) + 1 : 0;
    if (above[k]! >= NEMESIS_NIGHTS) give('nemesis', a.pid, ref(n), { victim: b.pid, name: f.names?.[b.pid] ?? '' });
  }

  // Full House Party: everyone who was a member that night was at the table
  for (const n of nights) {
    const then = f.members.filter((m) => m.joined <= n.endedAt && !(m.left && m.left <= n.endedAt));
    if (then.length < PARTY_MIN_MEMBERS || !then.every((m) => n.players.some((p) => p.pid === m.pid))) continue;
    for (const m of then) give('full_house_party', m.pid, ref(n));
  }

  // Host: the tenth game you opened
  const hosted: Record<Pid, number> = {};
  for (const n of nights) if (n.host) { hosted[n.host] = (hosted[n.host] ?? 0) + 1; if (hosted[n.host]! >= HOST_GAMES) give('host', n.host, ref(n)); }
  return out;
}
