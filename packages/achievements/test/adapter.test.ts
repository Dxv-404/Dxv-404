// From a stored hand record to the checker's facts: a real record (a crew game's hand as the database
// keeps it in private.hand_records; ids and names replaced) and a few hundred hands played by bots.
import { describe, expect, it } from 'vitest';
import { Engine, sha256hex, type HandRecord } from '@tp/engine';
import { decide, rng, STRATEGIES } from '@tp/bots';
import { factsFromRecord, type HandFacts } from '../src/facts';
import { checkHand } from '../src/hand';
import { checkNight, standings } from '../src/night';
import { ACHIEVEMENT } from '../src/defs';
import stored from './fixtures/hand-record.json';

const P = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe('a stored hand record', () => {
  const f = factsFromRecord(stored as unknown as HandRecord);
  it('gives everyone\'s cards, the board and what each player did', () => {
    expect(f).toMatchObject({ game: 'ANGU', handNo: 18, bb: 100, endedAt: 1794021077399, board: ['Ts', '7h', '7c', '3c', '3h'], board2: null, pot: 300 });
    expect(f.order).toHaveLength(4);
    expect(f.hole[P(4)]!.slice().sort()).toEqual(['3d', '7d']); // the winner's full house, from the replayed deal
    for (const p of f.order) expect(f.hole[p]).toHaveLength(2);
    expect(new Set(Object.values(f.hole).flat().concat(f.board)).size).toBe(13); // no card twice
    expect(f.actions.map((a) => `${a.street} ${a.pid.slice(-1)} ${a.kind} ${a.put}`)).toEqual([
      'preflop 1 fold 0', 'preflop 2 call 100', 'preflop 3 call 50',
      'flop 3 check 0', 'flop 2 check 0', 'turn 3 check 0', 'turn 2 check 0', 'river 3 check 0', 'river 2 check 0',
    ]);
    expect(f.actions[1]).toMatchObject({ toCall: 100, allIn: false, auto: false, board: 0 });
    expect(f.actions.at(-1)!.board).toBe(5);
  });
  it('gives the showdown, the pay-out and the stacks', () => {
    expect(f.showdown.slice().sort()).toEqual([P(2), P(3), P(4)]);
    expect(f.awards).toEqual({ [P(4)]: 300 });
    expect(f.stackBefore).toEqual({ [P(1)]: 12250, [P(2)]: 5450, [P(3)]: 2200, [P(4)]: 100 });
    expect(f.stackAfter).toEqual({ [P(1)]: 12250, [P(2)]: 5350, [P(3)]: 2100, [P(4)]: 300 });
    expect(f.buyins[P(4)]).toBe(5000);
  });
  it('runs through the checker: tripling one big blind is no Double Up, and nothing else was earned', () => {
    expect(checkHand(f)).toEqual([]);
  });
  it('carries the phone\'s peek counts when the caller has them', () => {
    expect(factsFromRecord(stored as unknown as HandRecord, { peeks: { [P(1)]: 21 } }).peeks).toEqual({ [P(1)]: 21 });
  });
  it('refuses a record that does not replay', () => {
    const bad = JSON.parse(JSON.stringify(stored)) as HandRecord;
    bad.inputs.splice(1, 1);
    expect(() => factsFromRecord(bad)).toThrow(/does not replay|did not finish/);
  });
});

