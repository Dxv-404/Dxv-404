// The live table screen: draws the table in the chosen theme (render.ts), and turns taps, holds and keys
// into actions. Used for online tables and offline (host app) tables alike.
import type { Action, GameEvent } from '@tp/engine';
import type { ScreenView } from '../net-table';
import { fitPill } from './pill';
import { renderTable, sprite, fmt, winnerCardHtml, THEME_KEYS, THEMES, type ThemeKey, type Frame } from './render';
import { sfx, buzz, settings } from '../legacy/fx.js';
import { ask } from '../legacy/ui.js';
import { FEEL, Motion, type MotionLevel } from './motion';
import { chances, summarize, type ResStage, type Summary } from './results';
import { RUNOUT_FIRST_MS, RUNOUT_STREET_MS, resultsPauseMs, runoutStreets } from '@tp/table';
import { presenceCss, bannerHtml, pauseHtml, backHtml, tickClock } from './presence';
import { playTier, winValues, bustValues, tierFor, categoryOf, type Playing } from './tiers';
import { RaiseSheet } from './raise';
import { RebuyUi } from './rebuys';

export interface TableLike {
  view: ScreenView | null;
  subscribe(fn: (events: GameEvent[], v: ScreenView) => void): () => void;
  act(a: Action): void; show(): void; rebuy(): void; sitOut(out: boolean): void; dealNow(): void; vote(yes: boolean): void;
}

const store = {
  get: (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* blocked */ } },
};
export const currentTheme = (): ThemeKey => { const t = store.get('tp-theme'); return (THEME_KEYS as readonly string[]).includes(t ?? '') ? (t as ThemeKey) : 'classic'; };
export function setTheme(k: ThemeKey): void {
  store.set('tp-theme', k);
  let link = document.getElementById('tp-theme-css') as HTMLLinkElement | null;
  if (!link) { link = document.createElement('link'); link.id = 'tp-theme-css'; link.rel = 'stylesheet'; document.head.append(link); }
  link.href = `/tp/${THEMES[k]!.css}`;
  window.dispatchEvent(new Event('tp-theme'));
}
export function loadDesignCss(): void {
  for (const [id, href] of [['tp-fonts', '/tp/fonts.css'], ['tp-base', '/tp/base2.css']] as const) {
    if (document.getElementById(id)) continue;
    const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = href; document.head.append(l);
  }
  setTheme(currentTheme());
}

const SAY: Record<string, string> = { fold: 'folds', check: 'checks', call: 'calls', bet: 'bets', raise: 'raises to', allin: 'is all-in' };
const reduceMotion = (): boolean => settings.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionLevel = (): MotionLevel => (reduceMotion() ? 'off' : settings.motion === 'calm' ? 'calm' : 'full');

export class TableScreen {
  private root: HTMLElement;
  private view: ScreenView | null = null;
  private peek = false;
  private bubble: string | null = null;
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private net: 'good' | 'weak' | 'lost' = 'good';
  private frame: Frame | null = null;
  private raise: RaiseSheet | null = null;
  private off: (() => void)[] = [];
  private tick: ReturnType<typeof setInterval>;
  private lastTurnFor = '';
  private overlay: HTMLElement;
  private stage: HTMLElement;
  private motion: Motion;
  /** the win scene on screen (it gives way when it is my turn), and a counter that cancels a queued bust-out */
  private playing: Playing | null = null;
  private fxGen = 0;
  /** the step after a hand that is on screen (results.ts), a counter that cancels it, and what a tap does now */
  private res: ResStage | null = null;
  private resGen = 0;
  private resSkip: (() => void) | null = null;
  private barSec: number | null = null;

