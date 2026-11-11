// Player avatars (the approved board, tools/design/avatars): "Choose your avatar" from the menu and from Profile,
// a pick from another theme shown in its own style everywhere the player appears (menu, Profile, the table and
// the other players' phones, the crews screens), Initials going back to letters, a guest's pick kept on the
// phone (and taken along when the phone makes its profile), bad ids refused, and the picker and those screens
// at every size of the brief with real device emulation, the picker in all nine themes. The accounts database
// is a fresh local copy (e2e/localdb.ts); the table server is the Oracle build run locally.
import { test, expect, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { Engine, sha256hex } from '@tp/engine';
import { LocalDb, pgUp } from '../localdb';
import { THEMES, call, crewWith, game, layoutOk, person, phone, signInAs, targetsOk, type Person } from '../crews-helpers';
import { textContrast } from '../contrast';

test.skip(!pgUp(), 'needs the local Postgres (pnpm test:db uses the same one)');
test.describe.configure({ mode: 'default', timeout: 300_000 });

const root = join(import.meta.dirname, '..', '..');
const PORT = 19300 + Math.floor(Math.random() * 300);
const SHOTS = process.env.AV_SHOTS ?? '';
const db = new LocalDb();
let server: ChildProcess | null = null;
let base = '';

test.beforeAll(async () => {
  db.create();
  const b = spawnSync('pnpm', ['-s', 'build:node'], { cwd: join(root, 'apps/server'), encoding: 'utf8' });
  if (b.status !== 0) throw new Error(b.stderr);
  server = spawn(process.execPath, [join(root, 'apps/server/dist/node-server.mjs')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'tp-e2e-avatars-')), HAND_PAUSE_MS: '800' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
test.afterAll(() => { server?.kill('SIGKILL'); db.drop(); });
test.beforeEach(({ baseURL }) => { base = baseURL!; });

const shot = async (page: Page, name: string): Promise<void> => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

// ---------------------------------------------------------------- helpers
/** A guest phone (no profile) with a theme, a name, a motion setting and (optionally) an avatar already kept. */
async function guest(browser: Browser, o: { theme?: string; name?: string; avatar?: string | null; motion?: string; device?: string; width?: number; height?: number } = {}): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const d = o.device ? devices[o.device]! : null;
  const width = o.width ?? d?.viewport.width ?? 390, height = o.height ?? d?.viewport.height ?? 844;
  const mobile = d ? d.isMobile : width < 1000;
  const ctx = await browser.newContext({
    baseURL: base, viewport: { width, height }, serviceWorkers: 'block',
    ...(d ? { userAgent: d.userAgent, deviceScaleFactor: Math.min(d.deviceScaleFactor, 2), isMobile: d.isMobile, hasTouch: d.hasTouch } : { deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile }),
  });
  await db.attach(ctx);
  await ctx.addInitScript(([theme, name, motion, av, port]) => {
    try {
      if (sessionStorage.getItem('tp-test-init')) return; // once per tab: later reloads keep what the page kept
      sessionStorage.setItem('tp-test-init', '1');
      localStorage.setItem('tp-loaded', '1'); localStorage.setItem('tp-guest-only', '1'); localStorage.setItem('tp-intro-done', '1');
      localStorage.setItem('tp-theme', theme!); localStorage.setItem('tp-name', name!);
      localStorage.setItem('tp-prefs', JSON.stringify({ motion }));
      localStorage.setItem('tp-server-override', `ws://127.0.0.1:${port}`);
      if (av) localStorage.setItem('tp-avatar', av);
    } catch { /* blocked */ }
  }, [o.theme ?? 'classic', o.name ?? 'Dev', o.motion ?? 'off', o.avatar === undefined || o.avatar === null ? '' : JSON.stringify(o.avatar), String(PORT)]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|favicon|WebSocket|local stand-in/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  return { ctx, page, errors };
}

/** The avatar drawn in `sel` (a picked one: its id; initials: null), once its drawing is in. */
async function shownAvatar(page: Page, sel: string): Promise<string | null> {
  const el = page.locator(sel).first();
  await expect(el).toBeVisible();
  const has = await el.locator('.tpav').count();
  if (!has) return null;
  await expect(el.locator('.tpav > svg')).toHaveCount(1);
  return el.locator('.tpav').getAttribute('data-av');
}

/** Every picked avatar inside `scope`: drawn (its SVG in), at least `min` px, on screen sideways, ids unique. */
async function avatarsDrawn(page: Page, scope: string, min = 21.5): Promise<{ bad: string[]; n: number; ids: string[] }> {
  await page.waitForFunction((s) => Array.from(document.querySelectorAll(`${s} .tpav`)).every((e) => e.querySelector('svg')), scope);
  return page.evaluate(([s, mn]) => {
    const bad: string[] = [];
    const W = document.documentElement.clientWidth;
    const all = Array.from(document.querySelectorAll<HTMLElement>(`${s} .tpav`));
    for (const e of all) {
      const svg = e.querySelector('svg');
      const r = (svg ?? e).getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (!svg) bad.push(`${e.dataset.av}: not drawn`);
      if (cs.visibility === 'hidden' || !e.checkVisibility()) continue; // (in a part of the screen not shown at this size)
      if (r.width < (mn as number) || r.height < (mn as number)) bad.push(`${e.dataset.av}: ${r.width.toFixed(1)}x${r.height.toFixed(1)} px`);
      if (r.left < -1 || r.right > W + 1) {
        let scroller = false;
        for (let p = e.parentElement; p; p = p.parentElement) { const st = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(st.overflowX) && p.scrollWidth > p.clientWidth + 1) { scroller = true; break; } }
        if (!scroller) bad.push(`${e.dataset.av}: off screen ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
    }
    // every copy has its own ids (no two clip paths share one)
    const ids = Array.from(document.querySelectorAll('.tpav [id]')).map((x) => x.id);
    const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    if (dup.length) bad.push(`ids repeat: ${[...new Set(dup)].slice(0, 3).join(', ')}`);
    return { bad, n: all.length, ids: all.map((e) => e.dataset.av!) };
  }, [scope, min] as const);
}

/** The picker on screen: nothing off the edge or on top of each other, nothing cut off, every target 44 px, all
 *  eight drawings in, the button whole on screen. */
async function pickerOk(page: Page, where: string): Promise<void> {
  await expect(page.locator('.avp .a-tile')).toHaveCount(8);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.avp .tpav')).every((e) => e.querySelector('svg')));
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
    if (document.documentElement.scrollWidth > W + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${W})`);
    const root = document.querySelector('.avp')!;
    const vis = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    // what of an element is on screen: its box cut by every scrolling box it sits in, and by the screen
    const shown = (e: Element) => {
      let r = e.getBoundingClientRect(); let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const st = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(st.overflowX + st.overflowY)) { r = p.getBoundingClientRect(); x0 = Math.max(x0, r.left); y0 = Math.max(y0, r.top); x1 = Math.min(x1, r.right); y1 = Math.min(y1, r.bottom); }
      }
      x0 = Math.max(x0, 0); y0 = Math.max(y0, 0); x1 = Math.min(x1, W); y1 = Math.min(y1, H);
      return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
    };
    const btns = Array.from(root.querySelectorAll<HTMLElement>('button')).filter(vis);
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      const label = (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 18);
      if (r.width < 43.5 || r.height < 43.5) out.push(`small target "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (r.left < -1 || r.right > W + 1) {
        const inRow = b.closest('.a-tabs');
        if (!inRow) out.push(`off the edge "${label}" ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
    }
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const a = shown(btns[i]!), b = shown(btns[j]!);
      if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 2 && oy > 2) out.push(`overlap "${btns[i]!.textContent!.trim().slice(0, 14)}" / "${btns[j]!.textContent!.trim().slice(0, 14)}"`);
    }
    for (const e of Array.from(root.querySelectorAll<HTMLElement>('.a-tn, .a-pv-name, .a-cta, .a-pill, h2, .a-it b, .a-it span, .a-sp b, .a-cap, .a-pk-note')).filter(vis)) {
      const s = getComputedStyle(e);
      if (s.textOverflow === 'ellipsis') continue;
      // text wider than its box (it would wrap or run out of it), or taller than a box that clips it
      const clips = s.overflow !== 'visible' || getComputedStyle(e.parentElement!).overflow !== 'visible';
      if (e.scrollWidth > e.clientWidth + 1 || (clips && e.scrollHeight > e.clientHeight + 2)) out.push(`cut off "${(e.textContent ?? '').trim().slice(0, 24)}"`);
    }
    const cta = root.querySelector('.a-cta')!.getBoundingClientRect();
    if (cta.top < 0 || cta.bottom > H + 0.5 || cta.left < 0 || cta.right > W + 0.5) out.push(`"Use" button not whole on screen (${Math.round(cta.top)}..${Math.round(cta.bottom)} of ${H})`);
    const back = root.querySelector('[data-x=back]')!.getBoundingClientRect();
    if (back.top < 0 || back.left < 0) out.push('back button off screen');
    for (const t of Array.from(root.querySelectorAll('.a-tile .a-art'))) { const r = t.getBoundingClientRect(); if (r.width < 22) out.push(`tile art ${r.width.toFixed(1)} px`); }
    return out;
  });
  expect(bad, where).toEqual([]);
}

