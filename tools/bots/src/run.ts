// Runs whole bot games straight on the engine (no network): used by the 1-million-hand gate check.
import { Engine, type Input } from '@tp/engine';
import { decide, rng, STRATEGIES, type Strategy } from './index';

export interface GameReport { hands: number; showdowns: number; sidePots: number; twice: number; chipErrors: number; stuck: number; replayOk: boolean }

const seedHex = (r: () => number) => Array.from({ length: 64 }, () => Math.floor(r() * 16).toString(16)).join('');

/** One table of bots for `hands` hands. Checks chips after every input and replays the whole game at the end. */
export function playGame(opts: { seed: number; players: number; hands: number; strategies?: Strategy[]; config?: Parameters<typeof Engine.create>[1]; replay?: boolean }): GameReport {
  const r = rng(opts.seed);
  const e = Engine.create(`bots-${opts.seed}`, { turnTime: 20, startStack: 1000, ...opts.config }, 0);
  const start = e.snapshot(); // before any input, so a replay of every input rebuilds the game
  const strat = new Map<string, Strategy>();
  for (let i = 0; i < opts.players; i++) {
    e.apply({ t: 'join', id: `b${i}`, name: `Bot ${i}`, now: 0 });
    strat.set(`b${i}`, (opts.strategies ?? STRATEGIES)[i % (opts.strategies ?? STRATEGIES).length]!);
  }
  let now = 0, hands = 0, showdowns = 0, sidePots = 0, twice = 0, chipErrors = 0, stuck = 0;
  const chips = () => e.s.players.concat(e.s.departed ?? []).reduce((a, p) => a + p.stack, 0) + (e.s.phase === 'hand' ? e.potTotal() : 0);
  const bought = () => e.s.players.concat(e.s.departed ?? []).reduce((a, p) => a + p.buyins, 0);
  const send = (i: Input) => { const res = e.apply(i); if (chips() !== bought()) chipErrors++; return res; };
  while (hands < opts.hands) {
    now += 1500;
    for (const p of e.s.players) if (p.stack === 0) send({ t: 'rebuy', pid: p.id, now });
    if (send({ t: 'start', seed: seedHex(r), now }).error) break;
    hands++;
    let guard = 0;
    while (e.s.phase === 'hand') {
      if (++guard > 500) { stuck++; break; }
      now += Math.floor(r() * 4000);
      const h = e.s.hand!;
      if (h.vote) { for (const pid of h.vote.pids) if (e.s.hand?.vote) send({ t: 'vote', pid, yes: r() < 0.6, now }); continue; }
      if (r() < 0.02) { now += 120_000; send({ t: 'tick', now }); continue; } // someone runs out of time
      const pid = h.toAct!;
      const action = decide(e.viewFor(pid), strat.get(pid)!, r)!;
      send({ t: 'act', pid, action, now });
    }
    const res = e.s.hand?.results;
    if (res?.showdown) showdowns++;
    if (res && new Set(res.pots.map((p) => p.label.replace(/ \(.*\)$/, ''))).size > 1) sidePots++;
    if (res?.twice) twice++;
  }
  let replayOk = true;
  if (opts.replay !== false) replayOk = JSON.stringify(Engine.replay(start, e.inputs).s) === JSON.stringify(e.s);
  return { hands, showdowns, sidePots, twice, chipErrors, stuck, replayOk };
}
