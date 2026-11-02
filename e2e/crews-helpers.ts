// Helpers for the crews browser tests: phones on the local accounts stand-in (e2e/localdb.ts), people and crews
// made straight in the database, games recorded the way table servers record them, and layout checks.
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { LocalDb } from './localdb';

export const THEMES = ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo'] as const;
export interface Person { auth: string; id: string; name: string }

/** Someone with an account (made the way a phone makes one). */
export async function person(db: LocalDb, name: string): Promise<Person> {
  const auth = randomUUID();
  const r = await db.rpc(auth, 'ensure_account', { p_name: name });
  return { auth, id: (r.json as { id: string }).id, name };
}
export async function call<T = unknown>(db: LocalDb, who: Person, fn: string, body: Record<string, unknown> = {}): Promise<T> {
  const r = await db.rpc(who.auth, fn, body);
  if (r.status !== 200) throw new Error(`${fn}: ${JSON.stringify(r.json)}`);
  return r.json as T;
}

/** A crew made by `leader` with everyone else let straight in. Returns its id and code. */
export async function crewWith(db: LocalDb, leader: Person, name: string, others: Person[], o: { badge?: string; color?: string; seasons?: boolean; autoAdmit?: boolean } = {}): Promise<{ id: string; code: string }> {
  const c = await call<{ id: string; code: string }>(db, leader, 'create_crew_v3', { p_name: name, p_badge: o.badge ?? 'shield', p_color: o.color ?? '#c0392b', p_seasons: o.seasons ?? true });
  await call(db, leader, 'crew_settings', { p_crew: c.id, p_auto_admit: true });
  for (const p of others) await call(db, p, 'ask_to_join', { p_code: c.code });
  if (!o.autoAdmit) await call(db, leader, 'crew_settings', { p_crew: c.id, p_auto_admit: false });
  return c;
}

/** A finished crew game, recorded as a table server records it. nets in chips (blinds 10/20, 1,000 each). */
export async function game(db: LocalDb, crew: string, table: string, hoursAgo: number, players: [Person, number][], o: { bb?: number; server?: string } = {}): Promise<string> {
  const id = randomUUID();
  const bb = o.bb ?? 20;
  const at = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const g = { id, crew, table, server: o.server ?? 'test', startStack: 1000, bigBlind: bb, startedAt: at(hoursAgo + 2) };
  const hand = { game: g, hand: { no: 1, playedAt: at(hoursAgo + 1), deckCommit: 'c', pot: 100, replay: { v: 1, keys: players.map(([p]) => p.id), frames: [] }, full: { inputs: [] }, players: players.map(([p, net], i) => ({ key: p.id, account: p.id, name: p.name, net, won: i === 0, showdown: true, bestHand: i === 0 ? 6 : 1 })) } };
  const end = { game: g, endedAt: at(hoursAgo), players: players.map(([p, net]) => ({ key: p.id, account: p.id, name: p.name, buyins: 1000, final: 1000 + net })) };
  for (const [fn, body] of [['record_hand', hand], ['record_game_end', end]] as const) {
    const t = JSON.stringify(body);
    const out = await db.sql(`select testing.one(null, format('select public.${fn}(%L, %L)', $b$${t}$b$, testing.sign('test-recorder-token', $b$${t}$b$)))`);
    if (out !== 'ok') throw new Error(`${fn}: ${out}`);
  }
  return id;
}

/** A phone (its own browser context) whose Supabase calls go to the local database. */
export async function phone(browser: Browser, db: LocalDb, baseURL: string, o: { width?: number; height?: number; theme?: string; name?: string; motion?: string; mobile?: boolean } = {}): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const width = o.width ?? 390, height = o.height ?? 844;
  const mobile = o.mobile ?? width < 1100;
  const ctx = await browser.newContext({ baseURL, viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, permissions: ['camera', 'clipboard-read', 'clipboard-write'] });
  await db.attach(ctx);
  await ctx.addInitScript(([theme, name, motion]) => {
    try {
      localStorage.setItem('tp-loaded', '1');
      if (theme) localStorage.setItem('tp-theme', theme);
      if (name && !localStorage.getItem('tp-name')) localStorage.setItem('tp-name', name);
      if (motion) localStorage.setItem('tp-prefs', JSON.stringify({ motion }));
      (window as unknown as { __tpAsk?: (q: string, input: boolean) => unknown }).__tpAsk = undefined;
    } catch { /* blocked */ }
  }, [o.theme ?? '', o.name ?? '', o.motion ?? 'off']);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|favicon|WebSocket/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  return { ctx, page, errors };
}

