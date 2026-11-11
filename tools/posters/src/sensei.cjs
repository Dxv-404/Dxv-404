// Ink Sensei, animated. Extends ../sensei2.js: same composition and brush() helper,
// but everything that moves is baked dry-brush geometry (no filters), so the
// feTurbulence filters only ever rasterise once, in static layers.
const fs = require('fs');
const INK = '#121212', PAPER = '#f2ead8', RED = '#c22a1f';
const f1 = v => (+v).toFixed(1);

const bez = ([a, b, c, d], n = 48) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [u*u*u*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t*t*t*d[0], u*u*u*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t*t*t*d[1]];
});
// original tapered brush stroke (used for the static, filtered layers)
function brush(p4, w, { inT = .12, outT = .55, fill = INK, op = 1, filter = 'edge' } = {}) {
  const pts = bez(p4), L = [], R = [];
  pts.forEach((p, i) => {
    const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dy = q[1] - o[1]; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    const t = i / (pts.length - 1);
    const k = Math.min(1, t / inT) * Math.min(1, (1 - t) / outT);
    const ww = w * Math.pow(Math.max(k, 0), .7) / 2;
    L.push([p[0] - dy * ww, p[1] + dx * ww]); R.push([p[0] + dy * ww, p[1] - dx * ww]);
  });
  const d = 'M' + L.map(p => p.map(f1).join(' ')).join(' L') + ' L' + R.reverse().map(p => p.map(f1).join(' ')).join(' L') + ' Z';
  return `<path d="${d}" fill="${fill}" opacity="${op}" filter="url(#sn-${filter})"/>`;
}
let rnd = 7; const R01 = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + R01() * (b - a);

