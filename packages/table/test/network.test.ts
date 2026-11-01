// Phase 2 gate: bots play through the real phone client and the real table room over a simulated bad
// network (late, lost and cut-off messages), and the table must stay correct.
import { describe, expect, it } from 'vitest';
import { Engine, type View } from '@tp/engine';
import { decide, rng, STRATEGIES, type Strategy } from '@tp/bots';
import { newSeatToken } from '../src/room';
import type { TableClient } from '../src/client';
import { World, SimSocket, type NetConfig } from './sim';

interface Bot { pid: string; client: TableClient; strategy: Strategy; busy: string | null; acted: number; errors: string[] }

function chips(e: Engine): number {
  return e.s.players.reduce((a, p) => a + p.stack, 0) + (e.s.phase === 'hand' ? e.potTotal() : 0);
}
const bought = (e: Engine) => e.s.players.reduce((a, p) => a + p.buyins, 0);

/** Seat n bots that play from their own view, think for a moment, rebuy when broke and vote when asked. */
function seatBots(w: World, n: number, seed: number, settings = {}) {
  const r = rng(seed);
  const bots: Bot[] = [];
  for (let i = 0; i < n; i++) {
    const pid = `bot${i}`;
    const bot: Bot = { pid, strategy: STRATEGIES[i % STRATEGIES.length]!, busy: null, acted: 0, errors: [], client: null as unknown as TableClient };
    const think = (v: View) => {
      const h = v.hand, me = v.players.find((p) => p.id === pid);
      if (!me) return;
      if (v.phase !== 'hand' && me.stack === 0 && v.cfg.rebuys) { if (bot.busy !== `rebuy${v.handNo}`) { bot.busy = `rebuy${v.handNo}`; bot.client.send({ t: 'rebuy' }); } return; }
      if (!h || v.phase !== 'hand') return;
      if (h.vote && h.vote.pids.includes(pid) && !h.vote.voted.includes(pid)) {
        const key = `vote${v.handNo}`;
        if (bot.busy === key) return;
        bot.busy = key;
        w.at(w.now + 100 + r() * 500, () => bot.client.send({ t: 'vote', handNo: v.handNo, yes: r() < 0.5 }));
        return;
      }
      if (h.toAct !== pid || !v.legal) return;
      // one decision per turn: the turn is identified by the hand, street and what this seat has put in
      const key = `${v.handNo}:${h.street}:${h.currentBet}:${h.ps[pid]!.total}:${h.board.length}`;
      if (bot.busy === key) return;
      bot.busy = key;
      w.at(w.now + 150 + r() * 900, () => {
        const cur = bot.client.view;
        if (!cur || cur.hand?.toAct !== pid || cur.handNo !== v.handNo) return; // things moved on (timer, reconnect)
        const a = decide(cur, bot.strategy, r);
        if (a) { bot.acted++; bot.client.act(a); }
      });
    };
    bot.client = w.client({
      player: pid, token: newSeatToken(), name: `Bot ${i}`, ...(i === 0 ? { settings: { startStack: 1000, turnTime: 20, timeBank: 60, dealItTwice: true, ...settings } } : {}),
      onView: (v) => think(v),
      onStatus: (s) => { if (s === 'live') bot.busy = null; },
      onAck: (_id, ok, err) => { if (!ok && err) bot.errors.push(err); },
    });
    bots.push(bot);
  }
  return bots;
}

const hostOf = (w: World, bots: Bot[]) => bots.find((b) => b.pid === w.room.host)!;

