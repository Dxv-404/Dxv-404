// Research capture end to end: real phones and laptops play on the Oracle build (run locally, recording, with
// the recorder key), the apps send their events to its /research/ingest, and everything lands in a fresh local
// copy of the database (never the live project). Then the research tables are read back: every category is
// there with the right fields, the game works with ingestion down, and an app that records nothing still plays.
import { test, expect, type Browser, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODELS, newPhone, type Phone, type PhoneModel } from '../harness';
import { startFakeSupabase, useFakeSupabase, type FakeSupabase } from '../fake-supabase';

test.describe.configure({ timeout: 400_000 });
const root = join(import.meta.dirname, '..', '..');
const PORT = 19500 + Math.floor(Math.random() * 300);
let fake: FakeSupabase;
let server: ChildProcess | null = null;

test.beforeAll(async () => {
  fake = await startFakeSupabase();
  await fake.sql(`insert into private.settings values ('recorder_token_hash', encode(extensions.digest('test-recorder-token', 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value`);
  const b = spawnSync('pnpm', ['-s', 'build:node'], { cwd: join(root, 'apps/server'), encoding: 'utf8' });
  if (b.status !== 0) throw new Error(b.stderr);
  server = spawn(process.execPath, [join(root, 'apps/server/dist/node-server.mjs')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'tp-e2e-research-')), HAND_PAUSE_MS: '800', SUPABASE_URL: fake.url, RECORDER_TOKEN: 'test-recorder-token' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
test.afterAll(async () => { server?.kill('SIGKILL'); await fake?.close(); });

async function device(browser: Browser, baseURL: string, name: string, model: PhoneModel, o: { guestOnly?: boolean; local?: Record<string, string>; extra?: Parameters<Browser['newContext']>[0] } = {}): Promise<Phone> {
  const p = await newPhone(browser, name, model, baseURL, { serviceWorkers: 'block', ...(o.extra ?? {}) });
  await useFakeSupabase(p.ctx, fake);
  if (!o.guestOnly) await p.ctx.addInitScript(() => { try { localStorage.removeItem('tp-guest-only'); } catch { /* blocked */ } });
  await p.page.evaluate(([port, local]) => {
    localStorage.setItem('tp-server-override', `ws://127.0.0.1:${port}`);
    localStorage.setItem('tp-intro-done', '1'); localStorage.setItem('tp-theme', 'classic');
    for (const [k, v] of Object.entries(JSON.parse(local!) as Record<string, string>)) localStorage.setItem(k, v);
  }, [String(PORT), JSON.stringify(o.local ?? {})] as const);
  await p.page.reload();
  return p;
}

/** Everything this page has captured, sent now (the queue normally sends every few seconds). */
async function flush(page: Page): Promise<void> {
  let sent = { s: '', n: 0 };
  for (let i = 0; i < 30; i++) {
    const left = await page.evaluate(async () => { const r = (window as any).__tpResearch; if (!r) return -1; await r.queue.flush(true); return r.queue.length as number; });
    if (left < 0) return;
    if (left === 0) { sent = await page.evaluate(() => { const r = (window as any).__tpResearch; return { s: r.maker.session as string, n: r.maker.count as number }; }); break; }
    await page.waitForTimeout(200);
  }
  // the server answers at once and writes a moment later: wait until this session's events are all stored
  await until(async () => Number(await fake.sql(`select count(*) from research.events where session = '${sent.s}'`)) >= sent.n - 2, 20_000);
}
const rows = async <T = Record<string, unknown>>(q: string): Promise<T[]> => JSON.parse((await fake.sql(`select coalesce(json_agg(x), '[]') from (${q}) x`)) || '[]') as T[];
const deviceOf = (page: Page) => page.evaluate(() => localStorage.getItem('tp-rdev')!);
const until = async (f: () => Promise<boolean>, ms = 20_000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f()) return true; await new Promise((r) => setTimeout(r, 300)); } return f(); };