/** Bots play n hands at 6 seats (rebuying when broke, with a turn clock that sometimes runs out). */
function play(n: number, seed: number): HandRecord[] {
  const r = rng(seed);
  const e = Engine.create('g', { startStack: 2000, turnTime: 20, timeBank: 0, dealItTwice: true }, 0);
  for (let i = 0; i < 6; i++) e.apply({ t: 'join', id: `p${i}`, name: `P${i}`, now: 0 });
  const out: HandRecord[] = [];
  let now = 1000;
  while (out.length < n) {
    for (const p of e.s.players) { if (p.stack === 0) e.apply({ t: 'rebuy', pid: p.id, now }); if (p.sittingOut) e.apply({ t: 'sitIn', pid: p.id, postNow: true, now }); }
    e.apply({ t: 'start', seed: sha256hex(`deal-${seed}-${out.length}`), now: (now += 1000) });
    let guard = 0;
    while (e.s.phase === 'hand' && guard++ < 300) {
      const h = e.s.hand!;
      if (h.vote) { for (const pid of h.vote.pids) if (e.s.hand?.vote) e.apply({ t: 'vote', pid, yes: r() < 0.5, now }); continue; }
      const pid = h.toAct!;
      if (r() < 0.03) { e.apply({ t: 'tick', now: (now += 30_000) }); continue; } // the clock runs out
      e.apply({ t: 'act', pid, action: decide(e.viewFor(pid), STRATEGIES[Number(pid.slice(1)) % 4]!, r)!, now: (now += 1000) });
    }
    out.push(e.lastHandRecord!);
  }
  return out;
}

describe('400 hands played by bots', () => {
  const recs = play(400, 11);
  const facts: HandFacts[] = recs.map((r) => factsFromRecord(JSON.parse(JSON.stringify(r)) as HandRecord));
  it('the facts agree with the engine\'s own results', () => {
    let timeouts = 0, twice = 0, allIns = 0;
    facts.forEach((f, i) => {
      const rec = recs[i]!;
      const paid: Record<string, number> = {};
      for (const pot of rec.results.pots) for (const a of pot.awards) paid[a.pid] = (paid[a.pid] ?? 0) + a.amount;
      expect(f.awards).toEqual(paid);
      expect(f.showdown.length > 0).toBe(rec.results.showdown);
      expect(f.board).toEqual(rec.board);
      expect(f.board2).toEqual(rec.board2);
      // chips only move between the players dealt in
      expect(f.order.reduce((s, p) => s + f.stackAfter[p]! - f.stackBefore[p]!, 0)).toBe(0);
      for (const a of f.actions) {
        expect(f.order).toContain(a.pid);
        if (a.kind === 'call') expect(a.put).toBe(a.toCall);
        if (a.kind === 'fold' || a.kind === 'check') expect(a.put).toBe(0);
        if (a.kind === 'check') expect(a.toCall).toBe(0);
        if (a.auto) timeouts++;
        if (a.allIn) allIns++;
      }
      if (f.board2) twice++;
    });
    expect(timeouts).toBeGreaterThan(10);
    expect(allIns).toBeGreaterThan(10);
    expect(twice).toBeGreaterThan(0);
  });
  it('the checker runs over the whole night, hand by hand and at the end', () => {
    const seen: Record<string, number> = {};
    const owned: Record<string, string[]> = {};
    facts.forEach((f, i) => {
      for (const e of checkHand(f, { hands: facts.slice(0, i), owned })) {
        expect(ACHIEVEMENT[e.id]).toBeDefined();
        expect(f.order).toContain(e.pid);
        const key = e.tier ? `${e.id}:${e.tier}` : e.id;
        expect(owned[e.pid] ?? []).not.toContain(key); // never given twice
        (owned[e.pid] ??= []).push(key);
        seen[e.id] = (seen[e.id] ?? 0) + 1;
      }
    });
    const end = checkNight({ game: 'g', startStack: 2000, endedAt: facts.at(-1)!.endedAt, hands: facts, players: standings(facts) }, owned);
    for (const e of end) { expect(ACHIEVEMENT[e.id]!.when).toBe('night'); expect(e.reveal).toBe('night'); }
    // bots that shove a lot make these certain over 400 hands
    for (const id of ['double_up', 'set_mining', 'regular', 'gone_fishing']) expect(seen[id] ?? 0).toBeGreaterThan(0);
    expect(standings(facts)).toHaveLength(6);
  });
});
