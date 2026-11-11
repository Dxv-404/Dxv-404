// Who won, and with what (design: tools/design/gen/v3results.py, v3motion.py; app: table/results.ts, render.ts,
// screen.ts). A lab table (window.__tpLab.labTable: a real engine, no server) is dealt known cards and played to
// a showdown, a split pot, an everyone-folded hand and an all-in before the flop, in every theme and on several
// screens: the winner card has the real winner, hand and cards; the right seats turn over at the right step;
// folded hands stay hidden; nothing is off screen; tapping (or Space) skips; reduced motion shows the steps still.
import { test, expect, type Page } from '@playwright/test';
import { avatarLetters } from '../avatars';

const THEMES = ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo'];
const NAMES = ['Dev', 'Riya', 'Arjun', 'Meera', 'Kabir', 'Zoya'];
const BOARD = ['Ks', '7h', '2d', 'Kc', '9h'];
type Kind = 'showdown' | 'split' | 'fold' | 'allin';
// cards by seat (Dev is me): Riya makes kings full of sevens; in the split Riya and Meera both have A 9
const HOLES: Record<Kind, string[][]> = {
  showdown: [['As', 'Ah'], ['Kh', '7d'], ['2c', '3c'], ['Qh', 'Qd'], ['4h', '5d'], ['Ad', 'Kd']],
  split: [['3h', '4h'], ['Ad', '9c'], ['2c', '3c'], ['Ac', '9d'], ['5d', '6d'], ['6c', '8d']],
  fold: [['As', 'Ah'], ['Kh', '7d'], ['2c', '3c'], ['Qh', 'Qd'], ['4h', '5d'], ['Ad', 'Kd']],
  allin: [['As', 'Ah'], ['Kh', '7d'], ['2c', '3c'], ['Qh', 'Qd'], ['4h', '5d'], ['Ad', 'Kd']],
};
// who stays in: the rest fold as soon as they can
const LIVE: Record<Kind, string[]> = { showdown: ['Dev', 'Riya', 'Meera', 'Zoya'], split: ['Dev', 'Riya', 'Meera'], fold: ['Arjun'], allin: ['Dev', 'Riya'] };

async function open(page: Page, theme: string, motion: 'full' | 'calm' | 'off' = 'full'): Promise<void> {
  await page.addInitScript((t) => { localStorage.setItem('tp-intro-done', '1'); localStorage.setItem('tp-theme', t); }, theme);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { __tpLab?: unknown }).__tpLab);
  await page.evaluate(([names, m]) => {
    const w = window as unknown as { __tpLab: { settings: { motion: string; winFx: string }; labTable: (r: HTMLElement, n: string[]) => unknown }; __lab: unknown };
    w.__tpLab.settings.motion = m as string;
    w.__tpLab.settings.winFx = 'all';
    const root = document.createElement('div'); document.body.append(root);
    w.__lab = w.__tpLab.labTable(root, names as string[]);
  }, [NAMES, motion] as const);
  await expect(page.locator('.tp.live')).toBeVisible();
}

/** Deal a hand with these cards and play it out. */
async function play(page: Page, kind: Kind): Promise<void> {
  await page.evaluate(([holes, board, live, kind]) => {
    type Lab = { start(): void; rig(h: string[][], b: string[]): void; ids(): string[]; toAct(): string | null; legal(): { canCheck: boolean } | null; act(a: { type: string }): string | undefined };
    const lab = (window as unknown as { __lab: Lab }).__lab;
    lab.start();
    lab.rig(holes as string[][], board as string[]);
    const ids = lab.ids();
    const names = ['Dev', 'Riya', 'Arjun', 'Meera', 'Kabir', 'Zoya'];
    for (let i = 0; i < 60 && lab.toAct(); i++) {
      const who = names[ids.indexOf(lab.toAct()!)]!;
      const L = lab.legal()!;
      const stay = (live as string[]).includes(who);
      if (!stay) lab.act({ type: 'fold' });
      else if (kind === 'allin' && who === 'Dev') lab.act({ type: 'allin' });
      else lab.act({ type: L.canCheck ? 'check' : 'call' });
    }
  }, [HOLES[kind], BOARD, LIVE[kind], kind] as const);
}

