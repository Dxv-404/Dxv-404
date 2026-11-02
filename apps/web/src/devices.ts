// v3: your account on every device (tools/design/gen/v3devices.py). Profile's "Your devices", "Add a device"
// (a one-time code in a draining ring, or its QR), "Use an account I already have" (six boxes, a number pad
// on phones, keyboard and paste on laptops, or the camera), bringing a device's own crews along, the
// "You're in" screen, and the notice the account's other devices get. On laptops the two code screens are
// dialogs over the screen behind them, as designed.
import { h, toast, ask } from './legacy/ui.js';
import { qrSvg, Scanner } from './legacy/qr.js';
import { settings } from './legacy/fx.js';
import { avatar, THEMES } from './table/render';
import { currentTheme } from './table/screen';
import { FEEL } from './table/motion';
import type { Account, AccountSummary, Device, DeviceKind, DeviceNotice, RedeemResult } from '@tp/account';

type Mod = typeof import('@tp/account');
export interface DevCtx {
  screen(build: (el: HTMLElement) => (() => void) | void): void;
  openSheet(content: HTMLElement, o?: { label?: string; onClose?: () => void; tall?: boolean }): { close(): void };
  home(): void;
  profile(): void;
  account(): Promise<Account>;
  /** the bottom bar, when the screen has one */
  nav?(): HTMLElement | null;
}

let modP: Promise<Mod> | null = null;
const mod = (): Promise<Mod> => (modP ??= import('@tp/account'));

// ---------------------------------------------------------------- small pieces
const SVG = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.4"/><path d="M10.5 18.5h3"/></svg>',
  laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1.6"/><path d="M2 19h20"/></svg>',
  tablet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4.5" y="2.5" width="15" height="19" rx="2"/><path d="M11 18.5h2"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h11v14H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg>',
};
export const deviceIcon = (k: DeviceKind | string): string => SVG[k === 'laptop' || k === 'tablet' ? k : 'phone'];
const ico = (svg: string, cls = 'dv-ic'): HTMLElement => h('i', { class: cls, html: svg, 'aria-hidden': 'true' });

/** The theme's motion feel for these screens: speed and easing, and full / calm / off (Reduce motion = off). */
function motion(el: HTMLElement): void {
  const off = settings.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const f = FEEL[currentTheme()] ?? FEEL.classic!;
  el.dataset.motion = off ? 'off' : settings.motion === 'calm' ? 'calm' : 'full';
  el.style.setProperty('--dv-k', String(f.k));
  el.style.setProperty('--dv-ease', f.ease);
}

/** Laptops and desktops get the dialogs (QR and code side by side); phones and tablets the full screens. */
const bigScreen = (): boolean => matchMedia('(min-width: 900px) and (min-height: 560px)').matches;
async function thisDevice(): Promise<{ kind: DeviceKind; detail: string }> {
  const m = await mod();
  return m.describeDevice(navigator.userAgent, navigator.maxTouchPoints > 0, innerWidth);
}
const kindNow = (): DeviceKind => (bigScreen() && navigator.maxTouchPoints === 0 ? 'laptop' : innerWidth >= 700 ? 'tablet' : 'phone');

function head(title: string, sub: string, back: (() => void) | null): HTMLElement {
  return h('header', { class: 'page-head' },
    back && h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: back }, '‹'),
    h('div', { class: 'dv-ht' }, h('h1', {}, title), sub && h('small', {}, sub)));
}
const myName = (): string => { try { return (JSON.parse(localStorage.getItem('tp-me') || 'null') as { name?: string } | null)?.name || localStorage.getItem('tp-name') || 'Player'; } catch { return 'Player'; } };

/** This device has joined the account: remember who it is now (the menu and offline tables read this). */
function becameAccount(p: { id: string; name: string }): void {
  try {
    localStorage.setItem('tp-name', p.name);
    localStorage.setItem('tp-me', JSON.stringify({ account: p.id, name: p.name }));
    localStorage.removeItem('tp-recovery-code'); // the old account's code, if this device had one
    localStorage.removeItem('tp-crews'); // the menu fetches the account's crews again
  } catch { /* storage blocked */ }
}

let reported: Promise<void> | null = null;
/** Tell the cloud what this device is, once a session (shown in the account's device list). */
export function reportDevice(a: Account): Promise<void> {
  reported ??= thisDevice().then((d) => a.setThisDevice(d.kind, d.detail)).catch(() => { reported = null; });
  return reported;
}

