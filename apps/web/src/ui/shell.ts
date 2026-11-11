// The app around the table, built from the signed-off design (tools/design/gen, exported to screens.json):
// the themed shell every screen sits in, the first-open loading screen, the main menu with its bottom bar,
// and the theme picker that shows a theme on every kind of screen before you choose it.
import screensJson from './screens.json';
import { THEMES, THEME_KEYS, sprite, renderTable, avatar, card, back, type ThemeKey } from '../table/render';
import { currentTheme, setTheme, loadDesignCss } from '../table/screen';
import type { ScreenView } from '../net-table';
import { Engine, sha256hex } from '@tp/engine';
import { settings } from '../legacy/fx.js';
import { myAvatar, preloadMine } from '../avatars';

interface Piece { bg: string; logo: string; extra: string; css: string }
interface ThemeScreens { name: string; tagline: string; swatch: { bg: string; felt: string; rim: string; acc: string; tx: string }; loading: Piece; menu: Piece; lapBg: string }
const S = screensJson as unknown as { menuCss: string; pickerCss: string; themes: Record<ThemeKey, ThemeScreens> };

const store = {
  get<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(k) ?? 'null') as T | null; } catch { return null; } },
  set(k: string, v: unknown): void { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } },
};
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

// ---------------------------------------------------------------- the shell
let view: HTMLElement | null = null;

/** Puts the whole app inside the player's theme: its background art, its card and avatar art, its tokens. */
export function initShell(app: HTMLElement): HTMLElement {
  loadDesignCss();
  app.classList.add('tp', 'app');
  const fx = el('div', 'fx'); fx.setAttribute('aria-hidden', 'true');
  const spr = el('div', 'tp-sprite');
  view = el('div'); view.id = 'view';
  app.replaceChildren(fx, spr, view);
  const apply = (): void => {
    const k = currentTheme();
    for (const t of THEME_KEYS) app.classList.toggle(`th-${t}`, t === k);
    fx.innerHTML = S.themes[k].menu.bg;
    spr.innerHTML = sprite(k);
    themeCss(k);
    document.documentElement.style.setProperty('--app-bg', S.themes[k].swatch.bg);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', S.themes[k].swatch.bg);
  };
  apply();
  window.addEventListener('tp-theme', apply);
  return view;
}

/** Shows theme k on screen without making it the player's theme (the picker's preview): its tokens and art
 *  stylesheet, its card and avatar sprite, its background. setTheme / the 'tp-theme' event puts the real one back. */
export function showTheme(k: ThemeKey): void {
  const app = document.getElementById('app');
  if (!app) return;
  for (const t of THEME_KEYS) app.classList.toggle(`th-${t}`, t === k);
  let link = document.getElementById('tp-theme-css') as HTMLLinkElement | null;
  if (!link) { link = document.createElement('link'); link.id = 'tp-theme-css'; link.rel = 'stylesheet'; document.head.append(link); }
  const href = `/tp/${THEMES[k]!.css}`;
  if (link.getAttribute('href') !== href) link.href = href;
  const fx = app.querySelector(':scope > .fx') as HTMLElement | null;
  if (fx) fx.innerHTML = S.themes[k].menu.bg;
  const spr = app.querySelector(':scope > .tp-sprite') as HTMLElement | null;
  if (spr) spr.innerHTML = sprite(k);
  themeCss(k);
  document.documentElement.style.setProperty('--app-bg', S.themes[k].swatch.bg);
}

/** Each theme's own extra CSS for its menu and loading art (some themes animate their backgrounds). */
function themeCss(k: ThemeKey): void {
  let tag = document.getElementById('tp-screen-css') as HTMLStyleElement | null;
  if (!tag) { tag = el('style'); tag.id = 'tp-screen-css'; document.head.append(tag); }
  const t = S.themes[k];
  tag.textContent = t.menu.css + (t.loading.css === t.menu.css ? '' : t.loading.css);
}

