// The High Roller, animated. Velvet Art Deco: a man in shades and a cream dinner jacket in front of a
// turning roulette halo, two casino dice tumbling in the air beside him (real 3D: CSS cubes), chips stacked
// on the rail. The move: he throws the dice; they land double six.
const fs = require('fs');
const GOLD = 'url(#hr-gold)', INK = '#14080b', BURG = '#7a1a2e', CREAM = '#f6e9dc';
const f1 = v => (+v).toFixed(1);
const cx = 150, cy = 176;
const pol = (r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];

// ---------------------------------------------------------------- rays (their own turning layer)
let rays = '';
for (let i = 0; i < 28; i++) {
  const a = (i / 28) * Math.PI * 2, w = .052;
  const [x1, y1] = pol(460, a - w), [x2, y2] = pol(460, a + w);
  rays += `<path d="M${cx} ${cy} L${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)} Z" fill="${i % 2 ? '#2f6b55' : '#3f8a6c'}" opacity="${i % 2 ? .5 : .34}"/>`;
}
// ---------------------------------------------------------------- the roulette halo (its own turning layer)
let halo = '';
const N = 24, R0 = 68, R1 = 93;
for (let i = 0; i < N; i++) {
  const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
  const p = [pol(R0, a0), pol(R1, a0), pol(R1, a1), pol(R0, a1)].map(q => q.map(f1).join(' '));
  halo += `<path d="M${p[0]} L${p[1]} A${R1} ${R1} 0 0 1 ${p[2]} L${p[3]} A${R0} ${R0} 0 0 0 ${p[0]} Z" fill="${i % 2 ? '#1a0a0e' : '#8a1f35'}" stroke="${GOLD}" stroke-width=".9"/>`;
  const [dx, dy] = pol((R0 + R1) / 2, am);
  halo += i % 2 ? `<circle cx="${f1(dx)}" cy="${f1(dy)}" r="2.1" fill="${GOLD}"/>` : `<path d="M${f1(dx)} ${f1(dy - 4.5)} l3 4.5 l-3 4.5 l-3 -4.5 Z" fill="${GOLD}" transform="rotate(${f1(am * 180 / Math.PI + 90)} ${f1(dx)} ${f1(dy)})"/>`;
}
halo += `<circle cx="${cx}" cy="${cy}" r="${R1 + 3.5}" fill="none" stroke="${GOLD}" stroke-width="2.4"/><circle cx="${cx}" cy="${cy}" r="${R0 - 3}" fill="none" stroke="${GOLD}" stroke-width="1.6"/>`;
for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2, [x1, y1] = pol(R1 + 6, a), [x2, y2] = pol(R1 + (i % 4 ? 9 : 13), a); halo += `<path d="M${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)}" stroke="${GOLD}" stroke-width="${i % 4 ? .8 : 1.4}"/>`; }

const defs = `<defs>
<linearGradient id="hr-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8e3a6"/><stop offset=".5" stop-color="#d9ad55"/><stop offset="1" stop-color="#9c7124"/></linearGradient>
<linearGradient id="hr-goldh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9c7124"/><stop offset=".5" stop-color="#f8e3a6"/><stop offset="1" stop-color="#9c7124"/></linearGradient>
<radialGradient id="hr-bg" cx=".5" cy=".44" r=".75"><stop offset="0" stop-color="#2c6a54"/><stop offset=".55" stop-color="#16402f"/><stop offset="1" stop-color="#0a1f18"/></radialGradient>
<radialGradient id="hr-vig" cx=".5" cy=".44" r=".72"><stop offset=".55" stop-color="#050d0a" stop-opacity="0"/><stop offset="1" stop-color="#050d0a" stop-opacity=".78"/></radialGradient>
<radialGradient id="hr-aura" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".55"/><stop offset=".6" stop-color="#f3c867" stop-opacity=".16"/><stop offset="1" stop-color="#f3c867" stop-opacity="0"/></radialGradient>
<linearGradient id="hr-jacket" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffaf1"/><stop offset=".55" stop-color="#f3e4d2"/><stop offset="1" stop-color="#cdb69c"/></linearGradient>
<linearGradient id="hr-skin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a56b47"/><stop offset=".55" stop-color="#8d5a3b"/><stop offset="1" stop-color="#62391f"/></linearGradient>
<linearGradient id="hr-lens" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b3b34"/><stop offset=".45" stop-color="#0a0d0c"/><stop offset="1" stop-color="#16382c"/></linearGradient>
<linearGradient id="hr-lapel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a3243d"/><stop offset="1" stop-color="#4a0c1a"/></linearGradient>
<clipPath id="hr-lenses"><path d="M110 181 Q110 177 114 177 H143 Q147 177 147 181 V189 Q147 203 132 203 H126 Q110 203 110 189 Z M153 181 Q153 177 157 177 H186 Q190 177 190 181 V189 Q190 203 174 203 H168 Q153 203 153 189 Z"/></clipPath>
</defs>`;
const svg = (cls, body, extra = '', attr = '') => `<svg class="hr-svg ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true"${attr}>${extra}${body}</svg>`;

