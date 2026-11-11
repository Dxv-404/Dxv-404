// Pixel Knight, animated. Extends ../knight.js: same 48x64 grid, palette and auto-outline pass,
// but the figure is redrawn per pose into discrete sprite frames (no tweening anywhere).
const fs = require('fs');
const W = 48, H = 64, S = 6;
const C = {
  O: '#1a1220', A: '#d8ccb8', M: '#9a8f86', D: '#5c5260', L: '#f4ecdc',
  Y: '#ffe08a', R: '#c23b3b', r: '#7e2026', B: '#3a5a9a', b: '#27406e',
  G: '#e0a83a', g: '#a8741e', S: '#e8eef5', s: '#a8b4c4', H: '#6a4a2a',
  K: '#6e1f2a', k: '#4a1420', P: '#f07070', W: '#ffffff', w: '#bcd4f2', d: '#6a5a86', e: '#3a2f4f',
};
const blank = () => Array.from({ length: H }, () => Array(W).fill(null));
const put = (L, x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) L[y][x] = c; };
const rect = (L, x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(L, i, j, c); };
const ell = (L, cx, cy, rx, ry, c) => { for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) if ((i * i) / (rx * rx + .5) + (j * j) / (ry * ry + .5) <= 1) put(L, cx + i, cy + j, c); };
const poly = (L, pts, c) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let inside = false; const px = x + .5, py = y + .5;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) put(L, x, y, c);
  }
};

// ---------------- background (static) ----------------
const bg = blank();
const sky = ['#15122c', '#1d1838', '#261f45', '#302652', '#3b2c5c', '#4a3466'];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = y / 52 * (sky.length - 1), i = Math.min(sky.length - 1, Math.floor(t)), f = t - i;
  const dither = ((x + y) % 2 === 0 ? .25 : .75) + ((x % 4 === 0) ? .1 : 0);
  bg[y][x] = sky[Math.min(sky.length - 1, i + (f > dither ? 1 : 0))];
}
ell(bg, 10, 11, 9, 9, '#3f3466'); ell(bg, 10, 11, 7, 7, '#efe0b0'); ell(bg, 11, 10, 6, 6, '#f8ecc4');
put(bg, 8, 9, '#d8c690'); put(bg, 9, 9, '#d8c690'); put(bg, 12, 13, '#d8c690'); put(bg, 13, 13, '#d8c690'); put(bg, 13, 8, '#e4d4a2');
const STARS = [[30, 3], [42, 6], [21, 5], [45, 15], [37, 2], [3, 24], [44, 26], [26, 1], [5, 3], [40, 21], [22, 1]];
STARS.forEach(([x, y]) => put(bg, x, y, '#cfc3e6'));
const cs = '#120e22';
rect(bg, 0, 40, 9, 24, cs); rect(bg, 0, 36, 2, 4, cs); rect(bg, 3, 36, 2, 4, cs); rect(bg, 6, 36, 3, 4, cs);
rect(bg, 2, 30, 4, 10, cs); rect(bg, 2, 28, 1, 2, cs); rect(bg, 5, 28, 1, 2, cs); put(bg, 3, 33, '#ffcf6a'); put(bg, 3, 34, '#ffcf6a');
rect(bg, 39, 42, 9, 22, cs); rect(bg, 41, 34, 5, 8, cs); poly(bg, [[40, 34], [43.5, 27], [47, 34]], cs); put(bg, 43, 37, '#ffcf6a'); put(bg, 43, 38, '#ffcf6a');
rect(bg, 0, 58, W, 6, '#231c33'); rect(bg, 0, 58, W, 1, '#3a2f4f');
[[4, 57], [10, 57], [15, 57], [33, 57], [38, 57], [44, 57]].forEach(([x, y]) => { put(bg, x, y, '#3a2f4f'); put(bg, x + 1, y - 1, '#4c3f63'); });

