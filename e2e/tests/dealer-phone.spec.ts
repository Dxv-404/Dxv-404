// The dealer on phones: shown only where it fits (layout.ts dealerSpot). At real phone browser sizes (the space a
// page gets with the browser's bars showing), in every theme, with 2, 6 and 9 players, mid-hand and at a showdown:
// when the dealer shows it overlaps no seat, card, bet, pot, the hero area or a button, stands above the felt, and
// nothing else on the table moved compared with the same table drawn without a dealer; when it does not fit there
// is none. A few screenshots go to DEALER_SHOTS (or test-results/dealer).
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { Engine, sha256hex } from '@tp/engine';

const SIZES: [number, number][] = [[390, 664], [375, 553], [412, 780], [430, 740], [390, 844], [430, 932], [844, 390]];
const COUNTS = [2, 6, 9];
const THEMES = process.env.DEALER_THEMES?.split(',') ?? ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo'];
const NAMES = ['Dev', 'Aditya', 'Sneha', 'Kabir', 'Meera', 'Arjun', 'Ishaan', 'Tara', 'Riya'];
const SHOTS = process.env.DEALER_SHOTS ?? 'test-results/dealer';

/** Mid-hand on the flop (bets out, one folded) or after a showdown, seen from Dev's seat. */
function viewFor(n: number, scene: 'flop' | 'showdown'): unknown {
  const e = Engine.create('lab', { startStack: 2000, turnTime: 20, maxPlayers: 15 }, 0);
  for (let i = 0; i < n; i++) { e.apply({ t: 'join', id: `p${i}`, name: NAMES[i]!, now: 0 }); e.apply({ t: 'presence', pid: `p${i}`, connected: true, now: 0 }); }
  e.apply({ t: 'start', seed: sha256hex(`dealer-${n}-${scene}`), now: 1 });
  if (scene === 'showdown') {
    while (e.s.phase === 'hand' && e.s.hand!.toAct) { const pid = e.s.hand!.toAct; const L = e.legal(pid)!; e.apply({ t: 'act', pid, action: { type: L.canCheck ? 'check' : 'call' }, now: 2 }); }
  } else {
    let k = 0;
    while (e.s.hand!.street === 'preflop' && e.s.hand!.toAct) { const pid = e.s.hand!.toAct; e.apply({ t: 'act', pid, action: k++ === 1 && n > 3 ? { type: 'fold' } : { type: e.legal(pid)!.canCheck ? 'check' : 'call' }, now: 2 }); }
    for (let i = 0; i < 3 && e.s.hand!.toAct && e.s.hand!.toAct !== 'p0'; i++) {
      const pid = e.s.hand!.toAct; const L = e.legal(pid)!;
      e.apply({ t: 'act', pid, action: i === 0 && L.canRaise ? { type: 'bet', to: L.minTo * 3 } : { type: L.canCheck ? 'check' : 'call' }, now: 3 });
    }
  }
  return { ...(e.viewFor('p0') as object), isHost: true, hostId: 'p0', turnLeft: 14000, turnTotal: 20000, nextIn: 0 };
}

/** Everything on the table that must not move or be covered, and the dealer, in screen px. */
const MEASURE = `(f) => {
  for (const a of f.getAnimations({ subtree: true })) { const end = Number(a.effect?.getComputedTiming().endTime); if (Number.isFinite(end)) a.finish(); else a.cancel(); }
  const R = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const vis = e => getComputedStyle(e).display != 'none' && e.getBoundingClientRect().width > 0;
  const named = (sel, name) => [...f.querySelectorAll(sel)].filter(vis).map((e, i) => [name + i, R(e)]);
  const items = [
    ...named('.seat > .av, .seat > .plate, .seat > .tag, .seat .backs, .seat .shown', 'seat'),
    ...named('.board .cd, .board .slot', 'card'), ...named('.felt > .pot, .felt > .wpill, .felt > .sidepot', 'pot'),
    ...named('.bet', 'bet'), ...named('.hero', 'hero'), ...named('.act, .actions button', 'button'), ...named('.top', 'topbar'),
  ];
  const d = f.querySelector('.arena .dealer');
  const dealer = d && vis(d) ? R(d) : null;
  const felt = R(f.querySelector('.felt')), arena = R(f.querySelector('.arena'));
  return { items, dealer, small: !!d && d.classList.contains('sm'), felt, arena, dbtn: [...f.querySelectorAll('.dbtn')].map(R), mode: f.classList.contains('phone') ? 'phone' : f.classList.contains('land') ? 'land' : 'lap', compact: f.classList.contains('compact') };
}`;

type Box = [number, number, number, number];
const hit = (a: Box, b: Box, pad = 0.5): boolean => !(a[2] - pad <= b[0] || b[2] - pad <= a[0] || a[3] - pad <= b[1] || b[3] - pad <= a[1]);
/** the felt is a stadium: how far down it starts at x */
function feltTop(f: Box, x: number): number {
  const w = f[2] - f[0], h = f[3] - f[1], r = Math.min(w, h) / 2;
  const dx = Math.abs(x - (f[0] + w / 2)) - (w / 2 - r);
  if (dx <= 0) return f[1];
  if (dx >= r) return Infinity;
  return f[1] + r - Math.sqrt(r * r - dx * dx);
}