const openPickerFromMenu = async (page: Page): Promise<void> => {
  await page.getByTestId('menu-avatar').click();
  await expect(page.getByTestId('avatar-picker')).toBeVisible();
  await expect(page.locator('.avp .a-tile')).toHaveCount(8);
};

// ---------------------------------------------------------------- a guest
test('a guest picks an avatar from another theme: ring and check, live preview, kept on the phone; Initials goes back to letters', async ({ browser }) => {
  const { ctx, page, errors } = await guest(browser, { theme: 'classic', name: 'Dev', motion: 'full' });
  await page.goto('/');
  expect(await shownAvatar(page, '[data-testid=menu-avatar]')).toBeNull(); // initials, as today
  // the set is not loaded for a player with no avatar (the menu stays light)
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /\/set-[\w-]+\.js$/.test(r.name)))).toBe(false);
  await openPickerFromMenu(page);
  // with no pick it starts on the theme the app is in, with Initials chosen
  await expect(page.locator('.avp .a-tab.a-on')).toHaveAttribute('data-tab', 'classic');
  await expect(page.locator('.avp .a-ini-opt')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.avp .a-pv-name')).toHaveText('Initials');
  await expect(page.getByTestId('avp-use')).toHaveText('Use initials');
  // another style's tab, then a tile: ring, check badge, preview, style tag
  await page.locator('.avp .a-tab[data-tab=train]').click();
  await expect(page.locator('.avp .a-tab.a-on')).toHaveAttribute('data-tab', 'train');
  await expect(page.locator('.avp .a-tile .a-tn')).toHaveText(['The Conductor', 'The Stoker', 'The Traveller', 'The Porter', 'The Stationmaster', 'Night Owl', 'Night Express', 'Moonline']);
  await page.locator('.avp [data-av-id=train-night-owl]').click();
  const tile = page.locator('.avp [data-av-id=train-night-owl]');
  await expect(tile).toHaveClass(/a-on/);
  await expect(tile).toHaveAttribute('aria-checked', 'true');
  await expect(tile.locator('.a-chk')).toBeVisible();
  await expect(page.locator('.avp .a-tile.a-on')).toHaveCount(1);
  const ring = await tile.evaluate((e) => getComputedStyle(e).boxShadow);
  expect(ring).toMatch(/0px 0px 0px 2px/);
  await expect(page.locator('.avp .a-pv-name')).toHaveText('Night Owl');
  await expect(page.locator('.avp .a-pv-from')).toHaveText('Night Train style');
  for (const s of ['.a-pv-hero', '.a-pv-seat', '.a-pv-crew .a-crow:first-child']) expect(await shownAvatar(page, `.avp ${s}`)).toBe('train-night-owl');
  await expect(page.locator('.avp .a-ini-opt')).toHaveAttribute('aria-checked', 'false');
  await pickerOk(page, 'guest picker');
  await shot(page, 'guest-picker');
  // Back: nothing kept
  await page.locator('.avp [data-x=back]').click();
  await expect(page.getByTestId('avatar-picker')).toHaveCount(0);
  expect(await shownAvatar(page, '[data-testid=menu-avatar]')).toBeNull();
  // again, and keep it this time
  await openPickerFromMenu(page);
  await page.locator('.avp .a-tab[data-tab=train]').click();
  await page.locator('.avp [data-av-id=train-night-owl]').click();
  await page.getByTestId('avp-use').click();
  await expect(page.getByTestId('avatar-picker')).toHaveCount(0);
  expect(await shownAvatar(page, '[data-testid=menu-avatar]')).toBe('train-night-owl');
  expect(await page.evaluate(() => localStorage.getItem('tp-avatar'))).toBe('"train-night-owl"');
  // a new open of the app: the pick is still there, in its own style in another theme too
  await page.evaluate(() => localStorage.setItem('tp-theme', 'ink'));
  await page.reload();
  await expect(page.locator('#app.th-ink')).toBeVisible();
  expect(await shownAvatar(page, '[data-testid=menu-avatar]')).toBe('train-night-owl');
  // the picker opens on the pick's own style
  await openPickerFromMenu(page);
  await expect(page.locator('.avp .a-tab.a-on')).toHaveAttribute('data-tab', 'train');
  await expect(page.locator('.avp .a-tile.a-on')).toHaveAttribute('data-av-id', 'train-night-owl');
  // Initials: letters again
  await page.locator('.avp [data-x=initials]').click();
  await expect(page.locator('.avp .a-ini-opt')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.avp .a-tile.a-on')).toHaveCount(0);
  await expect(page.locator('.avp .a-pv-name')).toHaveText('Initials');
  await page.getByTestId('avp-use').click();
  await expect(page.getByTestId('avatar-picker')).toHaveCount(0);
  expect(await shownAvatar(page, '[data-testid=menu-avatar]')).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('tp-avatar'))).toBeNull();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('the picker with the keyboard: Escape closes, arrows move between styles, focus stays inside', async ({ browser }) => {
  const { ctx, page, errors } = await guest(browser, { width: 1440, height: 900, theme: 'noir', avatar: 'pixel-wizard' });
  await page.goto('/');
  await openPickerFromMenu(page);
  await expect(page.locator('.avp .a-tile.a-on')).toBeFocused();
  await page.locator('.avp .a-tab.a-on').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.avp .a-tab.a-on')).toHaveAttribute('data-tab', 'train');
  await expect(page.locator('.avp .a-tab.a-on')).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.avp .a-tab.a-on')).toHaveAttribute('data-tab', 'ink');
  // "Jump to another style" (laptop): the strip has the other eight styles, and jumps
  await expect(page.locator('.avp .a-sp')).toHaveCount(8);
  await page.locator('.avp .a-sp[data-tab=edo]').click();
  await expect(page.locator('.avp .a-tab.a-on')).toHaveAttribute('data-tab', 'edo');
  await expect(page.locator('.avp .a-sp[data-tab=edo]')).toHaveCount(0);
  for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('.avp'))).toBe(true); }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('avatar-picker')).toHaveCount(0);
  expect(await shownAvatar(page, '[data-testid=menu-avatar]')).toBe('pixel-wizard'); // unchanged
  expect(errors).toEqual([]);
  await ctx.close();
});

