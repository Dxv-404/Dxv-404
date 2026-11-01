// Table server for an ordinary Linux machine (the free Oracle server in Hyderabad).
// Same routes as the Cloudflare Worker: /health, /latency and a live connection at /table/CODE.
// Phase 2 replaces the echo with the real table rooms.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { WebSocketServer, type WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '@tp/protocol';
import { LATENCY_PAGE } from './latency-page';

const PORT = Number(process.env.PORT ?? 8080);
const SITE = process.env.SITE_NAME ?? 'HYD';
const VERSION = (() => { try { return readFileSync(process.env.VERSION_FILE ?? '', 'utf8').trim(); } catch { return 'dev'; } })();
const rooms = new Map<string, Set<WebSocket>>();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', ...cors });
    res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, colo: SITE, country: req.headers['cf-ipcountry'] ?? null, version: VERSION, rooms: rooms.size }));
    return;
  }
  if (url.pathname === '/latency') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...cors });
    res.end(LATENCY_PAGE);
    return;
  }
  res.writeHead(404, cors);
  res.end('Not found');
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const m = /^\/table\/([A-Z0-9]{4,12})$/.exec(new URL(req.url ?? '/', 'http://local').pathname);
  if (!m) { socket.destroy(); return; }
  const code = m[1]!;
  wss.handleUpgrade(req, socket, head, (ws) => {
    const room = rooms.get(code) ?? new Set();
    rooms.set(code, room);
    room.add(ws);
    ws.on('message', (data) => {
      const text = data.toString();
      if (text === 'where') return ws.send(`where:${SITE}`);
      if (text.startsWith('ping:')) return ws.send(`pong:${text.slice(5)}`);
      for (const peer of room) peer.send(`echo:${text}`);
    });
    ws.on('close', () => { room.delete(ws); if (!room.size) rooms.delete(code); });
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`table server ${VERSION} on 127.0.0.1:${PORT} (${SITE})`));