const step = (page: Page) => page.locator('.tp-stage').getAttribute('data-res');
const ORDER = ['runout', 'scene', 'winner', 'all', 'hold'];
/** The steps move on by themselves: this step or a later one is on screen. */
const reached = (page: Page, s: string) => expect.poll(async () => ORDER.indexOf((await step(page)) ?? '') >= ORDER.indexOf(s), { timeout: 4000 }).toBe(true);
const seat = (page: Page, name: string) => page.locator(`.tp.live .seat[data-n="${name}"]`);

/** Every part of the result is inside the screen. */
async function onScreen(page: Page): Promise<void> {
  const out = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight, bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll('.tp-wcard, .tp-wcard .cd, .tp.live .wpill, .tp.live .seat .shown .cd, .tp.live .seat .tag, .tp.live .act.nxt, .tp.live .hc.open .cd, .tp.live .board .cd'))) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1)) bad.push(`${el.className} ${r.left.toFixed(0)},${r.top.toFixed(0)},${r.right.toFixed(0)},${r.bottom.toFixed(0)}`);
    }
    return bad;
  });
  expect(out, 'off screen').toEqual([]);
}

/**
 * The result pill is clear of every seat (avatar, name plate, tag), every hand shown and the board (read with the
 * table's animations at rest: a card mid-turn is narrower than it will be).
 */
async function pillClear(page: Page): Promise<void> {
  const out = await page.evaluate(() => {
    const tp = document.querySelector('.tp.live') as HTMLElement;
    const pill = tp.querySelector('.wpill');
    if (!pill) return ['no pill'];
    for (const a of tp.getAnimations({ subtree: true })) { const end = Number(a.effect?.getComputedTiming().endTime); if (Number.isFinite(end)) a.finish(); else a.cancel(); }
    const P = pill.getBoundingClientRect(), bad: string[] = [];
    const hit = (q: DOMRect) => !(P.right <= q.left || q.right <= P.left || P.bottom <= q.top || q.bottom <= P.top);
    for (const e of Array.from(tp.querySelectorAll<HTMLElement>('.seat > .av, .seat > .plate, .seat > .tag, .seat .shown .cd, .seat .backs .cd, .board .cd'))) {
      const q = e.getBoundingClientRect();
      if (q.width && hit(q)) bad.push(`${(e.closest('.seat') as HTMLElement | null)?.dataset.n ?? 'board'} ${e.className.split(' ')[0]}`);
    }
    return bad;
  });
  expect(out, 'result pill on top of a seat or cards').toEqual([]);
}

/** Every seat's avatar (and the winner card's) shows the letters of that player's name. */
async function lettersOk(page: Page, where: string): Promise<void> {
  const seats = await page.evaluate(avatarLetters, { rows: '.tp.live .seat[data-n]', attr: 'data-n' });
  expect(seats.bad, `${where}: seat avatars`).toEqual([]);
  expect(seats.read).toBe(NAMES.length - 1);
}

interface Snap { shown: Record<string, number>; tags: Record<string, string>; win: string[]; pill: string[]; board: number; stack: string }
/** What the seats show the moment a step begins (the steps move on by themselves, so it is read right then). */
function snapAt(page: Page, s: string): Promise<Snap> {
  return page.evaluate((s) => new Promise<Snap>((resolve) => {
    const st = document.querySelector('.tp-stage') as HTMLElement;
    const read = (): Snap => {
      const seats = Array.from(document.querySelectorAll<HTMLElement>('.tp.live .seat[data-n]'));
      return {
        shown: Object.fromEntries(seats.map((x) => [x.dataset.n!, x.querySelectorAll('.shown .cd').length])),
        tags: Object.fromEntries(seats.map((x) => [x.dataset.n!, x.querySelector('.tag')?.textContent ?? ''])),
        win: seats.filter((x) => x.classList.contains('win')).map((x) => x.dataset.n!),
        pill: Array.from(document.querySelectorAll('.tp.live .wpill b, .tp.live .wpill span')).map((e) => e.textContent ?? ''),
        board: document.querySelectorAll('.tp.live .board .cd').length,
        stack: document.querySelector('.tp.live .hero .hstack')?.textContent ?? '',
      };
    };
    if (st.dataset.res === s) { resolve(read()); return; }
    const mo = new MutationObserver(() => { if (st.dataset.res === s) { mo.disconnect(); resolve(read()); } });
    mo.observe(st, { attributes: true, attributeFilter: ['data-res'] });
  }), s);
}

