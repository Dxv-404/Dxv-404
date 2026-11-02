// Live (LIVE_SITE=https://... only): the deployed web app with the real table servers, no test overrides.
// One phone opens a table (the app picks the server), another follows the link, they play a few moves, and
// the host ends the game.
import { test, expect } from '@playwright/test';
import { MODELS, newPhone, autoAnswer } from '../harness';

const SITE = process.env.LIVE_SITE;

test.skip(!SITE, 'set LIVE_SITE to the deployed app');
test('the deployed app: open a table, a friend follows the link, play, end', async ({ browser }) => {
  const host = await newPhone(browser, 'Host', MODELS.pixel7, SITE!);
  const guest = await newPhone(browser, 'Guest', MODELS.iphoneSE, SITE!);
  for (const p of [host, guest]) await p.page.evaluate((n) => { localStorage.setItem('tp-name', n); localStorage.setItem('tp-intro-done', '1'); localStorage.setItem('tp-18', '1'); }, p === host ? 'Dev' : 'Riya');
  await host.page.reload();
  await host.page.getByTestId('play-online').click();
  await host.page.getByTestId('online-host').click();
  await host.page.getByTestId('online-open').click();
  await expect(host.page.locator('.tp.live')).toBeVisible({ timeout: 20_000 });
  await host.page.locator('[data-act=menu]').click();
  const link = (await host.page.getByTestId('table-link').textContent())!;
  await host.page.keyboard.press('Escape');
  console.log(`live table ${link.slice(-4)} (${'ABCDEFGHJKLM'.includes(link.slice(-4)[0]!) ? 'Oracle' : 'Cloudflare'})`);
  await guest.page.goto(link);
  await expect(host.page.locator('.tp.live .seat')).toHaveCount(1, { timeout: 20_000 });
  await host.page.locator('[data-act=deal]').click();
  let acted = 0;
  const until = Date.now() + 60_000;
  while (acted < 6 && Date.now() < until) {
    for (const p of [host, guest]) {
      const b = p.page.locator('[data-act=check], [data-act=call]').first();
      if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); acted++; }
    }
    await host.page.waitForTimeout(400);
  }
  expect(acted).toBeGreaterThanOrEqual(4);
  await autoAnswer(host.page);
  await host.page.locator('[data-act=menu]').click();
  await host.page.getByTestId('end-game').click();
  await expect(host.page.getByTestId('standings')).toBeVisible({ timeout: 20_000 });
  await expect(guest.page.getByTestId('standings')).toBeVisible({ timeout: 20_000 });
});
