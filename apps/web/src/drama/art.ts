// Table drama: shared drawing helpers for characters and sets (manga line art). Everything returns SVG markup.
// The engine defines the tone patterns (TONE_DEFS) once per scene, so any drawing may fill with them:
//   url(#dt-tone)  light dots      url(#dt-tone2)  dense dots      url(#dt-hatch)  diagonal lines
export const INK = '#111';
export const PAPER = '#f5f2ea';
export const WHITE = '#fff';
export const RED = '#e8202a';

export type Pt = readonly [number, number];
const r1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/** Catmull-Rom through the points, sampled (k samples per segment). */
function spline(pts: readonly Pt[], k = 6): Pt[] {
  if (pts.length < 3) {
    const [a, b] = [pts[0]!, pts[pts.length - 1]!];
    return Array.from({ length: k + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / k, a[1] + ((b[1] - a[1]) * i) / k] as Pt);
  }
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/**
 * A brush stroke with line weight: thick in the middle, tapered at both ends (or `taper: 'start' | 'end'` for one
 * end only, like a contour that runs into another). Returns a filled path.
 */
export function brush(pts: readonly Pt[], w: number, o: { taper?: 'both' | 'start' | 'end' | 'none'; fill?: string; min?: number } = {}): string {
  const s = spline(pts, pts.length > 6 ? 4 : 6);
  const n = s.length;
  const taper = o.taper ?? 'both';
  const min = o.min ?? 0.18;
  const left: string[] = [], right: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = s[Math.max(0, i - 1)]!, b = s[Math.min(n - 1, i + 1)]!;
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const shape = taper === 'both' ? Math.sin(Math.PI * t) : taper === 'start' ? Math.sin((Math.PI / 2) * t) : taper === 'end' ? Math.cos((Math.PI / 2) * t) : 1;
    const hw = (w / 2) * (min + (1 - min) * Math.pow(Math.max(0, shape), 0.55));
    left.push(`${r1(s[i]![0] - dy * hw)} ${r1(s[i]![1] + dx * hw)}`);
    right.push(`${r1(s[i]![0] + dy * hw)} ${r1(s[i]![1] - dx * hw)}`);
  }
  return `<path d="M${left.join('L')}L${right.reverse().join('L')}Z" fill="${o.fill ?? INK}"/>`;
}

/** A closed shape: filled, with a brushed outline of varying weight (heavier along the bottom: weight falls). */
export function shape(d: string, o: { fill?: string; w?: number; join?: 'round' | 'miter' } = {}): string {
  return `<path d="${d}" fill="${o.fill ?? WHITE}" stroke="${INK}" stroke-width="${o.w ?? 3.4}" stroke-linejoin="${o.join ?? 'round'}"/>`;
}

/** A plain line (inner details, folds): round caps. */
export function line(d: string, w = 1.8, color = INK): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// ---------------------------------------------------------------- tone
export const TONE_DEFS = `<pattern id="dt-tone" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="2.5" cy="2.5" r="1.05" fill="${INK}"/></pattern>`
  + `<pattern id="dt-tone2" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="${INK}" opacity=".18"/><circle cx="2" cy="2" r="1.45" fill="${INK}"/></pattern>`
  + `<pattern id="dt-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 0 V5" stroke="${INK}" stroke-width="1.1"/></pattern>`
  + `<pattern id="dt-paper" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="${PAPER}"/><circle cx="2" cy="3" r=".5" fill="${INK}" opacity=".05"/><circle cx="7" cy="7" r=".4" fill="${INK}" opacity=".05"/></pattern>`;

/** A tone fill over a region (shadow side of a form). */
export const tone = (d: string, dense = false): string => `<path d="${d}" fill="url(#${dense ? 'dt-tone2' : 'dt-tone'})"/>`;

