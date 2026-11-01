// The app must open and play with no network after one online visit (service worker cache).
import { test, expect } from '@playwright/test';
import { MODELS, newPhone, hostTable, pair, expectNoErrors, noInternet } from '../harness';

test('opens with no network after one visit, and two phones can still pair and deal', async ({ browser, baseURL }) => {
  const phones = [await newPhone(browser, 'Dev', MODELS.pixel7, baseURL!), await newPhone(browser, 'Rohan', MODELS.iphoneSE, baseURL!)];
  for (const ph of phones) {
    await ph.page.evaluate(() => navigator.serviceWorker.ready);
    await ph.page.reload(); // let the worker take control
    await expect.poll(() => ph.page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await ph.offline(true);
    await ph.page.reload();
    await expect(ph.page.getByRole('button', { name: 'Host a new table' })).toBeVisible();
    expect(await ph.page.evaluate(() => document.fonts.check('16px Fraunces'))).toBe(true);
    // Back to a hotspot with no internet: phones can reach each other, the web cannot be reached.
    await ph.offline(false);
    await noInternet(ph);
    await ph.page.reload();
    await expect(ph.page.getByRole('button', { name: 'Host a new table' })).toBeVisible();
  }
  const [host, g1] = phones as [typeof phones[0], typeof phones[0]];
  await hostTable(host, ['Dev', 'Rohan']);
  await pair(host, g1);
  await host.page.getByRole('button', { name: 'Start the game' }).click();
  await expect.poll(() => g1.page.evaluate(() => (window as any).__tp.guest.view?.hand?.id ?? 0)).toBeGreaterThan(0);
  expectNoErrors(phones.map((p) => ({ ...p, errors: p.errors.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)) })));
});
