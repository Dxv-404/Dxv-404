// Phase 3 in the browser, against the real accounts project (LIVE_SUPABASE=1; each run makes 5 accounts
// and deletes them). Every phone is its own browser profile; a wiped phone is a brand-new profile.
import { test, expect, type Browser, type Page } from '@playwright/test';
import { MODELS, newPhone, type Phone, autoAnswer } from '../harness';

test.skip(!process.env.LIVE_SUPABASE, 'needs LIVE_SUPABASE=1 (talks to the real accounts project)');
test.describe.configure({ mode: 'serial' });

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
const phones: Phone[] = [];
async function phone(browser: Browser, name: string, baseURL: string, model = MODELS.pixel7): Promise<Phone> {
  const p = await newPhone(browser, name, model, baseURL, proxy ? { proxy } : {});
  await autoAnswer(p.page);
  phones.push(p);
  return p;
}
async function openCrew(page: Page, name: string) {
  await page.goto('/');
  await page.getByTestId('open-profile').click();
  await page.getByTestId('crews').getByText(name).click();
  await expect(page.getByTestId('crew-title')).toHaveText(name);
}
async function makeProfile(page: Page, name: string) {
  await page.goto('/');
  await page.getByTestId('open-profile').click();
  await page.getByTestId('name').fill(name);
  await page.getByTestId('make-profile').click();
  await expect(page.getByTestId('profile-name')).toHaveText(name);
}

test.afterAll(async () => {
  for (const p of phones) {
    await p.page.evaluate(async () => {
      const a = await (window as unknown as { __tpAccount: () => Promise<{ hasLogin(): Promise<boolean>; start(n: string): Promise<unknown>; deleteAccount(): Promise<void> }> }).__tpAccount();
      if (await a.hasLogin()) { await a.start('x'); await a.deleteAccount(); }
    }).catch(() => {});
    await p.ctx.close();
  }
});