/** A fake motion sensor: the phone "moves" all the time (the app listens only in its windows). */
const MOTION = () => {
  let t = 0;
  setInterval(() => {
    t++;
    try {
      dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: Math.sin(t / 5), y: 9.6 + Math.cos(t / 7) * 0.3, z: 0.4 }, acceleration: { x: 0.1, y: 0, z: 0 }, rotationRate: { alpha: 5 + (t % 3), beta: 2, gamma: 1 }, interval: 16 }));
      dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 10 + t / 10, beta: 45, gamma: -3 }));
    } catch { /* no sensors */ }
  }, 20);
};

async function openTable(host: Phone): Promise<string> {
  await host.page.getByTestId('play-online').click();
  await host.page.getByTestId('online-host').click();
  await host.page.getByTestId('online-open').click();
  await expect(host.page.locator('.tp.live')).toBeVisible();
  await host.page.locator('[data-act=menu]').click();
  const link = (await host.page.getByTestId('table-link').textContent())!.replace(/^https?:\/\/[^/]+/, '');
  await host.page.keyboard.press('Escape');
  return link;
}

test('a game on a phone and a laptop: the server records the hands, the apps record how they were played', async ({ browser, baseURL }) => {
  const phone = await device(browser, baseURL!, 'Phone', MODELS.pixel7, { guestOnly: true, local: { 'tp-name': 'Dev' } });
  await phone.ctx.addInitScript(MOTION);
  await phone.page.reload();
  const laptop = await device(browser, baseURL!, 'Laptop', MODELS.laptop, { guestOnly: true, local: { 'tp-name': 'Riya' } });
  const link = await openTable(phone);
  const code = link.slice(-4);
  await laptop.page.goto(link);
  await expect(laptop.page.locator('.tp.live .seat')).toHaveCount(1);
  await phone.page.locator('[data-act=deal]').click();
  // play two hands: on the laptop, the mouse wanders over the buttons, the raise sheet is opened and its amount
  // moved, then the player checks or calls; on the phone the player holds to look first
  let raised = false, peeked = false, acted = 0, hidden = false;
  const end = Date.now() + 90_000;
  while (Date.now() < end && acted < 10) {
    for (const p of [phone, laptop]) {
      const b = p.page.locator('[data-act=check], [data-act=call]').first();
      if (!(await b.isVisible().catch(() => false))) continue;
      if (p === laptop) {
        const box = await b.boundingBox();
        if (box) { await p.page.mouse.move(100, 100); await p.page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 12 }); await p.page.waitForTimeout(150); }
        const fold = p.page.locator('[data-act=fold]').first();
        if (await fold.isVisible().catch(() => false)) { await fold.hover(); await p.page.waitForTimeout(200); }
        const r = p.page.locator('[data-act=raise]').first();
        if (!raised && await r.isVisible().catch(() => false)) {
          await r.click();
          await expect(p.page.locator('.tp-raise')).toBeVisible();
          for (let i = 0; i < 4; i++) { await p.page.locator('.tp-raise .pm.p').click(); await p.page.waitForTimeout(60); }
          const trk = await p.page.locator('.tp-raise .trk').boundingBox();
          if (trk) { await p.page.mouse.move(trk.x + 5, trk.y + trk.height / 2); await p.page.mouse.down(); await p.page.mouse.move(trk.x + trk.width * 0.6, trk.y + trk.height / 2, { steps: 15 }); await p.page.mouse.up(); }
          await p.page.keyboard.press('Escape');
          raised = true;
        }
        if (!hidden) {
          hidden = true;
          await p.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
          await p.page.waitForTimeout(300);
          await p.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
        }
      } else if (!peeked) {
        const hc = p.page.locator('.hero .hc');
        const box = await hc.boundingBox().catch(() => null);
        if (box) { await p.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.page.mouse.down(); await p.page.waitForTimeout(400); await p.page.mouse.up(); peeked = true; }
        await p.page.waitForTimeout(500); // (a moment to decide: motion samples)
      }
      await b.click().catch(() => {});
      acted++;
    }
    await phone.page.waitForTimeout(250);
  }
  expect(acted).toBeGreaterThanOrEqual(4);
  // the host ends the night
  await phone.page.locator('[data-act=menu]').click();
  await phone.page.getByTestId('end-game').click();
  await phone.page.getByTestId('ask-yes').click();
  await expect(phone.page.getByTestId('standings').locator('li')).toHaveCount(2);
  await flush(phone.page); await flush(laptop.page);
  const pd = await deviceOf(phone.page), ld = await deviceOf(laptop.page);

  // ---- the server: every hand, with every player's cards, the deck, decisions and actions
  expect(await until(async () => (await rows(`select 1 from research.events where type = 'game.end' and table_code = '${code}'`)).length > 0)).toBe(true);
  const types = (await rows<{ type: string; n: number }>(`select type, count(*)::int n from research.events where table_code = '${code}' and src = 's' group by type`)).map((r) => r.type);
  for (const t of ['table.open', 'conn.open', 'conn.hello', 'seat.join', 'msg.in', 'hand.start', 'hand.decision', 'hand.action', 'hand.end', 'game.end']) expect(types, t).toContain(t);
  const start = (await rows<{ payload: { holes: Record<string, string[]>; deck: string[]; seed: { combined: string } } }>(`select payload from research.events where type = 'hand.start' and table_code = '${code}' order by hand_no limit 1`))[0]!.payload;
  expect(Object.keys(start.holes)).toHaveLength(2);
  expect(start.deck).toHaveLength(52);
  const dec = (await rows<{ payload: { legal: { minTo: number }; view: { hand: { ps: Record<string, { cards: string[] | null }> } }; pid: string; deadline: number | null }; guest: string; device: string }>(`select payload, guest, device from research.events where type = 'hand.decision' and table_code = '${code}' limit 4`));
  for (const d of dec) {
    expect(d.payload.legal.minTo).toBeGreaterThan(0);
    expect(d.payload.view.hand.ps[d.payload.pid]!.cards).toHaveLength(2);
    expect(Object.entries(d.payload.view.hand.ps).filter(([k]) => k !== d.payload.pid).every(([, v]) => v.cards === null)).toBe(true);
    expect([pd, ld]).toContain(d.device); // which device was playing the seat
  }
  // seat neighbours: everyone's chair and position
  expect((await rows(`select 1 from research.events where type = 'hand.start' and table_code = '${code}' and json_array_length(payload -> 'players') = 2`)).length).toBeGreaterThan(0);

  // ---- the apps
  const byDevice = async (d: string) => (await rows<{ type: string }>(`select distinct type from research.events where device = '${d}' and src = 'c'`)).map((r) => r.type);
  const phoneTypes = await byDevice(pd), lapTypes = await byDevice(ld);
  for (const t of ['session.start', 'device.info', 'ui.screen', 'ui.tap', 'turn.start', 'act.send', 'act.ack', 'table.view', 'clock.sync', 'motion.perm', 'motion.samples', 'table.peek', 'net.status', 'perf.load']) expect(phoneTypes, `phone ${t}`).toContain(t);
  for (const t of ['session.start', 'turn.start', 'act.send', 'act.ack', 'raise.path', 'mouse.path', 'ui.hover', 'att.visibility', 'ui.key']) expect(lapTypes, `laptop ${t}`).toContain(t);
  // the round trip of every action, and the decision time measured here
  const acks = await rows<{ payload: { rttMs: number | null; kind: string } }>(`select payload from research.events where device = '${pd}' and type = 'act.ack'`);
  expect(acks.some((a) => a.payload.kind === 'act' && (a.payload.rttMs ?? -1) >= 0)).toBe(true);
  const sends = await rows<{ payload: { sinceTurnMs: number | null; actionId: string; via: string | null } }>(`select payload from research.events where device = '${ld}' and type = 'act.send' and payload ->> 'kind' = 'act'`);
  expect(sends.some((s) => (s.payload.sinceTurnMs ?? -1) > 0)).toBe(true);
  // the same action, seen by the server (linked by its action id)
  const aid = sends[0]!.payload.actionId;
  expect((await rows(`select 1 from research.events where type = 'msg.in' and payload ->> 'actionId' = '${aid}'`)).length).toBe(1);
  // the raise amount path: several values; the mouse path on the laptop during a turn
  const rp = (await rows<{ payload: { batch: { c: { to: number[] } }; result: string; marks: unknown[] } }>(`select payload from research.events where device = '${ld}' and type = 'raise.path'`))[0]!.payload;
  expect(rp.batch.c.to.length).toBeGreaterThan(3);
  expect(rp.result).toBe('cancel');
  expect(rp.marks.length).toBeGreaterThan(0);
  const mp = await rows<{ payload: { phase: string; batch: { c: { x: number[] } }; buttons: unknown[] } }>(`select payload from research.events where device = '${ld}' and type = 'mouse.path'`);
  expect(mp.some((m) => m.payload.phase === 'turn' && m.payload.batch.c.x.length > 5 && m.payload.buttons.length > 0)).toBe(true);
  // motion (mocked sensors) on the phone, about 10 Hz, only in its windows
  const ms = await rows<{ payload: { batch: { c: { ax: number[]; ra: number[] }; dt: number[] } | null; from: string } }>(`select payload from research.events where device = '${pd}' and type = 'motion.samples'`);
  const withData = ms.filter((m) => m.payload.batch && m.payload.batch.c.ax.length > 2);
  expect(withData.length).toBeGreaterThan(0);
  const dts = withData[0]!.payload.batch!.dt;
  expect(dts.reduce((a, b) => a + b, 0) / dts.length).toBeGreaterThan(80); // about 10 Hz, not 50
  expect((await rows(`select 1 from research.events where device = '${ld}' and type = 'motion.samples'`)).length).toBe(0); // a laptop without sensors records none
  // every event: envelope version, both clocks, and no gaps in any session's sequence
  // (the server answers a batch at once and writes it a moment later: wait for those in flight)
  const gapless = async () => (await rows(`select session from research.events where src = 'c' and device in ('${pd}', '${ld}') group by session having count(*) <> max(seq)`)).length === 0;
  expect(await until(gapless, 20_000)).toBe(true);
  // the table server's own session too (all its events, whoever they are about)
  expect((await rows(`select session from research.events where src = 's' and table_code = '${code}' group by session having count(*) <> max(seq) - min(seq) + 1`)).length).toBe(0);
  expect((await rows(`select 1 from research.events where sv <> 1 or tc < 1.7e12 or tm < 0 or app is null`)).length).toBe(0);
  // sizes, for the storage estimate in docs/research-data.md (printed, not asserted)
  console.log(JSON.stringify({ hands: Number(await fake.sql(`select count(*) from research.events where type = 'hand.end' and table_code = '${code}'`)),
    byType: await rows(`select type, src, count(*)::int n, sum(octet_length(payload::text))::int payload_bytes from research.events where table_code = '${code}' or device in ('${pd}', '${ld}') group by type, src order by 4 desc`),
    tableBytes: Number(await fake.sql(`select sum(pg_total_relation_size(inhrelid)) from pg_inherits where inhparent = 'research.events'::regclass`)),
    rows: Number(await fake.sql(`select count(*) from research.events`)) }));
  // (service workers are blocked in these tests, so the app's "look for an update when it comes back" has no
  // registration when the test fakes the page coming back: not something a real browser does)
  for (const p of [phone, laptop]) expect(p.errors.filter((e) => !/Failed to load resource|ERR_|net::|WebSocket|reading 'update'/.test(e))).toEqual([]);
});