// ---------------------------------------------------------------- the man (static)
const lens = 'M110 181 Q110 177 114 177 H143 Q147 177 147 181 V189 Q147 203 132 203 H126 Q110 203 110 189 Z';
const lensR = 'M153 181 Q153 177 157 177 H186 Q190 177 190 181 V189 Q190 203 174 203 H168 Q153 203 153 189 Z';
let fig = `
<ellipse cx="150" cy="186" rx="64" ry="72" fill="url(#hr-aura)"/>
<g transform="translate(0 -24)"><!-- jacket -->
<path d="M14 430 C18 350 66 316 120 304 L150 296 L180 304 C234 316 282 350 286 430 Z" fill="url(#hr-jacket)" stroke="${INK}" stroke-width="1.4"/>
<path d="M214 318 C246 334 266 362 270 404 L236 404 C238 370 230 340 214 318 Z" fill="#b89f84" opacity=".55"/>
<path d="M66 404 C66 380 70 362 78 346 M234 404 C234 380 230 362 222 346" stroke="#b89f84" stroke-width="1.4" fill="none"/>
<!-- shirt, studs -->
<path d="M126 302 L150 366 L174 302 L150 294 Z" fill="#ffffff"/>
<path d="M150 322 V366" stroke="#d9c9b4" stroke-width="1"/>
<circle cx="150" cy="334" r="1.9" fill="${GOLD}"/><circle cx="150" cy="348" r="1.9" fill="${GOLD}"/>
<!-- shawl lapels -->
<path d="M122 301 L150 364 L141 430 L100 430 C90 380 94 328 122 301 Z" fill="url(#hr-lapel)" stroke="${GOLD}" stroke-width="1.1"/>
<path d="M178 301 L150 364 L159 430 L200 430 C210 380 206 328 178 301 Z" fill="url(#hr-lapel)" stroke="${GOLD}" stroke-width="1.1"/>
<path d="M118 312 C104 338 102 372 110 400" stroke="#d05a72" stroke-width="1.2" fill="none" opacity=".6"/>
<!-- pocket square -->
<path d="M204 352 L212 338 L218 350 L225 340 L229 356 Z" fill="${BURG}" stroke="${GOLD}" stroke-width=".9"/>
</g><!-- neck -->
<path d="M128 250 L126 282 Q150 300 174 282 L172 250 Z" fill="#6f4329"/>
<path d="M128 256 Q150 284 172 256 L172 248 L128 248 Z" fill="#4e2c16" opacity=".8"/>
<g transform="translate(0 -24)"><!-- bow tie -->
<path d="M150 311 L125 298 Q121 311 125 325 Z M150 311 L175 298 Q179 311 175 325 Z" fill="${INK}" stroke="#3a2a2e" stroke-width=".8"/>
<rect x="145.500" y="305" width="9" height="12" rx="2.500" fill="#221317"/>
</g><!-- ears, head -->
<path d="M108 186 Q100 184 101 196 Q102 208 110 208 Z" fill="#7b4d31"/><path d="M192 186 Q200 184 199 196 Q198 208 190 208 Z" fill="#5c361d"/>
<path d="M107 188 C107 150 126 128 150 128 C174 128 193 150 193 188 C193 226 177 262 150 267 C123 262 107 226 107 188 Z" fill="url(#hr-skin)" stroke="${INK}" stroke-width="1.2"/>
<path d="M178 152 C192 182 190 226 166 258 C176 226 180 188 178 152 Z" fill="#4e2c16" opacity=".45"/>
<path d="M150 204 L145 224 Q150 228 156 225" fill="none" stroke="#5c361d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M118 172 Q128 166 142 170 M158 170 Q172 166 182 172" stroke="#1a0d08" stroke-width="3" fill="none" stroke-linecap="round"/>
<!-- hair: swept back, gold light on it -->
<path d="M105 190 C96 138 120 102 153 102 C186 102 204 138 195 190 C192 166 182 150 164 145 C146 153 127 151 114 146 C110 160 107 174 105 190 Z" fill="#1a0d08" stroke="${INK}" stroke-width="1"/>
<path d="M122 124 C136 110 160 108 178 120 M116 138 C130 124 150 120 166 124" stroke="#6d5136" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".8"/>
<!-- shades -->
<path d="M110 184 L103 181 M190 184 L197 181 M147 183 Q150 180 153 183" stroke="${GOLD}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<path d="${lens} ${lensR}" fill="url(#hr-lens)" stroke="${GOLD}" stroke-width="1.5"/>
<path d="M114 181 H130 L122 199 Q113 196 113 188 Z M157 181 H173 L165 199 Q156 196 156 188 Z" fill="#ffffff" opacity=".1"/>
`;