// ---------- baked dry brush: a bundle of bristle lanes with dropouts ----------
// Returns K path "d" strings (one per segment along the stroke) + the joint points.
function dryLanes(p4, w, { inT = .06, outT = .6, lanes = 6, dry = .5, K = 1, tail = .55 } = {}) {
  const per = 14, n = per * K, pts = bez(p4, n);
  const S = pts.map((p, i) => {
    const q = pts[Math.min(n, i + 1)], o = pts[Math.max(0, i - 1)];
    let dx = q[0] - o[0], dy = q[1] - o[1]; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    const t = i / n, k = Math.min(1, t / inT) * Math.min(1, (1 - t) / outT);
    return { x: p[0], y: p[1], nx: -dy, ny: dx, hw: w * Math.pow(Math.max(k, 0), .7) / 2, t };
  });
  const segD = Array.from({ length: K }, () => '');
  for (let j = 0; j < lanes; j++) {
    const u0 = -1 + (2 * j) / lanes, u1 = u0 + 2 / lanes + .04;
    const mid = 1 - Math.abs((j + .5) / lanes - .5) * 2;            // 1 at centre lane
    const end = Math.round(n * Math.min(1, tail + (1 - tail) * (mid * .6 + R01() * .5)));
    const on = [];
    for (let i = 0; i <= n; i++) on[i] = i <= end;
    for (let i = 3; i < end; i++) if (R01() < dry * Math.pow(i / n, 1.2) * .4) { const L = 1 + Math.floor(R01() * 3); for (let k = 0; k < L; k++) on[i + k] = false; i += L; }
    const j0 = rr(-.12, .12), j1 = rr(-.12, .12);
    const P = (i, u) => { const s = S[i]; const uu = u + (u === u0 ? j0 : j1) * Math.sin(i * 1.7 + j); return [s.x + s.nx * s.hw * uu, s.y + s.ny * s.hw * uu]; };
    for (let k = 0; k < K; k++) {
      const a0 = k * per, b0 = Math.min(n, (k + 1) * per + (k < K - 1 ? 1 : 0));
      let i = a0;
      while (i < b0) {
        if (!on[i]) { i++; continue; }
        let e = i; while (e < b0 && on[e + 1]) e++;
        if (e > i) {
          const L = [], Rr = [];
          for (let q = i; q <= e; q++) { L.push(P(q, u0)); Rr.push(P(q, u1)); }
          // taper true ends of a bristle run to a point
          if (!on[i - 1] || i === 0) { const m = [(L[0][0] + Rr[0][0]) / 2, (L[0][1] + Rr[0][1]) / 2]; L[0] = m; Rr[0] = m; }
          if (!on[e + 1]) { const z = L.length - 1, m = [(L[z][0] + Rr[z][0]) / 2, (L[z][1] + Rr[z][1]) / 2]; L[z] = m; Rr[z] = m; }
          segD[k] += 'M' + L.map(p => p.map(f1).join(' ')).join('L') + 'L' + Rr.reverse().map(p => p.map(f1).join(' ')).join('L') + 'Z';
        }
        i = e + 1;
      }
    }
  }
  return { segD, joints: Array.from({ length: K }, (_, k) => [S[k * per].x, S[k * per].y]), S };
}
// plain baked stroke (single path)
const dryStroke = (p4, w, o = {}) => `<path d="${dryLanes(p4, w, { ...o, K: 1 }).segD[0]}" fill="${o.fill || INK}"${o.op ? ` opacity="${o.op}"` : ''}/>`;
// a streamer: K nested segments, each fluttering about its own joint with a phase lag,
// so a wave travels down the stroke (stroke-level motion; the figure itself never sways)
function streamer(p4, w, { fill = INK, K = 3, amp = 4, dur = 1.1, lag = .16, ph = 0, ...o } = {}) {
  const { segD, joints } = dryLanes(p4, w, { ...o, K });
  let s = '';
  for (let k = K - 1; k >= 0; k--) {
    const [x, y] = joints[k];
    s = `<g class="sn-seg" style="transform-origin:${f1(x)}px ${f1(y)}px;--a:${(amp * (k === 0 ? .55 : 1)).toFixed(2)}deg;animation-duration:${dur}s;animation-delay:${(-ph - (K - k) * lag * dur).toFixed(2)}s"><path d="${segD[k]}"/>${s}</g>`;
  }
  const [x, y] = joints[0];
  return `<g class="sn-gust" fill="${fill}" style="transform-origin:${f1(x)}px ${f1(y)}px">${s}</g>`;
}

// ---------- rough solid shapes without a filter ----------
function flat(d) {            // flatten an absolute M/L/C/Z path into points
  const tk = d.match(/[MLCZ]|-?[\d.]+/g); const out = []; let i = 0, cur = [0, 0], cmd = '';
  while (i < tk.length) {
    if (/[MLCZ]/.test(tk[i])) cmd = tk[i++];
    if (cmd === 'Z') continue;
    if (cmd === 'M' || cmd === 'L') { cur = [+tk[i], +tk[i + 1]]; i += 2; out.push(cur); if (cmd === 'M') cmd = 'L'; }
    else if (cmd === 'C') { const p = [cur, [+tk[i], +tk[i + 1]], [+tk[i + 2], +tk[i + 3]], [+tk[i + 4], +tk[i + 5]]]; i += 6; bez(p, 10).slice(1).forEach(q => out.push(q)); cur = p[3]; }
  }
  return out;
}
function rough(pts, amp = 1.1, step = 2.5) {
  const rs = []; const N = pts.length;
  for (let i = 0; i < N; i++) { const a = pts[i], b = pts[(i + 1) % N]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const m = Math.max(1, Math.round(L / step)); for (let k = 0; k < m; k++) rs.push([a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m]); }
  const M = rs.length, ws = Array.from({ length: 5 }, () => [Math.floor(rr(3, 19)), rr(0, 6.3), rr(.4, 1)]);
  const out = rs.map((p, i) => {
    const a = rs[(i - 1 + M) % M], b = rs[(i + 1) % M]; let dx = b[0] - a[0], dy = b[1] - a[1]; const m = Math.hypot(dx, dy) || 1;
    const nz = ws.reduce((s, [f, ph, am]) => s + Math.sin(i / M * 6.283 * f + ph) * am, 0) / 2.6;
    return [p[0] - dy / m * nz * amp, p[1] + dx / m * nz * amp];
  });
  return 'M' + out.map(p => p.map(f1).join(' ')).join('L') + 'Z';
}
const ellPts = (cx, cy, rx, ry, n = 20) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * 6.283) * rx, cy + Math.sin(i / n * 6.283) * ry]);

