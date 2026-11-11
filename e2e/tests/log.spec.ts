// The table log and the drawer it lives in (apps/web/src/table/log-core.ts, log-view.ts), on a table played
// by a local engine (window.__tpLab.labTable): a laptop's drawer that folds away, its two sections, the log
// keeping its place while play goes on, one player's lines only, the phone's Log tab, and the log's
// lettering and contrast in all nine themes.
import { test, expect, type Page } from '@playwright/test';
import { textContrast } from '../contrast';

const THEMES = ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo'];
const NAMES = ['Dev', 'Riya', 'Arjun', 'Meera', 'Kabir', 'Zoya'];
interface Lab { act(a: unknown): string | undefined; start(): void; legal(): { minTo: number; maxTo: number; canCheck: boolean; canRaise: boolean } | null; toAct(): string | null; me: string; engine: { s: { handNo: number; hand: { street: string } | null } } }
type Win = { __lab: Lab };

async function open(page: Page, theme = 'classic', keep: Record<string, string> = {}): Promise<void> {
  await page.addInitScript(([t, keep]) => {
    localStorage.setItem('tp-intro-done', '1'); localStorage.setItem('tp-theme', t as string); localStorage.setItem('tp-bell-asked', '1');
    for (const [k, v] of Object.entries(keep as Record<string, string>)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
  }, [theme, keep] as const);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { __tpLab?: unknown }).__tpLab);
  await page.evaluate((names) => {
    const w = window as unknown as { __tpLab: { settings: { motion: string }; labTable: (r: HTMLElement, n: string[], o: unknown) => Lab } } & Win;
    w.__tpLab.settings.motion = 'off';
    const root = document.createElement('div'); document.body.append(root);
    w.__lab = w.__tpLab.labTable(root, names, {});
  }, NAMES);
  await expect(page.locator('.tp.live')).toBeVisible();
}
/** Play `n` whole hands (a raise now and then, the rest call or check), then deal one more and stop when it is my turn. */
async function play(page: Page, n: number): Promise<void> {
  await page.evaluate((n) => {
    const lab = (window as unknown as Win).__lab;
    let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let hand = 0; hand <= n; hand++) {
      lab.start();
      for (let i = 0; i < 80 && lab.toAct(); i++) {
        const L = lab.legal()!, mine = lab.toAct() === lab.me;
        if (hand === n && mine) break;
        if (!mine && L.canRaise && r() < 0.2) lab.act({ type: 'raise', to: Math.min(L.maxTo, L.minTo + 20) });
        else lab.act({ type: L.canCheck ? 'check' : 'call' });
      }
    }
  }, n);
}
const one = (page: Page) => page.evaluate(() => { const lab = (window as unknown as Win).__lab; return lab.act({ type: lab.legal()!.canCheck ? 'check' : 'call' }); });
const sc = (page: Page) => page.locator('.tp.live .side .tlog-sc');
const scroll = (page: Page) => sc(page).evaluate((e) => ({ top: e.scrollTop, max: e.scrollHeight - e.clientHeight }));