// ---------------------------------------------------------------- Profile: your devices
/** "Your devices", "Add a device" and "Use an account I already have", for the profile screen. */
export function devicesBlock(ctx: DevCtx, a: Account): HTMLElement[] {
  const panel = h('div', { class: 'dv-pnl', style: { gap: '8px' }, 'data-testid': 'devices' }, h('p', { class: 'dv-hint', role: 'status' }, 'Loading…'));
  void drawDevices(ctx, a, panel);
  const add = h('button', { class: 'btn primary dv-hz', 'data-testid': 'add-device', onclick: () => addDevice(ctx) }, ico(SVG.plus), 'Add a device');
  const use = h('button', { class: 'btn secondary', 'data-testid': 'use-account', onclick: () => useAccount(ctx) }, 'Use an account I already have', h('small', {}, 'Sign in with a code from your other device'));
  return [panel, add, use];
}

async function drawDevices(ctx: DevCtx, a: Account, panel: HTMLElement): Promise<void> {
  const m = await mod();
  try {
    await reportDevice(a);
    const list = await a.myDevices();
    const owner = a.profile?.name ?? myName();
    panel.replaceChildren(
      h('div', { class: 'dv-hrow' }, h('span', { class: 'dv-klbl' }, 'Your devices'), h('span', { class: 'dv-sp' }), h('span', { class: 'dv-chipt', 'aria-label': `${list.length} devices` }, String(list.length))),
      ...list.map((d) => {
        const label = m.deviceLabel(d, owner);
        const sub = [d.detail ?? d.kind, d.this_device ? 'now' : m.lastUsed(d.last_seen)].join(' · ');
        return h('div', { class: 'dv-row' + (d.this_device ? ' on' : ''), 'data-testid': d.this_device ? 'device-this' : 'device-other' },
          h('span', { class: 'dv-ico', html: deviceIcon(d.kind) }),
          h('span', { class: 'txt' }, h('b', {}, label), h('small', {}, sub)),
          !d.this_device && h('button', { class: 'mm', 'aria-label': `Options for ${label}`, 'data-testid': 'device-more', html: SVG.more, onclick: () => deviceSheet(ctx, a, d, label, () => drawDevices(ctx, a, panel)) }));
      }),
      ...(list.length > 1 ? [h('p', { class: 'dv-hint', style: { textAlign: 'left' } }, 'Don’t recognise one? Log it out with ⋯.')] : []));
  } catch (err) {
    panel.replaceChildren(h('p', { class: 'dv-hint', role: 'alert' }, navigator.onLine === false ? 'This needs the internet.' : `Could not load your devices: ${(err as Error).message}`),
      h('button', { class: 'btn ghost small', onclick: () => drawDevices(ctx, a, panel) }, 'Try again'));
  }
}

function deviceSheet(ctx: DevCtx, a: Account, d: Device, label: string, redraw: () => void): void {
  const s = ctx.openSheet(h('div', { class: 'menu-actions' },
    h('h2', {}, label), h('p', { class: 'hint' }, d.detail ?? ''),
    h('button', { class: 'btn secondary', 'data-testid': 'device-rename', onclick: async () => {
      const name = await ask('Name this device', { yes: 'Save', input: { value: d.name ?? '', max: 30, placeholder: label } });
      if (name === null || name === undefined) return;
      try { await a.renameDevice(d.device, String(name)); s.close(); toast('Renamed'); redraw(); } catch (err) { toast((err as Error).message); }
    } }, 'Rename'),
    h('button', { class: 'btn danger', 'data-testid': 'device-logout', onclick: async () => {
      if (!(await ask(`Log out ${label}? It stops being your account at once.`, { yes: 'Log out', danger: true }))) return;
      try { await a.logoutPhone(d.device); s.close(); toast(`${label} is logged out`); redraw(); } catch (err) { toast((err as Error).message); }
    } }, 'Log out')), { label });
}

// ---------------------------------------------------------------- Add a device
interface Code { code: string; expiresAt: number }
const digitSpans = (code: string): HTMLElement[] => [...code].flatMap((d, i) => (i === 3 ? [h('i', {}), h('span', { style: { '--i': i } }, d)] : [h('span', { style: { '--i': i } }, d)]));

