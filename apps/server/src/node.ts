// Table server for an ordinary Linux machine (the free Oracle server in Hyderabad).
// Routes: /health, /latency, /tap (tap-to-everyone check), a live table at /table/CODE, and a plain echo at /echo/CODE for the latency page.
// Each table is a TableRoom (the same code the Cloudflare server and the host phone run). Tables are saved
// to disk after every change (taps inside a hand batched for 0.1 s, everything else at once) and every finished hand is appended to
// that table's hand log, so a restart or a crash loses nothing.
import { createServer } from 'node:http';
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, readdirSync, unlinkSync, chmodSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '@tp/protocol';
import { TableRoom, Recorder, tokenSigner, supabaseSend, checkOfflineUpload, MAX_UPLOAD_BYTES, type Conn, type Persisted, type OutboxItem, type PushRequest } from '@tp/table';
import { cachedTicketChecker, SUPABASE_KEY, SUPABASE_URL } from '@tp/account/ticket';
import { LATENCY_PAGE } from './latency-page';
import { TAP_PAGE } from './tap-page';

const PORT = Number(process.env.PORT ?? 8080);
const SITE = process.env.SITE_NAME ?? 'HYD';
// tables live next to the VERSION file on the server (/opt/tp/data), else in ./data
const DATA = process.env.DATA_DIR ?? (process.env.VERSION_FILE ? join(dirname(process.env.VERSION_FILE), 'data') : join(process.cwd(), 'data'));
const VERSION = (() => { try { return readFileSync(process.env.VERSION_FILE ?? '', 'utf8').trim(); } catch { return 'dev'; } })();
const HELLO_WITHIN_MS = 15_000;
const IDLE_EVICT_MS = 30 * 60_000;
const SAVE_EVERY_MS = 100;
// one free machine: a cap on sockets overall and from one address, so nobody can exhaust it
const MAX_SOCKETS = Number(process.env.MAX_SOCKETS ?? 1000);
const MAX_PER_ADDRESS = Number(process.env.MAX_PER_ADDRESS ?? 40);
const MAX_ECHO_PER_ROOM = 20;
const perAddress = new Map<string, number>();
mkdirSync(join(DATA, 'tables'), { recursive: true });
mkdirSync(join(DATA, 'hands'), { recursive: true });
mkdirSync(join(DATA, 'outbox'), { recursive: true });
mkdirSync(join(DATA, 'backups'), { recursive: true, mode: 0o700 });

// ---------------- league recorder ----------------
// The signing key reaches this machine out of band: an environment variable, or the Oracle instance's
// metadata (set through the Oracle API), never the code on GitHub. Without it, games are still played and
// kept in the hand logs, just not sent to the league.
async function recorderKey(): Promise<string | null> {
  if (process.env.RECORDER_TOKEN) return process.env.RECORDER_TOKEN;
  try {
    const r = await fetch('http://169.254.169.254/opc/v2/instance/metadata/recorder_token', { headers: { authorization: 'Bearer Oracle' }, signal: AbortSignal.timeout(2000) });
    return r.ok ? (await r.text()).trim() : null;
  } catch { return null; }
}
const outboxDir = join(DATA, 'outbox');
const outboxStore = {
  load: async () => readdirSync(outboxDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(outboxDir, f), 'utf8')) as OutboxItem),
  put: async (it: OutboxItem) => { const f = join(outboxDir, `${encodeURIComponent(it.id)}.json`); writeFileSync(`${f}.tmp`, JSON.stringify(it)); renameSync(`${f}.tmp`, f); },
  remove: async (id: string) => { try { unlinkSync(join(outboxDir, `${encodeURIComponent(id)}.json`)); } catch { /* already gone */ } },
};
let recorder: Recorder | null = null;
let signBody: ((body: string) => Promise<string>) | null = null;
void recorderKey().then(async (key) => {
  if (!key) { console.log('league recorder: no key, games are not sent to the league'); return; }
  signBody = tokenSigner(key);
  recorder = new Recorder(outboxStore, signBody, supabaseSend(process.env.SUPABASE_URL ?? SUPABASE_URL, SUPABASE_KEY), Date.now, (m) => console.log(m));
  await recorder.start();
  console.log(`league recorder ready (${recorder.pending} waiting in the outbox)`);
  void recorder.flush();
  setInterval(() => { void recorder?.flush(); }, 30_000).unref();
});

// ---------------- push notifications ----------------
// The push key is kept only on Cloudflare: this server hands each push there, signed with the recorder key.
const PUSH_RELAY = process.env.PUSH_RELAY ?? 'https://train-poker-tables.apins-subdomain.workers.dev/push/send';
function handPush(p: PushRequest): void {
  if (!signBody || !PUSH_RELAY) return;
  const body = JSON.stringify(p);
  void signBody(body).then((sig) => fetch(PUSH_RELAY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body, sig }), signal: AbortSignal.timeout(10_000) }))
    .then((r) => { if (!r.ok) console.log(`push relay: ${r.status}`); }, (e: unknown) => console.log(`push relay failed: ${String(e)}`));
}

