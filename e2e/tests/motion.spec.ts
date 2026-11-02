// The table micro-animations (apps/web/src/table/motion.ts, design: tools/design/gen/motion.py), on a table
// played by a local engine (window.__tpLab.labTable): each move runs on the right element, starts and lands
// on its anchor (within 2 px), plays once, and nothing moves with motion off. A @perf check measures frames
// while a hand is dealt and played on a mid-range phone.
import { test, expect, type Page } from '@playwright/test';

const SCREENS: [string, number, number][] = [['phone', 390, 844], ['phone sideways', 844, 390], ['laptop', 1440, 900]];
const NAMES = ['Dev', 'Riya', 'Arjun', 'Meera', 'Kabir', 'Zoya'];

async function open(page: Page, theme: string, motion: 'full' | 'calm' | 'off'): Promise<void> {
  await page.addInitScript((t) => { localStorage.setItem('tp-intro-done', '1'); localStorage.setItem('tp-theme', t); }, theme);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { __tpLab?: unknown }).__tpLab);
  await page.evaluate(([names, m]) => {
    const w = window as unknown as { __tpLab: { settings: { motion: string }; labTable: (r: HTMLElement, n: string[]) => unknown }; __lab: unknown };
    w.__tpLab.settings.motion = m as string;
    const root = document.createElement('div'); document.body.append(root);
    w.__lab = w.__tpLab.labTable(root, names as string[]);
  }, [NAMES, motion] as const);
  await expect(page.locator('.tp.live')).toBeVisible();
}

interface Seen { id: string; target: string; iterations: number; duration: number; errors: string[] }

/**
 * Do `what` at the table, then look at every move it started: what it runs on, that it plays once, and
 * where it starts and lands compared with its anchor. All moves are then finished.
 */
async function step(page: Page, what: string): Promise<Seen[]> {
  return page.evaluate((what) => {
    const lab = (window as unknown as { __lab: { act(a: unknown): string | undefined; start(): void; legal(): { minTo: number; canCheck: boolean } | null; toAct(): string | null; me: string } }).__lab;
    const L = lab.legal();
    if (what === 'start') lab.start();
    else if (what === 'raise') lab.act({ type: 'raise', to: L!.minTo });
    else if (what === 'bet') lab.act({ type: 'bet', to: L!.minTo });
    else lab.act({ type: what });
    const arena = document.querySelector('.tp.live .arena') as HTMLElement;
    const ar = arena.getBoundingClientRect();
    const z = ar.width / parseFloat(getComputedStyle(arena).width);
    const C = (el: Element) => { const r = el.getBoundingClientRect(); return { x: (r.left + r.width / 2 - ar.left) / z, y: (r.top + r.height / 2 - ar.top) / z }; };
    const px = (s: string) => parseFloat(s) || 0;
    const table = arena.querySelector('.table') as HTMLElement;
    const tx = px(table.style.left) + px(table.style.width) / 2, ty = px(table.style.top) - 4;
    // the deck: top middle of the table, or its middle when a player sits there (no dealer at the top)
    const taken = Array.from(arena.querySelectorAll<HTMLElement>('.seat[data-pid]')).some((s) => Math.abs(px(s.style.left) - tx) < 50 && Math.abs(px(s.style.top) - ty) < 64);
    const deck = taken ? { x: tx, y: px(table.style.top) + px(table.style.height) / 2 } : { x: tx, y: ty };
    const pot = arena.querySelector('.felt .pot');
    const seatAt = (pid: string) => { const s = arena.querySelector(`.seat[data-pid="${pid}"]`) as HTMLElement | null; return s ? { x: px(s.style.left), y: px(s.style.top) } : null; };
    const near = (a: { x: number; y: number }, b: { x: number; y: number } | null, what: string, out: string[]) => { if (b && (Math.abs(a.x - b.x) > 2 || Math.abs(a.y - b.y) > 2)) out.push(`${what}: ${a.x.toFixed(1)},${a.y.toFixed(1)} vs ${b.x.toFixed(1)},${b.y.toFixed(1)}`); };
    const anims = document.getAnimations().filter((a) => String(a.id).startsWith('mv-'));
    const seen = [];
    for (const a of anims) {
      const eff = a.effect as KeyframeEffect;
      const el = eff.target as HTMLElement;
      const t = eff.getTiming();
      const at = (f: number) => { a.pause(); a.currentTime = Number(t.delay) + f * Number(t.duration); return C(el); };
      const errors: string[] = [];
      if (!eff.pseudoElement) {
        const id = a.id;
        if (id === 'mv-deal' || id === 'mv-deal-hero') near(at(0), deck, 'deal starts on the deck', errors);
        if (id === 'mv-call' || id === 'mv-raise' || id === 'mv-allin') near(at(0), seatAt(el.dataset.pid!), 'chips start on the seat', errors);
        if (id === 'mv-pot' && pot) near(at((27 - 10) / 25), C(pot), 'bets land on the pot', errors);
        if (id === 'mv-pot-back') { // uncalled chips go back to their seat
          const end = at((27 - 10) / 25);
          const seats = Array.from(arena.querySelectorAll<HTMLElement>('.seat[data-pid]')).map((s) => seatAt(s.dataset.pid!)!);
          if (!seats.some((s) => Math.abs(s.x - end.x) <= 2 && Math.abs(s.y - end.y) <= 2)) errors.push(`returned chips land on no seat: ${end.x},${end.y}`);
        }
        if (id === 'mv-win') {
          const end = at((45 - 8) / 62); // the chips hold on the winner from 44 % to 50 %
          const seats = Array.from(arena.querySelectorAll<HTMLElement>('.seat.win')).map((s) => seatAt(s.dataset.pid!)!);
          const hs = document.querySelector('.tp.live .hero .hstack');
          if (hs) seats.push(C(hs));
          if (!seats.some((s) => Math.abs(s.x - end.x) <= 2 && Math.abs(s.y - end.y) <= 2)) errors.push(`chips land on no winner: ${end.x},${end.y}`);
        }
        // moves that end where the element rests: the last frame is its resting box
        if (!['mv-pot', 'mv-pot-back', 'mv-win', 'mv-fold-cards', 'mv-shuffle', 'mv-win-pot'].includes(id)) {
          const end = at(1);
          a.cancel();
          near(end, C(el), 'ends at rest', errors);
        }
      }
      seen.push({ id: a.id, target: (el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName) + (eff.pseudoElement ?? ''), iterations: t.iterations as number, duration: Number(t.duration), errors });
    }
    for (const a of document.getAnimations()) if (String(a.id).startsWith('mv-')) { try { a.finish(); } catch { a.cancel(); } }
    return seen;
  }, what);
}

