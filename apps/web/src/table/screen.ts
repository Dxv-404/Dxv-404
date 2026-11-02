// The live table screen: draws the table in the chosen theme (render.ts), and turns taps, holds and keys
// into actions. Used for online tables and offline (host app) tables alike.
import type { Action, GameEvent } from '@tp/engine';
import type { ScreenView } from '../net-table';
import { renderTable, sprite, fmt, THEME_KEYS, THEMES, type ThemeKey, type Frame } from './render';
import { sfx, buzz, settings } from '../legacy/fx.js';
import { ask } from '../legacy/ui.js';

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

export class TableScreen {
  private root: HTMLElement;
  private view: ScreenView | null = null;
  private peek = false;
  private bubble: string | null = null;
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private net: 'good' | 'weak' | 'lost' = 'good';
  private frame: Frame | null = null;
  private raiseOpen = false;
  private off: (() => void)[] = [];
  private tick: ReturnType<typeof setInterval>;
  private lastTurnFor = '';
  private overlay: HTMLElement;
  private stage: HTMLElement;

  constructor(root: HTMLElement, private t: TableLike, private o: { code: string; menu(): void; info(): void; offline?: boolean }) {
    this.root = root;
    loadDesignCss();
    root.className = 'screen tp-screen';
    root.replaceChildren();
    root.insertAdjacentHTML('afterbegin', `<div class="tp-sprite">${sprite(currentTheme())}</div>`);
    this.stage = document.createElement('div'); this.stage.className = 'tp-stage';
    this.overlay = document.createElement('div'); this.overlay.className = 'tp-over';
    root.append(this.stage, this.overlay);
    this.off.push(t.subscribe((ev, v) => this.update(ev, v)));
    if (t.view) this.update([], t.view);
    const onResize = () => this.draw();
    const onTheme = () => { (root.querySelector('.tp-sprite') as HTMLElement).innerHTML = sprite(currentTheme()); this.draw(); };
    window.addEventListener('resize', onResize);
    window.addEventListener('tp-theme', onTheme);
    this.off.push(() => { window.removeEventListener('resize', onResize); window.removeEventListener('tp-theme', onTheme); });
    // hold to look; buttons
    const down = (e: Event) => {
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
      if (this.raiseOpen || (e.target as HTMLElement).closest('input, select, textarea')) return;
      if (e.code === 'Space') { if (!this.peek) { this.peek = true; this.draw(); } e.preventDefault(); return; }
      const k = e.key.toLowerCase();
      if (k === 'f') this.press('fold');
      else if (k === 'c') this.press(this.view?.legal?.canCheck ? 'check' : 'call');
      else if (k === 'r') this.press('raise');
    };
    const keyUp = (e: KeyboardEvent) => { if (e.code === 'Space') up(); };
    window.addEventListener('keydown', key); window.addEventListener('keyup', keyUp);
    this.off.push(() => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('keydown', key); window.removeEventListener('keyup', keyUp); });
    // the turn timer counts down without a message from the server
    this.tick = setInterval(() => { if (this.view?.hand?.toAct && this.view.turnTotal) { this.view.turnLeft = Math.max(0, this.view.turnLeft - 250); this.drawTimer(); } }, 250);
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
    const name = (pid: string | null | undefined) => v.players.find((p) => p.id === pid)?.name ?? 'Someone';
    for (const e of events) {
      if (e.t === 'handStart') { this.say(`Hand ${e.handNo}. Cards coming.`); sfx.card(); }
      else if (e.t === 'act') { this.say(`${name(e.pid)} ${SAY[e.a] ?? e.a}${e.a === 'raise' || e.a === 'bet' ? ` ${fmt(e.to ?? e.amount ?? 0)}` : e.a === 'call' && e.amount ? ` ${fmt(e.amount)}` : ''}.`); if (e.a !== 'fold' && e.a !== 'check') sfx.chip?.(1); }
      else if (e.t === 'street') { this.say(e.street === 'flop' ? 'The flop.' : e.street === 'turn' ? 'The turn.' : 'The river.'); sfx.card(); }
      else if (e.t === 'win') { this.win(e, v); }
      else if (e.t === 'presence' && e.pid !== v.me) this.say(`${name(e.pid)} ${e.connected ? 'is back' : 'lost connection'}.`);
      else if (e.t === 'paused') this.say(e.paused ? 'Dealing is paused.' : 'Dealing again.');
      else if (e.t === 'level') this.say(`Blinds up: ${fmt(e.level.sb)} / ${fmt(e.level.bb)}.`);
    }
    // my turn: a buzz once per turn
    const turnKey = v.hand?.toAct === v.me && v.me ? `${v.handNo}:${v.hand?.street}:${v.hand?.currentBet}` : '';
    if (turnKey && turnKey !== this.lastTurnFor) { buzz?.([30, 40, 30]); sfx.turn?.(); this.announce('Your turn.'); }
    this.lastTurnFor = turnKey;
    if (prev?.hand?.toAct === v.me && v.hand?.toAct !== v.me) this.closeRaise();
    this.draw();
    this.presence();
  }

  private draw(): void {
    const v = this.view;
    if (!v) { this.stage.innerHTML = '<div class="tp-wait" role="status">Connecting…</div>'; return; }
    const W = this.root.clientWidth || window.innerWidth, H = this.root.clientHeight || window.innerHeight;
    const frame = renderTable(v, currentTheme(), W, H, { peek: this.peek || !settings.holdToPeek, bubble: this.bubble, code: this.o.code, net: this.net });
    if (frame.html === this.frame?.html) return; // nothing changed on screen
    const prev = this.frame;
    this.frame = frame;
    if (prev && prev.shell === frame.shell && this.stage.firstElementChild) {
      // the same table: swap only the parts that changed (the background and the art stay put)
      for (const [k, html] of Object.entries(frame.parts)) {
        if (prev.parts[k] === html) continue;
        const el = this.stage.querySelector(`.tpd[data-k="${k}"]`);
        if (el) el.innerHTML = html;
      }
      return;
    }
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
      case 'fold': if (L && v?.hand?.toAct === v.me) { if (L.canCheck) { void ask('You can check for free. Fold anyway?', { yes: 'Fold', no: 'Keep my cards', danger: true }).then((ok) => { if (ok) this.t.act({ type: 'fold' }); }); return; } this.t.act({ type: 'fold' }); } return;
      case 'check': if (L?.canCheck) this.t.act({ type: 'check' }); return;
      case 'call': if (L?.canCall) this.t.act({ type: 'call' }); return;
      case 'allin': this.t.act({ type: 'allin' }); return;
      case 'raise': if (L?.canRaise) this.openRaise(); return;
      case 'show': return this.t.show();
      case 'rebuy': return this.t.rebuy();
      case 'sitin': return this.t.sitOut(false);
      case 'deal': return this.t.dealNow();
      case 'twice': return this.t.vote(true);
      case 'once': return this.t.vote(false);
    }
  }

  // ---------------- raise ----------------
  private openRaise(): void {
    const v = this.view!, L = v.legal!;
    const me = v.players.find((p) => p.id === v.me)!;
    const pot = (v.hand?.pot ?? 0);
    const callTo = L.currentBet;
    const clamp = (x: number) => Math.max(L.minTo, Math.min(L.maxTo, Math.round(x)));
    const presets: [string, number][] = [['Min', L.minTo], ['½ pot', clamp(callTo + (pot + L.toCall) / 2)], ['¾ pot', clamp(callTo + ((pot + L.toCall) * 3) / 4)], ['Pot', clamp(callTo + pot + L.toCall)], ['All-in', L.maxTo]];
    let to = L.minTo;
    this.raiseOpen = true;
    const sheet = document.createElement('div');
    sheet.className = 'tp-raise';
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', L.isBet ? 'Bet' : 'Raise');
    const draw = () => {
      sheet.innerHTML = `<div class="tp-raise-in"><div class="amt"><small>${L.isBet ? 'Bet' : 'Raise to'}</small><b>${fmt(to)}</b><small>${to >= L.maxTo ? 'all your chips' : `of ${fmt(me.stack + (v.hand?.ps[me.id]?.streetBet ?? 0))}`}</small></div>`
        + `<input type="range" min="${L.minTo}" max="${L.maxTo}" step="${Math.max(1, v.level.bb / 2)}" value="${to}" aria-label="Amount">`
        + `<div class="presets">${presets.map(([t, x]) => `<button data-to="${x}"${x === to ? ' class="on"' : ''}>${t}</button>`).join('')}</div>`
        + `<div class="row"><button class="act ghost" data-x="cancel">Cancel</button><button class="act raise" data-x="go">${to >= L.maxTo ? 'All-in' : `${L.isBet ? 'Bet' : 'Raise to'} ${fmt(to)}`}</button></div></div>`;
      (sheet.querySelector('input') as HTMLInputElement).addEventListener('input', (e) => { to = clamp(Number((e.target as HTMLInputElement).value)); draw(); (sheet.querySelector('input') as HTMLInputElement).focus(); });
    };
    sheet.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) { if (e.target === sheet) this.closeRaise(); return; }
      if (b.dataset.to) { to = Number(b.dataset.to); draw(); return; }
      if (b.dataset.x === 'cancel') return this.closeRaise();
      if (b.dataset.x === 'go') { this.t.act(to >= L.maxTo ? { type: 'allin' } : { type: L.isBet ? 'bet' : 'raise', to }); this.closeRaise(); }
    });
    draw();
    this.overlay.querySelector('.tp-raise')?.remove();
    this.overlay.append(sheet);
  }
  private closeRaise(): void { this.raiseOpen = false; this.overlay.querySelector('.tp-raise')?.remove(); }

  // ---------------- wins ----------------
  private win(e: Extract<GameEvent, { t: 'win' }>, v: ScreenView): void {
    const total = e.results.pots.reduce((a, p) => a + p.amount, 0);
    const mine = e.results.pots.flatMap((p) => p.awards).filter((a) => a.pid === v.me).reduce((s, a) => s + a.amount, 0);
    const names = [...new Set(e.results.pots.flatMap((p) => p.awards.map((a) => v.players.find((x) => x.id === a.pid)?.name ?? 'Someone')))];
    const best = e.results.pots.find((p) => p.hand)?.hand?.desc ?? null;
    this.say(`${names.join(' and ')} win${names.length === 1 ? 's' : ''} ${fmt(total)}${best ? ` with ${best.toLowerCase()}` : ''}.`);
    sfx.win?.();
    // win tiers: the bigger the pot (in big blinds) or the rarer the hand, the bigger the moment
    const bbs = total / Math.max(1, v.level.bb);
    const rare = !!best && /straight flush|royal|four of a kind/i.test(best);
    const tier = rare || bbs >= 120 ? 4 : bbs >= 60 ? 3 : bbs >= 25 ? 2 : 1;
    if (tier < 2 || settings.winFx === 'off' || (settings.winFx === 'big' && tier < 3)) return;
    const banner = document.createElement('div');
    banner.className = `tp-tier t${tier}`;
    banner.setAttribute('role', 'status');
    banner.innerHTML = `<b>${tier === 4 ? (rare ? best! : 'Monster pot') : tier === 3 ? 'Huge pot' : 'Big pot'}</b><span>${mine ? `You win ${fmt(mine)}` : `${names.join(' and ')} win${names.length === 1 ? 's' : ''} ${fmt(total)}`}</span>`;
    this.overlay.append(banner);
    if (mine && tier >= 3) buzz?.([60, 40, 60, 40, 120]);
    setTimeout(() => banner.remove(), reduceMotion() ? 2000 : 2800);
  }

  // ---------------- presence ----------------
  private presence(): void {
    const v = this.view;
    let msg: string | null = null;
    if (this.net === 'lost') msg = 'Reconnecting… Your seat and chips are held.';
    else if (v?.me && v.players.find((p) => p.id === v.me)?.sittingOut && v.phase !== 'ended') msg = 'You are sitting out. Tap Sit back in when you are ready.';
    let el = this.overlay.querySelector('.tp-presence') as HTMLElement | null;
    if (!msg) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className = 'tp-presence'; el.setAttribute('role', 'status'); this.overlay.append(el); }
    el.textContent = msg;
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
    clearInterval(this.tick);
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    for (const f of this.off) f();
    this.root.replaceChildren();
  }
}