  /** rebuys: the bust-out sheets, the chips pouring in after a rebuy (rebuys.ts) */
  private rb: RebuyUi;
  /** the bust the sheet was shown for (rebuys used at the time), one waiting for the bust-out scene, and where I went out */
  private bustKey: string | null = null;
  private bustWaiting: string | null = null;
  private bustAt: { handNo: number; place: number; of: number } | null = null;
  private bustTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(root: HTMLElement, private t: TableLike, private o: { code: string; menu(): void; info(): void; offline?: boolean; leave?: (() => void) | null }) {
    this.root = root;
    loadDesignCss();
    root.className = 'screen tp-screen';
    root.replaceChildren();
    root.insertAdjacentHTML('afterbegin', `<div class="tp-sprite">${sprite(currentTheme())}</div>`);
    this.stage = document.createElement('div'); this.stage.className = 'tp-stage';
    this.overlay = document.createElement('div'); this.overlay.className = 'tp-over';
    root.append(this.stage, this.overlay);
    this.motion = new Motion(this.stage);
    this.rb = new RebuyUi({ over: this.overlay, stage: this.stage, theme: currentTheme, level: motionLevel, rebuy: () => this.t.rebuy(), leave: o.leave ?? null, offline: !!o.offline });
    this.off.push(t.subscribe((ev, v) => this.update(ev, v)));
    if (t.view) this.update([], t.view);
    const onResize = () => { this.draw(); if (this.raise && this.frame) this.raise.place(this.frame); };
    const onTheme = () => { (root.querySelector('.tp-sprite') as HTMLElement).innerHTML = sprite(currentTheme()); this.draw(); };
    window.addEventListener('resize', onResize);
    window.addEventListener('tp-theme', onTheme);
    this.off.push(() => { window.removeEventListener('resize', onResize); window.removeEventListener('tp-theme', onTheme); });
    // hold to look; buttons
    const down = (e: PointerEvent) => {
      // key hints are for keyboards: a touch hides them again (phones never see them)
      if (e.pointerType === 'touch') root.classList.remove('kb');
      // tap anywhere after a hand: on to the next step (the scene and the winner card handle their own taps)
      const t = e.target as HTMLElement;
      if (this.res?.skip && !t.closest('[data-act], .tpw-wrap, .tp-wcard, .tp-raise, .tp-intro, .pz-toast')) { this.skipStep(); return; }
      const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (el?.dataset.act === 'peek') { this.peek = true; this.draw(); e.preventDefault(); }
    };
    const up = () => { if (this.peek) { this.peek = false; this.draw(); } };
    const click = (e: Event) => {
      const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (el && el.dataset.act !== 'peek') this.press(el.dataset.act!);
    };
    root.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    root.addEventListener('click', click);
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      root.classList.add('kb'); // a keyboard is in use: show the key hints
      if (this.raise?.key(e)) return;
      if (e.code === 'Space' && this.res?.skip) { this.skipStep(); e.preventDefault(); return; }
      if (e.code === 'Space') { if (!this.peek) { this.peek = true; this.draw(); } e.preventDefault(); return; }
      const k = e.key.toLowerCase();
      if (k === 'f') this.press('fold');
      else if (k === 'c') this.press(this.view?.legal?.canCheck ? 'check' : 'call');
      else if (k === 'r') this.press('raise');
      else if (/^\d$/.test(k) && this.myTurnToRaise()) { this.press('raise'); this.raise?.key(e); }
    };
    const keyUp = (e: KeyboardEvent) => { if (e.code === 'Space') up(); };
    window.addEventListener('keydown', key); window.addEventListener('keyup', keyUp);
    this.off.push(() => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('keydown', key); window.removeEventListener('keyup', keyUp); });
    // the turn timer counts down without a message from the server
    this.tick = setInterval(() => {
      if (this.view?.hand?.toAct && this.view.turnTotal) { this.view.turnLeft = Math.max(0, this.view.turnLeft - 250); this.drawTimer(); }
      // the next-hand bar counts down: the table is drawn again only when its number changes
      const n = this.res?.next;
      const sec = n ? Math.ceil((n.at - performance.now()) / 1000) : null;
      if (n && sec !== this.barSec) { this.barSec = sec; this.draw(); }
    }, 250);
    this.maybeIntro();
  }

  setConnection(s: 'good' | 'weak' | 'lost'): void { if (s !== this.net) { this.net = s; this.draw(); this.presence(); } }

  say(text: string): void {
    this.bubble = text;
    this.announce(text);
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => { this.bubble = null; this.draw(); }, 3600);
  }

  /** For screen readers (the bubble is drawn only where the theme has a dealer). */
  private announce(text: string): void {
    let live = this.overlay.querySelector('.tp-sr') as HTMLElement | null;
    if (!live) { live = document.createElement('div'); live.className = 'tp-sr'; live.setAttribute('aria-live', 'polite'); this.overlay.append(live); }
    live.textContent = text;
  }

  update(events: GameEvent[], v: ScreenView): void {
    const prev = this.view;
    this.view = v;
    // the table's micro-animations: whatever is still moving jumps to its end, and what is about to
    // disappear (bets, folded cards) is noted so it can move away after the redraw
    const snap = events.length ? this.motion.before(events) : null;
    const name = (pid: string | null | undefined) => v.players.find((p) => p.id === pid)?.name ?? 'Someone';
    this.checkBust(events, v, true);
    for (const e of events) {
      if (e.t === 'handStart') { this.endResults(); this.say(`Hand ${e.handNo}. Cards coming.`); sfx.card(); }
      else if (e.t === 'act') { this.say(`${name(e.pid)} ${SAY[e.a] ?? e.a}${e.a === 'raise' || e.a === 'bet' ? ` ${fmt(e.to ?? e.amount ?? 0)}` : e.a === 'call' && e.amount ? ` ${fmt(e.amount)}` : ''}.`); if (e.a !== 'fold' && e.a !== 'check') sfx.chip?.(1); }
      else if (e.t === 'street') { this.say(e.street === 'flop' ? 'The flop.' : e.street === 'turn' ? 'The turn.' : 'The river.'); sfx.card(); }
      else if (e.t === 'win') { this.win(e, v, events); }
      else if (e.t === 'presence' && e.pid !== v.me) this.say(`${name(e.pid)} ${e.connected ? 'is back' : 'lost connection'}.`);
      else if (e.t === 'paused') this.say(e.paused ? 'Dealing is paused.' : 'Dealing again.');
      else if (e.t === 'level') this.say(`Blinds up: ${fmt(e.level.sb)} / ${fmt(e.level.bb)}.`);
      else if (e.t === 'rebuy') { if (e.pid === v.me) this.rebought = e.amount; else this.say(`${name(e.pid)} rebuys for ${fmt(e.amount)}.`); sfx.chip?.(3); }
    }
    // my turn: a buzz once per turn
    const turnKey = v.hand?.toAct === v.me && v.me ? `${v.handNo}:${v.hand?.street}:${v.hand?.currentBet}` : '';
    const myTurn = !!turnKey && turnKey !== this.lastTurnFor;
    if (myTurn) { buzz?.([30, 40, 30]); sfx.turn?.(); this.announce('Your turn.'); this.fxGen++; this.playing?.stop(); this.endResults(); }
    this.lastTurnFor = turnKey;
    if (prev?.hand?.toAct === v.me && v.hand?.toAct !== v.me) this.closeRaise();
    this.draw();
    // after a showdown the pot goes to the winner when the winner is shown (results steps), not before
    const moves = events.filter((x) => !(x.t === 'win' && x.results.showdown));
    if (moves.length || myTurn) this.motion.play(moves, prev, v, snap, motionLevel(), myTurn);
    if (this.rebought !== null) { const a = this.rebought; this.rebought = null; this.rb.rebought(v, a); }
    this.checkBust(events, v, false);
    this.presence();
  }

  private rebought: number | null = null;

  // ---------------- bust-out ----------------
  /** Out of chips: the bust-out sheet, once per bust, after the bust-out scene when one plays. */
  private checkBust(events: GameEvent[], v: ScreenView, before: boolean): void {
    const me = v.players.find((p) => p.id === v.me);
    if (!me || me.stack > 0 || !me.busted || v.phase === 'ended') { if (!before) { this.bustWaiting = null; this.rb.update(v); } return; }
    const key = `${v.gameId}:${me.rebuysUsed}`;
    if (this.bustKey === key) { if (!before) this.rb.update(v); return; }
    if (before) {
      // noted before the events play: the win and bust-out scenes go first, and their end offers the sheet
      if (this.bustWaiting !== key) this.bustAt = { handNo: v.handNo, place: v.players.filter((p) => p.stack > 0).length + 1, of: v.players.length };
      if (events.some((e) => e.t === 'win')) {
        this.bustWaiting = key;
        if (this.bustTimer) clearTimeout(this.bustTimer);
        this.bustTimer = setTimeout(() => this.offerBust(), 20_000); // in case a scene never ends
      }
      return;
    }
    if (this.bustWaiting === key) return;
    this.offerBust();
  }
  private offerBust(): void {
    if (this.bustTimer) { clearTimeout(this.bustTimer); this.bustTimer = null; }
    const v = this.view;
    const me = v?.players.find((p) => p.id === v.me);
    this.bustWaiting = null;
    if (!v || !me || me.stack > 0 || v.phase === 'ended') return;
    this.bustKey = `${v.gameId}:${me.rebuysUsed}`;
    this.rb.offer(v, this.bustAt ?? { handNo: v.handNo, place: v.players.filter((p) => p.stack > 0).length + 1, of: v.players.length });
  }
  /** The bust-out entry point: the scenes are over (or were skipped). */
  private afterBustScene(): void { if (this.bustWaiting) this.offerBust(); }

  private draw(): void {
    const v = this.view;
    if (!v) { this.stage.innerHTML = '<div class="tp-wait" role="status">Connecting…</div>'; return; }
    this.stage.dataset.res = v.hand?.results ? (this.res?.step ?? 'end') : ''; // the step after a hand (for the checks)
    const W = this.root.clientWidth || window.innerWidth, H = this.root.clientHeight || window.innerHeight;
    const frame = renderTable(v, currentTheme(), W, H, { peek: this.peek || !settings.holdToPeek, bubble: this.bubble, code: this.o.code, net: this.net, res: v.hand?.results ? this.res : null });
    if (frame.html === this.frame?.html) return; // nothing changed on screen
    try { this.drawParts(frame); } finally { this.drainBar(); }
    // the result pill clear of the seats and their cards (again once the theme's fonts are in: its size changes)
    const tp = this.stage.firstElementChild as HTMLElement | null;
    fitPill(tp);
    if (tp?.querySelector('.wpill') && document.fonts.status !== 'loaded') void document.fonts.ready.then(() => { if (this.stage.firstElementChild === tp) fitPill(tp); });
  }

  /** The next-hand bar drains from where it is now to the deal (a still bar when motion is off). */
  private drainBar(): void {
    const i = this.stage.querySelector('.act.nxt i') as HTMLElement | null;
    const n = this.res?.next;
    if (!i || !n || i.dataset.on) return;
    i.dataset.on = '1';
    const left = Math.max(0, n.at - performance.now());
    i.style.transform = `scaleX(${(left / n.total).toFixed(4)})`;
    if (!reduceMotion()) i.animate([{ transform: `scaleX(${(left / n.total).toFixed(4)})` }, { transform: 'scaleX(0)' }], { duration: left, easing: 'linear', fill: 'forwards' });
  }

  /** The steps after a hand are over (a new hand, or my turn cuts in). */
  private endResults(): void {
    this.resGen++;
    this.resSkip = null;
    this.overlay.querySelector('.tp-wcard')?.remove();
    if (this.res) { this.res = null; }
  }

  private drawParts(frame: Frame): void {
    const prev = this.frame;
    this.frame = frame;
    if (prev && prev.shell === frame.shell && this.stage.firstElementChild) {
      // the same table: swap only the parts that changed (the background and the art stay put)
      for (const [k, html] of Object.entries(frame.parts)) {
        if (prev.parts[k] === html) continue;
        const el = this.stage.querySelector(`.tpd[data-k="${k}"]`);
        if (!el) continue;
        // board cards already on the table must not play their deal-in again when the felt is redrawn
        // (the best five's lift after a hand does play)
        const shown = k === 'felt' ? el.querySelectorAll('.board .cd').length : 0;
        el.innerHTML = html;
        if (shown) el.querySelectorAll('.board .cd').forEach((c, i) => { if (i < shown) for (const a of c.getAnimations()) if ((a as CSSAnimation).animationName === 'dealIn') a.finish(); });
      }
      this.motion.reattach(); // moves on swapped elements carry on, on the new ones
      return;
    }
    this.motion.reset();
    this.stage.innerHTML = frame.html;
    const tp = this.stage.firstElementChild as HTMLElement;
    if (reduceMotion()) tp.classList.add('still');
    else if (settings.motion === 'calm') tp.classList.add('calm');
    tp.classList.toggle('four', !!settings.fourColor);
    tp.classList.toggle('bigtext', !!settings.largeText);
  }

  private drawTimer(): void {
    const v = this.view;
    const el = this.stage.querySelector('.tbank .rg') as HTMLElement | null;
    if (!v || !el || !v.turnTotal) return;
    el.style.background = `conic-gradient(var(--acc) ${Math.round((100 * v.turnLeft) / v.turnTotal)}%,var(--line) 0)`;
    el.querySelector('span')!.textContent = String(Math.ceil(v.turnLeft / 1000));
  }

  private press(act: string): void {
    const v = this.view;
    const L = v?.legal;
    switch (act) {
      case 'menu': return this.o.menu();
      case 'info': return this.o.info();
      case 'fold': this.closeRaise(); if (L && v?.hand?.toAct === v.me) { if (L.canCheck) { void ask('You can check for free. Fold anyway?', { yes: 'Fold', no: 'Keep my cards', danger: true }).then((ok) => { if (ok) this.t.act({ type: 'fold' }); }); return; } this.t.act({ type: 'fold' }); } return;
      case 'check': if (L?.canCheck) { this.closeRaise(); this.t.act({ type: 'check' }); } return;
      case 'call': if (L?.canCall) { this.closeRaise(); this.t.act({ type: 'call' }); } return;
      case 'allin': this.t.act({ type: 'allin' }); return;
      case 'raise': if (this.raise) this.raise.commit(); else if (this.myTurnToRaise()) this.openRaise(); return;
      case 'show': return this.t.show();
      case 'rebuy': return this.t.rebuy();
      case 'bust': return this.offerBust();
      case 'sitin': return this.t.sitOut(false);
      case 'deal': return this.t.dealNow();
      case 'twice': return this.t.vote(true);
      case 'once': return this.t.vote(false);
      case 'skip': this.skipStep(); return;
    }
  }

  // ---------------- raise ----------------
  private myTurnToRaise(): boolean { const v = this.view; return !!(v?.legal?.canRaise && v.hand?.toAct === v.me && v.me); }
  /** The raise sheet (raise.ts): its amounts are the engine's legal limits, so what it sends is accepted as it is. */
  private openRaise(): void {
    const v = this.view!, L = v.legal!;
    if (!this.frame) return;
    this.closeRaise();
    this.raise = new RaiseSheet({
      spot: { minTo: L.minTo, maxTo: L.maxTo, currentBet: L.currentBet, toCall: L.toCall, pot: L.pot, bb: v.level.bb, isBet: L.isBet },
      theme: currentTheme(), level: motionLevel(), over: this.overlay, stage: this.stage,
      go: (a) => { this.closeRaise(); this.t.act(a); },
      close: () => this.closeRaise(),
    }, this.frame);
  }
  private closeRaise(): void {
    if (!this.raise) return;
    const r = this.raise; this.raise = null; r.destroy();
    if (this.root.classList.contains('kb')) (this.stage.querySelector('.tp.live .act.raise') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  // ---------------- wins ----------------
  /** The winner card sits above your hand and the buttons (phone), or low over the table (sideways, laptop). */
  private placeWinnerCard(card: HTMLElement): void {
    const r = this.root.getBoundingClientRect();
    const hero = this.stage.querySelector('.tp.live .hero')?.getBoundingClientRect();
    const arena = this.stage.querySelector('.tp.live .arena')?.getBoundingClientRect();
    const mode = this.frame?.mode ?? 'phone';
    const W = r.width, H = r.height;
    const w = Math.min(mode === 'phone' ? 370 : 420, W - 20);
    let left = (W - w) / 2, bottom: number;
    if (mode === 'phone') bottom = hero ? Math.max(10, r.bottom - hero.top + 8) : 84;
    else {
      const a = arena ?? r;
      left = Math.max(10, a.left - r.left + (a.width - w) / 2);
      bottom = Math.max(10, r.bottom - a.bottom + 10);
    }
    Object.assign(card.style, { left: `${left.toFixed(0)}px`, width: `${w.toFixed(0)}px`, bottom: `${bottom.toFixed(0)}px` });
    // never taller than the screen: a short screen (a phone held sideways) shrinks the card to fit
    const h = card.getBoundingClientRect().height;
    const room = H - bottom - 10;
    if (h > room && h > 0) { card.style.transformOrigin = '50% 100%'; card.style.scale = String(Math.max(0.5, room / h).toFixed(3)); }
  }

  /** The winner card over the win scene: it rises in at 1 s and goes with the scene (a tap on it skips both). */
  private async winnerCard(playing: Playing, v: ScreenView, sum: Summary, tier: number): Promise<void> {
    this.playing = playing;
    this.overlay.querySelector('.tp-wcard')?.remove();
    this.overlay.insertAdjacentHTML('beforeend', winnerCardHtml(v, currentTheme(), sum, tier, this.frame?.mode ?? 'phone'));
    const card = this.overlay.lastElementChild as HTMLElement;
    const feel = FEEL[currentTheme()] ?? FEEL.classic!;
    card.style.setProperty('--rk', String(feel.k));
    card.style.setProperty('--re', feel.ease);
    if (settings.motion === 'calm') card.classList.add('calm');
    this.placeWinnerCard(card);
    card.addEventListener('pointerdown', (ev) => { ev.preventDefault(); playing.stop(); });
    const skip = () => playing.stop();
    this.resSkip = skip;
    await playing.done;
    card.remove();
    if (this.resSkip === skip) this.resSkip = null;
  }

  /** Tap anywhere (or Space) during the steps after a hand: on to the next step. */
  private skipStep(): boolean {
    if (!this.res?.skip) return false;
    const f = this.resSkip;
    if (!f) return false;
    this.resSkip = null;
    f();
    return true;
  }

  private win(e: Extract<GameEvent, { t: 'win' }>, v: ScreenView, events: GameEvent[]): void {
    const pots = e.results.pots;
    const total = pots.reduce((a, p) => a + p.amount, 0);
    const mine = pots.flatMap((p) => p.awards).filter((a) => a.pid === v.me).reduce((s, a) => s + a.amount, 0);
    const ids = [...new Set(pots.flatMap((p) => p.awards.map((a) => a.pid)))];
    const names = ids.map((id) => v.players.find((x) => x.id === id)?.name ?? 'Someone');
    // a split pot: everyone who won is named, the best hand shown
    const best = pots.map((p) => p.hand).filter((h) => !!h).sort((a, b) => b!.score - a!.score)[0] ?? null;
    const line = `${names.join(' and ')} win${names.length === 1 ? 's' : ''} ${fmt(total)}${best ? ` with ${best.desc.toLowerCase()}` : ''}.`;
    // everyone folded: said at once; a showdown: when the winner is shown (not while the board still runs out)
    let said = false;
    const announce = () => { if (said) return; said = true; this.say(line); sfx.win?.(); };
    if (!e.results.showdown) announce();
    // the tier comes from the hand: 4 straight flush and royal, 3 full house and quads, 2 trips to flush, 1 the rest
    const cat = e.results.showdown && best ? categoryOf(best.name) : -1;
    const tier = tierFor(cat);
    if (mine && tier >= 3) buzz?.([60, 40, 60, 40, 120]);
    // anyone left with no chips after this hand goes out (the busted player first if it is me)
    const out = v.players.filter((p) => p.stack === 0 && !ids.includes(p.id) && !!v.hand?.ps[p.id]).sort((a, b) => Number(b.id === v.me) - Number(a.id === v.me))[0];
    const fx = settings.winFx as string;
    // motion off (or the phone's Reduce motion): no scene; the reveal still happens, without movement
    const showWin = e.results.showdown && fx !== 'off' && !(fx === 'big' && tier < 3) && !reduceMotion();
    const showBust = !!out && fx !== 'off' && (fx === 'all' || out.id === v.me);
    const gen = ++this.fxGen;
    this.playing?.stop();
    const base = () => ({ over: this.overlay, table: this.stage.firstElementChild as HTMLElement | null, theme: currentTheme(), still: reduceMotion(), calm: settings.motion === 'calm' });
    // the steps after the hand (results.ts), timed to end when the server deals the next hand
    const R = e.results;
    const streetEv = events.filter((x): x is Extract<GameEvent, { t: 'street' }> => x.t === 'street' && x.board !== 2);
    const streets = runoutStreets(events, !!v.hand?.runout);
    const pause = resultsPauseMs(R, streets);
    const next = { at: performance.now() + pause, total: pause };
    const rgen = ++this.resGen;
    const alive = () => rgen === this.resGen && gen === this.fxGen;
    const set = (st: ResStage): boolean => { if (!alive()) return false; this.res = { ...st, next }; this.draw(); return true; };
    const wait = (ms: number) => new Promise<void>((resolve) => {
      const done = () => { clearTimeout(t); if (this.resSkip === done) this.resSkip = null; resolve(); };
      const t = setTimeout(done, ms);
      this.resSkip = done;
    });
    const nameOf = (pid: string) => v.players.find((x) => x.id === pid)?.name ?? 'Someone';
    const sum = summarize(R, nameOf);
    void (async () => {
      if (!R.showdown) set({ step: 'fold' });
      else {
        if (streets && v.hand) {
          // all-in before the river: the hands stay up with their chances, then the rest of the board comes slowly
          const dealt = streetEv.flatMap((x) => x.cards);
          let board = v.hand.board.slice(0, Math.max(0, v.hand.board.length - dealt.length));
          const hands = Object.fromEntries(Object.keys(R.evals).map((pid) => [pid, v.hand!.ps[pid]?.cards ?? []]));
          if (!set({ step: 'runout', board, chances: chances(hands, board), skip: true })) return;
          await wait(RUNOUT_FIRST_MS);
          for (const st of streetEv) {
            board = board.concat(st.cards);
            if (!set({ step: 'runout', board, chances: chances(hands, board), skip: true })) return;
            await wait(RUNOUT_STREET_MS);
          }
        }
        if (showWin && alive()) {
          set({ step: 'scene', skip: true });
          announce();
          const values = winValues({ names, amount: total, cat, cards: best?.best ?? [], handNo: v.handNo, code: this.o.code }, currentTheme());
          let playing: Playing | null = null;
          try { playing = await playTier({ ...base(), index: tier - 1, values }); } catch { /* a scene that cannot load: straight to the table */ }
          if (playing && !alive()) { playing.stop(); return; }
          if (playing) await this.winnerCard(playing, v, sum, tier);
        }
        if (!set({ step: 'winner', skip: true })) return;
        announce();
        // the pot goes to the winners now: chips stream to their seats and their stacks roll up
        const before = { ...v, players: v.players.map((x) => ({ ...x, stack: x.stack - (sum.winners.find((w) => w.pid === x.id)?.amount ?? 0) })) };
        this.motion.play([e], before, v, null, motionLevel(), false);
        await wait(600);
        if (!set({ step: 'all', skip: true })) return;
        await wait(1700);
        if (!set({ step: 'hold' })) return;
      }
      if (!showBust || gen !== this.fxGen || !out) return;
      await this.bustScene(out, v, base());
    })().catch(() => { /* a scene that cannot load leaves the table as it is */ })
      // the bust-out sheet comes once the steps are over, also when they were cut short (a new hand, a skip)
      .finally(() => this.afterBustScene());
  }

  /** The bust-out scene (tiers.ts); for me, the bust-out sheet follows it (its choices live there, not in the scene). */
  private async bustScene(out: ScreenView['players'][number], v: ScreenView, base: { over: HTMLElement; table: HTMLElement | null; theme: ThemeKey; still: boolean; calm: boolean }): Promise<void> {
    const at = (out.id === v.me ? this.stage.querySelector('.hero .hc') : this.stage.querySelector(`.seat[data-pid="${CSS.escape(out.id)}"]`))?.getBoundingClientRect();
    const r = v.rebuy;
    const values = bustValues({ name: out.name, place: v.players.filter((p) => p.stack > 0).length + 1, of: v.players.length, rebuys: !!r?.on && !r.closed && (r.left ?? 1) > 0, stack: r?.amount ?? v.cfg.startStack, seatNo: out.seat + 1 });
    this.playing = await playTier({ ...base, index: 4, values, anchor: at ? { x: at.left + at.width / 2, y: at.top + at.height / 2 } : null, buttons: null });
    await this.playing.done;
    this.afterBustScene();
  }

  // ---------------- presence ----------------
  // the signed-off states (presence.ts): reconnecting banner, the host phone gone, and welcome back
  private lostAt: number | null = null;
  private lostHand = 0;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private presence(): void {
    const v = this.view;
    const k = currentTheme();
    presenceCss(k);
    const old = this.overlay.querySelectorAll('.tp-presence');
    const lost = this.net === 'lost';
    if (lost && this.lostAt === null) { this.lostAt = Date.now(); this.lostHand = v?.handNo ?? 0; this.overlay.querySelector('.pz-toast')?.remove(); this.overlay.querySelector('.pz-dim')?.remove(); }
    if (!lost && this.lostAt !== null) {
      const gone = Date.now() - this.lostAt;
      const me = v?.players.find((p) => p.id === v.me);
      this.lostAt = null;
      if (gone > 4000 && me && v && v.phase !== 'ended') this.welcomeBack(k, { name: me.name, missed: Math.max(0, v.handNo - this.lostHand), stack: me.stack, sittingOut: !!me.sittingOut });
    }
    if (this.lostAt !== null) {
      const since = this.lostAt;
      // an offline table whose host phone is gone pauses; anything else shows the reconnecting banner
      const html = this.o.offline && Date.now() - since > 5000 ? pauseHtml(k, since) : bannerHtml(k, since);
      const kind = html.includes('pz-pause') ? 'pause' : 'banner';
      if (!old.length || (old[0] as HTMLElement).dataset.kind !== kind) {
        old.forEach((e) => e.remove());
        this.overlay.insertAdjacentHTML('beforeend', html);
        (this.overlay.lastElementChild as HTMLElement).dataset.kind = kind;
      }
      if (!this.presenceTimer) this.presenceTimer = setInterval(() => { if (this.lostAt === null) return; tickClock(this.overlay, this.lostAt); if (this.o.offline && Date.now() - this.lostAt > 5000 && !this.overlay.querySelector('.pz-pause')) this.presence(); }, 1000);
      return;
    }
    if (this.presenceTimer) { clearInterval(this.presenceTimer); this.presenceTimer = null; }
    old.forEach((e) => e.remove());
    if (v?.me && v.players.find((p) => p.id === v.me)?.sittingOut && v.phase !== 'ended' && !this.overlay.querySelector('.pz-toast')) {
      this.overlay.insertAdjacentHTML('beforeend', '<div class="tp-presence sit pz-pnl" role="status">You are sitting out. Tap Sit back in when you are ready.</div>');
    }
  }
  private welcomeBack(k: ThemeKey, o: { name: string; missed: number; stack: number; sittingOut: boolean }): void {
    this.overlay.querySelector('.pz-toast')?.remove(); this.overlay.querySelector('.pz-dim')?.remove();
    this.overlay.insertAdjacentHTML('beforeend', backHtml(k, o));
    const close = (): void => { this.overlay.querySelector('.pz-toast')?.remove(); this.overlay.querySelector('.pz-dim')?.remove(); this.presence(); };
    for (const b of this.overlay.querySelectorAll('[data-pz=in],[data-pz=out],[data-pz=close]')) {
      b.addEventListener('click', () => {
        const what = (b as HTMLElement).dataset.pz;
        if (what === 'in' && o.sittingOut) this.t.sitOut(false);
        if (what === 'out') this.t.sitOut(true);
        close();
      });
    }
    (this.overlay.querySelector('[data-pz=in]') as HTMLElement | null)?.focus();
  }

  // ---------------- first time ----------------
  private maybeIntro(): void {
    if (store.get('tp-intro-done')) return;
    const steps = [
      ['Hold to look', 'Your cards stay face down. Press and hold them to look; let go to hide them again.'],
      ['Act on your turn', 'Fold, check or call, or raise with the slider. Your phone buzzes when it is your turn.'],
      ['Dropped out? No problem', 'Lock your phone or lose signal: your seat and chips are kept until you are back.'],
    ];
    let i = 0;
    const box = document.createElement('div');
    box.className = 'tp-intro';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'How the table works');
    const draw = () => {
      box.innerHTML = `<div class="tp-intro-in"><small>${i + 1} of ${steps.length}</small><h2>${steps[i]![0]}</h2><p>${steps[i]![1]}</p><button class="act call" data-i="next">${i === steps.length - 1 ? 'Got it' : 'Next'}</button></div>`;
    };
    box.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('[data-i]')) return;
      if (++i >= steps.length) { store.set('tp-intro-done', '1'); box.remove(); return; }
      draw();
    });
    draw();
    this.overlay.append(box);
  }

  destroy(): void {
    this.closeRaise();
    this.fxGen++; this.playing?.stop(); this.endResults();
    this.rb.destroy();
    if (this.bustTimer) clearTimeout(this.bustTimer);
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    clearInterval(this.tick);
    this.motion.reset();
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    for (const f of this.off) f();
    this.root.replaceChildren();
  }
}
