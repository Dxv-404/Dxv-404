// The Rebuys block of every "Open a table" screen (online, offline host app, QR mode), as designed in
// tools/design/gen/v3rebuys.py: a switch (rebuys only when a player is out of chips), rebuys per player,
// chips per rebuy (the starting stack or a custom amount, its allowed range under the box), when they close
// (only when blinds go up) and one plain sentence, kept up to date, saying exactly what players will get.
import { h, fmt } from './legacy/ui.js';
import { REBUY_MIN_BB, clampRebuyAmount, rebuyRange } from '@tp/engine';
import { rulesRows } from './table/rebuy-hint';
import type { ScreenView } from './net-table';

export interface RebuyCfg {
  startStack?: number; bb?: number; blindUpEvery?: number;
  rebuys?: boolean; maxRebuys?: number; rebuyAmount?: number; rebuyUntilLevel?: number;
}

/** The levels a host can close rebuys after (when blinds go up). */
export const CLOSE_LEVELS = [4, 6] as const;
export const MAX_CHOICES = [1, 2, 3, 0] as const;

const times = (n: number): string => (n === 0 ? 'as often as they like' : n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** Fill in what an older saved setup lacks (the design's defaults: twice, the starting stack, open all night). */
export function withRebuyDefaults<T extends RebuyCfg>(c: T): T {
  if (c.rebuys === undefined) c.rebuys = true;
  if (c.maxRebuys === undefined || !(MAX_CHOICES as readonly number[]).includes(c.maxRebuys)) c.maxRebuys = c.maxRebuys && c.maxRebuys > 3 ? 0 : 2;
  if (c.rebuyAmount === undefined) c.rebuyAmount = 0;
  if (c.rebuyUntilLevel === undefined) c.rebuyUntilLevel = 0;
  return c;
}

/** The chips one rebuy will give with these settings. */
export const rebuyAmountOf = (c: RebuyCfg): number => (c.rebuyAmount && c.rebuyAmount > 0 ? clampRebuyAmount(c.rebuyAmount, c.bb ?? 10) : c.startStack ?? 1000);

/** The plain sentence under the controls (HTML with the numbers in bold). */
export function rebuySummary(c: RebuyCfg): string {
  if (!c.rebuys) return 'No rebuys: a player who runs out of chips is out for the night.';
  const close = c.blindUpEvery && c.rebuyUntilLevel ? ` Rebuys close after <b>level ${c.rebuyUntilLevel}</b>.` : ' Rebuys stay open all night.';
  return `Everyone can rebuy <b>${times(c.maxRebuys ?? 0)}</b>, <b>${fmt(rebuyAmountOf(c))} chips</b> each, once they are out of chips.${close}`;
}

const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function seg<V extends string | number>(label: string, testid: string, opts: [V, string][], get: () => V, set: (v: V) => void): { el: HTMLElement; draw(): void } {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label, 'data-testid': testid });
  const draw = () => {
    const had = wrap.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.v : undefined;
    wrap.replaceChildren(...opts.map(([v, t]) => h('button', { type: 'button', role: 'radio', 'data-v': String(v), 'aria-checked': get() === v ? 'true' : 'false', class: get() === v ? 'on' : '', onclick: () => { set(v); } }, t)));
    if (had !== undefined) (wrap.querySelector(`[data-v="${had}"]`) as HTMLElement | null)?.focus();
  };
  draw();
  return { el: h('div', { class: 'field' }, h('span', {}, label), wrap), draw };
}

/**
 * The Rebuys panel. `cfg` is changed in place as the host chooses; call refresh() when the starting chips,
 * the big blind or the blind schedule change (the amounts, the range and the "Rebuys close" row follow them).
 */
