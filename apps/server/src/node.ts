// Table server for an ordinary Linux machine (the free Oracle server in Hyderabad).
// Routes: /health, /latency, /tap (tap-to-everyone check), a live table at /table/CODE, and a plain echo at /echo/CODE for the latency page.
// Each table is a TableRoom (the same code the Cloudflare server and the host phone run). Tables are saved
// to disk after every change (taps inside a hand batched for 0.1 s, everything else at once) and every finished hand is appended to
// that table's hand log, so a restart or a crash loses nothing.
import { createServer } from 'node:http';
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '@tp/protocol';
import { TableRoom, type Conn, type Persisted } from '@tp/table';
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
mkdirSync(join(DATA, 'tables'), { recursive: true });
mkdirSync(join(DATA, 'hands'), { recursive: true });

interface Live { room: TableRoom; timer: NodeJS.Timeout | null; dirty: Persisted | null; saveTimer: NodeJS.Timeout | null; idleSince: number }
const live = new Map<string, Live>();
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
  }, saved, process.env.HAND_PAUSE_MS ? { handPauseMs: Number(process.env.HAND_PAUSE_MS) } : {});
  l.room.settleAfterRestart(); // nobody is connected to a table just loaded from disk
  live.set(code, l);
  return l;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  if (url.pathname === '/health') {
    let connections = 0;
    for (const l of live.values()) connections += l.room.connectionCount;
    res.writeHead(200, { 'content-type': 'application/json', ...cors });
    res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, colo: SITE, country: req.headers['cf-ipcountry'] ?? null, version: VERSION, rooms: live.size, connections }));
    return;
  }
  if (url.pathname === '/latency' || url.pathname === '/tap') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...cors });
    res.end(url.pathname === '/tap' ? TAP_PAGE : LATENCY_PAGE);
    return;
  }
  res.writeHead(404, cors);
  res.end('Not found');
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
const alive = new WeakMap<WebSocket, boolean>();

server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', 'http://local').pathname;
  const m = /^\/(table|echo)\/([A-Z0-9]{4,12})$/.exec(path);
  if (!m) { socket.destroy(); return; }
  const [, kind, code] = m as unknown as [string, 'table' | 'echo', string];
  wss.handleUpgrade(req, socket, head, (ws) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    if (kind === 'echo') return echoRoom(ws, code);
    const l = getRoom(code);
    const conn: Conn = { send: (t) => { if (ws.readyState === ws.OPEN) ws.send(t); }, close: (c, r) => ws.close(c, r) };
    l.room.connect(conn);
    const helloTimer = setTimeout(() => { if (!l.room.hasSaidHello(conn)) ws.close(4004, 'no hello'); }, HELLO_WITHIN_MS);
    ws.on('message', (data) => { try { l.room.message(conn, data.toString()); } catch (e) { console.error(`table ${code}:`, e); } });
    ws.on('close', () => { clearTimeout(helloTimer); l.room.disconnect(conn); if (!l.room.connectionCount) l.idleSince = Date.now(); });
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
