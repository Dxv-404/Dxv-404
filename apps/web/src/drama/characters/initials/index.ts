// The Initials silhouette: players on Initials, and avatars whose character is not drawn yet. An ink-wash figure
// with the player's initials painted on the chest, and a plain set of poses (plan, "Where we are").
import { brush, line, sweat, anger, INK, WHITE, type Pt } from '../../art';
import type { CharacterDef, PoseCtx, PoseDef, SceneScript } from '../../types';

interface Rig {
  lean?: number; head?: number; up?: number;
  /** elbow and hand, relative to the shoulders (left = viewer's left) */
  l: [number, number, number, number]; r: [number, number, number, number];
  mark?: 'sweat' | 'anger' | null;
  eyes?: 'calm' | 'wide' | 'shut' | 'glare';
}
const W = 'rgba(17,17,17,.86)';
function figure(o: Rig, c: PoseCtx): string {
  const up = o.up ?? 0, lean = o.lean ?? 0;
  const sx = 120 + lean, sy = 152 - up;
  const shL: Pt = [sx - 44, sy], shR: Pt = [sx + 44, sy];
  const head = `<g transform="rotate(${o.head ?? 0} ${sx} ${sy - 46})"><ellipse cx="${sx}" cy="${sy - 50}" rx="29" ry="33" fill="${W}"/>`
    + `<path d="M${sx - 27} ${sy - 62} Q${sx} ${sy - 96} ${sx + 28} ${sy - 60}" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" opacity=".7"/>`
    + (o.eyes === 'shut' ? line(`M${sx - 16} ${sy - 48} q6 4 12 0 M${sx + 4} ${sy - 48} q6 4 12 0`, 2.4, WHITE)
      : o.eyes === 'wide' ? `<circle cx="${sx - 11}" cy="${sy - 50}" r="5" fill="${WHITE}"/><circle cx="${sx + 11}" cy="${sy - 50}" r="5" fill="${WHITE}"/>`
        : o.eyes === 'glare' ? `<path d="M${sx - 19} ${sy - 55} l14 6 l-13 1z M${sx + 19} ${sy - 55} l-14 6 l13 1z" fill="${WHITE}"/>`
          : `<path d="M${sx - 17} ${sy - 50} h11 M${sx + 6} ${sy - 50} h11" stroke="${WHITE}" stroke-width="3" stroke-linecap="round"/>`)
    + '</g>';
  const torso = `<path d="M${shL[0]} ${shL[1]} Q${sx} ${sy - 14} ${shR[0]} ${shR[1]} Q${sx + 56} ${sy + 60} ${sx + 40} ${sy + 92 + up} L${sx - 40} ${sy + 92 + up} Q${sx - 56} ${sy + 60} ${shL[0]} ${shL[1]}Z" fill="${W}"/>`
    + `<path d="M${sx - 30} ${sy + 20} Q${sx - 46} ${sy + 60} ${sx - 34} ${sy + 88}" fill="none" stroke="${INK}" stroke-width="10" opacity=".35" stroke-linecap="round"/>`;
  const arm = (sh: Pt, a: Rig['l']): string => {
    const e: Pt = [sh[0] + a[0], sh[1] + a[1]], h: Pt = [sh[0] + a[2], sh[1] + a[3]];
    return brush([sh, e, h], 26, { taper: 'none', fill: W }) + `<circle cx="${h[0]}" cy="${h[1]}" r="13" fill="${W}"/>`;
  };
  const ini = `<text x="${sx}" y="${sy + 56}" text-anchor="middle" font-family="'Reggae One',serif" font-size="34" fill="${WHITE}" opacity=".95">${c.initials}</text>`;
  const mark = o.mark === 'sweat' ? sweat(sx + 40, sy - 70, 1.2, 15) : o.mark === 'anger' ? anger(sx + 30, sy - 78, 1.1) : '';
  return arm(shL, o.l) + torso + ini + head + arm(shR, o.r) + mark;
}
const pose = (o: Rig): PoseDef => (c) => figure(o, c);

