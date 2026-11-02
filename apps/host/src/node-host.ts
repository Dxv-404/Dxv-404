// The offline host on an ordinary computer: runs the same bundled table server (dist/host-runtime.js) the
// Android app runs in QuickJS, behind the same routes, so the tests can play whole offline nights with many
// phones, restarts and a "continue on another phone" without an Android device. The Android app
// (HostService.kt) is a line-by-line port of this file's routes and timers.
//
//   node dist/node-host.mjs   PORT=8765 DATA_DIR=./host-data WEB_DIR=../web/dist UPLOAD_URL=https://...
import { createServer, type IncomingMessage } from 'node:http';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, appendFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { randomFillSync } from 'node:crypto';
import vm from 'node:vm';
import { WebSocketServer, type WebSocket } from 'ws';

const PORT = Number(process.env.PORT ?? 8765);
const DATA = process.env.DATA_DIR ?? join(process.cwd(), 'host-data');
const WEB = process.env.WEB_DIR ?? join(process.cwd(), '../web/dist');
const RUNTIME = process.env.RUNTIME ?? join(import.meta.dirname, 'host-runtime.js');
const UPLOAD_URL = process.env.UPLOAD_URL ?? '';
mkdirSync(join(DATA, 'outbox'), { recursive: true });
const tableFile = join(DATA, 'table.json');

interface HostRuntime {
  start(saved: string, tuning?: string): string; reset(): string; continueFrom(cp: string, host: string): string;
  open(id: number): void; message(id: number, text: string): void; closed(id: number): void; wake(): void; stats(): string;
}

const sockets = new Map<number, WebSocket>();
let timer: NodeJS.Timeout | null = null;
const write = (file: string, text: string): void => { writeFileSync(`${file}.tmp`, text); renameSync(`${file}.tmp`, file); };
const native = {
  send: (id: number, text: string) => { const ws = sockets.get(id); if (ws?.readyState === ws?.OPEN) ws!.send(text); },
  close: (id: number, code: number, reason: string) => { sockets.get(id)?.close(code, reason); },
  schedule: (at: number) => {
    if (timer) clearTimeout(timer);
    timer = at < 0 ? null : setTimeout(() => { timer = null; call(() => rt.wake()); }, Math.min(Math.max(0, at - Date.now()), 2 ** 31 - 1));
  },
  save: (json: string) => { if (json) write(tableFile, json); else if (existsSync(tableFile)) unlinkSync(tableFile); },
  appendHand: (json: string) => appendFileSync(join(DATA, 'hands.jsonl'), json + '\n'),
  league: (kind: string, id: string, payload: string) => {
    write(join(DATA, 'outbox', `${String(Date.now()).padStart(15, '0')}-${encodeURIComponent(id)}.json`), JSON.stringify({ id, fn: kind === 'hand' ? 'record_hand' : 'record_game_end', body: payload }));
    void upload();
  },
  log: (m: string) => console.log(`[table] ${m}`),
};
const ctx = vm.createContext({ native, crypto: { getRandomValues: (a: Uint8Array) => randomFillSync(a) } });
vm.runInContext(`${readFileSync(RUNTIME, 'utf8')};globalThis.TPHost = TPHost;`, ctx, { filename: 'host-runtime.js' });
const rt = (ctx as unknown as { TPHost: HostRuntime }).TPHost;
// one call at a time, as on the phone
const call = <T>(fn: () => T): T | undefined => { try { return fn(); } catch (e) { console.error('[table]', e); return undefined; } };
console.log(`table: ${call(() => rt.start(existsSync(tableFile) ? readFileSync(tableFile, 'utf8') : '', process.env.TP_TUNING ?? ''))}`);