/** One hand: deal, raise, call, fold, calls to the flop, a check, an all-in, everyone folds. */
async function hand(page: Page): Promise<Record<string, Seen[]>> {
  const out: Record<string, Seen[]> = {};
  const add = (k: string, s: Seen[]) => { out[k] = (out[k] ?? []).concat(s); };
  add('start', await step(page, 'start'));
  const plan = ['raise', 'call', 'fold'];
  const street = () => page.evaluate(() => (window as unknown as { __lab: { engine: { s: { hand: { street: string } | null } } } }).__lab.engine.s.hand?.street);
  while ((await street()) === 'preflop') {
    const L = await page.evaluate(() => (window as unknown as { __lab: { legal(): { canCheck: boolean } } }).__lab.legal());
    const a = plan.shift() ?? (L.canCheck ? 'check' : 'call');
    add(a, await step(page, a));
  }
  let checked = false, allin = false;
  for (let i = 0; i < 20; i++) {
    const L = await page.evaluate(() => (window as unknown as { __lab: { legal(): { canCheck: boolean } | null } }).__lab.legal());
    if (!L) break;
    const a = !checked && L.canCheck ? 'check' : !allin ? 'allin' : 'fold';
    if (a === 'check') checked = true; if (a === 'allin') allin = true;
    add(a, await step(page, a));
  }
  return out;
}