// ---------------------------------------------------------------- motion
for (const motion of ['full', 'calm', 'off', 'reduced'] as const) {
  test(`picker motion: ${motion}`, async ({ browser }) => {
    const { ctx, page } = await guest(browser, { theme: 'cyber', motion: motion === 'reduced' ? 'full' : motion });
    if (motion === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await openPickerFromMenu(page);
    const running = () => page.evaluate(() => document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest?.('.avp')).map((a) => {
      const t = (a.effect as KeyframeEffect).getComputedTiming();
      return { d: Number(t.duration), easing: (a.effect as KeyframeEffect).getTiming().easing };
    }));
    await page.locator('.avp .a-tab[data-tab=edo]').click();
    const tabAnims = await running();
    await page.locator('.avp [data-av-id=edo-maiko]').click();
    const selAnims = await running();
    if (motion === 'off' || motion === 'reduced') {
      expect(tabAnims).toEqual([]);
      expect(selAnims).toEqual([]);
    } else if (motion === 'calm') {
      // calm: a short fade, nothing that moves or pops
      expect(tabAnims.length).toBeGreaterThan(0);
      expect(Math.max(...tabAnims.map((a) => a.d))).toBeLessThanOrEqual(160 * 0.85 * 0.6 + 1);
      expect(selAnims.length).toBeLessThanOrEqual(1 + tabAnims.length);
    } else {
      // full: the tiles come in one after another, the check pops, in the theme's easing and speed (cyber: 0.85)
      expect(tabAnims.length).toBeGreaterThanOrEqual(8);
      expect(tabAnims.every((a) => a.easing === 'cubic-bezier(0.15, 0.9, 0.25, 1)')).toBe(true);
      expect(tabAnims[0]!.d).toBeCloseTo(260 * 0.85, 0);
      expect(selAnims.length).toBeGreaterThan(0);
    }
    await expect(page.locator('.avp [data-av-id=edo-maiko]')).toHaveClass(/a-on/); // the end state is the same
    await ctx.close();
  });
}