// ---------------------------------------------------------------- face marks
/** A sweat drop (s: size ~1). */
export function sweat(x: number, y: number, s = 1, rot = 0): string {
  return `<g transform="translate(${r1(x)} ${r1(y)}) rotate(${rot}) scale(${s})"><path d="M0 -9 C4 -2 6 2 6 5 A6 6 0 0 1 -6 5 C-6 2 -4 -2 0 -9Z" fill="${WHITE}" stroke="${INK}" stroke-width="1.8"/><path d="M-2.6 3 Q-2.6 6 0 7" fill="none" stroke="${INK}" stroke-width="1"/></g>`;
}
/** The anger mark (a cross of bulging veins), in red. */
export function anger(x: number, y: number, s = 1): string {
  const arm = 'M2 -9 Q2 -2 9 -2';
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${s})" fill="none" stroke="${RED}" stroke-width="2.6" stroke-linecap="round">${[0, 90, 180, 270].map((a) => `<path d="${arm}" transform="rotate(${a})"/>`).join('')}</g>`;
}
/** Shadowed eyes: a band of ink across the eyes, with small white glints (menace, or being crushed). */
export function shadowEyes(cx: number, y: number, w: number, glint = true): string {
  return `<path d="M${r1(cx - w / 2)} ${r1(y - 7)} Q${cx} ${r1(y - 11)} ${r1(cx + w / 2)} ${r1(y - 7)} L${r1(cx + w / 2 - 2)} ${r1(y + 6)} Q${cx} ${r1(y + 9)} ${r1(cx - w / 2 + 2)} ${r1(y + 6)}Z" fill="${INK}"/>`
    + (glint ? `<circle cx="${r1(cx - w * 0.22)}" cy="${r1(y)}" r="1.6" fill="${WHITE}"/><circle cx="${r1(cx + w * 0.22)}" cy="${r1(y)}" r="1.6" fill="${WHITE}"/>` : '');
}
/** Blush hatching on a cheek. */
export const blush = (x: number, y: number): string => line(`M${x - 6} ${y + 3} l4 -6 M${x - 1} ${y + 3} l4 -6 M${x + 4} ${y + 3} l4 -6`, 1.2);
/** Tears streaming (comic). */
export const tears = (x: number, y: number): string => `<path d="M${x} ${y} q-3 14 1 26 q4 -12 1 -26Z" fill="${WHITE}" stroke="${INK}" stroke-width="1.4"/>`;
/** Little impact ticks around a point (a hit, a slam). */
export function impact(x: number, y: number, r = 16, n = 7): string {
  let d = '';
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.3; d += `M${r1(x + Math.cos(a) * r)} ${r1(y + Math.sin(a) * r)} L${r1(x + Math.cos(a) * r * 1.7)} ${r1(y + Math.sin(a) * r * 1.7)}`; }
  return line(d, 2.4);
}
/** Motion lines behind something moving (dir in degrees). */
export function motion(x: number, y: number, len: number, dir: number, n = 4, spread = 10): string {
  const a = (dir * Math.PI) / 180;
  let d = '';
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * spread;
    const sx = x - Math.sin(a) * o, sy = y + Math.cos(a) * o;
    const l = len * (0.6 + 0.4 * ((i * 37) % 10) / 10);
    d += `M${r1(sx)} ${r1(sy)} L${r1(sx - Math.cos(a) * l)} ${r1(sy - Math.sin(a) * l)}`;
  }
  return line(d, 1.6);
}

// ---------------------------------------------------------------- chips (the Ink chips: white 勝, red-centred 賭)
/** One chip seen from the side (a stack's slice) at (x, y), width w. */
const chipSide = (x: number, y: number, w: number, red: boolean): string =>
  `<rect x="${r1(x - w / 2)}" y="${r1(y - 4)}" width="${r1(w)}" height="4.4" rx="1.2" fill="${red ? INK : WHITE}" stroke="${INK}" stroke-width="1.3"/>`
  + `<path d="M${r1(x - w * 0.28)} ${r1(y - 4)}v4.4M${r1(x)} ${r1(y - 4)}v4.4M${r1(x + w * 0.28)} ${r1(y - 4)}v4.4" stroke="${red ? RED : RED}" stroke-width="${r1(w * 0.09)}"/>`;
/** A chip face-up (top of a stack, or flying), radius r. */
export function chipTop(x: number, y: number, r: number, red: boolean, tilt = 0.45): string {
  const ry = r * tilt;
  const notches = [0, 60, 120, 180, 240, 300].map((a) => { const t = (a * Math.PI) / 180; return `<ellipse cx="${r1(x + Math.cos(t) * r * 0.82)}" cy="${r1(y + Math.sin(t) * ry * 0.82)}" rx="${r1(r * 0.15)}" ry="${r1(ry * 0.16)}" fill="${red ? WHITE : RED}"/>`; }).join('');
  return `<ellipse cx="${r1(x)}" cy="${r1(y + 2.5)}" rx="${r1(r)}" ry="${r1(ry)}" fill="${red ? INK : WHITE}" stroke="${INK}" stroke-width="1.4"/>`
    + `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(r)}" ry="${r1(ry)}" fill="${red ? INK : WHITE}" stroke="${INK}" stroke-width="1.4"/>${notches}`
    + `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(r * 0.55)}" ry="${r1(ry * 0.55)}" fill="${red ? RED : WHITE}" stroke="${INK}" stroke-width=".8" stroke-dasharray="1.6 1.2"/>`
    + `<text x="${r1(x)}" y="${r1(y + ry * 0.35)}" text-anchor="middle" font-family="'Reggae One',serif" font-size="${r1(r * 0.62)}" fill="${red ? WHITE : INK}" transform="translate(${r1(x)} ${r1(y)}) scale(1 ${tilt + 0.25}) translate(${r1(-x)} ${r1(-y)})">${red ? '賭' : '勝'}</text>`;
}
/** A stack of n chips (alternating colours every few), base at (x, y). */
export function chipStack(x: number, y: number, n: number, w = 26, red = false): string {
  let s = '';
  for (let i = 0; i < n; i++) s += chipSide(x + ((i * 7) % 3) - 1, y - i * 4.2, w, red !== (i % 5 === 4));
  return s + chipTop(x + (((n - 1) * 7) % 3) - 1, y - n * 4.2 + 1, w / 2, red);
}