// ---------------- nightly backup ----------------
// At 03:00 India time: the whole accounts database, gzipped, kept here (readable by this server only) for 30 nights.
async function backupNow(): Promise<string | null> {
  if (!signBody) return null;
  const body = JSON.stringify({ backup: new Date().toISOString() });
  const res = await fetch(`${process.env.SUPABASE_URL ?? SUPABASE_URL}/rest/v1/rpc/export_backup`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ p_body: body, p_sig: await signBody(body) }),
  });
  if (!res.ok) throw new Error(`backup failed: ${res.status} ${await res.text()}`);
  const file = join(DATA, 'backups', `${new Date().toISOString().slice(0, 10)}.json.gz`);
  writeFileSync(file, gzipSync(Buffer.from(await res.text())), { mode: 0o600 });
  chmodSync(file, 0o600);
  const all = readdirSync(join(DATA, 'backups')).filter((f) => f.endsWith('.json.gz')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 30))) unlinkSync(join(DATA, 'backups', old));
  return file;
}
let lastBackupDay = '';
setInterval(() => {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  const day = ist.toISOString().slice(0, 10);
  if (ist.getUTCHours() === 3 && day !== lastBackupDay) {
    lastBackupDay = day;
    backupNow().then((f) => f && console.log(`backup saved: ${f}`), (e) => console.error(e));
  }
}, 60_000).unref();

interface Live { room: TableRoom; timer: NodeJS.Timeout | null; dirty: Persisted | null; saveTimer: NodeJS.Timeout | null; idleSince: number }
const live = new Map<string, Live>();
// signed-in phones show a ticket; the accounts database says whose it is (answers cached 5 minutes)
const identify = cachedTicketChecker();
const echo = new Map<string, Set<WebSocket>>();

const tableFile = (code: string) => join(DATA, 'tables', `${code}.json`);

function flush(code: string, l: Live): void {
  if (l.saveTimer) { clearTimeout(l.saveTimer); l.saveTimer = null; }
  if (!l.dirty) return;
  const file = tableFile(code);
  writeFileSync(`${file}.tmp`, JSON.stringify(l.dirty));
  renameSync(`${file}.tmp`, file); // never a half-written table
  l.dirty = null;
}

function getRoom(code: string): Live {
  const have = live.get(code);
  if (have) return have;
  let saved: Persisted | null = null;
  if (existsSync(tableFile(code))) {
    try { saved = JSON.parse(readFileSync(tableFile(code), 'utf8')) as Persisted; } catch (e) { console.error(`table ${code}: unreadable save`, e); }
  }
  const l: Live = { room: null as unknown as TableRoom, timer: null, dirty: null, saveTimer: null, idleSince: Date.now() };
  l.room = new TableRoom(code, {
    now: () => Date.now(),
    schedule: (at) => {
      if (l.timer) clearTimeout(l.timer);
      l.timer = at === null ? null : setTimeout(() => { l.timer = null; l.room.wake(); }, Math.min(Math.max(0, at - Date.now()), 2 ** 31 - 1));
    },
  }, {
    save: (p) => {
      l.dirty = p;
      // between hands (nothing since the last hand boundary) save at once; taps inside a hand are batched
      if (p.inputs.length === 0) flush(code, l);
      else l.saveTimer ??= setTimeout(() => flush(code, l), SAVE_EVERY_MS);
    },
    appendHand: (h) => appendFileSync(join(DATA, 'hands', `${code}.jsonl`), JSON.stringify(h) + '\n'),
    league: (kind, id, payload) => {
      const fn = kind === 'hand' ? 'record_hand' : 'record_game_end';
      // before the recorder is ready (or with no key yet) the record waits in the outbox on disk
      if (recorder) void recorder.add(fn, id, payload);
      else void outboxStore.put({ id, fn, body: JSON.stringify(payload), tries: 0, nextAt: 0 });
    },
  }, saved, { identify, server: 'oracle', push: handPush, ...(process.env.HAND_PAUSE_MS ? { handPauseMs: Number(process.env.HAND_PAUSE_MS) } : {}) });
  l.room.settleAfterRestart(); // nobody is connected to a table just loaded from disk
  live.set(code, l);
  return l;
}

// Tables still in a game come back at start, so their timers run (turns, and ending a game everyone left).
for (const f of readdirSync(join(DATA, 'tables')).filter((x) => x.endsWith('.json'))) {
  try {
    const p = JSON.parse(readFileSync(join(DATA, 'tables', f), 'utf8')) as Persisted;
    if (p.game && !p.game.ended) getRoom(p.code);
  } catch (e) { console.error(`table file ${f}:`, e); }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  if (url.pathname === '/health') {
    let connections = 0;
    for (const l of live.values()) connections += l.room.connectionCount;
    res.writeHead(200, { 'content-type': 'application/json', ...cors });
    res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, colo: SITE, country: req.headers['cf-ipcountry'] ?? null, version: VERSION, rooms: live.size, connections, league: recorder ? { waiting: recorder.pending, refused: recorder.refused.length } : null }));
    return;
  }
  if (url.pathname === '/offline/upload' && req.method === 'POST') { offlineUpload(req, res, cors); return; }
  if (url.pathname === '/latency' || url.pathname === '/tap') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...cors });
    res.end(url.pathname === '/tap' ? TAP_PAGE : LATENCY_PAGE);
    return;
  }
  res.writeHead(404, cors);
  res.end('Not found');
});

