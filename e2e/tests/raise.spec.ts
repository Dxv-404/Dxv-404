// Raising (apps/web/src/table/raise.ts, design: tools/design/gen/v3raise.py) on a table played by a local
// engine (window.__tpLab.labTable): − and +, holding, typing, the slider and presets, keys, the layout on
// every kind of screen, all nine themes, motion settings, and the action buttons' contrast.
//
// The lab table: six players, blinds 10/20, stacks of 2,000. Dev has the button, so before the flop he
// faces the big blind: pot 90, 20 to call, minimum raise to 40, all-in 2,000; presets ½ pot 75, ¾ pot 103,
// pot 130. On the flop everyone checks to him: a bet, minimum 20.
import { test, expect, type Page, type Locator } from '@playwright/test';
import { textContrast } from '../contrast';

const THEMES = ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo'];
const FEEL_K: Record<string, number> = { classic: 1, noir: 1.25, ivory: 1.1, velvet: 1.2, cyber: 0.85, ink: 0.9, pixel: 1, train: 1, edo: 1.1 };
const NAMES = ['Dev', 'Riya', 'Arjun', 'Meera', 'Kabir', 'Zoya'];

interface Lab { act(a: unknown): string | undefined; start(): void; legal(): { minTo: number; maxTo: number; canCheck: boolean } | null; toAct(): string | null; me: string; engine: { s: { hand: { street: string; toAct: string | null } | null } } }
type Win = { __lab: Lab; __acts: { by: string | null; a: { type: string; to?: number } }[] };

async function open(page: Page, theme = 'classic', o: { motion?: 'full' | 'calm' | 'off'; stack?: number } = {}): Promise<void> {
  await page.addInitScript((t) => { localStorage.setItem('tp-intro-done', '1'); localStorage.setItem('tp-theme', t); }, theme);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as { __tpLab?: unknown }).__tpLab);
  await page.evaluate(([names, m, stack]) => {
    const w = window as unknown as { __tpLab: { settings: { motion: string }; labTable: (r: HTMLElement, n: string[], o: unknown) => Lab } } & Win;
    w.__tpLab.settings.motion = m as string;
    const root = document.createElement('div'); document.body.append(root);
    w.__lab = w.__tpLab.labTable(root, names as string[], { stack });
    // every action sent to the table, to check what a raise sent
    w.__acts = [];
    const act = w.__lab.act.bind(w.__lab);
    w.__lab.act = (a: unknown) => { w.__acts.push({ by: w.__lab.toAct(), a: a as { type: string } }); return act(a); };
  }, [NAMES, o.motion ?? 'full', o.stack ?? 2000] as const);
  await expect(page.locator('.tp.live')).toBeVisible();
}

/** Deal and let the others call or check until it is my turn: facing the big blind (raise) or first to bet on the flop (bet). */
async function myTurn(page: Page, kind: 'raise' | 'bet' = 'raise'): Promise<void> {
  await page.evaluate((kind) => {
    const lab = (window as unknown as Win).__lab;
    lab.start();
    for (let i = 0; i < 40; i++) {
      const h = lab.engine.s.hand!;
      if (h.toAct === lab.me && (kind === 'raise' ? h.street === 'preflop' : h.street !== 'preflop')) break;
      lab.act({ type: lab.legal()!.canCheck ? 'check' : 'call' });
    }
    (window as unknown as Win).__acts.length = 0;
    for (const a of document.getAnimations()) { try { a.finish(); } catch { /* endless */ } }
  }, kind);
  await expect(page.locator(`.tp.live .act.raise[data-act="raise"]`)).toBeVisible();
}