// ---------------- the figure, per pose ----------------
const CAPES = [
  [[14, 23], [34, 23], [36, 35], [38, 47], [39, 58], [9, 58]],
  [[14, 23], [34, 23], [37, 35], [39, 47], [41, 58], [10, 58]],
  [[14, 23], [34, 23], [36, 34], [40, 46], [42, 56], [40, 58], [9, 58]],
  // whipping hard to the right (sword raised)
  [[14, 23], [34, 23], [41, 33], [46, 43], [47, 51], [43, 49], [41, 56], [38, 58], [12, 58]],
  [[14, 23], [34, 23], [40, 34], [45, 46], [47, 55], [43, 53], [40, 58], [11, 58]],
];
const PLUMES = [
  [[25, 10, 2, 2], [28, 8, 3, 2], [31, 7, 3, 2], [34, 7, 3, 2], [37, 8, 3, 2], [40, 10, 2, 2], [42, 12, 1, 1]],
  [[25, 10, 2, 2], [28, 8, 3, 2], [31, 7, 3, 2], [34, 6, 3, 2], [37, 6, 3, 2], [40, 8, 2, 2], [42, 10, 1, 1]],
  [[25, 10, 2, 2], [28, 8, 3, 2], [31, 8, 3, 2], [34, 9, 3, 2], [37, 10, 3, 2], [40, 11, 2, 2], [42, 11, 1, 1]],
  // whip: longer, streaming flat
  [[25, 10, 2, 2], [28, 8, 3, 2], [31, 6, 3, 2], [34, 5, 3, 2], [37, 5, 3, 2], [40, 6, 3, 2], [43, 8, 2, 2], [45, 10, 1, 1]],
  [[25, 10, 2, 2], [28, 8, 3, 2], [31, 7, 3, 2], [34, 7, 3, 2], [37, 6, 3, 2], [40, 4, 3, 2], [43, 4, 2, 2], [45, 5, 1, 1]],
];
const SPADE = [[24, 26], [23, 27], [24, 27], [25, 27], [22, 28], [23, 28], [24, 28], [25, 28], [26, 28], [22, 29], [23, 29], [25, 29], [26, 29], [24, 29], [24, 30], [23, 31], [24, 31], [25, 31]];

