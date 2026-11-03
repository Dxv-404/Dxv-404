// Table drama: the scene engine. Plays one scene script as manga panels slamming onto a page: establish, act,
// reaction, freeze. Limited animation: drawn key poses cut in turn; the panels, the camera, speed and focus lines,
// impact flashes and lettering do the moving. Everything is SVG and only transform and opacity are animated
// (Web Animations), so it runs at 60 fps on phones.
import type { Moment } from '@tp/table';
import { TONE_DEFS, focusLines, letter, speedLines, splash, INK, WHITE, RED } from './art';
import { CHAR_H, CHAR_W, TABLE_FRONT, TABLE_Y, WORLD_H, WORLD_W, type Cam, type CharacterDef, type Framing, type PoseCtx, type PoseDef, type PropUse, type Reaction, type SceneScript, type SetDef, type Shot } from './types';

export type MotionMode = 'full' | 'calm' | 'still';
export interface CastEntry { pid: string; name: string; initials: string; char: CharacterDef }
export interface TableLook { theme: string; set: SetDef; felt: string; rim: string; font: string }
export interface PlayOpts {
  host: HTMLElement;
  /** where the scene sits (px, relative to host) */
  box: { left: number; top: number; width: number; height: number };
  framing: Framing;
  moment: Moment;
  /** everyone at the table, in seat order (the star must be among them) */
  cast: CastEntry[];
  table: TableLook;
  motion: MotionMode;
  lite: boolean;
  /** a scene can be skipped by a tap (on this screen only) */
  skippable?: boolean;
  /** the lab: start paused at a shot */
  paused?: boolean;
}
export interface ScenePlaying { el: HTMLElement; done: Promise<void>; stop(): void; /** lab: jump to shot i, paused */ seek(shot: number): void; shots: number; ms: number }

/** Words stamped on the freeze (plan, "How a scene is shot": Words). */
export function wordFor(m: Moment): string {
  switch (m.kind) {
    case 'allin': return m.position === 'desperate' ? 'LAST STAND' : 'ALL IN';
    case 'allinAnswered': return 'CALLED';
    case 'bigBet': return 'RAISED';
    case 'bigBetAnswered': return m.variant === 'raise' ? 'COUNTER' : 'CALLED';
    case 'fold': return '';
    case 'allinResult': case 'bigPot': return 'TAKES IT ALL';
    case 'comeback': return 'TURNED IT AROUND';
    case 'split': return 'SPLIT';
    case 'rebuy': return 'BACK IN';
    case 'lastStanding': return 'LAST ONE STANDING';
  }
}

/** The script for a moment, from the star's character (most specific key first). */
export function scriptFor(c: CharacterDef, m: Moment): SceneScript {
  const keys = m.kind === 'allinAnswered' || m.kind === 'bigBetAnswered' || m.kind === 'allin' || m.kind === 'bigBet' || m.kind === 'fold'
    ? [`${m.kind}.${m.position}.${m.variant ?? ''}`, `${m.kind}.${m.position}`, m.kind] : [m.kind];
  for (const k of keys) if (c.scenes[k]) return c.scenes[k]!;
  return { shots: [{ cut: 'establish', w: 0.3 }, { cut: 'freeze', w: 0.7, poses: ['sit'] }] };
}
/** What a character does in someone else's scene. */
export function reactionOf(c: CharacterDef, key: string): Reaction {
  return c.reactions[key] ?? c.reactions.lost ?? { poses: [c.poses[key] ? key : 'sit'] };
}

const r1 = (n: number): string => (Math.round(n * 10) / 10).toString();
const poseCache = new WeakMap<CharacterDef, Map<string, string>>();
function drawPose(c: CharacterDef, name: string, ctx: PoseCtx): string {
  let m = poseCache.get(c);
  if (!m) { m = new Map(); poseCache.set(c, m); }
  const k = `${name}|${ctx.initials}|${ctx.lite ? 1 : 0}`;
  let s = m.get(k);
  if (s === undefined) {
    const p: PoseDef | undefined = c.poses[name] ?? c.poses.sit;
    s = p === undefined ? '' : typeof p === 'string' ? p : p(ctx);
    m.set(k, s);
  }
  return s;
}

const isWide = (f: Framing): boolean => f === 'land' || f === 'tablet' || f === 'laptop';
let uid = 0;

interface Panel { x: number; y: number; w: number; h: number; tilt: number; from: 'left' | 'right' | 'top' | 'bottom'; inset: boolean }

