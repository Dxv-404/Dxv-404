// Ink Tiger, animated. A sumi-e tiger's head, face on: heavy brush outline, the 王 ("king") mark on the
// forehead, burning amber eyes, bamboo across a red sun. Everything that moves is baked dry-brush geometry
// (no filters); the filtered pieces sit in static layers that rasterise once.
const fs = require('fs');
const INK = '#121212', PAPER = '#f2ead8', FUR = '#fbf7ec', RED = '#c22a1f';
const B = require('./brush.cjs')(41, INK);
const { f1, rr, dry, flat, rough } = B;
const mx = pts => pts.map(([x, y]) => [300 - x, y]);
const MIR = 'transform="translate(300 0) scale(-1 1)"';
const both = fn => fn() + `<g ${MIR}>${fn()}</g>`;                  // drawn twice: each side gets its own bristles
const st = (p4, w, o = {}) => dry(p4, w, o);

// ---------------------------------------------------------------- layer 1: paper and the red sun behind the head
let back = `<rect width="300" height="400" fill="${PAPER}"/>`;
back += `<g filter="url(#tg-edge)"><circle cx="150" cy="150" r="141" fill="${RED}"/></g>`;
back += `<g opacity=".4" fill="#8e1810">${Array.from({ length: 9 }, (_, i) => `<path d="${st([[14, 22 + i * 19], [90, 14 + i * 19], [210, 30 + i * 19], [292, 18 + i * 19]], 9, { inT: .05, outT: .3, dry: .9 })}"/>`).join('')}</g>`;

// ---------------------------------------------------------------- layer 2: bamboo leaves hanging in from the corners
const leaf = (x, y, len, ang, w = 9) => {
  const a = ang * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), P = (u, v) => [x + c * u - s * v, y + s * u + c * v];
  const pts = []; const n = 9;
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push(P(t * len, Math.sin(Math.pow(t, .7) * Math.PI) * w / 2)); }
  for (let i = n - 1; i > 0; i--) { const t = i / n; pts.push(P(t * len, -Math.sin(Math.pow(t, .7) * Math.PI) * w / 2.6)); }
  return `<path d="${rough(pts, .5, 3)}"/>`;
};
const cluster = (x, y, k, list) => `<g class="tg-lf" data-k="${k}" style="transform-origin:${x}px ${y}px;animation-delay:${(-k * .7).toFixed(2)}s">${list.map(([len, ang, w]) => leaf(x, y, len, ang, w)).join('')}</g>`;
let leaves = `<g fill="${INK}">`
  + cluster(306, 6, 0, [[78, 150, 12], [64, 128, 11], [52, 172, 10], [40, 108, 9]])
  + cluster(304, 58, 1, [[50, 158, 9], [38, 134, 8]])
  + cluster(-6, 10, 2, [[70, 34, 11], [56, 56, 10], [44, 14, 9]])
  + `</g>`;
leaves += `<g fill="${INK}">${[[262, 40, 26, 150], [280, 86, 22, 172], [250, 20, 20, 140], [286, 120, 24, 160], [240, 60, 18, 168]].map(([x, y, l, a], i) => `<g class="tg-fly" data-i="${i}" style="transform-origin:${x}px ${y}px">${leaf(x, y, l, a, 7)}</g>`).join('')}</g>`;
leaves += `<g class="tg-fall" fill="${INK}" style="transform-origin:262px 44px">${leaf(262, 44, 20, 150, 7)}</g>`;

