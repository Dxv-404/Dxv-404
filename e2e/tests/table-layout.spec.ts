// Phase 6 gate: the 693 layout checks of the design phase, now on the live table the app draws:
// 9 themes x 11 screens x 7 table sizes (2 to 15 players), mid-hand with bets, a folded seat, the board and
// the pot. Nothing may overlap, be cut off or fall off the felt; buttons stay at least 44 px tall; text stays
// readable. Screenshots of every theme at three sizes go to test-results/tables for a look.
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { Engine, sha256hex } from '@tp/engine';

const DEVICES: [string, number, number][] = [
  ['Small phone', 360, 740], ['iPhone SE', 375, 667], ['Phone', 390, 844], ['Large phone', 430, 932],
  ['Small phone sideways', 667, 375], ['Phone sideways', 844, 390], ['Tablet', 820, 1180], ['Tablet sideways', 1180, 820],
  ['Small laptop', 1280, 720], ['Laptop', 1440, 900], ['Desktop', 1920, 1080],
];
const COUNTS = [2, 4, 6, 8, 10, 12, 15];
const THEMES = ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo'];
const NAMES = ['Dev', 'Aditya', 'Sneha', 'Kabir', 'Meera', 'Arjun', 'Ishaan', 'Tara', 'Riya', 'Zoya', 'Rohan', 'Vikram', 'Nisha', 'Kunal', 'Priya'];

/** A table mid-hand, seen from Dev's seat: everyone in, some called, one folded, the flop out, bets on the turn. */
function viewFor(n: number, scene: 'flop' | 'preflop' | 'showdown' = 'flop'): unknown {
  if (scene !== 'flop') return sceneView(n, scene);
  const e = Engine.create('lab', { startStack: 2000, turnTime: 20, maxPlayers: 15 }, 0);
  for (let i = 0; i < n; i++) { e.apply({ t: 'join', id: `p${i}`, name: NAMES[i]!, now: 0 }); e.apply({ t: 'presence', pid: `p${i}`, connected: true, now: 0 }); }
  e.apply({ t: 'start', seed: sha256hex(`layout-${n}-${scene}`), now: 1 });
  let k = 0;
  while (e.s.hand!.street === 'preflop' && e.s.hand!.toAct) { const pid = e.s.hand!.toAct; e.apply({ t: 'act', pid, action: k++ === 1 && n > 3 ? { type: 'fold' } : { type: e.legal(pid)!.canCheck ? 'check' : 'call' }, now: 2 }); }
  // on the flop: a bet and a call or two, then it is Dev's turn
  for (let i = 0; i < 3 && e.s.hand!.toAct && e.s.hand!.toAct !== 'p0'; i++) {
    const pid = e.s.hand!.toAct; const L = e.legal(pid)!;
    e.apply({ t: 'act', pid, action: i === 0 && L.canRaise ? { type: 'bet', to: L.minTo * 3 } : { type: L.canCheck ? 'check' : 'call' }, now: 3 });
  }
  const v = e.viewFor('p0') as unknown as Record<string, unknown>;
  return { ...v, isHost: true, hostId: 'p0', turnLeft: 14000, turnTotal: 20000, nextIn: 0 };
}

/** Two more moments: the first action of a hand (everyone in, blinds out) and a showdown (cards face up). */
function sceneView(n: number, scene: 'preflop' | 'showdown'): unknown {
  const e = Engine.create('lab', { startStack: 2000, turnTime: 20, maxPlayers: 15 }, 0);
  for (let i = 0; i < n; i++) { e.apply({ t: 'join', id: `p${i}`, name: NAMES[i]!, now: 0 }); e.apply({ t: 'presence', pid: `p${i}`, connected: true, now: 0 }); }
  e.apply({ t: 'start', seed: sha256hex(`layout-${n}-${scene}`), now: 1 });
  if (scene === 'showdown') {
    while (e.s.phase === 'hand' && e.s.hand!.toAct) { const pid = e.s.hand!.toAct; const L = e.legal(pid)!; e.apply({ t: 'act', pid, action: { type: L.canCheck ? 'check' : 'call' }, now: 2 }); }
  }
  const v = e.viewFor('p0') as unknown as Record<string, unknown>;
  return { ...v, isHost: true, hostId: 'p0', turnLeft: 14000, turnTotal: 20000, nextIn: 0 };
}