test('around the table: profile, avatar picker, settings, crew, replays and moving a seat to another device', async ({ browser, baseURL }) => {
  const phone = await device(browser, baseURL!, 'Phone', MODELS.iphone15);
  const friend = await device(browser, baseURL!, 'Friend', MODELS.smallAndroid, { guestOnly: true, local: { 'tp-name': 'Riya' } });
  const pd = await deviceOf(phone.page);
  // a profile
  await phone.page.getByTestId('open-profile').click();
  await phone.page.getByTestId('name').fill('Dev');
  await phone.page.getByTestId('make-profile').click();
  await expect(phone.page.getByTestId('profile-name')).toHaveText('Dev');
  // the avatar picker: another style, two picks, keep the second
  await phone.page.goto('/');
  await phone.page.getByTestId('menu-avatar').click();
  await expect(phone.page.locator('.avp .a-tile')).toHaveCount(8);
  await phone.page.waitForTimeout(400);
  await phone.page.locator('.avp .a-tab[data-tab=train]').click();
  await phone.page.waitForTimeout(400);
  await phone.page.locator('.avp [data-av-id=train-night-owl]').click();
  await phone.page.locator('.avp .a-tile').nth(3).click();
  await phone.page.getByTestId('avp-use').click();
  await expect(phone.page.getByTestId('avatar-picker')).toHaveCount(0);
  // settings
  await phone.page.getByTestId('open-settings').click();
  await phone.page.getByTestId('set-motion-off').click();
  await phone.page.getByTestId('set-largeText').check();
  await phone.page.locator('.pk-themes [data-theme=noir]').first().click();
  // a crew, and its tabs
  await phone.page.goto('/');
  await phone.page.getByTestId('open-profile').click();
  await phone.page.getByTestId('new-crew').click();
  await phone.page.getByTestId('crew-name').fill('Research crew');
  await phone.page.getByTestId('crew-create').click();
  await expect(phone.page.getByTestId('push-prompt')).toBeVisible(); // (recorded: push.prompt shown, then dismissed)
  await phone.page.getByTestId('push-later').click();
  await phone.page.getByRole('button', { name: 'Go to the crew' }).click();
  await expect(phone.page.getByTestId('crew-title')).toHaveText('Research crew');
  for (const t of ['league', 'games', 'members']) { const tab = phone.page.getByTestId(`crew-tab-${t}`); if (await tab.isVisible().catch(() => false)) { await tab.click(); await phone.page.waitForTimeout(300); } }
  // a game with a friend (a guest)
  await phone.page.goto('/');
  const link = await openTable(phone);
  const code = link.slice(-4);
  await friend.page.goto(link);
  await expect(friend.page.locator('.tp.live .seat')).toHaveCount(1);
  await phone.page.locator('[data-act=deal]').click();
  for (let i = 0; i < 40; i++) {
    for (const p of [phone, friend]) { const b = p.page.locator('[data-act=check], [data-act=call]').first(); if (await b.isVisible().catch(() => false)) await b.click().catch(() => {}); }
    if ((await rows(`select 1 from research.events where type = 'hand.end' and table_code = '${code}'`)).length) break;
    await phone.page.waitForTimeout(400);
  }
  // the same account on a laptop (a one-time code), which then takes the seat over
  await phone.page.locator('[data-act=menu]').click().catch(() => {});
  await phone.page.keyboard.press('Escape');
  const laptop = await device(browser, baseURL!, 'Laptop', MODELS.laptop);
  const codeOf = async (): Promise<string> => {
    const ctx = phone.page;
    const w = await ctx.context().newPage();
    await w.goto('/');
    await w.getByTestId('open-profile').click();
    await w.getByTestId('add-device').click();
    const digits = w.getByTestId('device-code');
    await expect(digits).toBeVisible();
    const c = (await digits.getAttribute('aria-label'))!.replace(/\D/g, '');
    await w.close();
    return c;
  };
  const otc = await codeOf();
  await laptop.page.getByTestId('open-profile').click();
  await laptop.page.getByTestId('use-account').click();
  await expect(laptop.page.locator('[data-testid=code-boxes] input').first()).toBeFocused();
  await laptop.page.keyboard.type(otc);
  await expect(laptop.page.getByTestId('welcome')).toBeVisible();
  await laptop.page.goto(link);
  await expect(laptop.page.getByTestId('seat-ask')).toBeVisible();
  await laptop.page.getByTestId('ask-no').click();
  await laptop.page.getByTestId('move-seat').click();
  await expect(laptop.page.getByTestId('watching-elsewhere')).toHaveCount(0);
  await expect(phone.page.getByTestId('watching-elsewhere')).toBeVisible();
  // the host (now watching on the phone, playing on the laptop) ends the night from the laptop
  await laptop.page.locator('[data-act=menu]').click();
  await laptop.page.getByTestId('end-game').click();
  await laptop.page.getByTestId('ask-yes').click();
  await expect(laptop.page.getByTestId('standings').locator('li')).toHaveCount(2);
  // replays: the game, a hand, steps
  await phone.page.goto('/');
  // (the "Signed in on a new laptop" notice can drop over the menu first: answer it, recorded as an api.call)
  const top = phone.page.getByTestId('device-notice-top');
  for (let i = 0; i < 15; i++) {
    if (await top.isVisible().catch(() => false)) await top.getByTestId('notice-ok').click().catch(() => {});
    if (await phone.page.getByTestId('open-profile').click({ timeout: 2000 }).then(() => true, () => false)) break;
  }
  await phone.page.getByTestId('my-games').click();
  await expect(phone.page.getByTestId('games').getByRole('button').first()).toBeVisible({ timeout: 20_000 });
  await phone.page.getByTestId('games').getByRole('button').first().click();
  await phone.page.getByTestId('hands').getByRole('button', { name: /Replay hand 1,/ }).click();
  await expect(phone.page.getByTestId('replay-say')).toBeVisible();
  for (let i = 0; i < 3 && await phone.page.getByTestId('replay-next').isEnabled(); i++) { await phone.page.getByTestId('replay-next').click(); await phone.page.waitForTimeout(250); }
  for (const p of [phone, friend, laptop]) await flush(p.page);
  const ld = await deviceOf(laptop.page);

  const ev = async (type: string, d = pd) => rows<{ payload: Record<string, unknown>; account: string | null }>(`select payload, account from research.events where device = '${d}' and type = '${type}' order by seq`);
  // settings: old and new values
  const st = (await ev('settings.change')).map((r) => r.payload as { key: string; from: unknown; to: unknown });
  expect(st).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'motion', to: 'off' }), expect.objectContaining({ key: 'largeText', to: true }), expect.objectContaining({ key: 'theme', to: 'noir' })]));
  // the avatar picker: tabs, picks, how long each avatar was on screen, the final choice
  const av = (await ev('avatar.browse')).map((r) => r.payload as { kind: string; final?: string; viewedMs?: Record<string, number>; picks?: unknown[] });
  const close = av.find((a) => a.kind === 'close')!;
  expect(av.some((a) => a.kind === 'tab')).toBe(true);
  expect(close.picks!.length).toBeGreaterThanOrEqual(2);
  expect(close.final).toMatch(/^train-/);
  expect(Object.keys(close.viewedMs!).length).toBeGreaterThan(4);
  // crew: made through the API (args and answer), the tabs looked at
  const calls = (await ev('api.call')).map((r) => r.payload as { fn: string; ok: boolean });
  expect(calls.some((c) => c.fn === 'create_crew_v3' && c.ok)).toBe(true);
  expect(calls.some((c) => c.fn === 'ensure_account')).toBe(true);
  const views = (await ev('crew.view')).map((r) => r.payload as { kind: string; tab: string });
  expect(views.map((v) => v.tab)).toEqual(expect.arrayContaining(['league', 'games']));
  expect((await ev('push.prompt')).map((r) => (r.payload as { kind: string }).kind)).toEqual(expect.arrayContaining(['shown', 'dismissed']));
  // screens with dwell; the account is on the events once there is a profile
  const screens = (await ev('ui.screen')).map((r) => r.payload as { name: string; prevMs: number });
  expect(screens.length).toBeGreaterThan(4);
  expect((await ev('ui.screen')).some((r) => r.account)).toBe(true);
  // the replay
  const rv = (await ev('replay.view')).map((r) => r.payload as { kind: string; step?: number });
  expect(rv.some((r) => r.kind === 'open')).toBe(true);
  expect(rv.some((r) => r.kind === 'step' && (r.step ?? 0) > 0)).toBe(true);
  // moving the seat: the server saw it, both apps did too
  expect((await rows(`select 1 from research.events where type = 'seat.move' and table_code = '${code}' and payload ->> 'kind' = 'moved' and device = '${ld}'`)).length).toBe(1);
  expect((await ev('id.event')).some((r) => (r.payload as { kind: string }).kind === 'seatMoved')).toBe(true);
  // research ids: one per account, guest and device seen
  expect(Number(await fake.sql(`select count(*) from research.subjects where kind = 'account'`))).toBeGreaterThanOrEqual(1);
  expect(Number(await fake.sql(`select count(*) from research.subjects where key = 'd:${ld}'`))).toBe(1);
});