test('the dealer on phones shows only where it fits @layout: 9 themes, 7 phone sizes, 2/6/9 players', async ({ browser, baseURL }) => {
  test.setTimeout(900_000);
  mkdirSync(SHOTS, { recursive: true });
  const scenes = ['flop', 'showdown'] as const;
  const views = Object.fromEntries(scenes.flatMap((sc) => COUNTS.map((n) => [`${sc}${n}`, viewFor(n, sc)])));
  const failures: string[] = [];
  const shown: Record<string, string[]> = {};
  let checked = 0;
  for (const [W, H] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, baseURL });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.evaluate(() => { (window as any).__tpLab.loadDesignCss(); });
    for (const theme of THEMES) {
      await page.evaluate((t) => (window as any).__tpLab.setTheme(t), theme);
      await page.waitForFunction((t) => Array.from(document.styleSheets).some((s) => s.href?.includes(`/tp/t-${t}`)) && document.fonts.status === 'loaded', theme);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      for (const sc of scenes) for (const n of COUNTS) {
        const draw = (dealer: boolean) => page.evaluate(async ([v, t, w, h, m, dl]) => {
          const lab = (window as any).__tpLab;
          let host = document.getElementById('lab');
          if (!host) { host = document.createElement('div'); host.id = 'lab'; host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000'; document.body.append(host); }
          host.innerHTML = lab.sprite(t) + lab.renderTable(v, t, w, h, { peek: false, bubble: null, code: 'QK7P', net: 'good', dealer: dl }).html;
          await Promise.all(Array.from(host.querySelectorAll('img'), (i) => i.decode().catch(() => undefined)));
          await document.fonts.ready;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          lab.fitPill(host.querySelector('.tp'));
          return (0, eval)(m)(host.querySelector('.tp'));
        }, [views[`${sc}${n}`], theme, W, H, MEASURE, dealer] as const);
        const without = await draw(false);
        const r = await draw(true);
        checked++;
        const tag = `${theme} ${W}x${H} ${n}p ${sc}`;
        const bad: string[] = [];
        // nothing moved: the same things in the same places as without the dealer
        const before = new Map<string, Box>(without.items as [string, Box][]);
        if (before.size !== r.items.length) bad.push(`${before.size} items without the dealer, ${r.items.length} with`);
        for (const [k, b] of r.items as [string, Box][]) { const o = before.get(k); if (!o || o.some((x, i) => Math.abs(x - b[i]!) > 0.5)) bad.push(`${k} moved ${JSON.stringify(o?.map((x, i) => Math.round(b[i]! - x)))}`); }
        const d = r.dealer as Box | null;
        if (d) {
          for (const [k, b] of r.items as [string, Box][]) if (hit(d, b)) bad.push(`dealer x ${k.replace(/\d+$/, '')}`);
          for (const b of r.dbtn as Box[]) if (hit(d, b)) bad.push('dealer x dealer button');
          for (let x = d[0]; x <= d[2]; x += 2) if (d[3] > feltTop(r.felt as Box, x) + 1) { bad.push('dealer over the felt'); break; }
          const a = r.arena as Box;
          if (d[0] < a[0] - 1 || d[2] > a[2] + 1 || d[1] < a[1] - 1) bad.push('dealer outside the arena');
          if (r.small && d[3] - d[1] > 66) bad.push(`small dealer ${Math.round(d[3] - d[1])}px tall`);
          (shown[theme] ??= []).push(`${W}x${H}/${n}${r.small ? 's' : ''}`);
        }
        if (r.mode === 'land' && d) bad.push('dealer on a phone held sideways');
        if (bad.length) failures.push(`${tag}: ${[...new Set(bad)].join(', ')}`);
        const want = sc === 'flop' && ((theme === 'ink' && n === 6) || (theme === 'classic' && n === 9) || (theme === 'pixel' && n === 2) || (theme === 'edo' && n === 9));
        if (bad.length || (want && (W === 390 || W === 375 || W === 844))) await page.screenshot({ path: `${SHOTS}/${theme}-${W}x${H}-${n}p${d ? (r.small ? '-small' : '-dealer') : '-none'}.jpg`, scale: 'css', type: 'jpeg', quality: 60 });
      }
    }
    await ctx.close();
  }
  console.log(`dealer checks: ${checked}, failures ${failures.length}`);
  for (const t of THEMES) console.log(`  ${t}: ${(shown[t] ?? []).filter((x, i, a) => a.indexOf(x) === i).join(' ') || 'never'}`);
  expect(checked).toBe(SIZES.length * THEMES.length * COUNTS.length * scenes.length);
  expect(failures).toEqual([]);
});