// ---------------------------------------------------------------- bad ids
test('ids that are not avatars are refused: by the database, by the table server, and shown as initials on the phone', async ({ browser }) => {
  const zed = await person(db, 'Zed');
  for (const bad of ['https://evil.example/me.png', 'tp:../../x', 'Train-Night-Owl', 'train-', '<svg onload=alert(1)>', 'dragon-knight']) {
    const r = await db.rpc(zed.auth, 'set_avatar', { p_avatar: bad });
    expect(r.status, bad).toBe(400);
    expect((r.json as { message: string }).message).toBe('Unknown avatar');
  }
  expect(await db.sql(`select coalesce(avatar_url, 'none') from accounts where id = '${zed.id}'`)).toBe('none');
  // a phone holding junk (or an id this build does not know) shows initials and sends nothing bad to tables
  for (const junk of ['"space-astronaut"', '"<img src=x>"', '{"a":1}', 'not json']) {
    const { ctx, page, errors } = await guest(browser, {});
    await page.addInitScript((v) => { localStorage.setItem('tp-avatar', v); }, junk);
    await page.goto('/');
    expect(await shownAvatar(page, '[data-testid=menu-avatar]'), junk).toBeNull();
    expect(errors).toEqual([]);
    await ctx.close();
  }
  // the table server: a malformed avatar is refused with the hello; an unknown, well-formed one sits as initials
  const hello = (player: string, avatar: unknown, settings?: Record<string, unknown>) => new Promise<{ t: string; code?: string; view?: { players: { id: string; avatar?: string }[] } }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/table/BADAV1`);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: 1, table: 'BADAV1', player, lastSeq: 0, token: 'x'.repeat(24) + player, name: player.slice(0, 10), avatar, ...(settings ? { settings } : {}) })));
    ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.t === 'welcome' || m.t === 'error') { resolve(m); ws.close(); } });
    ws.on('error', reject);
  });
  const h1 = await hello('gAvatarHost01', 'train-night-owl', {});
  expect(h1.t).toBe('welcome');
  expect(h1.view!.players.find((p) => p.id === 'gAvatarHost01')!.avatar).toBe('train-night-owl');
  for (const av of ['<svg onload=alert(1)>', 'tp:train-night-owl', 'X', 42]) {
    const r = await hello(`gAvatarBad${String(Math.random()).slice(2, 8)}`, av);
    expect(r.t, String(av)).toBe('error');
    expect(r.code).toBe('bad_message');
  }
  const h2 = await hello('gAvatarNewer1', 'space-astronaut');
  expect(h2.t).toBe('welcome');
  expect(h2.view!.players.find((p) => p.id === 'gAvatarNewer1')!.avatar).toBeUndefined();
});

// ---------------------------------------------------------------- at the table: the other player sees it
test('at the table: each player sees the other\'s pick in its own style, whatever their theme; Initials players keep letters', async ({ browser }) => {
  const host = await guest(browser, { device: 'Pixel 7', theme: 'noir', name: 'Dev', avatar: 'pixel-wizard' });
  const other = await guest(browser, { device: 'iPhone 13', theme: 'ivory', name: 'Riya', avatar: 'edo-maiko' });
  const third = await guest(browser, { width: 1440, height: 900, theme: 'cyber', name: 'Kabir' }); // no pick: initials
  await host.page.goto('/');
  await host.page.getByTestId('play-online').click();
  await host.page.getByTestId('online-host').click();
  await host.page.getByTestId('online-open').click();
  await expect(host.page.locator('.tp.live.th-noir')).toBeVisible();
  await host.page.locator('[data-act=menu]').click();
  const link = (await host.page.getByTestId('table-link').textContent())!.replace(/^https?:\/\/[^/]+/, '');
  await host.page.keyboard.press('Escape');
  await other.page.goto(link);
  await third.page.goto(link);
  for (const p of [host, other, third]) await expect(p.page.locator('.tp.live .seat')).toHaveCount(2);
  const seatAv = (p: Page, name: string) => shownAvatar(p, `.tp.live .seat[data-n="${name}"] .av`);
  expect(await seatAv(host.page, 'Riya')).toBe('edo-maiko');
  expect(await seatAv(host.page, 'Kabir')).toBeNull();
  expect(await seatAv(other.page, 'Dev')).toBe('pixel-wizard');
  expect(await seatAv(third.page, 'Dev')).toBe('pixel-wizard');
  expect(await seatAv(third.page, 'Riya')).toBe('edo-maiko');
  // your own line under your cards
  expect(await shownAvatar(host.page, '.tp.live .hero .hname')).toBe('pixel-wizard');
  expect(await shownAvatar(other.page, '.tp.live .hero .hname')).toBe('edo-maiko');
  await expect(third.page.locator('.tp.live .hero .hname .hav')).toHaveCount(0);
  // the drawing is the same on a Noir and a Cyber phone (its own style, not the theme's)
  const art = (p: Page) => p.locator('.tp.live .seat[data-n="Riya"] .tpav').evaluate((e) => e.innerHTML.replace(/tpav\d+-/g, 'tpav-'));
  expect(await art(host.page)).toBe(await art(third.page));
  for (const p of [host, other, third]) { const r = await avatarsDrawn(p.page, '.tp.live'); expect(r.bad).toEqual([]); }
  // play a hand to the end: avatars stay through the hand and the results
  await host.page.locator('[data-act=deal]').click();
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    let any = false;
    for (const p of [host, other, third]) {
      const b = p.page.locator('[data-act=check], [data-act=call]').first();
      if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); any = true; }
    }
    if (!any && await host.page.locator('.tp-wcard, .wpill').first().isVisible().catch(() => false)) break;
    await host.page.waitForTimeout(200);
  }
  await expect(host.page.locator('.tp-wcard, .wpill').first()).toBeVisible({ timeout: 20_000 });
  const wcard = host.page.locator('.tp-wcard');
  if (await wcard.isVisible().catch(() => false)) {
    const winner = (await wcard.locator('.wn').first().textContent())!.replace(/ wins$/, '');
    const want = { Dev: 'pixel-wizard', Riya: 'edo-maiko', Kabir: null }[winner];
    expect(await shownAvatar(host.page, '.tp-wcard .hrow .av')).toBe(want);
  }
  expect(await seatAv(host.page, 'Riya')).toBe('edo-maiko');
  await shot(host.page, 'table-host');
  for (const p of [host, other, third]) { expect(p.errors).toEqual([]); await p.ctx.close(); }
});

// ---------------------------------------------------------------- signed in: Profile, the account, the crews screens
let leader: Person, riya: Person, kabir: Person, zoya: Person, om: Person, anu: Person;
let crew: { id: string; code: string };
async function seedCrew(): Promise<void> {
  if (crew) return;
  [leader, riya, kabir, zoya, om, anu] = await Promise.all(['Meera', 'Riya', 'Kabir', 'Zoya', 'Om', 'Anu'].map((n) => person(db, n))) as [Person, Person, Person, Person, Person, Person];
  crew = await crewWith(db, leader, 'Avatar Night', [riya, kabir, om, anu]);
  await db.sql(`update crews set scoring = 'bb' where id = '${crew.id}'`); // (a podium after one night)
  // Riya, Om and Anu on the podium; Meera and Kabir in the rows under it
  // (three nights each: the podium ranks players once they have three)
  for (const [i, t] of (['AV01', 'AV02', 'AV03'] as const).entries()) await game(db, crew.id, t, 30 + i * 30, [[riya, 400], [om, 100], [anu, 50], [leader, -100], [kabir, -450]]);
  await call(db, om, 'set_avatar', { p_avatar: 'pixel-bard' });
  await call(db, leader, 'set_avatar', { p_avatar: 'ink-crane' });
  await call(db, zoya, 'ask_to_join', { p_code: crew.code });
  await call(db, zoya, 'set_avatar', { p_avatar: 'velvet-diamond' });
}

test('signed in: tap your picture in Profile, pick from another theme; the account keeps it; the menu, Profile and the crews screens show it, to others too', async ({ browser }) => {
  await seedCrew();
  // Riya picks in Profile
  const r = await phone(browser, db, base, { theme: 'classic' });
  await signInAs(r.ctx, riya);
  await r.page.goto('/');
  await r.page.getByTestId('open-profile').click();
  await expect(r.page.getByTestId('profile-name')).toHaveText('Riya');
  expect(await shownAvatar(r.page, '[data-testid=profile-avatar]')).toBeNull();
  await r.page.getByTestId('profile-avatar').click();
  await expect(r.page.getByTestId('avatar-picker')).toBeVisible();
  await r.page.locator('.avp .a-tab[data-tab=cyber]').click();
  await r.page.locator('.avp [data-av-id=cyber-hex-cat]').click();
  await pickerOk(r.page, 'profile picker');
  await r.page.getByTestId('avp-use').click();
  await expect(r.page.getByTestId('avatar-picker')).toHaveCount(0);
  expect(await shownAvatar(r.page, '[data-testid=profile-avatar]')).toBe('cyber-hex-cat');
  expect(await db.sql(`select avatar_url from accounts where id = '${riya.id}'`)).toBe('tp:cyber-hex-cat');
  // "Change name or picture" offers both
  await r.page.getByTestId('change-name').click();
  await expect(r.page.getByTestId('name-or-picture')).toBeVisible();
  await r.page.getByTestId('change-picture').click();
  await expect(r.page.getByTestId('avatar-picker')).toBeVisible();
  await expect(r.page.locator('.avp .a-tile.a-on')).toHaveAttribute('data-av-id', 'cyber-hex-cat');
  await r.page.keyboard.press('Escape');
  // the menu
  await r.page.goto('/');
  expect(await shownAvatar(r.page, '[data-testid=menu-avatar]')).toBe('cyber-hex-cat');
  await shot(r.page, 'riya-menu');
  await r.ctx.close();

  // Riya on a new phone (her account): the menu shows her pick once the profile has loaded
  const r2 = await phone(browser, db, base, { theme: 'edo' });
  await signInAs(r2.ctx, riya);
  await r2.page.goto('/');
  await r2.page.getByTestId('nav-crews').click();
  await expect(r2.page.locator('.cw-lay')).toBeVisible();
  await expect.poll(() => r2.page.evaluate(() => localStorage.getItem('tp-avatar'))).toBe('"cyber-hex-cat"');
  await r2.ctx.close();

  // Meera (the leader) sees Riya's and Zoya's on the crews screens, at a phone and on a laptop
  for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const m = await phone(browser, db, base, { theme: 'noir', ...size });
    await signInAs(m.ctx, leader);
    await m.page.goto('/');
    await m.page.getByTestId('nav-crews').click();
    await expect(m.page.getByTestId('crew-card').first()).toBeVisible();
    // the crew card's faces
    await expect(m.page.locator('[data-testid=crew-card] .stk .tpav[data-av=cyber-hex-cat]')).toHaveCount(1);
    let d = await avatarsDrawn(m.page, '.cw'); expect(d.bad).toEqual([]);
    await m.page.getByTestId('crew-card').filter({ hasText: 'Avatar Night' }).click();
    await expect(m.page.getByTestId('crew-title')).toHaveText('Avatar Night');
    // requests (Zoya asked to join) and the podium on the crew's first tab
    await expect(m.page.locator('.cw .rq .tpav[data-av=velvet-diamond]')).toHaveCount(1);
    // (phones: the podium; bigger screens: the league itself)
    await expect(m.page.locator(`.cw [data-x=player][data-id="${riya.id}"] .tpav[data-av=cyber-hex-cat]`).first()).toBeVisible();
    if (size.width < 600) await expect(m.page.locator('.cw .podium .tpav[data-av=cyber-hex-cat]')).toHaveCount(1);
    d = await avatarsDrawn(m.page, '.cw'); expect(d.bad).toEqual([]);
    await layoutOk(m.page, `crew home ${size.width}`);
    await m.page.getByTestId('crew-tab-league').click();
    // the podium and the rows under it (every place a player shows: data-x=player)
    const placeOf = (p: Person) => m.page.locator(`.cw .tabbody [data-x=player][data-id="${p.id}"]`);
    await expect(placeOf(riya).locator('.tpav[data-av=cyber-hex-cat]').first()).toBeVisible();
    await expect(placeOf(om).locator('.tpav[data-av=pixel-bard]').first()).toBeVisible();
    await expect(placeOf(leader).locator('.tpav[data-av=ink-crane]').first()).toBeVisible();
    await expect(placeOf(anu).first()).toBeVisible();
    await expect(placeOf(anu).locator('.tpav')).toHaveCount(0); // initials
    await expect(placeOf(kabir).locator('.tpav')).toHaveCount(0);
    d = await avatarsDrawn(m.page, '.cw'); expect(d.bad).toEqual([]);
    await layoutOk(m.page, `league ${size.width}`);
    await m.page.getByTestId('crew-tab-games').click();
    await expect(m.page.getByTestId('game-row').first().locator('.tpav[data-av=cyber-hex-cat]')).toHaveCount(1); // the winner
    await m.page.getByTestId('crew-tab-members').click();
    await expect(m.page.getByTestId('member-row').filter({ hasText: 'Riya' }).locator('.tpav[data-av=cyber-hex-cat]')).toHaveCount(1);
    d = await avatarsDrawn(m.page, '.cw'); expect(d.bad).toEqual([]);
    await layoutOk(m.page, `members ${size.width}`); await targetsOk(m.page, `members ${size.width}`);
    await m.page.getByTestId('member-row').filter({ hasText: 'Riya' }).locator('.mhit').click();
    await expect(m.page.getByTestId('player-name')).toHaveText('Riya');
    expect(await shownAvatar(m.page, '.pcard')).toBe('cyber-hex-cat');
    await shot(m.page, `crew-player-${size.width}`);
    expect(m.errors).toEqual([]);
    await m.ctx.close();
  }
  // someone opening the crew's link (not in it yet): the leader's face and the members'
  const neha = await person(db, 'Neha');
  const z = await phone(browser, db, base, { theme: 'velvet' });
  await signInAs(z.ctx, neha);
  await z.page.goto(`/#/c/${crew.code}`);
  await expect(z.page.getByTestId('preview-name')).toHaveText('Avatar Night');
  await expect(z.page.getByText('Meera leads this crew')).toBeVisible();
  await expect(z.page.locator('.cw .tpav[data-av=ink-crane]').first()).toBeVisible();
  await expect(z.page.locator('.cw .tpav[data-av=cyber-hex-cat]').first()).toBeAttached();
  const d = await avatarsDrawn(z.page, '.cw'); expect(d.bad).toEqual([]);
  await z.ctx.close();
  // Initials from Profile: letters again everywhere
  const r3 = await phone(browser, db, base, {});
  await signInAs(r3.ctx, riya);
  await r3.page.goto('/');
  await r3.page.getByTestId('open-profile').click();
  await r3.page.getByTestId('profile-avatar').click();
  await r3.page.locator('.avp [data-x=initials]').click();
  await r3.page.getByTestId('avp-use').click();
  await expect(r3.page.getByTestId('avatar-picker')).toHaveCount(0);
  expect(await shownAvatar(r3.page, '[data-testid=profile-avatar]')).toBeNull();
  expect(await db.sql(`select coalesce(avatar_url, 'none') from accounts where id = '${riya.id}'`)).toBe('none');
  await r3.ctx.close();
  await call(db, riya, 'set_avatar', { p_avatar: 'cyber-hex-cat' }); // (for the later tests)
});