/** "Add a device": shows a one-time code (and its QR) until another device uses it, it runs out, or you leave. */
export function addDevice(ctx: DevCtx): void {
  if (bigScreen()) return addDeviceDialog(ctx);
  ctx.screen((el) => {
    el.className = 'screen dv dv-add';
    motion(el);
    let mode: 'code' | 'qr' = 'code';
    const s = new CodeSession(ctx, () => draw());
    const seg = h('div', { class: 'seg dv-seg', role: 'radiogroup', 'aria-label': 'Show the code as' });
    const body = h('div', { style: { display: 'contents' } });
    const drawSeg = () => seg.replaceChildren(...(['code', 'qr'] as const).map((k) => h('button', { role: 'radio', 'aria-checked': String(k === mode), class: k === mode ? 'on' : '', 'data-testid': `show-${k}`, onclick: () => { mode = k; drawSeg(); draw(); } }, k === 'code' ? 'Code' : 'QR')));
    drawSeg();
    el.append(head('Add a device', 'Code works for 5 minutes, once', () => { s.stop(); ctx.profile(); }), seg, body);
    function draw(): void {
      const c = s.code;
      if (!c) { body.replaceChildren(h('p', { class: 'dv-hint', role: 'status' }, s.error ?? 'Making a code…'), s.error ? h('button', { class: 'btn primary', onclick: () => s.make() }, 'Try again') : null); return; }
      const nice = s.nice();
      if (mode === 'code') {
        body.replaceChildren(
          h('div', { class: 'dv-codebox' }, h('div', { class: 'dv-ring', 'data-ring': '' }, h('div', { class: 'dv-rin' },
            h('div', { class: 'dv-digits', 'data-testid': 'device-code', 'aria-label': `Code ${[...c.code].join(' ')}` }, ...digitSpans(c.code)),
            h('small', { class: 'dv-left', 'data-left': '', role: 'timer' }, '')))),
          h('div', { class: 'dv-pnl', style: { gap: '9px' } }, h('span', { class: 'dv-klbl' }, 'On your other device'),
            step(1, ['Open Train Poker and tap your name (Profile)']), step(2, ['Tap ', h('b', {}, 'Use an account I already have')]), step(3, ['Type ', h('b', {}, nice), ' and you’re in'])),
          h('div', { class: 'dv-actions' },
            h('button', { class: 'dv-link', 'data-testid': 'new-code', onclick: () => s.make() }, 'Make a new code'),
            h('button', { class: 'dv-link mut', 'data-testid': 'cancel-code', onclick: async () => { await s.cancel(); ctx.profile(); } }, 'Cancel')),
          h('p', { class: 'dv-hint dv-foot' }, 'Only share this code with yourself. Anyone with it can sign in as you for the next 5 minutes.'));
      } else {
        body.replaceChildren(
          qrBox(s.link(), 232),
          h('p', { class: 'dv-hint' }, 'Point the other device’s camera here. On a laptop, show this to its webcam from ', h('b', {}, 'Use an account I already have › Scan'), '.'),
          h('div', { class: 'dv-hrow', style: { justifyContent: 'center' } }, h('span', { class: 'dv-chipt', 'data-testid': 'qr-code-text' }, nice), h('span', { class: 'dv-chipt o', 'data-left': '', role: 'timer' }, '')),
          h('button', { class: 'btn ghost dv-foot', 'data-testid': 'qr-done', onclick: () => { s.stop(); ctx.profile(); } }, 'Done'));
      }
      s.tick();
    }
    draw();
    s.make();
    return () => s.stop();
  });
}

function addDeviceDialog(ctx: DevCtx): void {
  const d = dialog('Add a device', () => s.stop());
  const s = new CodeSession(ctx, () => draw(), () => d.close());
  const body = h('div', {});
  d.box.append(body);
  function draw(): void {
    const c = s.code;
    if (!c) { body.replaceChildren(h('p', { class: 'dv-hint', role: 'status' }, s.error ?? 'Making a code…'), s.error ? h('button', { class: 'btn primary', onclick: () => s.make() }, 'Try again') : null); return; }
    body.replaceChildren(h('div', { class: 'dv-lgrid' },
      qrBox(s.link(), 232),
      h('div', { class: 'dv-lside' },
        h('span', { class: 'dv-klbl' }, 'Or type this code'),
        h('div', { class: 'dv-digits big2', 'data-testid': 'device-code', 'aria-label': `Code ${[...c.code].join(' ')}` }, ...digitSpans(c.code)),
        h('div', { class: 'dv-hrow' }, h('div', { class: 'dv-ring small', 'data-ring': '' }), h('span', { class: 'dv-left', 'data-left': '', 'data-suffix': ' · works once', role: 'timer' }, '')),
        step(1, ['On your phone, open Train Poker › your name']), step(2, ['Use an account I already have']), step(3, ['Scan this QR, or type the code']),
        h('button', { class: 'dv-link', style: { paddingLeft: '0' }, 'data-testid': 'new-code', onclick: () => s.make() }, 'Make a new code'))));
    s.tick();
  }
  draw();
  s.make();
}

const step = (n: number, parts: (string | HTMLElement)[]): HTMLElement => h('div', { class: 'dv-stp' }, h('i', {}, String(n)), h('span', {}, ...parts));
function qrBox(text: string, size: number): HTMLElement {
  const box = h('div', { class: 'dv-qr', style: { '--qs': `${size}px` }, 'data-testid': 'device-qr', 'data-text': text, role: 'img', 'aria-label': 'QR code of the one-time code' }, h('div', { class: 'dv-scanl', 'aria-hidden': 'true' }));
  box.insertAdjacentHTML('beforeend', qrSvg(text, { dark: '#111111', light: '#ffffff' }));
  return box;
}

