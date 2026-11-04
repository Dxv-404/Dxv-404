// At the table, the moment you run out of chips (design: tools/design/gen/v3rebuys.py, motion: v3motion.py).
//  - the bust-out sheet rises after the bust-out scene: rebuy (how many are left), watch or leave, with a bar
//    draining to the next deal (if it empties you sit that hand out); no rebuys left: "That's your night";
//    rebuys closed by the host's blind level: says so and why;
//  - after a rebuy: chips pour into your stack while it counts up, and a toast says which rebuy it was.
// Everything uses the theme's tokens and feel (easing and speed); calm drops the flourishes (no pouring chips),
// off and reduced motion show the end state at once.
import type { ScreenView } from '../net-table';
import { FEEL, type MotionLevel } from './motion';
import { ordinal } from './rebuy-hint';
import type { ThemeKey } from './render';
import { R } from '../research/capture';

const fmt = (n: number): string => Math.round(n).toLocaleString('en-IN');
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/></svg>';

/** Base lengths (s) from v3motion.py, before the theme's speed. */
export const RB_MOTION = { sheet: 0.45, pour: 1.8, toast: 4 } as const;

export type BustKind = 'left' | 'none' | 'closed';
export interface BustInfo { handNo: number; place: number; of: number }

/** Which sheet a busted player gets. */
export function bustKind(v: ScreenView): BustKind {
  const r = v.rebuy;
  if (r?.on && r.closed) return 'closed';
  if (r?.on && r.can) return 'left';
  return 'none';
}

export function bustSheetHtml(v: ScreenView, b: BustInfo, o: { offline?: boolean; leave: boolean }): string {
  const r = v.rebuy, me = v.players.find((p) => p.id === v.me);
  const kind = bustKind(v);
  const placeTxt = `${ordinal(b.place)} of ${b.of}`;
  const leave = o.leave ? '<button type="button" class="bb g" data-rb="leave">Leave table</button>' : '';
  const two = (a: string) => `<div class="two${leave ? '' : ' one'}">${a}${leave}</div>`;
  if (kind === 'left') {
    const left = r.left === null ? null : r.left;
    const leftTxt = left === null ? 'Rebuys are open all night, as many as you like.' : `You have <b>${left} rebuy${left === 1 ? '' : 's'}</b> left tonight.`;
    const small = left === null ? 'No limit · you’re dealt in next hand' : `${left} of ${r.max} left · you’re dealt in next hand`;
    return `<div class="rb-dim"></div><div class="rb-sheet bust" role="dialog" aria-modal="true" aria-labelledby="rb-t" data-testid="bust-sheet" data-kind="left"><span class="grip"></span>`
      + `<div class="bico" aria-hidden="true">0</div><h2 class="bt" id="rb-t">You’re out of chips</h2>`
      + `<p>You finished hand ${b.handNo} with nothing left. ${leftTxt}</p>`
      + `<button type="button" class="bb r" data-rb="rebuy" data-testid="bust-rebuy">Rebuy ${fmt(r.amount)}<small>${small}</small></button>`
      + two('<button type="button" class="bb g" data-rb="watch">Watch</button>')
      + `<div class="rb-tmr" data-testid="bust-bar"><b class="rb-fill"></b><span role="timer">Decide before the next hand or you sit it out</span></div></div>`;
  }
  const league = o.offline ? '' : '; it’s in the league already';
  const watch = '<button type="button" class="bb p" data-rb="watch">Keep watching</button>';
  if (kind === 'closed') {
    return `<div class="rb-dim"></div><div class="rb-sheet bust" role="dialog" aria-modal="true" aria-labelledby="rb-t" data-testid="bust-sheet" data-kind="closed"><span class="grip"></span>`
      + `<div class="bico" aria-hidden="true">${CLOCK}</div><h2 class="bt" id="rb-t">Rebuys have closed</h2>`
      + `<p>The host closed rebuys after level ${r.untilLevel}, and the table is on level ${v.level.n}. You finished <b>${placeTxt}</b>.</p>`
      + two(watch) + '</div>';
  }
  const why = r?.on ? 'You’re out of chips and out of rebuys.' : 'You’re out of chips, and this table has no rebuys.';
  return `<div class="rb-dim"></div><div class="rb-sheet bust" role="dialog" aria-modal="true" aria-labelledby="rb-t" data-testid="bust-sheet" data-kind="none"><span class="grip"></span>`
    + `<div class="bico" aria-hidden="true">${b.place}<small>${esc(ordinal(b.place).slice(String(b.place).length))}</small></div><h2 class="bt" id="rb-t">That’s your night</h2>`
    + `<p>${why} You finished <b>${placeTxt}</b>${league}.</p>`
    + `<div class="rb-night"><div class="rr"><span>Bought in</span><b>${fmt(me?.buyins ?? 0)}</b></div><div class="rr"><span>Biggest pot won</span><b>${fmt(v.stats?.biggest ?? 0)}</b></div></div>`
    + two(watch) + '</div>';
}