interface CardSnap { b: string[]; span: string[]; klbl: string; wcards: string[]; best: number; rows: number; rect: { left: number; top: number; right: number; bottom: number }; out: string[]; shown: number; clip: string[]; letters: { bad: string[]; read: number } }
/**
 * The winner card the moment it is on screen, read at once (on a busy machine a short scene could end before a
 * slow check): its words and cards, and where it sits once it has risen (its rise is finished first).
 */
function cardAt(page: Page): Promise<CardSnap> {
  return page.evaluate((lettersSrc) => new Promise<CardSnap>((resolve) => {
    // words cut off: wider than their box, or (the amount) outside the card or its line
    const clipped = (c: HTMLElement): string[] => {
      const bad: string[] = [], cr = c.getBoundingClientRect();
      for (const e of Array.from(c.querySelectorAll<HTMLElement>('.txt b, .txt > span, .klbl, .wa, .wn'))) {
        const q = e.getBoundingClientRect();
        if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline') bad.push(`${e.className || e.tagName} overflows: "${e.textContent}"`);
        if (q.left < cr.left - 0.5 || q.right > cr.right + 0.5 || q.bottom > cr.bottom + 0.5) bad.push(`${e.className || e.tagName} outside the card: "${e.textContent}"`);
        const txt = e.closest('.txt')!.getBoundingClientRect();
        if (q.right > txt.right + 0.5 || q.left < txt.left - 0.5) bad.push(`${e.className || e.tagName} outside its line: "${e.textContent}"`);
        const ov = e.closest('.hrow')!.querySelector('.wcards')!.getBoundingClientRect();
        if (q.right > ov.left && q.left < ov.right && q.bottom > ov.top && q.top < ov.bottom) bad.push(`${e.className || e.tagName} under the cards`);
      }
      return bad;
    };
    const read = (c: HTMLElement): CardSnap => {
      for (const a of c.getAnimations({ subtree: true })) if (Number.isFinite(Number(a.effect?.getComputedTiming().endTime))) a.finish(); // (the theme's own loops run on)
      const r = c.getBoundingClientRect();
      const out: string[] = [];
      for (const e of [c, ...Array.from(c.querySelectorAll('.cd'))]) {
        const q = e.getBoundingClientRect();
        if (q.left < -1 || q.top < -1 || q.right > innerWidth + 1 || q.bottom > innerHeight + 1) out.push(`${e.className} ${Math.round(q.left)},${Math.round(q.top)},${Math.round(q.right)},${Math.round(q.bottom)}`);
      }
      const t = (sel: string) => Array.from(c.querySelectorAll(sel)).map((e) => e.textContent ?? '');
      return {
        b: t('.txt b'), span: t('.txt > span'), klbl: c.querySelector('.klbl')?.textContent ?? '',
        wcards: Array.from(c.querySelectorAll('.wcards .cd')).map((e) => e.getAttribute('aria-label') ?? ''),
        best: c.querySelectorAll('.best .cd').length, rows: c.querySelectorAll('.hrow').length,
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, out,
        shown: document.querySelectorAll('.tp.live .seat .shown').length,
        clip: clipped(c), letters: (0, eval)(`(${lettersSrc})`)({ rows: '.tp-wcard .hrow', nameSel: '.txt b' }),
      };
    };
    const over = document.querySelector('.tp-over') as HTMLElement;
    const now = over.querySelector<HTMLElement>('.tp-wcard');
    if (now) { resolve(read(now)); return; }
    const mo = new MutationObserver(() => { const c = over.querySelector<HTMLElement>('.tp-wcard'); if (c) { mo.disconnect(); resolve(read(c)); } });
    mo.observe(over, { childList: true });
  }), avatarLetters.toString());
}