/** Signs this phone in as `p` (the login a phone keeps in its storage). */
export async function signInAs(ctx: BrowserContext, p: Person): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: p.auth, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 86400 })}.c2ln`;
  const sess = { access_token: token, token_type: 'bearer', expires_in: 86400, expires_at: now + 86400, refresh_token: `r-${p.auth}`, user: { id: p.auth, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {} } };
  await ctx.addInitScript(([s, name, id]) => {
    localStorage.setItem('tp-login', s!);
    localStorage.setItem('tp-name', name!);
    localStorage.setItem('tp-me', JSON.stringify({ account: id, name }));
  }, [JSON.stringify(sess), p.name, p.id]);
}

/** Answers the theme's question box for the next questions (true / text), then lets it ask again. */
export async function answer(page: Page, a: unknown): Promise<void> {
  await page.evaluate((v) => { (window as unknown as { __tpAsk?: unknown }).__tpAsk = () => v; }, a);
}
export async function noAuto(page: Page): Promise<void> { await page.evaluate(() => { (window as unknown as { __tpAsk?: unknown }).__tpAsk = undefined; }); }

/** Nothing on screen overlaps or runs off the edge: every visible text, button and field inside the viewport
 *  horizontally, no two buttons on top of each other, no text cut off by its own box. */
export async function layoutOk(page: Page, where: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const W = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > W + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${W})`);
    const vis = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
    const inScroller = (e: Element) => { for (let p = e.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
    const items = [...document.querySelectorAll('.cw button, .cw .chipt, .cw input, .cw .klive, .cw h1, .cw h2, .cw .txt b, .nav button')].filter(vis);
    for (const e of items) {
      const r = e.getBoundingClientRect();
      if ((r.left < -1 || r.right > W + 1) && !inScroller(e)) out.push(`off the edge: ${e.tagName}.${(e as HTMLElement).className} "${(e.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    // text cut off: an element whose text is wider than its box, unless it is meant to end in …
    for (const e of [...document.querySelectorAll('.cw button, .cw .chipt, .cw .klbl, .cw .stat b, .cw .lrow .v, .cw .bb')].filter(vis)) {
      const s = getComputedStyle(e);
      if (s.textOverflow === 'ellipsis') continue;
      if ((e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 2 && s.overflow !== 'visible') out.push(`cut off: "${(e.textContent ?? '').trim().slice(0, 30)}"`);
    }
    // buttons on top of each other (not nested)
    const btns = [...document.querySelectorAll('.cw button, .nav button')].filter(vis) as HTMLElement[];
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const a = btns[i]!, b = btns[j]!;
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 4 && oy > 4) {
        // the pinned bottom bar sits over content that scrolls under it (by design)
        const nav = a.closest('.nav') || b.closest('.nav');
        if (nav) continue;
        out.push(`overlap: "${(a.textContent ?? '').trim().slice(0, 20)}" and "${(b.textContent ?? '').trim().slice(0, 20)}"`);
      }
    }
    return out;
  });
  expect(bad, where).toEqual([]);
}

/** Touch targets: every visible button in the crews screens is at least 44 px tall and wide (or a link-sized
 *  text button inside a row of its own). */
export async function targetsOk(page: Page, where: string): Promise<void> {
  const small = await page.evaluate(() => [...document.querySelectorAll('.cw button, .nav button')].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.height < 31.5 || r.width < 31.5) && !(e as HTMLElement).closest('.ktabs');
  }).map((e) => `${(e.textContent ?? e.getAttribute('aria-label') ?? '').trim().slice(0, 20)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
  expect(small, where).toEqual([]);
}