// ---------------------------------------------------------------- effects art (world-free, unit square based)
/** Focus lines converging on (cx, cy) from outside a box w x h (inner radius r0). Deterministic. */
export function focusLines(cx: number, cy: number, w: number, h: number, r0: number, n = 64): string {
  const R = Math.hypot(w, h);
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + ((i * 7919) % 13) * 0.004;
    const rin = r0 * (0.85 + ((i * 31) % 10) / 22);
    const wd = 0.012 + ((i * 17) % 7) * 0.0035;
    const x1 = cx + Math.cos(a - wd) * R, y1 = cy + Math.sin(a - wd) * R, x2 = cx + Math.cos(a + wd) * R, y2 = cy + Math.sin(a + wd) * R;
    d += `M${r1(cx + Math.cos(a) * rin)} ${r1(cy + Math.sin(a) * rin)}L${r1(x1)} ${r1(y1)}L${r1(x2)} ${r1(y2)}Z`;
  }
  return `<path d="${d}" fill="${INK}"/>`;
}
/** Parallel speed lines across a w x h box (horizontal; rotate the group for other directions). */
export function speedLines(w: number, h: number, n = 26, seed = 1): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const y = ((i + 0.5) / n) * h + (((i * 13 + seed * 7) % 9) - 4);
    const len = w * (0.35 + (((i * 29 + seed) % 11) / 11) * 0.6);
    const x = ((i * 53 + seed * 11) % 100) / 100 * (w - len);
    const t = 0.8 + ((i * 7) % 5) * 0.45;
    d += `M${r1(x)} ${r1(y)}L${r1(x + len)} ${r1(y - t)}L${r1(x + len)} ${r1(y + t)}Z`;
  }
  return `<path d="${d}" fill="${INK}"/>`;
}
/** An ink splash (impact), centred at 0,0, about 2r across. */
export function splash(r: number, seed = 3): string {
  let d = 'M';
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = i % 2 ? 0.55 + ((i * seed * 13) % 10) / 40 : 0.9 + ((i * seed * 7) % 10) / 14;
    d += `${r1(Math.cos(a) * r * k)} ${r1(Math.sin(a) * r * k)}${i < n - 1 ? 'L' : 'Z'}`;
  }
  let drops = '';
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + seed; const rr = r * (1.25 + (i % 3) * 0.18); drops += `<circle cx="${r1(Math.cos(a) * rr)}" cy="${r1(Math.sin(a) * rr)}" r="${r1(r * (0.05 + (i % 3) * 0.03))}" fill="${INK}"/>`; }
  return `<path d="${d}" fill="${INK}"/>${drops}`;
}

/** Lettering with a white knock-out outline (sound effects). */
export function letter(text: string, x: number, y: number, size: number, o: { rot?: number; fill?: string; font?: string; outline?: string } = {}): string {
  const font = o.font ?? "'Reggae One',serif";
  const fill = o.fill ?? INK;
  return `<text x="${r1(x)}" y="${r1(y)}" font-family="${font}" font-size="${r1(size)}" text-anchor="middle" transform="rotate(${o.rot ?? 0} ${r1(x)} ${r1(y)})" fill="${fill}" stroke="${o.outline ?? WHITE}" stroke-width="${r1(size * 0.16)}" paint-order="stroke" stroke-linejoin="round">${text}</text>`;
}

/** Initials from a name ("Dev Krishna" -> "DK"). */
export function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '?') + (w.length > 1 ? w[w.length - 1]![0]! : (w[0]?.[1] ?? ''))).toUpperCase();
}