// =====================================================================
// LAYER 1: paper, far ridges, red sun  (static, filtered)
// =====================================================================
let back = `<rect width="300" height="400" fill="${PAPER}"/>`;
back += `<g filter="url(#sn-wash)" opacity=".16"><path d="M-10 330 Q30 290 60 312 Q90 270 130 300 Q170 280 200 306 Q250 276 320 300 V400 H-10 Z" fill="#333"/></g>`;
back += `<g filter="url(#sn-edge)"><circle cx="170" cy="150" r="90" fill="${RED}"/></g>`;
back += `<g opacity=".35">${[0, 1, 2, 3, 4, 5].map(i => brush([[86, 112 + i * 14], [140, 104 + i * 14], [200, 118 + i * 14], [256, 110 + i * 14]], 9, { fill: '#8e1810', filter: 'dryH', inT: .05, outT: .3 })).join('')}</g>`;

// =====================================================================
// LAYER 2: paper-coloured bands that slide off the sun = the brush sweep
// =====================================================================
let cover = '';
for (let i = 0; i < 7; i++) {
  const y0 = 52 + i * 28, y1 = y0 + 30; let d = `M300 ${y0} L300 ${y1}`;
  // ragged leading edge (left side): bristle teeth
  const teeth = 9; for (let k = 0; k <= teeth; k++) { const y = y1 - (y1 - y0) * k / teeth; d += ` L${f1(66 + (k % 2 ? rr(10, 34) : rr(-4, 6)))} ${f1(y)}`; }
  cover += `<path class="sn-band" style="animation-delay:${(i * .07 + (i % 2) * .03).toFixed(2)}s" d="${d} Z" fill="${PAPER}"/>`;
}

// =====================================================================
// LAYER 3: the figure's static mass (ground, robe, head, calligraphy)
// =====================================================================
let fig = '';
fig += brush([[24, 372], [110, 366], [200, 374], [286, 368]], 13, { filter: 'dryH', inT: .04, outT: .35 });
fig += `<g filter="url(#sn-wash)" opacity=".25"><ellipse cx="160" cy="370" rx="110" ry="8" fill="#000"/></g>`;
fig += `<g filter="url(#sn-edge)"><path d="M118 118 C100 150 96 220 86 300 C80 330 72 352 62 368 L214 370 C232 352 248 330 258 306 C240 304 230 292 224 274 C240 266 252 252 262 236 C240 240 222 230 212 210 C224 200 234 186 244 172 C216 178 198 160 188 128 C186 120 180 116 172 114 L140 112 Z" fill="${INK}"/></g>`;
[[[112, 150], [104, 210], [100, 270], [92, 340]], [[140, 140], [138, 210], [134, 280], [128, 352]], [[176, 150], [196, 210], [220, 260], [244, 296]], [[160, 200], [176, 250], [190, 300], [196, 356]]]
  .forEach(p => fig += brush(p, 4, { fill: PAPER, op: .22, filter: 'dryV', inT: .1, outT: .5 }));
