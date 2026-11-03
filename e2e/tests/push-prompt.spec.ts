// "Turn on notifications?" right after joining or making a crew (crews/push-prompt.ts): shown while notifications
// are off, never again after Not now; on an iPhone in Safari (not added to the Home Screen) it shows how to add
// the app to the Home Screen instead, since iPhones allow web push only there. Against the local database.
import { test, expect, type Browser, type Page } from '@playwright/test';
import { LocalDb, pgUp } from '../localdb';
import { crewWith, person, phone, signInAs, layoutOk, type Person } from '../crews-helpers';

test.skip(!pgUp(), 'needs the local Postgres (pnpm test:db uses the same one)');
test.describe.configure({ mode: 'default' });

const db = new LocalDb();
let base = '';
test.beforeAll(() => { db.create(); });
test.afterAll(() => { db.drop(); });
test.beforeEach(({ baseURL }) => { base = baseURL!; });

/** A phone that has not been asked yet (headless Chromium answers "denied" by itself). */
const notAskedYet = (): void => { Object.defineProperty(Notification, 'permission', { get: () => 'default' }); };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

/** A phone with an iPhone's Safari; `installed`: opened from the Home Screen icon (display-mode standalone). */
async function iphone(browser: Browser, who: Person, installed: boolean): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: 390, height: 664 }, userAgent: IPHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await db.attach(ctx);
  await ctx.addInitScript((inst) => {
    localStorage.setItem('tp-loaded', '1');
    localStorage.setItem('tp-prefs', JSON.stringify({ motion: 'off' }));
    if (inst) Object.defineProperty(navigator, 'standalone', { value: true });
  }, installed);
  await ctx.addInitScript(notAskedYet);
  await signInAs(ctx, who);
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

async function join(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`/#/c/${code}`);
  await expect(page.getByTestId('preview-name')).toHaveText(name);
  await page.getByTestId('ask-join').click();
  await expect(page.getByTestId('crew-title')).toHaveText(name);
}

test('after making or joining a crew: an offer to turn notifications on, gone for good after Not now', async ({ browser }) => {
  const leader = await person(db, 'Nisha'), me = await person(db, 'Vikram');
  const open = await crewWith(db, leader, 'Open Table', [], { autoAdmit: true });
  const { ctx, page, errors } = await phone(browser, db, base, { height: 664 });
  await ctx.addInitScript(notAskedYet);
  await signInAs(ctx, me);
  // making a crew: the card under the crew code
  await page.goto('/');
  await page.getByTestId('nav-crews').click();
  await page.getByTestId('crews-create').click();
  await page.getByTestId('crew-name').fill('Hostel 4B');
  await page.getByTestId('crew-create').click();
  await expect(page.getByTestId('crew-made')).toBeVisible();
  const card = page.getByTestId('push-prompt');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Know when your crew plays');
  await expect(card.getByTestId('push-on')).toHaveText('Turn on');
  await expect(card.getByTestId('push-ios-steps')).toHaveCount(0);
  await layoutOk(page, 'made with the notifications card');
  await page.screenshot({ path: 'test-results/push-prompt-made.png' });
  // the crew page it leads to offers it too, until it is answered
  await page.getByTestId('made-go').click();
  await expect(page.getByTestId('crew-title')).toHaveText('Hostel 4B');
  await expect(card).toBeVisible();
  await card.getByTestId('push-later').click();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('tp-push-prompt-off'))).toBe('1');
  // joining another crew later: not asked again
  await join(page, open.code, 'Open Table');
  await page.waitForTimeout(400);
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('joining a crew offers it on the crew page; not when notifications are blocked', async ({ browser }) => {
  const leader = await person(db, 'Meera'), me = await person(db, 'Tara');
  const open = await crewWith(db, leader, 'Friday Club', [], { autoAdmit: true });
  const { ctx, page } = await phone(browser, db, base);
  await ctx.addInitScript(notAskedYet);
  await signInAs(ctx, me);
  await join(page, open.code, 'Friday Club');
  await expect(page.getByTestId('push-prompt')).toContainText('Know when your crew plays');
  await layoutOk(page, 'crew page with the notifications card');
  await ctx.close();
  // blocked in the browser (headless Chromium's own answer): one tap could not turn them on, so no offer
  const other = await phone(browser, db, base);
  await signInAs(other.ctx, await person(db, 'Rohan'));
  await join(other.page, open.code, 'Friday Club');
  await other.page.waitForTimeout(400);
  await expect(other.page.getByTestId('push-prompt')).toHaveCount(0);
  await other.ctx.close();
});

test('an iPhone in Safari gets the Add to Home Screen steps; from the Home Screen, the one-tap switch', async ({ browser }) => {
  const leader = await person(db, 'Riya');
  const open = await crewWith(db, leader, 'Night Owls', [], { autoAdmit: true });
  const safari = await iphone(browser, await person(db, 'Kabir'), false);
  await join(safari.page, open.code, 'Night Owls');
  const card = safari.page.getByTestId('push-prompt');
  await expect(card.getByTestId('push-ios-steps')).toBeVisible();
  await expect(card.getByTestId('push-ios-steps').locator('li')).toHaveText(['Tap Share at the bottom of Safari', 'Tap Add to Home Screen', 'Open Train Poker from the new icon', 'Turn on notifications in Settings']);
  await expect(card.getByTestId('push-on')).toHaveCount(0);
  await layoutOk(safari.page, 'iPhone Add to Home Screen card');
  await safari.page.screenshot({ path: 'test-results/push-prompt-iphone.png' });
  await card.getByTestId('push-later').click();
  await expect(card).toHaveCount(0);
  await safari.close();
  const app = await iphone(browser, await person(db, 'Zoya'), true);
  await join(app.page, open.code, 'Night Owls');
  await expect(app.page.getByTestId('push-prompt').getByTestId('push-on')).toBeVisible();
  await expect(app.page.getByTestId('push-ios-steps')).toHaveCount(0);
  await app.close();
});