// ---------------------------------------------------------------- loading (first open only)
/** The theme's loading screen: the card helix, the logo, the bar. Plays on first open only; a tap skips it. */
export function loadingScreen(done: () => void): void {
  if (store.get('tp-loaded') || matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }
  const k = currentTheme();
  const t = S.themes[k];
  const codes = ['As', null, 'Kh', null, 'Qd', null, 'Jc', null, 'Ts', null, '9h', null, '8d', null];
  const helix = codes.map((c, i) => (c ? card(c, 80) : back(80)).replace('style="', `style="--i:${i};`)).join('');
  // the design is composed for a 390 x 844 phone: it is drawn on a stage that size, scaled to fit and centred,
  // with the theme's background filling the rest of a wider or shorter screen
  const w = el('div', `tp ldwrap th-${k}`,
    `<div class="tp ldstage loading th-${k}"><div class="fx" aria-hidden="true">${t.loading.bg}</div><div class="ld" aria-hidden="true"><div class="helix">${helix}</div></div>`
    + `<div class="logo">${t.loading.logo}</div>${t.loading.extra}<div class="ldbar"><i></i></div><p class="ldcap">Shuffling the deck</p><p class="skip">Plays on first open only · tap to skip</p></div>`);
  w.setAttribute('role', 'status'); w.setAttribute('aria-label', 'Train Poker is loading');
  const stage = w.querySelector('.ldstage') as HTMLElement;
  const fit = (): void => {
    const s = Math.min(innerWidth / 390, innerHeight / 844);
    stage.style.transform = `translate(-50%,-50%) scale(${s.toFixed(4)})`;
    stage.classList.toggle('framed', innerWidth > 390 * s + 24); // a wide screen: the stage is a card on the theme's colour
  };
  fit(); addEventListener('resize', fit);
  document.body.append(w);
  // the logo sits between the top of the screen and the bar on every screen size (the design's is placed for a
  // 390 x 844 phone; a tall logo on a short or sideways screen would run into the bar and caption)
  void document.fonts.ready.then(() => requestAnimationFrame(() => fitLogo(stage)));
  let over = false;
  const finish = (): void => {
    if (over) return; over = true;
    store.set('tp-loaded', 1);
    w.classList.add('out');
    setTimeout(() => { w.remove(); removeEventListener('resize', fit); }, 360);
    done();
  };
  w.addEventListener('click', finish);
  setTimeout(finish, 6000); // one turn of the helix and the bar
}

function fitLogo(w: HTMLElement): void {
  const logo = w.querySelector('.logo') as HTMLElement | null, lg = w.querySelector('.logo .lg') as HTMLElement | null, bar = w.querySelector('.ldbar') as HTMLElement | null;
  if (!logo || !lg || !bar) return;
  const room = (): number => bar.getBoundingClientRect().top - 24 - logo.getBoundingClientRect().top;
  const h = lg.getBoundingClientRect().height;
  if (h <= room()) return;
  logo.style.top = '68px'; // higher up first
  const k = Math.min(1, room() / h);
  if (k < 1) { lg.style.transform = `scale(${k.toFixed(3)})`; lg.style.transformOrigin = 'top center'; }
}

// ---------------------------------------------------------------- main menu
export interface MenuActions {
  joinOnline(code: string): void; joinOffline(): void; host(): void;
  profile(): void; settings(): void; crew(id: string): void; rejoin(code: string): void; resumeHost?: { sub: string; go: () => void };
  crews(): void; replays(): void; theme(): void; play?: () => void;
  /** the Profile tab (the page of cards, achievements and graphs); `profile` is the account screen */
  profileTab?: () => void;
  /** the notifications bell (a button with its unread badge) */
  bell?: () => HTMLElement;
}
export type Tab = 'play' | 'crews' | 'profile' | 'replays' | 'theme';

/** The Profile tab's own mark: a card with a figure on it (drawn here; the themes draw theirs with the card art). */
const PROFILE_ICON = '<svg viewBox="0 0 20 20" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><rect x="3.6" y="1.6" width="12.8" height="16.8" rx="2"/><circle cx="10" cy="8" r="2.6"/><path d="M6 15.4c.6-2.3 2.1-3.4 4-3.4s3.4 1.1 4 3.4" stroke-linecap="round"/></svg>';
/** The five places of the app, in the bar's order. `crews` and `profile` may be given their own action (a
 *  screen that is already that tab goes to its own top). */