test('no sign-up, crews by link, a wiped phone recovers everything, crew rescue', async ({ browser, baseURL }) => {
  // Rahul: profile, crew, invite link, recovery code
  const rahul = await phone(browser, 'Rahul', baseURL!, MODELS.iphone15);
  await makeProfile(rahul.page, 'Rahul');
  await rahul.page.getByTestId('new-crew').click();
  await rahul.page.getByTestId('crew-name').fill('Friday crew');
  await rahul.page.getByTestId('crew-create').click();
  await expect(rahul.page.getByTestId('crew-title')).toHaveText('Friday crew');
  await rahul.page.getByTestId('invite').click();
  const link = (await rahul.page.getByTestId('invite-link').textContent())!;
  expect(link).toMatch(/#\/c\/[A-Z2-9]{10}$/);
  await rahul.page.getByRole('button', { name: 'Back' }).click();
  await rahul.page.getByTestId('recovery-row').click(); // (v3: the recovery code sits behind its own row)
  await rahul.page.getByTestId('make-code').click();
  const code = (await rahul.page.getByTestId('code').textContent())!;
  expect(code).toMatch(/^\d{4} \d{4} \d{4}$/);
  await rahul.page.keyboard.press('Escape');

  // Riya opens the link on a phone that has never opened the app: names herself and joins
  const riya = await phone(browser, 'Riya', baseURL!, MODELS.smallAndroid);
  await riya.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(riya.page.getByTestId('crew-title')).toHaveText('Friday crew');
  await riya.page.getByTestId('name').fill('Riya');
  await riya.page.getByTestId('join').click();
  await expect(riya.page.getByTestId('members')).toContainText('Rahul');
  await expect(riya.page.getByTestId('members')).toContainText('Riya');

  // Rahul's phone is wiped: a brand-new browser profile. A wrong code first, then his code.
  const wiped = await phone(browser, 'Rahul (wiped)', baseURL!, MODELS.iphone15);
  await wiped.page.goto('/');
  await wiped.page.getByTestId('open-profile').click();
  await wiped.page.getByTestId('recover-open').click();
  await wiped.page.getByTestId('recover-code').fill('1234 5678 9012');
  await wiped.page.getByTestId('recover-go').click();
  await expect(wiped.page.getByTestId('recover-msg')).toHaveText("That code doesn't match an account.");
  await wiped.page.getByTestId('recover-code').fill(code);
  await wiped.page.getByTestId('recover-go').click();
  await expect(wiped.page.getByTestId('profile-name')).toHaveText('Rahul');
  await expect(wiped.page.getByTestId('crews')).toContainText('Friday crew');
  await expect(wiped.page.getByTestId('crews')).toContainText('owner');

  // Riya gets a new phone and never saved a code: crew rescue from the invite link
  const riyaNew = await phone(browser, 'Riya (new phone)', baseURL!, MODELS.pixel7);
  await riyaNew.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await riyaNew.page.getByTestId('already-in').click();
  await riyaNew.page.getByTestId('rescue-Riya').click();
  await expect(riyaNew.page.getByTestId('rescue-status')).toContainText("Is this Riya's new phone?");
  // Rahul (on his recovered phone) sees the question in the crew. Riya joined today, so the crew cannot
  // vouch for her yet (a crew made to steal an account would otherwise work at once): he is told plainly
  await wiped.page.getByTestId('crews').getByText('Friday crew').click();
  await wiped.page.getByTestId('rescue-yes').click();
  await expect(wiped.page.locator('#toast')).toContainText('joined this crew less than a week ago');
  // Riya's own phone is told someone is asking to be her, and stops it
  await riya.page.goto('/');
  await riya.page.getByTestId('open-profile').click();
  await expect(riya.page.getByTestId('rescue-alert')).toContainText('A new phone asked Friday crew to move your account to it');
  await riya.page.getByTestId('rescue-alert-not-me').click();
  await expect(riya.page.getByTestId('rescue-alert')).toHaveCount(0);
  await expect(riyaNew.page.getByTestId('rescue-status')).toContainText("The crew said this isn't Riya's phone", { timeout: 20_000 });
  // the crew log shows what happened, so a rescue never goes unnoticed
  await openCrew(wiped.page, 'Friday crew');
  await expect(wiped.page.getByTestId('crew-log')).toContainText('A new phone asked to be Riya');
  await expect(wiped.page.getByTestId('crew-log')).toContainText('Riya said a new phone asking to be them is not theirs');
  // (an approved rescue waits a day after the old phone was last used, then finishes: database tests 08)
  // how the waiting phone shows an approved rescue
  const waiting = await phone(browser, 'Riya (approved)', baseURL!, MODELS.pixel7);
  await waiting.page.route('**/rest/v1/rpc/rescue_status', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'approved', finishes_at: new Date(Date.now() + 20 * 3600_000).toISOString() }) }));
  await waiting.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await waiting.page.getByTestId('already-in').click();
  await waiting.page.getByTestId('rescue-Riya').click();
  await expect(waiting.page.getByTestId('rescue-status')).toContainText("The crew said yes. For safety, Riya's account moves to this phone", { timeout: 20_000 });

  // Rahul sees both his phones (the wiped one came back with the code), and logs the old one out
  await wiped.page.getByRole('button', { name: 'Back' }).click();
  await expect(wiped.page.getByTestId('device-other')).toHaveCount(1);
  await wiped.page.getByTestId('device-more').click();
  await wiped.page.getByTestId('device-logout').click();
  await expect(wiped.page.getByTestId('device-other')).toHaveCount(0);
  await expect(wiped.page.getByTestId('device-this')).toContainText('This phone');

  // a stranger claims to be Rahul from the link; Rahul says no; the stranger is told plainly
  const stranger = await phone(browser, 'Stranger', baseURL!, MODELS.smallAndroid);
  await stranger.page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await stranger.page.getByTestId('already-in').click();
  await stranger.page.getByTestId('rescue-Rahul').click();
  await expect(stranger.page.getByTestId('rescue-status')).toContainText("Is this Rahul's new phone?");
  await expect(riya.page.getByTestId('crews')).toContainText('Friday crew');
  await riya.page.getByTestId('crews').getByText('Friday crew').click(); // Riya is a member: she cannot decide
  await expect(riya.page.getByTestId('rescues')).toHaveCount(0);
  await openCrew(wiped.page, 'Friday crew');
  await expect(wiped.page.getByTestId('rescues')).toContainText('A new phone says it is you.');
  await wiped.page.getByTestId('rescue-not-me').click();
  await expect(stranger.page.getByTestId('rescue-status')).toContainText("The crew said this isn't Rahul's phone", { timeout: 20_000 });

  for (const p of phones) expect(p.errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test('ten wrong codes: the lock message is shown plainly', async ({ browser, baseURL }) => {
  // (the lock itself is tested in the database; here only how the app shows it, without locking this network)
  const p = await phone(browser, 'Locked', baseURL!);
  await p.page.route('**/rest/v1/rpc/recover_account', (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '54000', message: 'Too many wrong codes. Try again in an hour.', details: null, hint: null }) }));
  await p.page.goto('/');
  await p.page.getByTestId('open-profile').click();
  await p.page.getByTestId('recover-open').click();
  await p.page.getByTestId('recover-code').fill('111122223333');
  await p.page.getByTestId('recover-go').click();
  await expect(p.page.getByTestId('recover-msg')).toHaveText('Too many wrong codes. Try again in an hour.');
});
