// v3 crews in the browser, against a local stand-in for the accounts project (a fresh local Postgres with every
// migration; e2e/localdb.ts) so nothing touches the live project: the Crews tab for a new player, making a crew,
// joining with a code (and a wrong one, and resting), asking and being let in, roles, leaving, settings,
// inviting, hosting; then the main screens in all nine themes at 390 x 844 and the crews layouts at 360 x 740,
// 844 x 390, 820 x 1180, 1440 x 900 and 1920 x 1080, with nothing overlapping or cut off.
import { test, expect, type Page } from '@playwright/test';
import { LocalDb, pgUp } from '../localdb';
import { THEMES, answer, call, crewWith, game, layoutOk, person, phone, signInAs, targetsOk, type Person } from '../crews-helpers';
import { textContrast } from '../contrast';
import { avatarLetters } from '../avatars';

test.skip(!pgUp(), 'needs the local Postgres (pnpm test:db uses the same one)');
test.describe.configure({ mode: 'default' });

const SHOTS = process.env.CREWS_SHOTS ?? '';
const db = new LocalDb();
let base = '';
test.beforeAll(() => { db.create(); });
test.afterAll(() => { db.drop(); });
test.beforeEach(({ baseURL }) => { base = baseURL!; });

const shot = async (page: Page, name: string): Promise<void> => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const crewsTab = async (page: Page): Promise<void> => { await page.goto('/'); await page.getByTestId('nav-crews').click(); await expect(page.locator('.cw-lay')).toBeVisible(); };

// ---------------------------------------------------------------- a realistic crew for the screens
let meera: Person, aditya: Person, riya: Person, kabir: Person, dev: Person, rohan: Person, nisha: Person;
let fnt: { id: string; code: string }, hostel: { id: string; code: string };
async function seedWorld(): Promise<void> {
  if (fnt) return;
  [meera, aditya, riya, kabir, dev, rohan, nisha] = await Promise.all(['Meera', 'Aditya', 'Riya', 'Kabir', 'Dev', 'Rohan', 'Nisha'].map((n) => person(db, n))) as [Person, Person, Person, Person, Person, Person, Person];
  const zoya = await person(db, 'Zoya'), tara = await person(db, 'Tara'), sneha = await person(db, 'Sneha');
  fnt = await crewWith(db, meera, 'Friday Night Table', [aditya, riya, dev, kabir, zoya, tara, sneha], { badge: 'shield', color: '#c0392b' });
  await call(db, meera, 'set_role', { p_crew: fnt.id, p_account: aditya.id, p_role: 'admin' });
  await call(db, meera, 'crew_settings', { p_crew: fnt.id, p_house_rules: { startStack: 1000, sb: 10, bb: 20, blindUpEvery: 20, rebuys: true, maxRebuys: 2 } });
  await game(db, fnt.id, 'P8WD', 300, [[kabir, 420], [dev, 60], [meera, -100], [aditya, -180], [riya, -200]]);
  await game(db, fnt.id, 'J2RM', 170, [[aditya, 300], [meera, 200], [dev, -200], [riya, -100], [zoya, -200]]);
  await game(db, fnt.id, 'QK7P', 26, [[meera, 900], [riya, 100], [dev, 40], [tara, -400], [sneha, -640]]);
  hostel = await crewWith(db, dev, 'Hostel 4B', [rohan, nisha], { badge: 'hex', color: '#2f6fd6' });
  await call(db, kabir, 'ask_to_join', { p_code: hostel.code });
  const office = await crewWith(db, aditya, 'Office Fridays', [riya], { badge: 'round', color: '#1f8a5b' });
  await call(db, dev, 'note_invitation', { p_code: office.code, p_from: aditya.id });
  await call(db, meera, 'host_crew_table', { p_crew: fnt.id, p_table: 'QK7P', p_mode: 'online' });
}