// ---------------------------------------------------------------- layer 3: the head (static), cropped close
const HALF = 'M150 88 C166 88 182 89 196 93 C200 70 222 52 246 58 C266 64 275 88 268 113 C280 140 288 168 286 196 L308 214 L282 227 L312 252 L284 259 L310 290 L278 291 L296 324 L262 317 C250 345 226 373 196 385 C180 391 164 393 150 393';
const right = flat(HALF, 9);
const outline = right.concat(mx(right).reverse().slice(1, -1));
const inset = (pts, k, dy = 0) => pts.map(([x, y]) => [150 + (x - 150) * k, 250 + (y - 250) * k + dy]);
let head = `<g filter="url(#tg-edge)"><path d="${rough(outline, 1.6)}" fill="${INK}"/></g>`;
// shadow down one side of the face
const furD = rough(inset(outline, .925, -1), 1.3);
head = `<g filter="url(#tg-edge)"><path d="${rough(outline, 1.6)}" fill="${INK}"/></g><path d="${furD}" fill="${FUR}"/><clipPath id="tg-fur"><path d="${furD}"/></clipPath><rect width="300" height="400" fill="url(#tg-shade)" clip-path="url(#tg-fur)"/>`;
// ruff: dry-brush flicks over the edge of the white
head += `<g fill="${INK}">${both(() => [[296, 216, 268, 226], [298, 254, 270, 262], [296, 292, 266, 294], [282, 322, 254, 316], [248, 350, 228, 338]].map(([x0, y0, x1, y1]) => `<path d="${st([[x0, y0], [x0 - 9, y0 + 3], [x1 + 9, y1 - 2], [x1, y1]], 11, { outT: .8, dry: .8 })}"/>`).join(''))}</g>`;
// ears: ink inside, a red sliver
head += both(() => `<path d="${rough(flat('M206 100 C208 82 226 68 244 70 C258 76 262 94 258 112 C242 112 224 108 206 100 Z', 6), .8)}" fill="${INK}"/><path d="${rough(flat('M222 96 C226 86 236 80 246 82 C250 90 250 98 248 104 C238 104 230 100 222 96 Z', 5), .4)}" fill="${RED}"/>`);
// nose: long bridge, broad pad, the lip
head += `<g fill="${INK}">${both(() => `<path d="${st([[166, 238], [165, 250], [169, 262], [178, 272]], 7, { outT: .45, dry: .5 })}"/><path d="${st([[157, 196], [155, 204], [156, 212], [159, 220]], 5, { outT: .6, dry: .4 })}"/>`)}</g>`;
head += `<g filter="url(#tg-edge2)"><path d="M120 271 Q150 261 180 271 Q177 290 150 302 Q123 290 120 271 Z" fill="${RED}" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>`
  + `<path d="M150 302 V314 M150 314 C138 328 114 329 98 314 M150 314 C162 328 186 329 202 314" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/></g>`;