fig += brush([[100, 236], [130, 230], [170, 232], [206, 226]], 6, { fill: PAPER, op: .45, filter: 'dryH', inT: .05, outT: .3 });
fig += brush([[150, 232], [160, 252], [176, 270], [196, 280]], 4, { fill: PAPER, op: .6, filter: 'dryV' });
fig += `<g filter="url(#sn-edge)" transform="translate(154 114) scale(1.25) translate(-154 -114)"><path d="M156 70 C168 70 174 80 172 92 C172 102 168 108 164 114 L146 116 C144 112 143 109 142 106 L140 104 C139 102 141 100 140 99 L134 96 C135 93 138 91 140 88 L139 85 C141 78 146 70 156 70 Z" fill="${INK}"/>
<ellipse cx="162" cy="66" rx="6" ry="5" fill="${INK}"/><path d="M142.5 89.5 L147 89" stroke="${PAPER}" stroke-width="1.1" stroke-linecap="round"/></g>`;
fig += `<g filter="url(#sn-edge)" fill="${INK}" font-family="'Yuji Syuku',serif" font-size="36"><text x="22" y="268">静</text><text x="22" y="308">勝</text></g>`;

// =====================================================================
// LAYER 4: everything that moves (no filters in here)
// =====================================================================
let fx = '';
// wind streaks drifting through
let wind = '';
for (let i = 0; i < 7; i++) {
  const y = 60 + i * 38 + R01() * 14, x0 = -10 + R01() * 20, len = 90 + R01() * 120;
  wind += `<g class="sn-streak" style="animation-duration:${rr(3.2, 5.6).toFixed(1)}s;animation-delay:${(-rr(0, 5)).toFixed(1)}s">${dryStroke([[x0, y], [x0 + len * .3, y - 4], [x0 + len * .7, y + 3], [x0 + len, y - 2]], 2 + R01() * 3, { lanes: 3, dry: .9, inT: .05, outT: .7, tail: .5 })}</g>`;
}
fx += `<g class="sn-wind">${wind}</g>`;
// gust: long strokes that only rip across during the signature move
let rush = '';
[[70, 9], [128, 6], [196, 11], [262, 7], [330, 9]].forEach(([y, w], i) => {
  rush += `<g class="sn-rush">${dryStroke([[-150, y + 6], [-90, y - 6], [-50, y + 5], [10, y - 2]], w, { lanes: 5, dry: 1, inT: .25, outT: .5, tail: .5 })}</g>`;
});
fx += `<g opacity=".8">${rush}</g>`;
// robe tatters tearing off the right edge
const tatters = [[258, 306, 296, 296], [262, 236, 300, 226], [244, 172, 290, 160], [214, 370, 270, 352]];
tatters.forEach(([x, y, x2, y2], i) => {
  fx += streamer([[x - 14, y + 4], [x + 6, y - 2], [x2 - 16, y2 + 4], [x2, y2]], 11, { K: 3, amp: 5.5, dur: [.92, 1.18, .8, 1.34][i], ph: i * .37, lanes: 5, dry: .55, inT: .05, outT: .6, tail: .62 });
  // a second, thinner shred under each for depth
  fx += streamer([[x - 12, y + 9], [x + 4, y + 8], [x2 - 26, y2 + 16], [x2 - 12, y2 + 15]], 5, { K: 2, amp: 8, dur: [.7, .86, .64, .98][i], ph: i * .21 + .3, lanes: 3, dry: 1, inT: .05, outT: .7, tail: .5 });
});
// the arm (thrust in the move) + sword-finger hand
const armD = [
  'M130 116 C112 120 90 132 74 140 L70 152 C76 176 86 196 104 214 C110 192 118 170 130 150 Z',
  'M104 214 C114 222 128 224 140 220 C130 214 120 204 112 190 Z',
].map(d => `<path d="${rough(flat(d), 1.2)}"/>`).join('');
const hand = `<path d="${rough(ellPts(66, 146, 8.5, 7.5), .7, 2)}"/><path d="${rough(flat('M57.5 144 L57.8 122 C58 117 66.4 117 66.4 122 L66.6 140 Z'), .5, 2)}"/><path d="${rough(flat('M69 141 C74 135 77.5 140 74 146 Z'), .4, 2)}"/>`;
fx += `<g class="sn-arm" fill="${INK}" style="transform-origin:130px 128px">${armD}${dryStroke([[104, 214], [124, 232], [146, 236], [168, 230]], 6, { lanes: 4, dry: .8 })}${hand}</g>`;
// hair: ponytail ribbons streaming back
fx += streamer([[166, 58], [190, 52], [204, 70], [236, 64]], 8.5, { K: 3, amp: 6, dur: .86, lanes: 5, dry: .5, inT: .05, outT: .85, tail: .6 });
fx += streamer([[168, 62], [192, 64], [206, 82], [232, 86]], 5.5, { K: 3, amp: 8, dur: .7, ph: .3, lanes: 4, dry: .9, inT: .05, outT: .85, tail: .5 });
// white beard torn sideways across the chest
[[[140, 114], [156, 136], [176, 150], [212, 166]], [[144, 116], [158, 128], [184, 136], [222, 140]], [[142, 118], [150, 146], [166, 170], [196, 190]], [[146, 116], [164, 122], [190, 124], [230, 116]]]
  .forEach((p, i) => fx += streamer(p, 9.5 - i, { fill: PAPER, K: 3, amp: 4.2 + i * .5, dur: [1.04, .84, 1.2, .74][i], ph: i * .29, lanes: 6, dry: .75, inT: .08, outT: .75, tail: .55 }));

