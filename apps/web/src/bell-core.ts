// The bell's plain computing (bell.ts draws with it): what is unread, today and earlier, "12 min ago", what the
// switch block shows, and the inbox's HTML. No page needed, so it is unit tested.
import type { Notice } from '@tp/account';

/** How many are new since the bell was last read. */
export const unreadCount = (list: Pick<Notice, 'id'>[], seen: number): number => list.filter((n) => n.id > seen).length;
/** Today's notifications, then the earlier ones (each newest first, as given). */
export function groupNotices<T extends Pick<Notice, 'at'>>(list: T[], now: number): { today: T[]; earlier: T[] } {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  return { today: list.filter((n) => Date.parse(n.at) >= start), earlier: list.filter((n) => !(Date.parse(n.at) >= start)) };
}
/** "just now", "12 min ago", "3 h ago", then the day ("Mon 9 Nov"). */
export function whenText(at: string, now: number): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return '';
  const min = Math.floor((now - t) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  return new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
export type BellState = 'no-account' | 'ios-install' | 'unsupported' | 'blocked' | 'off' | 'on';
/** What the switch block shows on this phone. */
export function bellState(e: { account: boolean; ios: boolean; standalone: boolean; supported: boolean; permission: string; subscribed: boolean }): BellState {
  if (!e.account) return 'no-account';
  if (e.ios && !e.standalone) return 'ios-install';
  if (!e.supported) return 'unsupported';
  if (e.permission === 'denied') return 'blocked';
  return e.permission === 'granted' && e.subscribed ? 'on' : 'off';
}


const ICON: Record<string, string> = {
  crewTable: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="9" height="13" rx="1.6" transform="rotate(-10 8.5 11.5)"/><rect x="11" y="6" width="9" height="13" rx="1.6" transform="rotate(8 15.5 12.5)" fill="currentColor" fill-opacity=".18"/></svg>',
  crew: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="3"/><path d="M3.5 19c.6-3 2.7-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/><circle cx="17" cy="8" r="2.3"/><path d="M16 13.6c2.4.2 4 1.5 4.5 4"/></svg>',
  trophies: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0z" fill="currentColor" fill-opacity=".18"/><path d="M8 5.5H5c0 2.5 1.2 4 3.2 4.3M16 5.5h3c0 2.5-1.2 4-3.2 4.3M12 13v4M8.5 20h7M10 17h4"/></svg>',
  devices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M11 18h2"/></svg>',
};
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function noticeHtml(n: Notice, seenId: number, now: number): string {
  const join = n.kind === 'crewTable' && /#\/t\//.test(n.url) && now - Date.parse(n.at) < 6 * 3600_000;
  return `<button class="bitem${n.id > seenId ? ' new' : ''}" data-b="item" data-id="${n.id}" data-kind="${esc(n.kind)}" data-url="${esc(n.url)}">`
    + `<span class="bic" aria-hidden="true">${ICON[n.kind] ?? ICON.crew}</span><span class="btx"><b>${esc(n.title)}</b><span>${esc(n.body)}</span><small>${esc(whenText(n.at, now))}</small></span>`
    + `${join ? '<span class="bjoin">Join</span>' : ''}${n.id > seenId ? '<i class="bdot" aria-label="new"></i>' : ''}</button>`;
}
export function inboxHtml(list: Notice[], seenId: number, now: number): string {
  if (!list.length) return '<p class="hint bempty" data-testid="bell-empty">Nothing yet. When a crew table starts, someone asks to join or a season ends, it shows here.</p>';
  const g = groupNotices(list, now);
  const part = (label: string, rows: Notice[]): string => (rows.length ? `<span class="sh">${label}</span>${rows.map((n) => noticeHtml(n, seenId, now)).join('')}` : '');
  return part('Today', g.today) + part('Earlier', g.earlier);
}

