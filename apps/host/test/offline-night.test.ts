// Phase 5 gate: whole offline nights on the Node host, which runs the very script the Android app runs in
// QuickJS (dist/host-runtime.js, built here). 10 phones: one hosts, nine join; phones go back, close the
// browser, lock the screen, switch apps and walk out of range; the host restarts; an 11th phone is told the
// table is full; the host phone dies and another phone carries the night on from its checkpoint; the night
// is uploaded and every hand is accepted by the server-side check exactly once.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TableClient, newSeatToken, checkOfflineUpload, type SocketLike } from '@tp/table';
import { decide, rng, STRATEGIES } from '@tp/bots';
import { Engine, combineSeeds, type HandRecord, type View } from '@tp/engine';

const dir = join(__dirname, '..');
const until = async (f: () => boolean, ms: number) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 25)); return f(); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TUNING = JSON.stringify({ handPauseMs: 60, shuffleWaitMs: 400, hostHandoverMs: 4000, offlineAfterMs: 1000, silentCloseMs: 6000 });

// a stand-in table server: takes uploads and runs the same check the real servers run
const uploads: { id: string; fn: string; ok: boolean; error?: string }[] = [];
let upServer: Server; let upPort = 0;

class Host {
  proc: ChildProcess | null = null;
  constructor(readonly port: number, readonly data = mkdtempSync(join(tmpdir(), 'tp-host-'))) {}
  async start(): Promise<void> {
    this.proc = spawn(process.execPath, [join(dir, 'dist/node-host.mjs')], {
      env: { ...process.env, PORT: String(this.port), DATA_DIR: this.data, WEB_DIR: join(dir, 'test'), RUNTIME: join(dir, 'dist/host-runtime.js'), UPLOAD_URL: `http://127.0.0.1:${upPort}`, TP_TUNING: TUNING },
      stdio: 'pipe',
    });
    this.proc.stderr!.on('data', (d) => process.stderr.write(`[host ${this.port}] ${d}`));
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`http://127.0.0.1:${this.port}/info`)).ok) return; } catch { /* not up yet */ }
      await sleep(50);
    }
    throw new Error('host did not start');
  }
  kill(sig: NodeJS.Signals = 'SIGKILL'): Promise<void> {
    return new Promise((r) => { if (!this.proc) return r(); this.proc.once('exit', () => r()); this.proc.kill(sig); this.proc = null; });
  }
  info = async () => (await fetch(`http://127.0.0.1:${this.port}/info`)).json() as Promise<{ table: { players: { id: string; connected: boolean; stack: number }[]; handNo: number; host: string; game: string }; outbox: number }>;
  hands = (): HandRecord[] => existsSync(join(this.data, 'hands.jsonl')) ? readFileSync(join(this.data, 'hands.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as HandRecord) : [];
}

interface Phone { pid: string; c: TableClient; view?: View; cp?: { hash: string; data: string }; errors: string[]; mute: boolean; url: string; account?: string }

function phone(host: () => Host, pid: string, name: string, strategyIndex: number, extra: { settings?: object; account?: string } = {}): Phone {
  const r = rng(strategyIndex * 7 + 1);
  const ph: Phone = { pid, c: null as unknown as TableClient, errors: [], mute: false, url: '', account: extra.account };
  let busy = '';
  const token = newSeatToken();
  const make = () => {
    ph.c = new TableClient({
      url: `ws://127.0.0.1:${host().port}/table/OFFLINE`, table: 'OFFLINE', player: pid, token, name,
      ...(extra.settings ? { settings: extra.settings } : {}),
      ...(extra.account ? { claim: { account: extra.account, device: `dev-${pid}`, crews: [] } } : {}),
      retryMs: 300, pingEveryMs: 1500, silentMs: 5000,
      open: (u) => {
        const ws = new WebSocket(u) as unknown as SocketLike & { send(t: string): void };
        const send = ws.send.bind(ws);
        ws.send = (t: string) => { if (!ph.mute) send(t); }; // a locked screen: the phone stops talking
        return ws;
      },
      checkpointHash: () => ph.cp?.hash ?? null,
      onCheckpoint: (_n, hash, data) => { ph.cp = { hash, data }; },
      onError: (code, m) => ph.errors.push(`${code}: ${m}`),
      onStatus: (s) => { if (s === 'live') busy = ''; },
      onView: (v) => {
        ph.view = v;
        if (v.phase !== 'hand' && v.players.find((p) => p.id === pid)?.stack === 0 && busy !== `rb${v.handNo}`) { busy = `rb${v.handNo}`; ph.c.send({ t: 'rebuy' }); }
        const h = v.hand;
        if (h?.vote?.pids.includes(pid) && !h.vote.voted.includes(pid) && busy !== `v${v.handNo}`) { busy = `v${v.handNo}`; ph.c.send({ t: 'vote', handNo: v.handNo, yes: true }); }
        if (!h || h.toAct !== pid || !v.legal || ph.mute) return;
        const key = `${v.handNo}:${h.street}:${h.currentBet}:${h.ps[pid]!.total}`;
        if (busy === key) return;
        busy = key;
        const a = decide(v, STRATEGIES[strategyIndex % STRATEGIES.length]!, r);
        if (a) setTimeout(() => ph.c.act(a), 5 + Math.floor(r() * 30));
      },
    });
  };
  make();
  (ph as Phone & { remake: () => void }).remake = make;
  return ph;
}

beforeAll(async () => {
  for (const [script] of [['build:js']]) {
    const b = spawnSync('pnpm', ['-s', script!], { cwd: dir, encoding: 'utf8' });
    if (b.status !== 0) throw new Error(b.stderr + b.stdout);
  }
  upServer = createServer((req, res) => {
    let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => {
      const item = JSON.parse(s) as { id: string; fn: string; body: string };
      try { const up = checkOfflineUpload(item); uploads.push({ id: up.id, fn: up.fn, ok: true }); res.writeHead(200); res.end('{}'); }
      catch (e) { uploads.push({ id: item.id, fn: item.fn, ok: false, error: (e as Error).message }); res.writeHead(422); res.end('{}'); }
    });
  });
  await new Promise<void>((r) => upServer.listen(0, '127.0.0.1', () => r()));
  upPort = (upServer.address() as { port: number }).port;
}, 120_000);
afterAll(() => { upServer?.close(); });