test.describe('laptop (1440 x 900)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the log: hands with their headers, the blinds, actions with avatars and amounts, streets as cards, the result', async ({ page }) => {
    await open(page);
    await play(page, 2);
    const log = page.locator('.tp.live .side .tlog');
    await expect(log.locator('.lgh')).toHaveCount(3);
    const h1 = log.locator('.lgh[data-h="1"]');
    await expect(h1.locator('.lgh-h')).toContainText(/Hand 1.*on the button · blinds 10\/20/);
    await expect(h1.locator('.lgp')).toContainText(/small blind 10 · .*big blind 20/);
    await expect(h1.locator('.lgs > b')).toHaveText(['Flop', 'Turn', 'River']);
    await expect(h1.locator('.lgs').first().locator('.cd')).toHaveCount(3);
    await expect(h1.locator('.lgs').last().locator('.cd')).toHaveCount(5);
    await expect(h1.locator('.lgw')).not.toHaveCount(0);
    await expect(h1.locator('.lgw .lgc .cd').first()).toBeVisible();
    const call = h1.locator('.lgl.k-call').first();
    await expect(call.locator('.av > *')).toHaveCount(1);
    await expect(call).toContainText(/calls\s*\d+\s*pot \d/);
    // my own lines are marked, and only mine carry a time
    await expect(log.locator('.lgl.lg-me').first()).toBeVisible();
    expect(await log.locator('.lgl:not(.lg-me) time').count()).toBe(0);
    await expect(log.locator('.lgl.lg-me time').first()).toBeVisible();
    // one hand is marked as the biggest pot of the night
    await expect(log.locator('.lgh-h .lg-big')).toHaveCount(1);
    // nothing in the drawer runs off its edge
    const over = await page.locator('.tp.live .side').evaluate((s) => [...s.querySelectorAll('.lgl, .lgw, .lgs, .lgh-h')].filter((e) => e.getBoundingClientRect().right > s.getBoundingClientRect().right + 0.5).length);
    expect(over).toBe(0);
  });

  test('it scrolls; reading earlier hands, play does not pull you down: a Latest button brings you back', async ({ page }) => {
    await open(page);
    await play(page, 6);
    const s0 = await scroll(page);
    expect(s0.max).toBeGreaterThan(400);            // more than fits: it scrolls
    expect(s0.max - s0.top).toBeLessThan(2);        // and it opens at the latest line
    await expect(page.locator('.tlog-latest')).toBeHidden();
    await sc(page).evaluate((e) => { e.scrollTop = 120; });
    await expect(page.locator('.tp.live .side .tlog-latest')).toBeVisible();
    const before = await page.locator('.tp.live .side .lgl').count();
    await one(page); await one(page);
    await expect.poll(() => page.locator('.tp.live .side .lgl').count()).toBeGreaterThan(before);
    expect((await scroll(page)).top).toBe(120);     // still where I was reading
    await page.locator('.tp.live .side .tlog-latest').click();
    const s1 = await scroll(page);
    expect(s1.max - s1.top).toBeLessThan(2);
    await expect(page.locator('.tp.live .side .tlog-latest')).toBeHidden();
    await one(page);
    const s2 = await scroll(page);
    expect(s2.max - s2.top).toBeLessThan(2);        // at the foot it follows the play
  });

  test('the drawer folds away with its tab or the ] key, the table takes the room, and the device remembers', async ({ page }) => {
    await open(page);
    await play(page, 1);
    const felt = () => page.locator('.tp.live .felt').evaluate((e) => e.getBoundingClientRect().width);
    const open0 = await felt();
    await expect(page.locator('.tp.live .side')).toBeVisible();
    await page.keyboard.press(']');
    await expect(page.locator('.tp.live .side')).toBeHidden();
    expect(await felt()).toBeGreaterThan(open0 + 200);
    const tab = page.locator('.tp.live .sidetab');
    await expect(tab).toHaveAttribute('aria-expanded', 'false');
    expect((await tab.boundingBox())!.x + (await tab.boundingBox())!.width).toBeGreaterThan(1438); // on the screen's edge
    expect(await page.evaluate(() => localStorage.getItem('tp-side'))).toBe('shut');
    // the game goes on with it folded
    await one(page);
    await expect(page.locator('.tp.live .side')).toBeHidden();
    await tab.click();
    await expect(page.locator('.tp.live .side .tlog .lgh').first()).toBeVisible();
    expect(await felt()).toBe(open0);
    // remembered: a table opened later on this device starts folded
    await page.keyboard.press(']');
    await page.reload();
    await open(page);
    await expect(page.locator('.tp.live .side')).toBeHidden();
    await expect(page.locator('.tp.live .sidetab')).toBeVisible();
  });

  test('each section folds on its own, and that is remembered too', async ({ page }) => {
    await open(page);
    await play(page, 1);
    const side = page.locator('.tp.live .side');
    await side.locator('[data-act="fold-pl"]').click();
    await expect(side.locator('.plist')).toHaveCount(0);
    await expect(side.locator('.tlog .lgh').first()).toBeVisible();
    await expect(side.locator('[data-act="fold-pl"]')).toHaveAttribute('aria-expanded', 'false');
    await side.locator('[data-act="fold-lg"]').click();
    await expect(side.locator('.tlog')).toBeHidden();
    await side.locator('[data-act="fold-pl"]').click();
    await expect(side.locator('.plist .prow')).toHaveCount(6);
    expect(await page.evaluate(() => [localStorage.getItem('tp-side-pl'), localStorage.getItem('tp-side-lg')])).toEqual(['open', 'shut']);
    await side.locator('[data-act="fold-lg"]').click();
    await expect(side.locator('.tlog .lgh').first()).toBeVisible();
    // the log comes back where it was: at the latest line
    const s = await scroll(page);
    expect(s.max - s.top).toBeLessThan(2);
  });

  test('a player in the list: only their lines; again, or "Show everyone": the whole log', async ({ page }) => {
    await open(page);
    await play(page, 3);
    const side = page.locator('.tp.live .side');
    const all = await side.locator('.lgl.lx').count();
    const row = side.locator('.plist .prow', { hasText: 'Meera' });
    await row.click();
    await expect(row).toHaveClass(/\bonly\b/);
    await expect(side.locator('.tlog-bar')).toContainText('Only Meera');
    const names = await side.locator('.lgl.lx b').allTextContents();
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThan(all);
    expect(new Set(names)).toEqual(new Set(['Meera']));
    await expect(side.locator('.lgp')).toHaveCount(0);
    await side.locator('[data-act="log-all"]').click();
    await expect(side.locator('.tlog-bar')).toBeHidden();
    await expect(side.locator('.lgl.lx')).toHaveCount(all);
    await row.click(); await row.click();
    await expect(side.locator('.lgl.lx')).toHaveCount(all);
  });
});