function tabs(a: MenuActions): [Tab, string, string, () => void][] {
  return [['play', '♠', 'Play', a.play ?? (() => undefined)], ['crews', '⬢', 'Crews', a.crews], ['profile', PROFILE_ICON, 'Profile', a.profileTab ?? a.profile], ['replays', '↺', 'Replays', a.replays], ['theme', '◐', 'Theme', a.theme]];
}
/** New achievements since the profile was last opened (kept on the phone by the Profile page). */
const profileNews = (): number => store.get<number>('tp-profile-news') ?? 0;

/** The bottom bar of the menu screens: Play · Crews · Profile · Replays · Theme. The Crews tab carries the
 *  number of invitations and requests waiting; the Profile tab a dot when there is a new achievement. */
export function navBar(on: Tab, a: MenuActions): HTMLElement {
  const n = el('nav', 'nav'); n.setAttribute('aria-label', 'Main');
  if (settings.motion === 'off') n.dataset.motion = 'off'; // the tab underline appears at once
  const waiting = store.get<number>('tp-crews-badge') ?? 0;
  for (const [k, icon, label, go] of tabs(a)) {
    const badge = k === 'crews' && waiting > 0 ? `<b class="bdg" aria-label="${waiting} waiting">${waiting > 9 ? '9+' : waiting}</b>`
      : k === 'profile' && k !== on && profileNews() > 0 ? '<b class="bdg dot" aria-label="New achievement"></b>' : '';
    const b = el('button', k === on ? 'on' : '', `<i aria-hidden="true">${icon}</i>${label}${badge}`);
    b.dataset.testid = `nav-${k}`;
    if (k === on) b.setAttribute('aria-current', 'page');
    b.addEventListener('click', () => { if (k !== on) go(); });
    n.append(b);
  }
  return n;
}

/** The same five places as a rail down the left: sideways phones (icons only) and laptops (with the logo
 *  and names). `again` runs when the open tab itself is pressed (back to its first screen). */
export function railBar(on: Tab, a: MenuActions, withLogo: boolean, again?: () => void): HTMLElement {
  const me = store.get<{ account: string; name: string }>('tp-me');
  const name = me?.name ?? (localStorage.getItem('tp-name') || 'Player');
  const n = el('nav', 'rail' + (withLogo ? ' w' : ''));
  n.setAttribute('aria-label', 'Main');
  n.innerHTML = `<div class="rlogo">${withLogo ? S.themes[currentTheme()]?.menu.logo ?? '' : ''}</div>`;
  for (const [k, icon, label, go] of tabs(a)) {
    const b = el('button', k === on ? 'on' : '', `<i aria-hidden="true">${icon}</i><span>${label}</span>`);
    b.type = 'button'; b.dataset.testid = `rail-${k}`; b.setAttribute('aria-label', label);
    if (k === on) b.setAttribute('aria-current', 'page');
    b.addEventListener('click', () => (k === on ? again?.() : go()));
    n.append(b);
  }
  const who = el('button', 'rme', `<span class="av" style="--av:34px">${avatar(THEMES[currentTheme()]!, me?.account ?? `guest-${name}`, name, myAvatar())}</span>${withLogo ? `<b>${esc(name)}</b>` : ''}`);
  who.type = 'button'; who.setAttribute('aria-label', 'Account');
  who.addEventListener('click', a.profile);
  n.append(el('span', 'sp'), who);
  return n;
}