/** Plays a scene. Resolves `done` when it ends or is stopped. */
export function playScene(o: PlayOpts): ScenePlaying {
  const id = `dr${++uid}`;
  const m = o.moment;
  const star = o.cast.find((c) => c.pid === m.pid) ?? o.cast[0]!;
  const script = scriptFor(star.char, m);
  const total = o.motion === 'still' ? 1200 : m.ms;
  const wide = isWide(o.framing);
  const W = Math.round(o.box.width), H = Math.round(o.box.height);
  const lite = o.lite || o.framing === 'small';
  const set = o.table.set;
  const ctxOf = (c: CastEntry): PoseCtx => ({ initials: c.initials, lite });
  const target = m.target ? o.cast.find((c) => c.pid === m.target!.pid) ?? null : null;
  const losers = (m.cast ?? []).filter((c) => c.pid !== m.pid && c.outcome !== 'won').map((c) => ({ e: o.cast.find((x) => x.pid === c.pid), out: c.outcome })).filter((x): x is { e: CastEntry; out: typeof x.out } => !!x.e);
  const splitWith = (m.cast ?? []).find((c) => c.pid !== m.pid && c.outcome === 'split');
  const act1 = new Set((m.act1 ?? []).filter((a) => a.pid === m.pid).map((a) => a.kind));
  const word = wordFor(m);
  const homeCutIn = star.char.home !== o.table.theme;

  // shots and their times (still: the freeze alone)
  let shots = script.shots;
  if (o.motion === 'still') {
    const f = [...shots].reverse().find((s) => s.cut === 'freeze') ?? [...shots].reverse().find((s) => s.cut === 'act') ?? shots[shots.length - 1]!;
    shots = [{ ...f, w: 1, fx: [] }];
  }
  const wsum = shots.reduce((a, s) => a + s.w, 0) || 1;
  let t0 = 0;
  const times = shots.map((s) => { const at = t0; const d = (s.w / wsum) * total; t0 += d; return { at, d }; });

  const moving = o.motion === 'full';

  // ---------------------------------------------------------------- the page
  const root = document.createElement('div');
  root.className = 'dr-scene';
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', `${star.name}: ${word || m.kind}`);
  Object.assign(root.style, { left: `${o.box.left}px`, top: `${o.box.top}px`, width: `${W}px`, height: `${H}px` });
  root.dataset.kind = m.kind;
  root.dataset.motion = o.motion;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H));
  svg.setAttribute('aria-hidden', 'true');
  root.append(svg);
  const frag: string[] = [];
  frag.push(`<defs>${TONE_DEFS}</defs><rect width="${W}" height="${H}" fill="${set.paper}"/><g class="dr-shake">`);

  const panelOf = (s: Shot, i: number): Panel => {
    const g = 5;
    const tilt = s.panel?.tilt ?? (s.cut === 'reaction' ? (i % 2 ? 4 : -4) : s.cut === 'act' ? -1.5 : 0);
    const from = s.panel?.from ?? (s.cut === 'reaction' ? 'right' : s.cut === 'act' ? (i % 2 ? 'right' : 'left') : 'top');
    const inset = s.panel?.inset ?? s.cut === 'reaction';
    if (!inset) return { x: g, y: g, w: W - 2 * g, h: H - 2 * g, tilt: o.motion === 'still' ? 0 : tilt, from, inset };
    const pw = wide ? W * 0.4 : W * 0.56, ph = wide ? H * 0.78 : H * 0.62;
    return { x: from === 'left' ? W * 0.03 : W - pw - W * 0.03, y: wide ? H * 0.11 : H - ph - H * 0.05, w: pw, h: ph, tilt, from, inset };
  };
  const poly = (p: Panel): string => {
    // a panel is a slightly skewed quad (manga panels are rarely square to the page)
    const k = Math.tan((p.tilt * Math.PI) / 180) * p.h * 0.5;
    return `${r1(p.x + Math.max(0, k))},${r1(p.y)} ${r1(p.x + p.w)},${r1(p.y + Math.max(0, -k))} ${r1(p.x + p.w - Math.max(0, k))},${r1(p.y + p.h)} ${r1(p.x)},${r1(p.y + p.h - Math.max(0, -k))}`;
  };

  /** The camera: character space -> panel px. */
  const camT = (p: Panel, c: Cam): { k: number; tx: number; ty: number } => {
    const k = (p.h / CHAR_H) * c.zoom;
    return { k, tx: p.x + p.w / 2 - c.x * k, ty: p.y + p.h / 2 - c.y * k };
  };
  const camCss = (t: { k: number; tx: number; ty: number }): string => `translate(${r1(t.tx)}px, ${r1(t.ty)}px) scale(${t.k.toFixed(4)})`;

  /** Props: the character's own, or the table's ('@pile', '@crown', '@chips'). */
  const propSvg = (c: CharacterDef, p: PropUse): string => {
    if (p.id === '@pile') { const me = m.cast?.find((x) => x.pid === star.pid); return set.pile((me?.pile ?? 0) as 0 | 1 | 2); }
    if (p.id === '@crown') return m.crown ? set.crown() : '';
    if (p.id === '@chips') return set.chips(6);
    const d = c.props?.[p.id];
    if (!d) return '';
    return typeof d.svg === 'string' ? d.svg : d.svg({ initials: star.initials, lite });
  };

  // each panel's markup is built as a string; animated groups get ids and are wired up after insertion
  const wires: { sel: string; kf: Keyframe[]; at: number; dur: number; o?: KeyframeAnimationOptions }[] = [];
  const wire = (cls: string, kf: Keyframe[], at: number, dur: number, opt?: KeyframeAnimationOptions) => wires.push({ sel: `.${cls}`, kf, at, dur, o: opt });
  let cls = 0;
  const nc = (): string => `${id}c${++cls}`;

  /** Key poses cut in turn over the shot (calm and still: the last one only). `layer`: behind or in front of the table. */
  const poseRun = (c: CastEntry, names: string[], at: number[] | undefined, start: number, dur: number, layer: 'back' | 'front' = 'back'): string => {
    const list = names.length ? names : ['sit'];
    const part = (n: string): string => { const s = drawPose(c.char, n, ctxOf(c)); const i = s.indexOf(TABLE_FRONT); return i < 0 ? (layer === 'back' ? s : '') : layer === 'back' ? s.slice(0, i) : s.slice(i + TABLE_FRONT.length); };
    if (!moving) return `<g>${part(list[list.length - 1]!)}</g>`;
    let s = '';
    list.forEach((n, i) => {
      const a = at?.[i] ?? i / list.length, b = at?.[i + 1] ?? (i + 1) / list.length;
      const k = nc();
      s += `<g class="${k}" style="opacity:${i === 0 ? 1 : 0}">${part(n)}</g>`;
      if (list.length > 1) {
        const kf: Keyframe[] = [{ offset: 0, opacity: i === 0 ? 1 : 0, easing: 'step-end' }];
        if (i > 0) kf.push({ offset: a, opacity: 1, easing: 'step-end' });
        if (i < list.length - 1) kf.push({ offset: b, opacity: 0, easing: 'step-end' });
        kf.push({ offset: 1, opacity: i < list.length - 1 ? 0 : 1 });
        wire(k, kf, start, dur);
      }
    });
    return s;
  };

  const lightOver = (p: Panel): string => {
    const L = set.light;
    if (!L.alpha) return '';
    // the room's light falls on the character (multiply tint) and the far side is in shadow
    return `<rect x="${r1(p.x)}" y="${r1(p.y)}" width="${r1(p.w)}" height="${r1(p.h)}" fill="${L.tint}" opacity="${L.alpha}" style="mix-blend-mode:multiply"/>`
      + `<linearGradient id="${id}lg" x1="${L.side > 0 ? 1 : 0}" x2="${L.side > 0 ? 0 : 1}" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>`
      + `<rect x="${r1(p.x)}" y="${r1(p.y)}" width="${r1(p.w)}" height="${r1(p.h)}" fill="url(#${id}lg)"/>`;
  };

  /** Effects drawn in panel space (behind or over the subject). */
  const fxBehind = (s: Shot, p: Panel, start: number, dur: number): string => {
    const fx = new Set(s.fx ?? []);
    let out = '';
    const cx = p.x + p.w / 2, cy = p.y + p.h * 0.42;
    if (fx.has('focus') || s.cut === 'freeze') {
      const k = nc();
      out += `<g class="${k}" style="transform-origin:${r1(cx)}px ${r1(cy)}px">${focusLines(cx, cy, p.w, p.h, Math.min(p.w, p.h) * 0.36, lite ? 36 : 72)}</g>`;
      if (moving) wire(k, [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], start, Math.min(dur, 240), { iterations: Math.max(1, Math.round(dur / 240)) });
    }
    for (const dir of ['speed', 'speedV'] as const) {
      if (!fx.has(dir)) continue;
      const k = nc();
      const v = dir === 'speedV';
      const len = v ? p.h : p.w;
      out += `<g transform="translate(${r1(p.x)} ${r1(p.y)})${v ? ` rotate(90) translate(0 ${r1(-p.w)})` : ''}"><g class="${k}">${speedLines(len * 1.4, v ? p.w : p.h, lite ? 16 : 30, cls)}</g></g>`;
      if (moving) wire(k, [{ transform: `translate(${r1(-len * 0.4)}px,0)` }, { transform: 'translate(0px,0)' }], start, dur);
    }
    if (fx.has('splash')) {
      const k = nc();
      out += `<g transform="translate(${r1(cx)} ${r1(cy)})"><g class="${k}" style="opacity:${moving ? 0 : 0.9}">${splash(Math.min(p.w, p.h) * 0.42, cls)}</g></g>`;
      if (moving) wire(k, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 0.95, offset: 0.25 }, { transform: 'scale(1)', opacity: 0.9 }], start, Math.min(dur, 360), { fill: 'forwards' });
    }
    return out;
  };
  const fxOver = (s: Shot, p: Panel, start: number, dur: number, home: boolean): string => {
    const fx = new Set(s.fx ?? []);
    let out = '';
    if (fx.has('tone')) out += `<rect x="${r1(p.x)}" y="${r1(p.y)}" width="${r1(p.w)}" height="${r1(p.h)}" fill="url(#dt-tone)" opacity=".5"/>`;
    if (fx.has('heavy')) {
      const k = nc();
      out += `<linearGradient id="${k}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".85"/><stop offset=".55" stop-color="#000" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`
        + `<g class="${k}" style="opacity:${moving ? 0 : 1}"><rect x="${r1(p.x)}" y="${r1(p.y)}" width="${r1(p.w)}" height="${r1(p.h * 0.7)}" fill="url(#${k}g)"/><rect x="${r1(p.x)}" y="${r1(p.y)}" width="${r1(p.w)}" height="${r1(p.h * 0.5)}" fill="url(#dt-tone2)" opacity=".6"/></g>`;
      if (moving) wire(k, [{ opacity: 0 }, { opacity: 1 }], start + dur * 0.15, dur * 0.4, { fill: 'forwards' });
    }
    // katakana sound effects only inside a home-style (Ink) panel
    if (home) for (const x of s.sfx ?? []) {
      const k = nc();
      const size = (x.size ?? 1) * Math.min(p.w, p.h) * 0.16;
      out += `<g class="${k}" style="opacity:${moving && (x.at ?? 0) > 0 ? 0 : 1};transform-origin:${r1(p.x + (x.x / 100) * p.w)}px ${r1(p.y + (x.y / 100) * p.h)}px">${letter(x.text, p.x + (x.x / 100) * p.w, p.y + (x.y / 100) * p.h, size, { rot: x.rot ?? -8, fill: x.red ? RED : INK })}</g>`;
      if (moving) wire(k, [{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'scale(1)' }], start + (x.at ?? 0) * dur, 120, { fill: 'both' });
    }
    return out;
  };

  /** One character in a close-up panel (the camera moves over it). */
  const closeUp = (s: Shot, p: Panel, who: CastEntry, poses: string[], start: number, dur: number, extra: { dealer?: string; props?: PropUse[]; mirror?: boolean; second?: { c: CastEntry; poses: string[] } } = {}): string => {
    const cam = (wide ? s.wide ?? s.cam : s.cam) ?? { x: 120, y: 150, zoom: wide ? 1.15 : 1.6 };
    const from = camT(p, cam), to = cam.to && moving ? camT(p, cam.to) : from;
    const k = nc();
    const home = who.char.home === o.table.theme;
    const bg = home ? set.closeBg({ lite }) : `<rect x="-400" y="-300" width="1040" height="900" fill="${set.paper}"/>`;
    let props = '';
    for (const pr of extra.props ?? s.props ?? []) {
      if (pr.if && !act1.has(pr.if as never)) continue;
      const svgp = propSvg(who.char, pr);
      if (!svgp) continue;
      const pk = nc();
      const tf = `translate(${pr.x}px, ${pr.y}px) rotate(${pr.rot ?? 0}deg) scale(${pr.scale ?? 1})`;
      const end = pr.move ? `translate(${pr.move.x}px, ${pr.move.y}px) rotate(${pr.move.rot ?? pr.rot ?? 0}deg) scale(${pr.move.scale ?? pr.scale ?? 1})` : tf;
      const visible = !moving || !(pr.at && pr.at > 0);
      props += `<g class="${pk}" style="transform:${moving ? tf : end};opacity:${visible ? 1 : 0}">${svgp}</g>`;
      if (moving && (pr.move || (pr.at ?? 0) > 0)) {
        const a = pr.at ?? 0;
        wire(pk, [{ offset: 0, transform: tf, opacity: a > 0 ? 0 : 1 }, ...(a > 0 ? [{ offset: a, transform: tf, opacity: 1 }] : []), { offset: 1, transform: end, opacity: 1 }], start, dur, { fill: 'forwards' });
      }
    }
    const dealer = extra.dealer ? `<g transform="translate(${CHAR_W * 0.95} 0) scale(-1 1) translate(${-CHAR_W} 0) translate(${-CHAR_W * 0.9} 0)">${set.dealer[extra.dealer] ?? set.dealer.slide ?? ''}</g>` : '';
    const secondAt = (layer: 'back' | 'front') => (extra.second ? `<g transform="translate(${CHAR_W * 0.9} 0) translate(${CHAR_W} 0) scale(-1 1)">${poseRun(extra.second.c, extra.second.poses, undefined, start, dur, layer)}</g>` : '');
    const mir = extra.mirror ? `transform="translate(${CHAR_W} 0) scale(-1 1)"` : '';
    const body = `<g ${mir}>${poseRun(who, poses, s.at, start, dur, 'back')}</g>`;
    const front = `<g ${mir}>${poseRun(who, poses, s.at, start, dur, 'front')}</g>`;
    const edge = set.edge({ felt: o.table.felt, rim: o.table.rim });
    // behind the table edge: the room, the dealer, the bodies; in front: arms on the table, then the props
    const inner = `<g class="${k}" style="transform:${camCss(from)}">${bg}${dealer}${secondAt('back')}${body}${edge}${secondAt('front')}${front}${props}</g>`;
    if (moving && (cam.to || (s.poses?.length ?? 0) > 1)) {
      // the push-in, with a small bump on each new key pose (the camera reacts to the hit)
      const kf: Keyframe[] = [{ offset: 0, transform: camCss(from) }];
      const n = poses.length;
      for (let i = 1; i < n; i++) {
        const a = s.at?.[i] ?? i / n;
        const mid = { k: from.k + (to.k - from.k) * a, tx: from.tx + (to.tx - from.tx) * a, ty: from.ty + (to.ty - from.ty) * a };
        const bump = { k: mid.k * 1.035, tx: mid.tx - (p.w / 2) * 0.035 + (p.x * 0), ty: mid.ty - (p.h / 2) * 0.035 };
        if (a > 0.02 && a < 0.96) { kf.push({ offset: a, transform: camCss(mid) }); kf.push({ offset: Math.min(0.99, a + 0.04), transform: camCss(bump) }); }
      }
      kf.push({ offset: 1, transform: camCss(to) });
      kf.sort((x, y) => (x.offset as number) - (y.offset as number));
      wire(k, kf, start, dur, { fill: 'forwards' });
    }
    return `${fxBehind(s, p, start, dur)}${inner}${lightOver(p)}${fxOver(s, p, start, dur, who.char.home === 'ink')}`;
  };

  /** The room: the set, everyone in their seats, the table. */
  const world = (s: Shot, p: Panel, start: number, dur: number, focus: CastEntry[]): string => {
    const seats = set.seats;
    const shown = o.cast.slice(0, seats.length);
    for (const f of focus) if (!shown.includes(f)) shown[shown.length - 1] = f;
    // seats are filled from the middle outwards (the set lists them that way): the star nearest the middle
    const order = [...shown].sort((a, b) => Number(focus.includes(b)) - Number(focus.includes(a)));
    const placed = order.map((c, i) => ({ c, seat: seats[i]! }));
    const look = { lite, felt: o.table.felt, rim: o.table.rim };
    let sitters = '', fronts = '';
    for (const { c, seat } of [...placed].sort((a, b) => a.seat.y - b.seat.y)) {
      const posesW = focus[0] === c && s.poses?.length ? s.poses : ['sit'];
      const shadow = `<ellipse cx="${seat.x + set.light.side * 30}" cy="${seat.y + 6}" rx="${110 * seat.scale}" ry="${18 * seat.scale}" fill="#000" opacity=".25"/>`;
      const tf = `translate(${r1(seat.x - (CHAR_W / 2) * seat.scale)} ${r1(seat.y - TABLE_Y * seat.scale)}) scale(${seat.scale})`;
      sitters += shadow + `<g transform="${tf}">${poseRun(c, posesW, s.at, start, dur, 'back')}</g>`;
      fronts += `<g transform="${tf}">${poseRun(c, posesW, s.at, start, dur, 'front')}</g>`;
    }
    // the camera: the whole room on wide screens; on phones, close on the focus (one or two characters)
    const fs = placed.filter((x) => focus.includes(x.c)).map((x) => x.seat);
    const fx = fs.length ? fs.reduce((a, b) => a + b.x, 0) / fs.length : WORLD_W / 2;
    const span = wide ? WORLD_W : Math.max(620, (Math.max(...fs.map((q) => q.x), fx) - Math.min(...fs.map((q) => q.x), fx)) + 520);
    const k0 = Math.max(p.w / span, p.h / WORLD_H);
    const cy = wide ? WORLD_H * 0.5 : 470;
    const t = { k: k0, tx: p.x + p.w / 2 - Math.min(Math.max(fx, p.w / 2 / k0), WORLD_W - p.w / 2 / k0) * k0, ty: p.y + p.h / 2 - cy * k0 };
    const t2 = { k: t.k * 1.06, tx: t.tx - (p.w / 2) * 0.06, ty: t.ty - (p.h / 2) * 0.06 };
    const k = nc();
    if (moving) wire(k, [{ transform: camCss(t) }, { transform: camCss(t2) }], start, dur, { fill: 'forwards', easing: 'ease-out' });
    const pot = `<g transform="translate(800 690) scale(2.2)">${set.chips(5)}</g>`;
    return `<g class="${k}" style="transform:${camCss(t)}">${set.back(look)}${sitters}${set.table(look)}${fronts}${pot}</g>${lightOver(p)}${fxOver(s, p, start, dur, o.table.theme === 'ink')}`;
  };

  // ---------------------------------------------------------------- build every shot
  let shatterAt = -1;
  shots.forEach((s, i) => {
    const { at, d } = times[i]!;
    const p = panelOf(s, i);
    const pk = `${id}p${i}`;
    const clip = `${id}k${i}`;
    let content = '';
    const who = s.who ?? (s.cut === 'establish' ? 'table' : s.cut === 'reaction' ? (m.kind === 'rebuy' ? 'dealer' : m.cast ? 'losers' : 'target') : 'star');
    if (who === 'table' || who === 'cast') content = world(s, p, at, d, [star, ...(target ? [target] : [])]);
    else if (who === 'dealer') {
      // the dealer's shot (the theme's dealer: Kage at Ink) sliding the chips over
      content = closeUpDealer(s, p, at, d);
    } else if (who === 'target' || who === 'losers') {
      const list = who === 'target' ? (target ? [{ e: target, key: 'target' }] : []) : losers.slice(0, wide ? 3 : 2).map((x) => ({ e: x.e, key: m.kind === 'comeback' ? 'comebackLost' : m.kind === 'lastStanding' ? 'lastLost' : x.out === 'out' ? 'out' : x.out === 'split' ? 'split' : 'lost' }));
      if (m.kind === 'split' && splitWith) { const e = o.cast.find((c) => c.pid === splitWith.pid); if (e && !list.some((x) => x.e === e)) list.unshift({ e, key: 'split' }); }
      if (!list.length) list.push({ e: star, key: 'witness' });
      const sub = list.length;
      content = list.map((x, j) => {
        const sp: Panel = { ...p, x: p.x + (p.w / sub) * j, w: p.w / sub };
        const r = reactionOf(x.e.char, x.key);
        const rs: Shot = { ...s, cam: s.cam ?? { x: 120, y: 140, zoom: sub > 1 ? 1.5 : 1.9 }, wide: s.wide ?? { x: 120, y: 150, zoom: 1.35 }, fx: [...(s.fx ?? []), ...(r.fx ?? [])], sfx: [...(s.sfx ?? []), ...(r.sfx ?? [])] };
        return `<clipPath id="${clip}s${j}"><rect x="${r1(sp.x)}" y="${r1(sp.y)}" width="${r1(sp.w)}" height="${r1(sp.h)}"/></clipPath><g clip-path="url(#${clip}s${j})">${closeUp(rs, sp, x.e, r.poses, at, d, { props: r.props, mirror: j % 2 === 1, dealer: r.dealer })}</g>`
          + (j > 0 ? `<path d="M${r1(sp.x)} ${r1(sp.y)} L${r1(sp.x + 10)} ${r1(sp.y + sp.h)}" stroke="${INK}" stroke-width="5"/>` : '');
      }).join('');
    } else {
      const shown = s.poses?.length ? s.poses : ['sit'];
      const second = (m.kind === 'split' && splitWith && s.cut === 'act') ? o.cast.find((c) => c.pid === splitWith.pid) : undefined;
      content = closeUp(s, p, star, shown, at, d, { second: second ? { c: second, poses: reactionOf(second.char, 'split').poses } : undefined, dealer: s.dealer });
    }
    // freeze: the big word, stamped in the table's lettering, with the red accent
    let stamp = '';
    const w = s.word ?? (s.cut === 'freeze' ? word : '');
    if (w) {
      const fsz = Math.min(p.w / Math.max(6, w.length * 0.7), p.h * 0.19);
      const wx = p.x + p.w / 2, wy = p.y + p.h * 0.9;
      const k = nc();
      stamp = `<g class="${k}" style="transform-origin:${r1(wx)}px ${r1(wy)}px;opacity:${moving ? 0 : 1}">`
        + `<path d="M${r1(wx - fsz * w.length * 0.34)} ${r1(wy - fsz * 0.2)} L${r1(wx + fsz * w.length * 0.36)} ${r1(wy - fsz * 0.55)} L${r1(wx + fsz * w.length * 0.33)} ${r1(wy + fsz * 0.12)} L${r1(wx - fsz * w.length * 0.37)} ${r1(wy + fsz * 0.3)}Z" fill="${set.red}"/>`
        + letter(w, wx + fsz * 0.05, wy + fsz * 0.08, fsz, { font: o.table.font, fill: INK, outline: WHITE, rot: -4 })
        + letter(w, wx, wy, fsz, { font: o.table.font, fill: WHITE, outline: INK, rot: -4 })
        + '</g>';
      if (moving) wire(k, [{ opacity: 0, transform: 'scale(2.4) rotate(-6deg)' }, { opacity: 1, transform: 'scale(.94) rotate(0deg)', offset: 0.55 }, { opacity: 1, transform: 'scale(1) rotate(0deg)' }], at + Math.min(60, d * 0.1), Math.min(260, d * 0.6), { fill: 'forwards', easing: 'cubic-bezier(.2,1.4,.4,1)' });
    }
    const flash = new Set(s.fx ?? []).has('flash') && moving ? (() => { const k = nc(); wire(k, [{ opacity: 0 }, { opacity: 0.95, offset: 0.2 }, { opacity: 0 }], at, 180); return `<rect class="${k}" x="${r1(p.x)}" y="${r1(p.y)}" width="${r1(p.w)}" height="${r1(p.h)}" fill="${WHITE}" style="opacity:0"/>`; })() : '';
    if (new Set(s.fx ?? []).has('shatter') && !lite) shatterAt = i;
    const border = `<polygon points="${poly(p)}" fill="none" stroke="${set.paper}" stroke-width="12"/><polygon points="${poly(p)}" fill="none" stroke="${INK}" stroke-width="${p.inset ? 5 : 6}" stroke-linejoin="miter"/>`;
    const cutIn = homeCutIn && (who === 'star') ? `<polygon points="${poly(p)}" fill="none" stroke="${RED}" stroke-width="2.5" transform="translate(4 4)"/>` : '';
    frag.push(`<clipPath id="${clip}"><polygon points="${poly(p)}"/></clipPath><g class="${pk}" data-shot="${i}" data-cut="${s.cut}" style="opacity:${i === 0 || !moving && o.motion !== 'calm' ? 1 : 0}"><polygon points="${poly(p)}" fill="${set.paper}"/><g clip-path="url(#${clip})">${content}${flash}</g>${border}${cutIn}${stamp}</g>`);
    if (moving) {
      const off = { left: [-W * 0.6, 0], right: [W * 0.6, 0], top: [0, -H * 0.7], bottom: [0, H * 0.7] }[p.from];
      wire(pk, [{ opacity: 1, transform: `translate(${off[0]}px, ${off[1]}px) rotate(${p.tilt * 2}deg)` }, { opacity: 1, transform: 'translate(0px, 0px) rotate(0deg)', offset: 0.6 }, { opacity: 1, transform: 'translate(0px,0px)' }], at, Math.min(150, d * 0.4), { fill: 'forwards', easing: 'cubic-bezier(.3,1.5,.5,1)' });
    } else if (o.motion === 'calm') {
      wire(pk, [{ opacity: 0 }, { opacity: 1 }], at, 1, { fill: 'forwards' });
    }
    if (moving && !lite && new Set(s.fx ?? []).has('shake')) wire(`${id}sh`, [0, 1, 2, 3, 4, 5].map((j) => ({ transform: `translate(${j === 5 ? 0 : ((j * 37) % 7) - 3}px, ${j === 5 ? 0 : ((j * 53) % 9) - 4}px)` })), at + Math.min(80, d * 0.2), 220);
  });
  // a panel border shattering on a big moment: shards fly off the page edge
  if (shatterAt >= 0 && moving) {
    const { at } = times[shatterAt]!;
    let shards = '';
    for (let j = 0; j < 10; j++) {
      const k = nc();
      const x = (j % 5) * (W / 4), y = j < 5 ? 0 : H;
      shards += `<polygon class="${k}" points="${r1(x)},${r1(y)} ${r1(x + 26)},${r1(y + (j < 5 ? 14 : -14))} ${r1(x + 8)},${r1(y + (j < 5 ? 30 : -30))}" fill="${INK}" style="opacity:0"/>`;
      wire(k, [{ opacity: 1, transform: 'translate(0px,0px) rotate(0deg)' }, { opacity: 0, transform: `translate(${(j % 5 - 2) * 30}px, ${j < 5 ? -60 : 60}px) rotate(${(j * 47) % 180}deg)` }], at + 40, 420, { fill: 'forwards' });
    }
    frag.push(shards);
  }
  frag.push('</g>');
  svg.innerHTML = frag.join('');
  svg.querySelector('.dr-shake')?.classList.add(`${id}sh`);
  if (o.skippable !== false) root.insertAdjacentHTML('beforeend', '<span class="dr-skip" aria-hidden="true">tap to skip</span>');
  o.host.append(root);

  // ---------------------------------------------------------------- run
  const live: Animation[] = [];
  for (const w of wires) {
    for (const el of svg.querySelectorAll(w.sel)) {
      const a = (el as SVGElement).animate(w.kf, { duration: Math.max(1, w.dur), delay: w.at, fill: w.o?.fill ?? 'both', easing: w.o?.easing ?? 'linear', iterations: w.o?.iterations ?? 1 });
      live.push(a);
    }
  }
  let resolve!: () => void;
  const done = new Promise<void>((r) => { resolve = r; });
  let over = false;
  const finish = () => { if (over) return; over = true; clearTimeout(timer); for (const a of live) a.cancel(); root.remove(); resolve(); };
  const timer = setTimeout(finish, total);
  if (o.paused) { clearTimeout(timer); for (const a of live) a.pause(); }
  const seek = (shot: number) => {
    clearTimeout(timer);
    const t = Math.min(total - 1, (times[shot]?.at ?? 0) + (times[shot]?.d ?? 0) * 0.92);
    for (const a of live) { a.pause(); a.currentTime = t; }
  };
  return { el: root, done, stop: finish, seek, shots: shots.length, ms: total };

  function closeUpDealer(s: Shot, p: Panel, at: number, d: number): string {
    const cam = (wide ? s.wide ?? s.cam : s.cam) ?? { x: 120, y: 170, zoom: wide ? 1.2 : 1.45 };
    const t = camT(p, cam);
    const k = nc();
    const pose = set.dealer[s.poses?.[0] ?? 'slide'] ?? set.dealer.slide ?? '';
    const chips = `<g class="${k}" style="transform:translate(40px, 250px)">${set.chips(6)}</g>`;
    if (moving) wire(k, [{ transform: 'translate(40px, 250px)' }, { transform: 'translate(210px, 252px)' }], at + d * 0.2, d * 0.6, { fill: 'forwards', easing: 'ease-in-out' });
    return `${fxBehind(s, p, at, d)}<g style="transform:${camCss(t)}">${set.closeBg({ lite })}${pose}${set.edge({ felt: o.table.felt, rim: o.table.rim })}${chips}</g>${lightOver(p)}`;
  }
}

export const SCENE_CSS = `.dr-scene{position:absolute;z-index:40;overflow:hidden;contain:strict;box-shadow:6px 7px 0 rgba(0,0,0,.85);border:3px solid #111;background:#f5f2ea;pointer-events:auto;cursor:pointer;touch-action:manipulation}
.dr-scene svg{display:block;width:100%;height:100%}
.dr-scene .dr-skip{position:absolute;right:8px;top:6px;font:600 10px/1 'M PLUS 1p',system-ui,sans-serif;letter-spacing:.06em;color:#111;background:#f5f2ea;border:1.5px solid #111;padding:3px 6px;opacity:.85;pointer-events:none}
.dr-scene[data-motion=still] .dr-skip{display:none}`;