const CHECK = `(f) => {
  const R = e => e.getBoundingClientRect();
  const hit = (a, b, pad=1) => !(a.right-pad <= b.left || b.right-pad <= a.left || a.bottom-pad <= b.top || b.bottom-pad <= a.top);
  const inside = (a, b, tol=1) => a.left >= b.left - tol && a.right <= b.right + tol && a.top >= b.top - tol && a.bottom <= b.bottom + tol;
  for (const a of f.getAnimations({ subtree: true })) { const end = Number(a.effect?.getComputedTiming().endTime); if (Number.isFinite(end)) a.finish(); else a.cancel(); }
  const s = R(f).width / parseFloat(f.style.width), out = [];
  const seats = [...f.querySelectorAll('.seat')];
  const parts = st => [...st.querySelectorAll(':scope > .av, :scope > .plate, :scope > .tag')].filter(e => getComputedStyle(e).display != 'none').map(R);
  for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++)
    for (const a of parts(seats[i])) for (const b of parts(seats[j])) if (hit(a, b)) out.push('seat overlap ' + seats[i].dataset.n + '/' + seats[j].dataset.n);
  const bets = [...f.querySelectorAll('.bet, .dbtn')];
  for (let i = 0; i < bets.length; i++) for (let j = i + 1; j < bets.length; j++) if (hit(R(bets[i]), R(bets[j]))) out.push('bet overlap');
  const felt = f.querySelector('.felt');
  const fixed = [...f.querySelectorAll('.board, .pot, .wpill, .sidepot, .bet, .dbtn, .dealer, .bubble')];
  // after a showdown: the result pill clear of every hand shown and of the board
  for (const p of f.querySelectorAll('.wpill')) {
    for (const c of f.querySelectorAll('.seat .shown .cd, .board .cd')) if (hit(R(p), R(c), 1)) out.push('pill x ' + (c.closest('.seat') ? 'shown cards of ' + c.closest('.seat').dataset.n : 'board'));
    if (!inside(R(p), R(felt), 2)) out.push('pill outside felt');
  }
  for (const st of seats) for (const a of parts(st)) for (const x of fixed) if (hit(a, R(x), 2)) out.push('seat ' + st.dataset.n + ' x ' + String(x.className.baseVal ?? x.className).split(' ')[0]);
  for (const b of f.querySelectorAll('.bet')) for (const x of f.querySelectorAll('.board, .pot, .sidepot')) if (hit(R(b), R(x))) out.push('bet x ' + x.className.split(' ')[0]);
  const arena = R(f.querySelector('.arena'));
  for (const st of seats) for (const a of parts(st)) if (!inside(a, arena, 2)) out.push('seat ' + st.dataset.n + ' clipped');
  for (const b of f.querySelectorAll('.dbtn, .bet')) if (!inside(R(b), arena, 1)) out.push('button or bet clipped');
  for (const x of f.querySelectorAll('.felt > .board, .felt > .pot, .felt > .sidepot')) if (!inside(R(x), R(felt), 2)) out.push(x.className.split(' ')[0] + ' outside felt');
  const top = f.querySelector('.top'); const tr = R(top);
  const kids = [...top.children].filter(e => R(e).width > 0);
  for (const k of kids) if (R(k).right > Math.min(tr.right, R(f).right) + 1 || R(k).left < tr.left - 1) out.push('top bar overflow');
  for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) if (hit(R(kids[i]), R(kids[j]), 1)) out.push('top bar items touch');
  for (const a of f.querySelectorAll('.act')) { const h = R(a).height / s; if (h < 44) out.push('button ' + Math.round(h) + 'px tall'); }
  const hero = f.querySelector('.hero'); if (hero) for (const k of hero.children) if (R(k).right > R(f).right + 1) out.push('hero overflow');
  for (const k of f.querySelectorAll('.dock > *, .actions > *')) if (R(k).right > R(f).right + 1 || R(k).bottom > R(f).bottom + 1) out.push('controls overflow');
  if (R(f).right > innerWidth + 1 || R(f).bottom > innerHeight + 1) out.push('table larger than the screen');
  const minFont = Math.min(...[...f.querySelectorAll('.plate b, .plate i, .tag, .bet span')].filter(e => getComputedStyle(e).display != 'none').map(e => parseFloat(getComputedStyle(e).fontSize) * s));
  return { issues: [...new Set(out)], minFont: Math.round(minFont * 10) / 10 };
}`;