// ---------------- nights played offline ----------------
// The host phone uploads its table's records when it is back online; each hand is replayed and checked
// here before this server's recorder signs it (see offline-upload.ts). At most 3,000 items an hour from
// one address (a long night is about 300).
const uploadsFrom = new Map<string, { n: number; since: number }>();
function offlineUpload(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, cors: Record<string, string>): void {
  const addr = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',').pop()!.trim();
  const u = uploadsFrom.get(addr) ?? { n: 0, since: Date.now() };
  if (Date.now() - u.since > 3600_000) { u.n = 0; u.since = Date.now(); }
  uploadsFrom.set(addr, u);
  const reply = (code: number, o: unknown) => { res.writeHead(code, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(o)); };
  if (++u.n > 3000) return reply(429, { error: 'Too many uploads; try again later' });
  let text = '';
  req.on('data', (c: Buffer) => { text += c; if (text.length > MAX_UPLOAD_BYTES + 1024) { reply(413, { error: 'Too large' }); req.destroy(); } });
  req.on('end', () => {
    if (res.headersSent) return;
    let up;
    try { up = checkOfflineUpload(JSON.parse(text) as { id?: unknown; fn?: unknown; body?: unknown }); }
    catch (e) { return reply(422, { error: (e as Error).message }); }
    if (recorder) void recorder.add(up.fn, up.id, up.payload);
    else void outboxStore.put({ id: up.id, fn: up.fn, body: JSON.stringify(up.payload), tries: 0, nextAt: 0, order: Date.now() });
    reply(200, { queued: up.id });
  });
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
const alive = new WeakMap<WebSocket, boolean>();

server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', 'http://local').pathname;
  const m = /^\/(table|echo)\/([A-Z0-9]{4,12})$/.exec(path);
  if (!m) { socket.destroy(); return; }
  const [, kind, code] = m as unknown as [string, 'table' | 'echo', string];
  // Caddy in front sets X-Forwarded-For to the address it saw (it does not trust one sent by a phone)
  const addr = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',').pop()!.trim();
  if (wss.clients.size >= MAX_SOCKETS || (perAddress.get(addr) ?? 0) >= MAX_PER_ADDRESS || (kind === 'echo' && (echo.get(code)?.size ?? 0) >= MAX_ECHO_PER_ROOM)) {
    socket.end('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    perAddress.set(addr, (perAddress.get(addr) ?? 0) + 1);
    ws.on('close', () => { const n = (perAddress.get(addr) ?? 1) - 1; if (n > 0) perAddress.set(addr, n); else perAddress.delete(addr); });
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    if (kind === 'echo') return echoRoom(ws, code);
    const l = getRoom(code);
    const conn: Conn = { send: (t) => { if (ws.readyState === ws.OPEN) ws.send(t); }, close: (c, r) => ws.close(c, r) };
    l.room.connect(conn);
    const helloTimer = setTimeout(() => { if (!l.room.hasSaidHello(conn)) ws.close(4004, 'no hello'); }, HELLO_WITHIN_MS);
    ws.on('message', (data) => { try { l.room.message(conn, data.toString()); } catch (e) { console.error(`table ${code}:`, e); } });
    ws.on('close', () => {
      clearTimeout(helloTimer); l.room.disconnect(conn);
      if (l.room.connectionCount) return;
      l.idleSince = Date.now();
      // a code nobody opened a table at (a typo, or someone trying codes) leaves nothing behind
      if (!l.room.engine && live.get(code) === l) { if (l.timer) clearTimeout(l.timer); live.delete(code); }
    });
  });
});

function echoRoom(ws: WebSocket, code: string): void {
  const room = echo.get(code) ?? new Set();
  echo.set(code, room);
  room.add(ws);
  ws.on('message', (data) => {
    const text = data.toString();
    if (text === 'where') return ws.send(`where:${SITE}`);
    if (text.startsWith('ping:')) return ws.send(`pong:${text.slice(5)}`);
    for (const peer of room) peer.send(`echo:${text}`);
  });
  ws.on('close', () => { room.delete(ws); if (!room.size) echo.delete(code); });
}

// A phone that vanished without closing (no signal, killed app) is found within a minute.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) { ws.terminate(); continue; }
    alive.set(ws, false);
    ws.ping();
  }
  // tables nobody has been at for 30 minutes leave memory (they stay on disk and come back on the next visit)
  const now = Date.now();
  for (const [code, l] of live) {
    if (l.room.connectionCount || now - l.idleSince < IDLE_EVICT_MS) continue;
    flush(code, l);
    if (l.timer) clearTimeout(l.timer);
    live.delete(code);
  }
}, 30_000).unref();

function shutdown(): void {
  for (const [code, l] of live) flush(code, l);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, process.env.HOST ?? '127.0.0.1', () => console.log(`table server ${VERSION} on ${process.env.HOST ?? '127.0.0.1'}:${PORT} (${SITE}), data in ${DATA}`));