/** One code on screen: made, counted down, replaced, cancelled; and noticed when another device used it. */
class CodeSession {
  code: Code | null = null;
  error: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private poll: ReturnType<typeof setTimeout> | null = null;
  private known: Set<string> | null = null;
  private stopped = false;
  private a: Account | null = null;
  constructor(private ctx: DevCtx, private redraw: () => void, private closeUi?: () => void) {}

  nice(): string { return this.code ? this.code.code.replace(/^(\d{3})/, '$1 ') : ''; }
  link(): string { return `${location.origin}${location.pathname}#/d/${this.code?.code ?? ''}`; }

  async make(): Promise<void> {
    this.error = null;
    try {
      this.a ??= await this.ctx.account();
      if (!this.known) this.known = new Set((await this.a.myDevices()).map((d) => d.device));
      this.code = await this.a.newDeviceCode();
      // the server's clock may differ from this one: count down the 5 minutes from now
      this.code.expiresAt = Math.min(this.code.expiresAt, Date.now() + 5 * 60_000) || Date.now() + 5 * 60_000;
    } catch (err) { this.code = null; this.error = (err as Error).message; }
    if (this.stopped) return;
    this.redraw();
    this.timer ??= setInterval(() => this.tick(), 250);
    this.watch();
  }

  async cancel(): Promise<void> { this.stop(); try { await this.a?.cancelDeviceCode(); } catch { /* it runs out by itself */ } }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.poll) clearTimeout(this.poll);
    this.timer = this.poll = null;
  }

  /** The ring drains and turns red in the last 30 seconds; at 0 the code is shown as run out. */
  tick(): void {
    if (!this.code) return;
    const left = this.code.expiresAt - Date.now();
    const late = left <= 30_000;
    document.querySelectorAll<HTMLElement>('[data-ring]').forEach((r) => { r.style.setProperty('--p', String(Math.max(0, left / (5 * 60_000)))); r.classList.toggle('late', late); });
    void mod().then((m) => {
      document.querySelectorAll<HTMLElement>('[data-left]').forEach((t) => {
        t.textContent = left > 0 ? `${m.timeLeft(left)} left${t.dataset.suffix ?? ''}` : 'This code ran out';
        t.classList.toggle('late', late);
      });
    });
    document.querySelectorAll('.dv-digits').forEach((d) => d.classList.toggle('gone', left <= 0));
  }

  /** Another device used the code: it is on the list now. Say so and show the list. */
  private watch(): void {
    if (this.poll || this.stopped) return;
    const look = async (): Promise<void> => {
      this.poll = null;
      if (this.stopped || !this.a) return;
      try {
        const list = await this.a.myDevices();
        const fresh = list.find((d) => !this.known!.has(d.device));
        if (fresh) {
          this.stop();
          toast(`Your ${fresh.kind} is signed in`, 4000);
          this.closeUi?.();
          this.ctx.profile();
          return;
        }
      } catch { /* try again */ }
      if (!this.stopped) this.poll = setTimeout(look, 2500);
    };
    this.poll = setTimeout(look, 2500);
  }
}

/** A laptop dialog over the screen behind it (closes with ✕, Escape or a click outside). */
function dialog(title: string, onClose: () => void, narrow = false): { box: HTMLElement; close(): void } {
  const root = document.getElementById('app') ?? document.body;
  const prev = document.activeElement as HTMLElement | null;
  const close = (): void => { wrap.remove(); document.removeEventListener('keydown', key, true); onClose(); prev?.focus?.(); };
  const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const x = h('button', { class: 'ib', 'aria-label': 'Close', 'data-testid': 'dialog-close', onclick: close }, '✕');
  const box = h('div', { class: 'dv-dlg' + (narrow ? ' narrow' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'dv-hrow' }, h('h2', { class: 'lt' }, title), h('span', { class: 'dv-sp' }), x));
  const wrap = h('div', { class: 'dv-dim', onclick: (e: Event) => { if (e.target === wrap) close(); } }, box);
  motion(wrap);
  root.append(wrap);
  document.addEventListener('keydown', key, true);
  requestAnimationFrame(() => (box.querySelector('input') as HTMLElement | null ?? x).focus());
  return { box, close };
}