test('a guest\'s pick goes with them when the phone makes its profile', async ({ browser }) => {
  const g = await guest(browser, { name: 'Tara', avatar: 'velvet-peacock-plume' });
  await g.page.goto('/');
  expect(await shownAvatar(g.page, '[data-testid=menu-avatar]')).toBe('velvet-peacock-plume');
  await g.page.getByTestId('open-profile').click();
  await g.page.getByTestId('name').fill('Tara');
  await g.page.getByTestId('make-profile').click();
  await expect(g.page.getByTestId('profile-name')).toHaveText('Tara');
  await expect.poll(() => db.sql(`select coalesce(avatar_url, 'none') from accounts where name = 'Tara'`)).toBe('tp:velvet-peacock-plume');
  expect(await shownAvatar(g.page, '[data-testid=profile-avatar]')).toBe('velvet-peacock-plume');
  await g.ctx.close();
});

// ---------------------------------------------------------------- every size of the brief, real devices
const SIZES: [string, number, number, string | null][] = [
  ['iPhone SE', 320, 568, 'iPhone SE'], ['Galaxy S8', 360, 740, 'Galaxy S8'], ['iPhone 8', 375, 667, 'iPhone 8'], ['iPhone 13', 390, 844, 'iPhone 13'],
  ['Pixel 7', 412, 915, 'Pixel 7'], ['iPhone 15 Pro Max', 430, 932, 'iPhone 15 Pro Max'], ['iPhone 8 landscape', 667, 375, 'iPhone 8 landscape'],
  ['iPhone 13 landscape', 844, 390, 'iPhone 13 landscape'], ['iPad Mini', 768, 1024, 'iPad Mini'], ['iPad Air (iPad Pro 11)', 820, 1180, 'iPad Pro 11'],
  ['iPad Pro 11 landscape', 1180, 820, 'iPad Pro 11 landscape'], ['Desktop Chrome', 1280, 720, 'Desktop Chrome'], ['laptop', 1440, 900, 'Desktop Chrome'], ['desktop', 1920, 1080, 'Desktop Chrome'],
];
const NAMES = ['Dev', 'Riya', 'Arjun', 'Meera', 'Kabir', 'Zoya', 'Kunal', 'Isha', 'Rohan', 'Tara', 'Neel', 'Sana', 'Vik', 'Anu', 'Om'];
const PICKS = ['train-night-owl', 'pixel-wizard', null, 'edo-maiko', 'cyber-hex-cat', 'ink-crane', null, 'velvet-diamond', 'noir-raven', 'ivory-swan', 'classic-gold-chip', null, 'pixel-tavern-cat', 'edo-wave-crest', 'train-moonline'];
function tableView(n: number, scene: 'flop' | 'showdown'): unknown {
  const e = Engine.create('lab', { startStack: 2000, turnTime: 20, maxPlayers: 15 }, 0);
  for (let i = 0; i < n; i++) { e.apply({ t: 'join', id: `p${i}`, name: NAMES[i]!, now: 0 }); e.apply({ t: 'presence', pid: `p${i}`, connected: true, now: 0 }); }
  e.apply({ t: 'start', seed: sha256hex(`avatars-${n}-${scene}`), now: 1 });
  let k = 0;
  if (scene === 'showdown') while (e.s.phase === 'hand' && e.s.hand!.toAct) { const pid = e.s.hand!.toAct; const L = e.legal(pid)!; e.apply({ t: 'act', pid, action: { type: L.canCheck ? 'check' : 'call' }, now: 2 }); }
  else while (e.s.hand!.street === 'preflop' && e.s.hand!.toAct) { const pid = e.s.hand!.toAct; e.apply({ t: 'act', pid, action: k++ === 1 && n > 3 ? { type: 'fold' } : { type: e.legal(pid)!.canCheck ? 'check' : 'call' }, now: 2 }); }
  const v = e.viewFor('p0') as unknown as { players: Record<string, unknown>[] };
  v.players = v.players.map((p, i) => (PICKS[i] ? { ...p, avatar: PICKS[i] } : p));
  return { ...v, isHost: true, hostId: 'p0', turnLeft: 14000, turnTotal: 20000, nextIn: 0 };
}

