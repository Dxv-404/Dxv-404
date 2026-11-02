// Phase 8 load and soak: many tables of bots playing through a real table server over WebSockets, the way
// phones do (the same client, outbox and reconnects). Measures how long the server takes to answer each
// move and to show it to everyone, and checks every table keeps dealing and its chips always add up.
//
//   node dist/load.mjs --url wss://140-245-200-214.sslip.io --tables 50 --players 9 --minutes 10
//   options: --chaos 0.02 (each bot drops and reconnects this often a minute), --prefix A (code letters),
//            --think 300..1500 (ms a bot waits before acting), --out report.json
import { TableClient, newSeatToken, type SocketLike } from '@tp/table';
import { decide, rng, STRATEGIES } from '@tp/bots';
import type { View } from '@tp/engine';
import { writeFileSync } from 'node:fs';

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1]! : d; };
const URL_ = arg('url', 'ws://127.0.0.1:8080');
const TABLES = Number(arg('tables', '10'));
const PLAYERS = Number(arg('players', '9'));
const MINUTES = Number(arg('minutes', '5'));
const CHAOS = Number(arg('chaos', '0'));
const PREFIX = arg('prefix', 'A');
const [THINK_MIN, THINK_MAX] = arg('think', '300..1500').split('..').map(Number) as [number, number];
const OUT = arg('out', '');
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const ackMs: number[] = [];   // move sent -> server answered
const seenMs: number[] = [];  // move sent -> another phone at the table saw it
const sample = (a: number[], v: number) => { if (a.length < 200_000) a.push(v); };
let errors = 0, refused = 0, reconnects = 0, handsTotal = 0, chipErrors = 0, maxPending = 0;
const errorKinds = new Map<string, number>();
const note = (k: string) => { errorKinds.set(k, (errorKinds.get(k) ?? 0) + 1); };

interface Bot { pid: string; c: TableClient; view?: View; table: Table }
interface Table { code: string; bots: Bot[]; lastHand: number; lastProgress: number; sent: Map<string, number>; stuckReports: number }

const tables: Table[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r0 = rng(Date.now() % 100000);
const code = (i: number) => PREFIX + [0, 1, 2].map((k) => LETTERS[(Math.floor(r0() * 1e6) + i * 7 + k * 13) % LETTERS.length]).join('');

function bot(t: Table, i: number): Bot {
  const pid = `ld${t.code}${i}`;
  const r = rng(i * 31 + t.code.charCodeAt(1));
  const token = newSeatToken();
  const b: Bot = { pid, c: null as unknown as TableClient, table: t };
  let busy = '';
  const make = () => {
    b.c = new TableClient({
      url: `${URL_}/table/${t.code}`, table: t.code, player: pid, token, name: `Bot${i}`,
      ...(i === 0 ? { settings: { turnTime: 20, startStack: 1000, sb: 5, bb: 10, rebuys: true, casual: true, maxPlayers: 15 } } : {}),
      open: (u) => new WebSocket(u) as unknown as SocketLike,
      onError: (code, m) => { errors++; note(`${code}: ${m.slice(0, 60)}`); },
      onAck: (id, ok, err) => {
        const at = t.sent.get(id);
        if (at !== undefined) { sample(ackMs, performance.now() - at); }
        if (!ok) { refused++; note(`refused: ${err?.slice(0, 60)}`); }
      },
      onView: (v, events) => {
        b.view = v;
        // the move another phone made shows up here: how long since it was sent
        for (const e of events as { t: string; pid?: string; handNo?: number }[]) {
          if (e.t === 'act' && e.pid && e.pid !== pid) {
            const key = `seen:${e.pid}`;
            const at = t.sent.get(key);
            if (at !== undefined) { sample(seenMs, performance.now() - at); t.sent.delete(key); }
          }
        }
        if (i === 0 && v.handNo > t.lastHand) { handsTotal += v.handNo - t.lastHand; t.lastHand = v.handNo; t.lastProgress = Date.now(); }
        if (i === 0) {
          const chips = v.players.reduce((s, p) => s + p.stack, 0) + (v.hand ? Object.values(v.hand.ps).reduce((s, p) => s + (p.total ?? 0), 0) : 0);
          const bought = v.players.reduce((s, p) => s + ((p as unknown as { buyins?: number }).buyins ?? 0), 0);
          if (bought && chips !== bought && v.phase !== 'hand') chipErrors++;
        }
        if (v.phase !== 'hand' && v.players.find((p) => p.id === pid)?.stack === 0 && busy !== `rb${v.handNo}`) { busy = `rb${v.handNo}`; b.c.send({ t: 'rebuy' }); }
        const h = v.hand;
        if (h?.vote?.pids.includes(pid) && !h.vote.voted.includes(pid) && busy !== `v${v.handNo}`) { busy = `v${v.handNo}`; b.c.send({ t: 'vote', handNo: v.handNo, yes: r() < 0.5 }); }
        if (!h || h.toAct !== pid || !v.legal) return;
        const key = `${v.handNo}:${h.street}:${h.currentBet}:${h.ps[pid]!.total}`;
        if (busy === key) return;
        busy = key;
        const a = decide(v, STRATEGIES[i % STRATEGIES.length]!, r);
        if (!a) return;
        setTimeout(() => {
          const now = performance.now();
          const id = b.c.act(a) as unknown as string | undefined;
          if (typeof id === 'string') t.sent.set(id, now);
          t.sent.set(`seen:${pid}`, now);
          maxPending = Math.max(maxPending, b.c.pending);
        }, THINK_MIN + Math.floor(r() * (THINK_MAX - THINK_MIN)));
      },
    });
  };
  make();
  (b as Bot & { remake: () => void }).remake = () => { b.c.close(); reconnects++; make(); };
  return b;
}

const pct = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!); };