describe('offline night on the host (the Android app\'s table server, run in Node)', () => {
  it('10 phones play; back, close, locked screens, app switches, out of range and a host restart all rejoin; an 11th is refused', async () => {
    const port = 21000 + Math.floor(Math.random() * 3000);
    let host = new Host(port);
    await host.start();
    const accounts = Array.from({ length: 10 }, () => randomUUID());
    const phones: Phone[] = [phone(() => host, accounts[0]!, 'Host', 0, { settings: { turnTime: 20, startStack: 1000, maxPlayers: 15 }, account: accounts[0] })];
    expect(await until(() => phones[0]!.view !== undefined, 5000)).toBe(true);
    for (let i = 1; i < 10; i++) phones.push(phone(() => host, i % 3 === 0 ? `guest${i}` : accounts[i]!, `P${i}`, i, i % 3 === 0 ? {} : { account: accounts[i] }));
    expect(await until(() => phones.every((p) => p.view?.players.length === 10), 8000)).toBe(true);
    // an 11th phone: the offline cap
    const eleventh = phone(() => host, 'late', 'Late', 3);
    expect(await until(() => eleventh.errors.length > 0, 5000)).toBe(true);
    expect(eleventh.errors[0]).toBe('table_full: This offline table is full. For more than 10 players, play online.');
    eleventh.c.close();
    phones[0]!.c.send({ t: 'host', cmd: 'deal' });
    expect(await until(() => (phones[0]!.view?.handNo ?? 0) >= 5, 30_000)).toBe(true);

    // the night's troubles, one after another, while hands go on
    const r = rng(9);
    const pick = () => phones[1 + Math.floor(r() * 9)]!;
    for (let round = 0; round < 8; round++) {
      const p = pick();
      const kind = round % 4;
      if (kind === 0) { p.c.close(); await sleep(200); (p as Phone & { remake: () => void }).remake(); }          // back / closed the browser
      if (kind === 1) { p.mute = true; await sleep(7000); p.mute = false; }                                        // screen locked: silent until closed
      if (kind === 2) { p.c.close(); await sleep(1500); (p as Phone & { remake: () => void }).remake(); }         // switched apps for a bit
      if (kind === 3) { p.c.close(); await sleep(9000); (p as Phone & { remake: () => void }).remake(); }         // walked out of range
      await sleep(300);
    }
    // the host app is killed and opened again (same files)
    const handBefore = (await host.info()).table.handNo;
    await host.kill();
    await sleep(300);
    await host.start();
    expect(await until(() => phones.every((p) => p.c.status === 'live'), 20_000)).toBe(true);
    expect(await until(() => phones.every((p) => p.view?.players.find((x) => x.id === p.pid)?.connected), 20_000)).toBe(true);
    const info = await host.info();
    expect(info.table.handNo).toBeGreaterThanOrEqual(handBefore - 1);
    expect(info.table.players.map((p) => p.id).sort()).toEqual(phones.map((p) => p.pid).sort()); // every phone kept its seat
    expect(await until(() => (phones[0]!.view?.handNo ?? 0) >= handBefore + 10, 60_000)).toBe(true);

    // shared shuffle: every deck mixed seeds from several phones, and the dealer's promise held
    const hands = host.hands();
    expect(hands.length).toBeGreaterThan(15);
    for (const h of hands) {
      expect(h.proof.dealerSeedCommit).toMatch(/^[0-9a-f]{64}$/);
      expect(Engine.replay(h.before, h.inputs).s.hand!.results).toEqual(h.results);
    }
    const shared = hands.filter((h) => h.proof.contributions.length >= 5).length;
    expect(shared / hands.length).toBeGreaterThan(0.8);
    expect(combineSeeds(hands[0]!.proof.dealerSeed, hands[0]!.proof.contributions)).toMatch(/^[0-9a-f]{64}$/);
    // nobody's phone ever saw the shuffle seed
    // (the client keeps no raw log; the room tests check every message)

    // the host phone dies for good; phone 4 (which has the app) carries the night on from its checkpoint
    const keeper = phones[4]!;
    expect(keeper.cp).toBeDefined();
    const cpTable = JSON.parse(keeper.cp!.data) as { base: { players: { id: string; stack: number }[]; handNo: number }; game: { id: string } };
    const gameId = info.table.game;
    expect(cpTable.game.id).toBe(gameId);
    await host.kill();
    const second = new Host(port + 1);
    await second.start();
    const res = await fetch(`http://127.0.0.1:${second.port}/continue`, { method: 'POST', body: JSON.stringify({ checkpoint: keeper.cp!.data, player: keeper.pid }) });
    expect(await res.json()).toEqual({ ok: 'continued' });
    host = second;
    // everyone types the new code: their phones reconnect to the new host with the same seat tokens
    for (const p of phones) { p.c.close(); (p as Phone & { remake: () => void }).remake(); }
    expect(await until(() => phones.every((p) => p.c.status === 'live' && p.view?.players.length === 10), 20_000)).toBe(true);
    const after = await second.info();
    expect(after.table.game).toBe(gameId); // the same night, so the league gets one game
    expect(after.table.host).toBe(keeper.pid);
    // stacks are as they were before the hand that was cut off
    // (a player who was out of chips may already have bought back in)
    for (const p of cpTable.base.players) expect(after.table.players.find((x) => x.id === p.id)!.stack).toBe(p.stack === 0 ? after.table.players.find((x) => x.id === p.id)!.stack && 1000 : p.stack);
    keeper.c.send({ t: 'host', cmd: 'deal' });
    expect(await until(() => (keeper.view?.handNo ?? 0) >= cpTable.base.handNo + 5, 40_000)).toBe(true);
    keeper.c.send({ t: 'host', cmd: 'end' });
    expect(await until(() => phones.every((p) => p.view?.phase === 'ended'), 10_000)).toBe(true);
    const v = keeper.view!;
    expect(v.players.reduce((a, p) => a + p.stack, 0)).toBe(v.players.reduce((a, p) => a + p.buyins, 0));

    // upload: the second host sends what it recorded; every item passes the server's check, once
    expect(await until(() => uploads.some((u) => u.fn === 'record_game_end'), 20_000)).toBe(true);
    expect(uploads.filter((u) => !u.ok)).toEqual([]);
    const ids = uploads.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.at(-1)).toBe(`${gameId}:end`);
    expect((await second.info()).outbox).toBe(0);
    for (const p of phones) p.c.close();
    await second.kill();
  }, 240_000);
});
