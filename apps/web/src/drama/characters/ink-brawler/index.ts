// The Brawler (avatar ink-brawler): loud, proud, hot-headed street fighter. Motif: his taped fists, and furniture
// that doesn't survive him (plan, "Ink scene list"). The reference character for docs/drama-authoring.md.
import { brush, chipStack, chipTop, impact, line, motion, INK, RED, WHITE } from '../../art';
import { TABLE_FRONT, type CharacterDef, type PoseDef, type PropDef, type SceneScript, type Shot } from '../../types';
import { arm, head, torso, type ArmSpec, type Face, type HeadOpts, type TorsoOpts } from './body';

// ---------------------------------------------------------------- poses
interface P {
  face: Face; head?: HeadOpts; torso?: TorsoOpts;
  /** his right arm (on the viewer's left) and his left arm; `back`: drawn behind the table edge */
  L?: ArmSpec | null; R?: ArmSpec | null;
  back?: ('L' | 'R')[];
  /** extra marks drawn over him (motion lines, impact ticks) */
  over?: string;
}
const fist = (el: [number, number], wr: [number, number], o: Partial<ArmSpec> = {}): ArmSpec => ({ el, wr, hand: 'fist', ...o });
const REST_L = fist([30, 230], [86, 224]);
const REST_R = fist([210, 230], [154, 224]);
function draw(p: P): string {
  const t = torso(p.torso);
  const L = p.L === undefined ? REST_L : p.L, R = p.R === undefined ? REST_R : p.R;
  const back = new Set(p.back ?? []);
  const armL = L ? arm(t.shL, L) : '', armR = R ? arm(t.shR, R) : '';
  const hd = head(p.face, { ...p.head, dx: (p.head?.dx ?? 0) + (p.torso?.dx ?? 0) * 0.8, dy: (p.head?.dy ?? 0) + (p.torso?.dy ?? 0) });
  // behind the table: the body, the head, and any arm that goes below the table; in front: the arms on it
  return (back.has('L') ? armL : '') + (back.has('R') ? armR : '') + t.svg + hd + TABLE_FRONT
    + (back.has('L') ? '' : armL) + (back.has('R') ? '' : armR) + (p.over ?? '');
}
const pose = (p: P): PoseDef => () => draw(p);
const F = (brows: Face['brows'], eyes: Face['eyes'], mouth: Face['mouth'], marks?: Face['marks']): Face => ({ brows, eyes, mouth, ...(marks ? { marks } : {}) });
const up = (dy: number): TorsoOpts => ({ dy: -dy });