/** The theme's main menu, filled with this phone's own data. */
export function menuScreen(root: HTMLElement, a: MenuActions & { onPlay?: never }): void {
  const k = currentTheme();
  const t = S.themes[k];
  const th = THEMES[k]!;
  const me = store.get<{ account: string; name: string }>('tp-me');
  const name = me?.name ?? (localStorage.getItem('tp-name') || 'Player');
  const crews = store.get<{ id: string; name: string; members?: { id: string; name: string; avatar?: string | null }[]; count?: number; season?: number; live?: boolean }[]>('tp-crews') ?? [];
  const last = store.get<{ code: string; at: number }>('tp-online-last');
  const lastMin = last ? Math.floor((Date.now() - last.at) / 60_000) : null;
  root.className = 'screen menu with-nav';
  const mm = el('div', 'mm');

  // your avatar (or initials): tapping the picture opens "Choose your avatar", the rest of the row your profile
  const meBtn = el('button', 'me', `<span class="av" data-testid="menu-avatar">${avatar(th, me?.account ?? `guest-${name}`, name, myAvatar())}</span><span><b>${esc(name)}</b><small>Tap to change name or picture</small></span>`);
  meBtn.dataset.testid = 'open-profile';
  meBtn.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.av')) { void openPicker(() => { if (root.isConnected) menuScreen(root, a); }); return; }
    a.profile();
  });
  preloadMine();
  const gear = el('button', 'ib', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>');
  gear.setAttribute('aria-label', 'Settings'); gear.dataset.testid = 'open-settings';
  gear.addEventListener('click', a.settings);
  const meRow = el('div', 'me-row'); meRow.style.cssText = 'display:flex;align-items:center;gap:12px';
  meBtn.style.flex = '1';
  meRow.append(meBtn, ...(a.bell ? [a.bell()] : []), gear);

  // Join a table: four code boxes typed through one hidden field (letters and numbers, no 0/O or 1/I mix-ups)
  const join = el('div', 'card2', '<h2>Join a table</h2>');
  const slots = el('label', 'slots');
  const input = el('input');
  Object.assign(input, { type: 'text', maxLength: 4, autocomplete: 'off', spellcheck: false, inputMode: 'text' });
  input.setAttribute('autocapitalize', 'characters'); input.setAttribute('aria-label', 'Table code'); input.dataset.testid = 'online-code';
  const boxes = [0, 1, 2, 3].map(() => el('span'));
  slots.append(...boxes, input);
  const draw = (): void => {
    const v = input.value;
    boxes.forEach((b, i) => { b.textContent = v[i] ?? ''; b.className = v[i] ? 'f' : (i === v.length && document.activeElement === input ? 'c' : ''); });
  };
  input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 4); draw(); });
  input.addEventListener('focus', draw); input.addEventListener('blur', draw);
  const go = (): void => { if (input.value.length === 4) a.joinOnline(input.value); else { input.focus(); slots.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 220 }); } };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  const joinBtn = el('button', 'bigb p', 'Join'); joinBtn.dataset.testid = 'online-join'; joinBtn.addEventListener('click', go);
  const offl = el('button', 'alt', 'Joining an offline table? Use its 5-number code'); offl.dataset.testid = 'play-offline'; offl.addEventListener('click', a.joinOffline);
  join.append(slots, joinBtn, offl);
  draw();

  const or = el('p', 'or', 'OR');
  const host = el('button', 'bigb s', 'Host a new table'); host.dataset.testid = 'play-online'; host.addEventListener('click', a.host);

  mm.append(meRow, el('div', 'lgw', t.menu.logo), join, or, host);

  if (crews.length) {
    mm.append(el('span', 'sh', 'Your crews'));
    for (const c of crews.slice(0, 4)) {
      const members = (c.members ?? []).slice(0, 4);
      const stk = members.length ? `<span class="stk">${members.map((m) => `<span class="av">${avatar(th, m.id, m.name, m.avatar)}</span>`).join('')}</span>` : `<span class="stk"><span class="av">${avatar(th, c.id, c.name)}</span></span>`;
      const sub = [c.count ? `${c.count} friend${c.count === 1 ? '' : 's'}` : '', c.season ? `season ${c.season}` : ''].filter(Boolean).join(' · ') || 'League and history';
      const row = el('button', 'crew', `${stk}<b>${esc(c.name)}<small>${esc(sub)}</small></b>${c.live ? '<span class="live">LIVE</span>' : ''}`);
      row.addEventListener('click', () => a.crew(c.id));
      mm.append(row);
    }
  }
  if (last && lastMin !== null && lastMin < 12 * 60) {
    const when = lastMin < 1 ? 'just now' : lastMin < 60 ? `${lastMin} min ago` : `${Math.floor(lastMin / 60)} h ago`;
    const rj = el('button', 'rejoin', `<span class="dot"></span><span><b>You left table ${esc(last.code)} ${when}</b><small>Your seat and chips are kept while the table is open</small></span><span class="rj">Rejoin</span>`);
    rj.dataset.testid = 'online-back';
    rj.addEventListener('click', () => a.rejoin(last.code));
    mm.append(rj);
  }
  if (a.resumeHost) {
    const rh = el('button', 'rejoin', `<span class="dot"></span><span><b>Resume your table</b><small>${esc(a.resumeHost.sub)}</small></span><span class="rj">Resume</span>`);
    rh.dataset.testid = 'resume-host';
    rh.setAttribute('aria-label', 'Resume your table');
    const go = a.resumeHost.go;
    rh.addEventListener('click', () => go());
    mm.append(rh);
  }
  mm.insertAdjacentHTML('beforeend', t.menu.extra);
  root.replaceChildren(mm, navBar('play', a));
  // some themes style the menu by the theme and menu classes on one element (the design's single page)
  document.getElementById('app')?.classList.add('menu');
  if (!refreshing && me?.account) void refreshCrews().then((changed) => { if (changed && root.isConnected) menuScreen(root, a); });
  // new achievements since the profile was last opened: the Profile tab gets its dot
  if (me?.account) void import('../crews/data').then((d) => d.existing()).then((acc) => acc?.profileNews()).then((n) => {
    if (typeof n !== 'number' || n === profileNews()) return;
    store.set('tp-profile-news', n);
    if (root.isConnected) root.querySelector(':scope > nav.nav')?.replaceWith(navBar('play', a));
  }).catch(() => undefined);
}