export interface RebuyUiOptions {
  over: HTMLElement;
  /** the live table (for the hero's stack) */
  stage: HTMLElement;
  theme(): ThemeKey;
  level(): MotionLevel;
  rebuy(): void;
  /** leave the table (no button when the table has no way out, e.g. the QR host) */
  leave?: (() => void) | null;
  offline?: boolean;
}

export class RebuyUi {
  private layer: HTMLElement | null = null;
  private barTimer: ReturnType<typeof setInterval> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private countRaf = 0;
  private bust: BustInfo | null = null;
  /** the sheet on screen, if any */
  open: BustKind | null = null;

  constructor(private o: RebuyUiOptions) {}

  private feel(): { ease: string; k: number } { return FEEL[this.o.theme()] ?? FEEL.classic!; }

  /** The overlay layer, with the theme's tokens and feel (the lab table has no themed app around it). */
  private ensureLayer(): HTMLElement {
    if (this.layer?.isConnected) return this.layer;
    const l = document.createElement('div');
    this.o.over.append(l);
    this.layer = l;
    this.styleLayer();
    return l;
  }
  private styleLayer(): void {
    const l = this.layer;
    if (!l) return;
    const f = this.feel(), lv = this.o.level();
    l.className = `rb-layer th-${this.o.theme()}${lv === 'off' ? ' still' : lv === 'calm' ? ' calm' : ''}`;
    l.style.setProperty('--rb-k', String(f.k));
    l.style.setProperty('--rb-ease', f.ease);
  }

