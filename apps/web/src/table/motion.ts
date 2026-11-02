// Table micro-animations, ported from the signed-off design (tools/design/gen/motion.py).
//
// The design shows each move as a 2.8 s loop. Here each move plays once, when the game says it happened:
// the part of the loop where things move is cut out and played over the move's real length (SPEC below),
// scaled by the theme's speed, with the theme's easing on every keyframe (as CSS animation-timing-function
// does). Delays the design gives in ms (70 ms per card, 40 ms between bets, 50 ms between chips) are kept
// as real time, scaled by the theme's speed.
//
// Every move goes between points the layout already knows (the deck, each seat, each bet spot, the pot),
// read from the table that was just drawn, so it lands right on every screen. Only transform and opacity
// are animated (glows are pseudo-elements whose opacity changes). Moves use the Web Animations API, so:
//  - when the screen swaps a part of the table (a partial redraw), reattach() starts the same move on the
//    new element at the same point in time: no jump, no flicker;
//  - when the next game event arrives while a move is still playing, the move jumps to its end
//    (finishAll): the table never falls behind the game.
// Motion 'off' (or the phone's Reduce motion) plays nothing. 'calm' plays shorter and without flourishes.
import type { GameEvent } from '@tp/engine';
import type { ScreenView } from '../net-table';
import { back, fmt } from './render';

export type MotionLevel = 'full' | 'calm' | 'off';

/** Per theme: easing and speed multiplier (motion.py FEEL). */
export const FEEL: Record<string, { ease: string; k: number }> = {
  classic: { ease: 'cubic-bezier(.2,.7,.2,1)', k: 1.0 },
  noir: { ease: 'cubic-bezier(.4,0,.2,1)', k: 1.25 },
  ivory: { ease: 'cubic-bezier(.3,.8,.3,1)', k: 1.1 },
  velvet: { ease: 'cubic-bezier(.4,0,.2,1)', k: 1.2 },
  cyber: { ease: 'cubic-bezier(.15,.9,.25,1)', k: 0.85 },
  ink: { ease: 'cubic-bezier(.2,1.35,.4,1)', k: 0.9 },
  pixel: { ease: 'steps(6, end)', k: 1.0 },
  train: { ease: 'cubic-bezier(.3,.6,.3,1)', k: 1.0 },
  edo: { ease: 'cubic-bezier(.25,.8,.25,1)', k: 1.1 },
};

/** Real length of each move in ms (motion.py SPEC), before the theme's speed. */
export const SPEC = { shuffle: 900, check: 400, call: 300, raise: 350, allin: 500, fold: 280, pot: 400, win: 500, turn: 300 } as const;
/** The design's loop is 2.8 s; the deal's card glide is shown in real time in it (14 % and 16 % of the loop). */
const LOOP = 2800;
/** Calm: moves this much shorter. */
const CALM = 0.6;

/** Which stretch of the design loop (in %) each move's keyframes span: that stretch becomes the whole move. */
const WIN = { shuffle: [6, 90], deal: [0, 14], dealHero: [0, 16], check: [10, 34], call: [8, 34], raise: [8, 32], allin: [8, 50], fold: [8, 34], pot: [10, 35], win: [8, 70], turn: [10, 22] } as const;

type Props = Record<string, string | number>;
type Frames = [number, Props][];

/**
 * Design keyframes (percent of the loop) -> Web Animations keyframes over the move's stretch [a, b]:
 * frames before the stretch fold into its start, frames after it (the loop resetting) are dropped, and
 * every keyframe carries the easing (the CSS animation-timing-function applies between each pair).
 */
function seg(win: readonly [number, number], frames: Frames, ease: string): Keyframe[] {
  const [a, b] = win;
  const out: Keyframe[] = [];
  for (const [p, props] of frames) {
    if (p > b) continue;
    const offset = Math.max(0, Math.min(1, (p - a) / (b - a)));
    if (offset === 0 && out.length && out[out.length - 1]!.offset === 0) out.pop(); // a hold before the stretch
    out.push({ offset, easing: ease, ...props });
  }
  if (out.length && out[0]!.offset !== 0) out.unshift({ ...out[0]!, offset: 0 });
  if (out.length && out[out.length - 1]!.offset !== 1) out.push({ ...out[out.length - 1]!, offset: 1 });
  return out;
}

