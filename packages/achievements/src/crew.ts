// The history run: every stored hand and game of one crew through the achievement checker, oldest first,
// exactly as a table server would have done it live (hand by hand, then the night, then the crew's
// history). Pure: it takes the exported file's contents (export.sql) and returns what everyone earned.
import { ACHIEVEMENT } from './defs';
import { factsFromRecord, type Career, type Earned, type HandFacts } from './facts';
import { checkHand, stoneColdBluff } from './hand';
import { checkNight, standings } from './night';
import { checkHistory, type HistoryNight } from './history';
import type { HandRecord } from '@tp/engine';

export interface ExportPlayer { key: string; account: string | null; name: string; place: number | null; net: number | null; buyins: number; hands: number }
export interface ExportGame { id: string; table: string; started: string; ended: string | null; start_stack: number; big_blind: number; casual: boolean; season: string | null; host: string | null; players: ExportPlayer[] | null }
export interface CrewExport {
  v: 1;
  crew: { id: string; name: string } | null;
  members: { account: string; name: string; joined: string }[];
  seasons: { id: string; name: string; ends: string; closed: string | null; ranks: { account: string; rank: number | null }[] }[];
  games: ExportGame[];
  hands: { game: string; no: number; record: HandRecord }[];
}

export interface PlayerReport {
  pid: string; name: string; member: boolean;
  /** Signed in (a guest seat has no account and gets no history in the database). */
  account: boolean;
  /** Every achievement, the first time it was earned (a tier counts as its own). */
  earned: Earned[];
  hands: number; bluffs: number; nights: number;
}
export interface Report { crew: string; games: number; hands: number; skipped: { game: string; no: number; why: string }[]; players: PlayerReport[] }

export function runHistory(x: CrewExport): Report {
  const names: Record<string, string> = {};
  for (const m of x.members) names[m.account] = m.name;
  const career: Record<string, Career> = {}, owned: Record<string, string[]> = {}, nightsOf: Record<string, number> = {};
  const earned: Earned[] = [];
  const skipped: Report['skipped'] = [];
  const keep = (list: Earned[]): void => {
    for (const e of list) { (owned[e.pid] ??= []).push(e.tier ? `${e.id}:${e.tier}` : e.id); earned.push(e); }
  };
  const byGame = new Map<string, CrewExport['hands']>();
  for (const h of x.hands) { const l = byGame.get(h.game) ?? []; l.push(h); byGame.set(h.game, l); }
  const games = [...x.games].sort((a, b) => Date.parse(a.started) - Date.parse(b.started));
  const nights: HistoryNight[] = [];
  const accounts = new Set(x.members.map((m) => m.account));
  let hands = 0;

  for (const g of games) {
    const players = g.players ?? [];
    for (const p of players) { names[p.account ?? p.key] ??= p.name; if (p.account) accounts.add(p.account); }
    // seats are known by their key at the table; history is kept per account (a guest keeps the key)
    const who = new Map(players.map((p) => [p.key, p.account ?? p.key]));
    const rename = (f: HandFacts): HandFacts => {
      const id = (k: string): string => who.get(k) ?? k;
      const map = <T>(o: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(o).map(([k, v]) => [id(k), v]));
      return { ...f, game: g.id, order: f.order.map(id), hole: map(f.hole), actions: f.actions.map((a) => ({ ...a, pid: id(a.pid) })), showdown: f.showdown.map(id), awards: map(f.awards), stackBefore: map(f.stackBefore), stackAfter: map(f.stackAfter), buyins: map(f.buyins) };
    };
    const facts: HandFacts[] = [];
    for (const h of (byGame.get(g.id) ?? []).sort((a, b) => a.no - b.no)) {
      let f: HandFacts;
      try { f = rename(factsFromRecord(h.record)); } catch (e) { skipped.push({ game: g.id, no: h.no, why: String((e as Error).message ?? e) }); continue; }
      if (!g.casual) keep(checkHand(f, { hands: facts, career, owned }));
      facts.push(f);
      hands++;
    }
    if (g.casual) continue; // a casual table is not part of anyone's history
    for (const f of facts) for (const p of f.order) {
      const c = (career[p] ??= { hands: 0, bluffs: 0 });
      c.hands++;
      if (stoneColdBluff(f, p)) c.bluffs++;
    }
    // places as the league has them (stored, else by chips won); rebuys as seen between hands
    const seen = new Map(standings(facts).map((s) => [s.pid, s]));
    const rows = players.filter((p) => p.net !== null);
    const result = rows.map((p) => ({
      pid: p.account ?? p.key,
      place: p.place ?? 1 + rows.filter((q) => (q.net ?? 0) > (p.net ?? 0)).length,
      rebuys: Math.max(seen.get(p.account ?? p.key)?.rebuys ?? 0, Math.round(p.buyins / g.start_stack) - 1, 0),
    }));
    const ended = Date.parse(g.ended ?? g.started);
    for (const r of result) nightsOf[r.pid] = (nightsOf[r.pid] ?? 0) + 1;
    if (facts.length) keep(checkNight({ game: g.id, startStack: g.start_stack, endedAt: ended, hands: facts, players: result }, owned));
    nights.push({ game: g.id, endedAt: ended, host: g.host, players: result.map((r) => ({ pid: r.pid, place: r.place })) });
  }

  const hist = checkHistory({
    nights, names,
    seasons: x.seasons.map((s) => ({ id: s.id, name: s.name, closed: !!s.closed, closedAt: Date.parse(s.closed ?? s.ends), ranks: s.ranks.map((r) => ({ pid: r.account, rank: r.rank })) })),
    members: x.members.map((m) => ({ pid: m.account, joined: Date.parse(m.joined) })),
  });
  keep(hist.filter((e) => !(owned[e.pid] ?? []).includes(e.id)));

  const members = new Set(x.members.map((m) => m.account));
  const pids = [...new Set([...Object.keys(career), ...Object.keys(nightsOf), ...earned.map((e) => e.pid)])];
  const out: PlayerReport[] = pids.map((pid) => ({
    pid, name: names[pid] ?? pid, member: members.has(pid), account: accounts.has(pid), earned: earned.filter((e) => e.pid === pid).sort((a, b) => a.at - b.at),
    hands: career[pid]?.hands ?? 0, bluffs: career[pid]?.bluffs ?? 0, nights: nightsOf[pid] ?? 0,
  })).sort((a, b) => b.earned.length - a.earned.length || b.hands - a.hands || a.name.localeCompare(b.name));
  return { crew: x.crew?.name ?? '', games: games.length, hands, skipped, players: out };
}