/** "Choose your avatar" (loaded when first opened); signed-in phones keep the pick on their account. */
export async function openPicker(onSaved?: () => void): Promise<void> {
  const [{ openAvatarPicker }, data] = await Promise.all([import('../avatars/picker'), import('../crews/data')]);
  const me = store.get<{ account: string }>('tp-me');
  await openAvatarPicker({ account: () => (me?.account ? data.existing() : Promise.resolve(null)), onSaved: () => onSaved?.() });
}

/** Leaving the menu (the shell calls this before any other screen). */
export const leaveMenu = (): void => { document.getElementById('app')?.classList.remove('menu'); };

/** Signed-in phones: the crews with their first members, size, season and LIVE table, for the menu's crew rows
 *  (kept for next time), and the Crews tab's number. */
let refreshing = false;
async function refreshCrews(): Promise<boolean> {
  refreshing = true;
  try {
    const me = store.get<{ account: string; name: string }>('tp-me');
    if (!me?.account || !navigator.onLine) return false;
    const data = await import('../crews/data');
    const acc = await data.existing();
    if (!acc) return false;
    const now = (): string => [localStorage.getItem('tp-crews'), localStorage.getItem('tp-crews-badge'), localStorage.getItem('tp-avatar')].join('|');
    const before = now();
    await data.fetchLists(acc);
    return before !== now();
  } catch { return false; } finally { setTimeout(() => { refreshing = false; }, 30_000); }
}

/** The design's theme swatches (the picker's 3x3 grid), as a radio group; `pick` runs on a choice. */
export function themeSwatches(pick: (k: ThemeKey) => void): HTMLElement {
  const g = el('div', 'pk-themes'); g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', 'Theme');
  const draw = (): void => {
    const on = currentTheme();
    g.innerHTML = THEME_KEYS.map((key) => { const t = S.themes[key]; return `<button class="${key === on ? 'on' : ''}" data-theme="${key}" role="radio" aria-checked="${key === on}" style="background:${t.swatch.bg};color:${t.swatch.tx}"><i style="background:${t.swatch.felt};box-shadow:0 0 0 3px ${t.swatch.rim}"></i>${esc(t.name)}</button>`; }).join('');
  };
  g.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button[data-theme]') as HTMLElement | null; if (!b) return; pick(b.dataset.theme as ThemeKey); draw(); });
  draw();
  return g;
}

