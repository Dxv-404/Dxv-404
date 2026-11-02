// Everything around the table (Phase 7): settings, notifications, Report a problem, error reports, the
// privacy page.
import { h, toast } from './legacy/ui.js';
import { settings, saveSettings } from './legacy/fx.js';
import { VAPID_PUBLIC_KEY } from '@tp/protocol';
import type { Account, PushPrefs } from '@tp/account';
import { currentTheme, setTheme } from './table/screen';
import { themeSwatches } from './ui/shell';
import type { Ui } from './offline-screens';

export const APP_VERSION = '0.5.0';
const head = (title: string, back: () => void) => h('header', { class: 'page-head' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: back }, '‹'), h('h1', {}, title));
const store = {
  get<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(k) ?? 'null') as T | null; } catch { return null; } },
  set(k: string, v: unknown): void { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } },
};

/** The signed-in account on this phone, or null (guests have none). */
async function myAccount(): Promise<Account | null> {
  const me = store.get<{ account: string; name: string }>('tp-me');
  if (!me?.account) return null;
  try {
    const mod = await import('@tp/account');
    const a = new mod.Account();
    if (!(await a.hasLogin())) return null;
    await a.start(me.name);
    return a;
  } catch { return null; }
}

// ---------------------------------------------------------------- push notifications
export const pushSupported = (): boolean => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const keyBytes = (s: string) => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(t, (c) => c.charCodeAt(0)); };
const DEFAULT_PREFS: Required<PushPrefs> = { turn: true, crewTable: true, crew: true, trophies: true };

