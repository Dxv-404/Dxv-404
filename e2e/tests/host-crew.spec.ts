// Open a table: Casual on (the default) is a table for anyone; turning it off asks which crew the table is for,
// listing only crews this player may host for (each crew's "who can host"), and the crew is told when it opens.
import { test, expect } from '@playwright/test';
import { LocalDb, pgUp } from '../localdb';
import { call, crewWith, person, phone, signInAs, targetsOk, layoutOk } from '../crews-helpers';

test.skip(!pgUp(), 'needs the local Postgres (pnpm test:db uses the same one)');

const db = new LocalDb();
test.beforeAll(() => { db.create(); });
test.afterAll(() => { db.drop(); });

const toSetup = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Host a new table' }).click();
  await page.getByTestId('online-host').click();
  await expect(page.getByTestId('rebuys-block')).toBeVisible();
};

test('Casual off asks which crew, lists only crews I can host for, and tells the crew', async ({ browser, baseURL }) => {
  const dev = await person(db, 'Dev'), meera = await person(db, 'Meera'), riya = await person(db, 'Riya');
  const mine = await crewWith(db, dev, 'Hostel 4B', [riya]); // Dev leads it
  const open = await crewWith(db, meera, 'Office Fridays', [dev]); // everyone may host
  const strict = await crewWith(db, meera, 'Cousins', [dev]); // only the leader hosts
  await call(db, meera, 'crew_settings_v2', { p_crew: strict.id, p_who_hosts: 'leader' });
  for (const [w, h] of [[390, 844], [1440, 900]] as const) {
    const { ctx, page, errors } = await phone(browser, db, baseURL!, { width: w, height: h });
    await signInAs(ctx, dev);
    await toSetup(page);
    // Casual is on by default: no crew question
    await expect(page.getByTestId('casual')).toBeChecked();
    await expect(page.getByTestId('crew-pick')).toBeHidden();
    await page.locator('.casual-wrap .switch-row').click();
    await expect(page.getByTestId('crew-pick')).toBeVisible();
    const rows = page.getByTestId('crew-pick-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Hostel 4B' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'Office Fridays' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'Cousins' })).toHaveCount(0);
    await targetsOk(page, `${w} crew pick`);
    if (w === 1440) {
      // pick one and open: the crew's LIVE strip gets the table
      await rows.filter({ hasText: 'Office Fridays' }).click();
      await expect(rows.filter({ hasText: 'Office Fridays' })).toHaveAttribute('aria-checked', 'true');
      await page.getByTestId('online-open').click();
      // the table screen opens (a crew-only table then checks each phone's crew with the accounts project, which
      // the local table server here does not reach; that part is covered by the crews and accounts specs)
      await expect(page.locator('.tp-stage')).toBeVisible();
      await expect.poll(() => db.sqlSync(`select count(*) from public.crew_tables where crew_id = '${open.id}' and opened_by = '${dev.id}'`), { timeout: 15_000 }).toBe('1');
      expect(db.sqlSync(`select count(*) from public.crew_tables where crew_id in ('${mine.id}', '${strict.id}')`)).toBe('0');
    } else {
      // no crew picked yet: the table does not open
      await page.getByTestId('online-open').click();
      await expect(page.locator('.tp.live')).toHaveCount(0);
      await expect(page.getByTestId('crew-pick')).toBeVisible();
      await layoutOk(page, `${w} crew pick`);
      // Casual back on: the question goes away
      await page.locator('.casual-wrap .switch-row').click();
      await expect(page.getByTestId('crew-pick')).toBeHidden();
    }
    expect(errors).toEqual([]);
    await ctx.close();
  }
});

test('with no crew to host for, the table stays casual and says why', async ({ browser, baseURL }) => {
  const lone = await person(db, 'Lone');
  const { ctx, page, errors } = await phone(browser, db, baseURL!, {});
  await signInAs(ctx, lone);
  await toSetup(page);
  await page.locator('.casual-wrap .switch-row').click(); // it turns itself back on
  await expect(page.getByTestId('crew-pick-none')).toBeVisible();
  await expect(page.getByTestId('casual')).toBeChecked();
  expect(errors).toEqual([]);
  await ctx.close();
});
