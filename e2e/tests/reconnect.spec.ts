// Presence today: a guest whose phone dies is marked away and auto-folded, re-pairs into the
// same seat, and the host can reload and resume the same game.
import { test, expect } from '@playwright/test';
import { MODELS, newPhone, hostTable, pair, chipTotal, expectNoErrors } from '../harness';

test('guest drops, is auto-acted, re-pairs into the same seat; host reload resumes', async ({ browser, baseURL }) => {
  const host = await newPhone(browser, 'Dev', MODELS.pixel7, baseURL!);
  const g1 = await newPhone(browser, 'Rohan', MODELS.iphone15, baseURL!);
  await hostTable(host, ['Dev', 'Rohan']);
  await pair(host, g1);
  await host.page.getByRole('button', { name: 'Start the game' }).click();
  await host.page.waitForFunction(() => (window as any).__tp.host.e.s.phase === 'hand');
  const T = await chipTotal(host);
  const rid: string = await host.page.evaluate(() => (window as any).__tp.host.e.s.players[1].id);

  await g1.ctx.close(); // phone dies
  await expect.poll(() => host.page.evaluate((id) => (window as any).__tp.host.e.player(id).connected, rid), { timeout: 30_000 }).toBe(false);
  expect(await chipTotal(host)).toBe(T);

  // a new phone takes the same seat
  const g1b = await newPhone(browser, 'Rohan (new phone)', MODELS.iphone15, baseURL!);
  await pair(host, g1b, rid);
  await expect.poll(() => g1b.page.evaluate(() => {
    const v = (window as any).__tp.guest.view;
    return v && v.players.find((p: any) => p.id === v.me)?.name;
  })).toBe('Rohan');
  await expect.poll(() => host.page.evaluate((id) => (window as any).__tp.host.e.player(id).connected, rid)).toBe(true);

  // host reloads and resumes the same table
  const before = await host.page.evaluate(() => { const s = (window as any).__tp.host.e.s; return { hand: s.handNo, stacks: s.players.map((p: any) => p.stack) }; });
  await host.page.reload();
  await host.page.getByRole('button', { name: 'Resume your table' }).click();
  const after = await host.page.evaluate(() => { const s = (window as any).__tp.host.e.s; return { hand: s.handNo, stacks: s.players.map((p: any) => p.stack) }; });
  expect(after.hand).toBe(before.hand);
  expect(await chipTotal(host)).toBe(T);
  expectNoErrors([host, g1b]);
});

test('a frozen guest page (Android background tab) comes back connected', async ({ browser, baseURL }) => {
  const host = await newPhone(browser, 'Dev', MODELS.pixel7, baseURL!);
  const g1 = await newPhone(browser, 'Rohan', MODELS.smallAndroid, baseURL!);
  await hostTable(host, ['Dev', 'Rohan']);
  await pair(host, g1);
  await host.page.getByRole('button', { name: 'Start the game' }).click();
  await g1.freeze(true);
  await host.page.waitForTimeout(40_000);
  await g1.freeze(false);
  await expect.poll(() => g1.page.evaluate(() => (window as any).__tp.guest.status), { timeout: 20_000 }).toBe('connected');
  expectNoErrors([host, g1]);
});
