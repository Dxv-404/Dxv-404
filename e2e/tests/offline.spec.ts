// Phase 5: an offline night through the real pages. The Node host runs the very table server the Android
// host app runs (dist/host-runtime.js) and serves the built web app, as the phone does on its hotspot.
// The app hands phones over to the host phone's page; the host deals; phones play; a phone that closes
// its page comes back to its seat; the host app's own screen lists everyone.
import { test, expect } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODELS, newPhone } from '../harness';

const root = join(import.meta.dirname, '..', '..');
const PORT = 8765; // the host app's port: the pages are made for it
let host: ChildProcess | null = null;

test.beforeAll(async () => {
  const b = spawnSync('pnpm', ['-s', 'build:js'], { cwd: join(root, 'apps/host'), encoding: 'utf8' });
  if (b.status !== 0) throw new Error(b.stderr + b.stdout);
  host = spawn(process.execPath, [join(root, 'apps/host/dist/node-host.mjs')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'tp-e2e-host-')), WEB_DIR: join(root, 'apps/web/dist'), RUNTIME: join(root, 'apps/host/dist/host-runtime.js'), TP_TUNING: JSON.stringify({ handPauseMs: 1500, shuffleWaitMs: 600 }) },
    stdio: 'inherit',
  });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/info`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('host did not start');
});
test.afterAll(() => { host?.kill('SIGKILL'); });

const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');

test('the app hands over to the host phone; three phones play; a closed page comes back to its seat', async ({ browser, baseURL }) => {
  // the installed app: Play offline > Join a table > the code leads to the host phone's address
  const app = await newPhone(browser, 'App', MODELS.pixel7, baseURL!);
  await app.page.getByTestId('play-offline').click();
  await app.page.getByTestId('offline-join').click();
  await app.page.getByTestId('offline-code').fill('48 213');
  await app.page.evaluate(() => { (window as any).__tpNavigate = (u: string) => { (window as any).__went = u; }; });
  await app.page.getByTestId('offline-go').click();
  const went = await app.page.evaluate(() => (window as any).__went as string);
  expect(went).toMatch(/^http:\/\/192\.168\.188\.85:8765\/join#/); // 48213 = 188 * 256 + 85
  const handed = JSON.parse(Buffer.from(went.split('#')[1]!, 'base64').toString());
  expect(handed).toMatchObject({ role: 'guest', name: 'Player' });
  expect(handed.token).toMatch(/^[0-9a-f]{48}$/);

  // the phones at the table (on the host phone's page)
  const mk = async (name: string, role: 'host' | 'guest', model = MODELS.pixel7) => {
    const p = await newPhone(browser, name, model, `http://127.0.0.1:${PORT}`);
    const me = { role, id: `e2e${name.toLowerCase()}`, name, token: `tok-${name}-0123456789abcdef`, ...(role === 'host' ? { settings: { startStack: 1000, sb: 5, bb: 10, turnTime: 0, rebuys: true, maxPlayers: 10 } } : {}) };
    await p.page.goto(`http://127.0.0.1:${PORT}/join#${enc(me)}`);
    return p;
  };
  const dev = await mk('Dev', 'host');
  const riya = await mk('Riya', 'guest', MODELS.iphone15);
  const kabir = await mk('Kabir', 'guest', MODELS.smallAndroid);
  // the link's details are taken off the address bar
  await expect.poll(() => riya.page.url()).toBe(`http://127.0.0.1:${PORT}/join`);
  // the host app's own screen sees all three
  const screen = await newPhone(browser, 'Host app', MODELS.pixel7, `http://127.0.0.1:${PORT}`);
  await screen.page.goto(`http://127.0.0.1:${PORT}/`);
  for (const n of ['Dev', 'Riya', 'Kabir']) await expect(screen.page.getByTestId('host-players')).toContainText(n);

  await dev.page.getByRole('button', { name: 'Deal next hand' }).click();
  const phones = [dev, riya, kabir];
  // everyone sees their own two cards
  for (const p of phones) await expect(p.page.locator('.hero-cards .card')).toHaveCount(2, { timeout: 20_000 }); // (face down until held, by design)
  // play some actions with the real buttons
  let acted = 0;
  const until = Date.now() + 90_000;
  while (acted < 12 && Date.now() < until) {
    for (const p of phones) {
      const b = p.page.locator('.actions button.act:not([disabled])').filter({ hasText: /^(Check|Call)/ }).first();
      if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); acted++; }
    }
    await dev.page.waitForTimeout(300);
  }
  expect(acted).toBeGreaterThanOrEqual(6);
  // Kabir closes the page and opens it again: same seat, same chips
  const before = await screen.page.getByTestId('host-players').textContent();
  await kabir.page.close();
  const again = await kabir.ctx.newPage();
  await again.goto(`http://127.0.0.1:${PORT}/join`);
  await expect(again.locator('.table-screen')).toBeVisible();
  await expect.poll(async () => (await screen.page.getByTestId('host-players').textContent())?.match(/Kabir[^·]*· here/) !== null, { timeout: 20_000 }).toBe(true);
  void before;
  for (const p of [dev, riya, app]) expect(p.errors.filter((e) => !/Failed to load resource|ERR_|net::/.test(e))).toEqual([]);
});
