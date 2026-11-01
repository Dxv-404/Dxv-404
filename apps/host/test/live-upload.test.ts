// Live check (run by hand with TP_LIVE=1; skipped otherwise): a short offline night on the Node host,
// uploaded through the real Hyderabad table server into the real database, then confirmed by two of its
// players from their own (test) accounts, and found in their history. The test accounts are deleted after.
import { describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TableClient, newSeatToken, type SocketLike } from '@tp/table';
import { decide, rng, STRATEGIES } from '@tp/bots';
import type { View } from '@tp/engine';
import { Account, type KeyStore } from '../../../packages/account/src/index';

const LIVE = process.env.TP_LIVE === '1';
const UPLOAD = process.env.TP_UPLOAD_URL ?? 'https://140-245-200-214.sslip.io';
const dir = join(__dirname, '..');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean | Promise<boolean>, ms: number) => { const end = Date.now() + ms; while (!(await f()) && Date.now() < end) await sleep(200); return f(); };
const mem = (): KeyStore => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };

describe.skipIf(!LIVE)('live: an offline night reaches the league', () => {
  it('uploads, waits for two confirmations, then shows in history', async () => {
    const b = spawnSync('pnpm', ['-s', 'build:js'], { cwd: dir, encoding: 'utf8' });
    if (b.status !== 0) throw new Error(b.stderr + b.stdout);
    const accts = [new Account({ storage: mem() }), new Account({ storage: mem() }), new Account({ storage: mem() })];
    const profiles = [];
    for (const [i, a] of accts.entries()) profiles.push(await a.start(`Live ${i + 1}`));
    const port = 25000 + Math.floor(Math.random() * 2000);
    const data = mkdtempSync(join(tmpdir(), 'tp-live-'));
    const proc = spawn(process.execPath, [join(dir, 'dist/node-host.mjs')], {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: data, WEB_DIR: join(dir, 'test'), RUNTIME: join(dir, 'dist/host-runtime.js'), UPLOAD_URL: UPLOAD,
        TP_TUNING: JSON.stringify({ handPauseMs: 60, shuffleWaitMs: 400 }) },
      stdio: 'pipe',
    });
    let log = '';
    proc.stdout!.on('data', (d) => (log += d)); proc.stderr!.on('data', (d) => (log += d));
    try {
      await until(async () => { try { return (await fetch(`http://127.0.0.1:${port}/info`)).ok; } catch { return false; } }, 10_000);
      const views: (View | undefined)[] = [];
      const clients = profiles.map((p, i) => {
        const r = rng(i + 3); let busy = '';
        const c: TableClient = new TableClient({
          url: `ws://127.0.0.1:${port}/table/OFFLINE`, table: 'OFFLINE', player: p.id, token: newSeatToken(), name: p.name,
          ...(i === 0 ? { settings: { turnTime: 20, startStack: 1000, sb: 5, bb: 10 } } : {}),
          claim: { account: p.id, device: `live-${i}`, crews: [] },
          open: (u) => new WebSocket(u) as unknown as SocketLike,
          onView: (v) => {
            views[i] = v;
            const h = v.hand;
            if (!h || h.toAct !== p.id || !v.legal) return;
            const key = `${v.handNo}:${h.street}:${h.currentBet}:${h.ps[p.id]!.total}`;
            if (busy === key) return; busy = key;
            const a = decide(v, STRATEGIES[i % STRATEGIES.length]!, r);
            if (a) setTimeout(() => c.act(a), 10);
          },
        });
        return c;
      });
      expect(await until(() => views.every((v) => v?.players.length === 3), 10_000)).toBe(true);
      clients[0]!.send({ t: 'host', cmd: 'deal' });
      expect(await until(() => (views[0]?.handNo ?? 0) >= 6 && views[0]?.phase !== 'hand', 60_000)).toBe(true);
      clients[0]!.send({ t: 'host', cmd: 'end' });
      // the outbox drains to the real server
      const drained = await until(async () => ((await (await fetch(`http://127.0.0.1:${port}/info`)).json()) as { outbox: number; table: { handNo: number } }).outbox === 0, 90_000);
      expect(drained, log).toBe(true);
      clients.forEach((c) => c.close());

      const pending = await accts[0]!.pendingOfflineGames();
      expect(pending.length).toBe(1);
      const g = pending[0]!;
      expect(g.players).toBe(3);
      expect(g.hands).toBeGreaterThanOrEqual(6);
      expect((await accts[0]!.myGames()).some((x) => x.game_id === g.game_id)).toBe(false);
      // seat 3 says it wasn't them; seats 1 and 2 confirm
      await accts[2]!.disputeOfflineSeat(g.game_id);
      expect(await accts[0]!.confirmOfflineGame(g.game_id)).toBe('pending');
      expect(await accts[1]!.confirmOfflineGame(g.game_id)).toBe('ended');
      expect(await accts[0]!.pendingOfflineGames()).toEqual([]);
      expect((await accts[1]!.myGames(5)).find((x) => x.game_id === g.game_id)?.status).toBe('ended');
      expect((await accts[2]!.myGames(5)).some((x) => x.game_id === g.game_id)).toBe(false);
      console.log(`live offline night ${g.game_id}: ${g.hands} hands uploaded and confirmed`);
    } finally {
      proc.kill('SIGKILL');
      for (const a of accts) await a.deleteAccount().catch(() => undefined);
    }
  }, 240_000);
});
