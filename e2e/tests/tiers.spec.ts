// Win tiers: every theme's four signed-off win scenes (and the bust-out moment) play over a live table with a
// real result: the real winners, amount, hand and cards are shown, nothing of the design's sample (Meera,
// Arjun, 1,480 ...) is left, the scene fits the screen on a phone and on a laptop, and it removes itself
// when it is over (or when tapped).
import { test, expect, type Page } from '@playwright/test';
import { Engine, sha256hex } from '@tp/engine';

const THEMES = ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo'];
const NAMES = ['Dev', 'Aditya', 'Sneha', 'Kabir', 'Kavya', 'Rohit', 'Ishaan', 'Tara'];
// one real result per tier: two pair (tier 1), a straight (2), four of a kind split two ways (3), a straight flush (4)
const HANDS = [
  { names: ['Kavya'], amount: 640, cat: 2, cards: ['Jd', 'Js', '4c', '4h', 'Ac'] },
  { names: ['Kavya'], amount: 1240, cat: 4, cards: ['5d', '6s', '7c', '8h', '9c'] },
  { names: ['Kavya', 'Rohit'], amount: 3150, cat: 7, cards: ['Qd', 'Qs', 'Qc', 'Qh', '3c'] },
  { names: ['Kavya'], amount: 5275, cat: 8, cards: ['5s', '6s', '7s', '8s', '9s'] },
];
const SAMPLE = /Meera|MEERA|Arjun|ARJUN|1,480|2,860|4,120|Royal Flush|ROYAL FLUSH|Full House|FULL HOUSE|kings full|KINGS FULL|649,740|9th of 13/;

function tableView(): unknown {
  const e = Engine.create('lab', { startStack: 2000, turnTime: 20, maxPlayers: 15 }, 0);
  for (let i = 0; i < NAMES.length; i++) { e.apply({ t: 'join', id: `p${i}`, name: NAMES[i]!, now: 0 }); e.apply({ t: 'presence', pid: `p${i}`, connected: true, now: 0 }); }
  e.apply({ t: 'start', seed: sha256hex('tiers'), now: 1 });
  while (e.s.phase === 'hand' && e.s.hand!.toAct) { const pid = e.s.hand!.toAct; const L = e.legal(pid)!; e.apply({ t: 'act', pid, action: { type: L.canCheck ? 'check' : 'call' }, now: 2 }); }
  const v = e.viewFor('p0') as unknown as Record<string, unknown>;
  return { ...v, isHost: true, hostId: 'p0', turnLeft: 0, turnTotal: 0, nextIn: 0 };
}

