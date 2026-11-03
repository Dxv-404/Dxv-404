// v3 rebuys (design: tools/design/gen/v3rebuys.py, v3motion.py, the Rebuys rule in v3sys.py).
//  - the host's Rebuys block on every way to open a table (online, offline host app, QR mode): the switch, rebuys per
//    player, chips per rebuy with a custom amount and its range, when they close (only when blinds go up) and the
//    sentence that follows; the values reach the table; on laptops the three-column dialog;
//  - at the table (window.__tpLab.labTable, a real engine): rebuys left under your stack, the bust-out sheets after
//    the bust-out scene (rebuys left / none left / closed / no rebuys), the bar to the next deal, the rebuy with
//    its chips and toast, Watch and Leave, motion full / calm / off / reduced, every theme and several sizes;
//  - a real online table: a player busts, rebuys from the sheet; the Table rules sheet; the host's rows.
import { test, expect, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODELS, newPhone, type Phone } from '../harness';

const THEMES = ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo'];
const NAMES = ['Dev', 'Riya', 'Arjun', 'Meera', 'Kabir', 'Zoya'];

// ---------------------------------------------------------------- helpers
type Lab = { bustHand(pid?: string, nextIn?: number | null): boolean; bustNow(pid?: string): void; setNextDeal(ms: number | null): void; level(n: number): void; rebuys: number; left: number; start(): void; me: string };

async function lab(page: Page, theme: string, cfg: Record<string, unknown>, o: { motion?: string; w?: number; h?: number; offline?: boolean } = {}): Promise<void> {
  await page.setViewportSize({ width: o.w ?? 390, height: o.h ?? 844 });
  await page.addInitScript((t) => { localStorage.setItem('tp-intro-done', '1'); localStorage.setItem('tp-theme', t); }, theme);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { __tpLab?: unknown }).__tpLab);
  await page.evaluate(([names, cfg, m, off]) => {
    const w = window as unknown as { __tpLab: { settings: { motion: string }; setTheme(t: string): void; labTable: (r: HTMLElement, n: string[], o: unknown) => Lab }; __lab: Lab };
    w.__tpLab.settings.motion = m as string;
    const root = document.createElement('div'); document.body.append(root);
    w.__lab = w.__tpLab.labTable(root, names as string[], { cfg, stack: 1000, offline: off });
  }, [NAMES, cfg, o.motion ?? 'full', !!o.offline] as const);
  await expect(page.locator(`.tp.live.th-${theme}`)).toBeVisible();
}
const L = <T>(page: Page, fn: (l: Lab) => T) => page.evaluate(`(${fn.toString()})(window.__lab)`) as Promise<T>;
const bustNow = (page: Page) => page.evaluate(() => (window as unknown as { __lab: Lab }).__lab.bustNow());

/** Nothing in `sel` is cut off or overflows, every button is a 44 px target, and it fits the screen. */
async function fits(page: Page, sel: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    const root = document.querySelector(sel) as HTMLElement | null;
    if (!root) return [`${sel} missing`];
    const r = root.getBoundingClientRect();
    if (r.left < -1 || r.right > innerWidth + 1) out.push(`${sel} wider than the screen: ${r.left},${r.right}`);
    if (root.scrollHeight > root.clientHeight + 1 && getComputedStyle(root).overflowY !== 'auto') out.push(`${sel} cut off`);
    for (const b of Array.from(root.querySelectorAll<HTMLElement>('button, [role=button]'))) {
      if (b.closest('[hidden]') || !b.offsetParent) continue;
      const br = b.getBoundingClientRect();
      if (br.height < 44 - 0.5) out.push(`button "${b.textContent?.trim()}" is ${br.height.toFixed(0)} px tall`);
      if (b.scrollWidth > b.clientWidth + 1) out.push(`button "${b.textContent?.trim()}" text overflows`);
    }
    for (const t of Array.from(root.querySelectorAll<HTMLElement>('p, h2, small, span, b'))) {
      if (!t.offsetParent || getComputedStyle(t).whiteSpace !== 'nowrap') continue;
      if (t.scrollWidth > t.clientWidth + 1 && getComputedStyle(t).textOverflow !== 'ellipsis') out.push(`"${t.textContent?.trim()}" overflows`);
    }
    return out;
  }, sel);
}

