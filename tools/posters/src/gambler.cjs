// Classic Gambler, animated. Based on ../p-gambler2.svg (hand-written), regrouped for motion.
// No filters at all: the glows are radial gradients, so every frame is plain vector paint.
const fs = require('fs');
const f1 = v => (+v).toFixed(1);

// ---- cigar smoke: a travelling wave anchored at the ember, amplitude growing with height ----
// 8 phase steps of the same path structure, morphed with one SMIL <animate> (works on iOS too).
function smokeD(phi) {
  const pts = [];
  for (let i = 0; i <= 26; i++) {
    const s = i / 26, y = 233 - 186 * s, amp = 15 * Math.pow(s, .75);
    const x = 217 + 24 * Math.pow(s, .9) + amp * (Math.sin(6.283 * 1.55 * s - phi) + .38 * Math.sin(6.283 * 2.9 * s - 2 * phi + 1.1)) - amp * (Math.sin(-phi) + .38 * Math.sin(-2 * phi + 1.1)) * (1 - s) * (1 - s);
    pts.push([x, y]);
  }
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {           // Catmull-Rom -> cubic
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d;
}
const smokeVals = Array.from({ length: 9 }, (_, i) => smokeD(i / 8 * 6.283)).join(';');
const smokeAnim = `<animate attributeName="d" dur="5.2s" repeatCount="indefinite" values="${smokeVals}"/>`;

const cardFace = `<rect x="46" y="224" width="38" height="54" rx="3" fill="#f1e4c8" stroke="url(#gm-gold)" stroke-width="1.5"/>
<rect x="50" y="228" width="30" height="46" rx="2" fill="none" stroke="#9c7124" stroke-width=".6"/>
<path d="M65 238 C58 246 52 250 52 256 C52 261 58 263 63 259 L60 268 L70 268 L67 259 C72 263 78 261 78 256 C78 250 72 246 65 238 Z" fill="#140608"/>
<text x="51" y="236" font-family="Georgia,serif" font-weight="700" font-size="8" fill="#140608">A</text>`;
const cardBack = `<rect x="46" y="224" width="38" height="54" rx="3" fill="#7a161c" stroke="url(#gm-gold)" stroke-width="1.5"/>
<rect x="50" y="228" width="30" height="46" rx="2" fill="none" stroke="#d4a64a" stroke-width=".8"/>
<path d="M65 231 L77 251 L65 271 L53 251 Z" fill="none" stroke="#d4a64a" stroke-width="1"/><path d="M65 240 L71 251 L65 262 L59 251 Z" fill="#d4a64a"/>
<path d="M50 240 L58 228 M50 262 L58 274 M80 240 L72 228 M80 262 L72 274" stroke="#d4a64a" stroke-width=".7"/>`;
const chip = (cls, x, y, rx, ry, top, edge, line, rot) => `<g class="${cls}" style="transform-origin:${x}px ${y}px"><g transform="rotate(${rot} ${x} ${y})"><path d="M${x - rx} ${y} v4 a${rx} ${ry} 0 0 0 ${rx * 2} 0 v-4 Z" fill="${edge}"/><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${top}" stroke="${line}" stroke-width=".8"/><ellipse cx="${x}" cy="${y}" rx="${rx * .58}" ry="${ry * .58}" fill="none" stroke="${line}" stroke-width=".7" opacity=".7"/></g></g>`;
const framePaths = (stroke, extra = '') => `<path d="M22 392 V110 Q22 22 150 22 Q278 22 278 110 V392 Z" fill="none" stroke="${stroke}" stroke-width="3" ${extra}/>
<path d="M30 392 V112 Q30 30 150 30 Q270 30 270 112 V392" fill="none" stroke="${stroke}" stroke-width="1" opacity=".7"/>
<path d="M130 22 L136 12 L142 18 L150 6 L158 18 L164 12 L170 22" fill="none" stroke="${stroke}" stroke-width="1.5"/>
<path d="M14 392 H286" stroke="${stroke}" stroke-width="2"/>`;

const markup = `<!-- layer 1: backdrop, sunburst, rings (repaints only when the rays pulse) -->
<svg class="gm-svg gm-l-back" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
<defs>
<linearGradient id="gm-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dc96"/><stop offset=".5" stop-color="#d4a64a"/><stop offset="1" stop-color="#9c7124"/></linearGradient>
<linearGradient id="gm-goldH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9c7124"/><stop offset=".5" stop-color="#f6dc96"/><stop offset="1" stop-color="#9c7124"/></linearGradient>
<radialGradient id="gm-bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#7a2228"/><stop offset=".6" stop-color="#4a1216"/><stop offset="1" stop-color="#1e070a"/></radialGradient>
<linearGradient id="gm-lit" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f6c98e"/><stop offset=".7" stop-color="#e0a46a"/><stop offset="1" stop-color="#b9784a"/></linearGradient>
<linearGradient id="gm-shade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a0e10"/><stop offset="1" stop-color="#5a2a22"/></linearGradient>
<linearGradient id="gm-suitL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#140608"/><stop offset="1" stop-color="#2c1214"/></linearGradient>
<linearGradient id="gm-suitR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a1a1a"/><stop offset="1" stop-color="#6a3428"/></linearGradient>
<radialGradient id="gm-emberG"><stop offset="0" stop-color="#fff2b0"/><stop offset=".22" stop-color="#ffb24a"/><stop offset=".5" stop-color="#ff6a1e" stop-opacity=".55"/><stop offset="1" stop-color="#ff5a1a" stop-opacity="0"/></radialGradient>
<radialGradient id="gm-eyeG"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".85"/><stop offset=".45" stop-color="#f6c860" stop-opacity=".35"/><stop offset="1" stop-color="#f6c860" stop-opacity="0"/></radialGradient>
<radialGradient id="gm-jawG" cx=".95" cy=".7" r=".9"><stop offset="0" stop-color="#ffb060" stop-opacity=".95"/><stop offset="1" stop-color="#ff8a3a" stop-opacity="0"/></radialGradient>
<linearGradient id="gm-smokeG" gradientUnits="userSpaceOnUse" x1="0" y1="236" x2="0" y2="44"><stop offset="0" stop-color="#f6dc96" stop-opacity=".2"/><stop offset=".12" stop-color="#f6dc96" stop-opacity=".9"/><stop offset=".7" stop-color="#d4a64a" stop-opacity=".7"/><stop offset="1" stop-color="#d4a64a" stop-opacity="0"/></linearGradient>
<linearGradient id="gm-smokeW" gradientUnits="userSpaceOnUse" x1="0" y1="236" x2="0" y2="44"><stop offset="0" stop-color="#f1e4c8" stop-opacity="0"/><stop offset=".25" stop-color="#f1e4c8" stop-opacity=".2"/><stop offset=".8" stop-color="#f1e4c8" stop-opacity=".14"/><stop offset="1" stop-color="#f1e4c8" stop-opacity="0"/></linearGradient>
<linearGradient id="gm-sweepG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="gm-arch"><path d="M22 392 V110 Q22 22 150 22 Q278 22 278 110 V392 Z"/></clipPath>
<mask id="gm-sweepM" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="400"><g transform="rotate(24 150 200)"><rect class="gm-sweepbar" x="-150" y="-80" width="80" height="560" fill="url(#gm-sweepG)"/></g></mask>
</defs>
<rect width="300" height="400" fill="#16050a"/>
<g clip-path="url(#gm-arch)">
<g class="gm-scene" style="transform-origin:150px 200px">
<rect width="300" height="400" fill="url(#gm-bg)"/>
<!-- sunburst from behind the hat (pulses once in the move) -->
<g class="gm-rays" fill="#d4a64a" opacity=".13" style="transform-origin:150px 165px">
<path d="M150 165 L-40 -20 L10 -40 Z"/><path d="M150 165 L60 -60 L105 -60 Z"/><path d="M150 165 L150 -60 L195 -60 Z"/><path d="M150 165 L250 -50 L300 -30 Z"/><path d="M150 165 L340 40 L340 90 Z"/><path d="M150 165 L-40 90 L-40 40 Z"/><path d="M150 165 L340 190 L340 240 Z"/><path d="M150 165 L-40 240 L-40 190 Z"/>
</g>
<g class="gm-rings" fill="none" stroke="url(#gm-gold)" opacity=".55" style="transform-origin:150px 165px"><circle cx="150" cy="165" r="98" stroke-width="1"/><circle cx="150" cy="165" r="108" stroke-width="2.5"/><circle cx="150" cy="165" r="122" stroke-width=".8"/></g>

</g></g>
</svg>
<!-- layer 2: the smoke ribbon alone, so its constant motion repaints two paths and nothing else -->
<svg class="gm-svg gm-l-smoke" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
<g clip-path="url(#gm-arch)">
<g class="gm-scene" style="transform-origin:150px 200px">
<!-- cigar smoke ribbon: rises continuously (SMIL path morph), plus puffs breaking off the top -->
<g class="gm-smoke" fill="none" stroke-linecap="round">
<path d="${smokeD(0)}" stroke="url(#gm-smokeW)" stroke-width="5.5">${smokeAnim}</path>
<path d="${smokeD(0)}" stroke="url(#gm-smokeG)" stroke-width="1.3">${smokeAnim}</path>
<circle class="gm-puff gm-puff1" cx="240" cy="56" r="3.2" stroke="url(#gm-gold)" stroke-width="1" style="transform-origin:240px 56px"/>
<circle class="gm-puff gm-puff2" cx="236" cy="62" r="2.2" stroke="url(#gm-gold)" stroke-width=".9" style="transform-origin:236px 62px"/>
</g>

</g></g>
</svg>
<!-- layer 3: the gambler, table, chips, frame -->
<svg class="gm-svg gm-l-main" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
<g clip-path="url(#gm-arch)">
<g class="gm-scene" style="transform-origin:150px 200px">
<!-- suit: shadow side left, lamp-lit side right -->
<path d="M18 400 L36 312 C46 290 80 278 112 270 L150 330 L150 400 Z" fill="url(#gm-suitL)"/>
<path d="M282 400 L266 314 C256 290 222 278 188 270 L150 330 L150 400 Z" fill="url(#gm-suitR)"/>
<path d="M112 270 L150 330 L96 300 L84 400 L62 400 L74 296 Z" fill="#0c0405"/>
<path d="M188 270 L150 330 L206 300 L220 400 L240 400 L228 296 Z" fill="#4a2420"/>
<path d="M112 270 L96 300 L150 330 M188 270 L206 300 L150 330" fill="none" stroke="url(#gm-gold)" stroke-width="1.2" opacity=".75"/>
<path d="M126 262 L150 330 L174 262 L162 258 L150 282 L138 258 Z" fill="#f1e4c8"/>
<path d="M126 262 L150 330 L150 282 L138 258 Z" fill="#c9b894"/>
<path d="M144 284 L150 278 L156 284 L153 324 L150 330 L147 324 Z" fill="#8a1c22"/>
<path d="M150 278 L156 284 L153 324 L150 330 Z" fill="#5e1216"/>
<path d="M210 302 L220 292 L228 304 L232 296 L236 308 Z" fill="url(#gm-gold)"/>
<!-- neck + faceted head -->
<path d="M132 236 L170 236 L172 266 L150 284 L128 266 Z" fill="url(#gm-shade)"/>
<path d="M156 240 L170 236 L172 266 L160 274 Z" fill="#b9784a"/>
<path d="M112 168 L190 166 L187 206 L174 238 L150 258 L127 241 L114 206 Z" fill="url(#gm-shade)"/>
<path d="M152 204 L187 202 L174 238 L150 258 L136 249 L148 230 Z" fill="url(#gm-lit)"/>
<path d="M187 205 L174 238 L168 232 L178 207 Z" fill="#f8dcae"/>
<path d="M150 186 L160 220 L150 224 L148 216 Z" fill="#e0a46a"/>
<path d="M150 186 L160 220 L156 221 Z" fill="#f8dcae"/>
<!-- ember light on jaw and neck: idle pulse + flare -->
<path class="gm-jaw" d="M152 204 L187 202 L174 238 L172 266 L160 274 L150 258 L136 249 L148 230 Z" fill="url(#gm-jawG)"/>
<path class="gm-jawflare" d="M112 168 L190 166 L187 206 L174 238 L172 266 L150 284 L128 266 L127 241 L114 206 Z" fill="url(#gm-jawG)"/>
<path d="M114 206 L127 241 L150 258 L174 238" fill="none" stroke="#1e070a" stroke-width="1.5"/>
<path d="M166 196 L184 194" stroke="#1e070a" stroke-width="1.6" opacity=".6"/>
<!-- brim shadow and the eyes burning in it -->
<path d="M108 170 L192 164 L190 196 C170 200 140 202 110 198 Z" fill="#160608" opacity=".82"/>
<g class="gm-eyes">
<ellipse cx="131" cy="184.5" rx="15" ry="6" fill="url(#gm-eyeG)"/><ellipse cx="167" cy="181" rx="15" ry="6" fill="url(#gm-eyeG)"/>
<path d="M122 186 L140 183 M158 182 L176 180" stroke="#f6dc96" stroke-width="2.2" stroke-linecap="round"/>
<g class="gm-glint"><ellipse cx="131" cy="184.5" rx="20" ry="8" fill="url(#gm-eyeG)"/><ellipse cx="167" cy="181" rx="20" ry="8" fill="url(#gm-eyeG)"/>
<path d="M122 186 L140 183 M158 182 L176 180" stroke="#fffbe6" stroke-width="2.6" stroke-linecap="round"/></g>
<path class="gm-star" d="M176 168 L177.6 178.4 L188 180 L177.6 181.6 L176 192 L174.4 181.6 L164 180 L174.4 178.4 Z" fill="#fffbe6" style="transform-origin:176px 180px"/>
</g>
<path d="M120 178 L142 176 M156 175 L178 172" stroke="#0a0304" stroke-width="2.4" stroke-linecap="round"/>
<path d="M126 232 L150 226 L174 230 L178 236 L162 233 L150 236 L138 233 L122 238 Z" fill="#140608"/>
<path d="M140 243 L156 242 L164 238" fill="none" stroke="#5a1a14" stroke-width="1.6" stroke-linecap="round"/>
<!-- cigar + ember -->
<path d="M163 239 L214 232 L216 238 L165 244 Z" fill="#3a2214"/>
<path d="M190 235 L196 234 L197 240 L191 241 Z" fill="url(#gm-gold)"/>
<g class="gm-ember-in"><g class="gm-flare" style="transform-origin:216px 235px"><g class="gm-ember" style="transform-origin:216px 235px">
<circle cx="216" cy="235" r="20" fill="url(#gm-emberG)" opacity=".5"/><circle cx="216" cy="235" r="10" fill="url(#gm-emberG)"/></g>
<circle cx="216" cy="235" r="2.6" fill="#fff2b0"/></g></g>
<circle class="gm-ring" cx="218" cy="233" r="6" fill="none" stroke="#f6dc96" stroke-width="1.4" style="transform-origin:218px 233px"/>

<!-- fedora -->
<g transform="rotate(-6 150 160)">
<path d="M64 170 C90 156 210 154 240 166 C214 176 92 178 64 170 Z" fill="#0e0406"/>
<path d="M64 170 C90 160 210 158 240 166" fill="none" stroke="url(#gm-goldH)" stroke-width="1.6"/>
<path d="M104 162 L110 112 C116 100 128 94 150 92 C172 94 184 100 190 112 L196 162 Z" fill="#1e0a0c"/>
<path d="M150 92 C172 94 184 100 190 112 L196 162 L160 163 L156 100 Z" fill="#3a1a1a"/>
<path d="M136 100 C142 108 158 108 164 100 C158 112 142 112 136 100 Z" fill="#0a0304" opacity=".7"/>
<path d="M190 112 L196 162" stroke="url(#gm-gold)" stroke-width="1" opacity=".7"/>
<rect x="104" y="146" width="92" height="12" fill="#8a1c22"/>
<rect x="104" y="146" width="92" height="1.6" fill="url(#gm-goldH)"/><rect x="104" y="156.4" width="92" height="1.6" fill="url(#gm-goldH)"/>
<path d="M176 146 L180 158 L184 146 Z" fill="url(#gm-gold)"/>
</g>

<!-- raised hand, ace of spades between two fingers -->
<g transform="rotate(14 70 300)">
<g class="gm-hand" style="transform-origin:64px 306px">
<g class="gm-card" style="transform-origin:65px 251px">${cardFace}</g>
<path d="M48 278 C46 268 54 262 62 268 L84 286 C88 300 80 312 66 314 L50 310 Z" fill="#b9784a"/>
<path d="M62 268 L84 286 C88 300 80 312 66 314 Z" fill="#e0a46a"/>
<rect x="53" y="252" width="8" height="34" rx="4" fill="#d79a62"/>
<rect x="63" y="250" width="8" height="36" rx="4" fill="#f0c088"/>
<path d="M55 256 h4 M65 254 h4" stroke="#f8dcae" stroke-width="1.4" stroke-linecap="round"/>
<path d="M46 308 L82 310 L88 360 L40 358 Z" fill="#2c1214"/>
<rect x="45" y="304" width="38" height="7" fill="#f1e4c8" transform="rotate(3 64 307)"/>
<circle cx="76" cy="308" r="2.2" fill="url(#gm-gold)"/>
</g>
<path class="gm-catch" d="M65 226 L67.4 247.6 L89 250 L67.4 252.4 L65 274 L62.6 252.4 L41 250 L62.6 247.6 Z" fill="#fffbe6" style="transform-origin:65px 250px"/>
</g>
<!-- the flying ace (move only): rises out of the stack, flips face/back, lands in the fingers -->
<g transform="rotate(14 70 300)"><g class="gm-fly" style="transform-origin:65px 251px"><g class="gm-fly-face">${cardFace}</g><g class="gm-fly-back">${cardBack}</g></g></g>

<!-- table rail and chips -->
<rect x="0" y="352" width="300" height="48" fill="#0e3a2a"/>
<rect x="0" y="352" width="300" height="48" fill="#000" opacity=".35"/>
<rect x="0" y="348" width="300" height="6" fill="url(#gm-goldH)"/>
${chip('gm-spill gm-spill-c', 167, 322, 15, 5, '#f6dc96', '#d4a64a', '#9c7124', 0)}
${chip('gm-spill gm-spill-d', 167, 322, 15, 5, '#f6dc96', '#d4a64a', '#9c7124', 0)}
<g class="gm-stack gm-stack-g" style="transform-origin:167px 350px"><rect x="150" y="318" width="34" height="32" fill="url(#gm-gold)"/><ellipse cx="167" cy="318" rx="17" ry="5.5" fill="#f6dc96"/><path d="M150 326 h34 M150 334 h34 M150 342 h34" stroke="#9c7124" stroke-width="1.2"/></g>
<g class="gm-stack gm-stack-r" style="transform-origin:203px 350px"><rect x="188" y="330" width="30" height="20" fill="#8a1c22"/><ellipse cx="203" cy="330" rx="15" ry="5" fill="#b8323a"/><path d="M188 338 h30 M188 345 h30" stroke="#5e1216" stroke-width="1.2"/></g>
<g class="gm-stack gm-stack-w" style="transform-origin:236px 350px"><rect x="222" y="336" width="28" height="14" fill="#f1e4c8"/><ellipse cx="236" cy="336" rx="14" ry="4.6" fill="#fff6e4"/><path d="M222 343 h28" stroke="#c9b894" stroke-width="1.2"/></g>
${chip('gm-toss gm-toss-a', 241, 330, 14, 4.8, '#f6dc96', '#d4a64a', '#9c7124', -13)}
${chip('gm-toss gm-toss-b', 268, 345, 13, 4.5, '#b8323a', '#8a1c22', '#5e1216', 6)}
</g>
</g>
<!-- frame: arch with stepped deco crown -->
<g class="gm-frame">${framePaths('url(#gm-gold)', 'class="gm-arch" pathLength="1"')}
<path d="M130 22 L136 12 L142 18 L150 6 L158 18 L164 12 L170 22" fill="#16050a" stroke="url(#gm-gold)" stroke-width="1.5"/></g>
</svg>
<!-- layer 4: slow light sweep over the gold frame -->
<svg class="gm-svg gm-l-sweep" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
<!-- slow light sweep across the gold (bright copy of the frame behind a moving mask) -->
<g class="gm-sweep" mask="url(#gm-sweepM)">${framePaths('#fff8dc')}</g>
</svg>`;

const css = `
/* ---- gm: Classic Gambler ---- */
.gm-root{background:#16050a}
.gm-svg *{transform-box:view-box}
.gm-l-back,.gm-l-smoke,.gm-l-main,.gm-l-sweep{will-change:transform}   /* separate compositor layers */
.gm-l-smoke,.gm-l-sweep{pointer-events:none}
/* idle: ember breathes like a slow drag and lights the jaw with it */
@keyframes gm-ember{0%,100%{transform:scale(.84);opacity:.72}14%{transform:scale(1.3);opacity:1}26%{transform:scale(1.12);opacity:.92}52%{transform:scale(.8);opacity:.66}70%{transform:scale(1.02);opacity:.84}}
@keyframes gm-jaw{0%,100%{opacity:.1}14%{opacity:.5}26%{opacity:.36}52%{opacity:.06}70%{opacity:.24}}
.gm-ember{animation:gm-ember 3.1s ease-in-out infinite}
.gm-jaw{opacity:.24;animation:gm-jaw 3.1s ease-in-out infinite}
.gm-jawflare,.gm-ring,.gm-catch,.gm-fly,.gm-spill{opacity:0}
/* idle: smoke puffs break off the top of the ribbon */
@keyframes gm-puff{0%{transform:translate(0,10px) scale(.4);opacity:0}25%{opacity:.75}100%{transform:translate(7px,-22px) scale(1.7);opacity:0}}
.gm-puff{opacity:0;animation:gm-puff 2.6s ease-out infinite}
.gm-puff2{animation-delay:-1.3s;animation-duration:3.1s}
/* idle: the eyes glint now and then */
@keyframes gm-glint{0%,84%,100%{opacity:0}87%{opacity:1}90%{opacity:.15}93%{opacity:.8}97%{opacity:0}}
@keyframes gm-star{0%,85%,100%{transform:scale(0) rotate(0deg);opacity:0}88%{transform:scale(1) rotate(30deg);opacity:1}95%{transform:scale(0) rotate(80deg);opacity:0}}
.gm-glint{opacity:0;animation:gm-glint 5.6s linear infinite}
.gm-star{opacity:0;animation:gm-star 5.6s linear infinite}
/* idle: a slow light sweep catches the gold frame */
@keyframes gm-sweep{0%{transform:translateX(0)}42%,100%{transform:translateX(560px)}}
.gm-sweepbar{animation:gm-sweep 6.5s ease-in-out infinite}
/* entrance: frame draws itself, scene comes up out of the dark, eyes and ember ignite */
@keyframes gm-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes gm-scene{from{opacity:0;transform:scale(1.07)}to{opacity:1;transform:none}}
@keyframes gm-ignite{0%{opacity:0}30%{opacity:1}45%{opacity:.2}60%{opacity:1}75%{opacity:.5}100%{opacity:1}}
.gm-go .gm-arch{stroke-dasharray:1;animation:gm-draw .85s cubic-bezier(.5,0,.2,1) backwards}
.gm-go .gm-scene{animation:gm-scene .7s .1s cubic-bezier(.2,.7,.2,1) backwards}
.gm-go .gm-eyes{animation:gm-ignite .42s .8s linear backwards}
.gm-go .gm-ember-in{animation:gm-ignite .5s 1s linear backwards}
`;

module.exports = {
  prefix: 'gm', name: 'Classic Gambler', player: 'Rosh', auto: 1500,
  markup, css, hooks: fs.readFileSync(__dirname + '/gambler.hooks.cjs', 'utf8'),
};
