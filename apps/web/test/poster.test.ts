import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { hasPoster, posterUrl, stageSvg, POSTERS } from '../src/profile/poster';
import { isAvatarId } from '../src/avatars';

describe('the card portrait', () => {
  it('every poster is a real avatar and its page has been built', () => {
    for (const id of POSTERS) {
      expect(isAvatarId(id), id).toBe(true);
      expect(existsSync(new URL(`../public/tp/posters/${id}.html`, import.meta.url)), id).toBe(true);
    }
  });
  it('knows which characters have one', () => {
    expect(hasPoster('ink-sensei')).toBe(true);
    expect(hasPoster('train-night-owl')).toBe(false);
    expect(hasPoster(null)).toBe(false);
  });
  it('the motion level goes in the address', () => {
    expect(posterUrl('pixel-knight', 'full')).toBe('/tp/posters/pixel-knight.html');
    expect(posterUrl('pixel-knight', 'calm')).toBe('/tp/posters/pixel-knight.html#calm');
    expect(posterUrl('pixel-knight', 'off')).toBe('/tp/posters/pixel-knight.html#still');
  });
  it('the stage has a chair only when nobody is chosen', () => {
    expect(stageSvg(true)).toContain('pf-chair');
    expect(stageSvg(false)).not.toContain('pf-chair');
  });
});