// ---------------------------------------------------------------- the host's controls
async function toSetup(page: Page, how: 'online' | 'offline' | 'qr'): Promise<void> {
  await page.getByRole('button', { name: 'Host a new table' }).click();
  await page.getByTestId(how === 'qr' ? 'qr-host' : how === 'offline' ? 'offline-host' : 'online-host').click();
  if (how === 'offline') await page.getByRole('button', { name: /Host on this phone/ }).click();
  await expect(page.getByTestId('rebuys-block')).toBeVisible();
}

/** Choose 3 rebuys of 1,500, closing after level 6, checking the controls and the sentence on the way. */
async function chooseRebuys(page: Page): Promise<void> {
  const block = page.getByTestId('rebuys-block');
  const sum = page.getByTestId('rb-sum');
  await page.getByTestId('cfg-startStack').fill('1000');
  await page.getByTestId('cfg-sb').fill('5');
  await page.getByTestId('cfg-bb').fill('10');
  // blinds never go up: no "Rebuys close" row
  await page.getByTestId('cfg-blinds-up').getByRole('radio', { name: 'Never' }).click();
  await expect(page.getByTestId('rb-close')).toBeHidden();
  await expect(sum).toContainText('Rebuys stay open all night');
  // the switch's whole row is the target (at least 44 px tall, the block's width): a tap on its words, in the gap
  // or just above the switch turns it off and on; the switch itself keeps its 50 x 30 look
  const sw = block.getByTestId('rb-on'), head = block.locator('.rb-head');
  await head.scrollIntoViewIfNeeded();
  const row0 = (await head.boundingBox())!, sw0 = (await sw.boundingBox())!, bb = (await block.boundingBox())!;
  expect(row0.height).toBeGreaterThanOrEqual(44);
  expect(row0.width).toBeGreaterThan(bb.width - 40);
  expect([Math.round(sw0.width), Math.round(sw0.height)]).toEqual([50, 30]);
  // (where in the row: x from its left, or from the switch's left when negative; y from its top, or bottom when negative)
  for (const [x, y, on] of [[4, 0.5, false], [-6, 0.5, true], [25, 2, false], [25, -2, true]] as const) {
    await head.scrollIntoViewIfNeeded();
    const row = (await head.boundingBox())!, swb = (await sw.boundingBox())!;
    const px = x < 0 ? swb.x + x : x === 25 ? swb.x + 25 : row.x + x, py = y === 0.5 ? row.y + row.height / 2 : y < 0 ? row.y + row.height + y : row.y + y;
    await page.mouse.click(px, py);
    await expect(sw, `tap at ${Math.round(px - row.x)},${Math.round(py - row.y)} in the row`).toBeChecked({ checked: on });
  }
  // the switch: off hides the rest and says so
  await block.getByTestId('rb-on').uncheck();
  await expect(page.getByTestId('rb-max')).toBeHidden();
  await expect(sum).toHaveText('No rebuys: a player who runs out of chips is out for the night.');
  await block.getByTestId('rb-on').check();
  await expect(page.getByTestId('rb-amt').getByRole('radio').first()).toHaveText('Starting chips · 1,000');
  await page.getByTestId('rb-max').getByRole('radio', { name: 'No limit' }).click();
  await expect(sum).toContainText('as often as they like');
  await page.getByTestId('rb-max').getByRole('radio', { name: '3' }).click();
  await expect(page.getByTestId('rb-max').getByRole('radio', { name: '3' })).toHaveAttribute('aria-checked', 'true');
  // custom: the box and its range; the sentence follows the typing
  await page.getByTestId('rb-amt').getByRole('radio', { name: 'Custom' }).click();
  await expect(page.getByTestId('rb-range')).toHaveText('Between 200 (20 big blinds) and 5,000');
  await page.getByTestId('rb-custom').fill('99999');
  await expect(page.getByTestId('rb-custom')).toHaveAttribute('aria-invalid', 'true');
  await expect(sum).toContainText('5,000 chips');
  await page.getByTestId('rb-custom').fill('1500');
  await expect(page.getByTestId('rb-custom')).toHaveAttribute('aria-invalid', 'false');
  await expect(sum).toContainText('3 times');
  await expect(sum).toContainText('1,500 chips');
  // blinds go up: rebuys may close after a level
  await page.getByTestId('cfg-blinds-up').getByRole('radio', { name: '10 hands' }).click();
  await expect(page.getByTestId('rb-close')).toBeVisible();
  await page.getByTestId('rb-close').getByRole('radio', { name: 'After level 6' }).click();
  await expect(sum).toHaveText('Everyone can rebuy 3 times, 1,500 chips each, once they are out of chips. Rebuys close after level 6.');
  // the range follows the big blind
  await page.getByTestId('cfg-bb').fill('20');
  await expect(page.getByTestId('rb-range')).toHaveText('Between 400 (20 big blinds) and 10,000');
  await page.getByTestId('cfg-bb').fill('10');
  await page.getByTestId('cfg-sb').click(); // the custom box keeps its amount
  await expect(page.getByTestId('rb-custom')).toHaveValue('1500');
  expect(await fits(page, '[data-testid=rebuys-block]')).toEqual([]);
}
const CHOSEN = { rebuys: true, maxRebuys: 3, rebuyAmount: 1500, rebuyUntilLevel: 6, blindUpEvery: 10 };

