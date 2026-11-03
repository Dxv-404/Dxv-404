// The Brawler's body, drawn from his avatar (ink-brawler): spiky black hair, the red headband with its tails
// flying to his left, heavy brows, the plaster on his cheek, a white shirt under a black sleeveless vest, and the
// taped fists. Character space (types.ts): eyes on EYE_Y, the table at TABLE_Y.
import { anger, blush, brush, line, shadowEyes, sweat, tears, tone, INK, RED, WHITE, type Pt } from '../../art';
import { EYE_Y } from '../../types';

const f = (n: number): string => (Math.round(n * 10) / 10).toString();

// ---------------------------------------------------------------- faces
export type Brows = 'angry' | 'up' | 'flat' | 'worried' | 'cocky';
export type Eyes = 'dot' | 'glare' | 'wide' | 'shut' | 'shadow' | 'squeeze' | 'covered' | 'wink' | 'side';
export type Mouth = 'grit' | 'roar' | 'grin' | 'smirk' | 'flat' | 'puff' | 'kiss' | 'frown' | 'yawn' | 'bite' | 'laugh' | 'wobble' | 'blow';
export interface Face { brows: Brows; eyes: Eyes; mouth: Mouth; marks?: ('sweat' | 'sweat2' | 'anger' | 'blush' | 'tears' | 'veins' | 'plaster2' | 'steam')[] }
export interface HeadOpts { dx?: number; dy?: number; tilt?: number; /** the headband's tails: angle they fly at (deg, 0 = straight out to his left) */ flow?: number; /** the band slid down over the eyes (knocked out) */ bandDown?: boolean; turn?: number }

