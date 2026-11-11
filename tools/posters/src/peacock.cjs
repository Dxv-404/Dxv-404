// Velvet Peacock, animated. Extends ../peacock.js: same generated Art Deco fan, but every
// feather (vane, eye, base scale) sits in its own pivoting group so the tail can fold and snap open.
const fs = require('fs');
const cx = 150, cy = 318, N = 15, spread = 150;
const O = `transform-origin:${cx}px ${cy}px`;
let tail = '', eyes = '', rays = '';
// wrap: static fan angle (attribute) > .pk-f (fold/open, driven by JS)
const wrap = (a, i, body, extra = '') => `<g transform="rotate(${a.toFixed(2)} ${cx} ${cy})"><g class="pk-f" data-a="${a.toFixed(2)}" data-r="${Math.abs(i - (N - 1) / 2)}" style="${O}">${body}</g></g>`;
for (let i = 0; i < N; i++) {
  const a = -spread / 2 + (spread / (N - 1)) * i;
  const len = 210 - Math.abs(i - (N - 1) / 2) * 7, tip = cy - len;
  tail += wrap(a, i, `<path d="M${cx} ${cy} C${cx - 7} ${cy - len * .45} ${cx - 19} ${tip + 44} ${cx} ${tip} C${cx + 19} ${tip + 44} ${cx + 7} ${cy - len * .45} ${cx} ${cy} Z" fill="url(#pk-vane)" stroke="#0b3a40" stroke-width="1"/>
    <path d="M${cx} ${cy} L${cx} ${tip + 6}" stroke="url(#pk-gold)" stroke-width="1.2" opacity=".85"/>
    ${[.35, .5, .62].map(f => `<path d="M${cx - 6} ${cy - len * f + 6} L${cx} ${cy - len * f} L${cx + 6} ${cy - len * f + 6}" stroke="#d4a64a" stroke-width=".8" fill="none" opacity=".55"/>`).join('')}`);
  const ey = tip + 28;
  eyes += wrap(a, i, `<g class="pk-eye" data-i="${i}" style="transform-origin:${cx}px ${ey}px">
    <ellipse cx="${cx}" cy="${tip + 26}" rx="13" ry="17" fill="url(#pk-gold)"/>
    <ellipse cx="${cx}" cy="${tip + 27}" rx="10" ry="13" fill="#1a8a7a"/>
    <ellipse cx="${cx}" cy="${tip + 29}" rx="6.5" ry="8.5" fill="#1d3f8a"/>
    <ellipse cx="${cx}" cy="${tip + 31}" rx="3.2" ry="4.2" fill="#0a1430"/>
    <ellipse cx="${cx - 1.5}" cy="${tip + 27}" rx="1.4" ry="2" fill="#f3d58a"/>
    <g class="pk-shine" style="animation-delay:${(i * .11).toFixed(2)}s"><ellipse cx="${cx}" cy="${tip + 26}" rx="13" ry="17" fill="#fff6d0" opacity=".3"/><ellipse cx="${cx}" cy="${tip + 27}" rx="10" ry="13" fill="#7dffe0" opacity=".34"/>
    <ellipse cx="${cx}" cy="${tip + 26}" rx="14.5" ry="18.5" fill="none" stroke="#fffbe6" stroke-width="1.6"/>
    <path d="M${cx - 2} ${tip + 16} L${cx - .6} ${tip + 24.6} L${cx + 7} ${tip + 26} L${cx - .6} ${tip + 27.4} L${cx - 2} ${tip + 36} L${cx - 3.4} ${tip + 27.4} L${cx - 11} ${tip + 26} L${cx - 3.4} ${tip + 24.6} Z" fill="#ffffff"/></g>
  </g>`);
}
for (let i = 0; i < 24; i++) {
  const a = (i / 24) * Math.PI * 2;
  rays += `<path d="M${cx} ${cy} L${(cx + Math.cos(a - .06) * 400).toFixed(1)} ${(cy + Math.sin(a - .06) * 400).toFixed(1)} L${(cx + Math.cos(a + .06) * 400).toFixed(1)} ${(cy + Math.sin(a + .06) * 400).toFixed(1)} Z"/>`;
}
const scales = Array.from({ length: 11 }, (_, i) => { const a = -75 + i * 15; return wrap(a, i * 1.4, `<path d="M${cx} ${cy} C${cx - 9} ${cy - 30} ${cx - 8} ${cy - 54} ${cx} ${cy - 62} C${cx + 8} ${cy - 54} ${cx + 9} ${cy - 30} ${cx} ${cy} Z" fill="#5a1626" stroke="url(#pk-gold)" stroke-width="1.3"/>`); }).join('');
const crest = [[166, 181, 156, 158, 156, 157], [170, 180, 166, 154, 166, 153], [174, 180, 176, 155, 176, 154], [177, 182, 186, 160, 186, 159]]
  .map(([x0, y0, x1, y1, bx, by], k) => `<g class="pk-cs" style="transform-origin:${x0}px ${y0}px;animation-delay:${(-k * .13).toFixed(2)}s"><path d="M${x0} ${y0} L${x1} ${y1}" stroke="#1d3f8a" stroke-width="1.2" fill="none"/><circle cx="${bx}" cy="${by}" r="3" fill="url(#pk-gold)"/></g>`).join('');