// ---------------------------------------------------------------- Use an account I already have
/** Six boxes, one digit each: typing moves on, Backspace moves back, Tab works, pasting fills every box. */
function codeBoxes(o: { pad: boolean; onFull(code: string): void; onType(): void }) {
  const wrap = h('div', { class: 'dv-kslots', role: 'group', 'aria-label': 'One-time code', 'data-testid': 'code-boxes' });
  const boxes: HTMLInputElement[] = [];
  let wrong = false;
  for (let i = 0; i < 6; i++) {
    const b = h('input', { type: 'text', inputmode: o.pad ? 'none' : 'numeric', autocomplete: i === 0 ? 'one-time-code' : 'off', maxlength: i === 0 ? 6 : 1, 'aria-label': `Digit ${i + 1} of 6`, 'data-testid': `code-${i}`, spellcheck: 'false' }) as HTMLInputElement;
    boxes.push(b);
    if (i === 3) wrap.append(h('span', { class: 'dash', 'aria-hidden': 'true' }, '–'));
    wrap.append(b);
    b.addEventListener('input', () => {
      const digits = b.value.replace(/\D/g, '');
      if (digits.length > 1) { fill(digits, i); return; }
      b.value = digits;
      if (digits) { boxes[Math.min(5, i + 1)]!.focus(); }
      changed();
    });
    b.addEventListener('beforeinput', () => { if (wrong) clearError(true); });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !b.value && i > 0) { e.preventDefault(); boxes[i - 1]!.value = ''; boxes[i - 1]!.focus(); changed(); }
      else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1]!.focus(); }
      else if (e.key === 'ArrowRight' && i < 5) { e.preventDefault(); boxes[i + 1]!.focus(); }
      else if (/^\d$/.test(e.key) && b.value && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (wrong) clearError(true); typeAt(i, e.key); }
    });
    b.addEventListener('paste', (e) => {
      const t = e.clipboardData?.getData('text') ?? '';
      const digits = t.replace(/\D/g, '');
      if (!digits) return;
      e.preventDefault();
      if (wrong) clearError(true);
      fill(digits, digits.length >= 6 ? 0 : i);
    });
    // a box after an empty one: start at the first empty box
    b.addEventListener('focus', () => b.select());
    // a tap on a box after an empty one starts at the first empty box (Tab still goes anywhere)
    b.addEventListener('pointerdown', (e) => { const first = boxes.findIndex((x) => !x.value); if (first !== -1 && first < i) { e.preventDefault(); boxes[first]!.focus(); } });
  }
  const value = (): string => boxes.map((b) => b.value).join('');
  function changed(): void {
    boxes.forEach((b) => b.classList.toggle('f', !!b.value));
    o.onType();
    if (value().length === 6) o.onFull(value());
  }
  function fill(digits: string, from: number): void {
    for (let k = from; k < 6; k++) boxes[k]!.value = digits[k - from] ?? '';
    boxes[Math.min(5, from + digits.length)]!.focus();
    changed();
  }
  function typeAt(i: number, d: string): void { boxes[i]!.value = d; if (i < 5) boxes[i + 1]!.focus(); changed(); }
  function clearError(empty: boolean): void {
    wrong = false;
    wrap.classList.remove('err', 'shake');
    if (empty) { boxes.forEach((b) => { b.value = ''; b.classList.remove('f'); }); boxes[0]!.focus(); }
  }
  return {
    el: wrap,
    value,
    focus: () => (boxes.find((b) => !b.value) ?? boxes[5]!).focus({ preventScroll: true }),
    set: (code: string) => fill(code.replace(/\D/g, '').slice(0, 6), 0),
    /** the pad: a digit, or Delete */
    press(k: string): void {
      if (wrong) clearError(true);
      const v = value();
      if (k === 'del') { if (v.length) { boxes[v.length - 1]!.value = ''; changed(); } return; }
      if (v.length < 6) typeAt(v.length, k);
    },
    error(shake: boolean): void {
      wrong = true;
      wrap.classList.add('err');
      if (shake) { wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake'); }
    },
    clearError,
    disable(on: boolean): void { boxes.forEach((b) => { b.readOnly = on; }); },
  };
}

/** "Use an account I already have" (or a scanned link, #/d/CODE): this device becomes the account. */
export function useAccount(ctx: DevCtx, prefill?: string): void {
  if (bigScreen()) return useAccountDialog(ctx, prefill);
  ctx.screen((el) => {
    el.className = 'screen dv dv-use';
    motion(el);
    const msg = h('div', { 'aria-live': 'polite' });
    const flow = signInFlow(ctx, msg, false, () => undefined);
    const pad = h('div', { class: 'dv-pad', role: 'group', 'aria-label': 'Number pad' },
      ...'123456789'.split('').map((k) => h('button', { 'data-k': k, 'aria-label': k, onclick: () => flow.boxes.press(k) }, k)),
      h('span', {}), h('button', { 'data-k': '0', 'aria-label': '0', onclick: () => flow.boxes.press('0') }, '0'),
      h('button', { 'data-k': 'del', 'aria-label': 'Delete', html: SVG.del, onclick: () => flow.boxes.press('del') }));
    el.append(head('Use your account', 'Sign in with a one-time code', () => ctx.profile()),
      h('div', { class: 'dv-pnl', style: { gap: '14px' } }, h('div', { class: 'dv-ttl' }, 'Type the 6-digit code'), flow.boxes.el, msg),
      h('button', { class: 'dv-row', 'data-testid': 'scan-qr', onclick: () => flow.scan() }, h('span', { class: 'dv-ico', html: SVG.qr, style: { background: 'none', boxShadow: 'none', width: '24px', color: 'var(--tx)' } }),
        h('span', { class: 'txt' }, h('b', {}, 'Scan the QR instead'), h('small', {}, 'From the other device’s screen')), h('span', { class: 'go', 'aria-hidden': 'true' }, '›')),
      pad);
    // a keyboard works on phones too (and pasting into a box)
    if (prefill) flow.boxes.set(prefill);
    else requestAnimationFrame(() => flow.boxes.focus());
    return () => flow.stop();
  });
}

