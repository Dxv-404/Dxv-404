// The neutral stage: stands in for any theme whose room is not built yet (plan, "Ink characters at other
// tables"): a spotlight on that table's felt colours, a plain dealer, the table's own felt and rim.
import { chipStack, chipTop, line, INK, RED, WHITE } from '../../art';
import type { SeatSpot, SetDef } from '../../types';
import { WORLD_H, WORLD_W, TABLE_Y } from '../../types';

export const SEATS: SeatSpot[] = [150, 1450, 310, 1290, 470, 1130, 630, 970].map((x) => ({ x, y: 560, scale: 0.95 }));

const dealer = (felt: string): string =>
  // a figure in a waistcoat with a visor, in the table's colours (character space)
  `<path d="M40 330 Q48 196 120 186 Q192 196 200 330Z" fill="#222"/><path d="M96 190 L120 260 L144 190Z" fill="${WHITE}"/>`
  + `<path d="M112 196 L128 196 L124 220 L116 220Z" fill="${felt}"/><ellipse cx="120" cy="${104}" rx="32" ry="38" fill="#2b2b2b"/>`
  + `<path d="M82 92 Q120 70 158 92 L150 100 Q120 88 90 100Z" fill="${felt}" stroke="#000" stroke-width="2"/>`;

const set: SetDef = {
  id: 'neutral',
  seats: SEATS,
  back: ({ felt, lite }) => `<rect width="${WORLD_W}" height="${WORLD_H}" fill="#121214"/>`
    + `<radialGradient id="ns-spot" cx="50%" cy="62%" r="60%"><stop offset="0" stop-color="${felt}" stop-opacity=".55"/><stop offset=".55" stop-color="${felt}" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`
    + `<rect width="${WORLD_W}" height="${WORLD_H}" fill="url(#ns-spot)"/>`
    + (lite ? '' : `<path d="M640 0 L960 0 L1280 900 L320 900Z" fill="${WHITE}" opacity=".05"/>`)
    + `<g transform="translate(${800 - 120 * 0.95} ${560 - TABLE_Y * 0.95}) scale(.95)">${dealer(felt)}</g>`,
  table: ({ felt, rim }) => `<ellipse cx="800" cy="700" rx="690" ry="190" fill="${rim}" stroke="#000" stroke-width="6"/>`
    + `<ellipse cx="800" cy="690" rx="650" ry="160" fill="${felt}"/><ellipse cx="800" cy="690" rx="650" ry="160" fill="url(#dt-tone)" opacity=".18"/>`
    + `<ellipse cx="800" cy="900" rx="760" ry="60" fill="#000" opacity=".35"/>`,
  dealer: { slide: dealer('#2c6b45'), sit: dealer('#2c6b45') },
  edge: ({ felt, rim }) => `<path d="M-60 ${TABLE_Y} Q120 ${TABLE_Y - 10} 300 ${TABLE_Y} L300 ${TABLE_Y + 18} Q120 ${TABLE_Y + 8} -60 ${TABLE_Y + 18}Z" fill="${felt}"/>`
    + `<path d="M-60 ${TABLE_Y + 14} Q120 ${TABLE_Y + 4} 300 ${TABLE_Y + 14} L300 400 L-60 400Z" fill="${rim}" stroke="#000" stroke-width="3"/>`,
  closeBg: () => `<rect x="-200" y="-200" width="640" height="720" fill="#1a1a1d"/><radialGradient id="ns-cb" cx="50%" cy="40%" r="55%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><rect x="-200" y="-200" width="640" height="720" fill="url(#ns-cb)"/>`,
  light: { tint: '#ffe2b0', alpha: 0.18, side: 1 },
  font: "'DM Serif Display',serif",
  ink: INK, paper: '#f5f2ea', red: RED,
  pile: (t) => (t === 0 ? chipStack(120, 270, 4) + chipStack(150, 274, 3, 26, true)
    : t === 1 ? [[90, 6], [120, 9], [150, 7], [104, 4]].map(([x, n], i) => chipStack(x!, 280 + (i % 2) * 6, n!, 26, i % 2 === 1)).join('')
      : [[60, 8], [90, 13], [120, 17], [150, 14], [180, 9], [75, 4], [165, 5]].map(([x, n], i) => chipStack(x!, 290 + (i % 3) * 5, n!, 26, i % 2 === 1)).join('')),
  crown: () => `<path d="M0 0 L8 -18 L18 -4 L28 -22 L38 -4 L48 -18 L56 0Z" fill="${RED}" stroke="${INK}" stroke-width="2.4"/>${line('M4 -3 H52', 2, WHITE)}`,
  chips: (n) => Array.from({ length: n }, (_, i) => chipTop((i % 3) * 22 - 22, -Math.floor(i / 3) * 8, 11, i % 2 === 1)).join(''),
};
export default set;