// ---------------------------------------------------------------- moving things in front of him
let fx = `<g clip-path="url(#hr-lenses)"><path class="hr-glint" d="M92 170 L104 170 L92 210 L80 210 Z M108 170 L113 170 L101 210 L96 210 Z" fill="#fff8e0" opacity=".85"/></g>`;
fx += `<path class="hr-smirk" d="M136 241 Q150 247 165 236" fill="none" stroke="#3d0d18" stroke-width="2.6" stroke-linecap="round"/>`;
fx += `<g class="hr-grin"><path d="M133 237 Q150 254 169 233 Q152 242 133 237 Z" fill="#fffdf6" stroke="#3d0d18" stroke-width="1.8" stroke-linejoin="round"/></g>`;
// gold dust rising
for (let i = 0; i < 12; i++) {
  const x = 34 + ((i * 53) % 232), d = 4.5 + (i % 5) * 1.1, r = 1 + (i % 3) * .6;
  fx += `<circle class="hr-mote" cx="${x}" cy="366" r="${r}" fill="#f6dc96" style="animation-duration:${d.toFixed(1)}s;animation-delay:${(-i * .83).toFixed(2)}s;--x:${(i % 2 ? 1 : -1) * (6 + i % 4 * 4)}px"/>`;
}
// chip stacks on the rail
const chip = (x, y, k) => {
  const c = [['#8a1f35', CREAM], ['#16402f', '#f6dc96'], [CREAM, '#8a1f35'], ['#1a0a0e', '#f6dc96']][k % 4];
  return `<g><path d="M${x - 19} ${y} v5.500 a19 5.600 0 0 0 38 0 v-5.500 Z" fill="${c[0]}" stroke="${INK}" stroke-width=".8"/>`
    + [-13, -5, 5, 13].map(o => `<rect x="${x + o - 2}" y="${y + 3.2 + Math.abs(o) * .06}" width="4" height="${5.4 - Math.abs(o) * .09}" fill="${c[1]}" opacity=".9"/>`).join('')
    + `<ellipse cx="${x}" cy="${y}" rx="19" ry="5.600" fill="${c[0]}" stroke="${GOLD}" stroke-width="1"/><ellipse cx="${x}" cy="${y}" rx="12" ry="3.400" fill="none" stroke="${c[1]}" stroke-width=".9" stroke-dasharray="3 2.400"/></g>`;
};
const stack = (x, n, k0, cls) => `<g class="hr-stack ${cls}">${Array.from({ length: n }, (_, i) => chip(x + ((i * 7) % 5) - 2, 370 - i * 6.2, k0 + i)).join('')}</g>`;
fx += stack(50, 7, 0, 'hr-s1') + stack(88, 3, 2, 'hr-s2') + stack(250, 5, 1, 'hr-s3') + stack(213, 2, 3, 'hr-s4');
// the landing: ring, sparks, and chips thrown up from the rail
fx += `<circle class="hr-ring" cx="146" cy="330" r="30" fill="none" stroke="#f8e3a6" stroke-width="3" style="transform-origin:146px 330px"/><circle class="hr-ring hr-ring2" cx="146" cy="330" r="30" fill="none" stroke="#f8e3a6" stroke-width="1.5" style="transform-origin:146px 330px"/>`;
for (let i = 0; i < 16; i++) {
  const a = (i / 16) * Math.PI * 2 + .2, r0 = 40, r1 = 58 + (i % 3) * 14;
  fx += `<path class="hr-spark" style="transform-origin:146px 330px" d="M${f1(146 + Math.cos(a) * r0)} ${f1(330 + Math.sin(a) * r0)} L${f1(146 + Math.cos(a) * r1)} ${f1(330 + Math.sin(a) * r1)}" stroke="#f8e3a6" stroke-width="${i % 2 ? 1.4 : 2.4}" stroke-linecap="round"/>`;
}
for (let i = 0; i < 12; i++) {
  const left = i % 2 === 0, x = left ? 56 : 244, dx = (left ? 1 : -1) * (10 + (i * 37) % 90), h = 150 + (i * 53) % 150;
  const c = [['#8a1f35', CREAM], ['#16402f', '#f6dc96'], [CREAM, '#8a1f35']][i % 3];
  fx += `<g class="hr-toss" data-dx="${dx}" data-h="${h}" data-i="${i}" style="transform-origin:${x}px 350px"><circle cx="${x}" cy="350" r="10" fill="${c[0]}" stroke="${GOLD}" stroke-width="1.2"/><circle cx="${x}" cy="350" r="6" fill="none" stroke="${c[1]}" stroke-width="1.6" stroke-dasharray="3 2.300"/></g>`;
}
// four-point twinkles
const tw = (x, y, s, d) => `<path class="hr-tw" style="transform-origin:${x}px ${y}px;animation-delay:${d}s" d="M${x} ${y - s} L${x + s * .22} ${y - s * .22} L${x + s} ${y} L${x + s * .22} ${y + s * .22} L${x} ${y + s} L${x - s * .22} ${y + s * .22} L${x - s} ${y} L${x - s * .22} ${y - s * .22} Z" fill="#fff6d6"/>`;
fx += tw(217, 319, 6, 0) + tw(150, 310, 4, -1.3) + tw(63, 331, 5, -2.1) + tw(188, 180, 5, -3.2) + tw(246, 342, 4.5, -.7);