const poses: Record<string, PoseDef> = {
  sit: pose({ l: [-6, 50, 18, 84], r: [6, 50, -18, 84] }),
  shock: pose({ l: [-24, 30, -30, -10], r: [24, 30, 30, -10], eyes: 'wide', mark: 'sweat', up: 6 }),
  glare: pose({ l: [-6, 50, 20, 82], r: [6, 50, -20, 82], eyes: 'glare', lean: 6, head: 6, mark: 'anger' }),
  smug: pose({ l: [-10, 46, 24, 70], r: [20, 30, 0, -14], eyes: 'shut', head: -6 }),
  win: pose({ l: [-30, -20, -24, -70], r: [30, -20, 24, -70], eyes: 'shut', up: 10 }),
  out: pose({ l: [-2, 56, 14, 96], r: [2, 56, -14, 96], eyes: 'shut', head: 18, lean: 4, mark: 'sweat', up: -14 }),
  lost: pose({ l: [-4, 54, 20, 84], r: [10, 44, -6, 10], eyes: 'calm', head: -10, mark: 'sweat' }),
  furious: pose({ l: [-30, 10, -20, -40], r: [26, 30, 10, 84], eyes: 'glare', mark: 'anger', lean: 8 }),
  stunned: pose({ l: [-20, 34, -10, -6], r: [20, 34, 10, -6], eyes: 'wide', up: 4 }),
  split: pose({ l: [-6, 50, 20, 82], r: [36, 30, 76, 40], eyes: 'calm' }),
  rebuy: pose({ l: [-16, 50, 30, 84], r: [16, 50, -30, 84], eyes: 'glare', lean: -4 }),
  champion: pose({ l: [-34, -30, -10, -100], r: [34, -30, 10, -100], eyes: 'shut', up: 30 }),
  push: pose({ l: [-6, 50, 18, 84], r: [24, 40, 60, 86], eyes: 'glare', lean: 10 }),
  shove: pose({ l: [10, 46, 54, 84], r: [24, 40, 70, 80], eyes: 'glare', lean: 18, head: 8 }),
  fold: pose({ l: [-6, 50, 18, 84], r: [30, 10, 70, -10], eyes: 'shut', head: -8 }),
};

const word = (): SceneScript['shots'][number] => ({ cut: 'freeze', w: 0.24, fx: ['flash', 'splash', 'shake'] });
const act = (ps: string[], fx: SceneScript['shots'][number]['fx'] = ['speed']): SceneScript['shots'][number] => ({
  cut: 'act', w: 0.46, poses: ps, cam: { x: 120, y: 150, zoom: 1.5, to: { x: 120, y: 145, zoom: 1.7 } }, wide: { x: 120, y: 160, zoom: 1.15 }, fx,
});
const inHand = (ps: string[], fx?: SceneScript['shots'][number]['fx']): SceneScript => ({ shots: [{ cut: 'establish', w: 0.14 }, act(ps, fx), { cut: 'reaction', w: 0.16 }, { ...word(), poses: [ps[ps.length - 1]!] }] });
const result = (ps: string[]): SceneScript => ({ shots: [{ cut: 'establish', w: 0.12 }, act(ps, ['focus']), { cut: 'reaction', w: 0.26 }, { ...word(), w: 0.2, poses: [ps[ps.length - 1]!] }] });

const character: CharacterDef = {
  id: 'initials',
  name: 'Initials',
  home: 'ink',
  motif: 'An ink-wash figure with the initials painted on the chest',
  poses,
  scenes: {
    allin: inHand(['sit', 'shove'], ['speed', 'shake']),
    allinAnswered: inHand(['glare', 'push']),
    bigBet: inHand(['sit', 'push']),
    bigBetAnswered: inHand(['glare', 'push']),
    fold: inHand(['lost', 'fold'], []),
    allinResult: result(['smug', 'win']),
    comeback: result(['stunned', 'win']),
    bigPot: result(['push', 'win']),
    split: result(['split']),
    rebuy: { shots: [{ cut: 'establish', w: 0.15 }, { cut: 'act', w: 0.3, who: 'dealer', poses: ['slide'] }, { ...act(['rebuy']), w: 0.3 }, { ...word(), poses: ['rebuy'] }] },
    lastStanding: { shots: [{ cut: 'establish', w: 0.12 }, act(['win', 'champion'], ['focus']), { cut: 'reaction', who: 'losers', w: 0.3 }, { ...word(), w: 0.22, poses: ['champion'] }] },
  },
  reactions: {
    target: { poses: ['shock'] }, out: { poses: ['out'], fx: ['heavy'] }, lost: { poses: ['lost'] }, split: { poses: ['split'] },
    comebackLost: { poses: ['furious'] }, lastLost: { poses: ['out'], fx: ['heavy'] }, witness: { poses: ['sit'] },
  },
};
export default character;
