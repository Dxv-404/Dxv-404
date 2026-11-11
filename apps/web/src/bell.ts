// The bell: a button on the home and crew screens with the number of unread notifications, and the panel it
// opens: the switch for phone notifications (with the iPhone "Add to Home Screen" steps and a test), then the
// inbox of the last 30 days. The inbox fills whether or not notifications are on, so nobody misses a table.
import type { Account, Notice, PushPrefs } from '@tp/account';
import { DEFAULT_PREFS, currentSub, disablePush, enablePush, pushSupported } from './more-screens';
import { isIos } from './crews/push-env';
import { toast } from './legacy/ui.js';
import { settings } from './legacy/fx.js';
import { R } from './research/capture';

import { bellState, inboxHtml, unreadCount, type BellState } from './bell-core';

// ---------------------------------------------------------------- what this phone remembers
const SEEN = 'tp-bell-seen', CACHE = 'tp-bell-list', ASKED = 'tp-bell-asked';
const get = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* blocked */ } };
const seen = (): number => Number(get(SEEN) || 0);
const cached = (): Notice[] => { try { return JSON.parse(get(CACHE) || '[]') as Notice[]; } catch { return []; } };
export const bellUnread = (): number => unreadCount(cached(), seen());

async function refresh(a: Account): Promise<Notice[]> {
  const list = await a.notifications();
  put(CACHE, JSON.stringify(list.slice(0, 100)));
  return list;
}

// ---------------------------------------------------------------- the button
const BELL: Record<string, string> = {
  // a line bell (most themes dress it with their own colours and glow)
  line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  // brass: a solid bell with a rim highlight
  brass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a1.4 1.4 0 0 1 1.4 1.4v.5A6 6 0 0 1 18 10.8V15l1.8 2.6c.3.5 0 1-.6 1H4.8c-.6 0-.9-.5-.6-1L6 15v-4.2A6 6 0 0 1 10.6 4.9v-.5A1.4 1.4 0 0 1 12 3z" fill="currentColor"/><path d="M8.3 10.6a3.8 3.8 0 0 1 2.3-3.4" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round"/><ellipse cx="12" cy="20.6" rx="2" ry="1.5" fill="currentColor"/></svg>',
  // ink: one loaded brush stroke for the body, a flick for the clapper
  ink: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.6 2.6c1 .1 1.5.8 1.4 1.8 3 .9 4.9 3.3 5 6.7.1 2 .3 3.6 1.9 5.6.5.7.2 1.4-.7 1.4-4.7.4-9.3.3-14.3-.1-.9-.1-1.2-.8-.6-1.5 1.5-1.7 1.9-3.3 1.9-5.3 0-3.5 1.8-6 4.5-6.8-.1-1 .2-1.7.9-1.8z" fill="currentColor"/><path d="M9.8 20.2c1.5 1.6 3.2 1.5 4.6-.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  // pixel: an 12×12 sprite, two pixels to the unit
  pixel: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M10 2h4v2h-4zM8 4h8v2H8zM6 6h12v10H6zM4 16h16v2H4zM10 20h4v2h-4z"/><path fill="#fff" fill-opacity=".5" d="M8 8h2v4H8z"/></svg>',
  // train: a station bell hanging from its bracket
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3h9a3 3 0 0 1 3 3v1"/><path d="M4 2v6"/><path d="M11 17v-4.5a5 5 0 0 1 10 0V17l1 1.5H10z" fill="currentColor" fill-opacity=".25"/><path d="M16 19v2.5"/><circle cx="16" cy="21.8" r=".9" fill="currentColor"/></svg>',
};
const bellFor = (theme: string): string => BELL[theme === 'classic' || theme === 'velvet' ? 'brass' : theme === 'ink' || theme === 'edo' ? 'ink' : theme === 'pixel' ? 'pixel' : theme === 'train' ? 'train' : 'line']!;

export interface BellCtx {
  theme(): string;
  account(): Promise<Account | null>;
  openSheet(content: HTMLElement, o?: { label?: string; onClose?: () => void; tall?: boolean }): { close(): void };
}