const poses: Record<string, PoseDef> = {
  // ---- required
  sit: pose({ face: F('cocky', 'dot', 'grit') }),
  shock: pose({ face: F('up', 'wide', 'wobble', ['sweat']), torso: up(8), head: { dy: -4, flow: -20 }, L: { el: [16, 190], wr: [34, 140], hand: 'open' }, R: { el: [224, 190], wr: [206, 140], hand: 'open' } }),
  glare: pose({ face: F('angry', 'glare', 'grit', ['anger']), torso: { dy: 8 }, head: { dy: 6, tilt: 4 }, L: fist([34, 226], [96, 228]), R: fist([206, 226], [144, 228]) }),
  smug: pose({ face: F('cocky', 'side', 'smirk'), head: { tilt: -6 }, R: fist([228, 214], [172, 150], { rot: -30 }) }),
  win: pose({ face: F('cocky', 'shut', 'laugh'), torso: up(18), L: fist([14, 150], [44, 96]), R: fist([226, 150], [196, 96]) }),
  out: pose({ face: F('flat', 'covered', 'wobble', ['sweat', 'plaster2']), torso: { dy: 16, hunch: -8 }, head: { bandDown: true, tilt: 9, dy: 6, flow: 70 }, L: { el: [40, 250], wr: [70, 300], hand: 'none' }, R: { el: [200, 250], wr: [170, 300], hand: 'none' }, back: ['L', 'R'] }),
  lost: pose({ face: F('angry', 'glare', 'grit', ['anger', 'veins']), torso: { rot: 5 }, head: { tilt: 5 }, R: fist([230, 238], [238, 266], { rot: 20 }) }),
  furious: pose({ face: F('angry', 'glare', 'roar', ['anger', 'steam']), torso: up(30), head: { flow: -30 }, L: fist([8, 150], [30, 100]), R: fist([232, 150], [210, 100]) }),
  stunned: pose({ face: F('up', 'wide', 'flat', ['sweat2']), torso: up(4), L: { el: [34, 226], wr: [92, 222], hand: 'open' }, R: { el: [206, 226], wr: [148, 222], hand: 'open' } }),
  split: pose({ face: F('angry', 'glare', 'grit', ['sweat', 'veins']), torso: { rot: 6 }, R: { el: [196, 230], wr: [190, 154], hand: 'grip' } }),
  rebuy: pose({ face: F('cocky', 'glare', 'grin', ['veins']), torso: { rot: 8 }, R: { el: [200, 230], wr: [214, 158], hand: 'grip' } }),
  champion: pose({ face: F('cocky', 'shut', 'laugh'), torso: up(44), head: { flow: -40 }, L: { el: [26, 94], wr: [84, 40], hand: 'open' }, R: { el: [214, 94], wr: [156, 40], hand: 'open' }, back: ['L', 'R'] }),

  // ---- all-in
  // dominant: lifts his end of the table, the chips slide into the pot
  'lift-1': pose({ face: F('cocky', 'glare', 'grin'), torso: { dy: 8 }, L: { el: [26, 236], wr: [66, 250], hand: 'claw' }, R: { el: [214, 236], wr: [174, 250], hand: 'claw' }, back: ['L', 'R'] }),
  'lift-2': pose({ face: F('cocky', 'dot', 'laugh'), torso: up(26), L: { el: [22, 200], wr: [62, 196], hand: 'claw' }, R: { el: [218, 200], wr: [178, 196], hand: 'claw' } }),
  'lift-3': pose({ face: F('cocky', 'shut', 'laugh', ['steam']), torso: up(40), head: { flow: -24 }, L: { el: [20, 170], wr: [60, 150], hand: 'claw' }, R: { el: [220, 170], wr: [180, 150], hand: 'claw' } }),
  // contender: rips the tape off with his teeth, shoulder-charges the stack in
  'tape-bite': pose({ face: F('angry', 'glare', 'bite'), head: { tilt: 8 }, R: fist([224, 196], [152, 138], { rot: -60 }) }),
  charge: pose({ face: F('angry', 'glare', 'roar', ['anger']), torso: { dx: -22, dy: 10, rot: -16 }, head: { dx: -10, tilt: -14, flow: 40 }, L: fist([16, 214], [66, 204]), R: fist([236, 190], [250, 140], { tail: true }), over: motion(210, 170, 70, 180, 5, 14) }),
  // desperate contender: rattles his last stacks like dice, blows on them, throws
  'dice-shake': pose({ face: F('worried', 'glare', 'grit', ['sweat']), R: fist([234, 172], [204, 112], { rot: -20 }), over: line('M226 92 q8 -6 14 0 M230 82 q10 -8 18 0', 2) + chipTop(214, 98, 9, true) }),
  'dice-blow': pose({ face: F('worried', 'shut', 'blow', ['sweat']), R: fist([220, 200], [156, 144], { rot: -40 }) }),
  'dice-throw': pose({ face: F('angry', 'glare', 'grin', ['sweat']), torso: { dy: 6, rot: -4 }, R: { el: [196, 200], wr: [146, 226], hand: 'open', rot: 180 }, over: motion(196, 224, 50, 160, 4, 8) }),
  // desperate: punches the chips in, his fist goes through the table edge; stuck
  punch: pose({ face: F('angry', 'squeeze', 'roar'), torso: { dx: 6, dy: 12, rot: 6 }, R: fist([190, 186], [150, 238], { rot: 10 }), over: impact(150, 244, 18) }),
  stuck: pose({ face: F('worried', 'wide', 'wobble', ['sweat', 'sweat2', 'blush']), torso: { dy: 6, rot: 4 }, R: { el: [184, 206], wr: [160, 262], hand: 'none' } }),

  // ---- all-in answered
  'laugh-toss': pose({ face: F('cocky', 'shut', 'laugh'), head: { dy: -4, tilt: -14, flow: -10 }, R: { el: [232, 126], wr: [194, 64], hand: 'open', rot: 160 }, back: ['R'] }),
  'neck-l': pose({ face: F('flat', 'glare', 'smirk'), head: { tilt: -24 }, over: line('M64 108 l-10 -6 M60 120 l-12 -2', 2.4) }),
  'neck-r': pose({ face: F('flat', 'glare', 'smirk'), head: { tilt: 24 }, over: line('M176 108 l10 -6 M180 120 l12 -2', 2.4) }),
  'forearm-shove': pose({ face: F('angry', 'glare', 'grit'), torso: { dx: -10, dy: 8, rot: -8 }, R: fist([214, 228], [86, 232], { rot: 90 }), over: motion(120, 236, 80, 180, 3, 9) }),
  slap: pose({ face: F('angry', 'squeeze', 'grit'), L: { el: [36, 206], wr: [84, 126], hand: 'palm', rot: 10 }, R: { el: [204, 206], wr: [156, 126], hand: 'palm', rot: -10 }, over: impact(80, 118, 14, 5) + impact(160, 118, 14, 5) }),
  push: pose({ face: F('angry', 'glare', 'grit'), torso: { dy: 8 }, L: { el: [44, 226], wr: [98, 234], hand: 'open', rot: 180 }, R: { el: [196, 226], wr: [142, 234], hand: 'open', rot: 180 } }),
  'grit-slam': pose({ face: F('angry', 'shadow', 'grit', ['sweat']), torso: { dy: 12, hunch: 6 }, L: fist([46, 212], [92, 238]), R: fist([194, 212], [148, 238]), over: impact(92, 244, 14, 5) + impact(148, 244, 14, 5) }),

  // ---- big bet
  'drop-stack': pose({ face: F('flat', 'side', 'flat'), R: { el: [214, 212], wr: [160, 206], hand: 'open', rot: 180 } }),
  yawn: pose({ face: F('flat', 'shut', 'yawn'), head: { tilt: -6 }, R: { el: [234, 168], wr: [168, 96], hand: 'claw', rot: -40 }, over: line('M190 70 q6 -6 12 0', 1.8) }),
  'fists-lean': pose({ face: F('angry', 'glare', 'grit', ['anger', 'veins']), torso: { dy: 22, wide: 8 }, head: { dy: 14 }, L: fist([18, 214], [66, 234]), R: fist([222, 214], [174, 234]) }),
  'jab-1': pose({ face: F('angry', 'glare', 'grit', ['sweat']), torso: { rot: -6 }, L: fist([82, 196], [112, 172], { scale: 1.45 }), R: fist([206, 196], [164, 146]), over: impact(112, 170, 30, 7) }),
  'jab-2': pose({ face: F('angry', 'glare', 'grit', ['sweat']), torso: { rot: 6 }, L: fist([34, 196], [76, 146]), R: fist([158, 196], [128, 172], { scale: 1.45 }), over: impact(128, 170, 30, 7) }),
  'shoulder-roll': pose({ face: F('worried', 'glare', 'grit', ['sweat']), torso: { rot: 10, hunch: 10 }, head: { tilt: -6 }, R: fist([238, 168], [222, 118]), over: line('M214 140 q20 -24 34 6', 2.2) }),

  // ---- big bet answered
  flick: pose({ face: F('cocky', 'side', 'smirk'), R: { el: [212, 226], wr: [162, 220], hand: 'flick' }, over: chipTop(140, 196, 10, true) + motion(150, 200, 30, 200, 3, 6) }),
  'slam-up': pose({ face: F('angry', 'glare', 'roar', ['anger']), torso: up(18), L: fist([20, 140], [70, 90]), R: fist([220, 140], [170, 90]), back: [] }),
  'slam-down': pose({ face: F('angry', 'glare', 'grit', ['anger']), torso: { dy: 10 }, L: fist([40, 212], [96, 238]), R: fist([200, 212], [144, 238]), over: impact(96, 244, 22) + impact(144, 244, 22) }),
  knuckles: pose({ face: F('cocky', 'glare', 'smirk'), L: fist([40, 216], [108, 190]), R: fist([200, 216], [132, 190]), over: line('M112 168 l-4 -10 M124 164 v-12 M136 168 l4 -10', 2.2) }),
  roar: pose({ face: F('angry', 'glare', 'roar', ['anger']), torso: { wide: 10, dy: -4 }, head: { dy: -6, flow: -34 }, L: fist([8, 188], [22, 146]), R: fist([232, 188], [218, 146]) }),
  'bounce-1': pose({ face: F('worried', 'glare', 'grin', ['sweat']), torso: up(18), L: fist([30, 170], [80, 130]), R: fist([210, 170], [160, 130]) }),
  'bounce-2': pose({ face: F('worried', 'glare', 'grin', ['sweat']), torso: up(32), L: fist([30, 156], [80, 116]), R: fist([210, 156], [160, 116]), over: line('M60 300 h30 M150 300 h30', 2) }),
  retape: pose({ face: F('angry', 'glare', 'bite'), L: { el: [36, 214], wr: [112, 180], hand: 'open', rot: 60 }, R: fist([204, 214], [134, 176]) }),
  grit: pose({ face: F('angry', 'shadow', 'grit', ['sweat', 'sweat2']), torso: { dy: 6 }, L: fist([34, 226], [96, 232]), R: fist([206, 226], [144, 232]) }),

  // ---- the fold
  'toss-cards': pose({ face: F('cocky', 'shut', 'smirk'), head: { tilt: -8 }, R: { el: [232, 150], wr: [212, 94], hand: 'flick' }, back: ['R'] }),
  'flick-cards': pose({ face: F('angry', 'glare', 'grit', ['anger']), R: { el: [206, 214], wr: [156, 204], hand: 'flick' } }),
  'palm-punch': pose({ face: F('angry', 'squeeze', 'grit'), L: { el: [48, 220], wr: [112, 206], hand: 'palm', rot: 70 }, R: fist([198, 204], [130, 198]), over: impact(122, 200, 18, 6) }),
  'puff-fold': pose({ face: F('worried', 'side', 'puff', ['blush']), R: { el: [206, 224], wr: [150, 228], hand: 'open', rot: 180 } }),

  // ---- after the cards
  flex: pose({ face: F('cocky', 'shut', 'laugh'), torso: { dy: -24, wide: 8 }, L: fist([16, 150], [46, 92]), R: fist([224, 150], [194, 92]) }),
  'kiss-card': pose({ face: F('up', 'shut', 'kiss', ['blush', 'tears']), R: { el: [216, 200], wr: [150, 134], hand: 'open', rot: -30 } }),
  'flip-try': pose({ face: F('angry', 'squeeze', 'roar', ['veins', 'anger', 'sweat']), torso: up(16), L: { el: [26, 236], wr: [66, 252], hand: 'claw' }, R: { el: [214, 236], wr: [174, 252], hand: 'claw' }, back: ['L', 'R'] }),
  'bear-hug': pose({ face: F('cocky', 'shut', 'grin', ['blush']), torso: { dy: 22, wide: 10 }, head: { dy: 8 }, L: { el: [14, 216], wr: [104, 252], hand: 'open', rot: 150 }, R: { el: [226, 216], wr: [136, 252], hand: 'open', rot: -150 } }),
  'armrest': pose({ face: F('angry', 'glare', 'grit', ['anger', 'veins', 'sweat']), torso: { rot: 8 }, head: { tilt: 6 }, R: fist([232, 236], [240, 268], { rot: 30 }), over: impact(240, 276, 12, 5) }),
};