test.describe('rebuy controls when opening a table', () => {
  test('offline host app: the controls work and the settings go to the host phone', async ({ browser, baseURL }) => {
    const p = await newPhone(browser, 'Host', MODELS.iphone15, baseURL!);
    await toSetup(p.page, 'offline');
    await chooseRebuys(p.page);
    await p.page.evaluate(() => { (window as unknown as { __tpNavigate(u: string): void }).__tpNavigate = (u: string) => { (window as unknown as { __went: string }).__went = u; }; });
    await p.page.getByTestId('offline-open').click();
    const went = await p.page.evaluate(() => (window as unknown as { __went: string }).__went);
    const handed = JSON.parse(Buffer.from(went.split('#')[1]!, 'base64').toString());
    expect(handed.settings).toMatchObject(CHOSEN);
    expect(p.errors).toEqual([]);
  });

  test('QR mode: the controls work and the table plays by them', async ({ browser, baseURL }) => {
    const p = await newPhone(browser, 'Host', MODELS.smallAndroid, baseURL!);
    await toSetup(p.page, 'qr');
    await chooseRebuys(p.page);
    await p.page.getByRole('button', { name: 'Open the table' }).click();
    const cfg = await p.page.evaluate(() => JSON.parse(localStorage.getItem('tp-host-v1') ?? 'null').state.cfg);
    expect(cfg).toMatchObject({ ...CHOSEN, rebuyBelow: 1 });
    // the next time, the same choices are there
    await p.page.goto('/');
    await toSetup(p.page, 'qr');
    await expect(p.page.getByTestId('rb-custom')).toHaveValue('1500');
    await expect(p.page.getByTestId('rb-close').getByRole('radio', { name: 'After level 6' })).toHaveAttribute('aria-checked', 'true');
    expect(p.errors).toEqual([]);
  });

  for (const theme of THEMES) {
    test(`laptop: the three-column dialog, Rebuys outlined in the middle (${theme})`, async ({ browser, baseURL }) => {
      const p = await newPhone(browser, 'Laptop', MODELS.laptop, baseURL!);
      await p.page.evaluate((t) => localStorage.setItem('tp-theme', t), theme);
      await p.page.reload();
      await toSetup(p.page, 'online');
      const boxes = await p.page.evaluate(() => ['.s3-c1', '.s3-c2', '.s3-c3', '.s3-foot .btn'].map((s) => document.querySelector(s)!.getBoundingClientRect().toJSON() as DOMRect));
      const [a, b, c, go] = boxes as [DOMRect, DOMRect, DOMRect, DOMRect];
      expect(Math.abs(a.top - b.top)).toBeLessThan(2); expect(Math.abs(b.top - c.top)).toBeLessThan(2);
      expect(a.right).toBeLessThan(b.left); expect(b.right).toBeLessThan(c.left);
      expect(b.width).toBeGreaterThan(a.width); // the middle column is the wide one
      expect(go.bottom).toBeLessThanOrEqual(900); // nothing below the fold
      const outline = await p.page.locator('.s3-c2').evaluate((e) => getComputedStyle(e).boxShadow);
      expect(outline).toContain('1.5px');
      expect(await fits(p.page, '.screen.setup3')).toEqual([]);
      // the dialog fits the laptop's screen: no page scroll at 1440×900 or 1280×720, with Rebuys close and a custom amount showing
      await p.page.getByTestId('cfg-blinds-up').getByRole('radio', { name: '10 hands' }).click();
      await p.page.getByTestId('rb-amt').getByRole('radio', { name: 'Custom' }).click();
      for (const [w, hh] of [[1440, 900], [1280, 720]] as const) {
        await p.page.setViewportSize({ width: w, height: hh });
        const r = await p.page.evaluate(() => ({ scroll: document.documentElement.scrollHeight - innerHeight, go: document.querySelector('.s3-foot .btn')!.getBoundingClientRect().bottom }));
        expect(r.scroll, `${w}×${hh}: the page scrolls`).toBeLessThanOrEqual(0);
        expect(r.go, `${w}×${hh}: Open the table below the fold`).toBeLessThanOrEqual(hh);
      }
      // the phone layout at 390 is one column
      await p.page.setViewportSize({ width: 390, height: 844 });
      const one = await p.page.evaluate(() => ['.s3-c1', '.s3-c2'].map((s) => document.querySelector(s)!.getBoundingClientRect().top));
      expect(one[1]!).toBeGreaterThan(one[0]!);
    });
  }
});

