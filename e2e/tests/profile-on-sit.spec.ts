// A player who sits at a table without a profile gets one (so the game reaches their history and replays),
// and the games the phone played before as a guest join that profile.
import { test, expect } from '@playwright/test';
import { LocalDb, pgUp } from '../localdb';
import { phone } from '../crews-helpers';

test.skip(!pgUp(), 'needs the local Postgres (pnpm test:db uses the same one)');
const db = new LocalDb();
test.beforeAll(() => { db.create(); });
test.afterAll(() => { db.drop(); });

test('opening a table makes the profile, and the phone’s guest games join it', async ({ browser, baseURL }) => {
  const guest = 'gGuestTestSeat1';
  db.sqlSync(`insert into public.games (id, table_code, server, start_stack, big_blind, started_at, status) values ('00000000-0000-0000-0000-0000000aa001', 'WXYZ', 'test', 1000, 20, now() - interval '1 day', 'ended')`);
  db.sqlSync(`insert into public.game_players (game_id, player_key, account_id, name) values ('00000000-0000-0000-0000-0000000aa001', '${guest}', null, 'Dev')`);
  const { ctx, page, errors } = await phone(browser, db, baseURL!, { name: 'Dev' });
  await ctx.addInitScript((g) => { localStorage.setItem('tp-guest-id', JSON.stringify(g)); localStorage.removeItem('tp-guest-only'); }, guest);
  await page.goto('/');
  expect(await page.evaluate(() => localStorage.getItem('tp-me'))).toBeNull();
  await page.getByRole('button', { name: 'Host a new table' }).click();
  await page.getByTestId('online-host').click();
  await page.getByTestId('online-open').click();
  await expect(page.locator('.tp-stage')).toBeVisible({ timeout: 20_000 });
  // the profile was made (with the name this phone already had) and sits at the table
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tp-me') ?? 'null')?.name ?? null), { timeout: 15_000 }).toBe('Dev');
  const account = await page.evaluate(() => JSON.parse(localStorage.getItem('tp-me')!).account as string);
  // the guest game is the profile's now
  await expect.poll(() => db.sqlSync(`select account_id from public.game_players where player_key = '${guest}'`), { timeout: 15_000 }).toBe(account);
  expect(await page.evaluate(() => localStorage.getItem('tp-guest-claimed'))).toBe(account);
  expect(errors).toEqual([]);
  await ctx.close();
});