async function currentSub(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask for permission (only after a tap), subscribe this phone and tell the database what it wants. */
export async function enablePush(a: Account, prefs: PushPrefs = DEFAULT_PREFS): Promise<boolean> {
  if (!pushSupported()) { toast('This browser cannot show notifications. On iPhone, add the app to the home screen first.'); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast(perm === 'denied' ? 'Notifications are blocked for this site in the browser settings.' : 'Not turned on.'); return false; }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await a.savePush(j.endpoint, j.keys.p256dh, j.keys.auth, prefs);
  store.set('tp-push-asked', 1);
  return true;
}
async function disablePush(a: Account): Promise<void> {
  const sub = await currentSub();
  if (!sub) return;
  await a.removePush(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

/** After joining a crew, once: ask whether this phone should buzz when it is your turn. Never on first open. */
export function offerPush(ui: Ui, a: Account): void {
  if (!pushSupported() || Notification.permission !== 'default' || store.get('tp-push-asked')) return;
  store.set('tp-push-asked', 1);
  const sheet = ui.openSheet(h('div', { class: 'menu' },
    h('h2', {}, 'Get told when it’s your turn?'),
    h('p', {}, 'If you switch apps or lock your phone during a game, it buzzes when it is your turn. Also when a crew table starts and when you win a trophy. You can change this in Settings.'),
    h('div', { class: 'two' },
      h('button', { class: 'btn primary', 'data-testid': 'push-yes', onclick: async () => { sheet.close(); if (await enablePush(a)) toast('Notifications on'); } }, 'Yes, notify me'),
      h('button', { class: 'btn ghost', onclick: () => sheet.close() }, 'Not now'))), { label: 'Notifications' });
}

async function pushBlock(box: HTMLElement): Promise<void> {
  box.replaceChildren(h('p', { class: 'hint' }, 'Loading…'));
  const a = await myAccount();
  if (!a) { box.replaceChildren(h('p', { class: 'hint' }, 'Notifications need an account on this phone: open Profile and crews once.')); return; }
  if (!pushSupported()) { box.replaceChildren(h('p', { class: 'hint' }, 'This browser cannot show notifications. On iPhone, add Train Poker to the home screen first, then open it from there.')); return; }
  const sub = await currentSub();
  const prefs: PushPrefs | null = sub && Notification.permission === 'granted' ? await a.myPush(sub.endpoint).catch(() => null) : null;
  const on = !!prefs;
  const p = { ...DEFAULT_PREFS, ...(prefs ?? {}) };
  const sw = (key: keyof PushPrefs, label: string) => h('label', { class: 'switch-row' }, h('span', {}, label),
    h('input', { type: 'checkbox', role: 'switch', checked: p[key] ? true : null, onchange: async (e: Event) => {
      p[key] = (e.target as HTMLInputElement).checked;
      try { const j = sub!.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }; await a.savePush(j.endpoint, j.keys.p256dh, j.keys.auth, p); } catch (err) { toast((err as Error).message); }
    } }));
  box.replaceChildren(
    h('label', { class: 'switch-row' }, h('span', {}, 'Notifications on this phone', h('small', {}, Notification.permission === 'denied' ? 'Blocked in the browser settings' : 'A buzz when the app is in the background')),
      h('input', { type: 'checkbox', role: 'switch', 'data-testid': 'push-toggle', checked: on ? true : null, disabled: Notification.permission === 'denied' ? true : null, onchange: async (e: Event) => {
        const want = (e.target as HTMLInputElement).checked;
        try { if (want) await enablePush(a, p); else await disablePush(a); } catch (err) { toast((err as Error).message); }
        void pushBlock(box);
      } })),
    ...(on ? [sw('turn', 'Your turn'), sw('crewTable', 'A crew table started'), sw('crew', 'Approved into a crew'), sw('trophies', 'Trophies and season ends')] : []));
}

// ---------------------------------------------------------------- settings
export function settingsScreen(ui: Ui): void {
  ui.screen((el) => {
    el.className = 'screen settings';
    const save = () => saveSettings();
    const sw = (key: 'holdToPeek' | 'fourColor' | 'sound' | 'haptics' | 'largeText', label: string, hint?: string) => h('label', { class: 'switch-row' }, h('span', {}, label, hint ? h('small', {}, hint) : null),
      h('input', { type: 'checkbox', role: 'switch', 'data-testid': `set-${key}`, checked: settings[key] ? true : null, onchange: (e: Event) => { (settings as Record<string, unknown>)[key] = (e.target as HTMLInputElement).checked; save(); } }));
    const seg = (key: 'motion' | 'winFx', label: string, opts: [string, string][]) => {
      const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
      const draw = () => wrap.replaceChildren(...opts.map(([v, t]) => h('button', { role: 'radio', 'data-testid': `set-${key}-${v}`, 'aria-checked': settings[key] === v ? 'true' : 'false', class: settings[key] === v ? 'on' : '', onclick: () => { (settings as Record<string, unknown>)[key] = v; save(); draw(); } }, t)));
      draw();
      return h('div', { class: 'field' }, h('span', {}, label), wrap);
    };
    const themes = themeSwatches((k) => setTheme(k));
    const pushBox = h('div', {});
    el.append(head('Settings', ui.home),
      h('section', { class: 'block' }, h('h2', {}, 'Theme'), themes,
        h('button', { class: 'btn ghost small', 'data-testid': 'open-picker', onclick: () => (window as unknown as { __tpPicker?: () => void }).__tpPicker?.() }, 'See it on every screen')),
      h('section', { class: 'block' }, h('h2', {}, 'At the table'),
        sw('holdToPeek', 'Hold to see my cards', 'Off: your cards are shown face up on your screen'),
        sw('fourColor', 'Four-colour deck', 'Diamonds blue, clubs green'),
        sw('sound', 'Sounds'), sw('haptics', 'Vibration'),
        sw('largeText', 'Large text', 'Names, chips and buttons 15% bigger'),
        seg('motion', 'Motion', [['full', 'Full'], ['calm', 'Calm'], ['off', 'Off']]),
        seg('winFx', 'Win animations', [['all', 'All'], ['big', 'Big hands only'], ['off', 'Off']]),
        h('p', { class: 'hint small' }, 'Reduce motion in your phone’s settings also turns motion off.')),
      h('section', { class: 'block' }, h('h2', {}, 'Notifications'), pushBox),
      h('section', { class: 'block' }, h('h2', {}, 'Help'),
        h('button', { class: 'btn ghost', 'data-testid': 'open-report', onclick: () => reportScreen(ui, () => settingsScreen(ui)) }, 'Report a problem'),
        h('button', { class: 'btn ghost', 'data-testid': 'open-hands', onclick: () => (window as unknown as { __tpHands?: () => void }).__tpHands?.() }, 'Poker hands'),
        h('button', { class: 'btn ghost', 'data-testid': 'open-privacy', onclick: () => privacyScreen(ui, () => settingsScreen(ui)) }, 'Privacy'),
        h('p', { class: 'hint small' }, `Train Poker ${APP_VERSION}`)));
    void pushBlock(pushBox);
  });
}

// ---------------------------------------------------------------- Report a problem
let lastScreen = 'home';
export const noteScreen = (name: string): void => { lastScreen = name; };

export function reportScreen(ui: Ui, back: () => void = ui.home): void {
  ui.screen((el) => {
    el.className = 'screen report';
    const text = h('textarea', { rows: 6, maxlength: 2000, 'aria-label': 'What happened', placeholder: 'What happened, and what did you expect?', 'data-testid': 'report-text' }) as HTMLTextAreaElement;
    const send = h('button', { class: 'btn primary', 'data-testid': 'report-send', onclick: async () => {
      const msg = text.value.trim();
      if (msg.length < 5) return toast('Say a little more about what happened.');
      (send as HTMLButtonElement).disabled = true;
      try {
        await sendReport('report', msg, { screen: lastScreen, size: `${innerWidth}x${innerHeight}`, ua: navigator.userAgent.slice(0, 200), theme: currentTheme(), online: navigator.onLine });
        toast('Thanks! Dev will see it.');
        back();
      } catch (err) {
        (send as HTMLButtonElement).disabled = false;
        toast(navigator.onLine ? (err as Error).message : 'No internet: try again when you are online.');
      }
    } }, 'Send');
    el.append(head('Report a problem', back),
      h('section', { class: 'block' },
        h('label', { class: 'field' }, h('span', {}, 'What happened'), text),
        h('p', { class: 'hint small' }, 'Sent with your phone’s screen size, browser and the app version, so it can be reproduced. No cards or chat.'),
        send));
  });
}

async function rpcAnon(fn: string, args: Record<string, unknown>): Promise<void> {
  const { SUPABASE_URL, SUPABASE_KEY } = await import('@tp/account/ticket');
  const a = await myAccount().catch(() => null);
  if (a) { const { error } = await a.db.rpc(fn, args); if (error) throw new Error(error.message); return; }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? 'Could not send');
}
const sendReport = (kind: 'report' | 'error', message: string, context: object) => rpcAnon('report_problem', { p_kind: kind, p_message: message, p_context: context, p_version: APP_VERSION });

/** Errors the app hits are sent (each one once a session, at most 5 a session), so bugs are seen without anyone reporting them. */
export function installErrorReporting(): void {
  const seen = new Set<string>();
  const report = (msg: string, stack?: string) => {
    const key = msg.slice(0, 200);
    if (!msg || seen.has(key) || seen.size >= 5 || !navigator.onLine) return;
    if (/ResizeObserver loop|Script error\.?$|NetworkError|Failed to fetch|Load failed|AbortError/i.test(msg)) return; // browser noise
    seen.add(key);
    void sendReport('error', msg.slice(0, 500), { stack: (stack ?? '').slice(0, 1500), screen: lastScreen, ua: navigator.userAgent.slice(0, 200) }).catch(() => undefined);
  };
  window.addEventListener('error', (e) => report(String(e.message ?? e.error ?? ''), (e.error as Error | undefined)?.stack));
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason as Error | string | undefined; report(typeof r === 'string' ? r : String(r?.message ?? r ?? ''), typeof r === 'object' ? r?.stack : undefined); });
}

