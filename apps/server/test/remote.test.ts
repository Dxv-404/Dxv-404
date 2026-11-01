// Bots play a real table on a running server: TABLE_URL=wss://host (or ws://127.0.0.1:8799) pnpm vitest run apps/server/test/remote.test.ts
// Skipped unless TABLE_URL is set. Checks: everyone joins, hands run, a phone dropped mid-hand rejoins
// its seat with the same cards, chips add up, and the tap-to-everyone time is measured.
import { describe, expect, it } from 'vitest';
import WS from 'ws';
import { TableClient, newSeatToken, type SocketLike } from '@tp/table';
import { decide, rng, STRATEGIES } from '@tp/bots';
import type { View } from '@tp/engine';

const URL_BASE = process.env.TABLE_URL;
const HANDS = Number(process.env.HANDS ?? 25);
const until = async (f: () => boolean, ms: number) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 25)); return f(); };

describe.skipIf(!URL_BASE)(`live table server at ${URL_BASE}`, () => {
  it(`6 bots play ${HANDS} hands; a dropped phone rejoins its seat; chips add up`, async () => {
    const r = rng(7);
    const code = 'LIVE' + Math.floor(Math.random() * 1e6);
    const seenAt = new Map<number, number[]>(); // seq -> when each phone saw it
    const clients = STRATEGIES.concat(STRATEGIES).slice(0, 6).map((strategy, i) => {
      const pid = `live${i}`;
      let busy = '';
      const c: TableClient = new TableClient({
        url: `${URL_BASE}/table/${code}`, table: code, player: pid, token: newSeatToken(), name: `Live ${i}`,
        settings: { turnTime: 20, startStack: 1000 },
        open: (u) => new WS(u) as unknown as SocketLike,
        onStatus: (s) => { if (s === 'live') busy = ''; },
        onView: (v: View) => {
          const list = seenAt.get(c.seq) ?? [];
          list.push(performance.now());
          seenAt.set(c.seq, list);
          const me = v.players.find((p) => p.id === pid);
          if (v.phase !== 'hand' && me?.stack === 0 && busy !== `rb${v.handNo}`) { busy = `rb${v.handNo}`; c.send({ t: 'rebuy' }); }
          const h = v.hand;
          if (h?.vote?.pids.includes(pid) && !h.vote.voted.includes(pid) && busy !== `v${v.handNo}`) { busy = `v${v.handNo}`; c.send({ t: 'vote', handNo: v.handNo, yes: true }); }
          if (!h || h.toAct !== pid || !v.legal) return;
          const key = `${v.handNo}:${h.street}:${h.currentBet}:${h.ps[pid]!.total}`;
          if (busy === key) return;
          busy = key;
          setTimeout(() => { const a = c.view && decide(c.view, strategy, r); if (a && c.view?.hand?.toAct === pid) c.act(a); }, 30);
        },
      });
      return c;
    });
    expect(await until(() => clients.every((c) => c.status === 'live' && c.view?.players.length === 6), 20_000)).toBe(true);
    const host = clients.find((c) => c.you === c.host)!;
    host.send({ t: 'host', cmd: 'deal' });
    expect(await until(() => (host.view?.handNo ?? 0) >= 3 && host.view?.phase === 'hand', 60_000)).toBe(true);

    // drop a phone mid-hand, bring it back: same seat, same cards
    const victim = clients.find((c) => c !== host && c.view?.hand?.ps[c.you!]?.cards)!;
    const hand = victim.view!.handNo, cards = victim.view!.hand!.ps[victim.you!]!.cards;
    const chair = victim.view!.players.find((p) => p.id === victim.you)!.chair;
    victim.reconnect();
    expect(await until(() => victim.status === 'live', 15_000)).toBe(true);
    expect(victim.view!.players.find((p) => p.id === victim.you)!.chair).toBe(chair);
    if (victim.view!.handNo === hand) expect(victim.view!.hand!.ps[victim.you!]!.cards).toEqual(cards);

    expect(await until(() => (host.view?.handNo ?? 0) >= HANDS, HANDS * 15_000)).toBe(true);
    host.send({ t: 'host', cmd: 'end' });
    expect(await until(() => clients.every((c) => c.view?.phase === 'ended'), 20_000)).toBe(true);
    const v = host.view!;
    expect(v.players.reduce((a, p) => a + p.stack, 0)).toBe(v.players.reduce((a, p) => a + p.buyins, 0));
    // spread between the first and last phone seeing the same update (all phones are on this one machine)
    const spreads = [...seenAt.values()].filter((l) => l.length === 6).map((l) => Math.max(...l) - Math.min(...l)).sort((a, b) => a - b);
    const rtts = clients.map((c) => c.rtt).filter((x): x is number => x !== null);
    console.log(`server ${URL_BASE}: hands ${v.handNo}, update spread p50 ${spreads[spreads.length >> 1]?.toFixed(1)} ms p95 ${spreads[Math.floor(spreads.length * 0.95)]?.toFixed(1)} ms, ping ${rtts.map((x) => x.toFixed(0)).join('/')} ms`);
    for (const c of clients) c.close();
  }, 600_000);
});