// ---------------------------------------------------------------- props (they travel with him to every table)
const slab = `<g><path d="M-96 -16 L96 -16 L96 6 L-96 6Z" fill="${WHITE}" stroke="${INK}" stroke-width="3"/><path d="M-96 -16 L96 -16 L96 6 L-96 6Z" fill="url(#dt-tone)" opacity=".3"/><path d="M-96 6 L96 6 L96 30 L-96 30Z" fill="${INK}"/>${brush([[-90, 12], [90, 12]], 3, { fill: WHITE })}</g>`;
const card = (rot = 0): string => `<g transform="rotate(${rot})"><rect x="-13" y="-18" width="26" height="36" rx="3" fill="${WHITE}" stroke="${INK}" stroke-width="2.2"/><rect x="-9" y="-14" width="18" height="28" fill="${RED}"/><path d="M-9 -14 L9 14 M9 -14 L-9 14" stroke="${INK}" stroke-width=".8"/></g>`;
const props: Record<string, PropDef> = {
  /** his end of the table, lifted */
  slab: { svg: slab },
  /** the tape strip he rips with his teeth */
  'tape-strip': { svg: `<path d="M0 0 Q20 -10 40 4 Q52 14 70 8 L70 16 Q50 22 38 12 Q20 0 0 8Z" fill="${WHITE}" stroke="${INK}" stroke-width="2"/>${line('M14 0 v8 M30 0 v8 M50 10 v7', 1)}` },
  /** chips flying loose */
  'chips-fly': { svg: chipTop(0, 0, 12, true) + chipTop(28, -18, 11, false) + chipTop(-26, -8, 10, false) + chipTop(10, -36, 9, true) + motion(0, 0, 40, 200, 3, 12) },
  /** the stacks he threw, landed perfectly */
  'chips-stack': { svg: chipStack(-14, 0, 6) + chipStack(14, 2, 5, 26, true) },
  /** a big stack that stays behind (the dominant answer: chips left over) */
  'chips-tower': { svg: chipStack(0, 0, 12) + chipStack(26, 4, 9, 26, true) },
  /** the table edge cracked round his fist; splinters */
  crack: { svg: `${line('M0 0 L-18 -14 L-30 -10 M0 0 L22 -16 L34 -12 M0 0 L-14 20 M0 0 L18 22 L30 30 M-6 2 L-40 8', 7, WHITE)}${line('M0 0 L-18 -14 L-30 -10 M0 0 L22 -16 L34 -12 M0 0 L-14 20 M0 0 L18 22 L30 30 M-6 2 L-40 8', 2.6)}<ellipse cx="0" cy="2" rx="22" ry="12" fill="${INK}" stroke="${WHITE}" stroke-width="3"/><path d="M-26 -30 l8 -6 l2 8z M30 -34 l6 -4 l2 6z M-40 -16 l-6 -6 l8 0z" fill="${WHITE}" stroke="${INK}" stroke-width="1.6"/>` },
  /** the bent armrest of his chair */
  armrest: { svg: `<path d="M0 0 Q30 -6 40 20 Q44 40 30 60" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round"/><path d="M0 0 Q30 -6 40 20 Q44 40 30 60" fill="none" stroke="${WHITE}" stroke-width="9" stroke-linecap="round"/>${line('M34 6 l6 -6 M42 24 l8 0', 2)}` },
  /** cards thrown over his shoulder / flicked spinning */
  'cards-fly': { svg: card(-30) + `<g transform="translate(26 -14)">${card(40)}</g>` + motion(0, 0, 40, 30, 3, 10) },
  /** the winning card, kissed */
  'card-win': { svg: card(-12) + line('M-20 -30 l-6 -6 M20 -30 l6 -6 M0 -34 v-8', 2) },
  /** cards jumping off the felt from the double slam */
  'cards-jump': { svg: card(-20) + `<g transform="translate(40 -10)">${card(25)}</g>` + line('M-10 30 l-4 10 M40 26 l4 10', 2) },
  /** a roll of tape, mid-wrap */
  'tape-roll': { svg: `<circle r="12" fill="${WHITE}" stroke="${INK}" stroke-width="2.6"/><circle r="5" fill="${WHITE}" stroke="${INK}" stroke-width="2"/><path d="M10 6 Q30 20 46 8" fill="none" stroke="${INK}" stroke-width="7"/><path d="M10 6 Q30 20 46 8" fill="none" stroke="${WHITE}" stroke-width="4"/>` },
  /** chips stuck to his flexed muscles */
  'chips-stuck': { svg: chipTop(0, 0, 10, true) + chipTop(170, -6, 10, false) + chipTop(30, 30, 9, false) + chipTop(146, 26, 9, true) + chipTop(90, 70, 10, true) },
  /** the callback: the tape he ripped off in the first act, lying on the felt */
  'tape-floor': { svg: `<path d="M0 0 Q20 -8 36 2 Q46 10 60 4 L60 10 Q46 16 34 8 Q20 0 0 6Z" fill="${WHITE}" stroke="${INK}" stroke-width="1.8"/>` },
  /** the pot held overhead like a championship belt */
  belt: { svg: `<path d="M-110 0 Q0 -24 110 0 L106 30 Q0 8 -106 30Z" fill="${INK}"/><ellipse cx="0" cy="8" rx="38" ry="26" fill="${WHITE}" stroke="${INK}" stroke-width="4"/>${chipTop(0, 6, 22, true)}${chipTop(-70, 10, 12, false)}${chipTop(70, 10, 12, false)}<text x="0" y="-26" text-anchor="middle" font-family="'Reggae One',serif" font-size="22" fill="${RED}" stroke="${INK}" stroke-width="1">王者</text>` },
  /** a wind of a roar blowing back */
  'roar-wind': { svg: motion(0, 0, 120, 0, 7, 16) },
};