export function rebuyBlock(cfg: RebuyCfg): { el: HTMLElement; refresh(): void; finish(): void } {
  withRebuyDefaults(cfg);
  let custom = (cfg.rebuyAmount ?? 0) > 0;
  let typed = custom ? String(cfg.rebuyAmount) : '';
  const sw = h('input', { type: 'checkbox', role: 'switch', 'data-testid': 'rb-on', 'aria-label': 'Rebuys', checked: cfg.rebuys ? true : null }) as HTMLInputElement;
  const body = h('div', { class: 'rb-body' });
  const sum = h('div', { class: 'rb-sum', role: 'status', 'aria-live': 'polite' }, h('i', { class: 'ico', html: check }), h('span', { 'data-testid': 'rb-sum' }));
  const el = h('section', { class: 'block rbp s3-c2', 'data-testid': 'rebuys-block' },
    h('label', { class: 'switch-row rb-head' }, h('span', {}, h('b', { class: 'rb-t' }, 'Rebuys'), h('small', {}, 'Only when a player is out of chips')), sw),
    body, sum);

  const max = seg('Rebuys per player', 'rb-max', MAX_CHOICES.map((n) => [n, n === 0 ? 'No limit' : String(n)] as [number, string]), () => cfg.maxRebuys ?? 0, (v) => { cfg.maxRebuys = v; refresh(); });
  const amt = seg<'start' | 'custom'>('Chips per rebuy', 'rb-amt', [['start', ''], ['custom', 'Custom']], () => (custom ? 'custom' : 'start'), (v) => {
    custom = v === 'custom';
    if (custom) { if (!typed) typed = String(cfg.startStack ?? 1000); cfg.rebuyAmount = Number(typed) || 0; } else cfg.rebuyAmount = 0;
    refresh();
    if (custom) setTimeout(() => input.focus(), 0);
  });
  const input = h('input', { type: 'number', inputmode: 'numeric', 'data-testid': 'rb-custom', 'aria-label': 'Chips per rebuy', min: 1, step: 1 }) as HTMLInputElement;
  const range = h('small', { class: 'rb-range', 'data-testid': 'rb-range' });
  const customBox = h('div', { class: 'rb-custom' }, h('label', { class: 'rb-inp' }, input, h('span', { 'aria-hidden': 'true' }, 'chips')), range);
  input.addEventListener('input', () => { typed = input.value; cfg.rebuyAmount = Math.max(0, Math.floor(Number(typed) || 0)); paint(); });
  input.addEventListener('change', () => {
    const v = clampRebuyAmount(Number(input.value) || 0, cfg.bb ?? 10) || rebuyRange(cfg.bb ?? 10)[0];
    cfg.rebuyAmount = v; typed = String(v); input.value = typed; paint();
  });
  const close = seg('Rebuys close', 'rb-close', [[0, 'Never'], ...CLOSE_LEVELS.map((n) => [n, `After level ${n}`] as [number, string])], () => cfg.rebuyUntilLevel ?? 0, (v) => { cfg.rebuyUntilLevel = v; refresh(); });
  body.append(max.el, h('div', { class: 'rb-amt' }, amt.el, customBox), close.el);
  sw.addEventListener('change', () => { cfg.rebuys = sw.checked; refresh(); });

  /** What changes as the host types: the range warning and the sentence. */
  function paint(): void {
    const bb = cfg.bb ?? 10;
    const [lo, hi] = rebuyRange(bb);
    const v = Number(typed) || 0;
    const bad = custom && (v < lo || v > hi);
    range.textContent = `Between ${fmt(lo)} (${REBUY_MIN_BB} big blinds) and ${fmt(hi)}`;
    range.classList.toggle('bad', bad);
    input.setAttribute('aria-invalid', bad ? 'true' : 'false');
    (sum.querySelector('[data-testid=rb-sum]') as HTMLElement).innerHTML = rebuySummary({ ...cfg, rebuyAmount: custom ? clampRebuyAmount(v, bb) : 0 });
  }
  function refresh(): void {
    sw.checked = !!cfg.rebuys;
    body.hidden = !cfg.rebuys;
    el.classList.toggle('off', !cfg.rebuys);
    max.draw();
    amt.draw();
    const startBtn = amt.el.querySelector('[data-v=start]');
    if (startBtn) startBtn.textContent = `Starting chips · ${fmt(cfg.startStack ?? 1000)}`;
    customBox.hidden = !custom;
    if (custom && document.activeElement !== input) input.value = typed;
    // closing after a level only means something when blinds go up
    close.el.hidden = !cfg.blindUpEvery;
    close.draw();
    paint();
  }
  /** Before opening the table: a custom amount inside its range, no closing level without rising blinds. */
  function finish(): void {
    if (custom) cfg.rebuyAmount = clampRebuyAmount(Number(typed) || 0, cfg.bb ?? 10) || rebuyRange(cfg.bb ?? 10)[0];
    else cfg.rebuyAmount = 0;
    if (!cfg.blindUpEvery) cfg.rebuyUntilLevel = 0;
  }
  refresh();
  return { el, refresh, finish };
}