// ---------------------------------------------------------------- mat, rail, frame (static, on top)
const corner = (x, y, sx, sy) => {
  let s = '';
  for (let i = 0; i <= 5; i++) { const a = (i / 5) * Math.PI / 2; s += `<path d="M${x} ${y} L${f1(x + sx * Math.cos(a) * 40)} ${f1(y + sy * Math.sin(a) * 40)}" stroke="${GOLD}" stroke-width=".9" opacity=".8"/>`; }
  [16, 28, 40].forEach(r => { s += `<path d="M${x + sx * r} ${y} A${r} ${r} 0 0 ${sx * sy > 0 ? 1 : 0} ${x} ${y + sy * r}" fill="none" stroke="${GOLD}" stroke-width="${r === 40 ? 1.6 : .9}"/>`; });
  return s;
};
const front = `
<path d="M0 0 H300 V400 H0 Z M18 18 V382 H282 V18 Z" fill="#12070b" fill-rule="evenodd"/>
<rect x="18" y="18" width="264" height="364" fill="url(#hr-vig)"/>
<rect x="18" y="372" width="264" height="10" fill="#1a0a0e"/><path d="M18 372 H282" stroke="${GOLD}" stroke-width="2"/>
${Array.from({ length: 22 }, (_, i) => `<path d="M${24 + i * 12} 380 l6 -5 l6 5" stroke="${GOLD}" stroke-width=".8" fill="none" opacity=".6"/>`).join('')}
${corner(18, 18, 1, 1)}${corner(282, 18, -1, 1)}
<rect x="18" y="18" width="264" height="364" fill="none" stroke="${GOLD}" stroke-width="2.500"/>
<rect x="10" y="10" width="280" height="380" fill="none" stroke="${GOLD}" stroke-width="1"/>
${[[10, 10, 1, 1], [290, 10, -1, 1], [10, 390, 1, -1], [290, 390, -1, -1]].map(([x, y, sx, sy]) => `<path d="M${x} ${y + sy * 22} h${sx * 8} v${-sy * 14} h${sx * 14} v${-sy * 8}" stroke="${GOLD}" stroke-width="1.500" fill="none"/>`).join('')}
<path d="M138 18 L150 6 L162 18 L150 30 Z" fill="#12070b" stroke="${GOLD}" stroke-width="1.500"/><path d="M150 12 l4 6 l-4 6 l-4 -6 Z" fill="${GOLD}"/>
<path d="M138 382 L150 370 L162 382 L150 394 Z" fill="#12070b" stroke="${GOLD}" stroke-width="1.500"/><circle cx="150" cy="382" r="3" fill="${GOLD}"/>
`;

