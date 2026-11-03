// Table drama: every character and set the registry finds is complete (docs/drama-authoring.md, checklist 1-2).
import { describe, expect, it } from 'vitest';
import { IN_HAND, POSITIONS, RESULTS } from '@tp/table';
import { REQUIRED_POSES, type CharacterDef, type PoseDef, type SetDef } from '../src/drama/types';
import { AVATAR_IDS } from '@tp/protocol';

const chars = import.meta.glob<{ default: CharacterDef }>('../src/drama/characters/*/index.ts', { eager: true });
const sets = import.meta.glob<{ default: SetDef }>('../src/drama/sets/*/index.ts', { eager: true });
const folder = (p: string) => p.split('/').slice(-2, -1)[0]!;
const draw = (p: PoseDef) => (typeof p === 'string' ? p : p({ initials: 'DK', lite: false }));
/** The script a moment plays (the same lookup as the engine's). */
export const lookup = (c: CharacterDef, key: string) => {
  const parts = key.split('.');
  for (let n = parts.length; n > 0; n--) { const s = c.scenes[parts.slice(0, n).join('.')]; if (s) return s; }
  return null;
};

describe('drama registry', () => {
  it('has the Initials silhouette and the neutral stage', () => {
    expect(Object.keys(chars).map(folder)).toContain('initials');
    expect(Object.keys(sets).map(folder)).toContain('neutral');
  });
  for (const [path, mod] of Object.entries(chars)) {
    const c = mod.default;
    describe(`character ${folder(path)}`, () => {
      it('is named after a real avatar id (or is the silhouette)', () => {
        expect(c.id).toBe(folder(path));
        if (c.id !== 'initials') expect(AVATAR_IDS as readonly string[]).toContain(c.id);
      });
      it('draws every required pose', () => {
        for (const p of REQUIRED_POSES) { expect(c.poses[p], p).toBeTruthy(); expect(draw(c.poses[p]!).length, p).toBeGreaterThan(20); }
      });
      it('has a scene for every moment and position, and every pose and prop it names', () => {
        for (const k of IN_HAND) for (const pos of POSITIONS) for (const v of ['', '.call', '.raise']) expect(lookup(c, `${k}.${pos}${v}`), `${k}.${pos}${v}`).toBeTruthy();
        for (const k of RESULTS) expect(lookup(c, k), k).toBeTruthy();
        const named = (list: string[] | undefined, where: string) => { for (const p of list ?? []) expect(c.poses[p], `${where}: pose ${p}`).toBeTruthy(); };
        for (const [key, s] of Object.entries(c.scenes)) {
          expect(s.shots.length, key).toBeGreaterThan(0);
          for (const sh of s.shots) {
            named(sh.who === 'star' || !sh.who ? sh.poses : undefined, key);
            for (const pr of sh.props ?? []) expect(c.props?.[pr.id], `${key}: prop ${pr.id}`).toBeTruthy();
          }
        }
        for (const [key, r] of Object.entries(c.reactions)) named(r.poses, `reaction ${key}`);
        for (const k of ['target', 'out', 'lost']) expect(c.reactions[k], `reaction ${k}`).toBeTruthy();
      });
      it('draws every pose without errors, as SVG fragments', () => {
        for (const [k, p] of Object.entries(c.poses)) { const s = draw(p); expect(s, k).not.toMatch(/<svg|NaN|undefined/); }
      });
    });
  }
  for (const [path, mod] of Object.entries(sets)) {
    it(`set ${folder(path)} draws its room, table, edge and piles`, () => {
      const s = mod.default;
      expect(s.id).toBe(folder(path));
      const o = { lite: false, felt: '#2c6b45', rim: '#3a2416' };
      for (const out of [s.back(o), s.table(o), s.edge(o), s.closeBg(o), s.pile(0), s.pile(1), s.pile(2), s.crown(), s.chips(5)]) expect(out).not.toMatch(/NaN|undefined/);
      expect(s.seats.length).toBeGreaterThanOrEqual(6);
    });
  }
});
