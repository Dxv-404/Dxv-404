// Your account on every device: the code helpers, what kind of device a browser is, and the typed calls
// (each one checked against a stand-in for the database: which function, which arguments, how the answer is read).
import { describe, expect, it } from 'vitest';
import { Account, cleanDeviceCode, codeFromLink, deviceLabel, deviceLink, describeDevice, formatDeviceCode, lastUsed, timeLeft, type KeyStore } from '../src/index';

const store = (): KeyStore => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };

/** A stand-in Supabase: anonymous sign-in, and each rpc answered by `answer(fn, args)`. */
function fakeDb(answer: (fn: string, args: Record<string, unknown>) => { status?: number; body: unknown }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  let signups = 0;
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/auth/v1/signup')) {
      signups++;
      const now = Math.floor(Date.now() / 1000);
      const user = { id: '00000000-0000-0000-0000-0000000000ff', aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
      return new Response(JSON.stringify({ access_token: 'a.b.c', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r', user }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const m = /\/rest\/v1\/rpc\/(\w+)/.exec(url);
    if (!m) return new Response('{}', { status: 404 });
    const args = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ fn: m[1]!, args });
    const a = answer(m[1]!, args);
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { account: new Account({ storage: store(), fetch: f, url: 'https://fake.example', key: 'k' }), calls, signups: () => signups };
}

const PROFILE = { id: 'acc-1', name: 'Dev', avatar_url: null, settings: {}, created_at: '2026-11-03T00:00:00Z', deleted_at: null };

describe('device codes', () => {
  it('cleans, formats and links codes', () => {
    expect(cleanDeviceCode('Code: 482-913 9')).toBe('482913');
    expect(formatDeviceCode('482913')).toBe('482 913');
    expect(formatDeviceCode('48')).toBe('48');
    expect(deviceLink('https://tp.example/', '482 913')).toBe('https://tp.example/#/d/482913');
    expect(codeFromLink('https://tp.example/#/d/482913')).toBe('482913');
    expect(codeFromLink(' 007001 ')).toBe('007001');
    expect(codeFromLink('PK1~offer')).toBeNull();
    expect(codeFromLink('https://tp.example/#/d/4829')).toBeNull();
  });
  it('shows the time left', () => {
    expect(timeLeft(292_000)).toBe('4:52');
    expect(timeLeft(9_500)).toBe('0:10');
    expect(timeLeft(-5)).toBe('0:00');
  });
  it('says when a device was last used', () => {
    const now = Date.parse('2026-11-03T12:00:00Z');
    expect(lastUsed('2026-11-03T11:59:30Z', now)).toBe('now');
    expect(lastUsed('2026-11-03T11:58:00Z', now)).toBe('2 min ago');
    expect(lastUsed('2026-11-03T09:00:00Z', now)).toBe('3 h ago');
    expect(lastUsed('2026-11-02T09:00:00Z', now)).toBe('yesterday');
    expect(lastUsed('2026-10-29T09:00:00Z', now)).toBe('5 days ago');
  });
  it('names devices', () => {
    expect(deviceLabel({ name: null, kind: 'phone', this_device: true }, 'Dev')).toBe('This phone');
    expect(deviceLabel({ name: null, kind: 'laptop', this_device: false }, 'Dev')).toBe('Dev’s laptop');
    expect(deviceLabel({ name: 'Work Mac', kind: 'laptop', this_device: false }, 'Dev')).toBe('Work Mac');
  });
});

describe('what kind of device this is', () => {
  const cases: [string, boolean, number, string, string][] = [
    ['Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', true, 412, 'phone', 'Pixel 7 · Chrome'],
    ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', true, 412, 'phone', 'Android · Chrome'],
    ['Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', true, 800, 'tablet', 'SM-X200 · Chrome'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', true, 393, 'phone', 'iPhone · Safari'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', true, 820, 'tablet', 'iPad · Safari'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', false, 1440, 'laptop', 'Mac · Chrome'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0', false, 1920, 'laptop', 'Windows · Edge'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', false, 1280, 'laptop', 'Linux · Firefox'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', false, 1366, 'laptop', 'Chromebook · Chrome'],
    ['Something odd', true, 400, 'phone', 'Device · Browser'],
  ];
  it.each(cases)('%s', (ua, touch, width, kind, detail) => {
    expect(describeDevice(ua, touch, width)).toEqual({ kind, detail });
  });
});

describe('the typed calls', () => {
  it('lists, describes and renames devices', async () => {
    const db = fakeDb((fn) => ({ body: fn === 'my_devices' ? [{ device: 'd1', this_device: true, name: null, kind: 'phone', detail: 'Pixel 7 · Chrome', added: 'x', last_seen: 'y' }] : null }));
    expect((await db.account.myDevices())[0]!.detail).toBe('Pixel 7 · Chrome');
    await db.account.setThisDevice('laptop', 'Mac · Chrome');
    await db.account.renameDevice('d2', 'Work Mac');
    expect(db.calls.slice(1)).toEqual([
      { fn: 'set_this_device', args: { p_kind: 'laptop', p_detail: 'Mac · Chrome' } },
      { fn: 'rename_device', args: { p_device: 'd2', p_name: 'Work Mac' } },
    ]);
  });

  it('makes and cancels a code', async () => {
    const db = fakeDb((fn) => ({ body: fn === 'new_device_code' ? { code: '048213', expires_at: '2026-11-03T12:05:00Z' } : null }));
    expect(await db.account.newDeviceCode()).toEqual({ code: '048213', expiresAt: Date.parse('2026-11-03T12:05:00Z') });
    await db.account.cancelDeviceCode();
    expect(db.calls.map((c) => c.fn)).toEqual(['new_device_code', 'cancel_device_code']);
  });

  it('a device with no sign-in signs in, then redeems; the answer becomes the profile', async () => {
    const db = fakeDb(() => ({ body: { ok: true, account: PROFILE, moved: { crews: 2, games: 48, trophies: 3 }, from: 'laptop' } }));
    const r = await db.account.redeemDeviceCode('482 913', null, { kind: 'phone', detail: 'Pixel 7 · Chrome' });
    expect(r).toEqual({ ok: true, profile: PROFILE, moved: { crews: 2, games: 48, trophies: 3 }, from: 'laptop' });
    expect(db.signups()).toBe(1);
    expect(db.calls[0]).toEqual({ fn: 'redeem_device_code', args: { p_code: '482913', p_merge: null, p_kind: 'phone', p_detail: 'Pixel 7 · Chrome' } });
    expect(db.account.profile).toEqual(PROFILE);
    // signed in now: no second sign-up
    await db.account.redeemDeviceCode('482913', true, { kind: 'phone', detail: '' });
    expect(db.signups()).toBe(1);
  });

  it('reads every way a code can fail', async () => {
    const mine = { name: 'Dev', crews: [{ id: 'c', name: 'Hostel 4B', color: '#2f6fd6', role: 'owner', members: 7, games: 12 }], games: 12, trophies: 0 };
    const answers: [unknown, number, unknown][] = [
      [{ ok: false, reason: 'ask', mine }, 200, { ok: false, reason: 'ask', mine }],
      [{ ok: false, reason: 'wrong', tries_left: 4 }, 200, { ok: false, reason: 'wrong', triesLeft: 4 }],
      [{ ok: false, reason: 'expired' }, 200, { ok: false, reason: 'expired', message: 'This code ran out. Make a new one on your other device; it takes a second.' }],
      [{ ok: false, reason: 'cancelled' }, 200, { ok: false, reason: 'cancelled', message: expect.stringContaining('cancelled') }],
      [{ ok: false, reason: 'used' }, 200, { ok: false, reason: 'used', message: expect.stringContaining('already used') }],
      [{ ok: false, reason: 'self' }, 200, { ok: false, reason: 'self', message: 'This device is already your account.' }],
      [{ ok: false, reason: '???' }, 200, { ok: false, reason: 'error', message: expect.any(String) }],
      [{ code: '54000', message: 'Too many wrong codes. Wait a few minutes, then try again.', details: null, hint: null }, 400, { ok: false, reason: 'paused', message: 'Too many wrong codes. Wait a few minutes, then try again.' }],
      [{ code: 'XX000', message: 'boom', details: null, hint: null }, 400, { ok: false, reason: 'error', message: 'boom' }],
    ];
    for (const [body, status, want] of answers) {
      const db = fakeDb(() => ({ body, status }));
      expect(await db.account.redeemDeviceCode('482913', null, { kind: 'phone', detail: '' })).toEqual(want);
      expect(db.account.profile).toBeNull();
    }
  });

  it('reads and dismisses notices', async () => {
    const n = { id: 7, device: 'd9', kind: 'laptop', detail: 'Mac · Chrome', at: '2026-11-03T12:00:00Z', still_signed_in: true };
    const db = fakeDb((fn) => ({ body: fn === 'my_device_notices' ? [n] : null }));
    expect(await db.account.deviceNotices()).toEqual([n]);
    await db.account.dismissDeviceNotice(7);
    expect(db.calls[1]).toEqual({ fn: 'dismiss_device_notice', args: { p_id: 7 } });
  });
});