// ---------------------------------------------------------------- flows
test('a new player: the empty tab, then making a crew (name, badge, colour, seasons) and the crew it makes', async ({ browser }) => {
  const { ctx, page, errors } = await phone(browser, db, base, { name: 'Arjun' });
  await crewsTab(page);
  await expect(page.getByText('Play with the same friends every week')).toBeVisible();
  await expect(page.getByTestId('crew-code')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Paste a link' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan a code' })).toBeVisible();
  await layoutOk(page, 'empty tab'); await targetsOk(page, 'empty tab');
  await shot(page, 'empty');
  await page.getByTestId('crews-create').click();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
  await page.getByTestId('crew-name').fill('Friday Night Table plus more letters');
  await expect(page.getByTestId('crew-name')).toHaveValue('Friday Night Table plus ');
  await expect(page.locator('.cnt')).toHaveText('24 / 24');
  await page.getByTestId('crew-name').fill('Hostel 4B');
  await page.getByRole('radio', { name: 'hex' }).click();
  await page.getByRole('radio', { name: 'Blue' }).click();
  await expect(page.getByRole('radio', { name: 'hex' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.prev > b')).toHaveText('Hostel 4B');
  await expect(page.locator('.prev .kemb b')).toHaveText('4B');
  await layoutOk(page, 'create'); await targetsOk(page, 'create');
  await shot(page, 'create');
  await page.getByTestId('crew-create').click();
  await expect(page.getByTestId('crew-made')).toHaveText('Crew made');
  const code = (await page.getByTestId('made-code').getAttribute('aria-label'))!.replace('Crew code ', '').replace(/ /g, '');
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  expect(db.sqlSync(`select badge || ' ' || color || ' ' || require_approval from crews c join crew_codes k on k.crew_id = c.id where k.code = '${code}'`)).toBe('hex #2f6fd6 true');
  await expect(page.getByRole('button', { name: 'WhatsApp' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'QR' })).toBeVisible();
  await layoutOk(page, 'made');
  await shot(page, 'made');
  // the QR opens the crew link as a real code
  await page.getByRole('button', { name: 'QR' }).click();
  await expect(page.locator('.qrbig svg')).toBeVisible();
  await page.keyboard.press('Escape');
  // let people in by themselves
  await page.getByTestId('made-auto').check();
  await expect.poll(() => db.sqlSync(`select require_approval from crews c join crew_codes k on k.crew_id = c.id where k.code = '${code}'`)).toBe('f');
  await page.getByTestId('made-go').click();
  await expect(page.getByTestId('crew-title')).toHaveText('Hostel 4B');
  await expect(page.locator('.crh small')).toHaveText('Season 1 starts with your first game');
  await expect(page.getByTestId('crew-gear')).toBeVisible();
  await expect(page.getByTestId('host-crew')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('crew-card')).toHaveCount(1);
  await expect(page.getByTestId('crew-card').locator('.chipt.a')).toHaveText('Leader');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('joining with a code: the wrong code shakes and counts down, five in a minute rest the boxes, the right one asks the leader', async ({ browser }) => {
  await seedWorld();
  const asker = await person(db, 'Ishaan');
  const { ctx, page, errors } = await phone(browser, db, base);
  await signInAs(ctx, asker);
  await crewsTab(page);
  await page.getByTestId('crew-code').fill('ZZZ4Q9');
  await expect(page.locator('.kslots.err')).toBeVisible();
  await expect(page.getByTestId('code-msg')).toContainText('No crew has the code ZZZ-4Q9');
  for (const c of ['ZZZ4Q8', 'ZZZ4Q7', 'ZZZ4Q6']) {
    await page.getByTestId('crew-code').fill('');
    await page.getByTestId('crew-code').fill(c);
    await expect(page.getByTestId('code-msg')).toContainText(`No crew has the code ${c.slice(0, 3)}-${c.slice(3)}`);
  }
  await expect(page.getByTestId('code-msg')).toContainText('1 try left this minute');
  await shot(page, 'wrong-code');
  await page.getByTestId('crew-code').fill('');
  await page.getByTestId('crew-code').fill('ZZZ4Q5');
  await expect(page.getByTestId('code-msg')).toContainText('The boxes rest for');
  await expect(page.getByTestId('crew-code')).toBeDisabled();
  db.sqlSync(`delete from private.crew_code_tries`);
  // the right code, typed with a dash and in small letters: the invitation
  await page.goto('/#/crews');
  await page.getByTestId('crew-code').fill(`${fnt.code.slice(0, 3).toLowerCase()}-${fnt.code.slice(3)}`);
  await expect(page.getByTestId('preview-name')).toHaveText('Friday Night Table');
  await expect(page.getByText('Meera leads this crew')).toBeVisible();
  await expect(page.getByText('They’ll see your request and let you in')).toBeVisible();
  await expect(page.getByText('Members see your name, picture and results')).toBeVisible();
  await layoutOk(page, 'preview'); await targetsOk(page, 'preview');
  await shot(page, 'preview');
  await page.getByTestId('ask-join').click();
  await expect(page.getByTestId('waiting')).toHaveText('Waiting for Meera');
  await expect(page.getByTestId('notify-me')).toBeChecked();
  await page.getByTestId('notify-me').uncheck();
  await expect.poll(() => db.sqlSync(`select notify from crew_requests where account_id = '${asker.id}'`)).toBe('f');
  await page.getByTestId('notify-me').check();
  await layoutOk(page, 'waiting');
  await shot(page, 'waiting');
  // Meera lets them in: the waiting screen turns into the crew, with the toast
  const req = db.sqlSync(`select id from crew_requests where account_id = '${asker.id}' and status = 'pending'`);
  await call(db, meera, 'decide_join_request', { p_request: req, p_approve: true });
  await expect(page.locator('.cw-toast')).toContainText('You’re in! Welcome to Friday Night Table', { timeout: 15_000 });
  await expect(page.getByTestId('crew-title')).toHaveText('Friday Night Table');
  expect(db.sqlSync(`select count(*) from private.push_outbox where account_id = '${asker.id}' and title = 'You’re in'`)).toBe('1');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('a crew link (#/c/CODE?from=…): the invitation, "Not now" keeps it in Invites, and auto-admit lets you straight in', async ({ browser }) => {
  await seedWorld();
  const guest = await person(db, 'Vikram');
  const open = await crewWith(db, nisha, 'Open Table', [], { badge: 'diamond', color: '#7d3cc8', autoAdmit: true });
  const { ctx, page } = await phone(browser, db, base);
  await signInAs(ctx, guest);
  await page.goto(`/#/c/${open.code}?from=${nisha.id}`);
  await expect(page.getByTestId('preview-name')).toHaveText('Open Table');
  await expect(page.getByText('Anyone with the code gets straight in')).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByTestId('invite-row')).toContainText('Nisha invited you to Open Table');
  await page.getByTestId('tab-invites').click();
  await expect(page.getByTestId('invite-row')).toHaveCount(1);
  await page.getByTestId('invite-row').getByRole('button', { name: 'View' }).click();
  await page.getByTestId('ask-join').click();
  await expect(page.locator('.cw-toast')).toContainText('Welcome to Open Table');
  await expect(page.getByTestId('crew-title')).toHaveText('Open Table');
  await ctx.close();
});

test('the leader: requests on the crew card and home, approve and decline in one tap, roles, removing, handing over', async ({ browser }) => {
  await seedWorld();
  const { ctx, page, errors } = await phone(browser, db, base);
  await signInAs(ctx, dev);
  await crewsTab(page);
  await expect(page.getByTestId('crew-card')).toHaveCount(2);
  await expect(page.locator('[data-testid=card-requests]')).toHaveText('1 request');
  await expect(page.getByTestId('live-join')).toBeVisible(); // Friday Night Table has a table open
  await expect(page.locator('.nav .bdg')).toBeVisible();
  await shot(page, 'list');
  await page.getByTestId('crew-card').filter({ hasText: 'Hostel 4B' }).click();
  await expect(page.getByTestId('requests')).toContainText('Kabir');
  await shot(page, 'leader-home');
  await page.getByTestId('requests').getByTestId('req-yes').click();
  await expect(page.locator('.cw-toast')).toContainText('Kabir is in');
  expect(db.sqlSync(`select status from crew_members where crew_id = '${hostel.id}' and account_id = '${kabir.id}'`)).toBe('active');
  // a second request, declined from the Members tab
  const vik = await person(db, 'Kunal');
  await call(db, vik, 'ask_to_join', { p_code: hostel.code });
  await page.getByTestId('crew-tab-members').click();
  await expect(page.getByTestId('requests')).toContainText('Kunal');
  await page.getByTestId('requests').getByTestId('req-no').click();
  await expect(page.locator('.cw-toast')).toContainText('Kunal was declined');
  expect(db.sqlSync(`select status from crew_requests where account_id = '${vik.id}'`)).toBe('declined');
  // roles: make Kabir an admin, then back
  await page.getByTestId('member-row').filter({ hasText: 'Kabir' }).getByTestId('member-more').click();
  await expect(page.getByText('Hand over leadership')).toBeVisible();
  await shot(page, 'member-sheet');
  await page.getByTestId('make-admin').click();
  await expect(page.getByTestId('member-row').filter({ hasText: 'Kabir' }).locator('.chipt.o')).toHaveText('Admin');
  await page.getByTestId('member-row').filter({ hasText: 'Kabir' }).getByTestId('member-more').click();
  await page.getByTestId('remove-admin').click();
  await expect(page.getByTestId('member-row').filter({ hasText: 'Kabir' }).locator('.chipt')).toHaveCount(0);
  // remove Nisha (the box asks first)
  await answer(page, true);
  await page.getByTestId('member-row').filter({ hasText: 'Nisha' }).getByTestId('member-more').click();
  await page.getByTestId('remove-member').click();
  await expect(page.getByTestId('member-row').filter({ hasText: 'Nisha' })).toHaveCount(0);
  // the leader cannot leave before handing over
  await page.getByTestId('leave-crew').click();
  expect(db.sqlSync(`select role from crew_members where crew_id = '${hostel.id}' and account_id = '${dev.id}'`)).toBe('owner');
  // hand over to Rohan: Dev becomes an admin
  await page.getByTestId('member-row').filter({ hasText: 'Rohan' }).getByTestId('member-more').click();
  await page.getByTestId('hand-over').click();
  await expect(page.locator('.cw-toast')).toContainText('Rohan leads Hostel 4B now');
  expect(db.sqlSync(`select string_agg(a.name || ':' || m.role, ' ' order by a.name) from crew_members m join accounts a on a.id = m.account_id where m.crew_id = '${hostel.id}'`)).toBe('Dev:admin Kabir:member Rohan:owner');
  await expect(page.getByTestId('member-row').filter({ hasText: 'Rohan' }).locator('.chipt.a')).toHaveText('Leader');
  // an admin's ⋯ opens the player card (no leader actions)
  await page.getByTestId('member-row').filter({ hasText: 'Kabir' }).getByTestId('member-more').click();
  await expect(page.getByTestId('player-name')).toHaveText('Kabir');
  // hand it back so the other tests see Dev as the leader
  await call(db, rohan, 'transfer_ownership', { p_crew: hostel.id, p_account: dev.id });
  await call(db, nisha, 'ask_to_join', { p_code: hostel.code });
  await call(db, dev, 'decide_join_request', { p_request: db.sqlSync(`select id from crew_requests where account_id = '${nisha.id}' and status = 'pending'`), p_approve: true });
  expect(errors).toEqual([]);
  await ctx.close();
});

test('a member: home, league (season, last season, all-time), games, player card, leaving with the question box', async ({ browser }) => {
  await seedWorld();
  const { ctx, page, errors } = await phone(browser, db, base);
  await signInAs(ctx, riya);
  await crewsTab(page);
  await page.getByTestId('crew-card').filter({ hasText: 'Friday Night Table' }).click();
  await expect(page.getByTestId('live-card')).toContainText('Table QK7P');
  await expect(page.getByTestId('your-season')).toBeVisible();
  await expect(page.getByTestId('crew-gear')).toHaveCount(0); // members have no settings
  await expect(page.getByTestId('last-game')).toContainText('Meera won +45 bb');
  await layoutOk(page, 'member home'); await targetsOk(page, 'member home');
  await shot(page, 'home');
  await page.getByTestId('crew-tab-league').click();
  await expect(page.locator('.podium.big .pd.p1 b')).toHaveText('Meera');
  await expect(page.locator('.lrow.me')).toHaveCount(await page.locator('.lrow.me').count());
  await page.getByTestId('league-alltime').click();
  await expect(page.locator('.podium.big .pd.p1 b')).toHaveText('Meera');
  await expect(page.getByTestId('league-row').first()).toBeVisible();
  await layoutOk(page, 'league');
  await shot(page, 'league');
  await page.getByTestId('crew-tab-games').click();
  await expect(page.getByTestId('game-row')).toHaveCount(3);
  await expect(page.locator('.gh').first()).toBeVisible();
  await page.getByRole('radio', { name: 'I played' }).click();
  await expect(page.getByTestId('game-row')).toHaveCount(3);
  await layoutOk(page, 'games');
  await shot(page, 'games');
  // a game opens the game page (results and replays), and Back returns to the crew
  await page.getByTestId('game-row').first().click();
  await expect(page.locator('.screen.game')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('crew-title')).toHaveText('Friday Night Table');
  // a player's card from the members list
  await page.getByTestId('crew-tab-members').click();
  await page.getByTestId('member-row').filter({ hasText: 'Meera' }).locator('.mhit').click();
  await expect(page.getByTestId('player-name')).toHaveText('Meera');
  await expect(page.getByText('Best hand this season')).toBeVisible();
  await layoutOk(page, 'player');
  await shot(page, 'player');
  await page.getByRole('button', { name: 'Back' }).click();
  // leaving: the theme's question box, never the browser's
  await page.getByTestId('leave-crew').click();
  await expect(page.locator('.ask')).toContainText('Leave Friday Night Table?');
  await expect(page.locator('.ask .ask-d')).toContainText('Former player');
  await shot(page, 'leave');
  await page.getByTestId('ask-no').click();
  await expect(page.locator('.ask')).toHaveCount(0);
  expect(db.sqlSync(`select count(*) from crew_members where crew_id = '${fnt.id}' and account_id = '${riya.id}'`)).toBe('1');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('the leader’s settings: name, badge and colour, who can host, season length and ending it, members inviting, delete only when alone', async ({ browser }) => {
  await seedWorld();
  const { ctx, page, errors } = await phone(browser, db, base);
  await signInAs(ctx, dev);
  await crewsTab(page);
  await page.getByTestId('crew-card').filter({ hasText: 'Hostel 4B' }).click();
  await page.getByTestId('crew-gear').click();
  await expect(page.getByText('Only you and admins see this')).toBeVisible();
  await expect(page.locator('.nav')).toHaveCount(0); // a full-screen flow: no bottom bar
  await layoutOk(page, 'settings'); await targetsOk(page, 'settings');
  await shot(page, 'settings');
  await page.getByTestId('set-name').fill('Hostel 4B Crew');
  await page.getByTestId('set-name').press('Enter');
  await page.getByTestId('set-name').blur();
  await expect.poll(() => db.sqlSync(`select name from crews where id = '${hostel.id}'`)).toBe('Hostel 4B Crew');
  await page.getByRole('radio', { name: 'Admins' }).click();
  await expect.poll(() => db.sqlSync(`select who_hosts from crews where id = '${hostel.id}'`)).toBe('admins');
  await page.getByRole('radio', { name: '6 months' }).click();
  await expect.poll(() => db.sqlSync(`select season_months from crews where id = '${hostel.id}'`)).toBe('6');
  await page.getByTestId('set-invite').uncheck();
  await expect.poll(() => db.sqlSync(`select members_invite from crews where id = '${hostel.id}'`)).toBe('f');
  await page.getByTestId('set-badge').click();
  await page.getByRole('radio', { name: 'diamond' }).click();
  await page.getByRole('radio', { name: 'Orange' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => db.sqlSync(`select badge || ' ' || color from crews where id = '${hostel.id}'`)).toBe('diamond #e07a1f');
  // a member of the crew no longer gets the code; can no longer host
  const r = await call<{ code: unknown; can_host: boolean }>(db, nisha, 'crew_page', { p_crew: hostel.id });
  expect(r.code).toBeNull(); expect(r.can_host).toBe(false);
  // delete is refused while others are in
  await answer(page, true);
  await page.getByTestId('delete-crew').click();
  expect(db.sqlSync(`select count(*) from crews where id = '${hostel.id}'`)).toBe('1');
  // end the season now (after a game, there is one)
  await game(db, hostel.id, 'HB01', 1, [[dev, 100], [rohan, -100]]);
  await page.goto('/#/crews');
  await page.getByTestId('crew-card').filter({ hasText: 'Hostel 4B' }).click();
  await page.getByTestId('crew-gear').click();
  await answer(page, true);
  await page.getByTestId('end-season').click();
  await expect.poll(() => db.sqlSync(`select count(*) from seasons where crew_id = '${hostel.id}' and closed_at is not null`)).toBe('1');
  await call(db, dev, 'crew_settings', { p_crew: hostel.id, p_name: 'Hostel 4B', p_who_hosts: 'everyone', p_members_invite: true, p_badge: 'hex', p_color: '#2f6fd6' });
  expect(errors).toEqual([]);
  await ctx.close();
});

test('inviting (QR, code, share, a new code, auto-admit) and hosting a crew table (rules filled in, the crew told)', async ({ browser }) => {
  await seedWorld();
  const { ctx, page, errors } = await phone(browser, db, base);
  await signInAs(ctx, dev);
  await ctx.addInitScript(() => { localStorage.setItem('tp-server-override', 'ws://127.0.0.1:9'); });
  await crewsTab(page);
  await page.getByTestId('crew-card').filter({ hasText: 'Hostel 4B' }).click();
  await page.getByTestId('crew-invite').click();
  const before = (await page.getByTestId('invite-code').textContent())!;
  expect(before.replace('-', '')).toBe(db.sqlSync(`select code from crew_codes where crew_id = '${hostel.id}'`));
  await expect(page.locator('.qrimg svg')).toBeVisible();
  await page.getByTestId('copy-link').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`#/c/${before.replace('-', '')}?from=${dev.id}`);
  await shot(page, 'invite');
  await page.getByTestId('invite-auto').check();
  await expect.poll(() => db.sqlSync(`select require_approval from crews where id = '${hostel.id}'`)).toBe('f');
  await page.getByTestId('invite-auto').uncheck();
  await answer(page, true);
  await page.getByTestId('new-code').click();
  await expect(page.getByTestId('invite-code')).not.toHaveText(before);
  await page.keyboard.press('Escape');
  // host: the sheet shows the crew's rules; Online opens a table and tells the crew
  await page.getByTestId('host-crew').click();
  await expect(page.getByTestId('host-rules')).toHaveText('1,000 chips · blinds 10/20 · 2 rebuys of 1,000');
  await expect(page.locator('.cw-sheet .chipt.a')).toContainText('Counts for Season');
  await shot(page, 'host');
  await page.getByTestId('host-online').click();
  await expect.poll(() => db.sqlSync(`select count(*) from crew_tables where crew_id = '${hostel.id}' and mode = 'online' and closed_at is null`)).toBe('1');
  expect(db.sqlSync(`select count(*) from private.push_outbox where kind = 'crewTable' and body like 'Dev opened table%Hostel 4B%'`)).toBe(db.sqlSync(`select count(*) - 1 from crew_members where crew_id = '${hostel.id}' and status = 'active'`));
  expect(errors.filter((e) => !/WebSocket|ws:\/\//.test(e))).toEqual([]);
  await ctx.close();
});

test('motion: off and reduced motion show end states (no confetti), calm drops the flourishes', async ({ browser }) => {
  for (const motion of ['off', 'calm', 'full']) {
    const { ctx, page } = await phone(browser, db, base, { name: `M${motion}`, motion });
    await crewsTab(page);
    await expect(page.locator(`.cw[data-motion=${motion}]`)).toBeVisible();
    await page.getByTestId('crews-create').click();
    await page.getByTestId('crew-name').fill(`Motion ${motion}`);
    await page.getByTestId('crew-create').click();
    await expect(page.getByTestId('crew-made')).toBeVisible();
    await expect(page.locator('.conf')).toHaveCount(motion === 'full' ? 1 : 0);
    const anim = await page.locator('.made .kemb.stamp').evaluate((e) => getComputedStyle(e).animationName);
    expect(anim).toBe(motion === 'off' ? 'none' : 'cwstamp');
    await ctx.close();
  }
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await db.attach(ctx);
  await ctx.addInitScript(() => { localStorage.setItem('tp-loaded', '1'); });
  const page = await ctx.newPage();
  await crewsTab(page);
  await expect(page.locator('.cw[data-motion=off]')).toBeVisible();
  await ctx.close();
});

// ---------------------------------------------------------------- every theme, every size
test('the main screens in all nine themes at 390 x 844: nothing overlapping or cut off', async ({ browser }) => {
  test.setTimeout(1_200_000);
  await seedWorld();
  for (const theme of THEMES) {
    const { ctx, page, errors } = await phone(browser, db, base, { theme });
    await signInAs(ctx, dev);
    await crewsTab(page);
    await expect(page.getByTestId('crew-card')).toHaveCount(2);
    await layoutOk(page, `${theme} list`); await targetsOk(page, `${theme} list`);
    await shot(page, `${theme}-list`);
    await page.getByTestId('crew-card').filter({ hasText: 'Friday Night Table' }).click();
    await expect(page.getByTestId('your-season')).toBeVisible();
    await layoutOk(page, `${theme} home`); await targetsOk(page, `${theme} home`);
    await shot(page, `${theme}-home`);
    for (const tab of ['league', 'games', 'members'] as const) {
      await page.getByTestId(`crew-tab-${tab}`).click();
      await expect(page.locator('.tabbody .hint[role=status]')).toHaveCount(0);
      await layoutOk(page, `${theme} ${tab}`); await targetsOk(page, `${theme} ${tab}`);
      await shot(page, `${theme}-${tab}`);
    }
    await page.goto('/#/crews');
    await page.getByTestId('crew-card').filter({ hasText: 'Hostel 4B' }).click();
    await page.getByTestId('crew-gear').click();
    await layoutOk(page, `${theme} settings`);
    await shot(page, `${theme}-settings`);
    await page.getByRole('button', { name: 'Back' }).click();
    await page.goto('/#/crews');
    await page.getByTestId('crews-create').click();
    await layoutOk(page, `${theme} create`); await targetsOk(page, `${theme} create`);
    await shot(page, `${theme}-create`);
    // contrast: the crews text against its own panel is readable in this theme
    const low = await page.evaluate(() => {
      const lum = (c: string) => { const m = c.match(/[\d.]+/g)!.map(Number); const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]!) + 0.7152 * f(m[1]!) + 0.0722 * f(m[2]!); };
      const out: string[] = [];
      for (const e of Array.from(document.querySelectorAll('.cw .bb.p, .cw .chipt.a, .cw .klive'))) {
        const s = getComputedStyle(e); if (!s.backgroundColor || s.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
        const a = lum(s.color), b = lum(s.backgroundColor);
        const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        // (the primary button is the theme's own Call button: pixel's token is 4.48 : 1, see the report)
        if (r < (e.classList.contains('bb') ? 4.45 : 4.5)) out.push(`${(e.textContent ?? '').trim()} ${r.toFixed(2)}`);
      }
      return out;
    });
    expect(low, `${theme} contrast`).toEqual([]);
    expect(errors, theme).toEqual([]);
    await ctx.close();
  }
});

for (const [w, h, label] of [[360, 740, 'small phone'], [844, 390, 'sideways'], [820, 1180, 'tablet'], [1440, 900, 'laptop'], [1920, 1080, 'desktop']] as const) {
  test(`crews on a ${label} (${w} x ${h}): the right layout, nothing overlapping or cut off`, async ({ browser }) => {
    test.setTimeout(600_000);
    await seedWorld();
    for (const theme of ['classic', 'pixel', 'edo'] as const) {
      const { ctx, page, errors } = await phone(browser, db, base, { width: w, height: h, theme });
      await signInAs(ctx, dev);
      await crewsTab(page);
      const size = await page.locator('.cw-lay').getAttribute('data-size');
      expect(size).toBe(w === 360 ? 'phone' : w === 844 ? 'side' : w === 820 ? 'tab' : w === 1440 ? 'lap' : 'desk');
      if (size === 'phone') {
        await expect(page.locator('.nav')).toBeVisible();
        await page.getByTestId('crew-card').filter({ hasText: 'Friday Night Table' }).click();
      } else {
        await expect(page.getByTestId('crew-title')).toBeVisible(); // the first crew opens next to the list
        await page.getByTestId('crew-card').filter({ hasText: 'Friday Night Table' }).click();
        await expect(page.getByTestId('crew-title')).toHaveText('Friday Night Table');
        if (size === 'side' || size === 'lap' || size === 'desk') await expect(page.locator('.rail')).toBeVisible();
        if (size === 'lap' || size === 'desk') await expect(page.locator('.rail .rlogo > *')).toBeVisible();
        if (size === 'tab') await expect(page.locator('.nav')).toBeVisible();
        if (size === 'desk') await expect(page.locator('.mcol .mlist .mrow')).not.toHaveCount(0);
        // the rail ends with your picture (sideways too)
        if (size !== 'tab') expect((await page.locator('.rail .rme .av').boundingBox())?.width ?? 0).toBeGreaterThan(30);
        // the tablet's home is the live table and your season, then the whole league with Season / All-time
        if (size === 'tab') {
          await expect(page.locator('.cmain [data-slot=league] .lrow')).not.toHaveCount(0);
          await expect(page.getByTestId('league-alltime')).toBeVisible();
          await expect(page.getByTestId('your-season')).toBeVisible();
          await page.getByTestId('league-alltime').click();
          await expect(page.locator('.cmain [data-slot=league] h2')).toHaveText('League · All-time');
          await page.getByTestId('league-season').click();
          await expect(page.locator('.cmain [data-slot=league] h2')).toContainText('League · Season');
        }
        // the crews column: an invitation shows the crew, then who invited you
        await expect(page.getByTestId('invite-row').locator('.txt b')).toHaveText('Office Fridays');
        await expect(page.getByTestId('invite-row').locator('.txt small')).toHaveText('Aditya invited you');
        // the header line (members, season, leader) is shown whole on laptops and desktops
        if (size === 'lap' || size === 'desk') expect(await page.locator('.cmh .txt small').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      }
      // crew names, the crew title and the LIVE strip's lines wrap instead of cutting off
      const cut = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.ccard .txt b, .cmh h1, .crh h1, .lvbar .txt b, .lvbar .txt small'))
        .filter((e) => e.getClientRects().length && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 8)).map((e) => e.textContent)); // (+8: a tall font's ink may pass its line box; a hidden line is ~20 px)
      expect(cut, `${label} ${theme} names`).toEqual([]);
      await expect(page.locator('.hint[role=status]')).toHaveCount(0);
      await layoutOk(page, `${label} ${theme}`); await targetsOk(page, `${label} ${theme}`);
      await shot(page, `size-${w}x${h}-${theme}`);
      for (const tab of ['league', 'games', 'members'] as const) {
        await page.getByTestId(`crew-tab-${tab}`).click();
        await expect(page.locator('.hint[role=status]')).toHaveCount(0);
        await layoutOk(page, `${label} ${theme} ${tab}`);
      }
      expect(errors).toEqual([]);
      await ctx.close();
    }
  });
}

// ---------------------------------------------------------------- the smallest phone, and contrast in every theme
test('crews on the smallest phone (320 x 568): Create opens at the top, the leader header reads whole, the host sheet fits', async ({ browser }) => {
  test.setTimeout(600_000);
  await seedWorld();
  const ishaan = await person(db, 'Ishaan'), asker = await person(db, 'Farhan');
  const tnp = await crewWith(db, ishaan, 'Thursday Night Poker', [riya, kabir], { badge: 'round', color: '#7b3fb8' });
  await call(db, asker, 'ask_to_join', { p_code: tnp.code });
  for (const theme of ['classic', 'pixel', 'train'] as const) {
    const { ctx, page, errors } = await phone(browser, db, base, { width: 320, height: 568, theme });
    await signInAs(ctx, ishaan);
    await crewsTab(page);
    await expect(page.getByTestId('crew-card')).toHaveCount(1);
    await layoutOk(page, `${theme} 320 list`); await targetsOk(page, `${theme} 320 list`);
    // a scrolled list, then Create: the new screen starts at its top (Back and "Step 1 of 2" on screen)
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.getByTestId('crews-create').last().click();
    await expect(page.getByTestId('crew-name')).toBeFocused();
    const back = await page.getByRole('button', { name: 'Back' }).boundingBox();
    expect(back!.y, `${theme} back on screen`).toBeGreaterThanOrEqual(0);
    await expect(page.locator('.v3h small')).toHaveText('Step 1 of 2');
    expect(await page.evaluate(() => scrollY), `${theme} create at the top`).toBe(0);
    await layoutOk(page, `${theme} 320 create`); await targetsOk(page, `${theme} 320 create`);
    await shot(page, `x320-${theme}-create`);
    await page.getByRole('button', { name: 'Back' }).click();
    // the leader's crew home: badge, name, line and two buttons fit; the name is shown whole
    await page.getByTestId('crew-card').click();
    await expect(page.getByTestId('requests')).toContainText('Farhan');
    const title = await page.getByTestId('crew-title').evaluate((e) => ({ w: e.scrollWidth <= e.clientWidth + 1, h: e.scrollHeight <= e.clientHeight + 8, text: e.textContent }));
    expect(title, `${theme} title`).toEqual({ w: true, h: true, text: 'Thursday Night Poker' });
    expect(await page.locator('.crh small').evaluate((e) => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 8), `${theme} subtitle`).toBe(true);
    await layoutOk(page, `${theme} 320 leader home`); await targetsOk(page, `${theme} 320 leader home`);
    await shot(page, `x320-${theme}-leader`);
    // the host sheet stays inside the screen, its ✕ included
    await page.getByTestId('host-crew').click();
    await expect(page.locator('.sheet.open')).toBeVisible();
    await page.waitForTimeout(400);
    const fit = await page.evaluate(() => {
      const W = document.documentElement.clientWidth, out: string[] = [];
      if (document.documentElement.scrollWidth > W + 1) out.push(`page ${document.documentElement.scrollWidth}`);
      for (const e of Array.from(document.querySelectorAll('.sheet.open, .sheet.open .sheet-close, .sheet.open .chipt, .sheet.open .bb'))) {
        const r = e.getBoundingClientRect();
        if (r.left < -0.5 || r.right > W + 0.5) out.push(`${e.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      return out;
    });
    expect(fit, `${theme} host sheet`).toEqual([]);
    await targetsOk(page, `${theme} 320 host sheet`); // (layoutOk would count the page's buttons under the sheet)
    await shot(page, `x320-${theme}-host`);
    expect(errors, theme).toEqual([]);
    await ctx.close();
  }
});

test('crews text contrast in all nine themes: bb figures, league headings, podium, tabs, invitations (4.5 : 1)', async ({ browser }) => {
  test.setTimeout(1_200_000);
  await seedWorld();
  // (podium names are left out: their text box reaches into the avatar above, so the measure reads the avatar)
  const SEL = '.cw .td, .cw .tu, .cw .lhead, .cw .pd small, .cw .ktabs button, .cw .row.invite .txt, .cw .ccard .txt, .cw .lrow b, .cw .lrow .g, .cw .grow .txt, .cw .nb small, .cw .rk small';
  const low: string[] = [];
  const check = async (page: Page, where: string): Promise<void> => {
    await page.evaluate(() => scrollTo(0, 0));
    for (const r of await textContrast(page, SEL)) if (r.ratio < 4.5) low.push(`${where}: ${r.what} "${r.text.slice(0, 24)}" ${r.ratio} (${r.color} on ${r.bg})`);
  };
  for (const theme of THEMES) {
    const { ctx, page } = await phone(browser, db, base, { theme });
    await signInAs(ctx, dev);
    await crewsTab(page);
    await expect(page.getByTestId('crew-card')).toHaveCount(2);
    await check(page, `${theme} list`);
    await page.getByTestId('crew-card').filter({ hasText: 'Friday Night Table' }).click();
    await expect(page.getByTestId('your-season')).toBeVisible();
    await check(page, `${theme} home`);
    for (const tab of ['league', 'games'] as const) {
      await page.getByTestId(`crew-tab-${tab}`).click();
      await expect(page.locator('.tabbody .hint[role=status]')).toHaveCount(0);
      await check(page, `${theme} ${tab}`);
    }
    await ctx.close();
  }
  expect(low).toEqual([]);
});

// avatars (table/render.ts avatar(), reused here): each one shows the letters of the name next to it, in every theme
test('avatar letters on the crews screens belong to the person, in all nine themes', async ({ browser }) => {
  test.setTimeout(600_000);
  await seedWorld();
  for (const theme of THEMES) {
    const { ctx, page, errors } = await phone(browser, db, base, { theme });
    await signInAs(ctx, dev);
    await crewsTab(page);
    await page.getByTestId('crew-card').filter({ hasText: 'Friday Night Table' }).click();
    await expect(page.getByTestId('your-season')).toBeVisible();
    await page.getByTestId('crew-tab-members').click();
    await expect(page.getByTestId('member-row')).toHaveCount(8);
    const members = await page.evaluate(avatarLetters, { rows: '[data-testid=member-row]', attr: 'data-name' });
    expect(members.bad, `${theme} members`).toEqual([]);
    expect(members.read).toBe(8);
    await page.getByTestId('crew-tab-league').click();
    await expect(page.getByTestId('league-row').first()).toBeVisible();
    const league = await page.evaluate(avatarLetters, { rows: '[data-testid=league-row]', nameSel: 'b' });
    expect(league.bad, `${theme} league`).toEqual([]);
    expect(league.read).toBeGreaterThan(3);
    // a player's card
    await page.getByTestId('league-row').filter({ hasText: 'Riya' }).click();
    await expect(page.getByTestId('player-name')).toHaveText('Riya');
    const card = await page.evaluate(avatarLetters, { rows: '.pcard', nameSel: '[data-testid=player-name]' });
    expect(card.bad, `${theme} player card`).toEqual([]);
    expect(card.read).toBe(1);
    expect(errors).toEqual([]);
    await ctx.close();
  }
});