function brows(b: Brows): string {
  // heaviest marks on the face: thick wedge brows
  const L: Record<Brows, [Pt, Pt]> = { angry: [[-26, -16], [-5, -7]], up: [[-26, -21], [-6, -24]], flat: [[-26, -13], [-5, -12]], worried: [[-26, -9], [-6, -20]], cocky: [[-26, -18], [-5, -10]] };
  const R: Record<Brows, [Pt, Pt]> = { angry: [[26, -16], [5, -7]], up: [[26, -21], [6, -24]], flat: [[26, -13], [5, -12]], worried: [[26, -9], [6, -20]], cocky: [[26, -22], [5, -16]] };
  return brush([L[b][0], L[b][1]], 7.5, { taper: 'start', min: 0.45 }) + brush([R[b][0], R[b][1]], 7.5, { taper: 'start', min: 0.45 });
}
function eyes(e: Eyes): string {
  switch (e) {
    case 'dot': return `<path d="M-19 -2 h11 M8 -2 h11" stroke="${INK}" stroke-width="1.6"/><circle cx="-13" cy="1" r="3.4" fill="${INK}"/><circle cx="13" cy="1" r="3.4" fill="${INK}"/>`;
    case 'glare': return `<path d="M-22 -3 L-5 0 L-9 5 Q-16 6 -22 -3Z M22 -3 L5 0 L9 5 Q16 6 22 -3Z" fill="${WHITE}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="-11" cy="1.6" r="2.2" fill="${INK}"/><circle cx="11" cy="1.6" r="2.2" fill="${INK}"/>`;
    case 'wide': return `<ellipse cx="-13" cy="1" rx="7.5" ry="8.5" fill="${WHITE}" stroke="${INK}" stroke-width="2.6"/><ellipse cx="13" cy="1" rx="7.5" ry="8.5" fill="${WHITE}" stroke="${INK}" stroke-width="2.6"/><circle cx="-13" cy="1" r="1.7" fill="${INK}"/><circle cx="13" cy="1" r="1.7" fill="${INK}"/>`;
    case 'shut': return brush([[-21, 3], [-13, -4], [-5, 3]], 4.2) + brush([[5, 3], [13, -4], [21, 3]], 4.2);
    case 'squeeze': return brush([[-22, -4], [-8, 1], [-21, 6]], 4.2) + brush([[22, -4], [8, 1], [21, 6]], 4.2);
    case 'shadow': return shadowEyes(0, 0, 50);
    case 'covered': return '';
    case 'wink': return `<circle cx="-13" cy="1" r="3.6" fill="${INK}"/>` + brush([[5, 2], [13, -3], [21, 2]], 4.2);
    case 'side': return `<path d="M-21 -1 h14 M7 -1 h14" stroke="${INK}" stroke-width="2.2"/><circle cx="-17" cy="2" r="3.2" fill="${INK}"/><circle cx="9" cy="2" r="3.2" fill="${INK}"/>`;
  }
}
function mouth(m: Mouth): string {
  const y = 26;
  switch (m) {
    case 'grit': return `<path d="M-13 ${y - 3} L13 ${y - 3} L12 ${y + 5} L-12 ${y + 5}Z" fill="${WHITE}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` + line(`M-12 ${y + 1} H12 M-6 ${y - 3} V${y + 5} M0 ${y - 3} V${y + 5} M6 ${y - 3} V${y + 5}`, 1.2);
    case 'roar': return `<path d="M-15 ${y - 7} Q0 ${y - 12} 15 ${y - 7} L10 ${y + 14} Q0 ${y + 20} -10 ${y + 14}Z" fill="${INK}"/><path d="M-13 ${y - 6} L13 ${y - 6} L11 ${y - 2} L-11 ${y - 2}Z" fill="${WHITE}"/><path d="M-7 ${y + 12} Q0 ${y + 6} 7 ${y + 12}" fill="${RED}"/><path d="M-12 ${y - 4} l3 5 l3 -5 M6 ${y - 4} l3 5 l3 -5" fill="${WHITE}"/>`;
    case 'grin': return `<path d="M-17 ${y - 4} Q0 ${y - 1} 17 ${y - 5} Q12 ${y + 9} 0 ${y + 10} Q-12 ${y + 9} -17 ${y - 4}Z" fill="${WHITE}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` + line(`M-14 ${y + 1} Q0 ${y + 4} 14 ${y + 1} M-7 ${y - 2} V${y + 7} M0 ${y - 1} V${y + 9} M7 ${y - 2} V${y + 7}`, 1.1);
    case 'smirk': return brush([[-12, y + 1], [2, y + 2], [14, y - 5]], 3.6) + line(`M13 ${y - 6} l3 -2`, 1.6);
    case 'flat': return brush([[-10, y], [10, y]], 3.4);
    case 'puff': return `<ellipse cx="0" cy="${y + 1}" rx="4" ry="3" fill="${INK}"/>` + line(`M-30 ${y - 6} q-6 8 0 16 M30 ${y - 6} q6 8 0 16`, 2.4);
    case 'kiss': return `<path d="M-3 ${y - 4} q-6 4 0 8 q6 -4 0 -8Z" fill="${INK}"/>` + line(`M6 ${y - 10} q6 -3 9 2 q3 -5 8 -1 q2 6 -8 11 q-8 -6 -9 -12Z`, 1.6, RED);
    case 'frown': return brush([[-11, y + 4], [0, y - 2], [11, y + 4]], 3.6);
    case 'yawn': return `<ellipse cx="0" cy="${y + 4}" rx="10" ry="13" fill="${INK}"/><path d="M-6 ${y + 12} Q0 ${y + 7} 6 ${y + 12}" fill="${RED}"/><path d="M-7 ${y - 6} h14 v3 h-14z" fill="${WHITE}"/>`;
    case 'bite': return `<path d="M-14 ${y - 4} L14 ${y - 4} L13 ${y + 6} L-13 ${y + 6}Z" fill="${INK}"/><path d="M-13 ${y - 4} L13 ${y - 4} l-2 4 h-22z M-12 ${y + 6} L12 ${y + 6} l-2 -3 h-8z" fill="${WHITE}"/>`;
    case 'laugh': return `<path d="M-18 ${y - 6} Q0 ${y - 2} 18 ${y - 6} Q14 ${y + 16} 0 ${y + 18} Q-14 ${y + 16} -18 ${y - 6}Z" fill="${INK}"/><path d="M-15 ${y - 5} Q0 ${y - 1} 15 ${y - 5} L13 ${y - 1} Q0 ${y + 2} -13 ${y - 1}Z" fill="${WHITE}"/><path d="M-8 ${y + 14} Q0 ${y + 8} 8 ${y + 14}" fill="${RED}"/>`;
    case 'wobble': return line(`M-13 ${y + 2} q3 -4 6 0 q3 4 6 0 q3 -4 6 0 q3 4 6 0`, 3);
    case 'blow': return `<ellipse cx="2" cy="${y + 1}" rx="5" ry="4.5" fill="${INK}"/>` + line(`M10 ${y} q8 -2 14 -6 M10 ${y + 4} q10 0 16 2`, 1.6);
  }
}
function marks(ms: Face['marks'] = []): string {
  let s = '';
  for (const m of ms) {
    if (m === 'sweat') s += sweat(38, -26, 1.15, 18);
    if (m === 'sweat2') s += sweat(-40, -20, 0.9, -15) + sweat(44, 2, 0.8, 20);
    if (m === 'anger') s += anger(30, -42, 1.25);
    if (m === 'blush') s += blush(-22, 12) + blush(22, 12);
    if (m === 'tears') s += tears(-14, 8) + tears(14, 8);
    if (m === 'veins') s += line('M-8 -24 l3 -4 l-2 -3 M8 -25 l-3 -4 l3 -3', 1.8);
    if (m === 'plaster2') s += `<g transform="translate(-20 18) rotate(30)"><rect x="-11" y="-5" width="22" height="10" rx="2" fill="${WHITE}" stroke="${INK}" stroke-width="2"/><rect x="-11" y="-5" width="22" height="10" rx="2" fill="${WHITE}" stroke="${INK}" stroke-width="2" transform="rotate(90)"/>${line('M-3 -3 l6 6 M3 -3 l-6 6', 1)}</g>`;
    if (m === 'steam') s += line('M-30 -60 q-6 -8 0 -16 q6 -8 0 -16 M30 -60 q6 -8 0 -16 q-6 -8 0 -16', 2.6);
  }
  return s;
}