function playHands(w: World, bots: Bot[], hands: number, maxSimMs: number) {
  // the host deals once everyone has joined
  w.run(w.now + 5000, () => w.room.engine?.s.players.length === bots.length && bots.every((b) => b.client.status === 'live'));
  hostOf(w, bots).client.send({ t: 'host', cmd: 'deal' });
  let lastHand = 0, lastSeq = w.room.seq, lastChange = w.now, stuck = 0, drift = 0, longest = 0;
  const end = w.now + maxSimMs;
  while (w.now < end && (w.room.engine?.s.handNo ?? 0) < hands) {
    w.run(w.now + 10_000, () => w.room.engine!.s.handNo !== lastHand);
    const e = w.room.engine!;
    if (e.s.handNo !== lastHand) lastHand = e.s.handNo;
    if (w.room.seq !== lastSeq) { longest = Math.max(longest, w.now - lastChange); lastSeq = w.room.seq; lastChange = w.now; }
    // stuck = nothing at all happens at the table for longer than the longest possible turn
    // (20 s + 60 s bank + disconnect grace), plus room for the network
    if (w.now - lastChange > 150_000) {
      stuck++;
      console.log('STUCK', JSON.stringify({ hand: e.s.handNo, phase: e.s.phase, paused: e.s.paused, running: w.room.running, nextDealAt: w.room.nextDealAt && w.room.nextDealAt - w.now, wake: w.wakeAt && w.wakeAt - w.now, toAct: e.s.hand?.toAct, deadline: e.deadline() && e.deadline()! - w.now, vote: e.s.hand?.vote, canStart: e.canStartHand(), clients: bots.map((b) => [b.pid, b.client.status, b.client.seq, b.client.pending]), seq: w.room.seq, conns: w.room.connectionCount, players: e.s.players.map((p) => [p.id, p.stack, p.connected, p.sittingOut, p.away, p.busted, p.rebuysUsed]) }));
      break;
    }
    if (chips(e) !== bought(e)) drift++;
  }
  return { stuck, drift, longest };
}