// ---------------- uploading the night to the league ----------------
let uploading = false;
async function upload(): Promise<void> {
  if (!UPLOAD_URL || uploading) return;
  uploading = true;
  try {
    for (const f of readdirSync(join(DATA, 'outbox')).filter((x) => x.endsWith('.json')).sort()) {
      const item = JSON.parse(readFileSync(join(DATA, 'outbox', f), 'utf8')) as { id: string; fn: string; body: string };
      const res = await fetch(`${UPLOAD_URL}/offline/upload`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(item), signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (!res) return; // no internet yet: try again later
      const answer = await res.text();
      if (res.ok) unlinkSync(join(DATA, 'outbox', f));
      else if (res.status === 422) { renameSync(join(DATA, 'outbox', f), join(DATA, 'outbox', `${f}.refused`)); console.error(`[upload] refused ${item.id}: ${answer}`); }
      else return; // server trouble: later
    }
  } finally { uploading = false; }
}
setInterval(() => { void upload(); }, 30_000).unref();

// ---------------- the hotspot address as a 5-digit code ----------------
import { networkInterfaces } from 'node:os';
function addresses(): string[] {
  return Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a!.address);
}
export function tableCode(ip: string): string | null {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p[0] !== 192 || p[1] !== 168) return null;
  return String(p[2]! * 256 + p[3]!).padStart(5, '0');
}

// ---------------- routes ----------------
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const local = (req: IncomingMessage): boolean => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
const readBody = (req: IncomingMessage, max = 512 * 1024): Promise<string> => new Promise((res, rej) => {
  let s = ''; req.on('data', (c) => { s += c; if (s.length > max) { rej(new Error('too big')); req.destroy(); } }); req.on('end', () => res(s)); req.on('error', rej);
});
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://host');
  const json = (code: number, o: unknown) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(o)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, GET' }); res.end(); return; }
  if (url.pathname === '/info') {
    const addrs = addresses();
    return json(200, { host: true, addresses: addrs, code: addrs.map(tableCode).find(Boolean) ?? null, table: JSON.parse(call(() => rt.stats()) ?? '{}'), outbox: readdirSync(join(DATA, 'outbox')).filter((f) => f.endsWith('.json')).length });
  }
  // only the host's own screen (this phone) may start over or carry on another table
  if (url.pathname === '/continue' || url.pathname === '/reset') {
    // only from this phone, and only from its own pages: a website open in the host's browser must not be
    // able to reset the table (browsers always say where a POST comes from)
    const origin = req.headers.origin;
    if (req.method !== 'POST' || !local(req) || (origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))) return json(403, { error: 'Only on the host phone' });
    try {
      if (url.pathname === '/reset') return json(200, { ok: call(() => rt.reset()) });
      const b = JSON.parse(await readBody(req)) as { checkpoint: string; player: string };
      return json(200, { ok: rt.continueFrom(b.checkpoint, b.player) });
    } catch (e) { return json(400, { error: (e as Error).message }); }
  }
  // the web app itself (guests' phones load it from here: the hotspot has no internet)
  let file = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  if (file === '/' || file === '/join' || !extname(file)) file = '/index.html';
  const path = join(WEB, file);
  if (!path.startsWith(WEB) || !existsSync(path)) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream', 'cache-control': file === '/index.html' || file === '/sw.js' ? 'no-store' : 'max-age=3600' });
  res.end(readFileSync(path));
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
let nextId = 1;
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url ?? '/', 'http://host').pathname !== '/table/OFFLINE') { socket.destroy(); return; }
  socket.on('error', () => socket.destroy());
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.on('error', () => ws.terminate()); // a bad frame closes that phone only, not the host
    const id = nextId++;
    sockets.set(id, ws);
    call(() => rt.open(id));
    ws.on('message', (d) => call(() => rt.message(id, d.toString())));
    ws.on('close', () => { sockets.delete(id); call(() => rt.closed(id)); });
  });
});
server.listen(PORT, process.env.HOST ?? '0.0.0.0', () => console.log(`offline host on :${PORT}, data in ${DATA}`));
process.on('SIGTERM', () => process.exit(0));