interface Track { anim: Animation; sel: string | null; kf: Keyframe[]; opt: KeyframeAnimationOptions; ghost?: Element; keep?: boolean }
interface Timer { id: ReturnType<typeof setTimeout> | number; end: () => void }
interface BetSnap { pid: string; x: number; y: number; html: string }
interface SeatSnap { pid: string; x: number; y: number; html: string; backs: boolean }
/** What the table looked like just before an update (bets and cards that are about to disappear). */
export interface Snap { bets: BetSnap[]; seats: SeatSnap[]; pot: string | null }

const px = (s: string | undefined | null): number => parseFloat(s ?? '') || 0;
const esc = (s: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));
const seatSel = (pid: string): string => `.seat[data-pid="${esc(pid)}"]`;
const r1 = (n: number): number => Math.round(n);

export class Motion {
  private tracks: Track[] = [];
  /** The zoom, worked out once per update (0: not yet). */
  private z = 0;
  private timers: Timer[] = [];

  constructor(private stage: HTMLElement) {}

  private get root(): HTMLElement | null { return this.stage.querySelector('.tp.live'); }
  private get arena(): HTMLElement | null { return this.stage.querySelector('.tp.live .arena'); }

  /** The layer the moving copies (ghost bets, cards, chips, the deck) live in: inside the arena, outside the parts that get swapped. */
  private layer(): HTMLElement | null {
    const a = this.arena;
    if (!a) return null;
    let l = a.querySelector(':scope > .mv-layer') as HTMLElement | null;
    if (!l) { l = document.createElement('div'); l.className = 'mv-layer'; l.setAttribute('aria-hidden', 'true'); a.append(l); }
    return l;
  }

  // ---------------- bookkeeping ----------------
  private run(el: Element, sel: string | null, kf: Keyframe[], opt: KeyframeAnimationOptions, extra: { ghost?: Element; keep?: boolean } = {}): Animation {
    const o: KeyframeAnimationOptions = { fill: extra.keep ? 'both' : 'backwards', ...opt };
    const anim = el.animate(kf, o);
    const t: Track = { anim, sel, kf, opt: o, ...extra };
    this.tracks.push(t);
    anim.addEventListener('finish', () => {
      if (t.ghost) t.ghost.remove();
      if (!t.keep) this.tracks = this.tracks.filter((x) => x !== t);
    });
    return anim;
  }
  private later(ms: number, fn: () => void, end = fn): void {
    const t: Timer = { id: 0, end };
    t.id = setTimeout(() => { this.timers = this.timers.filter((x) => x !== t); fn(); }, ms);
    this.timers.push(t);
  }

  /** Every move still playing jumps to its end (the next event is here). Kept end states stay unless `all`. */
  finishAll(all = false): void {
    for (const t of this.tracks.slice()) {
      if (t.keep && !all) continue;
      try { if (t.anim.playState !== 'finished') t.anim.finish(); } catch { /* an infinite or detached effect */ }
      if (all) t.anim.cancel();
      t.ghost?.remove();
    }
    this.tracks = all ? [] : this.tracks.filter((t) => t.keep);
    for (const t of this.timers.splice(0)) { clearTimeout(t.id as ReturnType<typeof setTimeout>); t.end(); }
    if (all) this.stage.querySelector('.mv-layer')?.replaceChildren();
    else this.stage.querySelectorAll('.mv-layer > :not(.mv-keep)').forEach((e) => e.remove());
  }

  /** A whole new table was drawn: nothing carries over. */
  reset(): void { this.finishAll(true); }

  /** After a partial redraw: moves whose element was replaced continue on the new element, at the same time. */
  reattach(): void {
    for (const t of this.tracks) {
      const target = (t.anim.effect as KeyframeEffect | null)?.target;
      if (!target || target.isConnected || !t.sel) continue;
      const el = this.stage.querySelector(t.sel);
      if (!el) continue;
      const time = t.anim.currentTime;
      t.anim.cancel();
      const n = el.animate(t.kf, t.opt);
      n.currentTime = time;
      const ghost = t.ghost, keep = t.keep;
      n.addEventListener('finish', () => { if (ghost) ghost.remove(); if (!keep) this.tracks = this.tracks.filter((x) => x !== t); });
      t.anim = n;
    }
  }

