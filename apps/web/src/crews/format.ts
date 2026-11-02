// The crews screens' pure rules (no page needed): crew badges and colours, numbers and dates, which layout a
// screen gets, and how a crew's table rules read.
import type { Badge, TableRules } from '@tp/account';

export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ---------------------------------------------------------------- badges
export const SHAPES: Record<Badge, string> = {
  shield: 'M24 3 L42 9 V23 C42 34 34 41 24 45 C14 41 6 34 6 23 V9 Z',
  hex: 'M24 3 L42 13.5 V34.5 L24 45 L6 34.5 V13.5 Z',
  round: 'M24 3 A21 21 0 1 1 23.99 3 Z',
  diamond: 'M24 2 L46 24 L24 46 L2 24 Z',
};
export const BADGES: Badge[] = ['shield', 'hex', 'round', 'diamond'];
/** The six crew colours (main and its light partner), as in the design. */
export const COLORS: [string, string][] = [['#c0392b', '#f3c66b'], ['#2f6fd6', '#bfe0ff'], ['#1f8a5b', '#c9f2dc'], ['#7d3cc8', '#e6d3ff'], ['#e07a1f', '#fff0d9'], ['#222831', '#e8e8e8']];
export const COLOR_NAMES = ['Red', 'Blue', 'Green', 'Purple', 'Orange', 'Black'];
/** The light partner of a crew colour (crews made before v3 have other colours: a pale mix of theirs). */
export function partner(color: string): string {
  const hit = COLORS.find(([c]) => c.toLowerCase() === color.toLowerCase());
  if (hit) return hit[1];
  const n = parseInt(color.slice(1), 16);
  const mix = (v: number): number => Math.round(v + (255 - v) * 0.72);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, '0')).join('')}`;
}
/** Two characters on the badge: "Friday Night Table" FN, "Hostel 4B" 4B, "Office Fridays" OF, "Aces" AC. */
export function crewShort(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] ?? '';
  if (words.length > 1 && last.length <= 3 && /\d/.test(last)) return last.toUpperCase().slice(0, 2);
  if (words.length > 1) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0] ?? '?').slice(0, 2).toUpperCase();
}
export interface CrewLook { name: string; color: string; badge: Badge }
/** A crew's badge: its shape and colours, its two letters in the theme's display font. */
export function emblem(c: CrewLook, size = 44, cls = '', short?: string): string {
  const d = SHAPES[c.badge] ?? SHAPES.shield;
  const c2 = partner(c.color);
  return `<span class="kemb ${cls}" style="--es:${size}px" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="${d}" fill="${esc(c.color)}"/>`
    + `<path d="${d}" fill="none" stroke="${c2}" stroke-width="2.2" opacity=".85" transform="translate(4.8 4.8) scale(.8)"/></svg><b style="color:${c2}">${esc(short ?? crewShort(c.name))}</b></span>`;
}

// ---------------------------------------------------------------- numbers and dates
const MINUS = '−';
/** +96 bb, −48 bb (the design's minus sign), 0 bb */
export function bbText(n: number | string | null | undefined, unit = true): string {
  if (n == null) return '–';
  const v = Math.round(Number(n));
  return `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toLocaleString('en-IN')}${unit ? ' bb' : ''}`;
}
export const upDown = (n: number | string | null | undefined): string => (n == null ? '' : Number(n) > 0 ? 'tu' : Number(n) < 0 ? 'td' : '');
export const ordinal = (n: number): string => n + (['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th');
export const fmtN = (n: number): string => Math.round(n).toLocaleString('en-IN');
const D = (t: string | number | Date): Date => new Date(t);
export const dayMonth = (t: string): string => D(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
export const clock = (t: string | Date): string => D(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', ' ');
export const monthDay = (t: string): string => D(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const monthName = (t: string): string => D(t).toLocaleDateString('en-GB', { month: 'short' });
/** "2 h ago", "yesterday", "3 days ago" */
export function ago(t: string, now = Date.now()): string {
  const s = Math.max(0, (now - D(t).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 2 * 86400) return 'yesterday';
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`;
  if (s < 14 * 86400) return '1 week ago';
  return `${Math.floor(s / (7 * 86400))} weeks ago`;
}
/** "ends in 12 days", "ends today" */
export function endsIn(t: string | null | undefined, now = Date.now()): string {
  if (!t) return '';
  const d = Math.ceil((D(t).getTime() - now) / 86400000);
  return d <= 0 ? 'ends today' : d === 1 ? 'ends tomorrow' : `ends in ${d} days`;
}
/** 3 h 12 min */
export function duration(a: string, b: string | null): string {
  if (!b) return '';
  const m = Math.max(1, Math.round((D(b).getTime() - D(a).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
/** The usual night as "Fri 9 pm" */
export function usualText(u: { day: string; hour: number | null } | null | undefined): string {
  if (!u?.day) return '';
  if (u.hour == null) return u.day;
  const h = u.hour % 12 || 12;
  return `${u.day} ${h} ${u.hour < 12 ? 'am' : 'pm'}`;
}
/** Which group a game goes in on the Games tab: This week, Last week, or the month. */
export function weekGroup(t: string, now = new Date()): string {
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
  const d = D(t);
  if (d >= start) return 'This week';
  if (d >= new Date(start.getTime() - 7 * 86400000)) return 'Last week';
  return d.toLocaleDateString('en-GB', { month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

// ---------------------------------------------------------------- layouts and rules
export type Size = 'phone' | 'side' | 'tab' | 'lap' | 'desk';
/** Which layout a screen gets (v3sizes.py). */
export function sizeOf(w: number, h: number): Size {
  if (w > h && h < 520 && w < 1100) return 'side';
  if (w < 700) return 'phone';
  if (w < 1100) return 'tab';
  if (w < 1700) return 'lap';
  return 'desk';
}
export const DEFAULT_RULES: TableRules = { startStack: 1000, sb: 10, bb: 20, turnTime: 20, rebuys: true, maxRebuys: 2 };
/** What the crew's rules say, as the host sheet shows them. */
export function rulesText(r: TableRules): string {
  const x = { ...DEFAULT_RULES, ...r };
  const up = x.blindUpEvery ? `, up every ${x.blindUpEvery} hands` : '';
  const rb = x.rebuys ? ` · ${x.maxRebuys ? `${x.maxRebuys} rebuy${x.maxRebuys === 1 ? '' : 's'}` : 'rebuys'} of ${fmtN(x.startStack!)}` : ' · no rebuys';
  return `${fmtN(x.startStack!)} chips · blinds ${fmtN(x.sb!)}/${fmtN(x.bb!)}${up}${rb}`;
}
