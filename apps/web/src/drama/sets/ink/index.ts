// The Ink room: a manga back-room gambling den drawn as a black-and-white page. Paper walls and a wooden lattice,
// one hanging lamp whose light falls on the table and leaves the corners in heavy tone, Kage the dealer behind the
// table, the white screentone felt with the thick black rim, and the Ink chips (white 勝, red-centred 賭).
import { brush, chipStack, chipTop, impact, letter, line, INK, PAPER, RED, WHITE } from '../../art';
import type { SetDef } from '../../types';
import { TABLE_Y, WORLD_H, WORLD_W } from '../../types';
import { SEATS } from '../neutral';

// ---------------------------------------------------------------- Kage, in character space (from the table's dealer art)
const KAGE_HEAD = `<path d="M34 40 Q34 80 60 82 Q86 80 86 40 Q60 30 34 40Z" fill="#fff" stroke="#111" stroke-width="3"/>`
  + `<path d="M28 50 L24 28 L36 32 L32 14 L46 22 L50 4 L58 20 L67 4 L71 22 L84 12 L82 30 L96 28 L88 50 Q84 36 72 36 L64 28 L58 38 L48 30 L42 40 Q34 38 28 50Z" fill="#111"/>`
  + `<path d="M41 54 L54 51 L52 58 Q46 59 41 54Z" fill="#111"/><path d="M79 54 L66 51 L68 58 Q74 59 79 54Z" fill="#111"/>`
  + `<path d="M40 47 L53 45 M80 47 L67 45" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>`
  + `<path d="M60 58 L58 66 L61 66" fill="none" stroke="#111" stroke-width="1.6"/><path d="M53 71 Q60 73 67 68" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>`
  + `<path d="M38 64 l4 -3 M41 66 l4 -3 M82 64 l-4 -3 M79 66 l-4 -3" stroke="${RED}" stroke-width="1.4"/>`;
const KAGE_BODY = `<path d="M-4 170 Q4 96 60 88 Q116 96 124 170Z" fill="#111"/><path d="M46 87 L60 114 L74 87Z" fill="#fff" stroke="#111" stroke-width="2"/>`
  + `<path d="M56.5 92 L63.5 92 L65 108 L60 115 L55 108Z" fill="${RED}" stroke="#111" stroke-width="1.6"/><path d="M52 70 L52 88 L68 88 L68 70Z" fill="#fff" stroke="#111" stroke-width="2.5"/>`
  + `<path d="M14 130 Q20 112 34 106 M106 130 Q100 112 86 106" stroke="#fff" stroke-width="1.2" fill="none" opacity=".5"/>`;