// ---------------------------------------------------------------- the dice: CSS cubes
const PIP = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 25], [28, 50], [28, 75], [72, 25], [72, 50], [72, 75]] };
const faceBg = n => PIP[n].map(([x, y]) => `radial-gradient(circle calc(3.6*var(--u)) at ${x}% ${y}%,#fff7e6 0 78%,#0000 100%)`).join(',');
const FACES = [[6, 'translateZ(var(--h))', 1], [1, 'rotateY(180deg) translateZ(var(--h))', .62], [3, 'rotateY(90deg) translateZ(var(--h))', .78], [4, 'rotateY(-90deg) translateZ(var(--h))', .7], [5, 'rotateX(90deg) translateZ(var(--h))', 1.12], [2, 'rotateX(-90deg) translateZ(var(--h))', .55]];
const die = (i, x, y, dur, dir) => `<div class="hr-dw hr-dw${i}" style="left:${(x / 3).toFixed(3)}%;top:${(y / 4).toFixed(3)}%"><div class="hr-bob" style="animation-delay:${-i * 1.3}s"><div class="hr-die" data-dur="${dur * 1000}" data-dir="${dir}" style="animation-duration:${dur}s;animation-direction:${dir > 0 ? 'normal' : 'reverse'}">${FACES.map(([n, t, b]) => `<i style="transform:${t};background:${faceBg(n)},linear-gradient(135deg,#c2314e,#6a1226);filter:brightness(${b})"></i>`).join('')}</div></div></div>`;
const dice = `<div class="hr-dice">${die(0, 36, 96, 9, 1)}${die(1, 228, 72, 11.5, -1)}</div>`;

const markup = [
  '<!-- layer 1: emerald field -->', svg('hr-l-back', `<rect width="300" height="400" fill="#12070b"/><rect x="18" y="18" width="264" height="364" fill="url(#hr-bg)"/>`, defs),
  '<!-- layer 2: sunburst, turning slowly (clipped to the frame) -->', `<div class="hr-clip"><div class="hr-in hr-in-rays">${svg('hr-l-rays', rays, '', ' style="overflow:visible"')}</div>`,
  '<!-- layer 3: the roulette halo, turning the other way -->', `<div class="hr-in hr-in-halo">${svg('hr-l-halo', halo)}</div></div>`,
  '<!-- layer 4: the man (static) -->', svg('hr-l-fig', fig),
  '<!-- layer 5: glint, dust, chips, the landing -->', svg('hr-l-fx', fx),
  '<!-- layer 6: rail and frame -->', svg('hr-l-front', front),
  '<!-- layer 7: the dice -->', dice,
].join('\n');

