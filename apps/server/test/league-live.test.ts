// Phase 4 live (LIVE_SUPABASE=1 TABLE_URL=wss://...): real accounts play a short crew game on a deployed
// table server; the server records every hand and the end; then the game is in each player's history
// once, the league adds up to the hands, and every stored hand has a public replay and the player's own cards.
import { afterAll, describe, expect, it } from 'vitest';
import WS from 'ws';
import { Account, type KeyStore } from '@tp/account';
import { TableClient, type SocketLike } from '@tp/table';

const URL_BASE = process.env.TABLE_URL;
const store = (): KeyStore => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };
const until = async (f: () => boolean | Promise<boolean>, ms: number) => { const end = Date.now() + ms; while (!(await f()) && Date.now() < end) await new Promise((r) => setTimeout(r, 300)); return f(); };
const made: Account[] = [];

describe.skipIf(!process.env.LIVE_SUPABASE || !URL_BASE)(`league from a live table at ${URL_BASE}`, () => {
  afterAll(async () => { for (const a of made) if (a.profile) await a.deleteAccount().catch(() => {}); }, 60_000);

  it('a crew game lands in history and the league exactly once, and adds up', async () => {
    const accts = ['Asha', 'Bilal', 'Chitra'].map(() => { const a = new Account({ storage: store() }); made.push(a); return a; });
    await Promise.all(accts.map((a, i) => a.start(['Asha', 'Bilal', 'Chitra'][i]!)));
    const crew = await accts[0]!.createCrew('Live league test');
    const inv = await accts[0]!.createInvite(crew.id);
    await accts[1]!.joinCrew(inv); await accts[2]!.joinCrew(inv);
    const table = 'LG' + Math.floor(Math.random() * 1e6);
    const clients = accts.map((a, i) => {
      let busy = '';
      const c: TableClient = new TableClient({
        url: `${URL_BASE}/table/${table}`, table, player: a.profile!.id, getTicket: () => a.ticket(table),
        open: (u) => new WS(u) as unknown as SocketLike, ...(i === 0 ? { settings: { crew: crew.id, startStack: 1000, sb: 10, bb: 20 } } : {}),
        onView: (v) => {
          const h = v.hand, me = a.profile!.id;
          if (v.phase !== 'hand' && v.players.find((p) => p.id === me)?.stack === 0 && busy !== `rb${v.handNo}`) { busy = `rb${v.handNo}`; c.send({ t: 'rebuy' }); }
          if (!h || h.toAct !== me || !v.legal) return;
          const k = `${v.handNo}:${h.street}:${h.currentBet}:${h.ps[me]!.total}`;
          if (busy === k) return;
          busy = k;
          // a little of everything: calls, raises, folds
          const r = Math.random();
          c.act(r < 0.15 ? { type: 'fold' } : r < 0.3 && v.legal.canRaise ? { type: 'raise', to: v.legal.minTo } : { type: v.legal.canCheck ? 'check' : 'call' });
        },
      });
      return c;
    });
    expect(await until(() => clients.every((c) => c.status === 'live' && c.view?.players.length === 3), 20_000)).toBe(true);
    const host = clients.find((c) => c.you === c.host)!;
    host.send({ t: 'host', cmd: 'deal' });
    expect(await until(() => (host.view?.handNo ?? 0) >= 8 && host.view?.phase !== 'hand', 180_000)).toBe(true);
    host.send({ t: 'host', cmd: 'end' });
    expect(await until(() => host.view?.phase === 'ended', 20_000)).toBe(true);
    const hands = host.view!.handNo;
    const finals = new Map(host.view!.players.map((p) => [p.id, p]));
    for (const c of clients) c.close();

    // the server's recorder delivers within moments
    const a0 = accts[0]!;
    expect(await until(async () => (await a0.myGames(5)).some((g) => g.status === 'ended'), 60_000)).toBe(true);
    const mine = (await a0.myGames(5)).filter((g) => g.status === 'ended');
    expect(mine).toHaveLength(1);
    const gid = mine[0]!.game_id;
    const got = (await a0.game(gid))!;
    expect(got.game.hands).toBe(hands);
    for (const p of got.players) {
      const live = finals.get(p.player_key)!;
      expect([p.buyins, p.final_chips, p.account_id]).toEqual([live.buyins, live.stack, p.player_key]);
    }
    expect(got.players.reduce((s, p) => s + (p.net ?? 0), 0)).toBe(0);
    // the league (this season) matches the game, for every player, seen from another player's phone
    const league = await accts[2]!.league(crew.id);
    for (const p of got.players) expect(league.find((r) => r.account_id === p.account_id)).toMatchObject({ games: 1, total_bb: Number(p.bb_won), hands: p.hands });
    // each player has it in their history exactly once
    for (const a of accts) expect((await a.myGames(10)).filter((g) => g.game_id === gid)).toHaveLength(1);
    // every stored hand replays to its own result
    const list = await a0.hands(gid);
    expect(list.map((x) => x.hand_no)).toEqual(Array.from({ length: hands }, (_, i) => i + 1));
    for (const x of list) {
      // the public replay (what the table saw) plus this player's own cards; never anyone else's
      const got = (await a0.hand(gid, x.hand_no))!;
      const rp = got.replay as { keys: string[]; frames: { cards?: Record<number, string[]> }[]; results: { pots: { amount: number; awards: { amount: number }[] }[] } };
      expect(rp.frames.length).toBeGreaterThan(0);
      for (const pot of rp.results.pots) expect(pot.awards.reduce((s, w) => s + w.amount, 0)).toBe(pot.amount);
      expect(got.myCards).toHaveLength(2);
      expect(JSON.stringify(rp)).not.toMatch(/dealerSeed|"deck"/);
    }
    console.log(`${URL_BASE}: ${hands} hands recorded once; results ${got.players.map((p) => `${p.name} ${p.bb_won}bb`).join(', ')}`);
    await a0.deleteCrew(crew.id);
  }, 400_000);
});