/** Draws the table in a lab host (`#lab-<id>`), plays scene `index` over it; returns what the scene shows. */
async function mount(page: Page, o: { id: string; theme: string; index: number; W: number; H: number; pause?: boolean; me?: boolean; still?: boolean }) {
  return page.evaluate(async ([o, v, hands]) => {
    const lab = (window as any).__tpLab;
    document.getElementById(`lab-${o.id}`)?.remove();
    delete (window as any)[`__gone_${o.id}`];
    const host = document.createElement('div');
    host.id = `lab-${o.id}`; host.className = 'screen tp-screen'; host.style.zIndex = '99999';
    host.innerHTML = `<div class="tp-sprite">${lab.sprite(o.theme)}</div><div class="tp-stage">${lab.renderTable(v, o.theme, o.W, o.H, { peek: false, bubble: null, code: 'QK7P', net: 'good' }).html}</div><div class="tp-over"></div>`;
    document.body.append(host);
    const values = o.index === 4 ? lab.bustValues({ name: 'Rohit', place: 6, of: 8, rebuys: true, stack: 2000, seatNo: 6 })
      : lab.winValues({ ...hands[o.index], handNo: 41, code: 'QK7P' }, o.theme);
    (window as any).__rebuys = 0;
    const seat = host.querySelector('.seat[data-pid="p5"]')?.getBoundingClientRect();
    const t0 = performance.now();
    const p = await lab.playTier({
      over: host.querySelector('.tp-over'), table: host.querySelector('.tp'), theme: o.theme, index: o.index, values,
      anchor: seat ? { x: seat.left + seat.width / 2, y: seat.top + seat.height / 2 } : null,
      buttons: o.index === 4 && o.me ? { rebuy: () => { (window as any).__rebuys++; } } : null,
      pauseAt: o.pause ? lab.peakOf(o.theme, o.index) : undefined, still: !!o.still,
    });
    (window as any)[`__p_${o.id}`] = p;
    p.done.then(() => { (window as any)[`__gone_${o.id}`] = performance.now() - t0; });
    const dur = (await lab.loadTiers())[o.theme][o.index].dur;
    const bn = p.el.querySelector('.bn') as HTMLElement;
    // what is on screen: visible elements (not faded out by the scene), with their boxes
    const op = (e: Element) => { let x = 1; for (let n: Element | null = e; n && n !== host; n = n.parentElement) x *= Number(getComputedStyle(n).opacity); return x; };
    const out: string[] = [];
    // the hand's name (its text, not its box) and the cards: on screen (cards may sit up to 10 px past an
    // edge, as the design's fanned cards do on its own phone)
    for (const e of Array.from(bn.querySelectorAll('[data-fit="h"], .cd:not(.dn)'))) {
      if (op(e) < 0.5) continue;
      const range = document.createRange();
      range.selectNodeContents(e);
      const r = e.matches('.cd') || !e.textContent?.trim() ? e.getBoundingClientRect() : range.getBoundingClientRect();
      const tol = e.matches('.cd') ? 10 : 1;
      if (r.width < 1) continue;
      if (r.left < -tol || r.top < -tol || r.right > innerWidth + tol || r.bottom > innerHeight + tol) out.push(`${e.className || e.tagName} at ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);
    }
    const tpl = (await lab.loadTiers())[o.theme][o.index];
    // which of the real values the scene's design shows at all (the design decides: not every scene shows the amount)
    const has = (re: RegExp) => re.test(tpl.html + tpl.css);
    const shows = { name: has(/\{\{(name|NAME|bname|BNAME)\}\}/), amt: has(/\{\{(amt|amtRaw)\}\}/), stack: has(/\{\{stack\}\}/), place: has(/\{\{(place|PLACE)\}\}/) };
    return { shows, text: bn.textContent ?? '', css: (p.el.querySelector('style') as HTMLStyleElement).textContent ?? '', dur, outside: out, buttons: Array.from(bn.querySelectorAll('[data-tpw]')).map((b) => b.getAttribute('data-tpw')) };
  }, [o, tableView(), HANDS] as const);
}

async function open(page: Page, theme: string): Promise<void> {
  await page.evaluate((t) => (window as any).__tpLab.setTheme(t), theme);
  await page.waitForFunction((t) => Array.from(document.styleSheets).some((s) => s.href?.includes(`/tp/t-${t}`)) && document.fonts.status === 'loaded', theme);
}

for (const [W, H] of [[390, 844], [1440, 900]] as const) test(`win tiers: real result, no sample text, fits ${W}x${H}`, async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, baseURL });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => (window as any).__tpLab.loadDesignCss());
  const problems: string[] = [];
  for (const theme of THEMES) {
    await open(page, theme);
    for (let index = 0; index < 5; index++) {
      const r = await mount(page, { id: 'a', theme, index, W, H, pause: true, me: true });
      const shown = (r.text + ' ' + (r.css.match(/content:"[^"]*"/g) ?? []).join(' ')).toLowerCase();
      const h = HANDS[index];
      const want = index === 4 ? [r.shows.name && 'Rohit', r.shows.place && '6th of 8', r.shows.stack && '2,000']
        : [...(r.shows.name ? h!.names : []), r.shows.amt && h!.amount.toLocaleString('en-IN')];
      for (const w of want) if (w && !shown.includes(w.toLowerCase()) && !shown.includes(w.replace(',', '').toLowerCase())) problems.push(`${theme} ${index}: "${w}" not shown`);
      if (!r.shows.name) problems.push(`${theme} ${index}: the scene names nobody`);
      const sample = shown.replace(/← full house/g, '').match(new RegExp(SAMPLE.source, 'i'));
      if (sample) problems.push(`${theme} ${index}: sample text "${sample[0]}" left`);
      for (const x of r.outside) problems.push(`${theme} ${index}: off screen: ${x}`);
      if (index === 4 && r.buttons.join() !== 'rebuy,watch') problems.push(`${theme} bust-out buttons: ${r.buttons.join()}`);
    }
    if (W === 390) await page.screenshot({ path: `test-results/tiers-${theme}.png` });
  }
  expect(problems).toEqual([]);
  await ctx.close();
});

test('win tiers: each scene plays once and removes itself; tap to skip; bust-out buttons only for the busted player; reduced motion', async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => (window as any).__tpLab.loadDesignCss());
  const problems: string[] = [];
  for (const theme of THEMES) {
    await open(page, theme);
    // the four tiers at once, each in its own layer: gone after its own length (and not before)
    const durs: number[] = [];
    for (let index = 0; index < 4; index++) durs.push((await mount(page, { id: `r${index}`, theme, index, W: 390, H: 844 })).dur);
    await page.waitForFunction((n) => Array.from({ length: n }, (_, i) => (window as any)[`__gone_r${i}`]).every((x) => x !== undefined), 4, { timeout: 15_000 });
    for (let index = 0; index < 4; index++) {
      const gone = await page.evaluate((i) => (window as any)[`__gone_r${i}`] as number, index);
      if (gone < durs[index]! * 0.95 || gone > durs[index]! + 1500) problems.push(`${theme} ${index}: removed after ${Math.round(gone)} ms, scene is ${durs[index]} ms`);
      if (await page.locator(`#lab-r${index} .tpw-wrap`).count()) problems.push(`${theme} ${index}: still on screen`);
    }
    await page.evaluate(() => document.querySelectorAll('[id^="lab-"]').forEach((e) => e.remove()));
  }
  // tap to skip (tier 2)
  await open(page, 'classic');
  await mount(page, { id: 's', theme: 'classic', index: 1, W: 390, H: 844 });
  await page.mouse.click(195, 300);
  await expect(page.locator('#lab-s .tpw-wrap')).toHaveCount(0);
  // the bust-out: someone else sees no buttons; the busted player's Rebuy rebuys and closes
  const other = await mount(page, { id: 'b', theme: 'classic', index: 4, W: 390, H: 844 });
  if (other.buttons.length) problems.push(`bust-out buttons shown to another player: ${other.buttons.join()}`);
  await mount(page, { id: 'b', theme: 'classic', index: 4, W: 390, H: 844, me: true });
  await page.locator('#lab-b [data-tpw="rebuy"]').click();
  await expect(page.locator('#lab-b .tpw-wrap')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__rebuys)).toBe(1);
  // reduced motion: a still picture of the scene at its fullest, for a short while
  await mount(page, { id: 'm', theme: 'classic', index: 3, W: 390, H: 844, still: true });
  const moving = await page.evaluate(() => Array.from(document.querySelectorAll('#lab-m .tpw')).flatMap((e) => e.getAnimations({ subtree: true })).filter((a) => a.playState === 'running').length);
  if (moving) problems.push(`reduced motion: ${moving} animations still running`);
  await expect(page.locator('#lab-m .tpw-wrap')).toHaveCount(0, { timeout: 4000 });
  expect(problems).toEqual([]);
  await ctx.close();
});