const css = `
/* ---- hr: The High Roller ---- */
.hr-root{background:#12070b;container-type:inline-size}
.hr-svg *{transform-box:view-box}
.hr-clip{position:absolute;left:6%;top:4.5%;width:88%;height:91%;overflow:hidden}
.hr-clip .hr-in{position:absolute;left:-6.818%;top:-4.945%;width:113.636%;height:109.89%}
.hr-in,.hr-l-rays,.hr-l-halo{transform-origin:50% 44%}
.hr-l-rays,.hr-l-halo,.hr-l-fig{will-change:transform}
.hr-l-fx,.hr-l-front,.hr-dice{pointer-events:none}
/* idle: the sunburst and the wheel turn against each other */
@keyframes hr-turn{to{transform:rotate(360deg)}}
.hr-l-rays{animation:hr-turn 90s linear infinite}
.hr-l-halo{animation:hr-turn 46s linear infinite reverse}
/* idle: he breathes; light crosses the shades; dust rises; things twinkle */
@keyframes hr-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.012,1.016)}}
.hr-l-fig{transform-origin:50% 100%;animation:hr-breathe 5.6s ease-in-out infinite}
@keyframes hr-glint{0%,68%{transform:translateX(0)}86%,100%{transform:translateX(120px)}}
.hr-glint{animation:hr-glint 5.2s ease-in-out infinite}
@keyframes hr-mote{0%{transform:translate(0,0);opacity:0}12%{opacity:.9}80%{opacity:.5}100%{transform:translate(var(--x),-300px);opacity:0}}
.hr-mote{opacity:0;animation:hr-mote 5s linear infinite}
@keyframes hr-tw{0%,70%,100%{transform:scale(0) rotate(0)}80%{transform:scale(1) rotate(40deg)}90%{transform:scale(.3) rotate(80deg)}}
.hr-tw{transform:scale(0);animation:hr-tw 4.4s ease-in-out infinite}
.hr-grin,.hr-ring,.hr-spark,.hr-toss{opacity:0}
/* the dice */
.hr-dice{position:absolute;left:0;top:0;width:100%;height:100%;--u:calc(100cqw/300);--h:calc(18*var(--u));perspective:calc(520*var(--u))}
.hr-dw{position:absolute;width:calc(36*var(--u));height:calc(36*var(--u))}
.hr-dw,.hr-bob,.hr-die{transform-style:preserve-3d}
.hr-bob,.hr-die{position:absolute;left:0;top:0;width:100%;height:100%}
@keyframes hr-bob{0%,100%{transform:translateY(-7%)}50%{transform:translateY(9%)}}
.hr-bob{animation:hr-bob 3.4s ease-in-out infinite}
@keyframes hr-tumble{from{transform:rotateX(-24deg) rotateY(32deg)}to{transform:rotateX(336deg) rotateY(392deg)}}
.hr-die{transform:rotateX(-24deg) rotateY(32deg);animation:hr-tumble 9s linear infinite}
.hr-die i{position:absolute;left:0;top:0;width:100%;height:100%;box-sizing:border-box;border-radius:15%;border:calc(1.1*var(--u)) solid #e9cf96;backface-visibility:hidden}
/* entrance: the field opens, the wheel spins up, he rises, the stacks land, the dice drop in */
@keyframes hr-in{from{opacity:0}to{opacity:1}}
@keyframes hr-open{0%{transform:scale(.2) rotate(-70deg);opacity:0}100%{transform:scale(1) rotate(0);opacity:1}}
@keyframes hr-wheel{0%{transform:scale(.3) rotate(-200deg);opacity:0}70%{transform:scale(1.06) rotate(8deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}
@keyframes hr-rise{0%{transform:translateY(16%);opacity:0}100%{transform:translateY(0);opacity:1}}
@keyframes hr-land{0%{transform:translateY(-320px);opacity:0}20%{opacity:1}72%{transform:translateY(0)}84%{transform:translateY(-7px)}100%{transform:translateY(0);opacity:1}}
@keyframes hr-drop{0%{transform:translateY(-420%) scale(.6);opacity:0}30%{opacity:1}70%{transform:translateY(12%) scale(1.04)}100%{transform:translateY(0) scale(1);opacity:1}}
.hr-go.hr-root{animation:hr-in .3s ease-out backwards}
.hr-go .hr-in-rays{animation:hr-open .7s .05s cubic-bezier(.2,.8,.2,1) backwards}
.hr-go .hr-in-halo{animation:hr-wheel .8s .25s cubic-bezier(.2,.8,.2,1) backwards}
.hr-go .hr-l-fig{animation:hr-rise .55s .45s cubic-bezier(.2,.8,.2,1) backwards,hr-breathe 5.6s 1s ease-in-out infinite}
.hr-go .hr-smirk{animation:hr-in .3s .7s ease-out backwards}
.hr-go .hr-s1{animation:hr-land .5s .75s cubic-bezier(.4,0,.6,1) backwards}
.hr-go .hr-s3{animation:hr-land .5s .85s cubic-bezier(.4,0,.6,1) backwards}
.hr-go .hr-s2{animation:hr-land .45s .98s cubic-bezier(.4,0,.6,1) backwards}
.hr-go .hr-s4{animation:hr-land .45s 1.08s cubic-bezier(.4,0,.6,1) backwards}
.hr-go .hr-dw0{animation:hr-drop .6s 1.15s cubic-bezier(.3,.7,.3,1) backwards}
.hr-go .hr-dw1{animation:hr-drop .6s 1.3s cubic-bezier(.3,.7,.3,1) backwards}
`;

module.exports = {
  prefix: 'hr', name: 'The High Roller', player: 'Momo', auto: 2300,
  markup, css, hooks: fs.readFileSync(__dirname + '/roller.hooks.cjs', 'utf8'),
};
