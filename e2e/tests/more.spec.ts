// Phase 7: everything around the table. The 18+ notice on first open, the settings screen and its effect on
// the table, the privacy page, Report a problem (the request the app sends), watching a table (the public
// view only, then taking a seat), leaving a table, and axe accessibility checks on the main screens.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODELS, newPhone, type Phone, autoAnswer } from '../harness';

const root = join(import.meta.dirname, '..', '..');
const PORT = 18900 + Math.floor(Math.random() * 300);
let server: ChildProcess | null = null;

test.beforeAll(async () => {
  const b = spawnSync('pnpm', ['-s', 'build:node'], { cwd: join(root, 'apps/server'), encoding: 'utf8' });
  if (b.status !== 0) throw new Error(b.stderr);
  server = spawn(process.execPath, [join(root, 'apps/server/dist/node-server.mjs')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'tp-e2e-more-')), HAND_PAUSE_MS: '800' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
test.afterAll(() => { server?.kill('SIGKILL'); });

async function prep(p: Phone, name: string): Promise<void> {
  await p.page.evaluate(([port, n]) => {
    localStorage.setItem('tp-server-override', `ws://127.0.0.1:${port}`);
    localStorage.setItem('tp-name', n); localStorage.setItem('tp-intro-done', '1');
  }, [String(PORT), name] as const);
}
const axe = async (p: Phone, what: string) => {
  const r = await new AxeBuilder({ page: p.page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze();
  expect(r.violations.map((v) => `${what}: ${v.id} (${v.nodes.length}) ${v.help}`)).toEqual([]);
};

test('the first open shows the theme\'s loading screen once (tap skips it), then the menu', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL: baseURL!, storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('.ldwrap')).toBeVisible();
  await expect(page.locator('.ldwrap .logo')).toBeVisible();
  await page.locator('.ldwrap').click();
  await expect(page.getByTestId('play-online')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('play-online')).toBeVisible();
  await expect(page.locator('.ldwrap')).toHaveCount(0);
  await ctx.close();
});

test('the menu goes straight in after the first open; settings, privacy and Report a problem', async ({ browser, baseURL }) => {
  const p = await newPhone(browser, 'Fresh', MODELS.pixel7, baseURL!);
  await expect(p.page.getByTestId('play-online')).toBeVisible(); // straight to the menu (no age check: a group of friends)
  await axe(p, 'home');
  // settings
  await p.page.getByTestId('open-settings').click();
  await axe(p, 'settings');
  await p.page.getByTestId('set-motion-off').click();
  await p.page.getByTestId('set-largeText').check();
  const prefs = await p.page.evaluate(() => JSON.parse(localStorage.getItem('tp-prefs') ?? '{}') as Record<string, unknown>);
  expect(prefs).toMatchObject({ motion: 'off', largeText: true });
  await p.page.locator('.pk-themes [data-theme=noir]').first().click();
  expect(await p.page.evaluate(() => localStorage.getItem('tp-theme'))).toBe('noir');
  // privacy
  await p.page.getByTestId('open-privacy').click();
  await expect(p.page.getByTestId('privacy')).toContainText('Play money only');
  await axe(p, 'privacy');
  await p.page.getByRole('button', { name: 'Back' }).click();
  // Report a problem: what the app sends (the database is not reached in this test)
  let sent: Record<string, unknown> | null = null;
  await p.page.route('**/rest/v1/rpc/report_problem', async (r) => { sent = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>; await r.fulfill({ status: 200, body: 'null', contentType: 'application/json' }); });
  await p.page.getByTestId('open-report').click();
  await axe(p, 'report');
  await p.page.getByTestId('report-text').fill('The raise slider jumps when I drag it');
  await p.page.getByTestId('report-send').click();
  await expect.poll(() => sent).not.toBeNull();
  expect(sent).toMatchObject({ p_kind: 'report', p_message: 'The raise slider jumps when I drag it', p_version: '0.5.0' });
  expect((sent as unknown as { p_context: { size: string } }).p_context.size).toBe('412x915');
  expect(p.errors.filter((e) => !/Failed to load resource|supabase|ERR_/i.test(e))).toEqual([]);
});

test('watching a table: the public view, no cards; then taking a seat; leaving a table', async ({ browser, baseURL }) => {
  const host = await newPhone(browser, 'Host', MODELS.pixel7, baseURL!);
  const guest = await newPhone(browser, 'Guest', MODELS.iphoneSE, baseURL!);
  const fan = await newPhone(browser, 'Fan', MODELS.pixel7, baseURL!);
  await prep(host, 'Dev'); await prep(guest, 'Riya'); await prep(fan, 'Kabir');
  await host.page.reload();
  await host.page.getByTestId('play-online').click();
  await host.page.getByTestId('online-host').click();
  await host.page.getByTestId('online-open').click();
  await expect(host.page.locator('.tp.live')).toBeVisible();
  await host.page.locator('[data-act=menu]').click();
  const link = (await host.page.getByTestId('table-link').textContent())!;
  await host.page.keyboard.press('Escape');
  const code = link.slice(-4);
  await guest.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(host.page.locator('.tp.live .seat')).toHaveCount(1);
  await host.page.locator('[data-act=deal]').click();
  await expect(host.page.locator('.tp.live .hc:not(.none)')).toBeVisible();
  // the fan watches with the watch link
  await fan.page.goto(`/#/w/${code}`);
  await expect(fan.page.getByTestId('watching')).toBeVisible();
  await expect(fan.page.locator('.tp.live .seat')).toHaveCount(2); // both players, seen from outside
  await expect(fan.page.locator('.tp.live .hc:not(.none)')).toHaveCount(0); // no cards of its own
  await expect(fan.page.locator('.tp.live .seat .shown')).toHaveCount(0); // and nobody's cards (until a showdown)
  await expect(fan.page.locator('.tp.live [data-act=fold], .tp.live [data-act=call], .tp.live [data-act=check]')).toHaveCount(0);
  await axe(fan, 'watching');
  expect(await host.page.locator('.tp.live .seat').count()).toBe(1); // a watcher is not a player
  // the fan takes a seat: dealt in from the next hand
  await fan.page.getByTestId('take-seat').click();
  await expect(fan.page.getByTestId('watching')).toHaveCount(0);
  await expect(host.page.locator('.tp.live .seat')).toHaveCount(2);
  // Riya leaves the table (sits out, seat kept) and is back home
  await autoAnswer(guest.page);
  await guest.page.locator('[data-act=menu]').click();
  await guest.page.getByTestId('leave-table').click();
  await expect(guest.page.getByTestId('play-online')).toBeVisible();
  await expect(host.page.locator('.tp.live .seat[data-n=Riya] .tag')).toContainText(/Sitting out|Fold|Connection lost/);
});

test('settings reach the table: four-colour deck, large text, no motion, cards face up', async ({ browser, baseURL }) => {
  const host = await newPhone(browser, 'Host', MODELS.pixel7, baseURL!);
  const guest = await newPhone(browser, 'Guest', MODELS.pixel7, baseURL!);
  await prep(host, 'Dev'); await prep(guest, 'Riya');
  await host.page.evaluate(() => localStorage.setItem('tp-prefs', JSON.stringify({ fourColor: true, largeText: true, motion: 'off', holdToPeek: false, winFx: 'off' })));
  await host.page.reload();
  await host.page.getByTestId('play-online').click();
  await host.page.getByTestId('online-host').click();
  await host.page.getByTestId('online-open').click();
  await host.page.locator('[data-act=menu]').click();
  const link = (await host.page.getByTestId('table-link').textContent())!;
  await host.page.keyboard.press('Escape');
  await guest.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(host.page.locator('.tp.live .seat')).toHaveCount(1);
  await host.page.locator('[data-act=deal]').click();
  await expect(host.page.locator('.tp.live.four.bigtext.still')).toBeVisible();
  await expect(host.page.locator('.tp.live .hc.peek')).toBeVisible(); // hold to look is off: cards face up
  await expect(host.page.locator('.tp.live .hhint')).toContainText(/You have (a |an |one |two |three |four |)?\w/); // what you hold, while you look
  const fs = await host.page.locator('.tp.live .seat .plate b').first().evaluate((e) => e.getBoundingClientRect().height);
  const gs = await guest.page.locator('.tp.live .seat .plate b').first().evaluate((e) => e.getBoundingClientRect().height);
  expect(fs).toBeGreaterThan(gs * 1.1); // the same phone size: names and chips 15% bigger
  await axe(host, 'table');
});
