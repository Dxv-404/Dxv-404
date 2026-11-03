// Table drama (docs/drama-authoring.md; plan: "Every dramatic moment", "Settings, fairness and limits"). A real
// online game at an Ink table (the Node table server, run locally): the Brawler shoves, the other player calls,
// and on both screens the three acts play in order: the in-hand scenes, the card reveal, the result scene in
// place of the winner card. Also: the turn timer is given the scene's length (not cut short), tap to skip works
// on that screen only, Table drama Off plays nothing, and motion off shows a still card.
//
// For a new character: copy the first test, change AVATAR (and the name), and run
//   pnpm -s build && PW_PORT=<port> npx playwright test e2e/tests/drama.spec.ts --workers=1
import { test, expect, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODELS, newPhone, type Phone, type PhoneModel } from '../harness';

const AVATAR = 'ink-brawler';
const root = join(import.meta.dirname, '..', '..');
const PORT = 18900 + Math.floor(Math.random() * 300);
let server: ChildProcess | null = null;
const PHONE: PhoneModel = { ...MODELS.pixel7, label: 'Phone 390x664', width: 390, height: 664 };

test.beforeAll(async () => {
  const b = spawnSync('pnpm', ['-s', 'build:node'], { cwd: join(root, 'apps/server'), encoding: 'utf8' });
  if (b.status !== 0) throw new Error(b.stderr);
  server = spawn(process.execPath, [join(root, 'apps/server/dist/node-server.mjs')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'tp-e2e-drama-')) }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
test.afterAll(() => { server?.kill('SIGKILL'); });

type Mark = { t: number; scene?: string; motion?: string; res?: string; gone?: string };
async function prep(p: Phone, name: string, o: { avatar?: string; prefs?: Record<string, unknown> } = {}): Promise<void> {
  await p.page.evaluate(([port, n, av, prefs]) => {
    localStorage.setItem('tp-server-override', `ws://127.0.0.1:${port}`);
    localStorage.setItem('tp-name', n); localStorage.setItem('tp-intro-done', '1'); localStorage.setItem('tp-theme', 'ink');
    localStorage.setItem('tp-online-settings', JSON.stringify({ startStack: 1000, sb: 5, bb: 10, turnTime: 20, rebuys: true }));
    if (av) localStorage.setItem('tp-avatar', JSON.stringify(av));
    if (prefs) localStorage.setItem('tp-prefs', prefs);
  }, [String(PORT), name, o.avatar ?? '', o.prefs ? JSON.stringify(o.prefs) : ''] as const);
  // a timeline of what this screen showed: scenes coming and going, and the steps after the hand
  await p.ctx.addInitScript(() => {
    const w = window as unknown as { __dr: Mark[] };
    type Mark = { t: number; scene?: string; motion?: string; res?: string; gone?: string };
    w.__dr = [];
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'attributes' && (m.target as HTMLElement).classList?.contains('tp-stage')) {
          const r = (m.target as HTMLElement).dataset.res;
          if (r && w.__dr[w.__dr.length - 1]?.res !== r) w.__dr.push({ t: performance.now(), res: r });
        }
        for (const n of Array.from(m.addedNodes)) if (n instanceof HTMLElement && n.classList.contains('dr-scene')) w.__dr.push({ t: performance.now(), scene: n.dataset.kind, motion: n.dataset.motion });
        for (const n of Array.from(m.removedNodes)) if (n instanceof HTMLElement && n.classList.contains('dr-scene')) w.__dr.push({ t: performance.now(), gone: n.dataset.kind });
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-res'] });
  });
  await p.page.reload();
}
const marks = (p: Page): Promise<Mark[]> => p.evaluate(() => (window as unknown as { __dr: Mark[] }).__dr);

async function openTable(host: Phone, guest: Phone): Promise<void> {
  await host.page.getByTestId('play-online').click();
  await host.page.getByTestId('online-host').click();
  await host.page.getByTestId('online-open').click();
  await expect(host.page.locator('.tp.live.th-ink')).toBeVisible();
  await host.page.locator('[data-act=menu]').click();
  const link = (await host.page.getByTestId('table-link').textContent())!;
  await host.page.keyboard.press('Escape');
  await guest.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(guest.page.locator('.tp.live .seat')).toHaveCount(1);
  await expect(host.page.locator('.tp.live .seat')).toHaveCount(1);
  await host.page.locator('[data-act=deal]').click();
}
/** Whoever acts first shoves (the raise sheet's All-in); returns who shoved and who answers. */
async function shove(a: Phone, b: Phone): Promise<[Phone, Phone]> {
  const act = (p: Phone) => p.page.locator('.tp.live .actions [data-act=raise]');
  await expect.poll(async () => (await act(a).isVisible()) || (await act(b).isVisible()), { timeout: 20_000 }).toBe(true);
  const [s, c] = (await act(a).isVisible()) ? [a, b] : [b, a];
  await act(s).click();
  await s.page.locator('.tp-raise .rpre button[data-p=all]').click();
  await s.page.locator('.tp-raise .go').click();
  return [s, c];
}