/** Tap an empty part of the table (top left of the arena, away from buttons). */
async function tap(page: Page): Promise<void> {
  const box = (await page.locator('.tp.live .arena').boundingBox())!;
  await page.mouse.click(box.x + 6, box.y + box.height * 0.45);
}

async function showdown(page: Page, W: number): Promise<void> {
  await lettersOk(page, 'before the hand');
  const shot = cardAt(page);
  await play(page, 'showdown');
  // the scene, then the winner card rises in at 1 s with the real result
  const c = await shot;
  expect(c.letters.bad, 'winner card avatar').toEqual([]);
  expect(c.letters.read).toBe(1);
  expect(c.clip, 'winner card words cut off').toEqual([]);
  expect(c.b).toHaveLength(1);
  expect(c.b[0]).toMatch(/^Riya wins \d+$/);
  expect(c.span).toEqual(['Full house, kings full of sevens']);
  expect(c.klbl).toMatch(/Tier 3/i);
  expect(c.wcards).toEqual(['King of hearts', '7 of diamonds']);
  expect(c.best).toBe(5);
  expect(c.rect.right - c.rect.left).toBeLessThanOrEqual(W);
  expect(c.out, 'winner card off screen').toEqual([]);
  // nobody's cards are up yet behind the scene
  expect(c.shown).toBe(0);
  // tap: the scene gives way; the winner turns over, the best five lift, the pill names it
  const w = snapAt(page, 'winner');
  if ((await step(page)) === 'scene') await tap(page);
  const snap = await w;
  await expect(page.locator('.tp-wcard')).toHaveCount(0);
  expect(snap.win).toEqual(['Riya']);
  expect(snap.shown).toEqual({ Riya: 2, Arjun: 0, Meera: 0, Kabir: 0, Zoya: 0 });
  expect(snap.tags.Riya).toBe('Full house');
  await expect(page.locator('.tp.live .wpill b')).toHaveText(/^Riya wins \d+$/);
  await expect(page.locator('.tp.live .wpill span')).toHaveText('Full house, kings full of sevens');
  await expect(page.locator('.tp.live .board .cd.win')).toHaveCount(3);
  await expect(page.locator('.tp.live .board .cd.lose')).toHaveCount(2);
  // my own cards face up with the hand in words, even though I lost
  await expect(page.locator('.tp.live .hc.open .cd')).toHaveCount(2);
  await expect(page.locator('.tp.live .hhint')).toHaveText('Two pair, aces and kings');
  await expect(page.locator('.tp.live .act.nxt')).toContainText(/Next hand in \d+ · (tap|Space) to skip/);
  // then everyone else at the showdown, named; the folded hands never
  await reached(page, 'all');
  // the winner's seat stays where it is while the rest turn over (it used to jump back and forth)
  const seatAt = () => page.locator('.tp.live .seat.win').first().evaluate((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)}`; });
  const p0 = await seatAt();
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(120); expect(await seatAt(), 'winner seat moved').toBe(p0); }
  await expect(seat(page, 'Meera').locator('.shown .cd')).toHaveCount(2);
  await expect(seat(page, 'Meera')).toHaveClass(/\blose\b/);
  await expect(seat(page, 'Meera').locator('.tag')).toHaveText('Two pair');
  await expect(seat(page, 'Zoya').locator('.tag')).toHaveText('Three kings');
  for (const n of ['Arjun', 'Kabir']) await expect(seat(page, n).locator('.shown')).toHaveCount(0);
  await onScreen(page);
  await pillClear(page);
  await lettersOk(page, 'after the showdown');
  // Space skips to the end state
  await page.keyboard.press('Space');
  await expect.poll(() => step(page)).toBe('hold');
  await expect(page.locator('.tp.live .act.nxt')).toHaveText(/^(Next hand in \d+|Dealing the next hand)$/);
}

for (const theme of THEMES) {
  test.describe(`results · ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('showdown: scene with the winner card, the winner, then everyone else', async ({ page }) => {
      await open(page, theme);
      await showdown(page, 390);
      // the next hand: the same letters on the same people
      await page.evaluate(() => (window as unknown as { __lab: { start(): void } }).__lab.start());
      await lettersOk(page, 'the next hand');
    });

    test('split pot: both winners', async ({ page }) => {
      await open(page, theme);
      const shot = cardAt(page);
      await play(page, 'split');
      const c = await shot;
      expect(c.rows).toBe(2);
      const names = c.b.slice().sort();
      expect(names).toHaveLength(2);
      expect(names[0]).toMatch(/^Meera wins \d+$/); expect(names[1]).toMatch(/^Riya wins \d+$/);
      expect(c.wcards).toHaveLength(4);
      expect(c.out, 'winner card off screen').toEqual([]);
      expect(c.clip, 'winner card words cut off').toEqual([]);
      expect(c.letters.bad, 'winner card avatars').toEqual([]);
      const w = snapAt(page, 'winner');
      if ((await step(page)) === 'scene') await tap(page);
      const snap = await w;
      expect(snap.win.sort()).toEqual(['Meera', 'Riya']);
      expect(snap.shown).toEqual({ Riya: 2, Arjun: 0, Meera: 2, Kabir: 0, Zoya: 0 });
      await expect(page.locator('.tp.live .wpill b')).toHaveText(/^Split pot · \d+ (each|\/ \d+)$/);
      await expect(page.locator('.tp.live .wpill span')).toHaveText('Meera and Riya: kings and nines, ace kicker');
      await reached(page, 'all');
      await expect(seat(page, 'Arjun').locator('.shown')).toHaveCount(0);
      await onScreen(page);
      await pillClear(page);
    });

    test('everyone folded: no scene, no cards, a short line', async ({ page }) => {
      await open(page, theme);
      await play(page, 'fold');
      expect(await step(page)).toBe('fold');
      await expect(page.locator('.tpw-wrap, .tp-wcard')).toHaveCount(0);
      await expect(page.locator('.tp.live .seat .shown')).toHaveCount(0);
      await expect(page.locator('.tp.live .wpill b')).toHaveText('Everyone folded');
      await expect(page.locator('.tp.live .wpill span')).toHaveText(/^Arjun wins \d+ · cards stay hidden$/);
      await expect(seat(page, 'Arjun').locator('.tag')).toHaveText(/^\+\d+$/);
      await expect(page.locator('.tp.live .act.nxt')).toHaveText(/^Next hand in [23]$/); // 3 s
      await expect(page.locator('.tp.live .hc.open')).toHaveCount(0);
      await onScreen(page);
    });

    test('all-in before the flop: hands up with chances, the board comes slowly', async ({ page }) => {
      await open(page, theme);
      const first = snapAt(page, 'runout');
      await play(page, 'allin');
      const snap = await first;
      expect(snap.board).toBe(0);
      expect(snap.shown).toMatchObject({ Riya: 2, Arjun: 0, Meera: 0 });
      expect(snap.tags.Riya).toMatch(/^\d+%$/);
      expect(snap.pill[0]).toBe('All-in · dealing the flop');
      expect(snap.pill[1]).toMatch(/^(Dev|Riya) \d+% · (Dev|Riya) \d+%$/);
      // no spoilers: the stacks are as before the pot
      expect(snap.stack).toBe('0');
      await expect(page.locator('.tp.live .hc.open .cd')).toHaveCount(2);
      await onScreen(page);
      await pillClear(page);
      // the board comes slowly: the flop, then the turn (a tap skips ahead)
      await expect.poll(async () => page.locator('.tp.live .board .cd').count(), { timeout: 4000 }).toBeGreaterThanOrEqual(3);
      await expect.poll(async () => page.locator('.tp.live .board .cd').count(), { timeout: 4000 }).toBeGreaterThanOrEqual(4);
      for (let i = 0; i < 4 && (await step(page)) === 'runout'; i++) await tap(page);
      await expect.poll(() => step(page)).toBe('scene');
      await expect(page.locator('.tp-wcard .txt b')).toHaveText(/^Riya wins /);
      await tap(page);
      await expect.poll(() => step(page)).toBe('winner');
      await expect(seat(page, 'Riya').locator('.tag')).toHaveText('Full house');
    });
  });
}