for (const [label, W, H, dev] of SIZES) {
  test(`${label} ${W}x${H}: the picker, the menu, Profile, a table (2, 6 and 15 players) and the crews screens`, async ({ browser }) => {
    await seedCrew();
    const d = dev ? devices[dev]! : null;
    const ctx = await browser.newContext({
      baseURL: base, viewport: { width: W, height: H }, serviceWorkers: 'block',
      userAgent: d?.userAgent, deviceScaleFactor: Math.min(d?.deviceScaleFactor ?? 1, 2), isMobile: d?.isMobile ?? false, hasTouch: d?.hasTouch ?? false,
    });
    await db.attach(ctx);
    await signInAs(ctx, riya); // Riya: cyber-hex-cat, in the Night Train theme here
    await ctx.addInitScript(() => { localStorage.setItem('tp-loaded', '1'); localStorage.setItem('tp-theme', 'train'); localStorage.setItem('tp-prefs', JSON.stringify({ motion: 'off' })); localStorage.setItem('tp-avatar', '"cyber-hex-cat"'); });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    // the menu
    expect(await shownAvatar(page, '[data-testid=menu-avatar]')).toBe('cyber-hex-cat');
    expect((await avatarsDrawn(page, '.menu .me', 40)).bad).toEqual([]);
    // the picker (from the menu), on its own style and on another
    await openPickerFromMenu(page);
    await pickerOk(page, `${label} picker`);
    await shot(page, `size-${W}x${H}-picker`);
    await page.locator('.avp .a-tab[data-tab=edo]').click();
    await page.locator('.avp [data-av-id=edo-beckoning-cat]').click();
    await pickerOk(page, `${label} picker, Edo`);
    await page.locator('.avp [data-x=initials]').click();
    await pickerOk(page, `${label} picker, Initials`);
    await page.keyboard.press('Escape');
    // Profile
    await page.getByTestId('open-profile').click();
    await expect(page.getByTestId('profile-name')).toHaveText('Riya');
    expect(await shownAvatar(page, '[data-testid=profile-avatar]')).toBe('cyber-hex-cat');
    const pb = await page.getByTestId('profile-avatar').boundingBox();
    expect(pb!.width).toBeGreaterThanOrEqual(44); expect(pb!.x).toBeGreaterThanOrEqual(0); expect(pb!.x + pb!.width).toBeLessThanOrEqual(W);
    // a table: every seat's avatar drawn, at least 22 px, on screen (the smallest seats are 22 px)
    for (const [n, scene] of [[2, 'flop'], [6, 'showdown'], [15, 'flop']] as const) {
      const v = tableView(n, scene);
      await page.evaluate(([view, w, h]) => {
        const lab = (window as any).__tpLab;
        let host = document.getElementById('lab');
        if (!host) { host = document.createElement('div'); host.id = 'lab'; host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000'; document.body.append(host); }
        host.innerHTML = lab.sprite('train') + lab.renderTable(view, 'train', w, h, { peek: false, bubble: null, code: 'QK7P', net: 'good' }).html;
        lab.fitPill(host.querySelector('.tp'));
      }, [v, W, H] as const);
      const r = await avatarsDrawn(page, '#lab .tp', 21.5);
      expect(r.bad, `${label} table ${n}`).toEqual([]);
      const seats = PICKS.slice(1, n).filter(Boolean).length;
      // + my own line under my cards; on a laptop the players list at the side draws everyone's again (me included)
      const side = await page.locator('#lab .tp .side .plist').count();
      expect(r.ids.length, `${label} table ${n} seats with a pick`).toBe((seats + 1) * (side ? 2 : 1));
      if (n === 6) await shot(page, `size-${W}x${H}-table6`);
      await page.evaluate(() => document.getElementById('lab')!.remove());
    }
    // the crews screens
    await page.goto(`/#/crews/${crew.id}`);
    await expect(page.getByTestId('crew-title')).toHaveText('Avatar Night');
    await page.getByTestId('crew-tab-league').click();
    await expect(page.getByTestId('league-row').first()).toBeVisible();
    expect((await avatarsDrawn(page, '.cw')).bad).toEqual([]);
    await expect(page.locator('.cw .tpav[data-av=cyber-hex-cat]').first()).toBeVisible();
    await layoutOk(page, `${label} league`);
    await page.getByTestId('crew-tab-members').click();
    await expect(page.getByTestId('member-row').first()).toBeVisible();
    expect((await avatarsDrawn(page, '.cw')).bad).toEqual([]);
    await layoutOk(page, `${label} members`); await targetsOk(page, `${label} members`);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

// ---------------------------------------------------------------- the picker in all nine themes, at phone size
test('the picker in all nine themes at phone size (390 x 844 and 360 x 740): layout, targets, text contrast', async ({ browser }) => {
  test.setTimeout(900_000);
  const low: string[] = [];
  // (at 1 px per CSS pixel: the contrast check reads the screen's pixels; real devices are in the size tests)
  for (const theme of THEMES) for (const [W, H] of [[390, 844], [360, 740]] as const) {
    const g = await guest(browser, { theme, width: W, height: H, avatar: theme === 'pixel' ? 'noir-detective' : 'pixel-wizard' });
    await g.page.goto('/');
    await expect(g.page.locator(`#app.th-${theme}`)).toBeVisible();
    await openPickerFromMenu(g.page);
    await g.page.evaluate(() => document.fonts.ready);
    await pickerOk(g.page, `${theme} ${W}`);
    await g.page.locator('.avp .a-tab[data-tab=classic]').click();
    await g.page.locator('.avp [data-x=initials]').click();
    await pickerOk(g.page, `${theme} ${W} initials`);
    // the text that is on screen now (not scrolled out of the tab row or under the button)
    await g.page.evaluate(() => {
      for (const e of Array.from(document.querySelectorAll<HTMLElement>('.avp .a-pk-top h2, .avp .a-pv-name, .avp .a-pv-from, .avp .a-cap, .avp .a-cn, .avp .a-cw, .avp .a-pill, .avp .a-tn, .avp .a-it b, .avp .a-it span, .avp .a-pk-note, .avp .a-cta'))) {
        const r = e.getBoundingClientRect();
        const pts = [[r.left + 2, r.top + r.height / 2], [r.right - 2, r.top + r.height / 2], [r.left + r.width / 2, r.top + 2], [r.left + r.width / 2, r.bottom - 2]];
        const top = pts.every(([x, y]) => { const at = document.elementFromPoint(x!, y!); return !!at && (e.contains(at) || at.contains(e)); });
        if (top) e.dataset.cv = '1'; else delete e.dataset.cv;
      }
    });
    expect(await g.page.locator('.avp [data-cv]').count()).toBeGreaterThan(15);
    for (const r of await textContrast(g.page, '.avp [data-cv]'))
      if (r.ratio < 4.5) low.push(`${theme} ${W}: ${r.what} "${r.text.slice(0, 24)}" ${r.ratio} (${r.color} on ${r.bg})`);
    if (W === 390) await shot(g.page, `theme-${theme}-picker`);
    expect(g.errors).toEqual([]);
    await g.ctx.close();
  }
  expect(low).toEqual([]);
});
