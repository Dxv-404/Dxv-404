// Table drama on the game screen: follows the table (the same DramaTracker as the server), decides which scenes
// this screen plays (the Table drama setting, the motion setting), queues them (one at a time) and frames them
// for the screen. The scene engine, the characters and the theme's room are loaded only when a scene first plays.
import { DramaTracker, type Moment } from '@tp/table';
import type { GameEvent } from '@tp/engine';
import type { CastEntry, MotionMode, ScenePlaying, TableLook } from './player';
import type { Framing } from './types';

export type DramaPref = 'on' | 'mine' | 'off';
export const DRAMA_PREFS: [DramaPref, string][] = [['on', 'On'], ['mine', 'Only my moments'], ['off', 'Off']];

/** Each theme's table colours and lettering (the neutral stage and the big word use them). */
export const THEME_LOOK: Record<string, { felt: string; rim: string; font: string }> = {
  classic: { felt: '#145a47', rim: '#3d2518', font: "'DM Serif Display',serif" },
  noir: { felt: '#18181a', rim: '#0b0b0c', font: "'Bodoni Moda',serif" },
  ivory: { felt: '#245644', rim: '#a77a4f', font: "'Cormorant Garamond',serif" },
  velvet: { felt: '#5e1424', rim: '#3a0b15', font: "'Fraunces',serif" },
  cyber: { felt: '#2f1840', rim: '#251530', font: "'Chakra Petch',sans-serif" },
  ink: { felt: '#ffffff', rim: '#111111', font: "'Reggae One',serif" },
  pixel: { felt: '#3b3346', rim: '#1a1220', font: "'Silkscreen',monospace" },
  train: { felt: '#2c5a4d', rim: '#93a6a8', font: "'Jost',sans-serif" },
  edo: { felt: '#24386f', rim: '#5a2616', font: "'Yuji Syuku',serif" },
};

// ---------------------------------------------------------------- framing (plan, "Phones, tablets and laptops")
export function framingFor(W: number, H: number): Framing {
  const short = Math.min(W, H);
  if (W > H && H < 560) return 'land';
  if (short < 600) return W <= 375 || H <= 600 ? 'small' : 'phone';
  return W >= 1100 ? 'laptop' : 'tablet';
}
export interface Box { left: number; top: number; width: number; height: number }
/**
 * Where the scene goes. Phones: full width, about 40% of the height (small phones 42%, sideways 70%), centred,
 * but always above the player's own cards and the action buttons (`keepClear`: their top edge) and below the notch.
 * Tablets 60% of the width, laptops 55%, centred over the table (16:9, never taller than 80% of the screen).
 */
export function sceneBox(f: Framing, W: number, H: number, o: { keepClear?: number | null; safeTop?: number; arena?: { top: number; height: number } | null } = {}): Box {
  const safeTop = o.safeTop ?? 0;
  if (f === 'tablet' || f === 'laptop') {
    const width = Math.round(W * (f === 'tablet' ? 0.6 : 0.55));
    const height = Math.round(Math.min(width * 0.5625, H * 0.8));
    const cy = o.arena ? o.arena.top + o.arena.height / 2 : H / 2;
    let top = Math.round(cy - height / 2);
    if (o.keepClear != null) top = Math.min(top, o.keepClear - height - 8);
    return { left: Math.round((W - width) / 2), top: Math.max(safeTop + 6, top), width, height };
  }
  const want = Math.round(H * (f === 'land' ? 0.7 : f === 'small' ? 0.42 : 0.4));
  const floor = o.keepClear != null ? o.keepClear - 8 : H;
  let top = Math.round((H - want) / 2);
  if (top + want > floor) top = floor - want;
  top = Math.max(safeTop + 4, top);
  const height = Math.max(120, Math.min(want, floor - top));
  return { left: 0, top, width: W, height };
}