/** Kage at 2x, eyes on the shared eye line; `arm` is his working arm (black sleeve, white hand). */
const kage = (arm: string): string => `<g transform="translate(0 -4) scale(2)">${KAGE_BODY}${KAGE_HEAD}</g>${arm}`;
const sleeve = (pts: [number, number][], hand: string): string => brush(pts, 34, { taper: 'none', fill: INK }) + hand;
const handFlat = (x: number, y: number, rot = 0): string => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M-14 -9 Q4 -14 22 -8 L26 -2 Q8 4 -14 8Z" fill="${WHITE}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>${line('M4 -9 L10 -3 M12 -9 L17 -4', 1.2)}</g>`;
const KAGE: Record<string, string> = {
  sit: kage(sleeve([[40, 200], [70, 232], [110, 238]], handFlat(118, 238))),
  slide: kage(sleeve([[150, 196], [190, 226], [236, 238]], handFlat(246, 240, 4)) + line('M180 250 h30 M174 258 h26', 1.6)),
  grip: kage(sleeve([[170, 196], [214, 236], [222, 182]], `<g transform="translate(222 172)"><path d="M-14 -10 Q0 -20 14 -10 L14 12 Q0 18 -14 12Z" fill="${WHITE}" stroke="${INK}" stroke-width="2.8"/>${line('M-14 -2 h28 M-14 5 h28', 1.3)}</g>`)),
  finger: kage(sleeve([[150, 196], [190, 214], [232, 232]], `<g transform="translate(238 232)"><path d="M-12 -10 Q2 -16 12 -8 L12 4 Q0 8 -12 4Z" fill="${WHITE}" stroke="${INK}" stroke-width="2.6"/><path d="M8 -2 L30 6 L28 12 L6 6Z" fill="${WHITE}" stroke="${INK}" stroke-width="2.4"/></g>`) + impact(268, 246, 8, 5)),
};

// ---------------------------------------------------------------- the room
const lattice = (x0: number, y0: number, w: number, h: number, cols: number, rows: number, wt = 3): string => {
  let d = '';
  for (let i = 0; i <= cols; i++) d += `M${x0 + (w * i) / cols} ${y0}V${y0 + h}`;
  for (let j = 0; j <= rows; j++) d += `M${x0} ${y0 + (h * j) / rows}H${x0 + w}`;
  return line(d, wt);
};
function back(o: { lite: boolean }): string {
  let s = `<rect width="${WORLD_W}" height="${WORLD_H}" fill="${PAPER}"/>`;
  // the back wall: shoji panels, the lattice brushed in ink, a heavy beam above
  s += lattice(60, 120, 1480, 470, 16, 6, 2.2);
  s += brush([[0, 112], [800, 104], [1600, 114]], 30, { taper: 'none' }) + brush([[0, 600], [800, 596], [1600, 602]], 22, { taper: 'none' });
  for (const x of [60, 430, 800, 1170, 1540]) s += brush([[x, 112], [x + 2, 600]], 16, { taper: 'none' });
  // a scroll on the wall with a kanji (勝負: "the showdown"), ink-brushed
  s += `<g transform="translate(1230 160)"><rect x="0" y="0" width="90" height="250" fill="${WHITE}" stroke="${INK}" stroke-width="3"/>${brush([[-8, 0], [98, 0]], 12, { taper: 'none' })}${brush([[-8, 250], [98, 250]], 12, { taper: 'none' })}`
    + `<text x="45" y="110" text-anchor="middle" font-family="'Reggae One',serif" font-size="62" fill="${INK}">勝</text><text x="45" y="190" text-anchor="middle" font-family="'Reggae One',serif" font-size="62" fill="${INK}">負</text><circle cx="66" cy="226" r="9" fill="${RED}"/></g>`;
  // the floor: tatami seams in perspective
  s += `<rect y="600" width="${WORLD_W}" height="300" fill="${WHITE}"/>`;
  let fl = '';
  for (let i = -6; i <= 6; i++) fl += `M${800 + i * 70} 600 L${800 + i * 260} 900`;
  s += line(fl, 1.4) + line('M0 700 H1600 M0 800 H1600', 1.2);
  // darkness outside the lamp's light: heavy tone at the corners and the walls
  s += `<radialGradient id="ink-dark" cx="50%" cy="58%" r="62%"><stop offset=".42" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity=".88"/></radialGradient>`;
  // screentone where the light does not reach (bands at the walls' ends and the ceiling; no masks: cheap to draw)
  if (!o.lite) s += `<path d="M0 0 H1600 V90 Q800 60 0 90Z M0 0 H260 V900 H0Z M1340 0 H1600 V900 H1340Z" fill="url(#dt-tone2)" opacity=".75"/>`;
  s += `<rect width="${WORLD_W}" height="${WORLD_H}" fill="url(#ink-dark)"/>`;
  // the one hanging lamp: cord, a paper shade, the light cone
  s += line('M800 0 V170', 3) + `<path d="M720 250 Q800 150 880 250 Z" fill="${WHITE}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`
    + brush([[716, 252], [884, 252]], 10, { taper: 'none' }) + line('M760 214 Q800 196 840 214 M744 234 Q800 216 856 234', 1.4)
    + `<path d="M720 256 L330 760 L1270 760 L880 256Z" fill="${WHITE}" opacity=".32"/>`;
  if (!o.lite) s += letter('ザワ', 230, 440, 64, { rot: -12 }) + letter('ザワ', 1390, 480, 56, { rot: 10 });
  // Kage behind the table, the silent witness
  s += `<g transform="translate(${800 - 120 * 0.95} ${560 - TABLE_Y * 0.95}) scale(.95)">${KAGE.sit}</g>`;
  return s;
}
function table(): string {
  return `<ellipse cx="808" cy="716" rx="690" ry="186" fill="${INK}"/>`
    + `<ellipse cx="800" cy="706" rx="690" ry="186" fill="${INK}"/><ellipse cx="800" cy="694" rx="656" ry="160" fill="${WHITE}"/>`
    + `<ellipse cx="800" cy="694" rx="656" ry="160" fill="url(#dt-tone)" opacity=".28"/><ellipse cx="800" cy="680" rx="420" ry="96" fill="${WHITE}" opacity=".85"/>`
    + `<ellipse cx="800" cy="694" rx="630" ry="146" fill="none" stroke="${INK}" stroke-width="2" stroke-dasharray="7 9"/>`
    + brush([[160, 760], [800, 862], [1440, 760]], 9, { fill: WHITE, taper: 'both' });
}

