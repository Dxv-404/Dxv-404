// The Profile page's pure rules (no page needed): where a night's chip line goes on its graph, which
// square of the calendar a day lands in (India time), how far a milestone bar fills, and the small
// sums the card and the summary lines show.
import { ACHIEVEMENT, RARITIES, nextMilestones, milestoneBars, ownedLook, type MilestoneBar } from '@tp/achievements';
import type { OwnedAchievement, ProfileDay, ProfileNight, ProfilePage } from '@tp/account';

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// ---------------------------------------------------------------- the night chip graph
export interface Pt { x: number; y: number }
export interface GraphMark { kind: 'best' | 'worst' | 'rebuy' | 'earned' | 'end'; hand: number; x: number; y: number; chips: number; id?: string }
export interface GraphGeo {
  w: number; h: number;
  /** The player's line: the buy-in before the first hand, then the stack after each hand. */
  line: Pt[];
  /** Everything bought in so far, as steps (one up at every rebuy). */
  buyin: Pt[];
  marks: GraphMark[];
  /** Everyone else's lines (for "Show table"). */
  others: { name: string; line: Pt[] }[];
  /** The chips at the bottom and the top of the plot, and round numbers between them for the grid. */
  lo: number; hi: number; ticks: { chips: number; y: number }[];
  hands: [number, number];
}

/** A round step (1, 2 or 5 × 10^n) that gives about `n` steps across `span`. */
export function niceStep(span: number, n = 4): number {
  if (!(span > 0)) return 1;
  const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Everything bought in when hand `hand` was played: the first buy-in plus the rebuys up to it. */
export function buyinAt(n: Pick<ProfileNight, 'start_stack' | 'rebuys'>, hand: number): number {
  return n.start_stack + n.rebuys.filter((r) => r.before <= hand).reduce((s, r) => s + r.chips, 0);
}

/** Where everything goes on a w × h graph (pad: left, right, top, bottom). The plot always starts at 0
 * chips, so going broke touches the floor, and always has the buy-in line inside it. */
export function graphGeo(n: ProfileNight, w: number, h: number, pad: [number, number, number, number] = [8, 8, 10, 10], withTable = false): GraphGeo {
  const [pl, pr, pt, pb] = pad;
  const hands = n.hands.length ? n.hands : [1];
  const lines = withTable ? n.lines.filter((l) => l.hands?.length && l.stacks?.length) : [];
  const first = Math.min(hands[0]!, ...lines.map((l) => l.hands![0]!)) - 1;
  const last = Math.max(hands[hands.length - 1]!, ...lines.map((l) => l.hands![l.hands!.length - 1]!), first + 1);
  const tops = [...n.stacks, buyinAt(n, last), ...lines.flatMap((l) => l.stacks!)];
  const step = niceStep(Math.max(...tops, 1), 5);
  const hi = Math.ceil((Math.max(...tops, 1) * 1.04) / step) * step, lo = 0;
  const x = (hand: number): number => pl + ((hand - first) / (last - first)) * (w - pl - pr);
  const y = (chips: number): number => pt + (1 - (chips - lo) / (hi - lo)) * (h - pt - pb);
  const r = (p: Pt): Pt => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
  // the line starts from what the player sat down with, one hand before their first
  const line: Pt[] = [r({ x: x(hands[0]! - 1), y: y(n.start_stack) }), ...n.hands.map((hd, i) => r({ x: x(hd), y: y(n.stacks[i] ?? 0) }))];
  const buyin: Pt[] = [r({ x: x(first), y: y(n.start_stack) })];
  for (const rb of [...n.rebuys].sort((a, b) => a.before - b.before)) {
    const at = x(rb.before - 1);
    buyin.push(r({ x: at, y: buyin[buyin.length - 1]!.y }), r({ x: at, y: y(buyinAt(n, rb.before)) }));
  }
  buyin.push(r({ x: x(last), y: buyin[buyin.length - 1]!.y }));
  const stackAt = (hand: number): number => { const i = n.hands.indexOf(hand); return i >= 0 ? (n.stacks[i] ?? 0) : n.start_stack; };
  const marks: GraphMark[] = [];
  const mark = (kind: GraphMark['kind'], hand: number, chips: number, id?: string): void => { marks.push({ kind, hand, chips, ...r({ x: x(hand), y: y(stackAt(hand)) }), ...(id ? { id } : {}) }); };
  for (const rb of n.rebuys) marks.push({ kind: 'rebuy', hand: rb.before, chips: rb.chips, ...r({ x: x(rb.before - 1), y: y(stackAt(rb.before - 1)) }) });
  if (n.best && n.hands.includes(n.best.hand)) mark('best', n.best.hand, n.best.chips);
  if (n.worst && n.hands.includes(n.worst.hand)) mark('worst', n.worst.hand, n.worst.chips);
  for (const a of n.achievements) if (a.hand && n.hands.includes(a.hand)) mark('earned', a.hand, 0, a.id);
  if (n.hands.length) mark('end', n.hands[n.hands.length - 1]!, n.net);
  const ticks: GraphGeo['ticks'] = [];
  for (let c = step; c < hi; c += step) ticks.push({ chips: c, y: Math.round(y(c) * 10) / 10 });
  return {
    w, h, line, buyin, marks, lo, hi, ticks, hands: [first, last],
    others: lines.map((l) => ({ name: l.name, line: l.hands!.map((hd, i) => r({ x: x(hd), y: y(l.stacks![i] ?? 0) })) })),
  };
}

/** An SVG path through the points; `stepped` (the Pixel theme) moves across first, then up or down. */
export function pathOf(pts: readonly Pt[], stepped = false): string {
  return pts.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : stepped ? `H${p.x}V${p.y}` : `L${p.x} ${p.y}`)).join('');
}
/** The region of the plot above (or below) the buy-in line, to clip the win and loss shading with. */
export function sideOf(g: GraphGeo, above: boolean): string {
  const edge = above ? 0 : g.h;
  return `${pathOf(g.buyin)}V${edge}H${g.buyin[0]!.x}Z`;
}
/** The area under the player's line down to the floor (or, `toTop`, above it up to the top). Clipped with
 * sideOf, these are the win shading (under the line, above the buy-in) and the loss shading (the reverse). */
