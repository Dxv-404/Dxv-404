// Leaving, dropping out and coming back, in the theme's signed-off look and voice (tools/design/gen/presence.py):
// the "reconnecting" banner with a running clock, the "welcome back" card that says what you missed, and the
// pause card while the host phone of an offline table is out of reach.
import P from './presence.json';
import { fmt, type ThemeKey } from './render';

type Copy = { css: string; banner: string; bannerSub: string; back: string; backKicker: string; pause: string; away: string; dealer: string; seatFx: string };
const T = P.themes as Record<ThemeKey, Copy>;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const clock = (ms: number): string => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** The theme's presence CSS, once per page (and again when the theme changes). */
export function presenceCss(k: ThemeKey): void {
  let tag = document.getElementById('tp-presence-css');
  if (!tag) { tag = document.createElement('style'); tag.id = 'tp-presence-css'; document.head.append(tag); }
  const css = P.css + T[k].css;
  if (tag.textContent !== css) tag.textContent = css;
}

/** State 1: your signal dropped. */
export function bannerHtml(k: ThemeKey, since: number): string {
  const c = T[k];
  return `<div class="pz-bn pz-pnl tp-presence" role="status" data-testid="reconnecting"><span class="pz-dots" aria-hidden="true"><i></i><i></i><i></i></span><span><b>${esc(c.banner)}</b>${esc(c.bannerSub)}</span><span class="t" data-pz="clock">${clock(Date.now() - since)}</span></div>`;
}

/** State 3: the host phone of an offline table is gone; the table waits. */
export function pauseHtml(k: ThemeKey, since: number): string {
  const c = T[k];
  const dl = c.dealer ? `<p class="pz-dl">${esc(c.dealer.replace(/Riya/g, 'the host'))}</p>` : '';
  return `<div class="pz-pause tp-presence" role="status" data-testid="host-gone"><div class="pz-pc pz-pnl"><span class="pz-ring" aria-hidden="true"><span data-pz="clock">${clock(Date.now() - since)}</span></span><b>${esc(c.pause)}</b>`
    + '<small>The host phone is out of reach. Nothing is lost: the table is saved on the host phone and carries on when it is back.</small>' + dl + '</div></div>';
}

/** State 2: you are back. What happened while you were gone, and when you want to be dealt in. */
export function backHtml(k: ThemeKey, o: { name: string; missed: number; stack: number; sittingOut: boolean }): string {
  const c = T[k];
  const title = c.back.replace(/\bDev\b/, o.name);
  const items = [
    o.missed > 0 ? `${o.missed} hand${o.missed === 1 ? '' : 's'} went by: your timer checked when it was free, otherwise folded` : 'The hand carried on without you: your timer checked when it was free, otherwise folded',
    `Same seat, ${fmt(o.stack)} chips`,
    o.sittingOut ? 'You are sitting out until you deal yourself back in' : 'You are dealt in from the next hand',
  ];
  return `<div class="pz-dim" data-pz="close"></div><div class="pz-toast pz-pnl" role="dialog" aria-label="${esc(title)}" data-testid="welcome-back"><small class="k">${esc(c.backKicker)}</small><b>${esc(title)}</b>`
    + `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
    + `<div class="pz-btns"><button class="p" data-pz="in">Deal me in</button><button data-pz="out">Sit out a bit</button></div></div>`;
}

export const tickClock = (root: HTMLElement, since: number): void => { for (const e of root.querySelectorAll('[data-pz=clock]')) e.textContent = clock(Date.now() - since); };