function figure({ dy = 0, cape = 0, plume = 0, sword = 'planted', lift = 0, sil = false, dust = 0, eyes = 'Y' } = {}) {
  const fg = blank(), U = dy;
  const cp = CAPES[cape].map(([x, y]) => [x, y <= 23 ? y + U : y]);
  poly(fg, cp, 'K');
  poly(fg, [[24, 23 + U], ...cp.slice(1, cp.findIndex(([x, y], i) => i > 1 && y >= 58 && x < 30) < 0 ? cp.length - 1 : cp.length - 1), [24, 58]], 'k');
  rect(fg, 17, 44, 6, 11, 'A'); rect(fg, 25, 44, 6, 11, 'M');
  rect(fg, 17, 48, 6, 2, 'M'); rect(fg, 25, 48, 6, 2, 'D');
  rect(fg, 16, 54, 7, 4, 'D'); rect(fg, 25, 54, 7, 4, 'D');
  rect(fg, 15, 24 + U, 18, 15, 'A'); rect(fg, 27, 24 + U, 6, 15, 'M');
  rect(fg, 19, 26 + U, 10, 19, 'B'); rect(fg, 25, 26 + U, 4, 19, 'b');
  poly(fg, [[19, 45 + U], [29, 45 + U], [24, 48 + U]], 'B');
  SPADE.forEach(([x, y]) => put(fg, x, y + U, 'G'));
  rect(fg, 15, 39 + U, 18, 2, 'H'); rect(fg, 23, 39 + U, 3, 2, 'G');
  ell(fg, 14, 25 + U, 4, 3, 'A'); ell(fg, 34, 25 + U, 4, 3, 'M');
  rect(fg, 11, 25 + U, 6, 1, 'L'); rect(fg, 31, 27 + U, 7, 1, 'D');
  const fistR = () => { poly(fg, [[33, 27 + U], [38, 27 + U], [38, 37 + U], [34, 37 + U]], 'D'); rect(fg, 34, 36 + U, 4, 3, 'M'); rect(fg, 34, 38 + U, 4, 1, 'D'); };
  if (sword === 'planted' || sword === 'pull') {
    const Lf = sword === 'pull' ? lift : 0, hy = U - Lf;     // hands follow the hilt
    poly(fg, [[10, 27 + U], [15, 27 + U], [23, 36 + hy], [20, 39 + hy]], 'M');
    poly(fg, [[33, 27 + U], [38, 27 + U], [28, 39 + hy], [25, 36 + hy]], 'D');
    rect(fg, 19, 35 + hy, 4, 3, 'D'); rect(fg, 26, 35 + hy, 4, 3, 'D');
  } else if (sword === 'smear') {
    poly(fg, [[10, 26 + U], [15, 27 + U], [8, 35 + U], [4, 32 + U]], 'M'); rect(fg, 3, 31 + U, 4, 4, 'D'); fistR();
  } else {                                                   // raised: one arm straight up on the moon side
    poly(fg, [[10, 27 + U], [15, 25 + U], [13, 18 + U], [8, 19 + U]], 'M'); fistR();
  }
  // helm
  rect(fg, 18, 12 + U, 12, 11, 'A'); rect(fg, 19, 11 + U, 10, 1, 'A'); rect(fg, 26, 12 + U, 4, 11, 'M');
  rect(fg, 19, 12 + U, 2, 6, 'L');
  rect(fg, 19, 17 + U, 10, 2, 'O'); [21, 22, 25, 26].forEach(x => put(fg, x, 17 + U, eyes));
  rect(fg, 23, 12 + U, 2, 5, 'M');
  [[20, 20], [22, 20], [24, 20], [26, 20], [20, 21], [22, 21], [24, 21], [26, 21]].forEach(([x, y]) => put(fg, x, y + U, 'D'));
  rect(fg, 19, 23 + U, 10, 1, 'M');
  // plume
  const pl = PLUMES[plume];
  pl.forEach(([x, y, rx, ry]) => ell(fg, x, y + U, rx, ry, 'R'));
  pl.forEach(([x, y, rx, ry], i) => { if (i > 0 && i < pl.length - 1) { put(fg, x - 1, y + ry + U, 'r'); put(fg, x, y + ry + U, 'r'); if (rx > 2) put(fg, x + 1, y + ry + U, 'r'); } });
  put(fg, pl[1][0] + 2, pl[1][1] - 2 + U, 'L'); put(fg, pl[3][0] - 1, pl[3][1] - 2 + U, 'P'); put(fg, pl[3][0], pl[3][1] - 2 + U, 'P');
  // sword
  if (sword === 'planted' || sword === 'pull') {
    const Lf = sword === 'pull' ? lift : 0;
    rect(fg, 23, 41 - Lf, 2, 17, 'S'); rect(fg, 24, 41 - Lf, 1, 17, 's'); put(fg, 23, 58 - Lf, 'S');
    rect(fg, 18, 39 - Lf, 12, 2, 'G'); rect(fg, 18, 40 - Lf, 12, 1, 'g'); put(fg, 17, 39 - Lf, 'G'); put(fg, 30, 39 - Lf, 'G');
    rect(fg, 23, 35 - Lf, 2, 4, 'H'); rect(fg, 22, 33 - Lf, 4, 2, 'G'); put(fg, 23, 33 - Lf, 'Y');
  } else if (sword === 'raised') {
    rect(fg, 9, 2 + U, 2, 13, 's'); rect(fg, 9, 2 + U, 1, 13, 'S'); put(fg, 9, 1 + U, 'S');           // blade, tip up
    rect(fg, 4, 15 + U, 12, 1, 'G'); rect(fg, 4, 16 + U, 12, 1, 'g'); put(fg, 3, 15 + U, 'G'); put(fg, 16, 15 + U, 'G');
    rect(fg, 8, 17 + U, 4, 3, 'D'); put(fg, 8, 17 + U, 'M');                                          // gauntlet on the grip
    rect(fg, 9, 20 + U, 2, 1, 'H'); rect(fg, 8, 21 + U, 4, 2, 'G'); put(fg, 9, 21 + U, 'Y');          // pommel
  }
  // outline pass
  const out = fg.map(r => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (fg[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy2]) => fg[y + dy2] && fg[y + dy2][x + dx])) out[y][x] = 'O';
  }
  // moon rim light on the left edges
  for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) {
    const c = out[y][x];
    if (c && c !== 'O' && out[y][x - 1] === 'O' && x < 26 && y < 46) out[y][x] = c === 'A' ? 'L' : c === 'M' ? 'A' : c === 'D' ? 'M' : c === 'K' ? '#9a3040' : c;
  }
  if (sword === 'smear') {                                   // the swing itself: one crescent of light
    const q = (t, a, b, c2) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c2;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, x = Math.round(q(t, 23, -8, 9)), y = Math.round(q(t, 50, 30, 2));
      if (t < .22) continue;
      const th = t < .34 ? 1 : t < .7 ? 3 : 2;
      for (let k = 0; k < th; k++) { if (t < .4 && (x + y + k) % 2) continue; put(out, x + k, y, k === 0 ? 'W' : 'w'); }
    }
  }
  if (sil) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = out[y][x]; if (c) out[y][x] = 'SsGgYH'.includes(c) ? 'W' : '#120e22'; }
  if (dust === 1) { [[19, 56, 'd'], [17, 54, 'e'], [28, 56, 'd'], [31, 54, 'e'], [21, 53, 'd'], [27, 52, 'd'], [14, 57, 'e'], [33, 57, 'd']].forEach(([x, y, c]) => put(out, x, y, c)); rect(out, 20, 58, 3, 1, 'd'); rect(out, 25, 58, 4, 1, 'd'); }
  if (dust === 2) { [[16, 55, 'd'], [13, 52, 'e'], [30, 55, 'd'], [34, 51, 'e'], [20, 51, 'd'], [28, 49, 'd'], [11, 56, 'e'], [36, 56, 'd'], [9, 54, 'd'], [38, 53, 'e']].forEach(([x, y, c]) => put(out, x, y, c)); rect(out, 12, 58, 9, 1, 'd'); rect(out, 26, 58, 10, 1, 'd'); }
  return out;
}

