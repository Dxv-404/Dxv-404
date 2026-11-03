// Live (LIVE_SITE only): a signed-in player's game reaches their history (Replays). The host makes a profile
// first (a crew makes the account), then plays a short game with a guest and ends it; the game must show
// under Replays. Leaves a QA crew and account behind for the caller to remove.
import { test, expect } from '@playwright/test';
import { MODELS, newPhone, autoAnswer } from '../harness';

const SITE = process.env.LIVE_SITE;
test.skip(!SITE, 'set LIVE_SITE to the deployed app');
test('live: a signed-in player finds the game under Replays', async ({ browser }) => {
  test.setTimeout(180_000);
  const host = await newPhone(browser, 'Host', MODELS.pixel7, SITE!);
  const guest = await newPhone(browser, 'Guest', MODELS.iphoneSE, SITE!);
  for (const p of [host, guest]) await p.page.evaluate((n) => { localStorage.setItem('tp-name', n); localStorage.setItem('tp-intro-done', '1'); localStorage.setItem('tp-18', '1'); }, p === host ? 'QA Host' : 'QA Guest');
  await host.page.reload();
  // a profile: making a crew makes the account
  await host.page.getByTestId('nav-crews').first().click();
  await host.page.getByTestId('crews-create').first().click();
  await host.page.getByTestId('crew-name').fill('QA replay crew');
  await host.page.getByTestId('crew-create').click();
  await expect(host.page.getByTestId('crew-made')).toBeVisible({ timeout: 20_000 });
  console.log('tp-me', await host.page.evaluate(() => localStorage.getItem('tp-me')));
  await host.page.goto(SITE!);
  await host.page.getByTestId('play-online').click();
  await host.page.getByTestId('online-host').click();
  await host.page.getByTestId('online-open').click();
  await expect(host.page.locator('.tp.live')).toBeVisible({ timeout: 20_000 });
  await host.page.locator('[data-act=menu]').click();
  const link = (await host.page.getByTestId('table-link').textContent())!;
  await host.page.keyboard.press('Escape');
  console.log('table', link.slice(-4));
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
  await autoAnswer(host.page);
  await host.page.locator('[data-act=menu]').click();
  await host.page.getByTestId('end-game').click();
  await expect(host.page.getByTestId('standings')).toBeVisible({ timeout: 20_000 });
  await host.page.waitForTimeout(8000); // the table server records the game
  await host.page.goto(SITE!);
  await host.page.getByTestId('nav-replays').first().click();
  await host.page.waitForTimeout(4000);
  const txt = await host.page.locator('body').innerText();
  console.log('REPLAYS:', txt.slice(0, 300).replace(/\n/g, ' | '));
  await expect(host.page.getByTestId('games').locator('li')).not.toHaveCount(0, { timeout: 15_000 });
});