// speed rays off the fingertips (move only)
const cx = 70, cy = 116;
let rays = '';
for (let i = 0; i < 12; i++) {
  const th = i / 12 * 6.283 + rr(-.2, .2), r0 = rr(16, 24), r1 = rr(64, 118), wv = rr(.035, .07);
  const p = (r, a) => `${f1(cx + Math.cos(a) * r)} ${f1(cy + Math.sin(a) * r * .85)}`;
  rays += `<path class="sn-ray" d="M${p(r0, th - wv)}L${p(r1, th)}L${p(r0, th + wv)}Z"/>`;
}
fx += `<g fill="${INK}" style="transform-origin:${cx}px ${cy}px">${rays}</g>`;

// the chip vortex spiralling off the raised fingers
let vortex = '';
let flecks = '';
for (let i = 0; i < 26; i++) { const th = R01() * 6.3, r = 18 + R01() * 44; flecks += `<circle cx="${f1(cx + Math.cos(th) * r)}" cy="${f1(cy + Math.sin(th) * r * .8)}" r="${(.6 + R01() * 2).toFixed(1)}" fill="${R01() > .8 ? RED : INK}"/>`; }
vortex += `<g class="sn-flecks" opacity=".8">${flecks}</g>`;
for (let k = 0; k < 11; k++) {
  const th = -1.9 + k * .62, r = 13 + k * 4.5;
  const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r * .8;
  const rx = 4.5 + k * .42, ry = rx * .4, rot = th * 57.3 + 90;
  const col = k % 3 === 1 ? RED : INK;
  const m = Math.hypot(x - cx, y - cy);
  vortex += `<g class="sn-chip" data-ux="${((x - cx) / m).toFixed(3)}" data-uy="${((y - cy) / m).toFixed(3)}" style="transform-origin:${f1(x)}px ${f1(y)}px"><g transform="rotate(${f1(rot)} ${f1(x)} ${f1(y)})"><path d="${rough(ellPts(x, y, rx, ry, 16), .5, 2)}" fill="${col}"/><ellipse cx="${f1(x)}" cy="${f1(y - ry * .3)}" rx="${f1(rx * .55)}" ry="${f1(ry * .35)}" fill="none" stroke="${PAPER}" stroke-width=".7" opacity=".65"/></g></g>`;
}
fx += `<g class="sn-orbit" style="transform-origin:${cx}px ${cy}px"><g class="sn-vortex" style="transform-origin:${cx}px ${cy}px">${vortex}</g></g>`;