for (const [scene, big] of [['flop', false], ['preflop', false], ['showdown', false], ['flop', true]] as const) test(`693 layout checks (${scene}${big ? ', large text' : ''}) @layout: 9 themes, 11 screens, 2 to 15 players`, async ({ browser, baseURL }) => {
  test.setTimeout(1_500_000);
  const views = Object.fromEntries(COUNTS.map((n) => [n, viewFor(n, scene)]));
  const failures: string[] = [];
  let checked = 0, smallest = 99;
  mkdirSync('test-results/tables', { recursive: true });
  for (const [label, W, H] of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, baseURL });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.evaluate(() => { (window as any).__tpLab.loadDesignCss(); });
    for (const theme of THEMES) {
      await page.evaluate((t) => (window as any).__tpLab.setTheme(t), theme);
      await page.waitForFunction((t) => Array.from(document.styleSheets).some((s) => s.href?.includes(`/tp/t-${t}`)) && document.fonts.status === 'loaded', theme);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // styles applied before anything is measured
      for (const n of COUNTS) {
        const r = await page.evaluate(([v, t, w, h, check, bigText]) => {
          const lab = (window as any).__tpLab;
          let host = document.getElementById('lab');
          if (!host) { host = document.createElement('div'); host.id = 'lab'; host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000'; document.body.append(host); }
          host.innerHTML = lab.sprite(t) + lab.renderTable(v, t, w, h, { peek: false, bubble: 'Riya bets 60.', code: 'QK7P', net: 'good' }).html;
          if (bigText) host.querySelector('.tp')!.classList.add('bigtext', 'still');
          lab.fitPill(host.querySelector('.tp')); // the result pill finds its place, as the table screen does
          return (0, eval)(check)(host.querySelector('.tp'));
        }, [views[n], theme, W, H, CHECK, big] as const);
        checked++;
        smallest = Math.min(smallest, r.minFont);
        if (r.issues.length && process.env.TL_SHOTS) await page.screenshot({ path: `${process.env.TL_SHOTS}/${scene}-${theme}-${W}x${H}-${n}.png` });
        if (r.issues.length) failures.push(`${theme} ${label} ${W}x${H} ${n} players: ${r.issues.join(', ')}`);
        if (r.minFont < 9) failures.push(`${theme} ${label} ${n} players: text ${r.minFont}px`);
        if ((W === 390 || W === 1440 || W === 844) && (n === 6 || n === 15)) await page.screenshot({ path: `test-results/tables/${scene}${big ? '-big' : ''}-${theme}-${W}x${H}-${n}.png` });
      }
    }
    await ctx.close();
  }
  console.log(`layout checks (${scene}${big ? ', large text' : ''}): ${checked}, failures ${failures.length}, smallest text ${smallest}px`);
  expect(checked).toBe(693);
  expect(failures).toEqual([]);
});

// The result pill after a showdown at every size of the brief (2 to 15 players, every theme): it finds a place
// clear of every seat, every hand shown and the board, inside the felt (table/pill.ts).
const BRIEF: [number, number][] = [[320, 568], [360, 740], [375, 667], [390, 844], [412, 915], [430, 932], [667, 375], [844, 390], [768, 1024], [820, 1180], [1180, 820], [1280, 720], [1440, 900], [1920, 1080]];
test('the result pill clear of seats and shown cards @layout: 9 themes, 14 sizes, 2 to 15 players', async ({ browser, baseURL }) => {
  test.setTimeout(1_500_000);
  const views = Object.fromEntries(COUNTS.map((n) => [n, viewFor(n, 'showdown')]));
  const failures: string[] = [];
  let checked = 0;
  for (const [W, H] of BRIEF) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, baseURL });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.evaluate(() => { (window as any).__tpLab.loadDesignCss(); });
    for (const theme of THEMES) {
      await page.evaluate((t) => (window as any).__tpLab.setTheme(t), theme);
      await page.waitForFunction((t) => Array.from(document.styleSheets).some((s) => s.href?.includes(`/tp/t-${t}`)) && document.fonts.status === 'loaded', theme);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      for (const n of COUNTS) {
        const r = await page.evaluate(([v, t, w, h, check]) => {
          const lab = (window as any).__tpLab;
          let host = document.getElementById('lab');
          if (!host) { host = document.createElement('div'); host.id = 'lab'; host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000'; document.body.append(host); }
          host.innerHTML = lab.sprite(t) + lab.renderTable(v, t, w, h, { peek: false, bubble: null, code: 'QK7P', net: 'good' }).html;
          const tp = host.querySelector('.tp') as HTMLElement;
          lab.fitPill(tp);
          const res = (0, eval)(check)(tp) as { issues: string[] };
          return { pill: !!tp.querySelector('.wpill'), issues: res.issues.filter((x) => /pill/.test(x)) };
        }, [views[n], theme, W, H, CHECK] as const);
        checked++;
        if (!r.pill) failures.push(`${theme} ${W}x${H} ${n} players: no pill`);
        if (r.issues.length && process.env.TL_SHOTS) await page.screenshot({ path: `${process.env.TL_SHOTS}/pill-${theme}-${W}x${H}-${n}.png` });
        if (r.issues.length) failures.push(`${theme} ${W}x${H} ${n} players: ${r.issues.join(', ')}`);
      }
    }
    await ctx.close();
  }
  console.log(`result pill checks: ${checked}, failures ${failures.length}`);
  expect(checked).toBe(9 * 14 * COUNTS.length);
  expect(failures).toEqual([]);
});
