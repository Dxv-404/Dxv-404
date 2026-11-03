// On laptops the crews column sits beside the crew page: switching Overview / League / Games / Members redraws the
// page, and the crew cards beside it must stay still (they used to slide in again, a shake on every tab change).
import { test, expect } from '@playwright/test';
import { LocalDb, pgUp } from '../localdb';
import { crewWith, person, phone, signInAs } from '../crews-helpers';

test.skip(!pgUp(), 'needs the local Postgres (pnpm test:db uses the same one)');

const db = new LocalDb();
test.beforeAll(() => { db.create(); });
test.afterAll(() => { db.drop(); });

test('the crews column stays still while the crew page changes tab (1440 x 900)', async ({ browser, baseURL }) => {
  const dev = await person(db, 'Dev'), riya = await person(db, 'Riya');
  await crewWith(db, dev, 'Hostel 4B', [riya]);
  await crewWith(db, riya, 'Office Fridays', [dev]);
  const { ctx, page, errors } = await phone(browser, db, baseURL!, { width: 1440, height: 900, motion: 'full' });
  await signInAs(ctx, dev);
  await page.goto('/');
  await page.getByTestId('nav-crews').first().click();
  await expect(page.locator('.cw .clist .ccard')).toHaveCount(2);
  await page.locator('.cw .clist .ccard').first().click();
  await expect(page.getByTestId('crew-tab-league')).toBeVisible();
  // click the tab in the page and look at the crew cards straight after the redraw
  const moving = (t: string) => page.evaluate((tab) => new Promise<number>((resolve) => {
    (document.querySelector(`[data-testid=crew-tab-${tab}]`) as HTMLElement).click();
    setTimeout(() => resolve(Array.from(document.querySelectorAll('.cw .clist .ccard')).flatMap((e) => e.getAnimations())
      .filter((a) => a.playState === 'running' || a.pending).length), 60);
  }), t);
  for (const t of ['league', 'games', 'members', 'overview'] as const) {
    expect(await moving(t), `crew cards animating after ${t}`).toBe(0);
    await expect(page.getByTestId(`crew-tab-${t}`)).toHaveAttribute('aria-selected', 'true');
  }
  expect(errors).toEqual([]);
  await ctx.close();
});

test('on a laptop every crew tab opens, also for the crew the list shows by itself (1440 x 900)', async ({ browser, baseURL }) => {
  const dev = await person(db, 'Dev2'), riya = await person(db, 'Riya2');
  await crewWith(db, dev, 'Night Owls', [riya]);
  const { ctx, page, errors } = await phone(browser, db, baseURL!, { width: 1440, height: 900 });
  await signInAs(ctx, dev);
  await page.goto('/');
  await page.getByTestId('nav-crews').first().click();
  // no card clicked: the first crew opens beside the list on its own
  await expect(page.getByTestId('crew-title')).toHaveText('Night Owls');
  for (const t of ['league', 'games', 'members', 'trophies', 'overview'] as const) {
    await page.getByTestId(`crew-tab-${t}`).click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId(`crew-tab-${t}`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.cw [role=tab][aria-selected=true]')).toHaveCount(1);
  }
  expect(errors).toEqual([]);
  await ctx.close();
});