// ink splats that burst across the paper (move only)
function splat(x, y, r, col) {
  // thrown ink: a blob stretched along the throw direction, a few heavy forward lobes, satellite drops beyond
  const a0 = Math.atan2(y - cy, x - cx), c = Math.cos(a0), sn = Math.sin(a0);
  const blob = ellPts(0, 0, r * 1.25, r * .78, 22).map(([px, py]) => [x + px * c - py * sn, y + px * sn + py * c]);
  let s = `<path d="${rough(blob, r * .22, 2)}"/>`;
  const q = (d, aa) => `${f1(x + Math.cos(aa) * d)} ${f1(y + Math.sin(aa) * d)}`;
  const n = 4 + Math.floor(R01() * 3);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i < n - 1 ? rr(-1.15, 1.15) : rr(2.4, 3.9)), d0 = r * rr(.45, .7), d1 = r * (i < n - 1 ? rr(1.7, 3.3) : rr(1.3, 1.8)), w = rr(.28, .5);
    s += `<path d="M${q(d0, a - w)}Q${q(d1 * .7, a - w * .12)} ${q(d1, a)}Q${q(d1 * .7, a + w * .12)} ${q(d0, a + w)}Z"/>`;
    if (R01() > .35) s += `<circle cx="${f1(x + Math.cos(a) * d1 * 1.22)}" cy="${f1(y + Math.sin(a) * d1 * 1.22)}" r="${f1(rr(.7, r * .2))}"/>`;
  }
  for (let i = 0; i < 4; i++) { const a = a0 + rr(-.5, .5), d = r * rr(2.6, 5.2); s += `<ellipse cx="${f1(x + Math.cos(a) * d)}" cy="${f1(y + Math.sin(a) * d)}" rx="${f1(rr(1, r * .28))}" ry="${f1(rr(.6, r * .14))}" transform="rotate(${f1(a * 57.3)} ${f1(x + Math.cos(a) * d)} ${f1(y + Math.sin(a) * d)})"/>`; }
  return `<g class="sn-splat" fill="${col}" style="transform-origin:${x}px ${y}px">${s}</g>`;
}
let splats = '';
[[30, 50, 10, INK], [236, 40, 9, INK], [262, 268, 8, INK], [30, 200, 7, RED], [270, 128, 5, RED]].forEach(a => splats += splat(...a));
let drops = '';
for (let i = 0; i < 34; i++) {
  const a = rr(0, 6.283), d = rr(46, 210), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * .9;
  if (x < 6 || x > 294 || y < 6 || y > 394) continue;
  const r = rr(.8, 3.2), el = rr(1, 2.2), deg = a * 57.3;
  drops += `<ellipse class="sn-drop" data-dx="${f1(cx - x)}" data-dy="${f1(cy - y)}" cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r * el)}" ry="${f1(r)}" transform="rotate(${f1(deg)} ${f1(x)} ${f1(y)})" fill="${R01() > .82 ? RED : INK}"/>`;
}
fx += `<g class="sn-burst">${splats}${drops}</g>`;

// the seal (stamps in the move)
fx += `<g class="sn-seal" style="transform-origin:39px 332px"><path d="${rough([[27, 320], [51, 320], [51, 344], [27, 344]], .9, 2.5)}" fill="${RED}"/><text x="39" y="337" text-anchor="middle" font-family="serif" font-weight="700" font-size="14" fill="${PAPER}">師</text></g>`;
fx += `<path class="sn-sealring" d="M22 315 H56 V349 H22 Z" fill="none" stroke="${RED}" stroke-width="1.6" style="transform-origin:39px 332px"/>`;