// ---------------------------------------------------------------- close-ups
function closeBg(o: { lite: boolean }): string {
  let s = `<rect x="-300" y="-300" width="840" height="920" fill="${PAPER}"/>` + lattice(-300, -60, 840, 300, 7, 4, 2);
  s += brush([[-300, -66], [540, -60]], 18, { taper: 'none' });
  s += `<radialGradient id="ink-cb" cx="50%" cy="34%" r="58%"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>`;
  if (!o.lite) s += `<rect x="-300" y="-300" width="840" height="920" fill="url(#dt-tone)" opacity=".45"/>`;
  s += `<rect x="-300" y="-300" width="840" height="920" fill="url(#ink-cb)"/>`;
  return s;
}
function edge(): string {
  // the white screentone felt and the thick black rim, seen from the player's side
  return `<path d="M-300 ${TABLE_Y - 2} Q120 ${TABLE_Y - 14} 540 ${TABLE_Y - 2} L540 ${TABLE_Y + 22} L-300 ${TABLE_Y + 22}Z" fill="${WHITE}"/>`
    + `<path d="M-300 ${TABLE_Y - 2} Q120 ${TABLE_Y - 14} 540 ${TABLE_Y - 2} L540 ${TABLE_Y + 22} L-300 ${TABLE_Y + 22}Z" fill="url(#dt-tone)" opacity=".3"/>`
    + `<path d="M-300 ${TABLE_Y + 16} Q120 ${TABLE_Y + 4} 540 ${TABLE_Y + 16} L540 ${TABLE_Y + 120} L-300 ${TABLE_Y + 120}Z" fill="${INK}"/>`
    + brush([[-300, TABLE_Y + 28], [120, TABLE_Y + 17], [540, TABLE_Y + 28]], 4, { fill: WHITE, taper: 'both' });
}

// ---------------------------------------------------------------- chips, piles, the crown (character space)
const pile = (t: 0 | 1 | 2): string => {
  if (t === 0) return chipStack(96, 252, 5) + chipStack(128, 256, 4, 26, true) + chipTop(156, 250, 12, false);
  if (t === 1) {
    return [[70, 6, 0], [100, 10, 1], [130, 12, 0], [160, 8, 1], [86, 4, 1], [146, 5, 0]].map(([x, n, r], i) => chipStack(x!, 262 + (i > 3 ? 8 : 0), n!, 26, r === 1)).join('')
      + chipTop(40, 262, 12, true) + chipTop(194, 258, 12, false);
  }
  // the mountain: stacks piled into a peak, chips sliding off its sides, a burst of lines behind
  let s = line('M120 40 L120 0 M70 60 L40 30 M170 60 L200 30 M50 110 L10 100 M190 110 L230 100', 3);
  const cols: [number, number, number][] = [[24, 6, 1], [48, 11, 0], [72, 16, 1], [96, 21, 0], [120, 25, 1], [144, 21, 0], [168, 16, 1], [192, 11, 0], [216, 6, 1]];
  for (const [x, n, r] of cols) s += chipStack(x, 270, n, 26, r === 1);
  s += chipTop(4, 266, 12, false) + chipTop(236, 262, 12, true) + chipTop(30, 220, 11, true) + chipTop(212, 214, 11, false);
  s += letter('ドン', 200, 70, 40, { rot: 12, fill: INK });
  return s;
};
/** The red seal crown: a hanko-red seal cut in the shape of a crown, 王 knocked out in white. */
const crown = (): string => `<g transform="rotate(-8)"><path d="M-46 22 L-46 -18 L-30 -2 L-16 -34 L0 -6 L16 -34 L30 -2 L46 -18 L46 22Z" fill="${RED}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>`
  + `<path d="M-38 14 L38 14" stroke="${WHITE}" stroke-width="2" stroke-dasharray="3 2"/><text x="0" y="12" text-anchor="middle" font-family="'Reggae One',serif" font-size="26" fill="${WHITE}">王</text>`
  + `<circle cx="-16" cy="-38" r="4" fill="${RED}" stroke="${INK}" stroke-width="2"/><circle cx="16" cy="-38" r="4" fill="${RED}" stroke="${INK}" stroke-width="2"/></g>`;
const chips = (n: number): string => Array.from({ length: n }, (_, i) => chipTop((i % 3) * 24 - 24 + (i > 2 ? 12 : 0), -Math.floor(i / 3) * 9, 12, i % 2 === 1)).join('');

const set: SetDef = {
  id: 'ink',
  seats: SEATS,
  back,
  table,
  dealer: KAGE,
  edge,
  closeBg,
  light: { tint: '#ffffff', alpha: 0, side: 1 },
  font: "'Reggae One',serif",
  ink: INK, paper: PAPER, red: RED,
  pile, crown, chips,
};
export default set;