function useAccountDialog(ctx: DevCtx, prefill?: string): void {
  const msg = h('div', { 'aria-live': 'polite' });
  let flow: ReturnType<typeof signInFlow> | null = null;
  const d = dialog('Use your account', () => flow?.stop(), true);
  flow = signInFlow(ctx, msg, true, () => d.close());
  d.box.append(
    h('p', { class: 'mut' }, 'On your phone: Profile › Add a device. Then type the code here, or hold the phone’s QR up to this camera.'),
    flow.boxes.el, msg,
    h('div', { class: 'dv-two' },
      h('button', { class: 'btn ghost dv-hz', 'data-testid': 'scan-qr', onclick: () => flow!.scan() }, ico(SVG.qr), 'Scan with the camera'),
      h('button', { class: 'btn primary', 'data-testid': 'sign-in', onclick: () => flow!.submit() }, 'Sign in')),
    h('p', { class: 'dv-hint' }, 'Typing works with the keyboard; paste works too. Tab moves between the boxes.'));
  if (prefill) flow.boxes.set(prefill);
  else requestAnimationFrame(() => flow!.boxes.focus());
}

/** The sign-in itself: check the code, ask about this device's own crews if there are any, then "You're in". */
function signInFlow(ctx: DevCtx, msg: HTMLElement, laptop: boolean, closeUi: () => void) {
  let busy = false;
  let stopped = false;
  const hint = (): void => { msg.replaceChildren(h('p', { class: 'dv-hint', style: laptop ? {} : { margin: '0' }, 'data-testid': 'code-msg' }, laptop ? '' : 'On your other device: Profile › Add a device')); };
  const fail = (text: string): void => { msg.replaceChildren(h('p', { class: 'dv-errm', role: 'alert', 'data-testid': 'code-msg' }, text)); };
  const boxes = codeBoxes({ pad: !laptop, onType: () => { if (!busy) hint(); }, onFull: (c) => { void submit(c); } });
  hint();
  async function submit(code = boxes.value(), merge: boolean | null = null): Promise<void> {
    if (busy || stopped) return;
    if (code.length !== 6) { boxes.error(true); fail('The code has 6 digits.'); return; }
    busy = true;
    boxes.disable(true);
    msg.replaceChildren(h('p', { class: 'dv-hint', role: 'status', 'data-testid': 'code-msg', style: laptop ? {} : { margin: '0' } }, 'Checking…'));
    let r: RedeemResult;
    try {
      const a = await ctx.account();
      r = await a.redeemDeviceCode(code, merge, await thisDevice());
    } catch (err) { r = { ok: false, reason: 'error', message: (err as Error).message }; }
    busy = false;
    boxes.disable(false);
    if (stopped) return;
    if (r.ok) {
      becameAccount(r.profile);
      stopped = true;
      closeUi();
      signedIn(ctx, r);
      return;
    }
    if (r.reason === 'ask') {
      hint();
      const bring = await mergeSheet(ctx, r.mine);
      if (bring === null) { msg.replaceChildren(h('p', { class: 'dv-hint', 'data-testid': 'code-msg', style: laptop ? {} : { margin: '0' } }, 'Nothing changed. Type the code again when you are ready.')); return; }
      return submit(code, bring);
    }
    const shake = r.reason !== 'paused' && r.reason !== 'error';
    boxes.error(shake);
    if (navigator.vibrate && shake && settings.motion !== 'off') try { navigator.vibrate(60); } catch { /* not allowed */ }
    if (r.reason === 'wrong') fail(r.triesLeft > 0 ? `That code doesn’t match. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left before a short pause.` : 'That code doesn’t match. Wait a few minutes before you try again.');
    else fail(r.message);
  }
  async function scan(): Promise<void> {
    const text = await scanQr(ctx);
    if (!text) return;
    const m = await mod();
    const code = m.codeFromLink(text);
    if (!code) { fail('That QR is not a Train Poker code.'); return; }
    boxes.set(code);
  }
  return { boxes, submit: () => void submit(), scan: () => void scan(), stop: () => { stopped = true; } };
}

