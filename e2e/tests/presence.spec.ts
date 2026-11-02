// Leaving, dropping out and coming back, as signed off in every theme's presence board: the reconnecting
// banner with its clock, the pause card when an offline table's host phone is gone, and the welcome-back card
// that says what was missed and lets you choose when to be dealt back in.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const P = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'apps', 'web', 'src', 'table', 'presence.json'), 'utf8')) as { themes: Record<string, { banner: string; back: string }> };

const THEMES = ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo'];
type Lab = { start(): void; screen: { setConnection(s: string): void; o: { offline?: boolean } }; sat?: boolean[] };

async function open(page: Page, theme: string, offline = false): Promise<void> {
  await page.addInitScript((t) => { localStorage.setItem('tp-intro-done', '1'); localStorage.setItem('tp-loaded', '1'); localStorage.setItem('tp-theme', t); }, theme);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { __tpLab?: unknown }).__tpLab);
  await page.evaluate((off) => {
    const w = window as unknown as { __tpLab: { labTable: (r: HTMLElement, n: string[]) => Lab }; __lab: Lab };
    const root = document.createElement('div');
    (document.getElementById('view') ?? document.body).replaceChildren(root);
    w.__lab = w.__tpLab.labTable(root, ['Dev', 'Riya', 'Arjun', 'Meera']);
    w.__lab.screen.o.offline = off;
    w.__lab.start();
  }, offline);
  await expect(page.locator('.tp.live')).toBeVisible();
}
const conn = (page: Page, s: string) => page.evaluate((s) => (window as unknown as { __lab: Lab }).__lab.screen.setConnection(s), s);

for (const theme of THEMES) {
  test(`${theme}: reconnecting banner, then welcome back`, async ({ page }) => {
    const copy = P.themes[theme]!;
    await open(page, theme);
    await conn(page, 'lost');
    const banner = page.getByTestId('reconnecting');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(copy.banner);
    await expect(banner.locator('[data-pz=clock]')).toHaveText('0:00');
    await expect(banner.locator('[data-pz=clock]')).toHaveText(/0:0[3-6]/, { timeout: 7000 });
    await page.waitForTimeout(1500);
    await conn(page, 'good');
    await expect(banner).toHaveCount(0);
    const back = page.getByTestId('welcome-back');
    await expect(back).toBeVisible();
    await expect(back).toContainText(copy.back.replace(/\bDev\b/, 'Dev'));
    await expect(back).toContainText('chips');
    // nothing in the card runs off the screen
    const box = await back.boundingBox();
    const vw = page.viewportSize()!.width;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
    await back.getByRole('button', { name: 'Deal me in' }).click();
    await expect(back).toHaveCount(0);
  });
}

test('an offline table whose host phone is gone shows the pause card; a short blip shows no welcome back', async ({ page }) => {
  await open(page, 'pixel', true);
  await conn(page, 'lost');
  await expect(page.getByTestId('reconnecting')).toBeVisible();
  await expect(page.getByTestId('host-gone')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('host-gone')).toContainText('GAME PAUSED');
  await conn(page, 'good');
  await expect(page.getByTestId('host-gone')).toHaveCount(0);
  await page.getByTestId('welcome-back').getByRole('button', { name: 'Sit out a bit' }).click();
  await expect(page.getByTestId('welcome-back')).toHaveCount(0);
  // a blip under 4 seconds just goes away
  await conn(page, 'lost'); await page.waitForTimeout(500); await conn(page, 'good');
  await expect(page.getByTestId('welcome-back')).toHaveCount(0);
});