  /** Before an update is drawn: finish what is playing and remember what is about to disappear. */
  before(events: GameEvent[]): Snap {
    this.finishAll(events.some((e) => e.t === 'handStart'));
    const snap: Snap = { bets: [], seats: [], pot: null };
    const root = this.root;
    if (!root) return snap;
    root.querySelectorAll<HTMLElement>('.arena .bet[data-pid]').forEach((b) => snap.bets.push({ pid: b.dataset.pid!, x: px(b.style.left), y: px(b.style.top), html: b.outerHTML }));
    root.querySelectorAll<HTMLElement>('.arena .seat[data-pid]').forEach((s) => {
      const backs = s.querySelector('.backs') as HTMLElement | null;
      snap.seats.push({ pid: s.dataset.pid!, x: px(s.style.left), y: px(s.style.top), html: s.outerHTML, backs: !!backs && backs.offsetParent !== null });
    });
    snap.pot = root.querySelector('.felt .pot strong')?.textContent ?? null;
    return snap;
  }

  // ---------------- anchors ----------------
  /** Logical px per screen px (the table is zoomed on big screens). */
  private zoom(): number {
    if (this.z) return this.z;
    const a = this.arena!;
    const w = px(getComputedStyle(a).width);
    return w ? a.getBoundingClientRect().width / w : 1;
  }
  /** An element's centre in arena coordinates (logical px). */
  private centre(el: Element): { x: number; y: number } {
    const a = this.arena!.getBoundingClientRect(), r = el.getBoundingClientRect(), z = this.zoom();
    return { x: (r.left + r.width / 2 - a.left) / z, y: (r.top + r.height / 2 - a.top) / z };
  }
  /** The deck: top middle of the table, at the dealer (motion.py seq_post: (cx, tt - 4)). */
  private deck(): { x: number; y: number } {
    const t = this.arena!.querySelector('.table') as HTMLElement;
    const x = px(t.style.left) + px(t.style.width) / 2, y = px(t.style.top) - 4;
    // screens with no dealer at the top (phones sideways, short phones) can seat a player there: the deck
    // then sits in the middle of the table (empty while a hand starts) rather than on top of that player
    const taken = Array.from(this.arena!.querySelectorAll<HTMLElement>('.seat[data-pid]')).some((s) => Math.abs(px(s.style.left) - x) < 50 && Math.abs(px(s.style.top) - y) < 64);
    return taken ? { x, y: px(t.style.top) + px(t.style.height) / 2 } : { x, y };
  }
  /** The pot: the pot pill's centre; themes that draw no pot use the design's spot under the board. */
  private pot(): { x: number; y: number } {
    const p = this.arena!.querySelector('.felt .pot');
    if (p) return this.centre(p);
    const t = this.arena!.querySelector('.table') as HTMLElement;
    const cx = px(t.style.left) + px(t.style.width) / 2, cy = px(t.style.top) + px(t.style.height) / 2;
    const cardEl = this.arena!.querySelector('.felt .board > *') as HTMLElement | null;
    const cw = cardEl ? px(cardEl.style.getPropertyValue('--w')) || 46 : 46;
    return { x: cx, y: cy - (cw * 1.4 + 61) / 2 + cw * 1.4 + 21 };
  }