describe('Phase 2 gate: bots over a bad network', () => {
  const net: NetConfig = { latency: [20, 250], loss: 0.1, dropEveryMs: 90_000 };

  it('9 bots play 1,000 hands with 10% message loss and random drops: no stuck hand, no chip drift', () => {
    const w = new World(net, Number(process.env.SIM_SEED ?? 2026), { handPauseMs: 500 });
    const bots = seatBots(w, 9, 7);
    const { stuck, drift, longest } = playHands(w, bots, 1000, 40 * 3600_000);
    const e = w.room.engine!;
    expect(stuck).toBe(0);
    expect(drift).toBe(0);
    expect(e.s.handNo).toBeGreaterThanOrEqual(1000);
    expect(chips(e)).toBe(bought(e));
    expect(w.hands.length).toBeGreaterThanOrEqual(999);
    // every server hand log replays identically in the engine
    for (const rec of w.hands) {
      const re = Engine.replay(rec.before, rec.inputs);
      expect(re.s.hand!.results).toEqual(rec.results);
    }
    // the network really was bad, and the bots really played (not just the turn timer)
    const acted = bots.reduce((a, b) => a + b.acted, 0);
    const autos = w.hands.reduce((a, h) => a + h.inputs.filter((i) => i.t === 'tick').length, 0);
    const presence = w.hands.reduce((a, h) => a + h.inputs.filter((i) => i.t === 'presence').length, 0);
    console.log(`hands ${e.s.handNo}, bot actions ${acted}, timer actions ${autos}, presence changes during hands ${presence}, longest quiet ${(longest / 1000).toFixed(0)} s, sim time ${((w.now - 1_700_000_000_000) / 3600_000).toFixed(1)} h, saves ${w.saves}`);
    expect(acted).toBeGreaterThan(autos * 5);
    expect(presence).toBeGreaterThan(50);
    // the host ends the night; within a minute every phone shows exactly the server's final table
    w.net.dropEveryMs = undefined;
    hostOf(w, bots).client.send({ t: 'host', cmd: 'end' });
    if (process.env.SIM_TRACE) {
      const orig = SimSocket.prototype.sendDown, up = SimSocket.prototype.send;
      SimSocket.prototype.sendDown = function (this: SimSocket, t: string) { if (this.player === process.env.SIM_TRACE) console.log(w.now % 1e6, 'DOWN', this.dead, t.slice(0, 100)); return orig.call(this, t); };
      SimSocket.prototype.send = function (this: SimSocket, t: string) { if (this.player === process.env.SIM_TRACE) console.log(w.now % 1e6, 'UP', this.open, t.slice(0, 100)); return up.call(this, t); };
    }
    w.run(w.now + 60_000, () => w.room.engine!.s.phase === 'ended' && bots.every((b) => b.client.status === 'live' && b.client.seq === w.room.seq));
    expect(w.room.engine!.s.phase).toBe('ended');
    const lag = bots.filter((b) => b.client.seq !== w.room.seq);
    if (lag.length) console.log('LAG', w.room.seq, lag.map((b) => [b.pid, b.client.status, b.client.seq, b.client.pending, [...w.sockets].filter((s) => s.player === b.pid).map((s) => [s.open, s.dead])]));
    for (const b of bots) {
      expect(b.client.seq).toBe(w.room.seq);
      expect(b.client.view!.players.map((p) => p.stack)).toEqual(e.s.players.map((p) => p.stack));
    }
  }, 300_000);

  it('a phone that is gone for 60 s mid-turn comes back to the same seat, cards and turn', () => {
    const w = new World({ latency: [20, 120], loss: 0 }, 11, { handPauseMs: 500 });
    const bots = seatBots(w, 4, 3);
    w.run(w.now + 5000, () => w.room.engine?.s.players.length === 4 && bots.every((b) => b.client.status === 'live'));
    hostOf(w, bots).client.send({ t: 'host', cmd: 'deal' });
    w.run(w.now + 5000, () => w.room.engine?.s.phase === 'hand' && bots.every((b) => b.client.seq === w.room.seq));
    const e = w.room.engine!;
    const pid = e.s.hand!.toAct!;
    const bot = bots.find((b) => b.pid === pid)!;
    const chair = e.player(pid)!.chair;
    const cards = bot.client.view!.hand!.ps[pid]!.cards;
    // the phone loses signal right as its turn comes up (before the bot answers)
    w.reachable = (p) => p !== pid;
    for (const s of [...w.sockets]) if (s.player === pid) s.cut();
    w.run(w.now + 60_000);
    expect(e.player(pid)!.connected).toBe(false);
    expect(e.s.hand!.toAct).toBe(pid); // 20 s + 60 s bank + grace: still their turn
    w.reachable = () => true;
    w.run(w.now + 15_000, () => bot.client.status === 'live');
    expect(bot.client.status).toBe('live');
    expect(e.player(pid)!.connected).toBe(true);
    expect(e.player(pid)!.chair).toBe(chair);
    expect(bot.client.view!.hand!.ps[pid]!.cards).toEqual(cards);
    // ...and it gets to act on that same turn
    w.run(w.now + 5000, () => e.s.hand?.toAct !== pid || e.s.phase !== 'hand');
    const autoFolded = (w.hands[0]?.inputs ?? []).some((i) => i.t === 'tick');
    expect(autoFolded).toBe(false);
  });

  it('a server restart mid-game: phones reconnect, the hand carries on, nothing is lost', () => {
    const w = new World({ latency: [20, 150], loss: 0.05 }, 5, { handPauseMs: 300 });
    const bots = seatBots(w, 6, 9);
    w.run(w.now + 5000, () => w.room.engine?.s.players.length === 6 && bots.every((b) => b.client.status === 'live'));
    hostOf(w, bots).client.send({ t: 'host', cmd: 'deal' });
    w.run(w.now + 120_000, () => (w.room.engine?.s.handNo ?? 0) >= 5 && w.room.engine!.s.phase === 'hand');
    const before = w.room.engine!.s.handNo;
    w.restartServer();
    expect(w.room.engine!.s.handNo).toBe(before);
    w.run(w.now + 30 * 60_000, () => w.room.engine!.s.handNo >= before + 20);
    const e = w.room.engine!;
    expect(e.s.handNo).toBeGreaterThanOrEqual(before + 20);
    expect(chips(e)).toBe(bought(e));
    for (const rec of w.hands) expect(Engine.replay(rec.before, rec.inputs).s.hand!.results).toEqual(rec.results);
  }, 120_000);

  it('a lost update is noticed and the phone catches up', () => {
    const w = new World({ latency: [10, 30], loss: 0 }, 3, { handPauseMs: 300 });
    const bots = seatBots(w, 3, 1);
    w.run(w.now + 5000, () => bots.every((b) => b.client.status === 'live'));
    w.net.loss = 1; // everything is lost for a moment
    hostOf(w, bots).client.send({ t: 'host', cmd: 'deal' });
    w.run(w.now + 500);
    w.net.loss = 0;
    w.run(w.now + 30_000, () => w.room.engine?.s.phase === 'hand' && bots.every((b) => b.client.seq === w.room.seq));
    expect(w.room.engine!.s.phase).toBe('hand');
    for (const b of bots) expect(b.client.seq).toBe(w.room.seq);
  });
});