/** "This phone has its own crew": bring it (and its games) along, or leave them behind. Null: closed without choosing. */
function mergeSheet(ctx: DevCtx, mine: AccountSummary): Promise<boolean | null> {
  return new Promise((resolve) => {
    let answered = false;
    const kind = kindNow();
    const n = mine.crews.length;
    const what = n ? `crew${n === 1 ? '' : 's'}` : 'games';
    const done = (v: boolean | null): void => { if (answered) return; answered = true; s.close(); resolve(v); };
    const role = (r: string): string => (r === 'owner' ? 'you’re the leader' : r === 'admin' ? 'you’re an admin' : 'you’re a member');
    const body = h('div', { class: 'dv-merge', 'data-testid': 'merge-sheet' },
      h('h2', {}, `This ${kind} has its own ${what}`),
      h('p', {}, `You played on this ${kind} before as “${mine.name}”. Bring its ${n ? `${what} and games` : 'games'} into your account, or leave them behind?`),
      ...mine.crews.slice(0, 4).map((c) => h('div', { class: 'dv-row' }, emblem(c.name, c.color),
        h('span', { class: 'txt' }, h('b', {}, c.name), h('small', {}, `${c.members} member${c.members === 1 ? '' : 's'} · ${role(c.role)} · ${c.games} game${c.games === 1 ? '' : 's'}`)))),
      !n && h('div', { class: 'dv-row' }, h('span', { class: 'txt' }, h('b', {}, `${mine.games} game${mine.games === 1 ? '' : 's'}`), h('small', {}, 'Your results and replays from this device'))),
      h('button', { class: 'btn primary', 'data-testid': 'merge-bring', onclick: () => done(true) }, 'Bring them over', h('small', {}, 'Recommended: nothing is lost')),
      h('button', { class: 'btn ghost', 'data-testid': 'merge-leave', onclick: () => done(false) }, 'Leave them behind'));
    const s = ctx.openSheet(body, { label: `This ${kind} has its own ${what}`, onClose: () => { if (!answered) { answered = true; resolve(null); } } });
  });
}

function emblem(name: string, color: string): HTMLElement {
  const short = name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || name.slice(0, 2).toUpperCase();
  const d = 'M24 3 L42 13.5 V34.5 L24 45 L6 34.5 V13.5 Z';
  return h('span', { class: 'dv-emb', 'aria-hidden': 'true', html: `<svg viewBox="0 0 48 48"><path d="${d}" fill="${/^#[0-9a-f]{6}$/i.test(color) ? color : '#2f6fd6'}"/><path d="${d}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.2" transform="translate(4.8 4.8) scale(.8)"/></svg><b>${short.replace(/[<>&"]/g, '')}</b>` });
}

/** Scan a QR with the camera; resolves the text, or null if closed. */
function scanQr(ctx: DevCtx): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const video = h('video', { playsinline: '', muted: '' }) as HTMLVideoElement;
    const note = h('p', { class: 'hint', role: 'status' }, 'Starting the camera…');
    const scanner = new Scanner(video);
    const finish = (v: string | null): void => { if (done) return; done = true; scanner.stop(); s.close(); resolve(v); };
    const s = ctx.openSheet(h('div', { class: 'menu-actions' }, h('h2', {}, 'Scan the QR'), h('div', { class: 'dv-cam' }, video), note,
      h('p', { class: 'hint' }, 'On your other device: Profile › Add a device › QR.')), { label: 'Scan the QR', onClose: () => { if (!done) { done = true; scanner.stop(); resolve(null); } } });
    void mod().then((m) => scanner.start((t: string) => finish(t), (t: string) => m.codeFromLink(t) !== null)
      .then(() => { note.textContent = 'Hold the QR inside the square.'; })
      .catch(() => { note.textContent = 'The camera is not available. Type the code instead.'; }));
  });
}