// ---------------------------------------------------------------- scenes
const est = (w = 0.15): Shot => ({ cut: 'establish', w });
const react = (w = 0.17, extra: Partial<Shot> = {}): Shot => ({ cut: 'reaction', w, ...extra });
const close = { x: 120, y: 160, zoom: 1.55 };
const waist = (to = 1.75): Shot['cam'] => ({ ...close, to: { x: 120, y: 152, zoom: to } });
const wideCam = { x: 120, y: 160, zoom: 1.15 };
const act = (poses: string[], o: Partial<Shot> = {}): Shot => ({ cut: 'act', w: 0.48, poses, cam: waist(), wide: wideCam, ...o });
const freeze = (pose: string, o: Partial<Shot> = {}): Shot => ({ cut: 'freeze', w: 0.2, poses: [pose], cam: { x: 120, y: 172, zoom: 1.32 }, wide: { x: 120, y: 176, zoom: 1.08 }, fx: ['flash', 'splash', 'shake'], ...o });
const STAND = { x: 120, y: 128, zoom: 1.35 };
const STAND_W = { x: 120, y: 150, zoom: 1.05 };
const S = (...shots: Shot[]): SceneScript => ({ shots });

const scenes: Record<string, SceneScript> = {
  // ---------------- all-in
  'allin.dominant': S(est(), act(['lift-1', 'lift-2', 'lift-3'], { cam: { x: 120, y: 160, zoom: 1.5, to: { x: 120, y: 130, zoom: 1.4 } }, wide: STAND_W, fx: ['speedV', 'shake'], sfx: [{ text: 'ゴゴゴ', x: 18, y: 22, rot: -12 }], props: [{ id: 'slab', x: 120, y: 250, at: 0.33, move: { x: 120, y: 168, rot: -16 } }, { id: 'chips-fly', x: 150, y: 170, at: 0.55, move: { x: 230, y: 250, rot: 30 } }] }), react(), freeze('lift-3', { cam: STAND, wide: STAND_W, props: [{ id: 'slab', x: 120, y: 160, rot: -18 }], fx: ['flash', 'splash', 'shake', 'shatter'] })),
  'allin.contender': S(est(0.12), act(['tape-bite', 'charge'], { at: [0, 0.45], fx: ['speed', 'shake'], sfx: [{ text: 'ビリッ', x: 72, y: 20, rot: 10, at: 0.05 }, { text: 'ドン', x: 22, y: 30, size: 1.5, at: 0.5, red: true }], props: [{ id: 'tape-strip', x: 150, y: 130, move: { x: 190, y: 110, rot: 20 } }, { id: 'chips-fly', x: 60, y: 210, at: 0.5, move: { x: -20, y: 190, rot: -40 } }] }), react(), freeze('charge', { fx: ['flash', 'splash', 'shake', 'shatter'] })),
  'allin.desperateContender': S(est(0.12), act(['dice-shake', 'dice-blow', 'dice-throw'], { sfx: [{ text: 'ジャラ', x: 78, y: 18, rot: 8 }], props: [{ id: 'chips-stack', x: 120, y: 246, at: 0.8 }] }), react(), freeze('dice-throw', { props: [{ id: 'chips-stack', x: 120, y: 246 }], sfx: [{ text: 'ピタ', x: 70, y: 70, rot: -6 }] })),
  'allin.desperate': S(est(0.12), act(['punch', 'stuck'], { at: [0, 0.4], fx: ['shake'], sfx: [{ text: 'バキッ', x: 70, y: 24, size: 1.3, rot: 12, at: 0.35, red: true }], props: [{ id: 'crack', x: 160, y: 250, at: 0.38 }] }), react(), freeze('stuck', { props: [{ id: 'crack', x: 160, y: 250 }], sfx: [{ text: 'ダラダラ', x: 24, y: 24, rot: -10 }], fx: ['flash', 'splash'] })),

  // ---------------- all-in answered
  'allinAnswered.dominant': S(est(0.12), act(['laugh-toss'], { sfx: [{ text: 'ガハハ', x: 26, y: 22, rot: -10 }], props: [{ id: 'chips-fly', x: 196, y: 70, move: { x: -10, y: 200, rot: -90 } }, { id: 'chips-tower', x: 70, y: 252 }] }), react(), freeze('laugh-toss', { props: [{ id: 'chips-tower', x: 70, y: 252 }] })),
  'allinAnswered.contender': S(est(0.1), act(['neck-l', 'neck-r', 'forearm-shove'], { at: [0, 0.25, 0.55], fx: ['speed'], sfx: [{ text: 'ゴキ', x: 20, y: 30, rot: -14, at: 0.02 }, { text: 'ゴキッ', x: 80, y: 30, rot: 14, at: 0.27 }], props: [{ id: 'chips-fly', x: 180, y: 220, at: 0.55, move: { x: 40, y: 236, rot: -30 } }] }), react(), freeze('forearm-shove')),
  'allinAnswered.desperateContender': S(est(0.12), act(['slap', 'push'], { at: [0, 0.5], fx: ['shake'], sfx: [{ text: 'パンッ', x: 50, y: 18, size: 1.3, red: true }] }), react(), freeze('push')),
  'allinAnswered.desperate': S(est(0.12), act(['grit', 'grit-slam'], { at: [0, 0.5], fx: ['shake', 'tone'], sfx: [{ text: 'ドンッ', x: 74, y: 70, at: 0.5 }] }), react(), freeze('grit-slam', { fx: ['flash', 'splash', 'shake'] })),

  // ---------------- big bet (the target reacts in a quick cut)
  'bigBet.dominant': S(est(0.14), act(['drop-stack', 'yawn'], { at: [0, 0.45], sfx: [{ text: 'ふぁ〜', x: 74, y: 18, rot: 8, at: 0.5 }], props: [{ id: 'chips-tower', x: 150, y: 252, at: 0.12 }] }), react(0.2), freeze('yawn', { fx: ['flash'], props: [{ id: 'chips-tower', x: 150, y: 252 }] })),
  'bigBet.contender': S(est(0.12), act(['glare', 'fists-lean'], { at: [0, 0.35], cam: { x: 120, y: 140, zoom: 1.9, to: { x: 120, y: 130, zoom: 2.4 } }, fx: ['focus'], sfx: [{ text: 'ゴゴゴ', x: 20, y: 22, rot: -10 }] }), react(0.2), freeze('fists-lean')),
  'bigBet.desperateContender': S(est(0.1), act(['jab-1', 'jab-2', 'push'], { fx: ['speed'], sfx: [{ text: 'シュッ', x: 24, y: 24, at: 0.02 }, { text: 'シュッ', x: 76, y: 24, at: 0.34 }] }), react(), freeze('push')),
  'bigBet.desperate': S(est(0.12), act(['shoulder-roll', 'push'], { at: [0, 0.5], sfx: [{ text: 'グリ', x: 76, y: 22, rot: 10 }] }), react(), freeze('push', { fx: ['flash', 'tone'] })),

  // ---------------- big bet answered: a call, or a re-raise
  'bigBetAnswered.dominant.call': S(est(0.14), act(['flick'], { sfx: [{ text: 'ピン', x: 70, y: 30 }] }), react(), freeze('flick', { fx: ['flash'] })),
  'bigBetAnswered.dominant.raise': S(est(0.1), act(['slam-up', 'slam-down'], { at: [0, 0.4], fx: ['shake', 'speedV'], sfx: [{ text: 'ドドン', x: 50, y: 20, size: 1.4, at: 0.4, red: true }], props: [{ id: 'cards-jump', x: 120, y: 200, at: 0.42, move: { x: 120, y: 170 } }] }), react(), freeze('slam-down', { fx: ['flash', 'splash', 'shake', 'shatter'] })),
  'bigBetAnswered.contender.call': S(est(0.14), act(['knuckles'], { sfx: [{ text: 'ポキポキ', x: 50, y: 18, rot: -6 }] }), react(), freeze('knuckles')),
  'bigBetAnswered.contender.raise': S(est(0.1), act(['glare', 'roar'], { at: [0, 0.3], fx: ['focus', 'shake'], sfx: [{ text: 'ガアアッ', x: 50, y: 16, size: 1.4, at: 0.3, red: true }], props: [{ id: 'roar-wind', x: 230, y: 120, at: 0.3 }] }), react(0.2, { fx: ['speed'] }), freeze('roar', { fx: ['flash', 'splash', 'shake', 'shatter'] })),
  'bigBetAnswered.desperateContender.call': S(est(0.12), act(['bounce-1', 'bounce-2', 'bounce-1'], { cam: STAND, wide: STAND_W, sfx: [{ text: 'ピョン', x: 74, y: 22 }] }), react(), freeze('bounce-1', { cam: STAND, wide: STAND_W })),
  'bigBetAnswered.desperateContender.raise': S(est(0.1), act(['retape', 'roar'], { at: [0, 0.55], props: [{ id: 'tape-roll', x: 112, y: 176, move: { x: 140, y: 160, rot: 200 } }], sfx: [{ text: 'ギュッ', x: 72, y: 24 }] }), react(), freeze('roar', { fx: ['flash', 'splash', 'shake'] })),
  'bigBetAnswered.desperate': S(est(0.14), act(['grit'], { fx: ['tone'], sfx: [{ text: 'ギリ…', x: 74, y: 22 }] }), react(), freeze('grit', { fx: ['flash'] })),

  // ---------------- the fold
  'fold.dominant': S(est(0.18), act(['toss-cards'], { props: [{ id: 'cards-fly', x: 210, y: 90, move: { x: 250, y: 20, rot: 60 } }], sfx: [{ text: 'ポイ', x: 76, y: 20 }] }), freeze('toss-cards', { fx: [] })),
  'fold.contender': S(est(0.18), act(['flick-cards'], { props: [{ id: 'cards-fly', x: 150, y: 200, move: { x: 40, y: 230, rot: 720 } }], sfx: [{ text: 'チッ', x: 74, y: 22, red: true }] }), freeze('flick-cards', { fx: [] })),
  'fold.desperateContender': S(est(0.18), act(['palm-punch'], { sfx: [{ text: 'パシッ', x: 72, y: 20 }] }), freeze('palm-punch', { fx: [] })),
  'fold.desperate': S(est(0.18), act(['puff-fold'], { sfx: [{ text: 'ぷくっ', x: 74, y: 20 }] }), freeze('puff-fold', { fx: [] })),

  // ---------------- after the cards (he won it)
  allinResult: S(est(0.12), act(['flex'], { fx: ['focus'], cam: { x: 120, y: 140, zoom: 1.3, to: { x: 120, y: 130, zoom: 1.45 } }, sfx: [{ text: 'ムキッ', x: 24, y: 22, rot: -10 }], props: [{ id: 'chips-stuck', x: 36, y: 96, at: 0.3 }, { id: '@pile', x: 0, y: 0 }, { id: '@crown', x: 196, y: 64, at: 0.5 }, { id: 'tape-floor', x: 150, y: 246, if: 'allin' }] }), react(0.3), freeze('flex', { cam: STAND, wide: STAND_W, props: [{ id: 'chips-stuck', x: 36, y: 96 }, { id: '@pile', x: 0, y: 0 }, { id: '@crown', x: 196, y: 64 }], fx: ['flash', 'splash', 'shake'] })),
  comeback: S(est(0.1), act(['stunned', 'kiss-card'], { at: [0, 0.4], props: [{ id: 'card-win', x: 150, y: 124, at: 0.4 }, { id: '@pile', x: 0, y: 0 }], sfx: [{ text: 'チュッ', x: 74, y: 22, at: 0.45, red: true }] }), react(0.32), freeze('kiss-card', { props: [{ id: 'card-win', x: 150, y: 124 }, { id: '@pile', x: 0, y: 0 }, { id: '@crown', x: 196, y: 64 }] })),
  bigPot: S(est(0.12), act(['bear-hug'], { props: [{ id: '@pile', x: 0, y: -6 }, { id: '@crown', x: 196, y: 64, at: 0.5 }], sfx: [{ text: 'ガバッ', x: 24, y: 22, rot: -10 }] }), react(0.26), freeze('bear-hug', { props: [{ id: '@pile', x: 0, y: -6 }, { id: '@crown', x: 196, y: 64 }] })),
  split: S(est(0.12), { cut: 'act', w: 0.55, poses: ['split', 'glare', 'split'], cam: { x: 240, y: 170, zoom: 1.0 }, wide: { x: 240, y: 180, zoom: 0.85 }, fx: ['focus', 'shake'], sfx: [{ text: 'ググ…', x: 50, y: 16, size: 1.2 }] }, freeze('split', { cam: { x: 240, y: 170, zoom: 1.0 }, wide: { x: 240, y: 180, zoom: 0.85 }, fx: ['flash'] })),
  rebuy: S(est(0.12), { cut: 'act', w: 0.55, poses: ['rebuy', 'glare', 'rebuy'], dealer: 'grip', cam: { x: 220, y: 170, zoom: 1.05 }, wide: { x: 230, y: 180, zoom: 0.85 }, fx: ['focus'], sfx: [{ text: 'ガシッ', x: 50, y: 16, size: 1.2, red: true }], props: [{ id: '@chips', x: 330, y: 250, move: { x: 160, y: 250 } }] }, freeze('rebuy', { dealer: 'grip', cam: { x: 220, y: 170, zoom: 1.05 }, wide: { x: 230, y: 180, zoom: 0.85 }, props: [{ id: '@pile', x: 0, y: 0 }] })),
  lastStanding: S(est(0.1), act(['win', 'champion'], { at: [0, 0.35], cam: { x: 120, y: 120, zoom: 1.15, to: { x: 120, y: 110, zoom: 1.3 } }, wide: { x: 120, y: 130, zoom: 0.95 }, fx: ['focus', 'speedV'], sfx: [{ text: 'ウオオ', x: 22, y: 22, rot: -12, size: 1.3, red: true }], props: [{ id: 'belt', x: 120, y: 34, at: 0.35 }, { id: '@crown', x: 120, y: -40, at: 0.6 }] }), react(0.26), freeze('champion', { cam: { x: 120, y: 120, zoom: 1.2 }, wide: { x: 120, y: 130, zoom: 0.95 }, props: [{ id: 'belt', x: 120, y: 34 }], fx: ['flash', 'splash', 'shake', 'shatter'] })),
};