for (const [label, W, H] of SCREENS) {
  test(`motion on a ${label} (${W}x${H}): each move on the right element, on its anchors, once`, async ({ page }) => {
    await page.setViewportSize({ width: W, height: H });
    await open(page, 'classic', 'full');
    const seen = await hand(page);
    const all = Object.values(seen).flat();
    // every move plays once, for its real length (classic: speed 1)
    for (const s of all) { expect(s.iterations, s.id).toBe(1); expect(Number.isFinite(s.duration), s.id).toBe(true); expect(s.duration, s.id).toBeLessThanOrEqual(900); }
    expect(all.flatMap((s) => s.errors.map((e) => `${s.id}: ${e}`))).toEqual([]);
    const ids = (k: string) => new Set((seen[k] ?? []).map((s) => s.id));
    const on = (k: string, id: string) => (seen[k] ?? []).filter((s) => s.id === id).map((s) => s.target);
    // shuffle and deal at the start of the hand: 2 cards for each of the 5 opponents, 2 for me
    expect(ids('start').has('mv-shuffle')).toBe(true);
    expect(on('start', 'mv-deal')).toEqual(Array(10).fill('cd'));
    expect(on('start', 'mv-deal-hero')).toEqual(['flip', 'flip']);
    // each move on its element (a move can happen more than once in the hand, e.g. two checks)
    const only = (k: string, id: string, target: string) => { const t = on(k, id); expect(t.length, `${k} ${id}`).toBeGreaterThan(0); expect(new Set(t), `${k} ${id}`).toEqual(new Set([target])); };
    only('raise', 'mv-raise', 'bet'); only('raise', 'mv-raise-tag', 'tag'); only('raise', 'mv-raise-chip', 'c2');
    only('call', 'mv-call', 'bet'); only('call', 'mv-call-amt', 'SPAN'); only('call', 'mv-call-tag', 'tag');
    only('fold', 'mv-fold', 'seat'); only('fold', 'mv-fold-cards', 'backs'); expect(new Set(on('fold', 'mv-fold-dim'))).toEqual(new Set(['av', 'plate']));
    only('check', 'mv-check', 'av'); only('check', 'mv-check-tag', 'tag');
    only('allin', 'mv-allin', 'bet'); only('allin', 'mv-allin-glow', 'av::after'); only('allin', 'mv-allin-tag', 'tag');
    // bets to the pot when the first round closes; pot to the winner at the end
    const potMoves = Object.values(seen).flat().filter((s) => s.id === 'mv-pot');
    expect(potMoves.length).toBeGreaterThanOrEqual(3);
    expect(all.some((s) => s.id === 'mv-pot-back')).toBe(true); // the uncalled all-in goes back to its owner
    expect(Object.values(seen).flat().filter((s) => s.id === 'mv-win').length).toBe(5);
    expect(Object.values(seen).flat().some((s) => s.id === 'mv-win-glow' && s.target === 'plate::after')).toBe(true);
    expect(Object.values(seen).flat().some((s) => s.id === 'mv-turn' && s.target === 'act')).toBe(true);
    // nothing left behind: no copies in the motion layer, no move still running
    await expect(page.locator('.mv-layer > *')).toHaveCount(0);
  });
}

test('motion: every theme plays its moves once, with its own speed and easing', async ({ page }) => {
  test.setTimeout(240_000);
  const K: Record<string, number> = { classic: 1, noir: 1.25, ivory: 1.1, velvet: 1.2, cyber: 0.85, ink: 0.9, pixel: 1, train: 1, edo: 1.1 };
  for (const theme of Object.keys(K)) {
    await page.goto('about:blank');
    await open(page, theme, 'full');
    const seen = await hand(page);
    const all = Object.values(seen).flat();
    expect(all.every((s) => s.iterations === 1), theme).toBe(true);
    expect(all.flatMap((s) => s.errors), theme).toEqual([]);
    const call = all.find((s) => s.id === 'mv-call')!;
    expect(Math.abs(call.duration - 300 * K[theme]!), theme).toBeLessThan(0.5);
  }
});

test('motion: the keyframes carry the theme\'s easing (Pixel in six steps, Cyber tags flicker in one)', async ({ page }) => {
  await open(page, 'pixel', 'full');
  await page.evaluate(() => (window as unknown as { __lab: { start(): void } }).__lab.start());
  const ease = await page.evaluate(() => (document.getAnimations().find((a) => a.id === 'mv-deal')!.effect as KeyframeEffect).getKeyframes()[0]!.easing);
  expect(ease).toBe('steps(6)');
  await page.goto('about:blank');
  await open(page, 'cyber', 'full');
  const tagEase = await page.evaluate(() => {
    const lab = (window as unknown as { __lab: { start(): void; act(a: unknown): void; legal(): { minTo: number } } }).__lab;
    lab.start();
    lab.act({ type: 'raise', to: lab.legal().minTo });
    const kf = (id: string) => (document.getAnimations().find((a) => a.id === id)!.effect as KeyframeEffect).getKeyframes()[0]!.easing;
    return [kf('mv-raise-tag'), kf('mv-raise')];
  });
  expect(tagEase).toEqual(['steps(1)', 'cubic-bezier(0.15, 0.9, 0.25, 1)']);
});