const defs = `<defs>
<filter id="sn-edge" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="3"/><feDisplacementMap in="SourceGraphic" scale="3.5"/></filter>
<filter id="sn-dryH" x="-5%" y="-30%" width="110%" height="160%"><feTurbulence type="fractalNoise" baseFrequency=".02 .7" numOctaves="2" seed="9" result="s"/><feColorMatrix in="s" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.75" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in" result="c"/><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="4"/><feDisplacementMap in="c" scale="3"/></filter>
<filter id="sn-dryV" x="-30%" y="-5%" width="160%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".7 .02" numOctaves="2" seed="12" result="s"/><feColorMatrix in="s" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.75" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>
<filter id="sn-wash"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="sn-grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" seed="8"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .42  0 0 0 0 .32  0 0 0 .14 0"/></filter>
</defs>`;
const svg = (cls, body, extra = '') => `<svg class="sn-l ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${extra}${body}</svg>`;

const markup = [
  '<!-- layer 1: paper + sun (static, filtered once) -->', svg('sn-l-back', back, defs),
  '<!-- layer 2: entrance brush sweep (paper bands sliding off the sun) -->', svg('sn-l-cover', cover),
  '<!-- layer 3: robe, head, calligraphy (static, filtered once) -->', svg('sn-l-fig', fig),
  '<!-- layer 4: all motion; filter-free baked brush geometry -->', svg('sn-l-fx', fx),
  '<!-- layer 5: paper grain over everything (static) -->', svg('sn-l-grain', '<rect width="300" height="400" filter="url(#sn-grain)"/>'),
].join('\n');

const css = `
/* ---- sn: Ink Sensei ---- */
.sn-root{background:${PAPER}}
.sn-l-back,.sn-l-fig,.sn-l-grain{will-change:transform}        /* own compositor layers: filters rasterise once */
.sn-l-grain,.sn-l-cover{pointer-events:none}
.sn-l-fx *{transform-box:view-box}
/* idle: every brush segment flutters about its own joint; the lag between joints makes a travelling wave */
@keyframes sn-flut{0%{transform:rotate(calc(var(--a)*-1))}28%{transform:rotate(var(--a))}47%{transform:rotate(calc(var(--a)*-.35))}68%{transform:rotate(calc(var(--a)*.7))}100%{transform:rotate(calc(var(--a)*-1))}}
.sn-seg{animation:sn-flut 1s ease-in-out infinite}
/* idle: wind streaks drift through and fade */
@keyframes sn-drift{0%{transform:translateX(-46px);opacity:0}25%{opacity:.26}70%{opacity:.2}100%{transform:translateX(70px);opacity:0}}
.sn-streak{opacity:.22;animation:sn-drift 4s linear infinite}
/* idle: the chip spiral turns slowly round the fingertips */
@keyframes sn-orbit{to{transform:rotate(360deg)}}
.sn-orbit{animation:sn-orbit 22s linear infinite}
/* move-only pieces are invisible at rest */
.sn-rush,.sn-ray,.sn-splat,.sn-drop,.sn-sealring{opacity:0}
.sn-band{opacity:0}
/* entrance: sun brushed in band by band, then the figure inks in, seal lands */
@keyframes sn-sweep{0%{transform:translateX(0);opacity:1}100%{transform:translateX(250px);opacity:1}}
.sn-go .sn-band{animation:sn-sweep .46s cubic-bezier(.5,0,.3,1) backwards}
@keyframes sn-inkin{0%{opacity:0;transform:translateX(9px)}100%{opacity:1;transform:none}}
.sn-go .sn-l-fig{animation:sn-inkin .42s .5s cubic-bezier(.2,.7,.2,1) backwards}
.sn-go .sn-l-fx{animation:sn-inkin .42s .56s cubic-bezier(.2,.7,.2,1) backwards}
`;

module.exports = {
  prefix: 'sn', name: 'Ink Sensei', player: 'Dev', font: true, auto: 1200,
  markup, css, hooks: fs.readFileSync(__dirname + '/sensei.hooks.cjs', 'utf8'),
};