/** The bell button, with its unread badge (kept up to date from the account when there is one). */
export function bellButton(ctx: BellCtx): HTMLElement {
  const b = document.createElement('button');
  b.className = 'ib bellb';
  b.dataset.testid = 'open-bell';
  const draw = (ring = false): void => {
    const n = bellUnread();
    b.innerHTML = `${bellFor(ctx.theme())}${n > 0 ? `<b class="bdg">${n > 9 ? '9+' : n}</b>` : ''}`;
    b.setAttribute('aria-label', n > 0 ? `Notifications, ${n} new` : 'Notifications');
    if (ring && settings.motion !== 'off' && settings.motion !== 'calm' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring');
    }
  };
  draw();
  b.addEventListener('click', () => { void openBell(ctx, () => draw()); });
  // look for new ones (quietly: a phone with no account, or offline, just keeps what it has)
  void (async () => {
    try {
      const before = bellUnread();
      const a = await ctx.account();
      if (!a || !b.isConnected) return;
      await refresh(a);
      if (b.isConnected) draw(bellUnread() > before);
    } catch { /* offline */ }
  })();
  return b;
}

// ---------------------------------------------------------------- the panel
const PREF_LABEL: [keyof PushPrefs, string][] = [['turn', 'It’s my turn'], ['crewTable', 'A crew table started'], ['crew', 'Crew requests and approvals'], ['trophies', 'Trophies and season results']];
const emit = (kind: string, d: Record<string, unknown> = {}): void => { try { R.emit('push.prompt', { kind: `bell-${kind}`, ...d }); } catch { /* never into the app */ } };

async function envState(a: Account | null): Promise<{ state: BellState; sub: PushSubscription | null }> {
  const supported = pushSupported();
  let sub: PushSubscription | null = null;
  if (supported) { try { sub = await currentSub(); } catch { /* none */ } }
  const nav = navigator as Navigator & { standalone?: boolean };
  const state = bellState({
    account: !!a, supported, subscribed: !!sub,
    permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    ios: isIos(navigator.userAgent, navigator.maxTouchPoints || 0),
    standalone: nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches),
  });
  return { state, sub };
}