head += `<path d="M134 274 Q150 268 166 274" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".5"/><path d="M131 281 q3 6 9 5 M169 281 q-3 6 -9 5" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
head += `<g fill="${INK}">${both(() => [[178, 298], [192, 294], [206, 292], [182, 308], [196, 305], [210, 303]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${f1(rr(1.7, 2.6))}"/>`).join(''))}</g>`;

// ---------------------------------------------------------------- layer 4: everything on the head that moves
const stripe = (p4, w, o, i) => `<path class="tg-st" style="transform-origin:${f1(p4[0][0])}px ${f1(p4[0][1])}px;--i:${i}" d="${st(p4, w, { inT: .08, outT: .75, dry: .5, ...o })}"/>`;
let si = 0;
let face = `<g fill="${INK}">`;
// 王 on the forehead
face += stripe([[124, 124], [138, 120], [162, 120], [177, 125]], 12, { outT: .4 }, si++);
face += stripe([[132, 146], [142, 143], [158, 143], [169, 147]], 11, { outT: .4 }, si++);
face += stripe([[150, 116], [151, 136], [149, 156], [150, 178]], 11.5, { outT: .35 }, si++);
face += stripe([[120, 170], [136, 165], [164, 165], [181, 171]], 13, { outT: .4 }, si++);
const side = () => {
  let s = '';
  [[[180, 97], [186, 118], [183, 140], [174, 160], 14], [[206, 100], [214, 124], [208, 148], [196, 168], 15], [[236, 110], [242, 132], [234, 154], [220, 172], 14],
   [[284, 170], [266, 166], [250, 172], [238, 184], 14], [[292, 214], [270, 216], [250, 226], [236, 240], 16], [[296, 252], [272, 252], [252, 260], [238, 272], 17],
   [[290, 290], [268, 286], [250, 290], [236, 300], 15], [[270, 322], [254, 316], [240, 318], [230, 326], 12]]
    .forEach(([a, b, c, d, w]) => { s += stripe([a, b, c, d], w, {}, si++); });
  return s;
};
face += side() + `<g ${MIR}>${side()}</g></g>`;
// eyes: narrowed under a heavy brow
const eye = () => `<g class="tg-eye">
<path d="M166 228 C179 208 207 197 235 201 C230 221 213 233 194 234 C182 234 172 232 166 228 Z" fill="${INK}"/>
<path d="${st([[168, 226], [164, 234], [163, 244], [165, 254]], 6, { outT: .7, dry: .3 })}" fill="${INK}"/>
<circle class="tg-glow" cx="200" cy="216" r="22" fill="url(#tg-glow)" style="transform-origin:200px 216px"/>
<g class="tg-iris" style="transform-origin:200px 217px"><circle cx="200" cy="217" r="9.5" fill="url(#tg-iris)"/><ellipse cx="200" cy="217" rx="2" ry="8" fill="#0b0b0b"/><circle cx="196.6" cy="214" r="1.7" fill="#fff8dc"/></g>
<path d="M164 229 C178 205 207 194 238 199 L241 190 C204 182 172 196 158 226 Z" fill="${INK}"/>
<ellipse class="tg-lid" cx="200" cy="217" rx="12" ry="11" fill="${INK}" style="transform-origin:200px 207px"/>
<path class="tg-brow" style="transform-origin:156px 208px" d="${st([[153, 211], [180, 186], [218, 178], [256, 166]], 18, { inT: .1, outT: .6, dry: .45 })}" fill="${INK}"/>
</g>`;
face += both(eye);
// mouth: the cavity opens under the lip; the chin drops over it; the fangs always show
face += `<g class="tg-maw" style="transform-origin:150px 316px">
<path d="M98 316 C118 332 140 330 150 317 C160 330 182 332 202 316 C207 352 186 393 150 399 C114 393 93 352 98 316 Z" fill="#1c0505"/>
<path d="M114 338 C130 352 170 352 186 338 C188 364 172 386 150 388 C128 386 112 364 114 338 Z" fill="#8f1a14"/>
<ellipse cx="150" cy="378" rx="22" ry="12" fill="#c8362a"/>
<path d="M139 330 L143 340 L147 330 Z M153 330 L157 340 L161 330 Z" fill="#fffdf2"/>
<path d="M128 392 L134 370 L141 392 Z M159 392 L166 370 L172 392 Z" fill="#fffdf2" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
</g>`;
face += `<g class="tg-chin"><path d="${rough(flat('M110 333 C130 346 170 346 190 333 C195 358 178 381 150 383 C122 381 105 358 110 333 Z', 8), .6)}" fill="${FUR}" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>
<g fill="${INK}"><path d="${st([[141, 356], [142, 364], [141, 372], [138, 381]], 5, { outT: .8 })}"/><path d="${st([[150, 358], [150, 366], [150, 376], [150, 386]], 5.5, { outT: .8 })}"/><path d="${st([[159, 356], [158, 364], [159, 372], [162, 381]], 5, { outT: .8 })}"/></g></g>`;
face += `<path class="tg-fang" d="M107 319 L119 358 L132 326 Z M168 326 L181 358 L193 319 Z" fill="#fffdf2" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
// whiskers
const whisk = () => [[212, 296, 268, 276, 310, 262, 2.8], [214, 303, 272, 300, 314, 304, 3], [212, 310, 264, 326, 302, 346, 2.6]]
  .map(([x0, y0, x1, y1, x2, y2, w], k) => `<path class="tg-wh" style="transform-origin:${x0}px ${y0}px;--a:${(1.6 + k * .5).toFixed(1)}deg;--d:${(-k * .31).toFixed(2)}s" d="${st([[x0, y0], [x1 - 20, y1 + 4], [x1 + 8, y1], [x2, y2]], w, { inT: .02, outT: .9, lanes: 2, dry: .2, tail: .9 })}"/>`).join('');
face += `<g fill="${INK}">${whisk()}<g ${MIR}>${whisk()}</g></g>`;

// ---------------------------------------------------------------- layer 5: the roar's marks, the seal, mist
let fx = '';
// three claw strokes, upper right to lower left: red under ink
[-34, 0, 34].forEach((o, i) => {
  const ox = o * .75, oy = o * .66, k = 1 - Math.abs(o) / 170;
  const p = [[296 + ox, 30 + oy], [236 + ox, 110 + oy], [150 + ox, 196 + oy], [150 + ox - 118 * k, 196 + oy + 128 * k]];
  const q = p.map(([x, y]) => [x + 5, y + 6]);
  fx += `<g class="tg-sl" data-i="${i}" style="transform-origin:${p[0][0]}px ${p[0][1]}px"><path d="${st(q, 17, { inT: .04, outT: .5, lanes: 7, dry: .8, tail: .7 })}" fill="${RED}"/><path d="${st(p, 13, { inT: .04, outT: .55, lanes: 7, dry: .7, tail: .7 })}" fill="${INK}"/></g>`;
});
// ink thrown from the mouth
for (let i = 0; i < 16; i++) {
  const a = rr(.15, 2.99), d = rr(60, 170), r = rr(1.6, 5.5);
  fx += `<circle class="tg-dp" data-dx="${f1(Math.cos(a) * d * (i % 2 ? 1 : -1) * .9)}" data-dy="${f1(Math.sin(a) * d * .7 + 10)}" cx="150" cy="356" r="${f1(r)}" fill="${i % 5 === 0 ? RED : INK}" style="transform-origin:150px 356px"/>`;
}
// the seal: 王 cut in red
fx += `<g class="tg-seal" style="transform-origin:33px 367px"><path d="${rough([[15, 349], [51, 350], [50, 385], [14, 384]], .9, 3)}" fill="${RED}"/>
<path d="M23 358 H43 M25 367 H41 M22 377 H44 M33 358 V377" stroke="${PAPER}" stroke-width="3.2" stroke-linecap="square" fill="none"/></g>
<rect class="tg-ring" x="14" y="348" width="38" height="38" fill="none" stroke="${RED}" stroke-width="2" style="transform-origin:33px 367px"/>`;
fx += `<rect class="tg-flash" width="300" height="400" fill="#fff6e6"/>`;

const defs = `<defs>
<filter id="tg-edge" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="3" seed="5"/><feDisplacementMap in="SourceGraphic" scale="3.6"/></filter>
<filter id="tg-edge2" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="11"/><feDisplacementMap in="SourceGraphic" scale="2"/></filter>
<filter id="tg-wash"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="tg-grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" seed="8"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .42  0 0 0 0 .32  0 0 0 .14 0"/></filter>
</defs>`;
const grads = `<defs>
<radialGradient id="tg-iris" cx=".42" cy=".4" r=".7"><stop offset="0" stop-color="#ffe27a"/><stop offset=".55" stop-color="#f0a41c"/><stop offset="1" stop-color="#b85a08"/></radialGradient>
<radialGradient id="tg-glow"><stop offset="0" stop-color="#ffb21e" stop-opacity=".95"/><stop offset=".45" stop-color="#ff8a12" stop-opacity=".4"/><stop offset="1" stop-color="#ff7a00" stop-opacity="0"/></radialGradient>
<linearGradient id="tg-shade" x1="0" y1="0" x2="1" y2=".25"><stop offset=".5" stop-color="#3a3024" stop-opacity="0"/><stop offset="1" stop-color="#3a3024" stop-opacity=".36"/></linearGradient>
<radialGradient id="tg-mist"><stop offset="0" stop-color="${PAPER}" stop-opacity=".95"/><stop offset=".6" stop-color="${PAPER}" stop-opacity=".6"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></radialGradient>
</defs>`;
const svg = (cls, body, extra = '') => `<svg class="tg-svg ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${extra}${body}</svg>`;

const markup = [
  '<!-- layer 1: paper and sun (static, filtered once) -->', svg('tg-l-back', back, defs),
  '<!-- layer 2: bamboo leaves -->', svg('tg-l-leaf', leaves),
  '<!-- layer 3: the head (static, filtered once) -->', svg('tg-l-head tg-hd', head),
  '<!-- layer 4: stripes, eyes, jaw, whiskers -->', svg('tg-l-face tg-hd', face, grads),
  '<!-- layer 5: claw strokes, ink, mist, seal -->', svg('tg-l-fx', fx),
  '<!-- layer 6: paper grain (static) -->', svg('tg-l-grain', '<rect width="300" height="400" filter="url(#tg-grain)"/>'),
].join('\n');

const css = `
/* ---- tg: Ink Tiger ---- */
.tg-root{background:${PAPER}}
.tg-l-back,.tg-l-head,.tg-l-grain{will-change:transform}
.tg-l-grain,.tg-l-fx{pointer-events:none}
.tg-svg *{transform-box:view-box}
.tg-hd{transform-origin:50% 60%}
/* idle: slow breath; eyes smoulder; a blink; whiskers twitch; bamboo sways; a leaf falls */
@keyframes tg-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.013)}}
.tg-hd{animation:tg-breathe 5.2s ease-in-out infinite}
@keyframes tg-glow{0%,100%{opacity:.5;transform:scale(.92)}50%{opacity:1;transform:scale(1.12)}}
.tg-glow{animation:tg-glow 2.8s ease-in-out infinite}
@keyframes tg-blink{0%,93.5%,100%{transform:scaleY(0)}95.5%,97%{transform:scaleY(1)}}
.tg-lid{transform:scaleY(0);animation:tg-blink 6.4s linear infinite}
@keyframes tg-tw{0%,62%,100%{transform:rotate(0)}68%{transform:rotate(var(--a))}75%{transform:rotate(calc(var(--a)*-.7))}83%{transform:rotate(calc(var(--a)*.4))}}
.tg-wh{animation:tg-tw 4.3s var(--d) ease-in-out infinite}
@keyframes tg-sway{0%,100%{transform:rotate(-2.4deg)}50%{transform:rotate(3.2deg)}}
.tg-lf{animation:tg-sway 3.7s ease-in-out infinite}
@keyframes tg-fall{0%,55%{transform:translate(0,0) rotate(0);opacity:0}58%{opacity:1}100%{transform:translate(-190px,330px) rotate(-250deg);opacity:1}}
.tg-fall{opacity:0;animation:tg-fall 9s cubic-bezier(.4,.1,.6,.9) infinite}
/* only in the roar */
.tg-sl,.tg-dp,.tg-fly,.tg-flash,.tg-ring{opacity:0}
.tg-maw{transform:scaleY(0);opacity:0}
/* entrance: the page comes up, ink blooms into the head, the stripes are brushed on one by one, the eyes light, the seal lands */
@keyframes tg-in{from{opacity:0}to{opacity:1}}
@keyframes tg-bloom{0%{clip-path:circle(0% at 50% 62%);opacity:.4}100%{clip-path:circle(80% at 50% 62%);opacity:1}}
@keyframes tg-paint{0%{transform:scale(0);opacity:0}15%{opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes tg-light{0%{opacity:0}60%{opacity:1;filter:brightness(2.2)}100%{opacity:1;filter:none}}
@keyframes tg-stamp{0%{transform:scale(2.1) rotate(-9deg);opacity:0}70%{transform:scale(.94) rotate(0);opacity:1}100%{transform:scale(1);opacity:1}}
.tg-go .tg-l-back{animation:tg-in .35s ease-out backwards}
.tg-go .tg-l-leaf{animation:tg-in .5s .15s ease-out backwards}
.tg-go .tg-l-head{animation:tg-bloom .6s .2s cubic-bezier(.3,.6,.3,1) backwards,tg-breathe 5.2s ease-in-out infinite}
.tg-go .tg-st{animation:tg-paint .26s calc(.55s + var(--i)*.04s) cubic-bezier(.2,.7,.3,1) backwards}
.tg-go .tg-chin{animation:tg-in .3s .55s ease-out backwards}
.tg-go .tg-eye{animation:tg-light .5s 1.45s ease-out backwards}
.tg-go .tg-wh{animation:tg-paint .3s 1.3s ease-out backwards,tg-tw 4.3s 1.6s ease-in-out infinite}
.tg-go .tg-fang{animation:tg-in .3s .6s ease-out backwards}
.tg-go .tg-seal{animation:tg-stamp .28s 1.75s cubic-bezier(.3,1.4,.5,1) backwards}
`;

module.exports = {
  prefix: 'tg', name: 'Ink Tiger', player: 'Anish', auto: 2500,
  markup, css, hooks: fs.readFileSync(__dirname + '/tiger.hooks.cjs', 'utf8'),
};