for (const [W, H, theme] of [[360, 740, 'velvet'], [360, 740, 'pixel'], [844, 390, 'noir'], [844, 390, 'edo'], [1440, 900, 'train'], [1440, 900, 'ink']] as const) {
  test(`showdown and split fit at ${W}×${H} · ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: W, height: H });
    await open(page, theme);
    await showdown(page, W);
    // the laptop's side panel writes out each hand that was shown
    if (W >= 1200) {
      // the table log writes out each hand that was shown: who, the two cards, what they made
      const row = page.locator('.tp.live .side .tlog .lgl.lg-show', { hasText: 'Meera' });
      await expect(row).toContainText(/two pair, kings and queens/i);
      await expect(row.locator('.cd')).toHaveCount(2);
      await expect(row.locator('.cd').first()).toHaveAttribute('aria-label', 'Queen of hearts');
    }
  });
}

// the winner card never cuts off the amount or the hand: phones from 320 wide, every theme, one and two winners
for (const theme of THEMES) {
  test(`winner card words whole at 320×568, 360×740 and 390×844 · ${theme}`, async ({ page }) => {
    for (const [W, H] of [[320, 568], [360, 740], [390, 844]] as const) {
      await page.setViewportSize({ width: W, height: H });
      await open(page, theme);
      for (const kind of ['showdown', 'split'] as const) {
        const shot = cardAt(page);
        await play(page, kind);
        const c = await shot;
        expect(c.rows, `${W}×${H} ${kind}`).toBe(kind === 'split' ? 2 : 1);
        expect(c.b.every((b) => /^(Riya|Meera) wins \d[\d,]*$/.test(b)), `${W}×${H} ${kind}: ${c.b.join(' / ')}`).toBe(true);
        expect(c.clip, `${W}×${H} ${kind}: words cut off`).toEqual([]);
        expect(c.out, `${W}×${H} ${kind}: off screen`).toEqual([]);
        expect(c.rect.right - c.rect.left).toBeLessThanOrEqual(W);
        // on past the scene (the next deal starts from a table without a winner card)
        for (let i = 0; i < 5 && (await page.locator('.tp-wcard').count()); i++) await tap(page);
        await expect(page.locator('.tp-wcard')).toHaveCount(0);
        if (kind === 'split') { // and the pill clear of the seats once everyone has shown
          await reached(page, 'all');
          await pillClear(page);
        }
      }
    }
  });
}

test('my turn cuts in: a new hand ends the results at once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'classic');
  await play(page, 'showdown');
  await expect(page.locator('.tp-wcard')).toBeVisible();
  await page.evaluate(() => (window as unknown as { __lab: { start(): void } }).__lab.start());
  expect(await step(page)).toBe('');
  await expect(page.locator('.tp-wcard, .tpw-wrap')).toHaveCount(0);
  await expect(page.locator('.tp.live .wpill')).toHaveCount(0);
});

for (const how of ['reduced motion', 'motion off'] as const) {
  test(`${how}: no scene, the reveal still happens, without movement`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    if (how === 'reduced motion') await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'cyber', how === 'motion off' ? 'off' : 'full');
    await play(page, 'showdown');
    expect(await step(page)).toBe('winner');
    await expect(page.locator('.tpw-wrap, .tp-wcard')).toHaveCount(0);
    await expect(seat(page, 'Riya').locator('.shown .cd')).toHaveCount(2);
    await expect(page.locator('.tp.live .wpill b')).toHaveText(/^Riya wins \d+$/);
    // nothing moves: every card is at its end state (the menu behind the table may still be drawing its tab underline, cwnavin)
    const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && !/^(turnPulse|cwnavin)/.test((a as CSSAnimation).animationName ?? '')).map((a) => (a as CSSAnimation).animationName ?? a.id));
    expect(moving).toEqual([]);
    await reached(page, 'all');
    await expect(seat(page, 'Meera').locator('.shown .cd')).toHaveCount(2);
    await tap(page);
    await expect.poll(() => step(page)).toBe('hold');
  });
}

test('calm: the same steps, the winner card still rises', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'ivory', 'calm');
  await play(page, 'showdown');
  await expect(page.locator('.tp-wcard')).toBeVisible();
  await expect(page.locator('.tp-wcard')).toHaveClass(/calm/);
  await tap(page);
  await expect.poll(() => step(page)).toBe('winner');
});