/** The head, eyes centred on (120 + dx, EYE_Y + dy). */
export function head(face: Face, o: HeadOpts = {}): string {
  const cx = 120 + (o.dx ?? 0), cy = EYE_Y + (o.dy ?? 0);
  const flow = o.flow ?? 10;
  const turn = o.turn ?? 0; // -1..1: a three-quarter turn (features slide over)
  const neck = `<path d="M-21 26 L-24 64 L24 64 L21 26Z" fill="${WHITE}" stroke="${INK}" stroke-width="3.2"/>` + tone('M-21 34 L-22 46 Q0 54 22 46 L21 34 Q0 44 -21 34Z');
  const faceShape = `<path d="M-31 -26 Q-34 -6 -33 6 Q-31 22 -26 30 Q-18 40 -10 42 L10 42 Q18 40 26 30 Q31 22 33 6 Q34 -6 31 -26 Q0 -36 -31 -26Z" fill="${WHITE}"/>`;
  const contour = brush([[-31, -24], [-34, -4], [-32, 14], [-26, 30], [-12, 42], [0, 43]], 4.6, { taper: 'start' }) + brush([[0, 43], [12, 42], [26, 30], [32, 14], [34, -4], [31, -24]], 4.6, { taper: 'end' });
  const ears = `<path d="M-32 -6 Q-42 -6 -40 6 Q-38 14 -31 13" fill="${WHITE}" stroke="${INK}" stroke-width="3"/><path d="M32 -6 Q42 -6 40 6 Q38 14 31 13" fill="${WHITE}" stroke="${INK}" stroke-width="3"/>`;
  const jawTone = tone('M-26 30 Q-18 40 -10 42 L10 42 Q18 40 26 30 Q20 34 0 36 Q-20 34 -26 30Z');
  const nose = line('M2 6 L-2 15 L4 16', 2);
  const plaster = `<g transform="translate(22 19) rotate(-20)"><rect x="-8" y="-4" width="16" height="8" rx="1.5" fill="${WHITE}" stroke="${INK}" stroke-width="1.8"/>${line('M-3 -4 v8 M2 -4 v8', 1)}</g>`;
  // hair: a spiky black mass with white streaks, the hairline zigzagging under the band
  const hair = `<path d="M-36 -8 L-46 -30 L-36 -30 L-50 -56 L-30 -50 L-34 -80 L-14 -64 L-6 -96 L8 -68 L22 -92 L28 -62 L46 -78 L42 -48 L58 -50 L44 -26 L52 -22 L36 -8 Q30 -24 22 -18 L14 -26 L6 -16 L-4 -26 L-12 -16 L-22 -24 Q-30 -22 -36 -8Z" fill="${INK}"/>`
    + line('M-24 -56 L-14 -40 M-2 -78 L2 -50 M18 -70 L14 -48 M34 -58 L26 -40', 1.6, WHITE);
  const band = o.bandDown
    ? `<path d="M-37 -8 Q0 -14 37 -8 L36 8 Q0 2 -36 8Z" fill="${RED}" stroke="${INK}" stroke-width="2.6"/>` + line('M-30 -2 Q0 -8 30 -2', 1, INK)
    : `<path d="M-37 -32 Q0 -40 37 -32 L36 -21 Q0 -28 -36 -21Z" fill="${RED}" stroke="${INK}" stroke-width="2.6"/>` + line('M-26 -27 Q0 -33 26 -27', 1, INK);
  const ky = o.bandDown ? 0 : -27;
  const tails = `<g transform="translate(36 ${ky}) rotate(${flow})"><path d="M0 0 L30 -10 Q36 -6 40 -14 L44 -4 L30 2 Z" fill="${RED}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M0 2 L26 12 Q32 10 36 16 L32 22 L22 14 Z" fill="${RED}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="0" cy="1" r="5" fill="${RED}" stroke="${INK}" stroke-width="2.2"/></g>`;
  const fe = `<g transform="translate(${f(turn * 6)} 0)">${o.bandDown ? '' : brows(face.brows)}${eyes(face.eyes)}${nose}${mouth(face.mouth)}${o.bandDown ? '' : ''}</g>`;
  return `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${o.tilt ?? 0} 0 30)">${neck}${ears}${faceShape}${jawTone}${contour}${fe}${plaster}${hair}${band}${tails}${marks(face.marks)}</g>`;
}