// ---------------------------------------------------------------- slow phones
let liteGuess: boolean | null = null;
/** Lighter effects on slower phones (few cores or little memory): fewer lines, no shake, no shards. */
export function isLite(): boolean {
  if (liteGuess === null) {
    const n = navigator as Navigator & { deviceMemory?: number };
    liteGuess = (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 2;
  }
  return liteGuess;
}

// ---------------------------------------------------------------- the director
export interface DirectorView {
  me: string | null;
  handNo: number;
  players: { id: string; name: string; stack: number; avatar?: string; rebuysUsed?: number; busted?: boolean }[];
  hand: { ps: Record<string, { total: number; streetBet: number; folded: boolean; allIn: boolean }>; board: string[]; board2?: string[] | null } | null;
  rebuy?: { on: boolean; closed: boolean; max: number } | null;
}
export interface DirectorHost {
  overlay: HTMLElement;
  theme(): string;
  pref(): DramaPref;
  motion(): MotionMode | 'none';
  /** the top of the player's own cards / action buttons (px from the overlay's top), or null */
  keepClear(): number | null;
  arena(): { top: number; height: number } | null;
  /** a scene starts and ends (the screen holds its own steps meanwhile) */
  onScene?(on: boolean, m: Moment): void;
}

/** Is this moment one this screen shows? */
export function wanted(m: Moment, pref: DramaPref, me: string | null): boolean {
  if (pref === 'off') return false;
  if (pref === 'on') return true;
  // only my moments: mine, aimed at me, or a result I am part of
  return m.pid === me || m.target?.pid === me || !!m.cast?.some((c) => c.pid === me);
}

export class Director {
  readonly tracker = new DramaTracker();
  private queue: Moment[] = [];
  private playing: ScenePlaying | null = null;
  private current: Moment | null = null;
  private view: DirectorView | null = null;
  private idle: (() => void)[] = [];
  private gone = false;
  /** the moments seen (for the checks): kind, pid, played or skipped */
  log: { kind: string; pid: string; played: boolean; at: number }[] = [];

  constructor(private host: DirectorHost) {}

  /** Every update: the moments it produced, played in order (results wait for the reveal: see playResult). */
  feed(events: readonly GameEvent[], v: DirectorView): Moment[] {
    this.view = v;
    // drama must never break the table: a moment that cannot be worked out is simply not played
    let ms: Moment[] = [];
    try { ms = this.tracker.feed(events, v as never); } catch (e) { console.warn('drama', e); }
    for (const m of ms) {
      const ok = this.shows(m);
      this.log.push({ kind: m.kind, pid: m.pid, played: ok, at: Date.now() });
      if (!ok) continue;
      if (m.kind === 'allinResult' || m.kind === 'comeback' || m.kind === 'bigPot' || m.kind === 'split' || m.kind === 'lastStanding') continue; // played by the results steps
      this.queue.push(m);
    }
    this.pump();
    return ms;
  }

  /** Whether a scene plays on this screen for this moment (setting, the theme has scenes for this cast). */
  shows(m: Moment): boolean {
    if (!wanted(m, this.host.pref(), this.view?.me ?? null)) return false;
    if (this.host.motion() === 'none') return false;
    return eligible(m, this.host.theme(), this.view);
  }

  /** In-hand scenes still to play (or playing): the results wait for them. */
  get busy(): boolean { return !!this.playing || this.queue.length > 0; }
  /** Resolves once the queue is empty. */
  whenIdle(): Promise<void> { return this.busy ? new Promise((r) => this.idle.push(r)) : Promise.resolve(); }

  /** Play a result scene now (the results steps call this in place of the winner card). */
  async playResult(m: Moment): Promise<boolean> {
    if (!this.shows(m)) return false;
    await this.whenIdle();
    if (this.gone) return false;
    await this.run(m);
    return true;
  }

  skip(): void { this.playing?.stop(); }
  /** A new hand or my turn: anything still queued from the last hand is dropped. */
  clear(): void { this.queue = []; }
  destroy(): void { this.gone = true; this.queue = []; this.playing?.stop(); }
  get now(): Moment | null { return this.current; }

  private pump(): void {
    if (this.playing || this.gone) return;
    const m = this.queue.shift();
    if (!m) { const f = this.idle; this.idle = []; for (const r of f) r(); return; }
    void this.run(m).then(() => this.pump());
  }

  private async run(m: Moment): Promise<void> {
    const v = this.view;
    if (!v) return;
    let player: typeof import('./player');
    let reg: typeof import('./registry');
    try { [player, reg] = await Promise.all([import('./player'), import('./registry')]); } catch { return; }
    if (this.gone) return;
    const theme = this.host.theme();
    const look = THEME_LOOK[theme] ?? THEME_LOOK.classic!;
    let table: TableLook, cast: CastEntry[];
    try {
      const set = await reg.loadSet(theme);
      cast = await Promise.all(v.players.map(async (p) => ({ pid: p.id, name: p.name, initials: initialsOf(p.name), char: await reg.loadCharacter(p.avatar) })));
      table = { theme, set, ...look };
    } catch { return; }
    if (this.gone) return;
    ensureCss(player.SCENE_CSS);
    const ov = this.host.overlay;
    const W = ov.clientWidth || window.innerWidth, H = ov.clientHeight || window.innerHeight;
    const framing = framingFor(W, H);
    const safeTop = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0') || 0;
    const box = sceneBox(framing, W, H, { keepClear: this.host.keepClear(), arena: this.host.arena(), safeTop });
    const motion = this.host.motion();
    this.current = m;
    this.host.onScene?.(true, m);
    const p = player.playScene({ host: ov, box, framing, moment: m, cast, table, motion: motion === 'none' ? 'still' : motion, lite: isLite() });
    this.playing = p;
    // tap to skip (this screen only)
    p.el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); p.stop(); });
    await p.done;
    this.playing = null;
    this.current = null;
    this.host.onScene?.(false, m);
  }
}

/**
 * Scenes play at the Ink table for everyone (Initials and not-yet-drawn avatars as the silhouette); at other
 * tables only when the star has a drawn character (on the neutral stage until that theme's room is built).
 */
function eligible(m: Moment, theme: string, v: DirectorView | null): boolean {
  if (theme === 'ink') return true;
  const av = v?.players.find((p) => p.id === m.pid)?.avatar;
  return !!av && DRAWN.has(av);
}
/** Avatars with a drawn character: the registry's folders (kept in sync by the registry test). */
const DRAWN = new Set(Object.keys(import.meta.glob('./characters/*/index.ts')).map((p) => p.split('/').slice(-2, -1)[0]!).filter((k) => k !== 'initials'));

export function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '?') + (w.length > 1 ? w[w.length - 1]![0]! : (w[0]?.[1] ?? ''))).toUpperCase();
}
let cssDone = false;
function ensureCss(css: string): void {
  if (cssDone || document.getElementById('dr-css')) { cssDone = true; return; }
  const s = document.createElement('style'); s.id = 'dr-css'; s.textContent = css; document.head.append(s);
  cssDone = true;
}