// ---------------------------------------------------------------- theme picker
const NAMES = ['Dev', 'Aditya', 'Sneha', 'Kabir', 'Meera', 'Arjun', 'Ishaan', 'Tara', 'Riya', 'Zoya', 'Rohan', 'Vikram', 'Nisha', 'Kunal', 'Priya'];
const sampleCache = new Map<number, ScreenView>();
/** A real table from the engine (the flop, a bet, your turn): the previews are layouts, not pictures. */
function sampleView(n: number): ScreenView {
  const hit = sampleCache.get(n);
  if (hit) return hit;
  const e = Engine.create('preview', { startStack: 2000, turnTime: 20, maxPlayers: 15 }, 0);
  for (let i = 0; i < n; i++) { e.apply({ t: 'join', id: `p${i}`, name: NAMES[i]!, now: 0 }); e.apply({ t: 'presence', pid: `p${i}`, connected: true, now: 0 }); }
  e.apply({ t: 'start', seed: sha256hex(`preview-${n}`), now: 1 });
  let k = 0;
  while (e.s.hand!.street === 'preflop' && e.s.hand!.toAct) { const pid = e.s.hand!.toAct; e.apply({ t: 'act', pid, action: k++ === 1 && n > 3 ? { type: 'fold' } : { type: e.legal(pid)!.canCheck ? 'check' : 'call' }, now: 2 }); }
  for (let i = 0; i < 3 && e.s.hand!.toAct && e.s.hand!.toAct !== 'p0'; i++) {
    const pid = e.s.hand!.toAct; const L = e.legal(pid)!;
    e.apply({ t: 'act', pid, action: i === 0 && L.canRaise ? { type: 'bet', to: L.minTo * 3 } : { type: L.canCheck ? 'check' : 'call' }, now: 3 });
  }
  const v = { ...(e.viewFor('p0') as unknown as ScreenView), isHost: true, hostId: 'p0', turnLeft: 14000, turnTotal: 20000, nextIn: 0 } as ScreenView;
  sampleCache.set(n, v);
  return v;
}

/** One preview: the table at W x H drawn by the game's own renderer, scaled into a box. */
function mini(k: ThemeKey, W: number, H: number, n: number, bw: number, bh: number, label: string): string {
  const s = Math.min(bw / W, bh / H);
  const f = renderTable(sampleView(n), k, W, H, { peek: false, bubble: null, code: 'QK7P', net: 'good' });
  return `<figure class="pk-m"><div class="pk-f" style="width:${Math.round(W * s)}px;height:${Math.round(H * s)}px"><div class="pk-in" style="width:${W}px;height:${H}px;transform:scale(${s.toFixed(4)})">${f.html}</div></div><figcaption>${label}</figcaption></figure>`;
}