const character: CharacterDef = {
  id: 'ink-brawler',
  name: 'The Brawler',
  home: 'ink',
  motif: 'His taped fists, and furniture that doesn\'t survive him',
  poses,
  props,
  scenes,
  reactions: {
    // a bet aimed at him: he glares back, anger mark up
    target: { poses: ['glare'], sfx: [{ text: 'ア゛？', x: 74, y: 22, red: true }] },
    // knocked out: the headband slides over his eyes, a bandage pops onto his cheek
    out: { poses: ['sit', 'out'], fx: ['heavy'], sfx: [{ text: 'ズーン', x: 70, y: 20 }] },
    // lost but still in: bends the armrest of his chair
    lost: { poses: ['lost', 'armrest'], props: [{ id: 'armrest', x: 222, y: 250, at: 0.5 }], sfx: [{ text: 'メキッ', x: 74, y: 24, at: 0.5 }] },
    split: { poses: ['split'] },
    // a comeback against him: goes to flip the table, and Kage holds it down with one finger
    comebackLost: { poses: ['flip-try'], dealer: 'finger', sfx: [{ text: 'ぐぬぬ', x: 30, y: 20 }] },
    lastLost: { poses: ['out'], fx: ['heavy'] },
    witness: { poses: ['smug'] },
  },
};
export default character;
void RED;