/** "Blinds go up": every N hands (the table's levels count in hands). */
export const BLIND_CHOICES: [number, string][] = [[0, 'Never'], [10, '10 hands'], [20, '20 hands']];

// ---------------- the "Open a table" frame ----------------
// On phones a column of panels; on laptops (>= 1100 px wide) one dialog with three columns, Chips and blinds |
// Rebuys (outlined) | Table, so nothing hides below the fold (css/rebuys.css, .setup3).
export function setupHead(title: string, mode: string, sub: string, back: () => void): HTMLElement {
  return h('header', { class: 'page-head s3-head' },
    h('button', { type: 'button', class: 'icon-btn s3-back', 'aria-label': 'Back', onclick: back }, '‹'),
    h('div', { class: 's3-title' }, h('h1', {}, title), h('small', { class: 's3-sub' }, sub)),
    h('span', { class: 's3-chip' }, mode),
    h('button', { type: 'button', class: 'icon-btn s3-x', 'aria-label': 'Close', onclick: back }, '✕'));
}
export function setupFoot(hint: string, go: HTMLElement): HTMLElement {
  return h('div', { class: 'sticky-go s3-foot' }, h('span', { class: 's3-hint' }, hint), go);
}

/** A "Blinds go up" choice that tells the Rebuys block (its "Rebuys close" row follows it). */
export function blindsSeg(cfg: RebuyCfg, onChange: () => void, opts: [number, string][] = BLIND_CHOICES): HTMLElement {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Blinds go up', 'data-testid': 'cfg-blinds-up' });
  const draw = () => wrap.replaceChildren(...opts.map(([v, t]) => h('button', { type: 'button', role: 'radio', 'aria-checked': (cfg.blindUpEvery ?? 0) === v ? 'true' : 'false', class: (cfg.blindUpEvery ?? 0) === v ? 'on' : '', onclick: () => { cfg.blindUpEvery = v; draw(); onChange(); } }, t)));
  draw();
  return h('div', { class: 'field' }, h('span', {}, 'Blinds go up'), wrap);
}

// ---------------- at the table ----------------
/** The table menu's "Table rules" sheet: everything the host chose, plus what you have used. */
export function rulesContent(v: ScreenView, close: () => void, extra: { crew?: string | null } = {}): HTMLElement {
  return h('div', { class: 'menu rules', 'data-testid': 'rules-sheet' }, h('h2', {}, 'Table rules'),
    h('div', { class: 'rules-list' }, ...rulesRows(v, extra).map(([a, b]) => h('div', { class: 'rr' }, h('span', {}, a), h('b', {}, b)))),
    h('button', { type: 'button', class: 'btn ghost', onclick: close }, 'Close'));
}

/** A player's rebuys for the host's player rows ("2 rebuys"), empty when none. */
export const rebuysUsedText = (n: number): string => (n ? ` · ${n} rebuy${n === 1 ? '' : 's'}` : '');