async function main(): Promise<void> {
  const started = Date.now();
  console.log(`load: ${TABLES} tables x ${PLAYERS} bots on ${URL_} for ${MINUTES} min (chaos ${CHAOS}/min)`);
  for (let i = 0; i < TABLES; i++) {
    const t: Table = { code: code(i), bots: [], lastHand: 0, lastProgress: Date.now(), sent: new Map(), stuckReports: 0 };
    tables.push(t);
    t.bots.push(bot(t, 0));
    await sleep(150);
  }
  await sleep(1500);
  for (const t of tables) { for (let i = 1; i < PLAYERS; i++) { t.bots.push(bot(t, i)); await sleep(20); } }
  await sleep(3000);
  for (const t of tables) t.bots[0]!.c.send({ t: 'host', cmd: 'deal' });
  const end = started + MINUTES * 60_000;
  let lastLog = Date.now();
  while (Date.now() < end) {
    await sleep(1000);
    if (CHAOS > 0) for (const t of tables) for (const b of t.bots.slice(1)) if (r0() < CHAOS / 60) (b as Bot & { remake: () => void }).remake();
    for (const t of tables) if (Date.now() - t.lastProgress > 90_000 && t.stuckReports++ === 0) { note(`stuck table ${t.code} at hand ${t.lastHand}`); }
    if (Date.now() - lastLog > 30_000) {
      lastLog = Date.now();
      console.log(`${Math.round((Date.now() - started) / 1000)}s: ${handsTotal} hands, ack p50 ${pct(ackMs, 50)} p95 ${pct(ackMs, 95)} p99 ${pct(ackMs, 99)} ms, seen p95 ${pct(seenMs, 95)} ms, errors ${errors}, refused ${refused}, reconnects ${reconnects}`);
    }
  }
  for (const t of tables) t.bots[0]!.c.send({ t: 'host', cmd: 'end' });
  await sleep(4000);
  const live = tables.filter((t) => t.bots.every((b) => b.view)).length;
  const stuck = tables.filter((t) => Date.now() - t.lastProgress > 90_000).length;
  for (const t of tables) for (const b of t.bots) b.c.close();
  const report = {
    url: URL_, tables: TABLES, players: PLAYERS, minutes: MINUTES, chaos: CHAOS, hands: handsTotal, tablesLive: live, tablesStuck: stuck,
    ackMs: { n: ackMs.length, p50: pct(ackMs, 50), p95: pct(ackMs, 95), p99: pct(ackMs, 99), max: pct(ackMs, 100) },
    seenMs: { n: seenMs.length, p50: pct(seenMs, 50), p95: pct(seenMs, 95), p99: pct(seenMs, 99), max: pct(seenMs, 100) },
    errors, refused, reconnects, chipErrors, maxPending, errorKinds: Object.fromEntries(errorKinds),
  };
  console.log(JSON.stringify(report, null, 2));
  if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2));
  setTimeout(() => process.exit(0), 500);
}
void main();