const markup = `<!-- layer 1: velvet sunburst (repaints only during the move) -->
<svg class="pk-svg pk-l-back" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
<defs>
<linearGradient id="pk-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dc96"/><stop offset=".5" stop-color="#d4a64a"/><stop offset="1" stop-color="#9c7124"/></linearGradient>
<linearGradient id="pk-vane" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#0f4c5c"/><stop offset=".6" stop-color="#16707a"/><stop offset="1" stop-color="#2aa38e"/></linearGradient>
<radialGradient id="pk-bg" cx=".5" cy=".75" r=".8"><stop offset="0" stop-color="#7a1f34"/><stop offset="1" stop-color="#2a0814"/></radialGradient>
<linearGradient id="pk-neck" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f62c4"/><stop offset=".55" stop-color="#1d3f8a"/><stop offset="1" stop-color="#0f2558"/></linearGradient>
<clipPath id="pk-frame"><rect x="18" y="18" width="264" height="364" rx="2"/></clipPath>
</defs>
<rect width="300" height="400" fill="#1a0510"/>
<g clip-path="url(#pk-frame)">
<rect width="300" height="400" fill="url(#pk-bg)"/>
<g class="pk-rays" fill="#a0304a" opacity=".22" style="${O}">${rays}</g>
<g class="pk-arcs" fill="none" stroke="url(#pk-gold)" opacity=".5" style="${O}"><circle cx="${cx}" cy="${cy}" r="236" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="244" stroke-width="2.5"/></g>
</g>
</svg>
<!-- layer 2: the fan, clipped to the frame; idle breathing is one compositor transform on this layer -->
<div class="pk-fanclip"><svg class="pk-svg pk-fan" xmlns="http://www.w3.org/2000/svg" viewBox="18 18 264 364" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
<!-- tail: 15 vanes, then their 15 eyes on top, then the short gold scales at the base -->
<g class="pk-tail">${tail}</g>
<g class="pk-eyes">${eyes}</g>
<g class="pk-scales">${scales}</g>
</svg></div>
<!-- layer 3: body, ground band, frame -->
<svg class="pk-svg pk-l-front" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
<!-- body, neck, head, crest, wing -->
<g class="pk-body" style="transform-origin:150px 362px">
<path d="M126 360 C118 330 128 300 146 288 C158 280 162 262 156 240 C152 224 150 206 156 192 C162 180 176 178 182 188 C186 196 182 204 174 206 C166 210 166 222 172 240 C180 266 182 294 172 318 C166 334 162 350 166 362 Z" fill="url(#pk-neck)"/>
<path d="M150 204 C148 222 152 238 158 258 C163 276 162 294 150 308" stroke="#5aa0ff" stroke-width="1.6" fill="none" opacity=".6"/>
<path d="M181 191 L198 196 L181 199 Z" fill="url(#pk-gold)"/>
<path d="M164 186 C168 182 176 182 179 188 C174 186 168 187 164 190 Z" fill="#f1e4c8"/>
<circle cx="173" cy="189" r="2" fill="#0a1430"/>
<g class="pk-crest" style="transform-origin:171px 184px">${crest}</g>
<path d="M132 352 C126 326 136 304 152 296 C160 318 160 340 150 364 Z" fill="#0f4c5c"/>
${[0, 1, 2, 3].map(k => `<path d="M${136 + k * 2} ${312 + k * 12} L${146 + k} ${306 + k * 12} L${154} ${314 + k * 12}" stroke="url(#pk-gold)" stroke-width="1" fill="none" opacity=".75"/>`).join('')}
</g>
<g clip-path="url(#pk-frame)">
<!-- velvet ground band -->
<rect x="0" y="362" width="300" height="40" fill="#14040b"/>
<path d="M0 362 H300" stroke="url(#pk-gold)" stroke-width="2"/>
${Array.from({ length: 13 }, (_, i) => `<path d="M${10 + i * 22} 382 l11 -12 l11 12" stroke="url(#pk-gold)" stroke-width="1" fill="none" opacity=".5"/>`).join('')}
</g>
<!-- deco frame with stepped corners -->
<rect x="18" y="18" width="264" height="364" fill="none" stroke="url(#pk-gold)" stroke-width="2.5"/>
<rect x="10" y="10" width="280" height="380" fill="none" stroke="url(#pk-gold)" stroke-width="1"/>
${[[10, 10, 1, 1], [290, 10, -1, 1], [10, 390, 1, -1], [290, 390, -1, -1]].map(([x, y, sx, sy]) => `<path d="M${x} ${y + sy * 22} h${sx * 8} v${-sy * 14} h${sx * 14} v${-sy * 8}" stroke="url(#pk-gold)" stroke-width="1.5" fill="none"/>`).join('')}
<path d="M140 18 L150 8 L160 18" fill="#1a0510" stroke="url(#pk-gold)" stroke-width="1.5"/><circle cx="150" cy="14" r="2" fill="url(#pk-gold)"/>
</svg>`;

