// The v3 crews kit (tools/design/gen/v3kit.py): crew badges, icons, avatars, sparklines, small formatting
// helpers and the motion settings every crews screen follows (the theme's easing and speed; calm and off).
import { THEMES, avatar, card as cardHtml, type ThemeKey } from '../table/render';
import { currentTheme } from '../table/screen';
import { FEEL } from '../table/motion';
import { settings } from '../legacy/fx.js';
import type { Face } from '@tp/account';

import { esc } from './format';
export * from './format';

// ---------------------------------------------------------------- icons (v3kit ICON)
export const ICON: Record<string, string> = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 21h8M9 18h6"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 13.9c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.2 1.3z"/></svg>',
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  up: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2l4 6H2z" fill="currentColor"/></svg>',
  down: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10L2 4h8z" fill="currentColor"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="11" height="15" rx="2" transform="rotate(-8 8 12)"/><rect x="10" y="4" width="11" height="15" rx="2" transform="rotate(8 15 11)"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/></svg>',
};
export const ic = (name: string, cls = 'ico'): string => `<i class="${cls}">${ICON[name] ?? ''}</i>`;

// ---------------------------------------------------------------- people
const theme = () => THEMES[currentTheme()]!;
/** A player's face: their picked avatar (in its own style) or their initials in the theme's. */
export const av = (f: Face, size = 36, cls = ''): string => `<span class="av ${cls}" style="--av:${size}px">${avatar(theme(), f.id, f.name, f.avatar)}</span>`;
export const stack = (faces: Face[], size = 26): string => `<span class="stk" style="--av:${size}px">${faces.map((f) => av(f, size)).join('')}</span>`;
export const cardImg = (code: string, w: number): string => cardHtml(code, w);
export const themeKey = (): ThemeKey => currentTheme();

// ---------------------------------------------------------------- sparkline
export function spark(vals: number[], w = 120, h = 34): string {
  const v = vals.length === 1 ? [0, vals[0]!] : vals.length ? vals : [0, 0];
  const mn = Math.min(...v), mx = Math.max(...v);
  const pts = v.map((x, i) => `${((i * w) / (v.length - 1)).toFixed(1)},${(h - 3 - ((x - mn) / (mx - mn || 1)) * (h - 6)).toFixed(1)}`).join(' ');
  return `<svg class="spk" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// ---------------------------------------------------------------- motion
export type Level = 'full' | 'calm' | 'off';
export const level = (): Level => (settings.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : settings.motion === 'calm' ? 'calm' : 'full');
/** The theme's feel on a crews root: --cw-k (speed, shorter when calm) and --cw-ease, plus data-motion. */
export function applyFeel(root: HTMLElement): void {
  const f = FEEL[currentTheme()] ?? FEEL.classic!;
  const lv = level();
  root.style.setProperty('--cw-k', String(f.k * (lv === 'calm' ? 0.6 : 1)));
  root.style.setProperty('--cw-ease', f.ease);
  root.dataset.motion = lv;
}
/** Seconds of a design animation in this theme (for timers that wait for one to end). */
export const ms = (base: number): number => (level() === 'off' ? 0 : base * (FEEL[currentTheme()]?.k ?? 1) * (level() === 'calm' ? 0.6 : 1) * 1000);

// ---------------------------------------------------------------- DOM
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
export function btn(cls: string, html: string, on: (e: MouseEvent) => void, attrs: Record<string, string> = {}): HTMLButtonElement {
  const b = el('button', cls, html);
  b.type = 'button';
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  b.addEventListener('click', on);
  return b;
}
/** The design's toast: slides in at the top, leaves after 4 s. */
export function cwToast(text: string, icon = 'check'): void {
  document.querySelectorAll('.cw-toast').forEach((t) => t.remove());
  const t = el('div', 'cw-toast', `${ic(icon)}<span>${esc(text)}</span>`);
  t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
  applyFeel(t);
  (document.getElementById('app') ?? document.body).append(t);
  setTimeout(() => t.remove(), 4200);
}
