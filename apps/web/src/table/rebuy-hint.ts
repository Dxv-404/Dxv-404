// What the table says about rebuys in words: the hint under your stack and the Table rules sheet's rows.
import type { ScreenView } from '../net-table';

const fmt = (n: number): string => Math.round(n).toLocaleString('en-IN');
const ORD = (n: number): string => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!); };
export const ordinal = ORD;

/** Under your stack: ["Rebuys left 1 of 2", "1,000 chips each"], or null when the table has no rebuys. */
export function heroRebuyHint(v: ScreenView): [string, string] | null {
  const r = v.rebuy;
  if (!r || !r.on || !v.me) return null;
  const each = `${fmt(r.amount)} chips each`;
  if (r.closed) return ['Rebuys closed', `Closed after level ${r.untilLevel}`];
  if (r.left === null) return ['Rebuys: no limit', each];
  if (r.left === 0) return ['No rebuys left', `${r.used} of ${r.max} used`];
  return [`Rebuys left ${r.left} of ${r.max}`, each];
}

/** The Table rules sheet: everything the host chose, plus what you have used. */
export function rulesRows(v: ScreenView, extra: { crew?: string | null; seats?: boolean } = {}): [string, string][] {
  const r = v.rebuy, c = v.cfg;
  const rows: [string, string][] = [['Chips', `${fmt(c.startStack)} to start`]];
  const up = c.blindUpEvery ? `up every ${c.blindUpEvery} hand${c.blindUpEvery === 1 ? '' : 's'}` : 'they stay the same';
  rows.push(['Blinds', `${fmt(v.level.sb)}/${fmt(v.level.bb)}, ${up} · level ${v.level.n} now`]);
  if (!r?.on) rows.push(['Rebuys', 'None: out of chips is out for the night']);
  else {
    const n = r.max === 0 ? 'No limit' : `${r.max} each`;
    const close = r.untilLevel ? (r.closed ? ` · closed after level ${r.untilLevel}` : ` · close after level ${r.untilLevel}`) : '';
    rows.push(['Rebuys', `${n}, ${fmt(r.amount)} chips, ${r.atZero ? 'when out of chips' : `top up to ${fmt(r.amount)}`}${close}`]);
    if (v.me && v.players.some((p) => p.id === v.me)) {
      const used = `${r.used} rebuy${r.used === 1 ? '' : 's'} used`;
      rows.push(['You', r.closed ? `${used} · rebuys closed` : r.left === null ? `${used} · no limit` : `${used} · ${r.left} left`]);
    }
  }
  rows.push(['Time to act', c.turnTime ? `${c.turnTime} seconds` : 'No limit']);
  if (extra.seats !== false) rows.push(['Seats', `${v.players.length} of ${c.maxPlayers}`]);
  if (extra.crew) rows.push(['Crew', extra.crew]);
  return rows;
}