export function areaOf(g: GraphGeo, stepped = false, toTop = false): string {
  return `${pathOf(g.line, stepped)}V${toTop ? 0 : g.h}H${g.line[0]!.x}Z`;
}

// ---------------------------------------------------------------- the calendar (India days)
const IST = 5.5 * 3_600_000, DAY = 86_400_000;
/** The India-time day of a moment, as "2026-11-07". India has no summer time. */
export const istDayKey = (ms: number): string => new Date(ms + IST).toISOString().slice(0, 10);
/** Days since 1 Jan 1970 of a day key (no time zones involved). */
export const dayNo = (key: string): number => Math.round(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))) / DAY);
export const keyOfDay = (n: number): string => new Date(n * DAY).toISOString().slice(0, 10);
/** 0 = Monday .. 6 = Sunday. */
export const weekdayOf = (key: string): number => (((dayNo(key) + 3) % 7) + 7) % 7;

/** How a day went, from −3 (a big loss) to 3 (a big win), by its game score per game. */
export function heatLevel(score: number, games = 1): -3 | -2 | -1 | 0 | 1 | 2 | 3 {
  const s = score / Math.max(1, games);
  return s <= -4 ? -3 : s <= -2 ? -2 : s < -0.25 ? -1 : s <= 0.25 ? 0 : s < 2 ? 1 : s < 4 ? 2 : 3;
}

export interface HeatCell { day: string; level: number | null; games: number; won: boolean; earned: number; today: boolean; data: ProfileDay | null }
export interface HeatWeek { cells: (HeatCell | null)[]; /** "Nov" on the week a month starts in. */ month: string | null }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The year as weeks across and weekdays down (Monday at the top), ending with the week `today` is in.
 * Days after today are empty (null). */
