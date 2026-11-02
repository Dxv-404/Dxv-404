// Multi-phone test harness: every "phone" is its own browser context (own storage, screen,
// touch, permissions), so several friends can sit at one table inside a single test.
import type { Browser, BrowserContext, CDPSession, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface PhoneModel { label: string; width: number; height: number; scale: number; mobile: boolean; ua: string }

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** The screen sizes from the plan's device matrix (Chromium engine; real Safari runs on BrowserStack). */
export const MODELS = {
  smallAndroid: { label: 'Small Android 360x740', width: 360, height: 740, scale: 3, mobile: true, ua: ANDROID_UA },
  pixel7: { label: 'Pixel 7 412x915', width: 412, height: 915, scale: 2.6, mobile: true, ua: ANDROID_UA },
  iphoneSE: { label: 'iPhone SE 375x667', width: 375, height: 667, scale: 2, mobile: true, ua: IPHONE_UA },
  iphone15: { label: 'iPhone 15 393x852', width: 393, height: 852, scale: 3, mobile: true, ua: IPHONE_UA },
  tablet: { label: 'Tablet 820x1180', width: 820, height: 1180, scale: 2, mobile: true, ua: ANDROID_UA },
  laptop: { label: 'Laptop 1440x900', width: 1440, height: 900, scale: 1, mobile: false, ua: '' },
} satisfies Record<string, PhoneModel>;
export type ModelName = keyof typeof MODELS;

export interface Phone {
  name: string;
  model: PhoneModel;
  ctx: BrowserContext;
  page: Page;
  errors: string[];
  cdp: CDPSession;
  /** Cut or restore this phone's network. */
  offline(on: boolean): Promise<void>;
  /** Throttle this phone's network (latency in ms, throughput in kbit/s). */
  throttle(latencyMs: number, downKbps: number, upKbps: number): Promise<void>;
  /** Freeze the page like Android does to background tabs, or wake it. */
  freeze(on: boolean): Promise<void>;
}

export const NET = {
  slow3g: [400, 400, 400] as const,
  fast3g: [150, 1600, 750] as const,
  patchy4g: [80, 4000, 1500] as const,
};

export async function newPhone(browser: Browser, name: string, model: PhoneModel, baseURL: string, extra: Parameters<Browser['newContext']>[0] = {}): Promise<Phone> {
  const ctx = await browser.newContext({
    ...extra,
    baseURL,
    viewport: { width: model.width, height: model.height },
    deviceScaleFactor: model.scale,
    isMobile: model.mobile,
    hasTouch: model.mobile,
    ...(model.ua ? { userAgent: model.ua } : {}),
    permissions: ['camera'],
  });
  // the first-open 18+ notice is tested on its own (more.spec.ts); every other phone has seen it
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('tp-test-fresh') && !localStorage.getItem('tp-18')) localStorage.setItem('tp-18', '1'); } catch { /* blocked */ } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`[${name}] page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const phone: Phone = {
    name, model, ctx, page, errors, cdp,
    offline: async (on) => { await ctx.setOffline(on); },
    throttle: async (latency, down, up) => {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency, downloadThroughput: (down * 1024) / 8, uploadThroughput: (up * 1024) / 8,
      });
    },
    freeze: async (on) => { await cdp.send('Page.setWebLifecycleState', { state: on ? 'frozen' : 'active' }); },
  };
  await page.goto('/');
  // (the offline host phone's own pages start elsewhere)
  if (!baseURL.includes(':8765')) await expect(page.getByRole('button', { name: 'Host a new table' })).toBeVisible();
  return phone;
}

// ---------- flows for the legacy (QR-paired) app ----------

/** Host fills in the table and opens it. Names[0] is the host. */
export async function hostTable(host: Phone, names: string[]): Promise<void> {
  const p = host.page;
  await p.getByRole('button', { name: 'Host a new table' }).click();
  for (let i = 2; i < names.length; i++) await p.getByRole('button', { name: 'Add player' }).click();
  const inputs = p.locator('.name-row input');
  for (let i = 0; i < names.length; i++) await inputs.nth(i).fill(names[i]!);
  await p.getByRole('button', { name: 'Open the table' }).click();
}

/** Pairs a guest phone to the next open seat, feeding the QR payloads through the test hook
 *  instead of a camera (the payloads are the same strings the QR codes carry). */
export async function pair(host: Phone, guest: Phone, rejoinPid?: string): Promise<void> {
  // two phones on one busy machine sometimes fail to find each other the first time; the app says so and
  // the person pairs again, which is what this does (once)
  try { await pairOnce(host, guest, rejoinPid); }
  catch (e) {
    if (!/could not reach each other/.test(String((e as Error).message))) throw e;
    await guest.page.goto('/');
    await pairOnce(host, guest, rejoinPid);
  }
}

async function pairOnce(host: Phone, guest: Phone, rejoinPid?: string): Promise<void> {
  const hp = host.page, gp = guest.page;
  let offer: string;
  if (rejoinPid) {
    offer = await hp.evaluate((pid) => (window as any).__tp.host.pairOffer(pid), rejoinPid);
  } else {
    await hp.evaluate(() => { (window as any).__tp.host.lastOffer = null; });
    await hp.getByRole('button', { name: 'Pair phone' }).first().click();
    await hp.waitForFunction(() => (window as any).__tp.host?.lastOffer && (window as any).__tp.host.pending);
    offer = await hp.evaluate(() => (window as any).__tp.host.lastOffer);
    await expectNoJunkText(host);
  }
  await gp.getByRole('button', { name: /Join (or rejoin )?a table/ }).click();
  await gp.waitForFunction(() => (window as any).__tpScanner?.running);
  await gp.evaluate((o) => (window as any).__tpScanner._found(o), offer);
  await gp.waitForFunction(() => (window as any).__tp.guest?.lastReply);
  const reply = await gp.evaluate(() => (window as any).__tp.guest.lastReply);
  await expectNoJunkText(guest);
  if (rejoinPid) {
    await hp.evaluate((r) => (window as any).__tp.host.pairAnswer(r), reply);
  } else {
    await hp.getByRole('button', { name: 'Next:' }).click();
    await hp.waitForFunction(() => (window as any).__tpScanner?.running);
    await hp.evaluate((o) => (window as any).__tpScanner._found(o), reply);
  }
  await gp.waitForFunction(() => (window as any).__tp.guest?.status === 'connected', undefined, { timeout: 20_000 });
}

/** Chips on the table = all stacks + everything in the pot. Must never change during a game. */
export async function chipTotal(host: Phone): Promise<number> {
  return host.page.evaluate(() => {
    const e = (window as any).__tp.host.e;
    return e.s.players.reduce((a: number, p: any) => a + p.stack, 0) + (e.s.phase === 'hand' ? e.potTotal() : 0);
  });
}

/** Whoever has live action buttons takes one random legal action through the real UI.
 *  Busted players rebuy and the host deals the next hand, as real players would. */
export async function playOneAction(phones: Phone[], rnd: () => number): Promise<boolean> {
  for (const ph of phones) {
    const rebuy = ph.page.getByRole('button', { name: /^Rebuy/ });
    if (await rebuy.count()) await rebuy.first().click({ timeout: 3000 }).catch(() => {});
  }
  const deal = phones[0]!.page.getByRole('button', { name: 'Deal next hand' });
  if (await deal.count()) await deal.first().click({ timeout: 3000 }).catch(() => {});
  for (const ph of phones) {
    const p = ph.page;
    if (!(await p.locator('.actions.live').count())) continue;
    const r = rnd();
    const raise = p.locator('.actions.live .act.raise:not([disabled])');
    if (r < 0.2 && (await raise.count())) {
      await raise.click({ timeout: 3000 });
      const presets = ['Min', '½ pot', 'Pot', 'All-in'];
      await p.locator('.preset').getByText(presets[Math.floor(rnd() * presets.length)]!, { exact: true }).click();
      await p.locator('.raise-sheet .act').click();
      if (await p.locator('.raise-sheet.open').count()) await p.locator('.raise-sheet .act').click(); // all-in confirm
    } else {
      const btns = p.locator('.actions.live .act:not([disabled])');
      const k = await btns.count();
      if (!k) continue;
      await btns.nth(r < 0.35 ? 0 : Math.min(1, k - 1)).click({ timeout: 3000 });
    }
    return true;
  }
  return false;
}

export function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 0x100000000; };
}

export function expectNoErrors(phones: Phone[]): void {
  const all = phones.flatMap((p) => p.errors)
    // A WebRTC data channel closing while a test tears phones down is expected noise.
    .filter((e) => !/RTCDataChannel|Failed to execute 'send'/.test(e));
  expect(all, all.join('\n')).toEqual([]);
}

/** Text that only appears on screen by mistake ("false", "undefined", ...). */
export async function expectNoJunkText(ph: Phone): Promise<void> {
  const junk = await ph.page.evaluate(() => {
    const bad = new Set(['false', 'true', 'undefined', 'null', 'NaN', '[object Object]']);
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent ?? '').trim();
      if (bad.has(t) || /\bNaN\b|undefined/.test(t)) out.push(t);
    }
    return out;
  });
  expect(junk, `stray text on ${ph.name}'s screen`).toEqual([]);
}

/** A hotspot with no internet: phones still reach each other, but every web request fails. */
export async function noInternet(ph: Phone): Promise<void> {
  await ph.ctx.route('**/*', (route) => route.abort('internetdisconnected'));
}