test.describe('phone (390 x 844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the pull-down has two tabs: the players, and the same log; a player there turns it to their lines', async ({ page }) => {
    await open(page);
    await play(page, 4);
    await page.locator('.tp.live .top .plb').click();
    const pull = page.locator('.tp-plpull');
    await expect(pull.locator('.plp-tabs button.on')).toHaveText('Players');
    await expect(pull.locator('.plist .prow')).toHaveCount(6);
    await pull.locator('[data-act="pull-log"]').click();
    await expect(pull.locator('.plp-body')).toBeHidden();
    await expect(pull.locator('.tlog .lgh').last()).toBeVisible();
    await expect(pull.locator('.tlog .lgh')).toHaveCount(5);
    const s = await pull.locator('.tlog-sc').evaluate((e) => ({ top: e.scrollTop, max: e.scrollHeight - e.clientHeight, w: e.scrollWidth - e.clientWidth }));
    expect(s.max).toBeGreaterThan(200);
    expect(s.max - s.top).toBeLessThan(2);
    expect(s.w).toBeLessThanOrEqual(0);             // nothing wider than the sheet
    // play goes on behind it and the log follows
    const n = await pull.locator('.lgl').count();
    await one(page);
    await expect.poll(() => pull.locator('.lgl').count()).toBeGreaterThan(n);
    await pull.locator('[data-act="pull-players"]').click();
    await pull.locator('.plist .prow', { hasText: 'Kabir' }).click();
    await expect(pull.locator('.plp-tabs button.on')).toHaveText('Table log');
    await expect(pull.locator('.tlog-bar')).toContainText('Only Kabir');
    expect(new Set(await pull.locator('.lgl.lx b').allTextContents())).toEqual(new Set(['Kabir']));
    await page.keyboard.press('Escape');
    await expect(pull).toHaveCount(0);
  });
});

test.describe('in every theme', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  for (const theme of THEMES) {
    test(`${theme}: the log is set in the theme’s own lettering and every word of it can be read`, async ({ page }) => {
      await open(page, theme);
      await play(page, 2);
      await page.evaluate(() => document.fonts.ready);
      const fonts = await page.locator('.tp.live').evaluate((tp) => {
        const cs = getComputedStyle(tp), fam = (sel: string) => getComputedStyle(tp.querySelector(sel)!).fontFamily.split(',')[0]!.replace(/["']/g, '').trim();
        const v = (n: string) => cs.getPropertyValue(n).split(',')[0]!.replace(/["']/g, '').trim();
        return { head: fam('.tlog .lgh-h b'), dsp: v('--dsp'), num: fam('.tlog .lgl u'), nump: v('--num'), bg: getComputedStyle(tp.querySelector('.tlog .lgh-h')!).backgroundColor, side: getComputedStyle(tp.querySelector('.side')!).backgroundColor };
      });
      expect(fonts.head).toBe(fonts.dsp);
      expect(fonts.num).toBe(fonts.nump);
      const low = (await textContrast(page, ['.lgl > b', '.lgl .lg-a', '.lgl u', '.lgl small', '.lgl time', '.lgh-h', '.lgp', '.lgs > b', '.lgs small'].map((x) => `.tp.live .side .tlog .lgh:last-child ${x}`).join(', '))).filter((c) => c.ratio < 4.5);
      // (the avatars are the theme's own art and are checked with the avatars)
      expect(low, JSON.stringify(low.slice(0, 6))).toEqual([]);
    });
  }
});