export function heatGrid(days: readonly ProfileDay[], today: string, weeks = 53): HeatWeek[] {
  const by = new Map(days.map((d) => [d.day, d]));
  const t = dayNo(today), monday = t - weekdayOf(today), start = monday - (weeks - 1) * 7;
  const out: HeatWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const cells: (HeatCell | null)[] = [];
    let month: string | null = null;
    for (let d = 0; d < 7; d++) {
      const n = start + w * 7 + d;
      if (n > t) { cells.push(null); continue; }
      const key = keyOfDay(n), data = by.get(key) ?? null;
      if (key.endsWith('-01') || (w === 0 && d === 0)) month = MONTHS[Number(key.slice(5, 7)) - 1]!;
      cells.push({ day: key, level: data ? heatLevel(num(data.score), data.games) : null, games: data?.games ?? 0, won: !!data?.won, earned: data?.achievements ?? 0, today: n === t, data });
    }
    out.push({ cells, month });
  }
  // a month label needs room: drop one that is right against the next
  for (let i = 0; i < out.length - 1; i++) if (out[i]!.month && out[i + 1]!.month) out[i]!.month = null;
  return out;
}

const WEEKDAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** "Sat 7 Nov" from a day key. */
export const dayText = (key: string): string => `${SHORT_DAYS[weekdayOf(key)]} ${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;

/** The line above the calendar: nights, the best day, the weekday played most (ties: the earlier in the week). */
export function heatSummary(days: readonly ProfileDay[]): { nights: number; best: string | null; weekday: string | null } {
  const nights = days.reduce((s, d) => s + d.games, 0);
  let best: ProfileDay | null = null;
  const per = [0, 0, 0, 0, 0, 0, 0];
  for (const d of days) { if (!best || num(d.score) > num(best.score)) best = d; per[weekdayOf(d.day)]! += d.games; }
  const top = Math.max(...per);
  return { nights, best: best ? dayText(best.day) : null, weekday: top > 0 ? WEEKDAYS[per.indexOf(top)]! : null };
}

// ---------------------------------------------------------------- milestones
export interface Bar extends MilestoneBar {
  /** Where the bar was when the player last looked (0..1 of the way to `next`): it fills from there. */
  from: number;
  /** What was gained since then. */
  gained: number;
}
function withSeen(b: MilestoneBar, seen: Record<string, unknown>): Bar {
  const was = Math.min(b.value, Math.max(0, num(seen[b.id])));
  return { ...b, from: b.done ? Math.min(1, was / b.next) : Math.min(b.part, was / b.next), gained: b.value - was };
}
const values = (p: ProfilePage): Record<string, number> => Object.fromEntries(Object.entries(p.milestones.values).map(([k, v]) => [k, num(v)]));
/** The three closest milestones, each with where its bar starts filling from. */
export const nextBars = (p: ProfilePage, n = 3): Bar[] => nextMilestones(values(p), n).map((b) => withSeen(b, p.milestones.seen));
export const allBars = (p: ProfilePage): Bar[] => milestoneBars(values(p)).map((b) => withSeen(b, p.milestones.seen));

// ---------------------------------------------------------------- achievements and the card
export interface Slot { id: string; name: string; how: string; group: string; rarity: string; hidden: boolean; owned: OwnedAchievement | null; tier: number; tiers: number; unlocks: string[]; crewHas: number }
/** The cabinet: all 37 in the table's order, each with the player's best tier of it (or none). */
export function cabinet(p: ProfilePage): Slot[] {
  return Object.values(ACHIEVEMENT).map((a) => {
    const mine = p.achievements.filter((x) => x.id === a.id).sort((x, y) => y.tier - x.tier);
    const owned = mine[0] ?? null;
    const look = owned ? ownedLook(a.id, owned.tier) : null;
    const whose = String(owned?.detail?.name ?? '');
    return {
      id: a.id, name: a.name, how: a.how, group: a.group, rarity: look?.rarity ?? a.rarity, hidden: a.hidden, owned, tier: owned?.tier ?? 0, tiers: a.tiers?.length ?? 0,
      unlocks: (look?.unlocks ?? a.unlocks).map((u) => `${u.kind[0]!.toUpperCase()}${u.kind.slice(1)}: ${u.name.replace('[name]', whose || 'Their')}`), crewHas: p.crew_has[a.id] ?? 0,
    };
  });
}
/** The title on the card: the one chosen, else the rarest title unlocked so far (null: none yet). */
export function titleOf(p: ProfilePage): string | null {
  const titles = p.achievements.map((o) => {
    const t = ownedLook(o.id, o.tier)?.unlocks.find((u) => u.kind === 'title');
    return t ? { id: o.id, text: t.name.replace('[name]', String(o.detail?.name ?? 'Their')), rank: RARITIES.indexOf(ownedLook(o.id, o.tier)!.rarity), at: o.at } : null;
  }).filter((t) => t !== null);
  const chosen = titles.find((t) => t.id === p.card?.title);
  if (chosen) return chosen.text;
  titles.sort((a, b) => b.rank - a.rank || a.at.localeCompare(b.at));
  return titles[0]?.text ?? null;
}
const STATS: Record<string, [string, (p: ProfilePage) => string]> = {
  wins: ['Wins', (p) => String(p.career.wins)],
  nights: ['Nights', (p) => String(p.career.nights)],
  hands: ['Hands', (p) => num(p.career.hands).toLocaleString('en-IN')],
  best_night: ['Best night', (p) => { const b = Math.max(...p.heatmap.flatMap((d) => d.list.map((g) => num(g.score))), -Infinity); return Number.isFinite(b) ? signed(b) : '–'; }],
  streak: ['Best streak', (p) => String(p.streaks.wins.longest)],
  bluffs: ['Bluffs', (p) => String(p.career.bluffs)],
  showdowns: ['Showdowns won', (p) => String(p.career.showdowns_won)],
  achievements: ['Achievements', (p) => String(p.career.achievements)],
};
/** A score with its sign and one decimal: +7.0, −1.5 (the design's minus sign). */
export const signed = (v: unknown, digits = 1): string => { const n = num(v); return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`; };
/** The three stats on the card's face: the ones chosen, else wins, best night, hands. */
export function cardStats(p: ProfilePage): { label: string; value: string }[] {
  const picked = (p.card?.stats ?? []).filter((k) => STATS[k]);
  const keys = [...picked, ...['wins', 'best_night', 'hands'].filter((k) => !picked.includes(k))].slice(0, 3);
  return keys.map((k) => ({ label: STATS[k]![0], value: STATS[k]![1](p) }));
}
/** "No. 004 · lavasa gang · Season 1" */
export function serialOf(p: ProfilePage): string {
  if (!p.crew) return 'No crew yet';
  return [`No. ${String(p.crew.serial).padStart(3, '0')}`, p.crew.name, p.season ? (p.season.title ?? (p.season.number ? `Season ${p.season.number}` : p.season.name)) : ''].filter(Boolean).join(' · ');
}

/** Rank after each game as a stepped line, rank 1 at the top; games before the player was ranked have no point. */
export function rankSteps(ranks: readonly (number | null)[], w: number, h: number, pad = 6): { d: string; worst: number; last: Pt | null } {
  const known = ranks.filter((r): r is number => r !== null);
  const worst = Math.max(2, ...known);
  const x = (i: number): number => Math.round((pad + (ranks.length > 1 ? (i / (ranks.length - 1)) * (w - 2 * pad) : (w - 2 * pad) / 2)) * 10) / 10;
  const y = (r: number): number => Math.round((pad + ((r - 1) / (worst - 1)) * (h - 2 * pad)) * 10) / 10;
  let d = '', open = false, last: Pt | null = null;
  ranks.forEach((r, i) => {
    if (r === null) { open = false; return; }
    d += open ? `H${x(i)}V${y(r)}` : `M${x(i)} ${y(r)}`;
    open = true; last = { x: x(i), y: y(r) };
  });
  return { d, worst, last };
}