test('the game plays on with ingestion down, and an app that records nothing plays with one that does', async ({ browser, baseURL }) => {
  // the phone's batches go nowhere (a closed port); the laptop records nothing at all (as an older app)
  const phone = await device(browser, baseURL!, 'Phone', MODELS.pixel7, { guestOnly: true, local: { 'tp-name': 'Dev', 'tp-research-url': 'http://127.0.0.1:9' } });
  const old = await device(browser, baseURL!, 'Old app', MODELS.laptop, { guestOnly: true, local: { 'tp-name': 'Riya', 'tp-research-off': '1' } });
  const link = await openTable(phone);
  await old.page.goto(link);
  await expect(old.page.locator('.tp.live .seat')).toHaveCount(1);
  await phone.page.locator('[data-act=deal]').click();
  let acted = 0;
  for (let i = 0; i < 60 && acted < 6; i++) {
    for (const p of [phone, old]) { const b = p.page.locator('[data-act=check], [data-act=call]').first(); if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); acted++; } }
    await phone.page.waitForTimeout(300);
  }
  expect(acted).toBeGreaterThanOrEqual(4);
  // the phone keeps what it could not send (in this browser's storage, capped), nothing thrown
  await phone.page.evaluate(async () => { await (window as any).__tpResearch.queue.flush(true); });
  const waiting = await phone.page.evaluate(() => (window as any).__tpResearch.queue.length as number);
  expect(waiting).toBeGreaterThan(10);
  expect(await phone.page.evaluate(() => (JSON.parse(localStorage.getItem('tp-rq') ?? '[]') as unknown[]).length)).toBeGreaterThan(0);
  // the old app sent nothing and has no research queue; the server still recorded its seat (without a device id)
  expect(await old.page.evaluate(() => (window as any).__tpResearch === undefined)).toBe(true);
  const code = link.slice(-4);
  expect(await until(async () => (await rows(`select 1 from research.events where type = 'seat.join' and table_code = '${code}' and device is null`)).length > 0)).toBe(true);
  for (const p of [phone, old]) expect(p.errors.filter((e) => !/Failed to load resource|ERR_|net::|WebSocket/.test(e))).toEqual([]);
});
