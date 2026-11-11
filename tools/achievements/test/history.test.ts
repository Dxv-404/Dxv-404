// The history run on a made-up crew: three bot nights exported in the shape of export.sql.
import { describe, expect, it } from 'vitest';
import { Engine, sha256hex, type HandRecord } from '@tp/engine';
import { decide, rng, STRATEGIES } from '@tp/bots';
import { ACHIEVEMENT } from '@tp/achievements';
import { printable, recordBody, runHistory, type CrewExport, type ExportGame } from '../src/lib';

const acc = (i: number) => `00000000-0000-4000-8000-00000000000${i}`;
const NAMES = ['Asha', 'Bala', 'Chitra', 'Dinesh'];

/** One night of `n` hands between four accounts (seat keys are their account ids, as at a crew table). */
function nightOf(g: number, n: number): { game: ExportGame; hands: CrewExport['hands'] } {
  const r = rng(g * 7 + 1);
  const t0 = Date.UTC(2026, 10, 1 + g * 7, 15, 0);
  const e = Engine.create(`T${g}`, { startStack: 3000, turnTime: 0 }, t0);
  NAMES.forEach((name, i) => e.apply({ t: 'join', id: acc(i + 1), name, now: t0 }));
  const hands: CrewExport['hands'] = [];
  let now = t0;
  while (hands.length < n) {
    for (const p of e.s.players) if (p.stack === 0) e.apply({ t: 'rebuy', pid: p.id, now });
    e.apply({ t: 'start', seed: sha256hex(`g${g}h${hands.length}`), now: (now += 20_000) });
    let guard = 0;
    while (e.s.phase === 'hand' && guard++ < 300) {
      const pid = e.s.hand!.toAct!;
      e.apply({ t: 'act', pid, action: decide(e.viewFor(pid), STRATEGIES[Number(pid.slice(-1)) % 4]!, r)!, now: (now += 2000) });
    }
    hands.push({ game: `game-${g}`, no: e.lastHandRecord!.handNo, record: JSON.parse(JSON.stringify(e.lastHandRecord)) as HandRecord });
  }
  const players = e.s.players.map((p) => ({ key: p.id, account: p.id, name: p.name, place: null, net: p.stack - p.buyins, buyins: p.buyins, hands: n }));
  return { game: { id: `game-${g}`, table: `T${g}`, started: new Date(t0).toISOString(), ended: new Date(now).toISOString(), start_stack: 3000, big_blind: 20, casual: false, season: 's1', host: acc(1), players }, hands };
}