test('an all-in at an Ink table: in-hand scene, reveal, result scene, in order, on a phone and a laptop', async ({ browser, baseURL }) => {
  const host = await newPhone(browser, 'Host', PHONE, baseURL!);
  const guest = await newPhone(browser, 'Guest', MODELS.laptop, baseURL!);
  await prep(host, 'Dev', { avatar: AVATAR }); await prep(guest, 'Riya');
  await openTable(host, guest);
  const [shover, caller] = await shove(host, guest);
  // act one on both screens; the caller's turn timer is given the scene's length (20 s + 1.8 s)
  for (const p of [host, guest]) await expect(p.page.locator('.dr-scene[data-kind=allin]')).toBeVisible({ timeout: 5000 });
  const timer = caller.page.locator('.tp.live .tbank .rg span');
  await expect(timer).toBeVisible({ timeout: 5000 });
  expect(Number(await timer.textContent())).toBeGreaterThanOrEqual(21);
  // on the phone the scene never covers the player's own cards and buttons
  const sc = await host.page.locator('.dr-scene').boundingBox();
  const hero = await host.page.locator('.tp.live .hero').boundingBox();
  if (sc && hero) expect(sc.y + sc.height).toBeLessThanOrEqual(hero.y + 1);
  await caller.page.locator('.tp.live .actions [data-act=call]').click({ timeout: 10_000 });
  // act three: the result scene, after the reveal
  const RESULT = /^(allinResult|comeback|split|lastStanding)$/;
  for (const p of [host, guest]) await expect.poll(async () => (await marks(p.page)).some((m) => RESULT.test(m.scene ?? '')), { timeout: 20_000 }).toBe(true);
  // tap to skip: the laptop skips its result scene; the phone's keeps playing
  const lapScene = guest.page.locator('.dr-scene');
  if (await lapScene.isVisible()) {
    await lapScene.click();
    await expect(lapScene).toHaveCount(0, { timeout: 600 });
  }
  for (const p of [host, guest]) {
    const ms = await marks(p.page);
    const i1 = ms.findIndex((m) => m.scene === 'allin');
    const i2 = ms.findIndex((m) => m.scene === 'allinAnswered');
    const reveal = ms.findIndex((m) => m.res === 'runout' || m.res === 'scene');
    const i3 = ms.findIndex((m) => RESULT.test(m.scene ?? ''));
    expect(i1, p.name).toBeGreaterThanOrEqual(0);
    expect(i2, p.name).toBeGreaterThan(i1);
    expect(reveal, p.name).toBeGreaterThan(i2);
    expect(i3, p.name).toBeGreaterThan(reveal);
    // one scene at a time: each scene had gone before the next came
    const shown = ms.filter((m) => m.scene || m.gone);
    for (let k = 1; k < shown.length; k++) if (shown[k]!.scene) expect(shown[k - 1]!.gone, `${p.name}: ${JSON.stringify(shown)}`).toBeTruthy();
    // the result scene played in place of the winner card
    expect(ms[i3]!.motion).toBe('full');
  }
  expect([shover.name, caller.name].sort()).toEqual(['Guest', 'Host']);
  for (const p of [host, guest]) expect(p.errors.filter((e) => !/Failed to load resource|ERR_|net::|WebSocket/.test(e))).toEqual([]);
});

test('Table drama Off plays nothing; motion off shows a still card', async ({ browser, baseURL }) => {
  const host = await newPhone(browser, 'Host', PHONE, baseURL!);
  const guest = await newPhone(browser, 'Guest', MODELS.laptop, baseURL!);
  await prep(host, 'Dev', { avatar: AVATAR, prefs: { drama: 'off' } });
  await prep(guest, 'Riya', { prefs: { motion: 'off' } });
  await openTable(host, guest);
  const [, caller] = await shove(host, guest);
  // motion off: a still card, gone after about 1.2 s
  await expect(guest.page.locator('.dr-scene[data-motion=still]').first()).toBeVisible({ timeout: 5000 });
  await caller.page.locator('.tp.live .actions [data-act=call]').click({ timeout: 10_000 });
  await expect.poll(async () => (await marks(guest.page)).filter((m) => m.scene).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
  const g = await marks(guest.page);
  expect(g.filter((m) => m.scene).every((m) => m.motion === 'still')).toBe(true);
  const first = g.find((m) => m.scene)!, gone = g.find((m) => m.gone)!;
  expect(gone.t - first.t).toBeGreaterThan(1000);
  expect(gone.t - first.t).toBeLessThan(2500);
  // drama off: nothing at all on the host's phone, and the hand still ends normally
  await expect.poll(async () => (await marks(host.page)).some((m) => m.res === 'hold' || m.res === 'all'), { timeout: 20_000 }).toBe(true);
  expect((await marks(host.page)).filter((m) => m.scene)).toEqual([]);
});