const sheet = (page: Page) => page.locator('.tp-raise');
const amount = (page: Page) => page.locator('.tp-raise .amt .v');
const goBtn = (page: Page) => page.locator('.tp-raise .go .gl');
const pm = (page: Page, which: 'plus' | 'minus') => page.locator(`.tp-raise .pm[data-x="${which}"]`);
const preset = (page: Page, k: string) => page.locator(`.tp-raise .rpre [data-p="${k}"]`);
const acts = (page: Page) => page.evaluate(() => (window as unknown as Win).__acts.map((x) => x.a));
/** A real press: pointer down, then up (− and + act on pointer down). */
async function press(page: Page, el: Locator, holdMs = 0): Promise<void> {
  const b = (await el.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.up();
}
async function openRaise(page: Page): Promise<void> {
  await page.locator('.tp.live .act.raise[data-act="raise"]').click();
  await expect(sheet(page)).toBeVisible();
  // let it arrive (it rises, slides or pops in) before pressing anything in it
  await page.waitForFunction(() => document.querySelector('.tp-raise .rbox')?.getAnimations().every((a) => a.playState === 'finished'));
}

test.describe('raise sheet on a phone (390 x 844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('opens with the amounts the engine allows, − and + step a big blind and stop at the ends', async ({ page }) => {
    await open(page);
    await myTurn(page);
    await expect(page.locator('.tp.live .act.raise small')).toHaveText('40+');
    await openRaise(page);
    await expect(sheet(page)).toHaveClass(/r-phone/);
    await expect(page.locator('.tp-raise .rtop b')).toHaveText('Raise');
    await expect(page.locator('.tp-raise .rtop span')).toHaveText('Pot 90 · you have 2,000');
    await expect(amount(page)).toHaveText('40');
    await expect(page.locator('.tp-raise .under')).toHaveText('raise to · min 40');
    await expect(goBtn(page)).toHaveText('Raise to 40');
    await expect(preset(page, 'min')).toHaveClass(/on/);
    // at the minimum − is off and does nothing
    await expect(pm(page, 'minus')).toHaveAttribute('aria-disabled', 'true');
    await press(page, pm(page, 'minus'));
    await expect(amount(page)).toHaveText('40');
    await press(page, pm(page, 'plus'));
    await expect(amount(page)).toHaveText('60');
    await expect(page.locator('.tp-raise .flo').last()).toHaveText('+20'); // floats off the step
    await press(page, pm(page, 'plus'));
    await press(page, pm(page, 'minus'));
    await expect(amount(page)).toHaveText('60');
    await expect(goBtn(page)).toHaveText('Raise to 60');
    await expect(pm(page, 'minus')).toHaveAttribute('aria-disabled', 'false');
    // the slider follows: aria value and thumb position
    await expect(page.locator('.tp-raise .rsl')).toHaveAttribute('aria-valuenow', '60');
    await expect(page.locator('.tp-raise .rsl')).toHaveAttribute('aria-valuemin', '40');
    await expect(page.locator('.tp-raise .rsl')).toHaveAttribute('aria-valuemax', '2000');
  });

  test('presets: Min, ½ pot, ¾ pot, Pot and All-in, then Raise sends exactly that', async ({ page }) => {
    await open(page);
    await myTurn(page);
    await openRaise(page);
    await expect(page.locator('.tp-raise .rpre button')).toHaveText(['Min', '½ pot', '¾ pot', 'Pot', 'All-in']);
    for (const [k, v] of [['half', '75'], ['tq', '103'], ['pot', '130'], ['min', '40']] as const) {
      await preset(page, k).click();
      await expect(amount(page)).toHaveText(v);
      await expect(preset(page, k)).toHaveClass(/on/);
      await expect(page.locator('.tp-raise .rpre button.on')).toHaveCount(1);
    }
    // all-in: + greys out, the button says so and glows
    await preset(page, 'all').click();
    await expect(amount(page)).toHaveText('2,000');
    await expect(page.locator('.tp-raise .under')).toHaveText('all your chips');
    await expect(goBtn(page)).toHaveText('All-in 2,000');
    await expect(sheet(page)).toHaveClass(/allin/);
    await expect(pm(page, 'plus')).toHaveAttribute('aria-disabled', 'true');
    await press(page, pm(page, 'plus'));
    await expect(amount(page)).toHaveText('2,000');
    expect(await page.locator('.tp-raise .go').evaluate((e) => e.getAnimations().some((a) => (a as CSSAnimation).animationName === 'rz-glow' && a.effect!.getTiming().iterations === Infinity))).toBe(true);
    await press(page, pm(page, 'minus'));
    await expect(amount(page)).toHaveText('1,980');
    await expect(sheet(page)).not.toHaveClass(/allin/);
    await preset(page, 'half').click();
    await page.locator('.tp-raise .go').click();
    await expect(sheet(page)).toHaveCount(0);
    expect(await acts(page)).toEqual([{ type: 'raise', to: 75 }]);
  });

  test('all-in sends all-in; Cancel and a tap outside close without raising', async ({ page }) => {
    await open(page);
    await myTurn(page);
    await openRaise(page);
    await page.locator('.tp-raise [data-x="cancel"].bb').click();
    await expect(sheet(page)).toHaveCount(0);
    await openRaise(page);
    await page.mouse.click(195, 120); // the dimmed table
    await expect(sheet(page)).toHaveCount(0);
    expect(await acts(page)).toEqual([]);
    await openRaise(page);
    await preset(page, 'all').click();
    await page.locator('.tp-raise .go').click();
    expect(await acts(page)).toEqual([{ type: 'allin' }]);
  });

  test('holding + repeats and speeds up, and stops at all-in', async ({ page }) => {
    await open(page, 'classic', { stack: 600 });
    await myTurn(page);
    await openRaise(page);
    const b = (await pm(page, 'plus').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await expect(pm(page, 'plus')).toHaveClass(/press/); // the ring pulses while held
    await expect(page.locator('.tp-raise .rnote')).toHaveText('Each tap is one big blind (20). Hold to keep going; it speeds up.');
    const at700 = Number((await amount(page).textContent())!.replace(/,/g, ''));
    // one step on the press, then it keeps going (the exact pace is measured below, in the page)
    expect(at700).toBeGreaterThanOrEqual(40 + 20 * 3);
    expect(at700 % 20).toBe(0);
    await page.waitForTimeout(1500); // every 60 ms after a second: 600 is reached and it stops there
    await expect(amount(page)).toHaveText('600');
    await expect(goBtn(page)).toHaveText('All-in 600');
    await page.mouse.up();
    await expect(pm(page, 'plus')).not.toHaveClass(/press/);
    await expect(page.locator('.tp-raise .rnote')).toBeHidden();
    // the speed: from 1 s on, steps come twice as fast
    await preset(page, 'min').click();
    const t = await page.evaluate(async () => {
      const v = () => Number(document.querySelector('.tp-raise .amt .v')!.textContent!.replace(/,/g, ''));
      const el = document.querySelector('.tp-raise .pm.p') as HTMLElement;
      const times: number[] = [];
      const obs = new MutationObserver(() => times.push(performance.now()));
      obs.observe(document.querySelector('.tp-raise .amt .v')!, { childList: true, characterData: true, subtree: true });
      const t0 = performance.now();
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
      await new Promise((r) => setTimeout(r, 1500));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      obs.disconnect();
      const gaps = times.map((x) => x - t0);
      // steps in 300-1000 ms (every 120 ms: 6) and in 1000-1480 ms (every 60 ms: 8), counted from the press;
      // the repeats keep to a schedule from the press, so a slow frame shifts a step but does not lose it
      const n = (a: number, b: number) => gaps.filter((at) => at > a && at <= b).length;
      return { early: n(300, 1000), late: n(1000, 1480), last: v() };
    });
    expect(t.early, JSON.stringify(t)).toBeGreaterThanOrEqual(5); expect(t.early, JSON.stringify(t)).toBeLessThanOrEqual(7);
    expect(t.late, JSON.stringify(t)).toBeGreaterThanOrEqual(6); expect(t.late, JSON.stringify(t)).toBeLessThanOrEqual(9);
    expect(t.late / 480, JSON.stringify(t)).toBeGreaterThan((t.early / 700) * 1.3); // faster after a second (a busy machine may delay a step or two)
  });

  test('typing an amount: the number pad, above the stack is all-in, below the minimum is the minimum', async ({ page }) => {
    await open(page);
    await myTurn(page);
    await openRaise(page);
    await page.locator('.tp-raise .amt').click();
    await expect(page.locator('.tp-raise .rpad')).toBeVisible();
    await expect(page.locator('.tp-raise .rpre')).toBeHidden();
    await expect(page.locator('.tp-raise .rsl')).toBeHidden();
    await expect(page.locator('.tp-raise .rpad button')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫']);
    const key = (k: string) => page.locator(`.tp-raise .rpad [data-k="${k}"]`).click();
    await key('1');
    await expect(page.locator('.tp-raise .rnote')).toHaveText('At least 40.');
    await expect(goBtn(page)).toHaveText('Raise to 40');
    await key('2'); await key('00');
    await expect(amount(page)).toHaveText('1,200');
    await expect(goBtn(page)).toHaveText('Raise to 1,200');
    await expect(page.locator('.tp-raise .rnote')).toHaveText('Up to 2,000. Typing more than you have makes it all-in.');
    await key('⌫');
    await expect(amount(page)).toHaveText('120');
    await key('0'); await key('0');
    await expect(amount(page)).toHaveText('12,000');
    await expect(goBtn(page)).toHaveText('All-in 2,000');
    await expect(sheet(page)).toHaveClass(/allin/);
    await key('⌫'); await key('⌫'); await key('⌫'); await key('5');
    await expect(goBtn(page)).toHaveText('Raise to 125');
    // + leaves typing and steps from the typed amount
    await press(page, pm(page, 'plus'));
    await expect(amount(page)).toHaveText('145');
    await expect(page.locator('.tp-raise .rpad')).toBeHidden();
    await page.locator('.tp-raise .amt').click();
    await key('3'); await key('3'); await key('0');
    await page.locator('.tp-raise .go').click();
    expect(await acts(page)).toEqual([{ type: 'raise', to: 330 }]);
  });

  test('the slider: drag anywhere on it, the ends are the minimum and all-in, ticks at ½ pot, ¾ pot and pot', async ({ page }) => {
    await open(page, 'classic', { stack: 300 }); // a short stack so the presets spread over the slider
    await myTurn(page);
    await openRaise(page);
    await expect(page.locator('.tp-raise .tlab span')).toHaveText(['Min', '½', 'Pot', 'All']);
    await expect(page.locator('.tp-raise .trk i')).toHaveCount(3);
    const trk = (await page.locator('.tp-raise .trk').boundingBox())!;
    await page.mouse.move(trk.x + trk.width * 0.5, trk.y + 4);
    await page.mouse.down();
    await page.mouse.move(trk.x + trk.width + 40, trk.y + 4, { steps: 4 });
    await expect(amount(page)).toHaveText('300');
    await page.mouse.move(trk.x - 40, trk.y + 4, { steps: 4 });
    await expect(amount(page)).toHaveText('40');
    await page.mouse.move(trk.x + trk.width * 0.5, trk.y + 4, { steps: 2 });
    await page.mouse.up();
    const mid = Number(await amount(page).textContent());
    expect(mid % 20).toBe(0);
    expect(Math.abs(mid - 170)).toBeLessThanOrEqual(20);
    // the thumb sits where the amount is
    const thumb = (await page.locator('.tp-raise .trk u').boundingBox())!;
    expect(Math.abs(thumb.x + thumb.width / 2 - (trk.x + trk.width * ((mid - 40) / 260)))).toBeLessThan(2);
  });

  test('bet, not raise, when nobody has bet yet', async ({ page }) => {
    await open(page);
    await myTurn(page, 'bet');
    await expect(page.locator('.tp.live .act.raise[data-act="raise"]')).toContainText('Bet');
    await openRaise(page);
    await expect(page.locator('.tp-raise .rtop b')).toHaveText('Bet');
    await expect(page.locator('.tp-raise .under')).toHaveText('bet · min 20');
    await expect(goBtn(page)).toHaveText('Bet 20');
    await preset(page, 'pot').click();
    await expect(goBtn(page)).toHaveText('Bet 120'); // the pot: 6 × 20
    await page.locator('.tp-raise .go').click();
    expect(await acts(page)).toEqual([{ type: 'bet', to: 120 }]);
  });

  test('the sheet closes when the turn is gone; F and C still work with it open', async ({ page }) => {
    await open(page);
    await myTurn(page);
    await openRaise(page);
    await page.keyboard.press('c');
    await expect(sheet(page)).toHaveCount(0);
    expect(await acts(page)).toEqual([{ type: 'call' }]);
  });
});

