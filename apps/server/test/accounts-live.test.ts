// Phase 3 regression at a live table (LIVE_SUPABASE=1): real accounts on the Supabase project, the real
// Node table server build. A crew-only table refuses an outsider; a recovered account rejoins its seat.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Account, type KeyStore } from '@tp/account';
import { TableClient, type SocketLike } from '@tp/table';

const dir = join(__dirname, '..');
const port = 21000 + Math.floor(Math.random() * 2000);
let proc: ChildProcess | null = null;
const store = (): KeyStore => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };
const until = async (f: () => boolean, ms: number) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 25)); return f(); };
const made: Account[] = [];

describe.skipIf(!process.env.LIVE_SUPABASE)('accounts at a live table', () => {
  beforeAll(async () => {
    const b = spawnSync('pnpm', ['-s', 'build:node'], { cwd: dir, encoding: 'utf8' });
    if (b.status !== 0) throw new Error(b.stderr);
    proc = spawn(process.execPath, [join(dir, 'dist/node-server.mjs')], { env: { ...process.env, PORT: String(port), DATA_DIR: mkdtempSync(join(tmpdir(), 'tp-acc-')), HAND_PAUSE_MS: '200' }, stdio: 'inherit' });
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 50)); }
  }, 60_000);
  afterAll(async () => {
    proc?.kill();
    for (const a of made) if (a.profile) await a.deleteAccount().catch(() => {});
  }, 60_000);

  it('crew-only table refuses an outsider; a recovered account gets its seat back', async () => {
    const phone = () => { const a = new Account({ storage: store() }); made.push(a); return a; };
    const rahul = phone(), riya = phone(), stranger = phone();
    await rahul.start('Rahul'); await riya.start('Riya'); await stranger.start('Stranger');
    const crew = await rahul.createCrew('Table test crew');
    await riya.joinCrew(await rahul.createInvite(crew.id));
    const code = await rahul.newRecoveryCode();
    const table = 'ACC' + Math.floor(Math.random() * 1e6);
    const errors: string[] = [];
    const seat = (a: Account, extra: Record<string, unknown> = {}) => new TableClient({
      url: `ws://127.0.0.1:${port}/table/${table}`, table, player: a.profile!.id,
      getTicket: () => a.ticket(table), open: (u) => new WebSocket(u) as unknown as SocketLike,
      onError: (c, m) => errors.push(`${a.profile!.name}: ${c} ${m}`), ...extra,
    });
    const host = seat(rahul, { settings: { crew: crew.id, turnTime: 60 } });
    expect(await until(() => host.status === 'live', 15_000)).toBe(true);
    const r2 = seat(riya);
    expect(await until(() => r2.status === 'live', 15_000)).toBe(true);
    expect(host.view!.players.map((p) => p.name).sort()).toEqual(['Rahul', 'Riya']);

    const out = seat(stranger);
    expect(await until(() => out.status === 'closed', 15_000)).toBe(true);
    expect(errors).toContain('Stranger: not_allowed This table is for crew members');

    host.send({ t: 'host', cmd: 'deal' });
    expect(await until(() => host.view?.phase === 'hand' && !!host.view.hand?.ps[rahul.profile!.id]?.cards, 15_000)).toBe(true);
    const chair = host.view!.players.find((p) => p.id === rahul.profile!.id)!.chair;
    const cards = host.view!.hand!.ps[rahul.profile!.id]!.cards;

    // Rahul's phone dies mid-hand; on a new phone he recovers with the code and opens the table again
    host.close();
    const fresh = phone();
    const rec = await fresh.recover(code);
    expect(rec.ok).toBe(true);
    const back = seat(fresh);
    expect(await until(() => back.status === 'live', 15_000)).toBe(true);
    expect(back.you).toBe(rahul.profile!.id);
    expect(back.view!.players.find((p) => p.id === back.you)!.chair).toBe(chair);
    expect(back.view!.hand!.ps[back.you!]!.cards).toEqual(cards);
    for (const c of [r2, back]) c.close();
    made.splice(made.indexOf(rahul), 1);
    await fresh.deleteCrew(crew.id);
  }, 120_000);
});