  // ---------------- the moves ----------------
  /**
   * Play the moves for these events on the table just drawn. `prev` is the view before them, `snap` what
   * the table looked like before them; `myTurn`: the action just reached this player.
   */
  play(events: GameEvent[], prev: ScreenView | null, v: ScreenView, snap: Snap | null, level: MotionLevel, myTurn: boolean): void {
    const root = this.root;
    if (!root || level === 'off' || !this.arena) return;
    this.z = 0;
    this.z = this.zoom();
    const theme = /th-(\w+)/.exec(root.className)?.[1] ?? 'classic';
    const feel = FEEL[theme] ?? FEEL.classic!;
    const calm = level === 'calm';
    const k = feel.k * (calm ? CALM : 1);
    const m: Ctx = { theme, ease: feel.ease, k, calm, at: 0 };
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      const closes = events.slice(i + 1).some((x) => x.t === 'collect');
      if (e.t === 'handStart' && !calm) this.shuffle(m);
      else if (e.t === 'dealHole') this.deal(m, e.order, v.me);
      else if (e.t === 'act' && e.pid !== v.me) this.act(m, e.a, e.pid, prev, v, snap, closes);
      else if (e.t === 'collect' && snap) this.toPot(m, events.slice(0, i), prev, v, snap);
      else if (e.t === 'win') this.toWinner(m, e, prev, v);
    }
    if (myTurn) this.yourTurn(m);
  }

  /** Shuffle and cut: the deck splits, riffles back together and is cut once, at the dealer spot. */
  private shuffle(m: Ctx): void {
    const layer = this.layer();
    if (!layer) return;
    const d = this.deck();
    const D = SPEC.shuffle * m.k;
    const half = (side: number) => Array.from({ length: 4 }, (_, i) => `<span class="mvc" style="--k:${i};--s:${side}">${back(24)}</span>`).join('');
    layer.insertAdjacentHTML('beforeend', `<div class="mv-deck mv-keep" style="left:${r1(d.x)}px;top:${r1(d.y)}px"><span class="mvh l">${half(-1)}</span><span class="mvh r">${half(1)}</span></div>`);
    const deck = layer.lastElementChild as HTMLElement;
    const W = WIN.shuffle;
    const l = deck.querySelector('.mvh.l')!, r = deck.querySelector('.mvh.r')!;
    this.run(l, null, seg(W, [[6, { transform: 'none' }], [22, { transform: 'translateX(-20px) rotate(-6deg)' }], [46, { transform: 'translateX(-20px) rotate(-6deg)' }], [60, { transform: 'none' }]], m.ease), { duration: D, id: 'mv-shuffle' });
    this.run(r, null, seg(W, [[6, { transform: 'none' }], [22, { transform: 'translateX(20px) rotate(6deg)' }], [46, { transform: 'translateX(20px) rotate(6deg)' }], [60, { transform: 'none' }], [68, { transform: 'none' }], [78, { transform: 'translate(16px,-18px)' }], [90, { transform: 'none' }]], m.ease), { duration: D, id: 'mv-shuffle' });
    deck.querySelectorAll('.mvc').forEach((c) => {
      const i = Number((c as HTMLElement).style.getPropertyValue('--k'));
      this.run(c, null, seg(W, [[30, { translate: '0px 0px' }], [38, { translate: '0px -4px' }], [46, { translate: '0px 0px' }]], m.ease), { duration: D, delay: i * 40 * m.k, id: 'mv-shuffle' });
    });
    m.at = D;
    m.deck = deck;
  }

  /** Deal: two cards to each player, 70 ms apart, each gliding from the deck and settling with a small turn. */
  private deal(m: Ctx, order: string[], me: string | null): void {
    const arena = this.arena!;
    const d = this.deck(), z = this.zoom();
    const ar = arena.getBoundingClientRect();
    const n = order.length;
    const glide = (WIN.deal[1] / 100) * LOOP * m.k, glideH = (WIN.dealHero[1] / 100) * LOOP * m.k;
    let last = 0;
    const todo: [Element, string, Keyframe[], KeyframeAnimationOptions][] = [];
    order.forEach((pid, j) => {
      const cards: Element[] = pid === me
        ? Array.from(this.stage.querySelectorAll('.tp.live .hero .hc:not(.none) .flip'))
        : Array.from(arena.querySelectorAll(`${seatSel(pid)}:not(.mini) .backs .cd`));
      cards.slice(0, 2).forEach((c, round) => {
        const delay = m.at + (round * n + j) * 70 * m.k;
        const r = c.getBoundingClientRect();
        // from the deck to this card: the card's own centre starts on the deck
        const dx = r1(d.x - (r.left + r.width / 2 - ar.left) / z), dy = r1(d.y - (r.top + r.height / 2 - ar.top) / z);
        if (pid === me) {
          const sel = `.tp.live .hero .hc .flip:nth-child(${round + 1})`;
          todo.push([c, sel, seg(WIN.dealHero, [[0, { translate: `${dx}px ${dy}px`, opacity: 0 }], [3, { opacity: 1 }], [16, { translate: '0px 0px', opacity: 1 }]], m.ease), { duration: glideH, delay, id: 'mv-deal-hero' }]);
          last = Math.max(last, delay + glideH);
        } else {
          // the card settles into its resting turn (the second card sits turned a little)
          const tm = getComputedStyle(c).transform;
          const mt = /matrix\(([^)]+)\)/.exec(tm)?.[1]?.split(',').map(Number);
          const ang = mt ? Math.round((Math.atan2(mt[1]!, mt[0]!) * 180) / Math.PI) : 0;
          const rest = `translate(0px,0px) rotate(${ang}deg) scale(1)`;
          const sel = `${seatSel(pid)} .backs .cd:nth-child(${round + 1})`;
          todo.push([c, sel, seg(WIN.deal, [[0, { transform: `translate(${dx}px,${dy}px) rotate(-40deg) scale(.9)`, opacity: 0 }], [2, { opacity: 1 }], [14, { transform: rest, opacity: 1 }]], m.ease), { duration: glide, delay, id: 'mv-deal' }]);
          last = Math.max(last, delay + glide);
        }
      });
    });
    for (const [c, sel, kf, opt] of todo) this.run(c, sel, kf, opt);
    // the deck leaves once the last card is out
    const deck = m.deck;
    if (deck) {
      const a = deck.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: Math.max(last, m.at), fill: 'forwards' });
      this.tracks.push({ anim: a, sel: null, kf: [], opt: {}, ghost: deck });
      a.addEventListener('finish', () => { deck.remove(); this.tracks = this.tracks.filter((t) => t.anim !== a); });
    }
  }

  /** Check / call / raise / all-in / fold by another player. */
  private act(m: Ctx, a: string, pid: string, prev: ScreenView | null, v: ScreenView, snap: Snap | null, closes: boolean): void {
    const arena = this.arena!;
    const seat = arena.querySelector(seatSel(pid)) as HTMLElement | null;
    if (!seat) return;
    const S = seatSel(pid);
    const E = m.ease;
    const tagEase = m.theme === 'cyber' ? 'steps(1)' : E; // Cyber: tags appear with a single-frame flicker
    const tag = seat.querySelector('.tag');
    const fadeTag = (W: readonly [number, number], D: number) => {
      if (tag && !closes) this.run(tag, `${S} .tag`, seg(W, [[26, { opacity: 0, translate: '0px -4px' }], [34, { opacity: 1, translate: '0px 0px' }]], tagEase), { duration: D, id: `mv-${a}-tag` });
    };
    if (a === 'check') {
      const D = SPEC.check * m.k;
      const av = seat.querySelector('.av');
      if (av && !m.calm) this.run(av, `${S} .av`, seg(WIN.check, [[10, { translate: '0px 0px' }], [14, { translate: '0px 3px' }], [18, { translate: '0px 0px' }], [22, { translate: '0px 3px' }], [26, { translate: '0px 0px' }]], E), { duration: D, id: 'mv-check' });
      fadeTag(WIN.check, D);
      return;
    }
    if (a === 'fold') {
      const W = WIN.fold, D = SPEC.fold * m.k;
      // the cards: a copy of the seat's cards slides toward the middle and fades (the new table has none)
      const was = snap?.seats.find((s) => s.pid === pid);
      const layer = this.layer();
      if (was?.backs && layer) {
        const tpl = document.createElement('div');
        tpl.innerHTML = was.html;
        const g = tpl.firstElementChild as HTMLElement;
        for (const ch of Array.from(g.children)) if (!ch.classList.contains('backs')) ch.remove();
        g.className = 'seat mv-ghost';
        layer.append(g);
        const p = this.pot();
        const tx = r1((p.x - was.x) * 0.25), ty = r1((p.y - was.y) * 0.25);
        this.run(g.querySelector('.backs')!, null, seg(W, [[8, { transform: 'none', opacity: 1 }], [22, { transform: `translate(${tx}px,${ty}px) rotate(30deg) scale(.6)`, opacity: 0 }]], E), { duration: D, id: 'mv-fold-cards', fill: 'both' }, { ghost: g });
      }
      // the seat dims and shrinks a little, into its folded look
      if (seat.classList.contains('fold')) {
        const mt = /matrix\(([^)]+)\)/.exec(getComputedStyle(seat).transform)?.[1]?.split(',').map(Number);
        const s = mt ? Math.hypot(mt[0]!, mt[1]!) : 1;
        this.run(seat, S, seg(W, [[12, { transform: 'translate(-50%,-50%) scale(1)' }], [26, { transform: `translate(-50%,-50%) scale(${s.toFixed(3)})` }]], E), { duration: D, id: 'mv-fold' });
        for (const part of ['.av', '.plate']) {
          const el = seat.querySelector(part);
          if (!el) continue;
          const o = getComputedStyle(el).opacity;
          this.run(el, `${S} ${part}`, seg(W, [[12, { opacity: 1 }], [26, { opacity: Number(o) }]], E), { duration: D, id: 'mv-fold-dim' });
        }
      }
      fadeTag(W, D);
      return;
    }
    // call, bet, raise, all-in: the chips slide from the seat to the bet spot
    const kind = a === 'call' ? 'call' : a === 'allin' ? 'allin' : 'raise';
    const W = WIN[kind], D = SPEC[kind] * m.k;
    if (closes) return; // the round ends with this: the chips go straight to the pot (toPot)
    const bet = arena.querySelector(`.bet[data-pid="${esc(pid)}"]`) as HTMLElement | null;
    const B = `.bet[data-pid="${esc(pid)}"]`;
    if (bet) {
      const sx = r1(px(seat.style.left) - px(bet.style.left)), sy = r1(px(seat.style.top) - px(bet.style.top));
      this.run(bet, B, seg(W, [[8, { translate: `${sx}px ${sy}px`, opacity: 0 }], [10, { opacity: 1 }], [24, { translate: '0px 0px', opacity: 1 }]], E), { duration: D, id: `mv-${kind}` });
      const amt = bet.querySelector('span');
      if (amt) this.run(amt, `${B} span`, seg(W, [[24, { opacity: 0 }], [30, { opacity: 1 }]], E), { duration: D, id: `mv-${kind}-amt` });
      const c2 = bet.querySelector('.c2');
      if (c2 && !m.calm) this.run(c2, `${B} .c2`, seg(W, [[24, { translate: '0px -10px', opacity: 0 }], [28, { translate: '0px 0px', opacity: 1 }]], E), { duration: D, id: 'mv-raise-chip' });
    }
    if (tag) {
      if (m.calm || kind === 'call') fadeTag(W, D);
      else this.run(tag, `${S} .tag`, seg(W, [[22, { opacity: 0, scale: '.8' }], [28, { opacity: 1, scale: '1.08' }], [32, { opacity: 1, scale: '1' }]], tagEase), { duration: D, id: `mv-${kind}-tag` });
    }
    if (kind === 'allin' && !m.calm) {
      const av = seat.querySelector('.av');
      if (av) this.run(av, `${S} .av`, seg(W, [[26, { opacity: 0 }], [34, { opacity: 1 }], [50, { opacity: 0 }]], E), { duration: D, pseudoElement: '::after', id: 'mv-allin-glow' });
    }
    // the stack ticks down while the chips travel
    const from = prev?.players.find((p) => p.id === pid)?.stack, to = v.players.find((p) => p.id === pid)?.stack;
    const plate = seat.querySelector('.plate i') as HTMLElement | null;
    if (plate && from !== undefined && to !== undefined && from !== to && !m.calm) this.roll(plate, from, to, 0, D * ((24 - W[0]) / (W[1] - W[0])), m.theme === 'pixel');
  }

  /** Bets to pot: every bet glides into the pot, 40 ms apart; the pot number rolls to the new total. */
  private toPot(m: Ctx, before: GameEvent[], prev: ScreenView | null, v: ScreenView, snap: Snap): void {
    const layer = this.layer();
    if (!layer) return;
    const W = WIN.pot, D = SPEC.pot * m.k, E = m.ease;
    const p = this.pot();
    // the bets on the table before this update, plus chips from the action that closed the round
    const bets = snap.bets.map((b) => ({ ...b }));
    for (const e of before) {
      if (e.t !== 'act' || e.pid === v.me || !['call', 'bet', 'raise', 'allin'].includes(e.a)) continue;
      const ph = prev?.hand?.ps[e.pid], nh = v.hand?.ps[e.pid];
      const amount = (ph?.streetBet ?? 0) + Math.max(0, (nh?.total ?? 0) - (ph?.total ?? 0));
      const had = bets.find((b) => b.pid === e.pid);
      const html = `<div class="bet" data-pid="${esc(e.pid)}"><svg class="chip" viewBox="0 0 24 24" aria-hidden="true"><use href="#ch-${nh?.allIn ? 'b' : 'a'}"/></svg><span>${fmt(amount)}</span></div>`;
      if (had) had.html = had.html.replace(/<span>[^<]*<\/span>/, `<span>${fmt(amount)}</span>`);
      else { const s = snap.seats.find((x) => x.pid === e.pid); if (s) bets.push({ pid: e.pid, x: s.x, y: s.y, html }); }
    }
    // chips nobody called go back to their owner instead of into the pot
    const back = new Set<string>();
    for (const e of before) {
      if (e.t !== 'refund') continue;
      const b = bets.find((x) => x.pid === e.pid);
      if (!b) continue;
      const left = (Number((/<span>([^<]*)<\/span>/.exec(b.html)?.[1] ?? '0').replace(/\D/g, '')) || 0) - e.amount;
      if (left > 0) b.html = b.html.replace(/<span>[^<]*<\/span>/, `<span>${fmt(left)}</span>`);
      else back.add(e.pid);
    }
    let i = 0;
    for (const b of bets) {
      const tpl = document.createElement('div');
      tpl.innerHTML = b.html;
      const g = tpl.firstElementChild as HTMLElement;
      g.classList.add('mv-ghost');
      g.removeAttribute('data-pid');
      g.style.left = `${b.x}px`; g.style.top = `${b.y}px`;
      layer.append(g);
      const seat = back.has(b.pid) ? snap.seats.find((x) => x.pid === b.pid) : null;
      const to = seat ?? p;
      const tx = r1(to.x - b.x), ty = r1(to.y - b.y);
      this.run(g, null, seg(W, [[10, { translate: '0px 0px', opacity: 1 }], [26, { translate: `${tx}px ${ty}px`, opacity: 0.9 }], [30, { translate: `${tx}px ${ty}px`, opacity: 0 }]], E), { duration: D, delay: m.at + i * 40 * m.k, id: seat ? 'mv-pot-back' : 'mv-pot', fill: 'both' }, { ghost: g });
      i++;
    }
    if (!i) return;
    const end = m.at + (i - 1) * 40 * m.k + D;
    // the pot number rolls (old number up and out, new one in from below) once the chips land
    const strong = this.arena!.querySelector('.felt .pot strong') as HTMLElement | null;
    const now = strong?.textContent ?? '';
    if (strong && snap.pot !== now) {
      if (m.calm) { /* calm: the number just changes */ } else {
        const old = snap.pot ?? '';
        const delay = m.at + (i - 1) * 40 * m.k;
        this.fixWidth(strong, [old, now]);
        if (old) strong.textContent = old;
        this.run(strong, '.tp.live .felt .pot strong', seg(W, [[26, { translate: '0px 0px', opacity: old ? 1 : 0 }], [29, { translate: '0px -6px', opacity: 0 }], [31, { translate: '0px 6px', opacity: 0 }], [35, { translate: '0px 0px', opacity: 1 }]], E), { duration: D, delay, id: 'mv-pot-roll' });
        const done = () => { strong.textContent = now; strong.style.minWidth = ''; };
        this.later(delay + D * ((30 - W[0]) / (W[1] - W[0])), () => { strong.textContent = now; }, done);
        this.later(delay + D, done);
      }
    }
    m.at = end;
  }

  /** Pot to winner: up to five chips stream to the winners, their stack rolls up, one glow on the plate. */
  private toWinner(m: Ctx, e: Extract<GameEvent, { t: 'win' }>, prev: ScreenView | null, v: ScreenView): void {
    const layer = this.layer();
    if (!layer) return;
    const W = WIN.win, D = SPEC.win * m.k, E = m.ease;
    const winners = [...new Set(e.results.pots.flatMap((p) => p.awards.map((a) => a.pid)))];
    if (!winners.length) return;
    const p = this.pot();
    const arena = this.arena!;
    const targets = winners.map((pid) => {
      const seat = arena.querySelector(seatSel(pid)) as HTMLElement | null;
      if (seat) return { pid, x: px(seat.style.left), y: px(seat.style.top), seat };
      const hs = pid === v.me ? this.stage.querySelector('.tp.live .hero .hstack') : null;
      return hs ? { pid, ...this.centre(hs), seat: null } : null;
    }).filter((t): t is NonNullable<typeof t> => !!t);
    if (!targets.length) return;
    // at most five chips in all, shared between the winners
    for (let c = 0; c < 5; c++) {
      const t = targets[c % targets.length]!;
      layer.insertAdjacentHTML('beforeend', `<span class="mv-fly" style="left:${r1(p.x)}px;top:${r1(p.y)}px"><svg class="chip" viewBox="0 0 24 24" aria-hidden="true"><use href="#ch-${c % 2 ? 'a' : 'b'}"/></svg></span>`);
      const g = layer.lastElementChild!;
      const tx = r1(t.x - p.x), ty = r1(t.y - p.y);
      this.run(g, null, seg(W, [[8, { translate: '0px 0px', opacity: 0 }], [10, { opacity: 1 }], [30, { translate: `${r1(tx * 0.5)}px ${r1(ty * 0.5 - 16)}px` }], [44, { translate: `${tx}px ${ty}px`, opacity: 1 }], [50, { translate: `${tx}px ${ty}px`, opacity: 0 }]], E), { duration: D, delay: m.at + c * 50 * m.k, id: 'mv-win', fill: 'both' }, { ghost: g });
    }
    // the pot empties (stays dim until the next hand)
    const pot = arena.querySelector('.felt .pot');
    if (pot) this.run(pot, '.tp.live .felt .pot', seg(W, [[8, { opacity: 1 }], [20, { opacity: 0.35 }]], E), { duration: D, delay: m.at, id: 'mv-win-pot' }, { keep: true });
    for (const t of targets) {
      const plate = t.seat?.querySelector('.plate');
      if (plate && !m.calm) this.run(plate, `${seatSel(t.pid)} .plate`, seg(W, [[44, { opacity: 0 }], [52, { opacity: 1 }], [70, { opacity: 0 }]], E), { duration: D, delay: m.at, pseudoElement: '::after', id: 'mv-win-glow' });
      const from = prev?.players.find((x) => x.id === t.pid)?.stack, to = v.players.find((x) => x.id === t.pid)?.stack;
      const num = (t.seat ? t.seat.querySelector('.plate i') : this.stage.querySelector('.tp.live .hero .hstack')) as HTMLElement | null;
      if (num && from !== undefined && to !== undefined && to > from && !m.calm) this.roll(num, from, to, m.at + D * ((10 - W[0]) / (W[1] - W[0])), D * ((44 - 10) / (W[1] - W[0])), m.theme === 'pixel');
    }
  }

  /** Your turn: your buttons rise in 12 px, 40 ms apart. */
  private yourTurn(m: Ctx): void {
    const D = SPEC.turn * m.k;
    this.stage.querySelectorAll('.tp.live .actions .act').forEach((b, i) => {
      this.run(b, `.tp.live .actions .act:nth-of-type(${i + 1})`, seg(WIN.turn, [[10, { translate: '0px 12px', opacity: 0 }], [22, { translate: '0px 0px', opacity: 1 }]], m.ease), { duration: D, delay: i * 40 * m.k, id: 'mv-turn' });
    });
  }

  // ---------------- numbers ----------------
  /** Hold the number's box at the widest of these texts, so nothing beside it shifts while it rolls. */
  private fixWidth(el: HTMLElement, texts: string[]): void {
    const keep = el.textContent;
    let w = 0;
    for (const t of texts) { el.textContent = t; w = Math.max(w, el.getBoundingClientRect().width / this.zoom()); }
    el.textContent = keep;
    el.style.minWidth = `${Math.ceil(w)}px`;
  }
  /** Count a number from one amount to another, in a few ticks. */
  private roll(el: HTMLElement, from: number, to: number, delay: number, dur: number, stepped: boolean): void {
    this.fixWidth(el, [fmt(from), fmt(to)]);
    el.style.fontVariantNumeric = 'tabular-nums';
    el.textContent = fmt(from);
    const done = () => { el.textContent = fmt(to); el.style.minWidth = ''; el.style.fontVariantNumeric = ''; };
    let raf = 0;
    const t: Timer = { id: 0, end: () => { cancelAnimationFrame(raf); done(); } };
    this.timers.push(t);
    const t0 = performance.now() + delay;
    const step = (now: number) => {
      let f = Math.max(0, Math.min(1, (now - t0) / dur));
      f = Math.floor(f * (stepped ? 6 : 8)) / (stepped ? 6 : 8); // it ticks (8 steps; Pixel: 6, like its frames)
      if (f >= 1 || !el.isConnected) { this.timers = this.timers.filter((x) => x !== t); done(); return; }
      const txt = fmt(from + (to - from) * f);
      if (el.textContent !== txt) el.textContent = txt; // only when the shown number changes
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
}

interface Ctx { theme: string; ease: string; k: number; calm: boolean; /** ms into this update where the next move starts */ at: number; deck?: HTMLElement }