// ---------------------------------------------------------------- privacy
export function privacyScreen(ui: Ui, back: () => void = ui.home): void {
  ui.screen((el) => {
    el.className = 'screen privacy';
    const p = (t: string) => h('p', {}, t);
    el.append(head('Privacy', back), h('section', { class: 'block prose', 'data-testid': 'privacy' },
      h('h2', {}, 'What Train Poker keeps'),
      p('Play money only: there is no real money, no buying chips and no prizes. It is for friends playing together.'),
      p('Without an account nothing about you leaves your phone except what a table needs while you play (your table name and your moves). Offline games stay on the phones at the table until the host phone uploads them.'),
      p('With an account (made the first time you open Profile and crews): your name, the crews you are in, your games, hands and results, and the cards you were dealt (only you can see your own; others see only cards shown at showdown). Your phones are kept as logins, without phone numbers or emails.'),
      p('Push notifications: if you turn them on, your browser gives the app an address to push to. It is deleted when you turn notifications off.'),
      p('Report a problem and app errors: what you write, your screen size, browser and the app version. Kept for 180 days.'),
      p('Replays of hands are kept for 90 days, except hands that won a trophy. Accounts never used are removed after 90 days.'),
      h('h2', {}, 'Who can see it'),
      p('Your crew sees the crew’s league, its games and their results. Nobody else does. The data is stored with Supabase (in Mumbai); live tables run on Oracle Cloud (Hyderabad) and Cloudflare. Nothing is sold or shared, and there are no ads or trackers.'),
      h('h2', {}, 'Leaving'),
      p('Profile and crews → Delete my account removes your name, logins and cards; your results stay in your crews’ history as “Former player”, so the league still adds up.'),
      p('Questions: devkrishna6780@gmail.com')));
  });
}