/** The whole result as one signed-call body for public.record_achievements (the profile migration): every
 * achievement of every player who has an account, and their bluff counts. `ref` makes it land only once.
 * The table servers send it after each night (packages/table achievements-run.ts). */
export function recordBody(r: Report, ref: string, whole = false, crew?: string): { ref: string; crew?: string; earned: object[]; counts: object[] } {
  const players = r.players.filter((p) => p.account);
  return {
    ref,
    ...(crew ? { crew } : {}), // (a run over the crew's whole history: the database notes the crew is up to date)
    earned: players.flatMap((p) => p.earned.map((e) => ({ account: p.pid, id: e.id, tier: e.tier ?? 0, reveal: e.reveal, at: new Date(e.at).toISOString(), ...(e.hand ? { hand: e.hand } : {}), ...(e.game ? { game: e.game } : {}), ...(e.detail ? { detail: e.detail } : {}) }))),
    // `whole`: this run covered the crew's whole history, so the counts are totals to set (a run after every
    // night repeats the history; adding would count the old hands again)
    counts: players.filter((p) => p.bluffs > 0).map((p) => (whole ? { account: p.pid, key: 'bluffs', set: p.bluffs } : { account: p.pid, key: 'bluffs', add: p.bluffs })),
  };
}

const label = (e: Earned): string => {
  const a = ACHIEVEMENT[e.id]!;
  const tier = e.tier ? ` (${a.tiers![e.tier - 1]!.at})` : '';
  const whose = e.id === 'nemesis' && e.detail?.name ? ` of ${e.detail.name}` : '';
  return `${a.name}${tier}${whose}`;
};

/** The report as plain lines for a terminal. */
export function printable(r: Report): string {
  const lines = [`${r.crew}: ${r.games} games, ${r.hands} hands`];
  if (r.skipped.length) lines.push(`${r.skipped.length} hands could not be replayed and were left out: ${r.skipped.slice(0, 5).map((s) => `${s.game.slice(0, 8)} #${s.no}`).join(', ')}`);
  for (const p of r.players) {
    lines.push('', `${p.name}${p.member ? '' : ' (not a member now)'}: ${p.earned.length} earned · ${p.hands} hands · ${p.nights} nights · ${p.bluffs} bluffs`);
    for (const e of p.earned) {
      const day = new Date(e.at + 5.5 * 3_600_000).toISOString().slice(0, 10); // India time
      lines.push(`  ${day}  ${label(e)}${e.hand ? `  hand ${e.hand}` : ''}${e.reveal === 'night' ? '  (held for the night summary)' : ''}`);
    }
  }
  return lines.join('\n');
}