test.describe('keys on a laptop (1440 x 900)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('R opens; ← → one big blind, Shift five; ↑ ↓ presets; Home, End; digits; Enter raises', async ({ page }) => {
    await open(page);
    await myTurn(page);
    // no key hints until a key is pressed
    await expect(page.locator('.tp.live .act kbd').first()).toBeHidden();
    await page.keyboard.press('r');
    await expect(sheet(page)).toHaveClass(/r-lap/);
    await expect(page.locator('.tp.live .act kbd').first()).toBeVisible();
    await expect(page.locator('.tp-raise .keys')).toBeVisible();
    await expect(page.locator('.tp-raise .keys')).toContainText('1 big blind');
    await page.keyboard.press('ArrowRight');
    await expect(amount(page)).toHaveText('60');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(amount(page)).toHaveText('160');
    await page.keyboard.press('ArrowLeft');
    await expect(amount(page)).toHaveText('140');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(amount(page)).toHaveText('40');
    await page.keyboard.press('ArrowLeft');
    await expect(amount(page)).toHaveText('40'); // never below the minimum
    for (const v of ['75', '103', '130', '2,000', '2,000']) { await page.keyboard.press('ArrowUp'); await expect(amount(page)).toHaveText(v); }
    await page.keyboard.press('ArrowRight');
    await expect(amount(page)).toHaveText('2,000'); // never above the stack
    for (const v of ['130', '103']) { await page.keyboard.press('ArrowDown'); await expect(amount(page)).toHaveText(v); }
    await page.keyboard.press('End');
    await expect(goBtn(page)).toHaveText('All-in 2,000');
    await page.keyboard.press('Home');
    await expect(goBtn(page)).toHaveText('Raise to 40');
    // the dock's Raise button names the amount while the popover is open
    await expect(page.locator('.tp.live .act.raise[data-act="raise"]')).toContainText('Raise to 40');
    await page.keyboard.type('500');
    await expect(amount(page)).toHaveText('500');
    await page.keyboard.press('Backspace');
    await expect(goBtn(page)).toHaveText('Raise to 50');
    await page.keyboard.type('000');
    await expect(goBtn(page)).toHaveText('All-in 2,000');
    await page.keyboard.type('0'); // no longer than "more than you have" needs
    await expect(amount(page)).toHaveText('50,000');
    await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
    await expect(goBtn(page)).toHaveText('Raise to 500');
    await page.keyboard.press('Enter');
    await expect(sheet(page)).toHaveCount(0);
    expect(await acts(page)).toEqual([{ type: 'raise', to: 500 }]);
  });

  test('Esc closes; a digit opens with that amount; F folds', async ({ page }) => {
    await open(page);
    await myTurn(page);
    await page.keyboard.press('r');
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator('.tp.live .act.raise[data-act="raise"]')).toContainText('Raise');
    await expect(page.locator('.tp.live .act.raise[data-act="raise"] small')).toHaveText('40+'); // the dock button is itself again
    await page.keyboard.press('3');
    await expect(sheet(page)).toBeVisible();
    await expect(amount(page)).toHaveText('3');
    await expect(goBtn(page)).toHaveText('Raise to 40');
    await page.keyboard.press('0');
    await expect(goBtn(page)).toHaveText('Raise to 40');
    await page.keyboard.press('0');
    await expect(goBtn(page)).toHaveText('Raise to 300');
    await page.keyboard.press('Escape');
    expect(await acts(page)).toEqual([]);
    await page.keyboard.press('f');
    expect(await acts(page)).toEqual([{ type: 'fold' }]);
  });

  test('the popover sits above the Raise button; the dock has no inline presets or slider', async ({ page }) => {
    await open(page);
    await myTurn(page);
    await expect(page.locator('.tp.live .dock .rb, .tp.live .dock .presets, .tp.live .dock input[type=range]')).toHaveCount(0);
    await openRaise(page);
    const box = (await page.locator('.tp-raise .rbox').boundingBox())!;
    const btn = (await page.locator('.tp.live .act.raise').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(btn.y);
    expect(btn.y - (box.y + box.height)).toBeLessThan(30);
    const tail = (await page.locator('.tp-raise .tail').boundingBox())!;
    expect(Math.abs(tail.x + tail.width / 2 - (btn.x + btn.width / 2))).toBeLessThan(4); // the tail points at it
    // a mouse user sees no key hints
    await expect(page.locator('.tp-raise .keys')).toBeHidden();
    await expect(page.locator('.tp.live .actions .act:not(.raise) kbd').first()).toBeHidden();
    // the table stays usable around it
    await page.locator('.tp.live .act.call').click();
    expect(await acts(page)).toEqual([{ type: 'call' }]);
    await expect(sheet(page)).toHaveCount(0);
  });
});