// ---------------------------------------------------------------- body
export interface TorsoOpts { dx?: number; dy?: number; rot?: number; /** shoulders hunched up (tension) */ hunch?: number; wide?: number }
/** Shoulders, chest and the black vest; the shoulder joints it returns are where the arms attach. */
export function torso(o: TorsoOpts = {}): { svg: string; shL: Pt; shR: Pt } {
  const dx = o.dx ?? 0, dy = o.dy ?? 0, h = o.hunch ?? 0, w = o.wide ?? 0;
  const cx = 120 + dx, top = 156 + dy;
  const sl = 86 + w, sy = top + 16 - h;
  const body = `M${cx - 22} ${top - 4} Q${cx - 50} ${top + 2 - h} ${cx - sl} ${sy} Q${cx - sl - 12} ${sy + 28} ${cx - sl + 6} ${top + 70} L${cx - 66} ${top + 170} L${cx + 66} ${top + 170} L${cx + sl - 6} ${top + 70} Q${cx + sl + 12} ${sy + 28} ${cx + sl} ${sy} Q${cx + 50} ${top + 2 - h} ${cx + 22} ${top - 4}Z`;
  const vestL = `M${cx - sl + 2} ${sy + 2} Q${cx - 50} ${top - h} ${cx - 28} ${top} L${cx - 16} ${top + 60} L${cx - 30} ${top + 170} L${cx - 66} ${top + 170} L${cx - sl + 8} ${top + 70} Q${cx - sl - 10} ${sy + 28} ${cx - sl + 2} ${sy + 2}Z`;
  // mirror the vest panel about cx
  const mirror = (d: string): string => d.replace(/(-?[0-9.]+) (-?[0-9.]+)/g, (_, x: string, y: string) => `${f(2 * cx - Number(x))} ${y}`);
  const svg = `<g transform="rotate(${o.rot ?? 0} ${cx} ${top + 120})">`
    + `<path d="${body}" fill="${WHITE}"/>`
    + tone(`M${cx - 16} ${top + 60} Q${cx} ${top + 76} ${cx + 16} ${top + 60} L${cx + 30} ${top + 170} L${cx - 30} ${top + 170}Z`)
    + line(`M${cx - 18} ${top + 4} L${cx} ${top + 40} L${cx + 18} ${top + 4} M${cx - 40} ${top + 58} Q${cx - 20} ${top + 70} ${cx - 2} ${top + 58} M${cx + 40} ${top + 58} Q${cx + 20} ${top + 70} ${cx + 2} ${top + 58} M${cx} ${top + 40} V${top + 60}`, 2)
    + `<path d="${vestL}" fill="${INK}"/><path d="${mirror(vestL)}" fill="${INK}"/>`
    + line(`M${cx - sl + 14} ${sy + 12} Q${cx - 60} ${top + 4} ${cx - 34} ${top + 6} M${cx + sl - 14} ${sy + 12} Q${cx + 60} ${top + 4} ${cx + 34} ${top + 6}`, 1.3, WHITE)
    + brush([[cx - 22, top - 4], [cx - 50, top + 2 - h], [cx - sl, sy], [cx - sl - 8, sy + 30], [cx - sl + 6, top + 72]], 5, { taper: 'end' })
    + brush([[cx + 22, top - 4], [cx + 50, top + 2 - h], [cx + sl, sy], [cx + sl + 8, sy + 30], [cx + sl - 6, top + 72]], 5, { taper: 'end' })
    + '</g>';
  const rot = ((o.rot ?? 0) * Math.PI) / 180;
  const rp = (x: number, y: number): Pt => { const px = x - cx, py = y - (top + 120); return [cx + px * Math.cos(rot) - py * Math.sin(rot), top + 120 + px * Math.sin(rot) + py * Math.cos(rot)]; };
  return { svg, shL: rp(cx - sl + 8, sy + 22), shR: rp(cx + sl - 8, sy + 22) };
}

