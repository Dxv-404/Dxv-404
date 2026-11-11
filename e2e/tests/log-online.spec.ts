// The table log's history, against a real table server (the Oracle build, run locally): the server keeps the
// whole night; a laptop that reloads gets the latest hands back, and earlier ones as it scrolls up, until the
// first; a player is sent their own decision times and nobody else's.
import { test, expect } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODELS, newPhone, type Phone } from '../harness';

const root = join(import.meta.dirname, '..', '..');
const PORT = 18950 + Math.floor(Math.random() * 40);
let server: ChildProcess | null = null;

test.beforeAll(async () => {
  const b = spawnSync('pnpm', ['-s', 'build:node'], { cwd: join(root, 'apps/server'), encoding: 'utf8' });
  if (b.status !== 0) throw new Error(b.stderr);
  server = spawn(process.execPath, [join(root, 'apps/server/dist/node-server.mjs')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'tp-e2e-log-')), HAND_PAUSE_MS: '250' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
test.afterAll(() => { server?.kill('SIGKILL'); });

async function prep(p: Phone, name: string): Promise<void> {
  await p.page.evaluate(([port, n]) => {
    localStorage.setItem('tp-server-override', `ws://127.0.0.1:${port}`);
    localStorage.setItem('tp-name', n); localStorage.setItem('tp-intro-done', '1'); localStorage.setItem('tp-theme', 'classic'); localStorage.setItem('tp-bell-asked', '1');
  }, [String(PORT), name] as const);
}

test('a night of hands: the log comes back after a reload, earlier hands load on scrolling up, times are my own only', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const host = await newPhone(browser, 'Host', MODELS.pixel7, baseURL!);
  const lap = await newPhone(browser, 'Laptop', MODELS.laptop, baseURL!);
  await prep(host, 'Dev'); await prep(lap, 'Riya');
  await host.page.reload();
  await host.page.getByTestId('play-online').click();
  await host.page.getByTestId('online-host').click();
  await host.page.getByTestId('online-open').click();
  await expect(host.page.locator('.tp.live')).toBeVisible();
  await host.page.locator('[data-act=menu]').click();
  const link = (await host.page.getByTestId('table-link').textContent())!.replace(/^https?:\/\/[^/]+/, '');
  await host.page.keyboard.press('Escape');
  await lap.page.goto(link);
  await expect(host.page.locator('.tp.live .seat')).toHaveCount(1);
  await host.page.locator('[data-act=deal]').click();
  // twenty quick hands: whoever faces a bet folds (the first hand is called down, so there is a showdown in the log)
  const handNo = () => lap.page.locator('.tp.live .top .hm b, .tp.live .top .hm strong').first().textContent().then((t) => Number((t ?? '').replace(/\D/g, '')) || 0).catch(() => 0);
  const until = Date.now() + 150_000;
  while ((await handNo()) < 21 && Date.now() < until) {
    for (const p of [host, lap]) {
      const first = (await handNo()) <= 1;
      const b = p.page.locator(first ? '[data-act=check], [data-act=call]' : '[data-act=call] ~ [data-act=fold], [data-act=fold]:has(~ [data-act=call]), [data-act=check]').first();
      if (await b.isVisible().catch(() => false)) await b.click({ timeout: 1000 }).catch(() => {});
    }
    await host.page.waitForTimeout(120);
  }
  expect(await handNo()).toBeGreaterThanOrEqual(21);

  // the laptop's drawer has the night so far; reload: it comes back from the server
  const side = lap.page.locator('.tp.live .side');
  await expect(side.locator('.tlog .lgh').last()).toBeVisible();
  await lap.page.reload();
  await lap.page.getByText('Rejoin', { exact: true }).click(); // (a reload lands on the home screen, which offers the table back)
  await expect(side.locator('.tlog .lgh').last()).toBeVisible();
  const hands = () => side.locator('.tlog .lgh').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.h)));
  // the latest page: twelve hands, in order, ending with the hand being played
  await expect.poll(async () => (await hands()).length).toBeGreaterThanOrEqual(12);
  let hs = await hands();
  expect(hs).toEqual([...hs].sort((a, b) => a - b));
  expect(hs[0]).toBeGreaterThan(1);
  await expect(side.locator('.tlog-older')).toBeVisible();
  const sc = side.locator('.tlog-sc');
  const foot = await sc.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop);
  expect(foot).toBeLessThan(3);
  // scroll to the top: earlier hands arrive, and the line I was looking at stays put
  const firstShown = hs[0]!;
  await sc.evaluate((e) => { e.scrollTop = 0; });
  await expect.poll(async () => (await hands())[0]).toBe(0);
  const y = await side.locator(`.tlog .lgh[data-h="${firstShown}"]`).evaluate((e, scSel) => e.getBoundingClientRect().top - document.querySelector(scSel)!.getBoundingClientRect().top, '.tp.live .side .tlog-sc');
  expect(Math.abs(y)).toBeLessThan(60); // that hand is still at the top of the window, with the earlier ones above it
  hs = await hands();
  const top = hs[hs.length - 1]!;
  expect(hs).toEqual(Array.from({ length: top + 1 }, (_, i) => i)); // every hand of the night, none missing, none twice
  await expect(side.locator('.tlog-older')).toBeHidden();
  await expect(side.locator('.tlog .lgh[data-h="0"]')).toContainText('Dev joins the table');
  await expect(side.locator('.tlog .lgh[data-h="0"]')).toContainText('Riya joins the table');
  // hand 1 went to a showdown: both hands shown, a winner with five cards
  const h1 = side.locator('.tlog .lgh[data-h="1"]');
  await expect(h1.locator('.lgl.lg-show')).toHaveCount(2);
  await expect(h1.locator('.lgw .lgc .cd')).not.toHaveCount(0);
  // decision times: mine (Riya's) are there, in seconds; Dev's are not
  const times = await side.locator('.tlog .lgl.lx').evaluateAll((els) => els.map((e) => ({ who: e.querySelector('b')!.textContent, t: e.querySelector('time')?.textContent ?? null })));
  expect(times.filter((x) => x.who === 'Riya').length).toBeGreaterThan(5);
  expect(times.filter((x) => x.who === 'Riya').every((x) => /^(under 1s|\d+s)$/.test(x.t ?? ''))).toBe(true);
  expect(times.filter((x) => x.who === 'Dev').every((x) => x.t === null)).toBe(true);
  // and on the phone, in the pull-down's Log tab, Dev sees his own
  await host.page.locator('.tp.live .top .plb').click();
  await host.page.locator('[data-act="pull-log"]').click();
  await expect(host.page.locator('.tp-plpull .tlog .lgl.lg-me time').first()).toBeVisible();
  expect(await host.page.locator('.tp-plpull .tlog .lgl:not(.lg-me) time').count()).toBe(0);
});