// grid -> compact paths (one per colour, run-length rows), in grid units
function paths(L) {
  const by = {};
  for (let y = 0; y < H; y++) { let x = 0; while (x < W) { const c = L[y][x]; if (!c) { x++; continue; } let w = 1; while (x + w < W && L[y][x + w] === c) w++; (by[c] = by[c] || []).push(`M${x} ${y}h${w}v1h-${w}z`); x += w; } }
  return Object.entries(by).map(([c, a]) => `<path fill="${C[c] || c}" d="${a.join('')}"/>`).join('');
}

const FR = {
  i0: { cape: 0, plume: 0 }, i1: { cape: 1, plume: 1 }, i2: { cape: 2, plume: 2 },
  crouch: { dy: 1, cape: 1, plume: 2, eyes: 'L' },
  rip: { sword: 'pull', lift: 5, cape: 2, plume: 1, sil: true, dust: 1 },
  pull: { sword: 'pull', lift: 10, cape: 3, plume: 3, dust: 2, eyes: 'L' },
  smear: { sword: 'smear', cape: 4, plume: 4, eyes: 'L' },
  up0: { sword: 'raised', dy: -1, cape: 3, plume: 3, eyes: 'L' },
  up1: { sword: 'raised', cape: 4, plume: 4, eyes: 'L' },
  up2: { sword: 'raised', cape: 3, plume: 3, eyes: 'L' },
  slam: { dy: 1, cape: 3, plume: 2, dust: 2, eyes: 'L' },
  settle: { dy: 1, cape: 2, plume: 1, dust: 1 },
};
let frames = '';
for (const [k, o] of Object.entries(FR)) frames += `<g class="kn-f${k === 'i0' ? ' kn-on' : ''}" data-f="${k}">${paths(figure(o))}</g>`;

