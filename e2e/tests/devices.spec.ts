// v3: your account on every device. Each "device" is its own browser context (phone or laptop size). The
// accounts database is a fresh local copy with every migration (e2e/fake-supabase.ts), never the live project;
// the table server is the Oracle build run locally, checking tickets against that same local database.
import { test, expect, type Browser, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODELS, newPhone, type Phone, type PhoneModel } from '../harness';
import { startFakeSupabase, useFakeSupabase, type FakeSupabase } from '../fake-supabase';


const root = join(import.meta.dirname, '..', '..');
const THEMES = ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo'];
const PORT = 18900 + Math.floor(Math.random() * 300);
let fake: FakeSupabase;
let server: ChildProcess | null = null;

test.beforeAll(async () => {
  fake = await startFakeSupabase();
  const b = spawnSync('pnpm', ['-s', 'build:node'], { cwd: join(root, 'apps/server'), encoding: 'utf8' });
  if (b.status !== 0) throw new Error(b.stderr);
  server = spawn(process.execPath, [join(root, 'apps/server/dist/node-server.mjs')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'tp-e2e-devices-')), HAND_PAUSE_MS: '800', SUPABASE_URL: fake.url }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
test.afterAll(async () => { server?.kill('SIGKILL'); await fake?.close(); });

/** A device with nothing on it, talking to the local accounts database. */
async function device(browser: Browser, baseURL: string, name: string, model: PhoneModel, theme = 'classic', extra: Parameters<Browser['newContext']>[0] = {}): Promise<Phone> {
  // (service workers blocked: requests they make would get past the routing to the local database)
  const p = await newPhone(browser, name, model, baseURL, { serviceWorkers: 'block', ...extra });
  await useFakeSupabase(p.ctx, fake);
  await p.page.evaluate(([port, t]) => {
    localStorage.setItem('tp-server-override', `ws://127.0.0.1:${port}`);
    localStorage.setItem('tp-intro-done', '1'); localStorage.setItem('tp-theme', t!);
  }, [String(PORT), theme] as const);
  await p.page.reload();
  return p;
}
async function makeProfile(page: Page, name: string): Promise<void> {
  await page.getByTestId('open-profile').click();
  await page.getByTestId('name').fill(name);
  await page.getByTestId('make-profile').click();
  await expect(page.getByTestId('profile-name')).toHaveText(name);
  await expect(page.getByTestId('device-this')).toBeVisible();
}
/** "Add a device" on this device: the code it shows. */
async function showCode(page: Page): Promise<string> {
  await page.getByTestId('add-device').click();
  const digits = page.getByTestId('device-code');
  await expect(digits).toBeVisible();
  const code = (await digits.getAttribute('aria-label'))!.replace(/\D/g, '');
  expect(code).toMatch(/^\d{6}$/);
  return code;
}
async function openUse(page: Page): Promise<void> {
  await page.getByTestId('open-profile').click();
  await page.getByTestId('use-account').click();
  await expect(page.getByTestId('code-boxes')).toBeVisible();
}
async function pad(page: Page, digits: string): Promise<void> {
  for (const d of digits) await page.locator(`.dv-pad [data-k="${d}"]`).click();
}
const wrongOf = (code: string): string => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
const errorsOf = (ps: Phone[]) => ps.flatMap((p) => p.errors).filter((e) => !/Failed to load resource|ERR_|net::|WebSocket|getUserMedia|NotAllowedError|NotFoundError/.test(e));

/** Nothing sticks out sideways, and every button is at least 44 px tall. */
async function layoutOk(page: Page, what: string): Promise<void> {
  const r = await page.evaluate(() => {
    const over = document.documentElement.scrollWidth - innerWidth;
    const small = Array.from(document.querySelectorAll('.dv button, .profile-body button, .dv-dlg button, .dv-pad button, .dv-merge button, .ask button'))
      .filter((b) => { const r = (b as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5 && getComputedStyle(b).visibility !== 'hidden'; })
      .map((b) => `${(b.textContent ?? '').trim().slice(0, 20)} ${Math.round((b as HTMLElement).getBoundingClientRect().height)}px`);
    return { over, small };
  });
  expect(r.over, `${what}: wider than the screen`).toBeLessThanOrEqual(1);
  expect(r.small, `${what}: small touch targets`).toEqual([]);
}

test('phone adds a laptop: the code on the phone, typed on the laptop; signed in; the phone gets a notice', async ({ browser, baseURL }) => {
  const phone = await device(browser, baseURL!, 'Phone', MODELS.pixel7);
  const laptop = await device(browser, baseURL!, 'Laptop', MODELS.laptop);
  await makeProfile(phone.page, 'Dev');
  const code = await showCode(phone.page);
  await expect(phone.page.locator('.dv-ring')).toBeVisible();
  await expect(phone.page.locator('.dv-stp').nth(2)).toContainText(`${code.slice(0, 3)} ${code.slice(3)}`);
  await expect(phone.page.locator('.dv-left')).toHaveText(/^[45]:\d\d left$/);
  // the laptop: a dialog, keyboard straight into the boxes
  await openUse(laptop.page);
  await expect(laptop.page.locator('.dv-dlg')).toBeVisible();
  await expect(laptop.page.getByTestId('code-0')).toBeFocused();
  await laptop.page.keyboard.type(code.slice(0, 3));
  await expect(laptop.page.getByTestId('code-3')).toBeFocused();
  await laptop.page.keyboard.type(code.slice(3));
  await expect(laptop.page.getByTestId('welcome')).toHaveText('Welcome back, Dev');
  await expect(laptop.page.locator('#toast')).toContainText('Your phone got a notice too.');
  await expect(laptop.page.getByTestId('moved')).toContainText('0crews');
  // the phone sees the laptop join, and lists it
  await expect(phone.page.locator('#toast')).toContainText('Your laptop is signed in', { timeout: 15_000 });
  await expect(phone.page.getByTestId('device-other')).toContainText('Dev’s laptop');
  await expect(phone.page.getByTestId('devices')).toContainText('2');
  // the laptop's menu knows who it is now
  await laptop.page.getByTestId('go-menu').click();
  await expect(laptop.page.getByTestId('open-profile')).toContainText('Dev');
  // next time the phone opens the app: "Signed in on a new laptop"
  await phone.page.goto('/');
  await expect(phone.page.getByTestId('device-notice-top')).toContainText('Signed in on a new laptop');
  await phone.page.getByTestId('device-notice-top').getByTestId('notice-ok').click();
  await expect(phone.page.getByTestId('device-notice-top')).toHaveCount(0);
  await phone.page.reload();
  await expect(phone.page.getByTestId('open-profile')).toBeVisible();
  await phone.page.waitForTimeout(1500);
  await expect(phone.page.getByTestId('device-notice-top')).toHaveCount(0); // once only
  expect(errorsOf([phone, laptop])).toEqual([]);
});

test('laptop adds a phone by QR; wrong codes shake and count down; the QR fills the boxes', async ({ browser, baseURL }) => {
  const laptop = await device(browser, baseURL!, 'Laptop', MODELS.laptop);
  const phone = await device(browser, baseURL!, 'Phone', MODELS.iphone15);
  await makeProfile(laptop.page, 'Riya');
  await laptop.page.getByTestId('add-device').click();
  const qr = laptop.page.getByTestId('device-qr');
  await expect(qr).toBeVisible();
  await expect(laptop.page.getByTestId('device-code')).toBeVisible(); // the QR and the code side by side
  const link = (await qr.getAttribute('data-text'))!;
  expect(link).toMatch(/#\/d\/\d{6}$/);
  // the phone: number pad; a wrong code first
  await openUse(phone.page);
  await pad(phone.page, wrongOf(link.slice(-6)));
  await expect(phone.page.getByTestId('code-msg')).toHaveText('That code doesn’t match. 4 tries left before a short pause.');
  await expect(phone.page.getByTestId('code-boxes')).toHaveClass(/err/);
  const red = await phone.page.getByTestId('code-0').evaluate((e) => getComputedStyle(e).boxShadow);
  expect(red).toMatch(/rgb/);
  await layoutOk(phone.page, 'wrong code');
  // typing again starts over
  await pad(phone.page, '1');
  await expect(phone.page.getByTestId('code-boxes')).not.toHaveClass(/err/);
  await expect(phone.page.getByTestId('code-0')).toHaveValue('1');
  await phone.page.locator('.dv-pad [data-k=del]').click();
  await expect(phone.page.getByTestId('code-0')).toHaveValue('');
  // scan the laptop's QR (the camera's answer fed through the scanner's test hook)
  await phone.page.getByTestId('scan-qr').click();
  await phone.page.waitForFunction(() => (window as any).__tpScanner);
  await phone.page.evaluate((t) => (window as any).__tpScanner._found(t), link);
  await expect(phone.page.getByTestId('welcome')).toHaveText('Welcome back, Riya');
  await expect(laptop.page.locator('#toast')).toContainText('Your phone is signed in', { timeout: 15_000 });
  expect(errorsOf([phone, laptop])).toEqual([]);
});

test('a scanned link opens the app on the code; pasting fills every box; Tab moves between boxes', async ({ browser, baseURL }) => {
  const a = await device(browser, baseURL!, 'A', MODELS.pixel7);
  const b = await device(browser, baseURL!, 'B', MODELS.smallAndroid);
  const lap = await device(browser, baseURL!, 'Laptop', MODELS.laptop);
  await makeProfile(a.page, 'Kabir');
  const code = await showCode(a.page);
  // a phone's own camera opens the QR's link
  await b.page.goto(`/#/d/${code}`);
  await expect(b.page.getByTestId('welcome')).toHaveText('Welcome back, Kabir');
  // pasting on a laptop
  await a.page.getByTestId('add-device').click().catch(() => {});
  await a.page.goto('/');
  await a.page.getByTestId('open-profile').click();
  const code2 = await showCode(a.page);
  await openUse(lap.page);
  await lap.page.keyboard.press('Tab');
  await expect(lap.page.getByTestId('code-1')).toBeFocused();
  await lap.page.keyboard.press('Shift+Tab');
  await lap.page.getByTestId('code-0').evaluate((el, t) => {
    const dt = new DataTransfer(); dt.setData('text/plain', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, `Code: ${code2.slice(0, 3)} ${code2.slice(3)}`);
  await expect(lap.page.getByTestId('welcome')).toHaveText('Welcome back, Kabir');
  expect(errorsOf([a, b, lap])).toEqual([]);
});

test('expired, used and cancelled codes; 5 wrong tries cancel the code and pause the device', async ({ browser, baseURL }) => {
  const a = await device(browser, baseURL!, 'A', MODELS.pixel7);
  const b = await device(browser, baseURL!, 'B', MODELS.pixel7);
  const c = await device(browser, baseURL!, 'C', MODELS.pixel7);
  await makeProfile(a.page, 'Meera');
  const code = await showCode(a.page);
  // the code runs out (moved 5 minutes on in the database)
  await fake.sql(`update private.device_codes set expires_at = now() - interval '1 second' where status = 'open'`);
  await openUse(b.page);
  await pad(b.page, code);
  await expect(b.page.getByTestId('code-msg')).toHaveText('This code ran out. Make a new one on your other device; it takes a second.');
  await expect(b.page.getByTestId('code-boxes')).toHaveClass(/err/);
  // a new code; five wrong tries from B cancel it, and B waits
  await a.page.getByTestId('new-code').click();
  await expect(a.page.getByTestId('device-code')).not.toHaveAttribute('aria-label', `Code ${[...code].join(' ')}`);
  const fresh = (await a.page.getByTestId('device-code').getAttribute('aria-label'))!.replace(/\D/g, '');
  const tries = ['4 tries left', '3 tries left', '2 tries left', '1 try left'];
  for (const left of tries) {
    await pad(b.page, wrongOf(fresh));
    await expect(b.page.getByTestId('code-msg')).toContainText(left);
  }
  await pad(b.page, wrongOf(fresh));
  await expect(b.page.getByTestId('code-msg')).toHaveText('That code doesn’t match. Wait a few minutes before you try again.');
  await pad(b.page, fresh);
  await expect(b.page.getByTestId('code-msg')).toHaveText('Too many wrong codes. Wait a few minutes, then try again.');
  await openUse(c.page);
  await pad(c.page, fresh);
  await expect(c.page.getByTestId('code-msg')).toContainText('This code was cancelled');
  // a code works once
  await a.page.getByTestId('new-code').click();
  await expect(a.page.getByTestId('device-code')).not.toHaveAttribute('aria-label', `Code ${[...fresh].join(' ')}`);
  const once = (await a.page.getByTestId('device-code').getAttribute('aria-label'))!.replace(/\D/g, '');
  await pad(c.page, once);
  await expect(c.page.getByTestId('welcome')).toHaveText('Welcome back, Meera');
  const d = await device(browser, baseURL!, 'D', MODELS.pixel7);
  await openUse(d.page);
  await pad(d.page, once);
  await expect(d.page.getByTestId('code-msg')).toHaveText('This code was already used. Make a new one on your other device.');
  expect(errorsOf([a, b, c, d])).toEqual([]);
});

test('a device with its own crew: asked once; Bring them over, or Leave them behind', async ({ browser, baseURL }) => {
  const a = await device(browser, baseURL!, 'A', MODELS.pixel7);
  const old = await device(browser, baseURL!, 'Old phone', MODELS.iphone15);
  const spare = await device(browser, baseURL!, 'Spare', MODELS.smallAndroid);
  await makeProfile(a.page, 'Dev');
  for (const [p, crew] of [[old, 'Hostel 4B'], [spare, 'Spare crew']] as const) {
    await makeProfile(p.page, 'Dev (other)');
    await p.page.getByTestId('new-crew').click();
    await p.page.getByTestId('crew-name').fill(crew);
    await p.page.getByTestId('crew-create').click();
    await expect(p.page.getByTestId('crew-title')).toHaveText(crew);
    await p.page.goto('/');
  }
  let code = await showCode(a.page);
  await openUse(old.page);
  await pad(old.page, code);
  const sheet = old.page.getByTestId('merge-sheet');
  await expect(sheet).toContainText('This phone has its own crew');
  await expect(sheet).toContainText('Hostel 4B');
  await expect(sheet).toContainText('1 member · you’re the leader · 0 games');
  await layoutOk(old.page, 'merge sheet');
  await old.page.getByTestId('merge-bring').click();
  await expect(old.page.getByTestId('welcome')).toHaveText('Welcome back, Dev');
  await expect(old.page.getByTestId('moved')).toContainText('1crew');
  // the account has the crew now, on every device
  await a.page.goto('/');
  await a.page.getByTestId('open-profile').click();
  await expect(a.page.getByTestId('crews')).toContainText('Hostel 4B');
  // leave them behind
  code = await showCode(a.page);
  await openUse(spare.page);
  await pad(spare.page, code);
  await expect(spare.page.getByTestId('merge-sheet')).toContainText('Spare crew');
  await spare.page.getByTestId('merge-leave').click();
  await expect(spare.page.getByTestId('welcome')).toHaveText('Welcome back, Dev');
  await expect(spare.page.getByTestId('moved')).toContainText('1crew'); // Hostel 4B only
  await spare.page.getByTestId('go-menu').click();
  await spare.page.getByTestId('open-profile').click();
  await expect(spare.page.getByTestId('crews')).toContainText('Hostel 4B');
  await expect(spare.page.getByTestId('crews')).not.toContainText('Spare crew');
  expect(errorsOf([a, old, spare])).toEqual([]);
});

test('Not me? Log it out: from the notice, and from the device list (⋯), with rename', async ({ browser, baseURL }) => {
  const a = await device(browser, baseURL!, 'A', MODELS.pixel7);
  const thief = await device(browser, baseURL!, 'Thief', MODELS.laptop);
  const tab = await device(browser, baseURL!, 'Tablet', MODELS.tablet);
  await makeProfile(a.page, 'Zoya');
  let code = await showCode(a.page);
  await openUse(thief.page);
  await thief.page.keyboard.type(code);
  await expect(thief.page.getByTestId('welcome')).toBeVisible();
  // the phone's profile shows the notice; "Not me" logs the laptop out
  await a.page.goto('/');
  await a.page.getByTestId('open-profile').click();
  const notice = a.page.getByTestId('device-notice');
  await expect(notice).toContainText('Signed in on a new laptop');
  await notice.getByTestId('notice-not-me').click();
  await expect(a.page.locator('#toast')).toContainText('The new laptop is logged out');
  await expect(a.page.getByTestId('device-other')).toHaveCount(0);
  // the laptop is a stranger again: its own (new, empty) account, none of Zoya's devices
  await thief.page.goto('/');
  await thief.page.getByTestId('open-profile').click();
  await expect(thief.page.getByTestId('device-this')).toBeVisible();
  await expect(thief.page.getByTestId('device-other')).toHaveCount(0);
  // the tablet joins; rename it, then log it out from ⋯
  code = await showCode(a.page);
  await openUse(tab.page);
  await pad(tab.page, code);
  await expect(tab.page.getByTestId('welcome')).toBeVisible();
  await expect(a.page.getByTestId('device-other')).toContainText('Zoya’s phone', { timeout: 20_000 });
  await a.page.getByTestId('device-more').click();
  await a.page.getByTestId('device-rename').click();
  await a.page.getByTestId('ask-text').fill('Living room tab');
  await a.page.getByTestId('ask-yes').click();
  await expect(a.page.getByTestId('device-other')).toContainText('Living room tab');
  await a.page.getByTestId('device-more').click();
  await a.page.getByTestId('device-logout').click();
  await a.page.getByTestId('ask-yes').click();
  await expect(a.page.getByTestId('device-other')).toHaveCount(0);
  expect(errorsOf([a, thief, tab])).toEqual([]);
});

test('one seat per player: a second device asks; Just watch; Move seat here; the other device watches', async ({ browser, baseURL }) => {
  const phone = await device(browser, baseURL!, 'Phone', MODELS.pixel7);
  const laptop = await device(browser, baseURL!, 'Laptop', MODELS.laptop);
  const friend = await device(browser, baseURL!, 'Friend', MODELS.iphoneSE);
  await makeProfile(phone.page, 'Dev');
  const code = await showCode(phone.page);
  await openUse(laptop.page);
  await laptop.page.keyboard.type(code);
  await expect(laptop.page.getByTestId('welcome')).toBeVisible();
  await phone.page.goto('/');
  // the phone opens a table; a friend joins as a guest
  await phone.page.getByTestId('play-online').click();
  await phone.page.getByTestId('online-host').click();
  await phone.page.getByTestId('online-open').click();
  await expect(phone.page.locator('.tp.live')).toBeVisible();
  await phone.page.locator('[data-act=menu]').click();
  const link = (await phone.page.getByTestId('table-link').textContent())!.replace(/^https?:\/\/[^/]+/, '');
  await phone.page.keyboard.press('Escape');
  await friend.page.evaluate(() => localStorage.setItem('tp-name', 'Riya'));
  await friend.page.goto(link);
  await expect(friend.page.locator('.tp.live .seat')).toHaveCount(1);
  // the laptop opens the same table: asked, as designed
  await laptop.page.goto(link);
  const askBox = laptop.page.getByTestId('seat-ask');
  await expect(askBox).toContainText('You’re playing on your phone');
  await expect(askBox).toContainText('Only one device can play it at a time');
  await layoutOk(laptop.page, 'seat ask');
  await laptop.page.getByTestId('ask-no').click(); // Just watch
  await expect(laptop.page.getByTestId('watching-elsewhere')).toContainText('your seat is on your phone');
  await expect(phone.page.getByTestId('watching-elsewhere')).toHaveCount(0);
  // the phone still plays: deal, and its cards are its own
  await phone.page.locator('[data-act=deal]').click();
  await expect(phone.page.locator('.hero .hc .cd:not(.dn)').first()).toBeAttached({ timeout: 15_000 });
  // Move seat here: the laptop plays, the phone watches with a notice
  await laptop.page.getByTestId('move-seat').click();
  await expect(laptop.page.getByTestId('watching-elsewhere')).toHaveCount(0);
  await expect(phone.page.locator('#toast')).toContainText('Your seat moved to your laptop. This device watches now.');
  await expect(phone.page.getByTestId('watching-elsewhere')).toContainText('your seat is on your laptop');
  // and back again from the phone
  await phone.page.getByTestId('move-seat').click();
  await expect(phone.page.getByTestId('watching-elsewhere')).toHaveCount(0);
  await expect(laptop.page.getByTestId('watching-elsewhere')).toContainText('your seat is on your phone');
  // the playing device loses its connection and comes back: seamless, no question, still its seat
  await phone.offline(true);
  await phone.page.waitForTimeout(1500);
  await phone.offline(false);
  await phone.page.waitForTimeout(4000);
  await expect(phone.page.getByTestId('seat-ask')).toHaveCount(0);
  await expect(phone.page.getByTestId('watching-elsewhere')).toHaveCount(0);
  await expect(laptop.page.getByTestId('watching-elsewhere')).toContainText('your seat is on your phone');
  await expect(laptop.page.getByTestId('seat-ask')).toHaveCount(0);
  expect(errorsOf([phone, laptop, friend])).toEqual([]);
});

// ---------------------------------------------------------------- every theme, three sizes
const SIZES = [['phone', { ...MODELS.iphone15, width: 390, height: 844 }], ['small', MODELS.smallAndroid], ['laptop', MODELS.laptop]] as const;
for (const theme of THEMES) {
  test(`the devices screens in the ${theme} theme at 390×844, 360×740 and 1440×900`, async ({ browser, baseURL }, info) => {
    const shot = async (p: Page, name: string) => { await p.waitForTimeout(700); await p.screenshot({ path: info.outputPath(`${theme}-${name}.png`) }); };
    const owner = await device(browser, baseURL!, 'Owner', SIZES[0][1], theme);
    await makeProfile(owner.page, 'Dev');
    await layoutOk(owner.page, 'profile');
    await shot(owner.page, 'phone-profile');
    let code = await showCode(owner.page);
    await layoutOk(owner.page, 'add a device');
    await shot(owner.page, 'phone-add-code');
    await owner.page.getByTestId('show-qr').click();
    await expect(owner.page.getByTestId('device-qr')).toBeVisible();
    await layoutOk(owner.page, 'add a device (QR)');
    await shot(owner.page, 'phone-add-qr');
    await owner.page.getByTestId('show-code').click();
    for (const [size, model] of SIZES) {
      const p = await device(browser, baseURL!, `${size} device`, model, theme);
      await openUse(p.page);
      await layoutOk(p.page, `${size}: enter`);
      await shot(p.page, `${size}-enter`);
      if (size === 'laptop') await p.page.keyboard.type(wrongOf(code)); else await pad(p.page, wrongOf(code));
      await expect(p.page.getByTestId('code-msg')).toContainText('doesn’t match');
      await shot(p.page, `${size}-wrong`);
      if (size === 'laptop') {
        await p.page.getByTestId('code-0').click();
        await p.page.keyboard.type(code);
      } else await pad(p.page, code);
      await expect(p.page.getByTestId('welcome')).toBeVisible();
      await layoutOk(p.page, `${size}: signed in`);
      await shot(p.page, `${size}-signed-in`);
      if (size === 'laptop') {
        await p.page.getByTestId('go-menu').click();
        await p.page.getByTestId('open-profile').click();
        await p.page.getByTestId('add-device').click();
        await expect(p.page.getByTestId('device-qr')).toBeVisible();
        await shot(p.page, 'laptop-add');
      }
      // the owner's screen sees the new device and goes back to the list; the next size needs a fresh code
      await expect(owner.page.locator('#toast')).toContainText('is signed in', { timeout: 15_000 });
      await expect(owner.page.getByTestId('device-this')).toBeVisible();
      if (size === 'small') { await layoutOk(owner.page, 'profile with devices'); await shot(owner.page, 'phone-profile-2'); }
      code = await showCode(owner.page);
      await p.ctx.close();
    }
    expect(errorsOf([owner])).toEqual([]);
  });
}