test.describe('touch never shows key hints', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  test('a keyboard turns them on, a touch turns them off again', async ({ page }) => {
    await open(page);
    await myTurn(page);
    await page.keyboard.press('Shift');
    await expect(page.locator('.tp.live .act kbd').first()).toBeVisible();
    await page.locator('.tp.live .act.raise').tap();
    await expect(sheet(page)).toBeVisible();
    await expect(page.locator('.tp.live .act kbd').first()).toBeHidden();
    await expect(page.locator('.tp-raise .keys')).toBeHidden();
    await expect(page.locator('.tp-raise .kbd').first()).toBeHidden();
  });
});

const SIZES: [number, number, string, string][] = [
  [390, 844, 'r-phone', 'phone'], [360, 740, 'r-phone cmp', 'short phone'], [320, 568, 'r-phone cmp', 'small phone'], [375, 667, 'r-phone cmp', 'iPhone SE'],
  [844, 390, 'r-land', 'phone sideways'], [667, 375, 'r-land', 'small phone sideways'],
  [820, 1180, 'r-phone', 'tablet'], [768, 1024, 'r-phone cmp', 'small tablet'],
  [1440, 900, 'r-lap', 'laptop'], [1280, 720, 'r-lap', 'small laptop'], [1920, 1080, 'r-lap', 'desktop'], [1180, 820, 'r-lap', 'tablet sideways'],
];
for (const [W, H, cls, label] of SIZES) {
  test(`layout on a ${label} (${W} x ${H}): ${cls}, everything on screen, touch targets`, async ({ page }) => {
    await page.setViewportSize({ width: W, height: H });
    await open(page, 'classic', { motion: 'off' });
    await myTurn(page);
    await openRaise(page);
    for (const c of cls.split(' ')) await expect(sheet(page)).toHaveClass(new RegExp(`\\b${c}\\b`));
    if (!cls.includes('cmp')) await expect(sheet(page)).not.toHaveClass(/\bcmp\b/);
    const check = async (state: string) => {
      const bad = await page.evaluate(([W, H, touch]) => {
        const out: string[] = [];
        const els = document.querySelectorAll<HTMLElement>('.tp-raise .rbox, .tp-raise .rbox button, .tp-raise .rsl, .tp-raise .amt .v, .tp-raise .rtop span');
        for (const e of Array.from(els)) {
          if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue; // hidden
          const r = e.getBoundingClientRect();
          if (r.left < -0.5 || r.top < -0.5 || r.right > (W as number) + 0.5 || r.bottom > (H as number) + 0.5) out.push(`${e.className || e.tagName} off screen ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);
          if (touch && e.tagName === 'BUTTON' && (r.height < 43.5 || r.width < 43.5)) out.push(`${e.className || e.textContent} is ${Math.round(r.width)}x${Math.round(r.height)}`);
          if (e.scrollWidth > e.clientWidth + 1 && e.tagName !== 'DIV') out.push(`${e.className} text cut: ${e.textContent}`);
        }
        const box = document.querySelector('.tp-raise .rbox') as HTMLElement;
        if (getComputedStyle(box).overflowY !== 'visible' && box.scrollHeight > box.clientHeight + 1) out.push('the panel scrolls');
        // nothing overlaps inside the sheet: the rows follow each other
        const rows = Array.from(box.children).filter((c) => (c as HTMLElement).offsetParent && !c.classList.contains('tail')).map((c) => c.getBoundingClientRect());
        for (let i = 1; i < rows.length; i++) if (rows[i]!.top < rows[i - 1]!.bottom - 0.5) out.push(`row ${i} overlaps the one above`);
        return out;
      }, [W, H, cls !== 'r-lap'] as const);
      expect(bad, state).toEqual([]);
    };
    await check('open');
    await preset(page, 'all').click();
    await check('all-in');
    await page.locator('.tp-raise .amt').click();
    await page.locator('.tp-raise .rpad [data-k="9"]').click();
    await check('typing');
    if (cls === 'r-land') {
      // the panel replaces the thumb column; the table stays in view and usable
      const dock = (await page.locator('.tp.live .dock').boundingBox())!;
      const box = (await page.locator('.tp-raise .rbox').boundingBox())!;
      expect(Math.abs(box.x - dock.x)).toBeLessThan(1);
      expect(Math.abs(box.width - dock.width)).toBeLessThan(1);
      expect(Math.abs(box.y + box.height - (dock.y + dock.height))).toBeLessThan(1);
      await expect(page.locator('.tp-raise .rpre')).toHaveClass(/g2/);
      await expect(page.locator('.tp-raise .rdim')).toHaveCount(0);
    }
    if (W >= 600 && H > W) { // a tablet: the phone sheet, zoomed with the table
      const z = await page.locator('.tp-raise .rbox').evaluate((e) => Number(getComputedStyle(e).zoom));
      expect(z).toBeGreaterThan(1.3);
    }
  });
}

test('every theme: the sheet in the theme\'s colours, and every button in it readable', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const low: string[] = [];
  for (const theme of THEMES) {
    await page.goto('about:blank');
    await open(page, theme, { motion: 'off' });
    await myTurn(page);
    await openRaise(page);
    await preset(page, 'half').click();
    // the theme's own tokens: the sheet's background and the raise button's colour
    const t = await page.evaluate(() => {
      const box = document.querySelector('.tp-raise .rbox') as HTMLElement, cs = getComputedStyle(box);
      const go = getComputedStyle(document.querySelector('.tp-raise .go') as HTMLElement);
      return { bg: cs.backgroundColor, tokenBg: cs.getPropertyValue('--bg').trim(), go: go.backgroundImage + go.backgroundColor, tokenRaise: cs.getPropertyValue('--b-raise').trim() };
    });
    expect(t.tokenBg, theme).not.toBe('');
    expect(t.go.length, theme).toBeGreaterThan(0);
    for (const r of await textContrast(page, '.tp-raise .go, .tp-raise .bb.g, .tp-raise .rpre button, .tp-raise .amt')) if (r.ratio < 4.5) low.push(`${theme} ${r.what} "${r.text}" ${r.ratio}`);
    await preset(page, 'all').click();
    for (const r of await textContrast(page, '.tp-raise .go')) if (r.ratio < 4.5) low.push(`${theme} all-in "${r.text}" ${r.ratio}`);
    await page.locator('.tp-raise .amt').click();
    for (const r of await textContrast(page, '.tp-raise .rpad button')) if (r.ratio < 4.5) low.push(`${theme} pad "${r.text}" ${r.ratio}`);
  }
  expect(low).toEqual([]);
});

test('readable: Fold, Call/Check and Raise/Bet labels, amounts and key hints at 4.5:1 or more in every theme', async ({ page }) => {
  test.setTimeout(400_000);
  const low: string[] = [];
  for (const [W, H, kind] of [[390, 844, 'raise'], [1440, 900, 'raise'], [844, 390, 'raise'], [360, 740, 'bet'], [1440, 900, 'bet']] as const) {
    await page.setViewportSize({ width: W, height: H });
    for (const theme of THEMES) {
      await page.goto('about:blank');
      await open(page, theme, { motion: 'off' });
      await myTurn(page, kind);
      if (W === 1440) await page.keyboard.press('Shift'); // key hints on
      const runs = await textContrast(page, '.tp.live .actions .act');
      expect(runs.length, theme).toBeGreaterThanOrEqual(kind === 'raise' ? 5 : 3);
      for (const r of runs) if (r.ratio < 4.5) low.push(`${W}x${H} ${kind} ${theme} ${r.what} "${r.text}" ${r.ratio} (${r.color} on ${r.bg})`);
    }
  }
  expect(low).toEqual([]);
});

test.describe('motion', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('full: the sheet rises in 0.4 s, the number rolls, the thumb snaps, all in the theme\'s feel', async ({ page }) => {
    for (const theme of ['classic', 'noir', 'pixel']) {
      await page.goto('about:blank');
      await open(page, theme, { motion: 'full' });
      await myTurn(page);
      await openRaise(page);
      const k = FEEL_K[theme]!;
      const rise = await page.evaluate(() => document.querySelector('.tp-raise .rbox')!.getAnimations().map((a) => [(a as CSSAnimation).animationName, a.effect!.getTiming().duration, (a.effect as KeyframeEffect).getComputedTiming().easing ?? '']));
      expect(rise.length, theme).toBe(1);
      expect(rise[0]![0]).toBe('rz-rise');
      expect(Math.abs(Number(rise[0]![1]) - 400 * k), theme).toBeLessThan(1);
      await press(page, pm(page, 'plus'));
      const roll = await page.evaluate(() => document.querySelector('.tp-raise .amt .v')!.getAnimations().map((a) => [a.id, a.effect!.getTiming().duration, a.effect!.getTiming().easing]));
      expect(roll.length, theme).toBe(1);
      expect(roll[0]![0]).toBe('rz-roll');
      expect(Math.abs(Number(roll[0]![1]) - 150 * k), theme).toBeLessThan(1);
      if (theme === 'pixel') expect(roll[0]![2]).toBe('steps(6)');
      await preset(page, 'pot').click();
      const snap = await page.locator('.tp-raise .trk u').evaluate((e) => { const c = getComputedStyle(e); return [c.transitionProperty, parseFloat(c.transitionDuration)]; });
      expect(snap[0]).toBe('left');
      expect(Math.abs(Number(snap[1]) - 0.3 * k), theme).toBeLessThan(0.01);
    }
  });

  test('calm: the sheet still rises, but nothing floats, pulses or glows on a loop', async ({ page }) => {
    await open(page, 'classic', { motion: 'calm' });
    await myTurn(page);
    await openRaise(page);
    await press(page, pm(page, 'plus'));
    await expect(page.locator('.tp-raise .flo')).toHaveCount(0);
    await preset(page, 'all').click();
    const loops = await page.evaluate(() => document.querySelectorAll('.tp-raise *').length && Array.from(document.querySelectorAll('.tp-raise *')).flatMap((e) => e.getAnimations()).filter((a) => a.effect!.getTiming().iterations === Infinity).length);
    expect(loops).toBe(0);
    await expect(sheet(page)).toHaveClass(/allin/); // the meaning stays: the glow is drawn, still
    expect(await page.locator('.tp-raise .go').evaluate((e) => getComputedStyle(e).boxShadow)).toContain('18px');
  });

  test('off (and reduced motion): nothing moves at all, everything still works', async ({ page }) => {
    await open(page, 'classic', { motion: 'off' });
    await myTurn(page);
    await openRaise(page);
    const any = () => page.evaluate(() => Array.from(document.querySelectorAll('.tp-raise, .tp-raise *')).flatMap((e) => e.getAnimations()).length);
    expect(await any()).toBe(0);
    await press(page, pm(page, 'plus'));
    await preset(page, 'pot').click();
    expect(await any()).toBe(0);
    expect(await page.locator('.tp-raise .trk u').evaluate((e) => parseFloat(getComputedStyle(e).transitionDuration))).toBe(0);
    await expect(amount(page)).toHaveText('130');
  });

  test('prefers-reduced-motion counts as off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'classic', { motion: 'full' });
    await myTurn(page);
    await openRaise(page);
    await press(page, pm(page, 'plus'));
    await expect(sheet(page)).toHaveClass(/m-off/);
    expect(await page.evaluate(() => Array.from(document.querySelectorAll('.tp-raise, .tp-raise *')).flatMap((e) => e.getAnimations()).length)).toBe(0);
  });
});
