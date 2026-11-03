import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AVATAR_IDS, AVATAR_THEMES, AVATAR_PATTERN, isAvatarId, avatarTheme, avatarFromStored, parseClient, PROTOCOL_VERSION,
} from '../src/index';

const json = JSON.parse(readFileSync(join(__dirname, '../../../tools/design/avatars/avatars.json'), 'utf8')) as Record<string, { id: string }[]>;
const hello = (extra: Record<string, unknown>) => ({ t: 'hello', v: PROTOCOL_VERSION, table: 'QK7P', player: 'u_123', lastSeq: 0, name: 'Riya', ...extra });

describe('avatar ids', () => {
  it('are the 72 approved avatars, 8 per theme in the board order, generated from avatars.json', () => {
    expect(AVATAR_IDS).toHaveLength(72);
    expect(Object.keys(json)).toEqual([...AVATAR_THEMES]);
    expect([...AVATAR_IDS]).toEqual(Object.values(json).flat().map((a) => a.id));
    for (const k of AVATAR_THEMES) expect(AVATAR_IDS.filter((i) => avatarTheme(i) === k)).toHaveLength(8);
    expect(new Set(AVATAR_IDS).size).toBe(72);
  });
  it('every id has the shape the database and the wire accept', () => {
    for (const i of AVATAR_IDS) {
      expect(i).toMatch(AVATAR_PATTERN);
      expect(i.length).toBeLessThanOrEqual(40);
      expect(isAvatarId(i)).toBe(true);
    }
  });
  it('knows only its own ids', () => {
    for (const x of [null, undefined, 3, {}, '', 'train', 'train-', 'tp:train-night-owl', 'Train-Night-Owl', 'train-night-owl ', 'classic-nobody', '__proto__', 'constructor'])
      expect(isAvatarId(x)).toBe(false);
  });
  it('reads the stored account value ("tp:<id>"); anything else is initials', () => {
    expect(avatarFromStored('tp:train-night-owl')).toBe('train-night-owl');
    expect(avatarFromStored('tp:pixel-wizard')).toBe('pixel-wizard');
    for (const x of [null, undefined, '', 'train-night-owl', 'tp:', 'tp:nope-nope', 'https://example.com/me.png', 'tp:TRAIN-NIGHT-OWL', 42])
      expect(avatarFromStored(x)).toBeNull();
  });
});

describe('hello avatar field', () => {
  it('is optional: an older app says nothing', () => {
    const r = parseClient(JSON.stringify(hello({})));
    expect(r.ok).toBe(true);
    if (r.ok && r.msg.t === 'hello') expect(r.msg.avatar).toBeUndefined();
  });
  it('takes an avatar id or null (initials)', () => {
    for (const av of ['train-night-owl', 'edo-beckoning-cat', null]) {
      const r = parseClient(JSON.stringify(hello({ avatar: av })));
      expect(r.ok, String(av)).toBe(true);
      if (r.ok && r.msg.t === 'hello') expect(r.msg.avatar).toBe(av);
    }
  });
  it('lets a newer app\'s avatar through by shape (the table shows unknown ones as initials)', () => {
    expect(parseClient(JSON.stringify(hello({ avatar: 'space-astronaut' }))).ok).toBe(true);
  });
  it('refuses anything that is not an avatar id', () => {
    for (const av of ['', 'x', 'tp:train-night-owl', 'Train-Night-Owl', '<svg onload=alert(1)>', '../../etc', 'a-b c', 'javascript:alert(1)', `classic-${'a'.repeat(40)}`, 7, true, {}, ['train-night-owl']]) {
      const r = parseClient(JSON.stringify(hello({ avatar: av })));
      expect(r.ok, JSON.stringify(av)).toBe(false);
    }
  });
});
