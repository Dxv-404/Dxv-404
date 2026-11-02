// Phase 6: online tables through the app's screens, in every theme. A table server (the Oracle build, run
// locally) holds the table; one phone opens it, the other follows the shared link; they play with the real
// buttons; holding the cards shows them; the host ends the night and both see the standings.
import { test, expect } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODELS, newPhone, type Phone } from '../harness';

const root = join(import.meta.dirname, '..', '..');
const PORT = 18600 + Math.floor(Math.random() * 300);
let server: ChildProcess | null = null;
const THEMES = ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo'];

test.beforeAll(async () => {
  const b = spawnSync('pnpm', ['-s', 'build:node'], { cwd: join(root, 'apps/server'), encoding: 'utf8' });
  if (b.status !== 0) throw new Error(b.stderr);
  server = spawn(process.execPath, [join(root, 'apps/server/dist/node-server.mjs')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'tp-e2e-online-')), HAND_PAUSE_MS: '800' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
test.afterAll(() => { server?.kill('SIGKILL'); });

async function prep(p: Phone, name: string, theme: string): Promise<void> {
  await p.page.evaluate(([port, n, t]) => {
    localStorage.setItem('tp-server-override', `ws://127.0.0.1:${port}`);
    localStorage.setItem('tp-name', n); localStorage.setItem('tp-intro-done', '1'); localStorage.setItem('tp-theme', t);
  }, [String(PORT), name, theme] as const);
}

for (const theme of THEMES) {
  test(`online table in the ${theme} theme: open, share the link, play, hold to look, end`, async ({ browser, baseURL }) => {
    const host = await newPhone(browser, 'Host', MODELS.pixel7, baseURL!);
    const guest = await newPhone(browser, 'Guest', theme === 'edo' ? MODELS.laptop : MODELS.iphoneSE, baseURL!);
    await prep(host, 'Dev', theme); await prep(guest, 'Riya', theme);
    await host.page.reload();
    await host.page.getByTestId('play-online').click();
    await host.page.getByTestId('online-host').click();
    await host.page.getByTestId('online-open').click();
    await expect(host.page.locator(`.tp.live.th-${theme}`)).toBeVisible();
    await host.page.locator('[data-act=menu]').click();
    const link = (await host.page.getByTestId('table-link').textContent())!;
    expect(link).toMatch(/#\/t\/[A-Z0-9]{4}$/);
    await host.page.keyboard.press('Escape');
    await guest.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(guest.page.locator('.tp.live .seat')).toHaveCount(1);
    await expect(host.page.locator('.tp.live .seat')).toHaveCount(1);
    await host.page.locator('[data-act=deal]').click();
    // play: whoever is to act checks or calls, for a few actions
    let acted = 0;
    const until = Date.now() + 40_000;
    while (acted < 6 && Date.now() < until) {
      for (const p of [host, guest]) {
        const b = p.page.locator('[data-act=check], [data-act=call]').first();
        if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); acted++; }
      }
      await host.page.waitForTimeout(250);
    }
    expect(acted).toBeGreaterThanOrEqual(4);
    // hold to look
    const hc = guest.page.locator('.hero .hc');
    if (await guest.page.locator('.hero .hc:not(.none)').count()) {
      await expect(hc).toBeVisible();
      await expect.poll(async () => !!(await hc.boundingBox())).toBe(true); // laid out (a redraw can be in flight)
      const box = (await hc.boundingBox())!;
      await guest.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await guest.page.mouse.down();
      await expect(guest.page.locator('.hero .hc.peek .cd:not(.dn)')).toHaveCount(2);
      await guest.page.mouse.up();
    }
    // the host ends the night
    await host.page.locator('[data-act=menu]').click();
    host.page.once('dialog', (d) => d.accept());
    await host.page.getByTestId('end-game').click();
    for (const p of [host, guest]) await expect(p.page.getByTestId('standings').locator('li')).toHaveCount(2);
    for (const p of [host, guest]) expect(p.errors.filter((e) => !/Failed to load resource|ERR_|net::|WebSocket/.test(e))).toEqual([]);
  });
}

test('@perf smooth on a mid-range phone (60 fps while playing) and still when motion is reduced (run alone: timing)', async ({ browser, baseURL }) => {
  const host = await newPhone(browser, 'Host', MODELS.pixel7, baseURL!);
  const guest = await newPhone(browser, 'Guest', MODELS.smallAndroid, baseURL!, { reducedMotion: 'reduce' });
  await prep(host, 'Dev', 'train'); await prep(guest, 'Riya', 'train');
  await host.page.reload();
  await host.page.getByTestId('play-online').click();
  await host.page.getByTestId('online-host').click();
  await host.page.getByTestId('online-open').click();
  await host.page.locator('[data-act=menu]').click();
  const link = (await host.page.getByTestId('table-link').textContent())!;
  await host.page.keyboard.press('Escape');
  await guest.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await host.page.locator('[data-act=deal]').click();
  // a mid-range phone: 4x slower CPU
  await host.cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await host.page.evaluate(() => {
    const w = window as unknown as { __frames: number[] };
    w.__frames = []; let last = performance.now();
    const loop = (t: number) => { w.__frames.push(t - last); last = t; if (w.__frames.length < 600) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  const until = Date.now() + 8000;
  while (Date.now() < until) {
    for (const p of [host, guest]) { const b = p.page.locator('[data-act=check], [data-act=call]').first(); if (await b.isVisible().catch(() => false)) await b.click().catch(() => {}); }
    await host.page.waitForTimeout(200);
  }
  const frames = (await host.page.evaluate(() => (window as unknown as { __frames: number[] }).__frames)).slice(5).sort((a, b) => a - b);
  const p50 = frames[Math.floor(frames.length * 0.5)]!, p95 = frames[Math.floor(frames.length * 0.95)]!;
  console.log(`frames ${frames.length}: median ${p50.toFixed(1)} ms, 95th ${p95.toFixed(1)} ms`);
  expect(p50).toBeLessThan(20); // 60 fps
  expect(p95).toBeLessThan(50); // no visible stutter (a dropped frame now and then while the table redraws)
  // reduced motion: nothing moves
  await expect(guest.page.locator('.tp.live.still')).toBeVisible();
  const moving = await guest.page.evaluate(() => Array.from(document.querySelectorAll('.tp.live *')).filter((e) => { const s = getComputedStyle(e); return s.animationName !== 'none' && s.animationDuration !== '0s'; }).length);
  expect(moving).toBe(0);
});