/** "Theme": pick one, see it on every screen size with your usual number of players, then Use it. */
export function pickerScreen(root: HTMLElement, back: () => void, a: MenuActions): void {
  let chosen: ThemeKey = currentTheme();
  let players = store.get<number>('tp-picker-players') ?? 10;
  let shown = 0;
  const SIZES: [string, number, number][] = [['Phone', 390, 844], ['Sideways', 844, 390], ['Tablet', 820, 1180], ['Laptop', 1440, 900]];
  root.className = 'screen picker';
  const render = (): void => {
    // preview the chosen theme on this screen only (the app's own theme changes when you press Use)
    showTheme(chosen);
    const sw = (key: ThemeKey, cls: string): string => { const t = S.themes[key]; return `<button class="${cls}${key === chosen ? ' on' : ''}" data-theme="${key}" role="radio" aria-checked="${key === chosen}" style="background:${t.swatch.bg};color:${t.swatch.tx}"><i style="background:${t.swatch.felt};box-shadow:0 0 0 3px ${t.swatch.rim}"></i>${esc(t.name)}</button>`; };
    const seg = (vals: [string, string][], on: string, attr: string): string => `<div class="pk-seg" role="radiogroup">${vals.map(([v, l]) => `<button class="${v === on ? 'on' : ''}" ${attr}="${v}" role="radio" aria-checked="${v === on}">${l}</button>`).join('')}</div>`;
    const strip = SIZES.map(([l, W, H]) => mini(chosen, W, H, players, W > H ? 300 : 150, 300, l)).join('');
    const name = S.themes[chosen].name;
    const list = THEME_KEYS.map((key) => { const t = S.themes[key]; return `<button class="${key === chosen ? 'on' : ''}" data-theme="${key}"><i style="background:${t.swatch.felt};box-shadow:0 0 0 2px ${t.swatch.rim}"></i>${esc(t.name)}</button>`; }).join('');
    const big = '<div class="pk-row">' + mini(chosen, 390, 844, players, 170, 340, 'Phone · 390 × 844') + mini(chosen, 820, 1180, players, 240, 340, 'Tablet · 820 × 1180') + mini(chosen, 1440, 900, players, 420, 340, 'Laptop · 1440 × 900') + '</div>'
      + '<div class="pk-row">' + mini(chosen, 844, 390, players, 360, 210, 'Phone sideways · 844 × 390') + mini(chosen, 360, 740, players, 105, 210, 'Small phone · 360 × 740') + mini(chosen, 1920, 1080, players, 360, 210, 'Desktop · 1920 × 1080') + '</div>';
    const counts: [string, string][] = [['2', '2'], ['6', '6'], ['10', '10'], ['15', '15']];
    root.innerHTML = `<div class="pk-ph">`
      + `<div class="pk-hd"><button class="ib" data-x="back" aria-label="Back">‹</button><b>Theme</b></div>`
      + `<div class="pk-themes" role="radiogroup" aria-label="Themes">${THEME_KEYS.map((key) => sw(key, '')).join('')}</div>`
      + `<span class="pk-lbl">See it on</span>${seg(SIZES.map(([l], i) => [String(i), l] as [string, string]), String(shown), 'data-size')}`
      + `<div class="pk-strip" data-testid="pk-strip">${strip}</div>`
      + `<div class="pk-dots">${SIZES.map((_, i) => `<i class="${i === shown ? 'on' : ''}"></i>`).join('')}</div>`
      + `<span class="pk-lbl">Players at the table</span>${seg(counts, String(players), 'data-n')}`
      + `<button class="pk-use" data-x="use" data-testid="theme-use">Use ${esc(name)}</button><p class="pk-note">Only your screen changes. Swipe the preview to see every screen size.</p></div>`
      + `<div class="pk-lap"><div class="pk-list"><b>Theme</b>${list}<p class="pk-note" style="text-align:left;margin-top:8px">Each player picks their own. It only changes your screen.</p><button class="btn ghost small" data-x="back" style="margin-top:8px">Back</button></div>`
      + `<div class="pk-grid"><div class="pk-top"><span class="pk-lbl">Players</span>${seg(counts, String(players), 'data-n')}<span class="sp"></span><button class="pk-use" data-x="use" style="width:200px">Use ${esc(name)}</button></div><div class="pk-fit">${big}</div></div></div>`;
    void a;
    fitBig();
    const strip2 = root.querySelector('.pk-strip') as HTMLElement;
    const figs = [...strip2.querySelectorAll('.pk-m')] as HTMLElement[];
    figs[shown]?.scrollIntoView({ block: 'nearest', inline: 'start' });
    strip2.addEventListener('scroll', () => {
      const i = figs.reduce((best, f, j) => (Math.abs(f.offsetLeft - strip2.scrollLeft) < Math.abs(figs[best]!.offsetLeft - strip2.scrollLeft) ? j : best), 0);
      if (i !== shown) { shown = i; root.querySelectorAll('.pk-dots i').forEach((d, j) => d.classList.toggle('on', j === i)); root.querySelectorAll('[data-size]').forEach((b) => { const on = (b as HTMLElement).dataset.size === String(i); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }); }
    }, { passive: true });
  };
  // the laptop dialog's previews shrink together to fit the window instead of spilling past the dialog
  const fitBig = (): void => {
    const box = root.querySelector('.pk-fit') as HTMLElement | null;
    if (!root.isConnected) { window.removeEventListener('resize', fitBig); return; }
    if (!box || !box.offsetParent) return;
    box.style.zoom = '1';
    const room = (box.parentElement as HTMLElement).clientWidth;
    const need = Math.max(...[...box.querySelectorAll('.pk-row')].map((r) => [...r.children].reduce((w, c) => w + (c as HTMLElement).offsetWidth, 0) + 22 * (r.children.length - 1)));
    box.style.zoom = need > room ? String(Math.max(0.5, room / need)) : '1';
  };
  window.addEventListener('resize', fitBig);
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || !root.contains(b)) return;
    if (b.dataset.theme) { chosen = b.dataset.theme as ThemeKey; render(); return; }
    if (b.dataset.n) { players = Number(b.dataset.n); store.set('tp-picker-players', players); render(); return; }
    if (b.dataset.size) { shown = Number(b.dataset.size); render(); return; }
    if (b.dataset.x === 'use') { setTheme(chosen); back(); return; }
    if (b.dataset.x === 'back') { setTheme(currentTheme()); back(); }
  });
  render();
}