// ---------------------------------------------------------------- at the table (lab)
test.describe('at the table', () => {
  for (const theme of THEMES) {
    test(`bust-out with rebuys left, rebuy, chips and toast (${theme}, 390x844)`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await lab(page, theme, { maxRebuys: 2 });
      await expect(page.getByTestId('rb-hint')).toContainText('Rebuys left 2 of 2');
      expect(await L(page, (l) => l.bustHand(undefined, 15_000))).toBe(true);
      // the sheet follows the scenes
      const sheet = page.getByTestId('bust-sheet');
      await expect(sheet).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.tpw-wrap')).toHaveCount(0);
      await expect(sheet).toHaveAttribute('data-kind', 'left');
      await expect(sheet.locator('h2')).toHaveText('You’re out of chips');
      await expect(sheet).toContainText('You have 2 rebuys left tonight.');
      await expect(page.getByTestId('bust-rebuy')).toHaveText(/Rebuy 1,000\s*2 of 2 left · you’re dealt in next hand/);
      await expect(page.getByTestId('bust-rebuy')).toBeFocused();
      // the bar drains to the next deal
      const a = Number(await page.getByTestId('bust-bar').getAttribute('data-left'));
      await page.waitForTimeout(600);
      const b = Number(await page.getByTestId('bust-bar').getAttribute('data-left'));
      expect(b).toBeLessThan(a);
      expect(await fits(page, '.rb-sheet')).toEqual([]);
      await page.getByTestId('bust-rebuy').click();
      await expect(sheet).toHaveCount(0);
      await expect(page.getByTestId('rebuy-toast')).toHaveText('Rebuy 1 of 2 · 1,000 chips. You’re in next hand.');
      await expect(page.locator('.rb-pour .chip')).toHaveCount(9);
      await expect(page.locator('.hero .hstack')).toHaveText('1,000', { timeout: 5000 });
      await expect(page.getByTestId('rb-hint')).toContainText('Rebuys left 1 of 2');
      await expect(page.getByTestId('rebuy-toast')).toHaveCount(0, { timeout: 6000 });
      expect(await L(page, (l) => l.rebuys)).toBe(1);
      expect(errors).toEqual([]);
    });
  }

  test('no rebuys left: "That’s your night" with place and numbers, no rebuy anywhere', async ({ page }) => {
    await lab(page, 'classic', { maxRebuys: 1 });
    await bustNow(page);
    await page.getByTestId('bust-rebuy').click();
    await expect(page.locator('.hero .hstack')).toHaveText('1,000', { timeout: 5000 });
    await bustNow(page);
    const sheet = page.getByTestId('bust-sheet');
    await expect(sheet).toHaveAttribute('data-kind', 'none');
    await expect(sheet.locator('h2')).toHaveText('That’s your night');
    await expect(sheet).toContainText('You’re out of chips and out of rebuys. You finished 6th of 6');
    await expect(sheet.locator('.rr').first()).toHaveText(/Bought in\s*2,000/);
    await expect(sheet).toContainText('Biggest pot won');
    await expect(page.getByTestId('bust-rebuy')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Keep watching' })).toBeVisible();
    await expect(page.getByTestId('rb-hint')).toContainText('No rebuys left');
    // keep watching: the action bar says Out of chips, which brings the sheet back
    await sheet.getByRole('button', { name: 'Keep watching' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('[data-act=rebuy]')).toHaveCount(0);
    await page.getByTestId('out-of-chips').click();
    await expect(page.getByTestId('bust-sheet')).toBeVisible();
    // leave
    await page.getByTestId('bust-sheet').getByRole('button', { name: 'Leave table' }).click();
    expect(await L(page, (l) => l.left)).toBe(1);
  });

  test('rebuys closed after a blind level: the sheet says so and why', async ({ page }) => {
    await lab(page, 'noir', { maxRebuys: 0, blindUpEvery: 1, rebuyUntilLevel: 2 });
    await L(page, (l) => l.level(3));
    await bustNow(page);
    const sheet = page.getByTestId('bust-sheet');
    await expect(sheet).toHaveAttribute('data-kind', 'closed');
    await expect(sheet.locator('h2')).toHaveText('Rebuys have closed');
    await expect(sheet).toContainText('The host closed rebuys after level 2, and the table is on level 3.');
    await expect(page.getByTestId('bust-rebuy')).toHaveCount(0);
    await expect(page.getByTestId('rb-hint')).toContainText('Rebuys closed');
  });

  test('a table without rebuys, and unlimited rebuys', async ({ page }) => {
    await lab(page, 'ivory', { rebuys: false });
    await expect(page.getByTestId('rb-hint')).toHaveCount(0);
    await bustNow(page);
    await expect(page.getByTestId('bust-sheet')).toContainText('this table has no rebuys');
    await lab(page, 'ivory', { maxRebuys: 0 });
    await expect(page.getByTestId('rb-hint')).toContainText('Rebuys: no limit');
    await bustNow(page);
    await expect(page.getByTestId('bust-rebuy')).toContainText('No limit · you’re dealt in next hand');
    await page.getByTestId('bust-rebuy').click();
    await expect(page.getByTestId('rebuy-toast')).toHaveText('Rebuy 1 · 1,000 chips. You’re in next hand.');
  });

  test('the bar runs out: you sit that hand out, and can still rebuy for the next', async ({ page }) => {
    await lab(page, 'cyber', { maxRebuys: 2 });
    await L(page, (l) => l.setNextDeal(1200));
    await bustNow(page);
    await expect(page.getByTestId('bust-bar')).toContainText('You’re sitting this hand out', { timeout: 4000 });
    await expect(page.getByTestId('bust-bar')).toHaveAttribute('data-left', '0.000');
    // Watch closes the sheet; the rebuy is still in the action bar
    await page.getByTestId('bust-sheet').getByRole('button', { name: 'Watch' }).click();
    await page.locator('[data-act=rebuy]').click();
    await expect(page.getByTestId('rebuy-toast')).toBeVisible();
    // the keyboard: Escape closes the sheet
    await bustNow(page);
    await expect(page.getByTestId('bust-rebuy')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('bust-sheet')).toHaveCount(0);
  });

  test('motion: calm keeps the count but drops the chips; off and reduced motion show the end at once', async ({ page }) => {
    await lab(page, 'ink', { maxRebuys: 2 }, { motion: 'calm' });
    await bustNow(page);
    await page.getByTestId('bust-rebuy').click();
    await expect(page.getByTestId('rebuy-toast')).toBeVisible();
    await expect(page.locator('.rb-pour .chip')).toHaveCount(0);
    await expect(page.locator('.hero .hstack')).toHaveText('1,000', { timeout: 5000 });

    await lab(page, 'ink', { maxRebuys: 2 }, { motion: 'off' });
    await bustNow(page);
    expect(await page.locator('.rb-layer').evaluate((e) => e.classList.contains('still'))).toBe(true);
    expect(await page.locator('.rb-sheet').evaluate((e) => e.getAnimations().length)).toBe(0);
    await page.getByTestId('bust-rebuy').click();
    await expect(page.locator('.hero .hstack')).toHaveText('1,000');
    expect(await page.evaluate(() => document.getAnimations().filter((a) => String(a.id).startsWith('rb-')).length)).toBe(0);
    await expect(page.locator('.rb-pour')).toHaveCount(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await lab(page, 'ink', { maxRebuys: 2 }, { motion: 'full' });
    await bustNow(page);
    await page.getByTestId('bust-rebuy').click();
    await expect(page.getByTestId('rebuy-toast')).toBeVisible();
    await expect(page.locator('.rb-pour')).toHaveCount(0);
  });

  for (const [theme, w, h] of [['classic', 360, 740], ['edo', 360, 740], ['pixel', 844, 390], ['train', 844, 390], ['velvet', 1440, 900], ['ink', 1440, 900], ['noir', 320, 568]] as const) {
    test(`the sheets fit at ${w}x${h} (${theme})`, async ({ page }) => {
      await lab(page, theme, { maxRebuys: 2 }, { w, h });
      await bustNow(page);
      await expect(page.getByTestId('bust-sheet')).toBeVisible();
      expect(await fits(page, '.rb-sheet')).toEqual([]);
      await page.getByTestId('bust-rebuy').click();
      const t = await page.getByTestId('rebuy-toast').boundingBox();
      expect(t!.x).toBeGreaterThanOrEqual(0); expect(t!.x + t!.width).toBeLessThanOrEqual(w);
      await expect(page.locator('.hero .hstack')).toHaveText('1,000', { timeout: 5000 });
      await page.evaluate(() => (window as unknown as { __lab: Lab }).__lab.bustNow());
      await page.getByTestId('bust-rebuy').click();
      await bustNow(page);
      await expect(page.getByTestId('bust-sheet')).toHaveAttribute('data-kind', 'none');
      expect(await fits(page, '.rb-sheet')).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------- a real online table
const root = join(import.meta.dirname, '..', '..');
const PORT = 19000 + Math.floor(Math.random() * 300);
let server: ChildProcess | null = null;

test.describe('online', () => {
  test.beforeAll(async () => {
    const b = spawnSync('pnpm', ['-s', 'build:node'], { cwd: join(root, 'apps/server'), encoding: 'utf8' });
    if (b.status !== 0) throw new Error(b.stderr);
    server = spawn(process.execPath, [join(root, 'apps/server/dist/node-server.mjs')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'tp-e2e-rebuys-')), HAND_PAUSE_MS: '800' }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
    throw new Error('server did not start');
  });
  test.afterAll(() => { server?.kill('SIGKILL'); });

  const prep = async (p: Phone, name: string) => {
    await p.page.evaluate(([port, n]) => { localStorage.setItem('tp-server-override', `ws://127.0.0.1:${port}`); localStorage.setItem('tp-name', n); localStorage.setItem('tp-intro-done', '1'); }, [String(PORT), name] as const);
    await p.page.reload();
  };
  /** Whoever is to act goes all in (a test hook: a hidden button the table's own click handler takes). */
  const allIn = async (p: Phone): Promise<boolean> => {
    if (!(await p.page.locator('[data-act=fold]').count())) return false;
    await p.page.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'allin'; b.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0'; document.querySelector('.tp-screen')!.append(b); b.click(); b.remove(); });
    await p.page.waitForTimeout(200);
    return true;
  };

  test('the settings reach the table; a player busts, rebuys from the sheet; Table rules; the host sees rebuys used', async ({ browser, baseURL }) => {
    const host = await newPhone(browser, 'Host', MODELS.pixel7, baseURL!);
    const guest = await newPhone(browser, 'Guest', MODELS.iphone15, baseURL!);
    await prep(host, 'Dev'); await prep(guest, 'Riya');
    await toSetup(host.page, 'online');
    await chooseRebuys(host.page);
    await host.page.getByRole('radio', { name: '20 s' }).click();
    await host.page.getByTestId('rb-max').getByRole('radio', { name: 'No limit' }).click(); // nobody runs out of rebuys before the guest busts
    await host.page.getByTestId('online-open').click();
    await expect(host.page.locator('.tp.live')).toBeVisible();
    await expect(host.page.getByTestId('rb-hint')).toContainText('Rebuys: no limit');
    // Table rules: what the host chose, and what I used
    await host.page.locator('[data-act=menu]').click();
    const link = (await host.page.getByTestId('table-link').textContent())!;
    await host.page.getByTestId('open-rules').click();
    const rules = host.page.getByTestId('rules-sheet');
    await expect(rules).toContainText('1,000 to start');
    await expect(rules).toContainText('5/10, up every 10 hands · level 1 now');
    await expect(rules).toContainText('No limit, 1,500 chips, when out of chips · close after level 6');
    await expect(rules).toContainText('0 rebuys used · no limit');
    await expect(rules).toContainText('20 seconds');
    await rules.getByRole('button', { name: 'Close' }).click();
    await guest.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(guest.page.locator('.tp.live .seat')).toHaveCount(1);
    // play all-in hands until the guest has gone out and rebought
    let guestRebought = false;
    await host.page.locator('[data-act=deal]').click();
    const until = Date.now() + 150_000;
    while (!guestRebought && Date.now() < until) {
      // everyone goes all in until somebody is out; the one who is out gets the sheet after the scenes
      for (const p of [host, guest]) await allIn(p);
      for (const p of [guest, host]) {
        const sheet = p.page.getByTestId('bust-sheet');
        if (!(await sheet.count())) continue;
        await expect(sheet).toHaveAttribute('data-kind', 'left');
        await expect(p.page.getByTestId('bust-rebuy')).toContainText('Rebuy 1,500');
        await p.page.getByTestId('bust-rebuy').click();
        await expect(p.page.getByTestId('rebuy-toast')).toContainText('· 1,500 chips. You’re in next hand.');
        await expect(p.page.locator('.hero .hstack')).toHaveText('1,500', { timeout: 6000 });
        if (p === guest) guestRebought = true;
      }
      await host.page.waitForTimeout(300);
    }
    expect(guestRebought).toBe(true);
    // the host's player rows show the guest's rebuys
    await host.page.locator('[data-act=menu]').click();
    await expect(host.page.getByTestId('p-row-sub').first()).toContainText('rebuy');
    expect(host.errors.filter((e) => !/WebSocket/.test(e))).toEqual([]);
    expect(guest.errors.filter((e) => !/WebSocket/.test(e))).toEqual([]);
  });
});
