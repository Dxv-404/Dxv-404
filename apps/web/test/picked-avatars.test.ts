// Picked avatars (avatars/index.ts, table/render.ts avatar()): the generated set matches the approved board's data,
// every drawing is self-contained (its ids all "tpav-", every reference defined), copies get their own ids, and the
// table and winner card draw a picked avatar as a stable placeholder in its own style whatever the theme, while
// players without one keep exactly today's initials.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Engine, sha256hex } from '@tp/engine';
import { AVATAR_IDS, AVATAR_THEMES } from '@tp/protocol/avatars';
import { AVATARS, STYLE_LOOK } from '../src/avatars/set';
import { avatarMarkup, uniqueCopy, isAvatarId } from '../src/avatars';
import { THEMES, THEME_KEYS, avatar, renderTable, winnerCardHtml } from '../src/table/render';
import { summarize } from '../src/table/results';
import type { ScreenView } from '../src/net-table';

const board = JSON.parse(readFileSync(join(__dirname, '../../../tools/design/avatars/avatars.json'), 'utf8')) as Record<string, { id: string; name: string; kind: string; svg: string }[]>;
const idsIn = (svg: string) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
const refsIn = (svg: string) => [...svg.matchAll(/(?:url\(#|href="#)([^")]+)/g)].map((m) => m[1]!);

describe('the avatar set', () => {
  it('is the 72 approved avatars with their names, kinds and drawings (generated from avatars.json)', () => {
    expect(Object.keys(AVATARS)).toEqual([...AVATAR_IDS]);
    for (const k of AVATAR_THEMES) for (const a of board[k]!) {
      const got = AVATARS[a.id as keyof typeof AVATARS];
      expect(got, a.id).toBeTruthy();
      expect(got.theme).toBe(k);
      expect(got.name).toBe(a.name);
      expect(got.kind).toBe(a.kind);
      // the drawing is the board's, with only the documented clean-ups
      const clean = a.svg.replace(/<path [^>]*fill="url\(#nv\)"[^>]*\/>/, '').replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
      expect(got.svg).toBe(clean);
    }
  });
  it('each drawing is self-contained: no scripts or handlers, its ids all tpav-, every reference defined', () => {
    for (const id of AVATAR_IDS) {
      const svg = AVATARS[id].svg;
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 64 64"/);
      expect(svg).not.toMatch(/<script|\son\w+=|javascript:|<image|<foreignObject|href="http/i);
      const ids = idsIn(svg);
      for (const i of ids) expect(i, id).toMatch(/^tpav-/);
      for (const r of refsIn(svg)) expect(ids, `${id} refers to #${r}`).toContain(r);
    }
  });
  it('has the board\'s label and colours for each style', () => {
    expect(Object.keys(STYLE_LOOK)).toEqual([...AVATAR_THEMES]);
    expect(STYLE_LOOK.train.label).toBe('Night Train');
    for (const k of AVATAR_THEMES) for (const c of [STYLE_LOOK[k].bg, STYLE_LOOK[k].tx, STYLE_LOOK[k].acc]) expect(c).toMatch(/^#[0-9a-f]{3,6}$/i);
  });
});

describe('copies of an avatar', () => {
  it('each get their own ids, and keep their references pointing at their own definitions', () => {
    for (const id of AVATAR_IDS) {
      const a = uniqueCopy(AVATARS[id].svg), b = uniqueCopy(AVATARS[id].svg);
      const ia = idsIn(a), ib = idsIn(b);
      expect(ia.length).toBe(idsIn(AVATARS[id].svg).length);
      for (const x of ia) expect(ib).not.toContain(x);
      for (const r of refsIn(a)) expect(ia).toContain(r);
      expect(a.replace(/tpav\d+-/g, 'tpav-')).toBe(AVATARS[id].svg); // nothing else changed
    }
  });
  it('the screens\' markup is a placeholder that is the same every time (the table compares its markup)', () => {
    expect(avatarMarkup('train-night-owl')).toBe('<span class="tpav" data-av="train-night-owl" aria-hidden="true"></span>');
    expect(avatarMarkup('train-night-owl')).toBe(avatarMarkup('train-night-owl'));
  });
});

describe('avatar() with a pick', () => {
  it('a picked avatar is the same in every theme (its own style)', () => {
    for (const t of THEME_KEYS) expect(avatar(THEMES[t]!, 'p1', 'Dev', 'pixel-wizard')).toBe(avatarMarkup('pixel-wizard'));
  });
  it('no pick, null, or an id this build does not know: today\'s initials exactly', () => {
    for (const t of THEME_KEYS) for (const pick of [undefined, null, '', 'space-astronaut', 'tp:pixel-wizard', '<b>'])
      expect(avatar(THEMES[t]!, 'p1', 'Dev', pick as string | null | undefined)).toBe(avatar(THEMES[t]!, 'p1', 'Dev'));
    expect(isAvatarId('pixel-wizard')).toBe(true);
  });
});

describe('at the table', () => {
  const PEOPLE: [string, string | undefined][] = [['Dev', 'train-night-owl'], ['Riya', 'pixel-wizard'], ['Kabir', undefined], ['Zoya', 'edo-maiko'], ['Arjun', undefined]];
  const e = Engine.create('t', { startStack: 2000, turnTime: 20, maxPlayers: 15 }, 0);
  PEOPLE.forEach(([n], i) => { e.apply({ t: 'join', id: `p${i}`, name: n, now: 0 }); e.apply({ t: 'presence', pid: `p${i}`, connected: true, now: 0 }); });
  const view = (): ScreenView => {
    const v = e.viewFor('p0');
    v.players = v.players.map((p, i) => (PEOPLE[i]![1] ? { ...p, avatar: PEOPLE[i]![1]! } : p));
    return { ...v, isHost: true, hostId: 'p0', turnLeft: 0, turnTotal: 0, nextIn: 0 } as unknown as ScreenView;
  };
  const sizes: [number, number][] = [[320, 568], [390, 844], [844, 390], [820, 1180], [1440, 900]];

  it('every seat shows its own player\'s pick (or their initials), in all nine themes and on every screen', () => {
    e.apply({ t: 'start', seed: sha256hex('picked-1'), now: 1 });
    const v = view();
    for (const t of THEME_KEYS) for (const [W, H] of sizes) {
      const { html } = renderTable(v, t, W, H, { peek: false, bubble: null, code: 'QK7P', net: 'good' });
      const seats = [...html.matchAll(/<div class="seat[^"]*"[^>]*data-n="([^"]*)"[^>]*>(.*?)<div class="plate">/g)];
      expect(seats.length).toBe(PEOPLE.length - 1);
      for (const [, name, inner] of seats) {
        const pick = PEOPLE.find(([n]) => n === name)![1];
        const at = inner!.slice(inner!.indexOf('<div class="av">'));
        if (pick) expect(at, `${t} ${W}x${H} ${name}`).toContain(avatarMarkup(pick as never));
        else expect(at, `${t} ${name}`).not.toContain('tpav');
      }
      // your own line under your cards carries your pick too
      expect(html).toMatch(/<span class="hname"><span class="av hav"><span class="tpav" data-av="train-night-owl"/);
    }
  });

  it('the markup is the same from one draw to the next (only what changed is redrawn)', () => {
    const v = view();
    const a = renderTable(v, 'noir', 390, 844, { peek: false, bubble: null, code: 'QK7P', net: 'good' });
    const b = renderTable(v, 'noir', 390, 844, { peek: false, bubble: null, code: 'QK7P', net: 'good' });
    expect(b.parts).toEqual(a.parts);
  });

  it('without a pick, your line under your cards is as before (no avatar)', () => {
    const v = view();
    v.players = v.players.map((p) => ({ ...p, avatar: undefined }));
    const { html } = renderTable(v, 'classic', 390, 844, { peek: false, bubble: null, code: 'QK7P', net: 'good' });
    expect(html).not.toContain('hav');
    expect(html).not.toContain('tpav');
  });

  it('the winner card shows the winner\'s pick', () => {
    while (e.s.phase === 'hand' && e.s.hand?.toAct) { const pid = e.s.hand.toAct; e.apply({ t: 'act', pid, action: { type: pid === 'p1' ? 'call' : 'fold' }, now: 5 }); }
    const v = view();
    expect(v.hand?.results).toBeTruthy();
    const s = summarize(v.hand!.results!, (pid) => v.players.find((p) => p.id === pid)?.name ?? '');
    const w = s.winners[0]!;
    const pick = PEOPLE[Number(w.pid.slice(1))]![1];
    const html = winnerCardHtml(v, 'ivory', s, 0, 'phone');
    if (pick) expect(html).toContain(avatarMarkup(pick as never)); else expect(html).not.toContain('tpav');
  });
});