  /** Show the bust-out sheet for this view. `b` is the hand you went out on and your place. */
  offer(v: ScreenView, b: BustInfo): void {
    this.bust = b;
    this.closeSheet();
    const l = this.ensureLayer();
    this.styleLayer();
    const wrap = document.createElement('div');
    wrap.className = 'rb-bust';
    wrap.innerHTML = bustSheetHtml(v, b, { offline: this.o.offline, leave: !!this.o.leave });
    l.append(wrap);
    this.open = bustKind(v);
    const shownAt = performance.now();
    this.sheetShownAt = shownAt;
    R.emit('rebuy.sheet', { kind: 'shown', sheet: this.open, place: b.place, of: b.of, handNo: b.handNo, rebuy: v.rebuy });
    wrap.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-rb]') as HTMLElement | null;
      if (!btn) return;
      const what = btn.dataset.rb;
      R.emit('rebuy.sheet', { kind: 'choice', choice: what ?? null, ms: Math.round(performance.now() - shownAt), amount: v.rebuy?.amount ?? null });
      if (what === 'rebuy') { (btn as HTMLButtonElement).disabled = true; this.o.rebuy(); this.closeSheet(); }
      else if (what === 'watch') this.closeSheet();
      else if (what === 'leave') { this.closeSheet(); this.o.leave?.(); }
    });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeSheet(); });
    ((wrap.querySelector('[data-rb=rebuy]') ?? wrap.querySelector('[data-rb=watch]')) as HTMLElement | null)?.focus({ preventScroll: true });
    this.syncBar(v);
  }

  /** The table changed under the sheet: the bar follows the next deal; a sheet whose choice is gone updates. */
  update(v: ScreenView): void {
    if (!this.open || !this.bust) return;
    const me = v.players.find((p) => p.id === v.me);
    if (!me || me.stack > 0 || v.phase === 'ended') { this.closeSheet(); return; }
    const kind = bustKind(v);
    if (kind !== this.open) { this.offer(v, this.bust); return; }
    this.syncBar(v);
  }

  /** The bar drains to the next deal (JS-driven so it also works with motion off: then it steps each second). */
  private syncBar(v: ScreenView): void {
    const bar = this.layer?.querySelector('.rb-tmr') as HTMLElement | null;
    if (this.barTimer) { clearInterval(this.barTimer); this.barTimer = null; }
    if (!bar) return;
    const at = v.nextDealAt ?? null;
    const txt = bar.querySelector('span')!;
    const fill = bar.querySelector('.rb-fill') as HTMLElement;
    const setLeft = (x: number) => { fill.style.transform = `scaleX(${x.toFixed(4)})`; bar.dataset.left = x.toFixed(3); };
    if (v.phase === 'hand' && v.me && !v.hand?.ps[v.me]) {
      bar.classList.add('done'); setLeft(0);
      txt.textContent = 'You’re sitting this hand out. Rebuy now to play the next one.';
      return;
    }
    if (at === null) { // nothing is going to be dealt by itself (paused, or nobody else has chips)
      bar.classList.remove('done'); setLeft(1);
      txt.textContent = v.paused ? 'Dealing is paused: rebuy before it starts again' : 'Rebuy and you are dealt in next hand';
      return;
    }
    const total = Math.max(1000, at - Date.now());
    const store = bar as HTMLElement & { _total?: number; _at?: number };
    if (store._at !== at) { store._at = at; store._total = total; }
    const step = () => {
      const left = Math.max(0, at - Date.now());
      setLeft(left / (store._total ?? total));
      if (left <= 0) {
        bar.classList.add('done');
        txt.textContent = 'You’re sitting this hand out. Rebuy now to play the next one.';
        if (this.barTimer) { clearInterval(this.barTimer); this.barTimer = null; }
      } else txt.textContent = `Decide before the next hand or you sit it out · ${Math.ceil(left / 1000)} s`;
    };
    step();
    this.barTimer = setInterval(step, this.o.level() === 'off' ? 1000 : 50);
  }

  private sheetShownAt: number | null = null;
  closeSheet(): void {
    if (this.sheetShownAt !== null && this.open) R.emit('rebuy.sheet', { kind: 'closed', sheet: this.open, ms: Math.round(performance.now() - this.sheetShownAt) });
    this.sheetShownAt = null;
    if (this.barTimer) { clearInterval(this.barTimer); this.barTimer = null; }
    this.layer?.querySelector('.rb-bust')?.remove();
    this.open = null;
  }

  /** You rebought: chips pour into your stack while it counts up, and the toast says which rebuy it was. */
  rebought(v: ScreenView, amount: number): void {
    this.closeSheet();
    const r = v.rebuy;
    const l = this.ensureLayer();
    this.styleLayer();
    const { ease, k } = this.feel();
    const lv = this.o.level();
    // the toast
    l.querySelector('.rb-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'rb-toast';
    toast.setAttribute('role', 'status');
    toast.dataset.testid = 'rebuy-toast';
    const which = r.max ? `Rebuy ${r.used} of ${r.max}` : `Rebuy ${r.used}`;
    toast.innerHTML = `<i class="ico">${CHECK}</i><span>${which} · ${fmt(amount)} chips. You’re in next hand.</span>`;
    l.append(toast);
    const toastMs = RB_MOTION.toast * 1000;
    if (lv !== 'off') toast.animate([{ transform: 'translate(-50%,20px)', opacity: 0, easing: ease }, { transform: 'translateX(-50%)', opacity: 1, offset: 0.1 }, { transform: 'translateX(-50%)', opacity: 1, offset: 0.85 }, { transform: 'translateX(-50%)', opacity: 0 }], { duration: toastMs, fill: 'both', id: 'rb-toast' });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.remove(), toastMs);
    if (lv === 'off') return; // the end state at once: the stack already shows the chips
    const dur = RB_MOTION.pour * 1000 * k * (lv === 'calm' ? 0.6 : 1);
    this.countUp(amount, dur);
    if (lv === 'calm') return; // calm: the meaning (the number) without the flourish
    const stack = this.o.stage.querySelector('.hero .hstack') as HTMLElement | null;
    if (!stack) return;
    const lr = l.getBoundingClientRect(), sr = stack.getBoundingClientRect();
    const tx = sr.left - lr.left + Math.min(sr.width, 60) / 2 - 13, ty = sr.top - lr.top + sr.height / 2 - 13;
    l.querySelector('.rb-pour')?.remove();
    const pour = document.createElement('div');
    pour.className = 'rb-pour';
    pour.setAttribute('aria-hidden', 'true');
    for (let n = 0; n < 9; n++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      c.setAttribute('class', 'chip'); c.setAttribute('viewBox', '0 0 24 24');
      c.innerHTML = `<use href="#ch-${'ab'[n % 2]}"/>`;
      const x = tx + (n % 3) * 12 - 12;
      c.style.left = `${x}px`; c.style.top = `${ty}px`;
      pour.append(c);
      c.animate([
        { transform: 'translate(60px,-190px)', opacity: 0, easing: ease },
        { transform: 'translate(48px,-150px)', opacity: 1, offset: 0.2, easing: ease },
        { transform: 'translate(0,0)', opacity: 1, offset: 0.7 },
        { transform: 'translate(0,0)', opacity: 0 },
      ], { duration: dur, delay: n * 90 * k, fill: 'both', id: 'rb-pour' });
    }
    l.append(pour);
    setTimeout(() => pour.remove(), dur + 9 * 90 * k + 50);
  }

  /** The stack number counts up to the rebuy (the table redraws it at any moment, so it is found each frame). */
  private countUp(to: number, dur: number): void {
    cancelAnimationFrame(this.countRaf);
    const t0 = performance.now();
    const frame = (t: number) => {
      const el = this.o.stage.querySelector('.hero .hstack') as HTMLElement | null;
      const p = Math.min(1, (t - t0) / dur);
      if (el) { el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3)))); el.classList.toggle('rb-count', p < 1); }
      if (p < 1) this.countRaf = requestAnimationFrame(frame);
    };
    this.countRaf = requestAnimationFrame(frame);
  }

  destroy(): void {
    this.closeSheet();
    cancelAnimationFrame(this.countRaf);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.layer?.remove();
    this.layer = null;
  }
}