describe('the history run', () => {
  const nights = [0, 1, 2, 3].map((g) => nightOf(g, 40));
  const x: CrewExport = {
    v: 1, crew: { id: 'c1', name: 'Test crew' },
    members: NAMES.map((name, i) => ({ account: acc(i + 1), name, joined: '2026-10-01T00:00:00+00:00' })),
    seasons: [{ id: 's1', name: 'Season 1', ends: '2026-11-30T18:30:00+00:00', closed: '2026-11-30T18:30:00+00:00', ranks: NAMES.map((_, i) => ({ account: acc(i + 1), rank: i + 1 })) }],
    games: nights.map((n) => n.game), hands: nights.flatMap((n) => n.hands).reverse(), // any order in the file
  };
  const r = runHistory(x);
  const of = (i: number) => r.players.find((p) => p.pid === acc(i))!;

  it('goes through every game and hand, and counts each player\'s hands, nights and bluffs', () => {
    expect(r).toMatchObject({ crew: 'Test crew', games: 4, hands: 160, skipped: [] });
    expect(r.players).toHaveLength(4);
    for (const p of r.players) { expect(p.nights).toBe(4); expect(p.hands).toBeGreaterThan(100); expect(p.member).toBe(true); }
    expect(r.players.reduce((s, p) => s + p.hands, 0)).toBe(x.hands.reduce((s, h) => s + Engine.replay(h.record.before, h.record.inputs).s.hand!.order.length, 0));
  });
  it('gives each achievement once per player, with real ids, the game it came from and the first time it happened', () => {
    for (const p of r.players) {
      const keys = p.earned.map((e) => `${e.id}:${e.tier ?? 0}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const e of p.earned) { expect(ACHIEVEMENT[e.id]).toBeDefined(); expect(e.pid).toBe(p.pid); if (e.game) expect(e.game).toMatch(/^game-\d$/); }
      expect(p.earned.map((e) => e.at)).toEqual(p.earned.map((e) => e.at).sort((a, b) => a - b));
    }
  });
  it('adds the night and history achievements: everyone played four weeks running with the whole crew, the season is over', () => {
    for (let i = 1; i <= 4; i++) {
      const ids = of(i).earned.map((e) => e.id);
      expect(ids).toContain('every_week');
      expect(ids).toContain('full_house_party');
      expect(ids).toContain('iron_focus');
      expect(ids).toContain('regular');
      expect(ids.includes('podium')).toBe(i <= 3);
      expect(ids.includes('champion')).toBe(i === 1);
    }
    expect(of(1).earned.find((e) => e.id === 'regular')).toMatchObject({ tier: 1, reveal: 'now' });
  });
  it('a casual game counts for nothing, and a hand that does not replay is left out and named', () => {
    const y: CrewExport = JSON.parse(JSON.stringify(x)) as CrewExport;
    y.games[0]!.casual = true;
    const broken = y.hands.find((h) => h.game === 'game-1' && h.no === 3)!;
    broken.record.inputs = broken.record.inputs.slice(0, 2);
    const s = runHistory(y);
    expect(s.skipped).toHaveLength(1);
    expect(s.skipped[0]).toMatchObject({ game: 'game-1', no: 3 });
    expect(s.players.every((p) => p.nights === 3)).toBe(true);
    expect(s.players.every((p) => !p.earned.some((e) => e.game === 'game-0'))).toBe(true);
  });
  it('makes the one call body the database function takes: accounts only, tiers, times, bluff counts', () => {
    const guest: CrewExport = JSON.parse(JSON.stringify(x)) as CrewExport;
    for (const g of guest.games) { const p = g.players!.find((q) => q.key === acc(4))!; p.account = null; p.key = 'guest-7'; }
    for (const h of guest.hands) h.record = JSON.parse(JSON.stringify(h.record).replaceAll(acc(4), 'guest-7')) as typeof h.record;
    guest.members = guest.members.filter((m) => m.account !== acc(4));
    const rep = runHistory(guest);
    const body = recordBody(rep, 'history:c1') as { ref: string; earned: { account: string; id: string; tier: number; at: string; reveal: string }[]; counts: { account: string; key: string; add: number }[] };
    expect(body.ref).toBe('history:c1');
    expect(body.earned.length).toBe(rep.players.filter((p) => p.pid !== 'guest-7').reduce((s, p) => s + p.earned.length, 0));
    for (const e of body.earned) { expect(e.account).toMatch(/^0{8}-/); expect(Date.parse(e.at)).toBeGreaterThan(0); expect(['now', 'night']).toContain(e.reveal); }
    expect(body.earned.find((e) => e.id === 'regular')!.tier).toBe(1);
    for (const c of body.counts) expect(c).toMatchObject({ key: 'bluffs' });
    expect(rep.players.find((p) => p.pid === 'guest-7')).toMatchObject({ account: false, member: false, name: 'Dinesh' });
  });
  it('prints one block per player', () => {
    const text = printable(r);
    expect(text).toContain('Test crew: 4 games, 160 hands');
    for (const n of NAMES) expect(text).toMatch(new RegExp(`${n}: \\d+ earned`));
    expect(text).toContain('Regular (100)');
    expect(text).toContain('(held for the night summary)');
  });
});
