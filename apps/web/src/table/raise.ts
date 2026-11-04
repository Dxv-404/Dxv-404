// Raising (design: tools/design/gen/v3raise.py, motion: v3motion.py). One amount, changed by − and + (a big
// blind a tap, holding repeats and speeds up), by typing it, by the slider or by the presets, and on a
// laptop by keys. Drawn where the screen has room for it: a sheet from the bottom on phones and tablets
// (tighter on short phones), a panel over the thumb column on a phone held sideways, a popover above the
// Raise button on laptops and desktops.
import { fmt, type Frame } from './render';
import { FEEL } from './motion';
import * as M from './raise-math';
import type { Spot, PresetKey } from './raise-math';

export type RaiseLevel = 'full' | 'calm' | 'off';
type Layout = 'phone' | 'land' | 'lap';
export type RaiseAction = ReturnType<typeof M.actionFor>;

export interface RaiseOpts {
  spot: Spot;
  theme: string;
  level: RaiseLevel;
  /** where the overlay is, and the table it sits over */
  over: HTMLElement; stage: HTMLElement;
  go(a: RaiseAction): void;
  close(): void;
  /** Research: opened, every amount shown, the gestures (presets, steps, drag, typing), and how it closed. */
  trace?(kind: string, d: Record<string, unknown>): void;
}

const ICON = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
};
const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'];

export class RaiseSheet {
  to: number;
  /** the preset last tapped (it stays lit while the amount is its amount) */
  picked: PresetKey | null = null;
  /** typed digits while typing, else null; the number pad is open (phones) */
  digits: string | null = null;
  pad = false;
  readonly el: HTMLElement;
  private box!: HTMLElement;
  private layout: Layout = 'phone';
  private compact = false;
  private u = 1;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private holding = false;
  private drag: number | null = null;
  private off: (() => void)[] = [];
  private restore: { el: HTMLElement; html: string } | null = null;
  private traced = false;
  private tr(kind: string, d: Record<string, unknown>): void { try { this.o.trace?.(kind, d); } catch { /* never into the sheet */ } }