test('motion: a move carries on through a partial redraw, and jumps to its end when the next action comes', async ({ page }) => {
  await open(page, 'classic', 'full');
  const r = await page.evaluate(() => {
    const lab = (window as unknown as { __lab: { start(): void; redraw(): void; act(a: unknown): void; screen: { say(t: string): void } } }).__lab;
    lab.start();
    const deal = () => document.getAnimations().filter((a) => a.id === 'mv-deal');
    const before = deal().map((a) => a.currentTime);
    // a redraw that swaps the arena (the dealer's bubble changes)
    lab.screen.say('Something else.');
    lab.redraw();
    const after = deal();
    const same = after.length === before.length && after.every((a) => (a.effect as KeyframeEffect).target!.isConnected);
    // the next action: everything still moving is finished at once
    lab.act({ type: 'call' });
    const left = document.getAnimations().filter((a) => a.id === 'mv-deal' && a.playState === 'running').length;
    return { same, left, n: before.length };
  });
  expect(r.n).toBe(10);
  expect(r.same).toBe(true);
  expect(r.left).toBe(0);
});

test('motion off: nothing moves, the table is the same', async ({ page }) => {
  await open(page, 'classic', 'off');
  const seen = await hand(page);
  expect(Object.values(seen).flat()).toEqual([]);
  await expect(page.locator('.tp.live.still')).toBeVisible();
  const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  expect(moving).toBe(0);
});

test('motion calm: shorter and without flourishes', async ({ page }) => {
  await open(page, 'classic', 'calm');
  const seen = await hand(page);
  const ids = new Set(Object.values(seen).flat().map((s) => s.id));
  for (const flourish of ['mv-shuffle', 'mv-check', 'mv-allin-glow', 'mv-win-glow', 'mv-raise-chip', 'mv-pot-roll']) expect(ids.has(flourish), flourish).toBe(false);
  for (const kept of ['mv-deal', 'mv-call', 'mv-fold', 'mv-pot', 'mv-win']) expect(ids.has(kept), kept).toBe(true);
  const call = Object.values(seen).flat().find((s) => s.id === 'mv-call')!;
  expect(call.duration).toBeCloseTo(180, 0);
  expect(Object.values(seen).flat().flatMap((s) => s.errors)).toEqual([]);
});

test('@perf motion: a dealt hand stays at 60 fps on a mid-range phone (run alone: timing)', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, baseURL });
  const page = await ctx.newPage();
  await open(page, 'classic', 'full'); // the default theme (Night Train's scenery loops are measured by online.spec.ts)
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[] };
    w.__frames = []; let last = performance.now();
    const loop = (t: number) => { w.__frames.push(t - last); last = t; if (w.__frames.length < 600) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  // deal, then play the hand out at a friendly pace (each move gets to run)
  await page.evaluate(() => (window as unknown as { __lab: { start(): void } }).__lab.start());
  await page.waitForTimeout(2600);
  for (let i = 0; i < 14; i++) {
    const done = await page.evaluate(() => {
      const lab = (window as unknown as { __lab: { legal(): { canCheck: boolean } | null; act(a: unknown): void } }).__lab;
      const L = lab.legal(); if (!L) return true;
      lab.act({ type: L.canCheck ? 'check' : 'call' }); return false;
    });
    if (done) break;
    await page.waitForTimeout(450);
  }
  await page.waitForTimeout(800);
  const frames = (await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames)).slice(5).sort((a, b) => a - b);
  const p50 = frames[Math.floor(frames.length * 0.5)]!, p95 = frames[Math.floor(frames.length * 0.95)]!;
  console.log(`motion frames ${frames.length}: median ${p50.toFixed(1)} ms, 95th ${p95.toFixed(1)} ms`);
  expect(p95).toBeLessThan(20);
  await ctx.close();
});