// overlays (toggled per tick): star twinkles, dim visor, blade glint, impact flash
let stars = '';
STARS.forEach(([x, y], i) => {
  stars += `<g class="kn-star" data-i="${i}"><path fill="#fff6d0" d="M${x} ${y}h1v1h-1z"/><path class="kn-star2" fill="#8d7fb8" d="M${x - 1} ${y}h1v1h-1zM${x + 1} ${y}h1v1h-1zM${x} ${y - 1}h1v1h-1zM${x} ${y + 1}h1v1h-1z"/></g>`;
});
const visor = `<path class="kn-o kn-visor" fill="#b98a3a" d="M21 17h2v1h-2zM25 17h2v1h-2z"/>`;
let glint = '';
for (let i = 0; i < 16; i++) {                               // runs tip -> guard, one pixel row per tick
  const y = 1 + i;
  glint += i < 14 ? `<path class="kn-o kn-gl" data-i="${i}" fill="#ffffff" d="M8 ${y}h4v1h-4z${i > 0 ? `M9 ${y - 1}h2v1h-2z` : ''}${i > 1 ? `M9 ${y - 2}h1v1h-1z` : ''}"/>` : i === 14 ? `<path class="kn-o kn-gl" data-i="14" fill="#fff6c0" d="M4 15h12v1h-12zM9 14h2v1h-2z"/>` : `<path class="kn-o kn-gl" data-i="15" fill="#ffffff" d="M3 15h1v1h-1zM16 15h1v1h-1zM2 14h1v1h-1zM17 14h1v1h-1zM2 16h1v1h-1zM17 16h1v1h-1z"/>`;
}
const spark = `<path class="kn-o kn-spark" data-i="0" fill="#ffffff" d="M9 0h2v3h-2zM7 1h6v1h-6z"/><path class="kn-o kn-spark" data-i="1" fill="#ffffff" d="M9 0h2v4h-2zM6 1h8v1h-8zM8 0h1v1h-1zM11 2h1v1h-1z"/><path class="kn-o kn-spark" data-i="2" fill="#fff6c0" d="M10 1h1v1h-1zM7 1h1v1h-1zM12 1h1v1h-1z"/>`;

const markup = `<svg class="kn-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" aria-hidden="true">
<defs><clipPath id="kn-clip"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>
<rect width="300" height="400" fill="#0d0a18"/>
<g transform="translate(6 8) scale(${S})" clip-path="url(#kn-clip)">
<!-- background: sky, moon, castles, ground (static) -->
<g class="kn-bg">${paths(bg)}</g>
<g class="kn-stars">${stars}</g>
<rect class="kn-o kn-flash" width="${W}" height="${H}" fill="#f4ecdc"/>
<!-- sprite frames: exactly one is shown at a time (class kn-on) -->
<g class="kn-sprite">${frames}${visor}${glint}${spark}</g>
<rect class="kn-o kn-dark" width="${W}" height="${H}" fill="#0d0a18"/>
</g>
<rect x="3" y="5" width="294" height="390" fill="none" stroke="#e0a83a" stroke-width="3"/>
<rect x="8" y="10" width="284" height="380" fill="none" stroke="#1a1220" stroke-width="2"/>
</svg>`;

const css = `
/* ---- kn: Pixel Knight (stepped frames; the JS stepper only toggles classes/attributes) ---- */
.kn-root{background:#0d0a18}
.kn-svg{image-rendering:pixelated}
.kn-f,.kn-o,.kn-star2{display:none}
.kn-f.kn-on,.kn-o.kn-on,.kn-star.kn-on .kn-star2{display:inline}
`;

module.exports = {
  prefix: 'kn', name: 'Pixel Knight', player: 'Joel K', auto: 1250,
  markup, css, hooks: fs.readFileSync(__dirname + '/knight.hooks.cjs', 'utf8'),
};