  constructor(private o: RaiseOpts, frame: Frame) {
    this.to = o.spot.minTo;
    this.tr('open', { spot: o.spot, to: this.to });
    this.el = document.createElement('div');
    this.el.className = 'tp-raise';
    const stop = () => this.stopHold();
    window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); window.addEventListener('blur', stop);
    this.off.push(() => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); window.removeEventListener('blur', stop); });
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    this.el.addEventListener('pointerup', (e) => this.up(e));
    this.el.addEventListener('pointercancel', (e) => this.up(e));
    this.el.addEventListener('click', (e) => this.click(e));
    o.over.append(this.el);
    this.place(frame, true);
    (this.box.querySelector('.go') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  get spot(): Spot { return this.o.spot; }
  private get feel() { return FEEL[this.o.theme] ?? FEEL.classic!; }

  /** Lay the sheet out for the screen (again after a resize: the kind of screen may have changed). */
  place(frame: Frame, first = false): void {
    const layout: Layout = frame.mode;
    const compact = layout === 'phone' && frame.lh < 760;
    if (first || layout !== this.layout || compact !== this.compact || this.u !== frame.u) {
      this.layout = layout; this.compact = compact; this.u = frame.u;
      this.build(first);
    }
    this.position();
    if (this.layout === 'lap') this.labelDock();
  }

  private build(first: boolean): void {
    const s = this.spot, lay = this.layout, f = this.feel;
    const lvl = this.o.level;
    this.el.className = `tp-raise th-${this.o.theme} r-${lay}${this.compact ? ' cmp' : ''} m-${lvl}${first && lvl !== 'off' ? ' enter' : ''}`;
    this.el.style.setProperty('--ease', f.ease);
    this.el.style.setProperty('--k', String(f.k));
    const top = lay === 'land' ? `pot ${fmt(s.pot)}` : `Pot ${fmt(s.pot)} · you have ${fmt(s.maxTo)}`;
    const ps = M.presets(s).filter((p) => lay !== 'land' || p.key !== 'min');
    const keys = lay === 'lap' ? '<div class="keys" aria-hidden="true"><span><kbd class="kbd">←</kbd><kbd class="kbd">→</kbd> 1 big blind</span><span><kbd class="kbd">⇧</kbd>+<kbd class="kbd">←</kbd><kbd class="kbd">→</kbd> 5 big blinds</span>'
      + '<span><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> next amount</span><span><kbd class="kbd">Home</kbd> min · <kbd class="kbd">End</kbd> all-in</span><span>Type digits to set it</span></div>' : '';
    const bb = fmt(s.bb);
    this.el.innerHTML = (lay === 'phone' ? '<div class="rdim" data-x="cancel"></div>' : '')
      + `<div class="rpos"><div class="rbox" role="dialog" aria-modal="${lay === 'phone'}" aria-label="${M.title(s)}" tabindex="-1"${this.u !== 1 ? ` style="zoom:${this.u.toFixed(4)}"` : ''}>`
      + (lay === 'phone' ? '<span class="grip" aria-hidden="true"></span>' : '')
      + `<div class="rtop"><b>${M.title(s)}</b><span class="mut">${top}</span></div>`
      + `<div class="ramt"><button type="button" class="pm m" data-x="minus" aria-label="${bb} less">${ICON.minus}</button>`
      + '<div class="amc"><button type="button" class="amt" data-x="type" aria-label="Type an exact amount"><span class="v"></span><i class="caret" aria-hidden="true"></i></button><small class="under"></small></div>'
      + `<button type="button" class="pm p" data-x="plus" aria-label="${bb} more">${ICON.plus}</button></div>`
      + `<div class="rmid">${this.slider(lay !== 'land')}<div class="rpre${lay === 'land' ? ' g2' : ''}">${ps.map((p) => `<button type="button" data-p="${p.key}" data-to="${p.to}">${p.label}</button>`).join('')}</div></div>`
      + `<div class="rpad" hidden>${PAD.map((k) => `<button type="button" data-k="${k}"${k === '⌫' ? ' aria-label="Delete"' : ''}>${k}</button>`).join('')}</div>`
      + '<p class="rnote" hidden></p>'
      + keys
      + `<div class="racts"><button type="button" class="bb g" data-x="cancel">Cancel<kbd class="kbd">Esc</kbd></button><button type="button" class="bb r go" data-x="go"><span class="gl"></span><kbd class="kbd">⏎</kbd></button></div>`
      + (lay === 'lap' ? '<i class="tail" aria-hidden="true"></i>' : '')
      + '</div></div>';
    this.box = this.el.querySelector('.rbox') as HTMLElement;
    this.update();
    // the dock's Raise button names the amount while the popover is open (laptop)
    if (lay === 'lap') this.labelDock(); else this.unlabelDock();
  }

  private slider(ticks: boolean): string {
    const s = this.spot;
    const ps = M.presets(s);
    const pos = (k: PresetKey) => M.sliderPos(s, ps.find((p) => p.key === k)!.to);
    const inner = (x: number) => x > 0.01 && x < 0.99;
    const tk = ticks ? (['half', 'tq', 'pot'] as const).map(pos).filter(inner).map((x) => `<i style="left:${(x * 100).toFixed(1)}%"></i>`).join('') : '';
    // Min · ½ · Pot · All, leaving out a label that would sit on top of another
    const labs: [string, number][] = [['Min', 0], ['All', 1]];
    for (const [n, x] of [['Pot', pos('pot')], ['½', pos('half')]] as [string, number][]) if (inner(x) && labs.every(([, y]) => Math.abs(y - x) > 0.13)) labs.push([n, x]);
    labs.sort((a, b) => a[1] - b[1]);
    const lab = ticks ? `<div class="tlab" aria-hidden="true">${labs.map(([n, x]) => `<span style="left:${(x * 100).toFixed(1)}%">${n}</span>`).join('')}</div>` : '';
    return `<div class="rsl" role="slider" tabindex="0" aria-label="Amount" aria-valuemin="${s.minTo}" aria-valuemax="${s.maxTo}"><div class="trk"><b></b>${tk}<u></u></div>${lab}</div>`;
  }

  /** Draw the amount everywhere it shows. */
  private update(): void {
    const s = this.spot, q = (c: string) => this.box.querySelector(c) as HTMLElement;
    const typing = this.digits !== null;
    const t = typing ? M.typedTo(s, this.digits!) : null;
    const to = t ? t.to : this.to;
    this.tr('value', { to });
    const all = to >= s.maxTo;
    this.el.classList.toggle('allin', all);
    this.el.classList.toggle('typing', typing);
    this.el.classList.toggle('padon', this.pad);
    q('.v').textContent = typing ? (this.digits ? fmt(Number(this.digits)) : '') : fmt(to);
    this.fit();
    q('.amt').setAttribute('aria-label', `${fmt(to)}. Type an exact amount`);
    q('.under').textContent = M.underLabel(s, to, fmt);
    q('.pm.m').classList.toggle('dis', to <= s.minTo); q('.pm.m').setAttribute('aria-disabled', String(to <= s.minTo));
    q('.pm.p').classList.toggle('dis', all); q('.pm.p').setAttribute('aria-disabled', String(all));
    const f = M.sliderPos(s, to);
    q('.trk b').style.width = `${(f * 100).toFixed(2)}%`;
    q('.trk u').style.left = `${(f * 100).toFixed(2)}%`;
    const sl = q('.rsl');
    sl.setAttribute('aria-valuenow', String(to)); sl.setAttribute('aria-valuetext', all ? `All-in ${fmt(to)}` : fmt(to));
    const on = M.selected(s, to, this.picked);
    this.box.querySelectorAll<HTMLElement>('.rpre button').forEach((b) => { const yes = b.dataset.p === on; b.classList.toggle('on', yes); b.setAttribute('aria-pressed', String(yes)); });
    q('.gl').textContent = M.goLabel(s, to, fmt);
    q('.rmid').hidden = this.pad;
    q('.rpad').hidden = !this.pad;
    const note = q('.rnote');
    const say = typing && this.pad && this.layout !== 'land'
      ? (t!.below && this.digits ? `At least ${fmt(s.minTo)}.` : `Up to ${fmt(s.maxTo)}. Typing more than you have makes it all-in.`)
      : this.holding && this.layout !== 'land' ? `Each tap is one big blind (${fmt(s.bb)}). Hold to keep going; it speeds up.` : '';
    note.hidden = !say; note.textContent = say;
    if (this.layout === 'lap') this.labelDock();
  }

  /** A long amount in a narrow panel shrinks to fit rather than being cut. */
  private fit(): void {
    const amt = this.box.querySelector('.amt') as HTMLElement, v = amt.querySelector('.v') as HTMLElement;
    v.style.fontSize = '';
    const room = (amt.parentElement as HTMLElement).clientWidth - 14;
    if (room > 0 && v.offsetWidth > room) v.style.fontSize = `${Math.max(0.5, room / v.offsetWidth).toFixed(3)}em`;
  }

  /** The amount the Raise button would send right now. */
  value(): number { return this.digits !== null ? M.typedTo(this.spot, this.digits).to : this.to; }

  /** Change the amount (from − / +, a preset, a key or the slider); the number rolls, the thumb glides. */
  set(to: number, how: 'step' | 'snap' | 'drag', dir: 1 | -1 = 1): void {
    const s = this.spot;
    const prev = this.value();
    this.digits = null; this.pad = false;
    this.to = M.clampTo(s, to);
    if (how !== 'drag') this.tr(how, { v: how === 'step' ? dir : this.picked ?? 'key' });
    const sl = this.box.querySelector('.rsl') as HTMLElement;
    sl.classList.toggle('snap', how === 'snap');
    this.update();
    if (this.to !== prev) this.roll(this.to > prev ? 1 : -1);
    if (how === 'step' && this.to !== prev) this.float(dir, Math.abs(this.to - prev));
  }

  private roll(dir: 1 | -1): void {
    if (this.o.level === 'off') return;
    const v = this.box.querySelector('.v') as HTMLElement;
    v.getAnimations().forEach((a) => a.cancel());
    v.animate([{ transform: `translateY(${dir * 45}%)`, opacity: 0.15 }, { transform: 'none', opacity: 1 }], { duration: 150 * this.feel.k, easing: this.feel.ease, id: 'rz-roll' });
  }

  /** "+20" floats off the amount on each step (not in calm or off). */
  private float(dir: 1 | -1, n: number): void {
    if (this.o.level !== 'full') return;
    const amt = this.box.querySelector('.amt') as HTMLElement;
    amt.querySelectorAll('.flo').forEach((x, i, all) => { if (i < all.length - 3) x.remove(); });
    const f = document.createElement('span');
    f.className = `flo ${dir > 0 ? 'up' : 'dn'}`;
    f.setAttribute('aria-hidden', 'true');
    f.textContent = `${dir > 0 ? '+' : '−'}${fmt(n)}`;
    amt.append(f);
    f.addEventListener('animationend', () => f.remove());
    setTimeout(() => f.remove(), 1600 * this.feel.k);
  }

  // ---------------- pointer ----------------
  private down(e: PointerEvent): void {
    const t = e.target as HTMLElement;
    const pm = t.closest('.pm') as HTMLElement | null;
    if (pm && e.button === 0) {
      e.preventDefault();
      if (pm.classList.contains('dis')) return;
      const dir = pm.dataset.x === 'plus' ? 1 : -1;
      const start = performance.now();
      this.stopHold();
      this.set(M.stepTo(this.spot, this.value(), dir), 'step', dir);
      pm.classList.add('press');
      // on a schedule from the press, so a slow frame does not slow the count down
      let due = start + M.HOLD_START;
      const tick = () => {
        this.holding = true;
        const before = this.to;
        this.set(M.stepTo(this.spot, this.to, dir), 'step', dir);
        if (this.to === before) { this.stopHold(); return; } // the end of the range
        due += M.holdEvery(due - start);
        this.holdTimer = setTimeout(tick, Math.max(0, due - performance.now()));
      };
      this.holdTimer = setTimeout(tick, M.HOLD_START);
      return;
    }
    const sl = t.closest('.rsl') as HTMLElement | null;
    if (sl && e.button === 0) {
      e.preventDefault();
      this.drag = e.pointerId;
      this.tr('drag', { v: `start:${e.pointerType}` });
      try { sl.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      this.dragTo(e);
    }
  }
  private move(e: PointerEvent): void { if (this.drag === e.pointerId) this.dragTo(e); }
  private up(e: PointerEvent): void { if (this.drag === e.pointerId) { this.drag = null; this.tr('drag', { v: 'end' }); } }
  private dragTo(e: PointerEvent): void {
    const trk = (this.box.querySelector('.trk') as HTMLElement).getBoundingClientRect();
    this.picked = null;
    this.set(M.sliderTo(this.spot, (e.clientX - trk.left) / Math.max(1, trk.width)), 'drag');
  }
  private stopHold(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
    const was = this.holding;
    this.holding = false;
    this.box?.querySelectorAll('.pm.press').forEach((x) => x.classList.remove('press'));
    if (was) this.update();
  }

  private click(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest('button,[data-x]') as HTMLElement | null;
    if (!b) return;
    const x = b.dataset.x;
    if (b.classList.contains('pm')) {
      // − and + act on pointer down; a click without one is the keyboard (Enter or Space on the button)
      if (e.detail === 0 && !b.classList.contains('dis')) { const dir = x === 'plus' ? 1 : -1; this.set(M.stepTo(this.spot, this.value(), dir), 'step', dir); }
      return;
    }
    if (x === 'cancel') return this.o.close();
    if (x === 'go') return this.commit();
    if (x === 'type') { this.pad = !this.pad; this.tr('pad', { v: this.pad ? 'open' : 'shut' }); this.digits = this.pad ? '' : null; this.update(); return; }
    if (b.dataset.p) { this.picked = b.dataset.p as PresetKey; this.set(Number(b.dataset.to), 'snap'); return; }
    if (b.dataset.k) { this.type(b.dataset.k === '00' ? '00' : b.dataset.k); }
  }

  /** A digit, "00" or delete, from the pad or the keyboard. */
  type(k: string): void {
    const prev = this.value();
    let d = this.digits ?? '';
    for (const c of k === '⌫' || k === 'Backspace' ? [k] : k.split('')) d = M.typeKey(this.spot, d, c);
    this.digits = d;
    this.picked = null;
    this.tr('type', { v: k });
    this.update();
    if (this.value() !== prev) (this.box.querySelector('.rsl') as HTMLElement).classList.remove('snap');
  }

  commit(): void {
    const a = M.actionFor(this.spot, this.value());
    if (!this.traced) { this.traced = true; this.tr('close', { result: 'go', to: this.value(), action: a }); }
    this.o.go(a);
  }

  /** Keys while the raise is open (laptops). Returns true when the key was the raise's. */
  key(e: KeyboardEvent): boolean {
    const s = this.spot;
    const n = e.shiftKey ? 5 : 1;
    switch (e.key) {
      case 'ArrowRight': this.set(M.stepTo(s, this.value(), 1, n), 'step', 1); break;
      case 'ArrowLeft': this.set(M.stepTo(s, this.value(), -1, n), 'step', -1); break;
      case 'ArrowUp': this.picked = null; this.set(M.nextPreset(s, this.value(), 1), 'snap'); break;
      case 'ArrowDown': this.picked = null; this.set(M.nextPreset(s, this.value(), -1), 'snap'); break;
      case 'PageUp': this.set(M.stepTo(s, this.value(), 1, 5), 'step', 1); break;
      case 'PageDown': this.set(M.stepTo(s, this.value(), -1, 5), 'step', -1); break;
      case 'Home': this.picked = 'min'; this.set(s.minTo, 'snap'); break;
      case 'End': this.picked = 'all'; this.set(s.maxTo, 'snap'); break;
      case 'Enter': this.commit(); break;
      case 'Escape': this.o.close(); break;
      case 'Backspace': if (this.digits === null) return true; this.type('Backspace'); break;
      default:
        if (/^\d$/.test(e.key)) { this.type(e.key); break; }
        if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) break; // already open
        return false;
    }
    e.preventDefault();
    return true;
  }

  // ---------------- where it goes ----------------
  private position(): void {
    const pos = this.el.querySelector('.rpos') as HTMLElement;
    const ov = this.o.over.getBoundingClientRect();
    pos.removeAttribute('style');
    if (this.layout === 'land') {
      // over the thumb column, below the hero's cards
      const dock = this.o.stage.querySelector('.tp.live .dock')?.getBoundingClientRect();
      if (!dock) return;
      // the design leaves the top of the hero (cards and name) in view; it starts under the name line
      const nm = this.o.stage.querySelector('.tp.live .dock .hname')?.getBoundingClientRect();
      const t = Math.max(24, Math.min(60, nm ? nm.bottom - dock.top + 6 : 46));
      Object.assign(pos.style, { left: `${dock.left - ov.left}px`, top: `${dock.top - ov.top + t}px`, width: `${dock.width}px`, height: `${dock.height - t}px` });
      this.fit();
    } else if (this.layout === 'lap') {
      const btn = this.o.stage.querySelector('.tp.live .actions .act.raise')?.getBoundingClientRect();
      const u = this.u;
      const W = 470 * u;
      const cx = btn ? btn.left + btn.width / 2 - ov.left : ov.width - 200;
      const right = Math.min(ov.width - 12, Math.max(W + 12, cx + 65 * u));
      const bottom = btn ? ov.height - (btn.top - ov.top) + 14 * u : 140;
      Object.assign(pos.style, { left: `${right - W}px`, bottom: `${bottom}px`, width: `${W}px` });
      const tail = this.box.querySelector('.tail') as HTMLElement | null;
      if (tail) { const r = (right - cx) / u - 9; tail.style.right = `${Math.max(14, Math.min(470 - 32, r))}px`; tail.hidden = !btn; }
    }
  }

  private labelDock(): void {
    const b = this.o.stage.querySelector('.tp.live .actions .act.raise[data-act="raise"]') as HTMLElement | null;
    if (!b) return;
    if (!this.restore || this.restore.el !== b) this.restore = { el: b, html: b.innerHTML };
    const html = `${M.goLabel(this.spot, this.value(), fmt)}<kbd>⏎</kbd>`;
    if (b.innerHTML !== html) b.innerHTML = html;
  }
  private unlabelDock(): void {
    if (this.restore?.el.isConnected) this.restore.el.innerHTML = this.restore.html;
    this.restore = null;
  }

  destroy(): void {
    if (!this.traced) { this.traced = true; this.tr('close', { result: 'cancel', to: this.value() }); }
    this.stopHold();
    this.unlabelDock();
    for (const f of this.off) f();
    this.el.remove();
  }
}
