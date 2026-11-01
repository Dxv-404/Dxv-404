// Phase 4 gate on the real database code (a fresh local Postgres with every migration): bots play a long
// crew game through the real client and room over a bad network, with a server restart in the middle;
// every hand and the game's end go through the Recorder, whose link to the database fails 20% of the time
// and repeats every successful call. Afterwards: every hand is in the database exactly once, each player's
// league result equals the sum of their hands, and every stored hand replays to the same result.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import pg from 'pg';
import { Engine, cardStr, type HandRecord } from '@tp/engine';
import { decide, rng, STRATEGIES } from '@tp/bots';
import { Recorder, tokenSigner, type OutboxItem, type Send } from '../src/record';
import type { TableClient } from '../src/client';
import { World } from './sim';

const PG = { host: process.env.PGHOST ?? '/tmp', port: Number(process.env.PGPORT ?? 54329), user: 'postgres' };
const DB = `tp_league_${process.pid}`;
const root = join(__dirname, '../../..');
let up = false;
try { execFileSync('pg_isready', ['-h', PG.host, '-p', String(PG.port)], { stdio: 'ignore' }); up = true; } catch { /* no local Postgres */ }
let db: pg.Client;

describe.skipIf(!up)('league from live tables (local Postgres)', () => {
  beforeAll(async () => {
    const admin = new pg.Client({ ...PG, database: 'postgres' });
    await admin.connect(); await admin.query(`create database ${DB}`); await admin.end();
    const psql = (f: string) => execFileSync('psql', ['-h', PG.host, '-p', String(PG.port), '-U', 'postgres', '-d', DB, '-q', '-X', '-v', 'ON_ERROR_STOP=1', '-f', f], { stdio: 'ignore' });
    psql(join(root, 'supabase/tests/local-shim.sql'));
    for (const m of execFileSync('ls', [join(root, 'supabase/migrations')]).toString().trim().split('\n')) psql(join(root, 'supabase/migrations', m));
    db = new pg.Client({ ...PG, database: DB });
    await db.connect();
  }, 60_000);
  afterAll(async () => {
    await db?.end();
    const admin = new pg.Client({ ...PG, database: 'postgres' });
    await admin.connect(); await admin.query(`drop database if exists ${DB}`); await admin.end();
  });

  it('6 signed-in bots, 300 hands, bad network, a restart, a flaky database: every hand once, totals add up, replays match', async () => {
    // accounts and a crew, made the way phones make them
    const as = async (u: string, q: string) => (await db.query('select testing.one($1, $2) as v', [u, q])).rows[0].v as string;
    const phones = Array.from({ length: 6 }, (_, i) => `00000000-0000-4000-8000-0000000000${(10 + i).toString()}`);
    const ids: string[] = [];
    for (const [i, u] of phones.entries()) ids.push(await as(u, `select (public.ensure_account('Bot ${i}')).id`));
    const crew = await as(phones[0]!, `select (public.create_crew('Bot crew')).id`);
    const inv = await as(phones[0]!, `select public.create_invite('${crew}')`);
    for (const u of phones.slice(1)) await as(u, `select public.join_crew('${inv}')`);
    const key = 'league-test-token';
    await db.query(`insert into private.settings values ('recorder_token_hash', encode(extensions.digest($1::text, 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value`, [key]);

    // the recorder, with a database link that fails 20% of the time and repeats every success
    const r = rng(99);
    let calls = 0, failures = 0;
    const send: Send = async (fn, body, sig) => {
      calls++;
      if (r() < 0.2) { failures++; throw new Error('network down'); }
      const once = (await db.query(`select public.${fn}($1, $2) as v`, [body, sig])).rows[0].v as 'ok';
      await db.query(`select public.${fn}($1, $2)`, [body, sig]); // the same call arriving twice
      return once;
    };
    const kept = new Map<string, OutboxItem>(); // survives the "server restart"
    const outbox = { load: async () => [...kept.values()], put: async (it: OutboxItem) => void kept.set(it.id, { ...it }), remove: async (id: string) => void kept.delete(id) };
    const w = new World({ latency: [20, 200], loss: 0.08, dropEveryMs: 120_000 }, 4242, { handPauseMs: 300 });
    const recorder = () => new Recorder(outbox, tokenSigner(key), send, () => w.now, (m) => { if (!m.includes('network down')) console.log(m); });
    let rec = recorder();
    await rec.start();
    const records: HandRecord[] = [];
    const hook = (room: typeof w.room) => {
      (room as unknown as { store: { league: unknown; appendHand: (h: HandRecord) => void } }).store.league = (kind: 'hand' | 'end', id: string, payload: unknown) => {
        void rec.add(kind === 'hand' ? 'record_hand' : 'record_game_end', id, payload);
      };
    };
    // tickets: each bot is its account
    const identify = async (t: string) => ({ account: t.slice(7), device: `dev-${t.slice(7)}`, name: 'Bot', crews: [crew] });
    w.roomOpts = { ...w.roomOpts, identify };
    w.room = w.makeRoom(w.room.code, null);
    hook(w.room);
    const origAppend = w.hands;
    void origAppend;

    const bots: { pid: string; client: TableClient; busy: string | null }[] = [];
    for (const [i, id] of ids.entries()) {
      const bot = { pid: id, busy: null as string | null, client: null as unknown as TableClient };
      const strategy = STRATEGIES[i % STRATEGIES.length]!;
      bot.client = w.client({
        player: id, getTicket: async () => `ticket-${id}`, ...(i === 0 ? { settings: { crew, startStack: 1000, sb: 10, bb: 20, turnTime: 20, dealItTwice: true } } : {}),
        onStatus: (s) => { if (s === 'live') bot.busy = null; },
        onError: (c, m) => { if (process.env.DEBUG_LEAGUE) console.log('error', i, c, m); },
        onView: (v) => {
          const me = v.players.find((p) => p.id === id);
          if (!me) return;
          if (v.phase !== 'hand' && me.stack === 0 && bot.busy !== `rb${v.handNo}`) { bot.busy = `rb${v.handNo}`; bot.client.send({ t: 'rebuy' }); return; }
          const h = v.hand;
          if (!h || v.phase !== 'hand') return;
          if (h.vote?.pids.includes(id) && !h.vote.voted.includes(id)) { if (bot.busy !== `v${v.handNo}`) { bot.busy = `v${v.handNo}`; bot.client.send({ t: 'vote', handNo: v.handNo, yes: r() < 0.5 }); } return; }
          if (h.toAct !== id || !v.legal) return;
          const k = `${v.handNo}:${h.street}:${h.currentBet}:${h.ps[id]!.total}`;
          if (bot.busy === k) return;
          bot.busy = k;
          w.at(w.now + 100 + r() * 600, () => { const cur = bot.client.view; if (cur?.hand?.toAct === id) { const a = decide(cur, strategy, r); if (a) bot.client.act(a); } });
        },
      });
      bots.push(bot);
    }
    const settle = async (ms: number, stop?: () => boolean) => { // let the simulated world and the recorder both run
      const end = w.now + ms;
      // the simulation runs in steps of half a second; between steps, promises (ticket checks, the
      // recorder) get to run, as they would on a real server
      while (w.now < end && !stop?.()) { w.run(Math.min(end, w.now + 500), stop); await new Promise((res) => setImmediate(res)); await rec.flush(); }
    };
    await settle(10_000, () => bots.every((b) => b.client.status === 'live') && (w.room.engine?.s.players.length ?? 0) === 6);
    if (process.env.DEBUG_LEAGUE) console.log('after join', bots.map((b) => b.client.status), w.room.host, w.room.stats());
    bots.find((b) => b.pid === w.room.host)!.client.send({ t: 'host', cmd: 'deal' });
    await settle(6 * 3600_000, () => (w.room.engine?.s.handNo ?? 0) >= 150);
    // the table server restarts mid-game (and so does its recorder, from the outbox it kept)
    w.restartServer(); hook(w.room);
    rec = recorder(); await rec.start();
    await settle(6 * 3600_000, () => (w.room.engine?.s.handNo ?? 0) >= 300 && w.room.engine!.s.phase !== 'hand');
    w.net.dropEveryMs = undefined;
    bots.find((b) => b.pid === w.room.host)!.client.send({ t: 'host', cmd: 'end' });
    await settle(120_000, () => w.room.engine!.s.phase === 'ended');
    for (let i = 0; i < 200 && rec.pending; i++) { w.now += 15 * 60_000; await rec.flush(); } // the link comes back eventually
    expect(rec.pending).toBe(0);
    expect(rec.refused).toEqual([]);
    for (const h of w.hands) records.push(h);

    const e = w.room.engine!;
    const gameId = w.room.game!.id;
    const q = async (sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows;
    // every hand exactly once
    const stored = await q('select h.hand_no, r.record, h.record as replay from hands h join private.hand_records r using (game_id, hand_no) where h.game_id = $1 order by h.hand_no', [gameId]);
    expect(stored.map((x) => x.hand_no)).toEqual(Array.from({ length: e.s.handNo }, (_, i) => i + 1));
    expect((await q('select hands, status from games where id = $1', [gameId]))[0]).toEqual({ hands: e.s.handNo, status: 'ended' });
    // league totals = sum of hands, for every player
    const gp = await q('select player_key, account_id, buyins, final_chips, net, bb_won, hands from game_players where game_id = $1', [gameId]);
    expect(gp).toHaveLength(6);
    for (const p of gp) {
      const [{ s, n }] = await q('select sum(net)::int s, count(*)::int n from hand_players where game_id = $1 and player_key = $2', [gameId, p.player_key]);
      expect(p.net).toBe(s);
      expect(p.hands).toBe(n);
      expect(Number(p.bb_won)).toBeCloseTo(p.net / 20, 2);
      expect(p.account_id).toBe(p.player_key);
      const live = e.s.players.concat(e.s.departed ?? []).find((x) => x.id === p.player_key)!;
      expect([p.buyins, p.final_chips]).toEqual([live.buyins, live.stack]);
    }
    expect(gp.reduce((a, p) => a + p.net, 0)).toBe(0);
    // the league view agrees, and every player has the game in their history once
    const [{ season_id: season }] = await q('select season_id from games where id = $1', [gameId]); // the simulated clock is in 2023
    expect(season).toBeTruthy();
    const league = await q(`select testing.as_phone($1, $2) as v`, [phones[3], `select account_id, total_bb, games from public.league('${crew}', '${season}')`]);
    const lg = league[0].v as { account_id: string; total_bb: number; games: number }[];
    for (const p of gp) expect(lg.find((x) => x.account_id === p.account_id)).toMatchObject({ games: 1, total_bb: Number(p.bb_won) });
    for (const u of phones) expect(JSON.stringify((await q('select testing.as_phone($1, $2) as v', [u, 'select game_id from public.my_games()']))[0].v)).toBe(JSON.stringify([{ game_id: gameId }]));
    // every stored hand replays to the same result (no matter how it got there), and its public replay
    // carries neither the seed nor any hole cards that were not turned face up
    for (const row of stored) {
      const recd = row.record as HandRecord;
      const end = Engine.replay(recd.before, recd.inputs).s.hand!;
      expect(end.results).toEqual(recd.results);
      const pub = JSON.stringify(row.replay);
      expect(pub).not.toContain(recd.proof.dealerSeed);
      for (const pid of end.order) if (!end.revealed[pid] && !end.shown[pid]) expect(pub).not.toContain(JSON.stringify(end.ps[pid]!.cards.map(cardStr)));
    }
    // each player can read their own cards for every hand they were dealt, and nobody else's
    const own = await q('select testing.as_phone($1, $2) as v', [phones[2], `select count(*)::int n, count(distinct account_id)::int who from hand_cards_private where game_id = '${gameId}'`]);
    const dealt = (await q('select count(*)::int n from hand_players where game_id = $1 and player_key = $2', [gameId, ids[2]]))[0].n;
    expect(own[0].v).toEqual([{ n: dealt, who: 1 }]);
    console.log(`hands ${e.s.handNo}, database calls ${calls} (${failures} failed and were retried), each success sent twice; players ${gp.map((p) => `${p.net > 0 ? '+' : ''}${p.net}`).join(' ')}`);
  }, 300_000);
});