// ---------------------------------------------------------------- arms and taped fists
export type Hand = 'fist' | 'open' | 'grip' | 'flick' | 'claw' | 'palm' | 'none';
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** A limb segment: a muscled shape between two joints, white with a brushed contour, toned on its lower side. */
function segment(a: Pt, b: Pt, wa: number, wb: number, bulge: number, sleeveBlack = false): string {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const m = lerp(a, b, 0.42);
  const wm = (wa + wb) / 2 + bulge;
  const p = (q: Pt, w: number, s: number): string => `${f(q[0] + nx * w * s)} ${f(q[1] + ny * w * s)}`;
  const d = `M${p(a, wa / 2, 1)} Q${p(m, wm / 2 + bulge * 0.6, 1)} ${p(b, wb / 2, 1)} L${p(b, wb / 2, -1)} Q${p(m, wm / 2, -1)} ${p(a, wa / 2, -1)}Z`;
  const shade = `M${p(a, wa / 2, ny > 0 ? 1 : -1)} Q${p(m, (wm / 2) * 1.0, ny > 0 ? 1 : -1)} ${p(b, wb / 2, ny > 0 ? 1 : -1)} L${p(b, wb * 0.05, ny > 0 ? 1 : -1)} Q${p(m, wm * 0.15, ny > 0 ? 1 : -1)} ${p(a, wa * 0.05, ny > 0 ? 1 : -1)}Z`;
  return `<path d="${d}" fill="${sleeveBlack ? INK : WHITE}"/>` + (sleeveBlack ? '' : tone(shade))
    + `<path d="${d}" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>`;
}
/** A taped fist (white wraps crossing the knuckles, a loose tape end) at p, pointing along `ang` (deg). */
export function hand(p: Pt, ang: number, kind: Hand, o: { tapeTail?: boolean; scale?: number; flip?: boolean } = {}): string {
  const s = o.scale ?? 1;
  const open = `<path d="M-14 -16 L14 -16 Q20 -14 20 -6 L20 14 Q18 20 10 20 L-12 20 Q-18 18 -18 10 L-18 -10 Q-18 -16 -14 -16Z" fill="${WHITE}" stroke="${INK}" stroke-width="3"/>`;
  let g = '';
  switch (kind) {
    case 'none': return '';
    case 'fist': case 'grip':
      g = `<path d="M-16 -18 Q-2 -24 14 -18 Q22 -12 22 0 Q22 16 12 20 L-12 20 Q-22 16 -22 2 Q-22 -12 -16 -18Z" fill="${WHITE}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>`
        + line('M-12 -19 Q-8 -24 -3 -20 M-3 -21 Q2 -25 7 -21 M7 -20 Q12 -24 16 -18', 2.2)
        + line('M-20 -6 L20 -9 M-21 4 L21 1 M-19 13 L19 11', 1.2)
        + line('M-14 -16 L12 18 M12 -18 L-12 18', 1, INK)
        + tone('M8 -18 Q22 -12 22 0 Q22 16 12 20 L4 20 Q14 8 8 -18Z')
        + (kind === 'grip' ? line('M-22 -2 Q-30 -4 -30 6 Q-28 12 -20 10', 3) : '');
      break;
    case 'open': case 'palm':
      g = open + line('M-12 -16 L-14 -34 M-4 -16 L-4 -38 M5 -16 L6 -37 M14 -14 L17 -30', 9) + line('M-12 -16 L-14 -34 M-4 -16 L-4 -38 M5 -16 L6 -37 M14 -14 L17 -30', 5.5, WHITE)
        + line('M-18 4 L-30 -6', 9) + line('M-18 4 L-30 -6', 5.5, WHITE) + line('M-18 0 L18 -2 M-18 10 L18 8', 1.1);
      break;
    case 'flick':
      g = `<path d="M-16 -14 Q0 -20 16 -14 Q22 -6 20 8 Q16 18 6 20 L-12 20 Q-22 14 -20 0Z" fill="${WHITE}" stroke="${INK}" stroke-width="3.2"/>` + line('M14 -12 L28 -30', 9) + line('M14 -12 L28 -30', 5.5, WHITE) + line('M-18 -2 L18 -4 M-18 8 L18 6', 1.1);
      break;
    case 'claw':
      g = open + line('M-12 -16 Q-18 -30 -8 -34 M-4 -16 Q-6 -34 4 -36 M5 -16 Q8 -32 16 -30', 8) + line('M-12 -16 Q-18 -30 -8 -34 M-4 -16 Q-6 -34 4 -36 M5 -16 Q8 -32 16 -30', 4.5, WHITE);
      break;
  }
  const tail = o.tapeTail ? `<path d="M-18 14 Q-34 22 -30 40 Q-24 30 -14 22Z" fill="${WHITE}" stroke="${INK}" stroke-width="2"/>` : '';
  return `<g transform="translate(${f(p[0])} ${f(p[1])}) rotate(${f(ang + 90)}) scale(${o.flip ? -s : s} ${s})">${tail}${g}</g>`;
}
export interface ArmSpec { el: Pt; wr: Pt; hand: Hand; rot?: number; tail?: boolean; scale?: number }
/** An arm from the shoulder: a thick upper arm, the forearm, the taped wrist and the hand. */
export function arm(sh: Pt, a: ArmSpec): string {
  const ang = (Math.atan2(a.wr[1] - a.el[1], a.wr[0] - a.el[0]) * 180) / Math.PI;
  const wrap = (() => {
    // tape wound round the wrist
    const p = lerp(a.el, a.wr, 0.86), q = lerp(a.el, a.wr, 0.97);
    return segment(p, q, 33, 31, 0);
  })();
  // round the joints: a deltoid cap on the shoulder, the elbow's seam hidden and its point brushed in
  const ua = Math.atan2(a.el[1] - sh[1], a.el[0] - sh[0]);
  const out: Pt = [a.el[0] + Math.cos(ua) * 14, a.el[1] + Math.sin(ua) * 14];
  const elbow = `<circle cx="${f(a.el[0])}" cy="${f(a.el[1])}" r="18.5" fill="${WHITE}"/>` + brush([[out[0] - Math.sin(ua) * 14, out[1] + Math.cos(ua) * 14], [out[0] + Math.cos(ua) * 6, out[1] + Math.sin(ua) * 6], [out[0] + Math.sin(ua) * 14, out[1] - Math.cos(ua) * 14]], 4.4);
  const delt = `<circle cx="${f(sh[0])}" cy="${f(sh[1])}" r="26" fill="${INK}"/>` + line(`M${f(sh[0] - 14)} ${f(sh[1] - 12)} Q${f(sh[0])} ${f(sh[1] - 22)} ${f(sh[0] + 14)} ${f(sh[1] - 12)}`, 1.4, WHITE);
  return segment(sh, a.el, 50, 42, 7) + segment(a.el, a.wr, 42, 32, 6) + elbow + delt + wrap + hand(a.wr, ang + (a.rot ?? 0), a.hand, { tapeTail: a.tail, scale: a.scale });
}
