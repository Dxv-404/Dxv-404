// Game-start notifications: the service worker's "Join now" button and what a tap does (sw.template.js, run
// here as the phone runs it, with a fake service worker around it), and when the app offers to turn
// notifications on after joining or making a crew (crews/push-env.ts).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { isIos, pushPromptKind, type PushEnv } from '../src/crews/push-env';

const SCOPE = 'https://poker.example/';
interface FakeClient { url: string; focused: boolean; navigated: string | null; messages: unknown[]; focus(): Promise<FakeClient>; navigate?(u: string): Promise<FakeClient | null>; postMessage(m: unknown): void }
function client(url: string, o: { navigate?: 'ok' | 'throws' | 'none' } = {}): FakeClient {
  const c: FakeClient = {
    url, focused: false, navigated: null, messages: [],
    async focus() { c.focused = true; return c; },
    postMessage(m) { c.messages.push(m); },
  };
  if (o.navigate !== 'none') c.navigate = async (u) => { if (o.navigate === 'throws') throw new TypeError('not controlled'); c.navigated = u; c.url = u; return c; };
  return c;
}

/** Loads the service worker with a fake `self`; `actions`: whether this browser's notifications have buttons. */
function sw(windows: FakeClient[], actions: boolean) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; o: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const self = {
    addEventListener: (t: string, fn: (e: unknown) => void) => { handlers[t] = fn; },
    registration: { scope: SCOPE, showNotification: async (title: string, o: Record<string, unknown>) => { shown.push({ title, o }); } },
    clients: { matchAll: async () => windows, openWindow: async (u: string) => { opened.push(u); return client(u); }, claim: async () => undefined },
    skipWaiting: async () => undefined,
  };
  class Notification { static maxActions = actions ? 2 : 0; }
  if (actions) (Notification.prototype as unknown as { actions: unknown[] }).actions = [];
  const code = readFileSync(new URL('../sw.template.js', import.meta.url), 'utf8').replace("'__CACHE__'", "'test'").replace('__FILES__', '[]');
  runInNewContext(code, { self, Notification, URL, caches: {}, fetch: () => undefined, location: { origin: 'https://poker.example' }, console });
  const wait = async (fn: (e: unknown) => void, e: Record<string, unknown>) => { let p: Promise<unknown> = Promise.resolve(); fn({ ...e, waitUntil: (x: Promise<unknown>) => { p = x; } }); await p; };
  return {
    shown, opened,
    push: (m: unknown) => wait(handlers.push!, { data: { json: () => m } }),
    click: (data: unknown, action = '') => { let closed = false; return wait(handlers.notificationclick!, { action, notification: { data, close: () => { closed = true; } } }).then(() => closed); },
  };
}

const crewPush = { kind: 'crewTable', title: 'A crew table just started', body: 'Dev is playing at table ABCD. Tap to join.', url: '/#/t/ABCD', tag: 'table-ABCD' };
const turnPush = { kind: 'turn', title: 'Your turn', body: 'Table ABCD is waiting for you.', url: '/#/t/ABCD', tag: 'turn-ABCD' };

describe('service worker: notifications', () => {
  it('a crew table that started gets a Join now button where notifications have buttons', async () => {
    const w = sw([], true);
    await w.push(crewPush);
    expect(w.shown[0]!.title).toBe('A crew table just started');
    expect(w.shown[0]!.o).toMatchObject({ body: crewPush.body, tag: 'table-ABCD', data: { url: '/#/t/ABCD', kind: 'crewTable' }, actions: [{ action: 'join', title: 'Join now' }] });
  });
  it('an older server (no kind) still gets the button for a crew table, by its tag', async () => {
    const w = sw([], true);
    await w.push({ ...crewPush, kind: undefined });
    expect(w.shown[0]!.o.actions).toEqual([{ action: 'join', title: 'Join now' }]);
  });
  it('no buttons where the browser has none (iPhone), and never on a turn', async () => {
    const w = sw([], false);
    await w.push(crewPush);
    expect(w.shown[0]!.o.actions).toBeUndefined();
    const w2 = sw([], true);
    await w2.push(turnPush);
    expect(w2.shown[0]!.o.actions).toBeUndefined();
    expect(w2.shown[0]!.o).toMatchObject({ tag: 'turn-ABCD', data: { url: '/#/t/ABCD' } });
  });
  it('a push without a title shows nothing', async () => {
    const w = sw([], true);
    await w.push({ body: 'x' });
    expect(w.shown).toEqual([]);
  });

  it('tapping Join now, or the notification itself, takes the open app to the table', async () => {
    for (const action of ['join', '']) {
      const app = client(`${SCOPE}#/`);
      const w = sw([client('https://elsewhere.example/'), app], true);
      expect(await w.click({ url: '/#/t/ABCD', kind: 'crewTable' }, action)).toBe(true);
      expect(app.focused).toBe(true);
      expect(app.navigated).toBe(`${SCOPE}#/t/ABCD`);
      expect(w.opened).toEqual([]);
    }
  });
  it('no app open: a new window opens at the table', async () => {
    const w = sw([], true);
    await w.click({ url: '/#/t/ABCD' }, 'join');
    expect(w.opened).toEqual([`${SCOPE}#/t/ABCD`]);
  });
  it('an app window the worker cannot navigate is told to go there itself', async () => {
    for (const nav of ['throws', 'none'] as const) {
      const app = client(`${SCOPE}#/crews`, { navigate: nav });
      const w = sw([app], true);
      await w.click({ url: '/#/t/ABCD' });
      expect(app.focused).toBe(true);
      expect(app.messages).toEqual([{ t: 'open', url: `${SCOPE}#/t/ABCD` }]);
    }
  });
  it('a turn notification works as before: the open app goes to its table', async () => {
    const app = client(`${SCOPE}#/`);
    const w = sw([app], true);
    await w.click({ url: '/#/t/WXYZ' });
    expect(app.navigated).toBe(`${SCOPE}#/t/WXYZ`);
  });
});

describe('offering to turn notifications on', () => {
  const base: PushEnv = { dismissed: false, supported: true, permission: 'default', subscribed: false, ios: false, standalone: false };
  it('offers the one-tap switch while notifications are off', () => {
    expect(pushPromptKind(base)).toBe('enable');
    expect(pushPromptKind({ ...base, permission: 'granted' })).toBe('enable'); // allowed, but this phone is not subscribed
    expect(pushPromptKind({ ...base, ios: true, standalone: true })).toBe('enable'); // an iPhone app on the Home Screen
  });
  it('never again after Not now, nor when they are on or blocked, nor where push cannot work', () => {
    expect(pushPromptKind({ ...base, dismissed: true })).toBeNull();
    expect(pushPromptKind({ ...base, dismissed: true, ios: true })).toBeNull();
    expect(pushPromptKind({ ...base, permission: 'granted', subscribed: true })).toBeNull();
    expect(pushPromptKind({ ...base, permission: 'denied' })).toBeNull();
    expect(pushPromptKind({ ...base, supported: false, permission: 'unsupported' })).toBeNull();
  });
  it('an iPhone in Safari (not on the Home Screen) gets the Add to Home Screen steps', () => {
    expect(pushPromptKind({ ...base, ios: true, supported: false, permission: 'unsupported' })).toBe('ios-install');
  });
  it('knows an iPhone or iPad from its browser', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1')).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', 5)).toBe(true); // iPad
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', 0)).toBe(false);
    expect(isIos('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36')).toBe(false);
  });
});