/** Open the panel. `changed` runs when the unread number changes (the button redraws its badge). */
export async function openBell(ctx: BellCtx, changed: () => void = () => undefined): Promise<void> {
  const box = document.createElement('div');
  box.className = `bellp th-${ctx.theme()}`;
  box.dataset.testid = 'bell-panel';
  box.innerHTML = '<div class="bhead"><h2>Notifications</h2><button class="blnk" data-b="readall" data-testid="bell-readall" hidden>Mark all read</button></div><section class="bsw" data-testid="bell-switch"><p class="hint">Loading…</p></section><div class="blist" data-testid="bell-list"></div>';
  const sw = box.querySelector('.bsw') as HTMLElement, listEl = box.querySelector('.blist') as HTMLElement, readAll = box.querySelector('[data-b=readall]') as HTMLElement;
  let list = cached();
  let account: Account | null = null;
  const openedUnread = bellUnread();
  const drawList = (): void => {
    listEl.innerHTML = inboxHtml(list, seen(), Date.now());
    readAll.hidden = unreadCount(list, seen()) === 0;
  };
  const markRead = (): void => { const top = list.reduce((m, n) => Math.max(m, n.id), seen()); put(SEEN, String(top)); changed(); };
  const sheet = ctx.openSheet(box, { label: 'Notifications', tall: true, onClose: () => { navigator.serviceWorker?.removeEventListener?.('message', onMsg); markRead(); } });
  emit('open', { unread: openedUnread, items: list.length });
  drawList();

  // the test notification arrived (the service worker says so)
  let testAt = 0;
  const onMsg = (e: MessageEvent): void => {
    if ((e.data as { t?: string } | null)?.t !== 'push-test') return;
    emit('test-arrived', { ms: testAt ? Math.round(performance.now() - testAt) : null });
    const st = sw.querySelector('.btest-st'); if (st) st.textContent = 'It arrived. Notifications work on this phone.';
  };
  navigator.serviceWorker?.addEventListener?.('message', onMsg);

  const drawSwitch = async (): Promise<void> => {
    const { state, sub } = await envState(account);
    const head = (on: boolean, sub2: string): string => `<div class="bswh"><span><b>Phone notifications</b><small>${sub2}</small></span><span class="bpill${on ? ' on' : ''}" data-testid="bell-state">${on ? 'On' : 'Off'}</span></div>`;
    if (state === 'no-account') sw.innerHTML = `${head(false, 'They need an account on this phone.')}<p class="hint">Open Profile once to make your account, then come back here.</p>`;
    else if (state === 'unsupported') sw.innerHTML = `${head(false, 'This browser cannot show notifications.')}<p class="hint">The list below still fills, so you will not miss a table.</p>`;
    else if (state === 'blocked') sw.innerHTML = `${head(false, 'Blocked in this browser’s settings.')}<p class="hint">Allow notifications for this site in the browser’s site settings, then open this panel again.</p>`;
    else if (state === 'ios-install') {
      sw.innerHTML = `${head(false, 'On iPhone they work once the app is on your Home Screen.')}`
        + '<ol class="bsteps" data-testid="bell-ios-steps">'
        + '<li><span class="bnum">1</span><span>Tap <b>Share</b> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3.5M8 7l4-4 4 4M6 11H5v9.5h14V11h-1"/></svg> at the bottom of Safari</span></li>'
        + '<li><span class="bnum">2</span><span>Choose <b>Add to Home Screen</b> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg></span></li>'
        + '<li><span class="bnum">3</span><span>Open <b>Train Poker</b> from the new icon, come back to this bell and tap <b>Turn on</b></span></li></ol>';
      emit('ios-guide', { step: 'shown' });
    } else if (state === 'off') sw.innerHTML = `${head(false, 'This phone buzzes when a crew table starts or it is your turn.')}<button class="bb p" data-b="on" data-testid="bell-on">Turn on</button>`;
    else {
      const prefs: PushPrefs = { ...DEFAULT_PREFS, ...((sub && account ? await account.myPush(sub.endpoint).catch(() => null) : null) ?? {}) };
      sw.innerHTML = `${head(true, 'This phone is told about:')}`
        + `<div class="bprefs">${PREF_LABEL.map(([k, l]) => `<label class="bpref"><span>${l}</span><input type="checkbox" role="switch" data-pref="${k}"${prefs[k] !== false ? ' checked' : ''}></label>`).join('')}</div>`
        + '<div class="btest"><button class="bb g" data-b="test" data-testid="bell-test">Send me a test</button><button class="blnk" data-b="off" data-testid="bell-off">Turn off</button></div><p class="hint btest-st" role="status"></p>';
    }
  };

  box.addEventListener('change', async (e) => {
    const inp = (e.target as HTMLElement).closest('input[data-pref]') as HTMLInputElement | null;
    if (!inp || !account) return;
    try {
      const sub = await currentSub();
      if (!sub) return;
      const prefs: PushPrefs = {};
      box.querySelectorAll<HTMLInputElement>('input[data-pref]').forEach((i) => { prefs[i.dataset.pref as keyof PushPrefs] = i.checked; });
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await account.savePush(j.endpoint, j.keys.p256dh, j.keys.auth, prefs);
      emit('pref', { key: inp.dataset.pref, on: inp.checked });
    } catch (err) { toast((err as Error).message || 'Could not save that'); inp.checked = !inp.checked; }
  });
  box.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('[data-b]') as HTMLButtonElement | null;
    if (!b) return;
    const what = b.dataset.b;
    if (what === 'readall') { markRead(); drawList(); emit('read-all'); return; }
    if (what === 'item') {
      emit('item', { kind: b.dataset.kind, new: b.classList.contains('new') });
      const url = b.dataset.url || '/';
      sheet.close();
      try { const u = new URL(url, location.origin); if (u.hash && u.hash !== location.hash) location.hash = u.hash; } catch { /* not a place in the app */ }
      return;
    }
    if (!account) return;
    b.disabled = true;
    try {
      if (what === 'on') { const ok = await enablePush(account); emit('switch', { on: true, ok }); put(ASKED, '1'); if (ok) toast('Notifications on'); }
      else if (what === 'off') { await disablePush(account); emit('switch', { on: false, ok: true }); toast('Notifications off'); }
      else if (what === 'test') {
        testAt = performance.now();
        const r = await account.sendTestPush();
        emit('test-sent', { phones: r.phones });
        b.disabled = false;
        const st = sw.querySelector('.btest-st'); if (st) st.textContent = 'Sent. It arrives within about 3 minutes; you can close the app to see it land.';
        return;
      }
    } catch (err) { toast((err as Error).message || 'That did not work'); emit('error', { what, err: String((err as Error)?.message ?? err).slice(0, 120) }); }
    b.disabled = false;
    if (what !== 'test') await drawSwitch();
  });

  try {
    account = await ctx.account();
    await drawSwitch();
    if (account) { list = await refresh(account); if (box.isConnected) { drawList(); changed(); } }
  } catch { if (sw.querySelector('.hint')?.textContent === 'Loading…') await drawSwitch().catch(() => undefined); }
}

/** After a game, once: while notifications are off, the panel opens to offer them ("Don't ask again" = closing it). */
export async function bellReminder(ctx: BellCtx): Promise<void> {
  if (get(ASKED)) return;
  const a = await ctx.account().catch(() => null);
  const { state } = await envState(a);
  if (state !== 'off' && state !== 'ios-install') return;
  put(ASKED, '1');
  emit('reminder', { state });
  await openBell(ctx);
}
