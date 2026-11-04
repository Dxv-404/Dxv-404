// Research on the Oracle (Node) build: the table's own events and the apps' events (POST /research/ingest)
// reach the database through the signed research_ingest call; with the database down they wait on disk and
// arrive once it is back; the game never notices.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TableClient, newSeatToken, type SocketLike } from '@tp/table';
import { EnvelopeMaker, type Envelope } from '@tp/research';
import type { View } from '@tp/engine';

const dir = join(__dirname, '..');
const data = mkdtempSync(join(tmpdir(), 'tp-research-'));
const port = 19000 + Math.floor(Math.random() * 500);
const dbPort = port + 600;
let proc: ChildProcess | null = null;
let db: Server | null = null;
let dbUp = true;
const stored: Envelope[] = [];

beforeAll(async () => {
  const b = spawnSync('pnpm', ['-s', 'build:node'], { cwd: dir, encoding: 'utf8' });
  if (b.status !== 0) throw new Error(b.stderr);
  // a stand-in for the database: research_ingest stores what it is sent (when "up")
  db = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (!dbUp) { res.writeHead(503); res.end('down'); return; }
      if (req.url === '/rest/v1/rpc/research_ingest') {
        const { p_body, p_sig } = JSON.parse(body) as { p_body: string; p_sig: string };
        expect(p_sig).toMatch(/^v1\.\d+\.[0-9a-f]{64}$/);
        stored.push(...(JSON.parse(p_body) as { events: Envelope[] }).events);
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"inserted":1}');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('"ok"');
    });
  }).listen(dbPort);
  proc = spawn(process.execPath, [join(dir, 'dist/node-server.mjs')], { env: { ...process.env, PORT: String(port), DATA_DIR: data, HAND_PAUSE_MS: '50', RECORDER_TOKEN: 'test-recorder-token', SUPABASE_URL: `http://127.0.0.1:${dbPort}` }, stdio: 'pipe' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('server did not start');
}, 60_000);
afterAll(() => { proc?.kill('SIGKILL'); db?.close(); });

const until = async (f: () => boolean, ms: number) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await new Promise((r) => setTimeout(r, 25)); return f(); };

describe('research on the Oracle build', () => {
  it('a hand played over real sockets reaches the database as research events', async () => {
    const code = 'RS' + Math.floor(Math.random() * 1e4);
    const views = new Map<string, View>();
    const clients = ['a', 'b'].map((pid, i) => new TableClient({
      url: `ws://127.0.0.1:${port}/table/${code}`, table: code, player: pid, token: newSeatToken(), name: pid, ...(i === 0 ? { settings: {} } : {}),
      open: (u) => new WebSocket(u) as unknown as SocketLike, onView: (v) => views.set(pid, v),
    }));
    await until(() => views.size === 2 && views.get('a')!.players.length === 2, 5000);
    clients[0]!.send({ t: 'host', cmd: 'deal' });
    await until(() => views.get('a')?.hand?.toAct != null, 5000);
    const toAct = views.get('a')!.hand!.toAct!;
    clients[toAct === 'a' ? 0 : 1]!.act({ type: 'fold' });
    expect(await until(() => stored.some((e) => e.t === 'hand.end' && e.tb === code), 8000)).toBe(true);
    const mine = stored.filter((e) => e.tb === code);
    for (const t of ['table.open', 'conn.hello', 'seat.join', 'msg.in', 'hand.start', 'hand.decision', 'hand.action']) expect(mine.map((e) => e.t)).toContain(t);
    for (const c of clients) c.close();
  }, 30_000);

  it('the apps\' batches are checked, stamped and stored; the reply carries the server clock', async () => {
    const m = new EnvelopeMaker('c', { wall: Date.now, mono: () => performance.now() }, 'test');
    const events = [m.make('ui.tap', { k: 'x' }, { d: 'dev-node-test' }), { ...m.make('ui.tap', {}), src: 's' }];
    const r = await fetch(`http://127.0.0.1:${port}/research/ingest`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ events }) });
    const j = await r.json() as { ok: boolean; st: number; accepted: number; rejected: number };
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ ok: true, accepted: 1, rejected: 1 });
    expect(Math.abs(j.st - Date.now())).toBeLessThan(5000);
    expect(await until(() => stored.some((e) => e.id === events[0]!.id), 5000)).toBe(true);
    expect(stored.find((e) => e.id === events[0]!.id)!.ts).toBe(j.st);
    const ping = await (await fetch(`http://127.0.0.1:${port}/research/ping`)).json() as { st: number };
    expect(ping.st).toBeGreaterThan(0);
    expect((await fetch(`http://127.0.0.1:${port}/research/ingest`, { method: 'POST', body: 'nope' })).status).toBe(400);
  });

  it('with the database down, events wait on disk and arrive when it is back; the table plays on', async () => {
    dbUp = false;
    const m = new EnvelopeMaker('c', { wall: Date.now, mono: () => performance.now() }, 'test');
    const e = m.make('ui.tap', { k: 'while down' }, { d: 'dev-node-test' });
    const r = await fetch(`http://127.0.0.1:${port}/research/ingest`, { method: 'POST', body: JSON.stringify({ events: [e] }) });
    expect(r.status).toBe(200); // safe on the server
    expect(await until(() => readdirSync(join(data, 'research')).length > 0, 8000)).toBe(true);
    dbUp = true;
    expect(await until(() => stored.some((x) => x.id === e.id), 20_000)).toBe(true);
  }, 30_000);
});
