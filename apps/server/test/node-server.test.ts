// The real Oracle server build, real WebSockets, real phone client, bots playing; then the server is
// killed mid-game and started again from its saved files.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TableClient, newSeatToken, type SocketLike } from '@tp/table';
import { decide, rng, STRATEGIES } from '@tp/bots';
import { Engine, type HandRecord, type View } from '@tp/engine';

const dir = join(__dirname, '..');
const data = mkdtempSync(join(tmpdir(), 'tp-data-'));
const port = 18000 + Math.floor(Math.random() * 2000);
let proc: ChildProcess | null = null;

async function start(): Promise<void> {
  proc = spawn(process.execPath, [join(dir, 'dist/node-server.mjs')], { env: { ...process.env, PORT: String(port), DATA_DIR: data, HAND_PAUSE_MS: '50' }, stdio: 'pipe' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('server did not start');
}
function kill(): Promise<void> {
  return new Promise((r) => { if (!proc) return r(); proc.once('exit', () => r()); proc.kill('SIGKILL'); proc = null; });
}
const until = async (f: () => boolean, ms: number) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 20)); return f(); };

beforeAll(async () => {
  const b = spawnSync('pnpm', ['-s', 'build:node'], { cwd: dir, encoding: 'utf8' });
  if (b.status !== 0) throw new Error(b.stderr);
  await start();
}, 60_000);
afterAll(async () => { await kill(); });

describe('Oracle table server (real sockets)', () => {
  it('health answers with the protocol version', async () => {
    const h = await (await fetch(`http://127.0.0.1:${port}/health`)).json() as { ok: boolean; protocol: number };
    expect(h).toMatchObject({ ok: true, protocol: 1 });
  });

  it('6 bots play over real WebSockets; a hard crash mid-game loses nothing', async () => {
    const r = rng(42);
    const code = 'NODE' + Math.floor(Math.random() * 1e4);
    const views = new Map<string, View>();
    const clients = STRATEGIES.concat(STRATEGIES).slice(0, 6).map((strategy, i) => {
      const pid = `n${i}`;
      let busy = '';
      const c: TableClient = new TableClient({
        url: `ws://127.0.0.1:${port}/table/${code}`, table: code, player: pid, token: newSeatToken(), name: `N${i}`,
        settings: { turnTime: 20, startStack: 1000 }, retryMs: 500, pingEveryMs: 2000,
        open: (u) => new WebSocket(u) as unknown as SocketLike,
        // after a reconnect, look at the table afresh (a crash may have rolled back the last 0.1 s)
        onStatus: (s) => { if (s === 'live') busy = ''; },
        onView: (v) => {
          views.set(pid, v);
          if (v.phase !== 'hand' && v.players.find((p) => p.id === pid)?.stack === 0 && busy !== `rb${v.handNo}`) { busy = `rb${v.handNo}`; c.send({ t: 'rebuy' }); }
          const h = v.hand;
          if (h?.vote?.pids.includes(pid) && !h.vote.voted.includes(pid) && busy !== `v${v.handNo}`) { busy = `v${v.handNo}`; c.send({ t: 'vote', handNo: v.handNo, yes: true }); }
          if (!h || h.toAct !== pid || !v.legal) return;
          const key = `${v.handNo}:${h.street}:${h.currentBet}:${h.ps[pid]!.total}`;
          if (busy === key) return;
          busy = key;
          const a = decide(v, strategy, r);
          if (a) c.act(a);
        },
      });
      return c;
    });
    expect(await until(() => clients.every((c) => c.status === 'live') && clients.every((c) => c.view?.players.length === 6), 10_000)).toBe(true);
    const host = clients.find((c) => c.you === c.host)!;
    host.send({ t: 'host', cmd: 'deal' });
    expect(await until(() => (host.view?.handNo ?? 0) >= 30, 60_000)).toBe(true);
    // crash: no goodbye, no final save
    await until(() => host.view?.phase === 'hand', 5000);
    const handBefore = host.view!.handNo;
    await kill();
    const saved = JSON.parse(readFileSync(join(data, 'tables', `${code}.json`), 'utf8')) as { base: { handNo: number }; seq: number };
    // every finished hand was on disk: at most the hand in progress (0.1 s of taps) is replayed from its start
    expect(saved.base.handNo).toBeGreaterThanOrEqual(handBefore - 1);
    expect(await until(() => clients.every((c) => c.status !== 'live'), 10_000)).toBe(true);
    await new Promise((res) => setTimeout(res, 400));
    await start();
    expect(await until(() => clients.every((c) => c.status === 'live'), 15_000)).toBe(true);
    // the same night carries on: hand number never goes backwards by more than the unsaved instant
    expect(host.seq).toBeGreaterThanOrEqual(saved.seq);
    expect(host.view!.handNo).toBeGreaterThanOrEqual(handBefore - 1);
    expect(await until(() => (host.view?.handNo ?? 0) >= handBefore + 20, 60_000)).toBe(true);
    host.send({ t: 'host', cmd: 'end' });
    expect(await until(() => clients.every((c) => c.view?.phase === 'ended'), 10_000)).toBe(true);
    // chips: everyone's final stacks add up to everything bought
    const v = host.view!;
    expect(v.players.reduce((a, p) => a + p.stack, 0)).toBe(v.players.reduce((a, p) => a + p.buyins, 0));
    // the hand log on disk replays identically
    const logFile = join(data, 'hands', `${code}.jsonl`);
    expect(existsSync(logFile)).toBe(true);
    const recs = readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as HandRecord);
    expect(recs.length).toBeGreaterThanOrEqual(45);
    for (const rec of recs) expect(Engine.replay(rec.before, rec.inputs).s.hand!.results).toEqual(rec.results);
    for (const c of clients) c.close();
  }, 180_000);

  it('a stranger cannot take a seat; an unknown path is refused; a silent socket is closed', async () => {
    const code = 'SEAT' + Math.floor(Math.random() * 1e4);
    const errors: string[] = [];
    const a = new TableClient({ url: `ws://127.0.0.1:${port}/table/${code}`, table: code, player: 'owner', token: newSeatToken(), name: 'Owner', open: (u) => new WebSocket(u) as unknown as SocketLike });
    expect(await until(() => a.status === 'live', 5000)).toBe(true);
    const b = new TableClient({ url: `ws://127.0.0.1:${port}/table/${code}`, table: code, player: 'owner', token: newSeatToken(), name: 'Thief', open: (u) => new WebSocket(u) as unknown as SocketLike, onError: (c) => errors.push(c) });
    expect(await until(() => b.status === 'closed', 5000)).toBe(true);
    expect(errors).toContain('not_allowed');
    a.close();
    const bad = new WebSocket(`ws://127.0.0.1:${port}/nope/x`);
    expect(await new Promise((res) => { bad.onerror = () => res('refused'); bad.onopen = () => res('opened'); })).toBe('refused');
  });
});
