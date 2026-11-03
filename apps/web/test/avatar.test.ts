// Avatar letters (table/render.ts avatar()): every one of a theme's 14 looks shows the letters of the name it is
// drawn for, in the theme's own lettering (design gen/classic.py, minimal.py, velvet.py): classic `ini` "RI",
// noir `mono` "Ri", ivory `emb` and velvet `cam` "R"; the five drawn themes show a face and no letters. The table,
// the winner card, the crews screens, the shell and Profile all draw avatars with avatar().
import { describe, expect, it } from 'vitest';
import { Engine, sha256hex } from '@tp/engine';
import { THEMES, THEME_KEYS, avatar, avatarLetters, renderTable } from '../src/table/render';
import type { ScreenView } from '../src/net-table';

const NAMES = ['Riya', 'Meera', 'Dev', 'Kunal Shah', 'a', 'Zoë', 'Ñandu', 'O\'Brien & co', '  Arjun   Rao  ', 'x<y'];
const STYLE: Record<string, string> = { classic: 'ini', noir: 'mono', ivory: 'emb', velvet: 'cam', cyber: '', ink: '', pixel: '', train: '', edo: '' };
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
/** The letters an avatar's markup shows (its text outside tags). */
const shown = (html: string) => decode(html.replace(/<[^>]*>/g, '')).trim();
const want = (theme: string, name: string): string => {
  const w = name.trim().split(/\s+/);
  const two = (w.length > 1 ? [...w[0]!][0]! + [...w[1]!][0]! : [...w[0]!].slice(0, 2).join('')).toUpperCase();
  const st = STYLE[theme]!;
  return st === 'ini' ? two : st === 'mono' ? two[0]! + two.slice(1).toLowerCase() : st ? two[0]! : '';
};

describe('avatar letters', () => {
  it('belong to the name, in every theme and every one of its looks', () => {
    for (const t of THEME_KEYS) {
      const looks = new Set<string | number>();
      for (let i = 0; i < 400; i++) {
        const id = `player-${i}`;
        const name = NAMES[i % NAMES.length]!;
        const html = avatar(THEMES[t]!, id, name);
        const key = (x: string) => x.replace(/>[^<]*</g, '><');
        looks.add(THEMES[t]!.avatars.findIndex((a) => key(a) === key(html)) >= 0 ? key(html) : -1);
        expect(shown(html), `${t} ${id} ${name}`).toBe(want(t, name));
      }
      expect(looks.has(-1), t).toBe(false);
      expect(looks.size, `${t}: every look seen`).toBe(new Set(THEMES[t]!.avatars.map((a) => a.replace(/>[^<]*</g, '><'))).size);
    }
  });

  it('each lettered style', () => {
    expect(avatarLetters('ini', 'Riya')).toBe('RI');
    expect(avatarLetters('mono', 'Riya')).toBe('Ri');
    expect(avatarLetters('emb', 'Riya')).toBe('R');
    expect(avatarLetters('cam', 'Kunal Shah')).toBe('K');
    expect(avatarLetters('ini', 'Kunal Shah')).toBe('KS');
    expect(avatarLetters('mono', 'Kunal Shah')).toBe('Ks');
  });

  it('are escaped', () => {
    expect(avatar(THEMES.classic!, 'p', '<b')).not.toContain('<b<');
  });
});

describe('avatar letters at the table', () => {
  const PEOPLE = ['Dev', 'Riya', 'Arjun', 'Meera', 'Kabir', 'Zoya', 'Kunal Shah'];
  const e = Engine.create('t', { startStack: 2000, turnTime: 20, maxPlayers: 15 }, 0);
  PEOPLE.forEach((n, i) => { e.apply({ t: 'join', id: `p${i}`, name: n, now: 0 }); e.apply({ t: 'presence', pid: `p${i}`, connected: true, now: 0 }); });

  it('every seat shows its own player\'s letters, hand after hand, in all nine themes', () => {
    for (let hand = 0; hand < 3; hand++) {
      e.apply({ t: 'start', seed: sha256hex(`avatars-${hand}`), now: 1 + hand });
      const v = { ...e.viewFor('p0'), isHost: true, hostId: 'p0', turnLeft: 0, turnTotal: 0, nextIn: 0 } as unknown as ScreenView;
      for (const t of THEME_KEYS) {
        const { html } = renderTable(v, t, 390, 844, { peek: false, bubble: null, code: 'QK7P', net: 'good' });
        const seats = [...html.matchAll(/<div class="seat[^"]*"[^>]*data-n="([^"]*)"[^>]*>(.*?)<div class="plate">/g)];
        expect(seats.length, t).toBe(PEOPLE.length - 1);
        for (const [, name, inner] of seats) {
          const av = inner!.slice(inner!.indexOf('<div class="av">'));
          expect(shown(av.replace(/<span class="status[^]*$/, '')), `${t} hand ${hand} ${name}`).toBe(want(t, decode(name!)));
        }
      }
      while (e.s.phase === 'hand' && e.s.hand?.toAct) { const pid = e.s.hand.toAct; e.apply({ t: 'act', pid, action: { type: 'fold' }, now: 5 + hand }); }
    }
  });
});