// ---------------------------------------------------------------- You're in
function signedIn(ctx: DevCtx, r: Extract<RedeemResult, { ok: true }>): void {
  const kind = kindNow();
  const th = THEMES[currentTheme()] ?? THEMES.classic!;
  ctx.screen((el) => {
    el.className = 'screen dv dv-done';
    el.dataset.testid = 'signed-in';
    motion(el);
    const stat = (n: number, what: string): HTMLElement => h('div', { class: 'dv-stat' }, h('b', {}, String(n)), h('small', {}, what));
    el.append(head('You’re in', '', null),
      h('div', { class: 'dv-linkart', 'aria-hidden': 'true' }, h('span', { class: 'd1', html: deviceIcon(r.from ?? 'laptop') }), h('span', { class: 'dv-wire' }, h('i', {}), h('i', {}), h('i', {})), h('span', { class: 'd2', html: deviceIcon(kind) })),
      h('div', { class: 'dv-pcard' }, h('span', { class: 'av', style: { '--av': '70px' }, html: avatar(th, r.profile.id, r.profile.name) }),
        h('b', { 'data-testid': 'welcome' }, `Welcome back, ${r.profile.name}`), h('span', { class: 'mut' }, `This ${kind} is now your account too`)),
      h('div', { class: 'dv-three', 'data-testid': 'moved' }, stat(r.moved.crews, r.moved.crews === 1 ? 'crew' : 'crews'), stat(r.moved.games, r.moved.games === 1 ? 'game' : 'games'), stat(r.moved.trophies, r.moved.trophies === 1 ? 'trophy' : 'trophies')),
      h('div', { class: 'dv-pnl', style: { gap: '6px', fontSize: '12.5px', lineHeight: '1.5' } }, h('span', { class: 'dv-klbl' }, 'What moved with you'),
        h('span', {}, 'Your name and picture, your crews, your league places, your games and replays.')),
      h('button', { class: 'btn primary dv-foot', 'data-testid': 'go-menu', onclick: () => ctx.home() }, 'Go to the menu'));
    toast(r.from ? `Signed in. Your ${r.from} got a notice too.` : 'Signed in.', 4000);
  });
}

// ---------------------------------------------------------------- notices on the other devices
/** Draws "Signed in on a new laptop · Not me? Log it out" for each new sign-in this device has not seen. */
export async function drawDeviceNotices(a: Account, box: HTMLElement, after?: () => void): Promise<void> {
  let list: DeviceNotice[] = [];
  try { list = (await a.deviceNotices()).filter((n) => n.still_signed_in); } catch { return; }
  const m = await mod();
  box.replaceChildren(...list.map((n) => {
    const card = h('section', { class: 'block dv-alert', role: 'alert', 'data-testid': 'device-notice' },
      h('h2', {}, `Signed in on a new ${n.kind}`),
      h('p', { class: 'hint' }, `${n.detail ? `${n.detail} · ` : ''}${m.lastUsed(n.at)}. If that wasn’t you, log it out: it stops being your account at once.`),
      h('div', { class: 'two' },
        h('button', { class: 'btn danger', 'data-testid': 'notice-not-me', onclick: async () => {
          try { await a.logoutPhone(n.device); await a.dismissDeviceNotice(n.id); toast(`The new ${n.kind} is logged out`); card.remove(); after?.(); } catch (err) { toast((err as Error).message); }
        } }, 'Not me? Log it out'),
        h('button', { class: 'btn ghost', 'data-testid': 'notice-ok', onclick: async () => { card.remove(); try { await a.dismissDeviceNotice(n.id); } catch { /* shown again next time */ } } }, 'That was me')));
    return card;
  }));
}

/** On opening the app (the menu): a new sign-in on another device shows as a notice at the top, once. */
export async function checkDeviceNotices(ctx: DevCtx): Promise<void> {
  try {
    const me = JSON.parse(localStorage.getItem('tp-me') || 'null') as { account?: string; name?: string } | null;
    if (!me?.account || navigator.onLine === false || document.querySelector('.dv-notice')) return;
    const a = await ctx.account();
    if (!(await a.hasLogin())) return;
    if (!a.profile) await a.start(me.name || 'Player');
    void reportDevice(a);
    const box = h('div', {});
    await drawDeviceNotices(a, box);
    const card = box.firstElementChild as HTMLElement | null;
    if (!card || document.body.dataset.playing) return;
    const wrap = h('div', { class: 'dv-notice', 'data-testid': 'device-notice-top' });
    motion(wrap);
    // the same card, in the notice's own frame (the buttons close it)
    const t = card.querySelector('h2')!, p = card.querySelector('p')!, btns = card.querySelector('.two')!;
    wrap.append(h('b', {}, t.textContent), p, btns);
    btns.classList.replace('two', 'dv-two');
    btns.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setTimeout(() => wrap.remove(), 0)));
    (document.getElementById('app') ?? document.body).append(wrap);
    // it belongs to the menu: going to another screen puts it away (it shows again in Profile until answered)
    const view = document.getElementById('view');
    if (view) { const mo = new MutationObserver(() => { wrap.remove(); mo.disconnect(); }); mo.observe(view, { childList: true }); }
  } catch { /* offline or not signed in: nothing to show */ }
}

/** #/d/482913 (a scanned QR or a shared link) opens "Use your account" with the code filled in. */
export function routeDevice(ctx: DevCtx): boolean {
  const m = /^#\/d\/(\d{6})$/.exec(location.hash);
  if (!m) return false;
  history.replaceState(null, '', location.pathname);
  useAccount(ctx, m[1]);
  return true;
}