const css = `
/* ---- pk: Velvet Peacock ---- */
.pk-root{background:#1a0510}
.pk-svg *{transform-box:view-box}
/* idle: the fan breathes: the whole fan layer spreads a hair wider and settles (compositor-only, no repaint) */
.pk-fanclip{position:absolute;left:6%;top:4.5%;width:88%;height:91%;overflow:hidden}
@keyframes pk-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.022,.99)}}
.pk-root .pk-fan{transform-origin:50% 82.42%;will-change:transform;animation:pk-breathe 4.4s ease-in-out infinite}
.pk-l-back{will-change:transform}
/* idle: crest stalks bobble on their own springs */
@keyframes pk-bob{0%,100%{transform:rotate(-3deg)}22%{transform:rotate(4.5deg)}41%{transform:rotate(-1.5deg)}58%{transform:rotate(2.5deg)}76%{transform:rotate(-.5deg)}}
.pk-cs{animation:pk-bob 2.9s ease-in-out infinite}
/* idle: now and then a glint ripples across the eyes */
@keyframes pk-shine{0%,100%{opacity:0}3%{opacity:.85}8%{opacity:0}}
.pk-shine{opacity:0;animation:pk-shine 7.5s linear infinite}
/* entrance: the scene comes up; the tail itself opens via the move (JS) */
@keyframes pk-in{from{opacity:0}to{opacity:1}}
.pk-go.pk-root{animation:pk-in .3s ease-out backwards}
`;

module.exports = {
  prefix: 'pk', name: 'Velvet Peacock', player: 'Momo', auto: 1200,
  markup, css, hooks: fs.readFileSync(__dirname + '/peacock.hooks.cjs', 'utf8'),
};
