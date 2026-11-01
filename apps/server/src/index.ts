// Phase 0 early check: one Durable Object per table, holding live WebSocket connections.
// Measures round-trip time from phones in India; the real table logic arrives in Phase 2.
import { DurableObject } from 'cloudflare:workers';
import { PROTOCOL_VERSION } from '@tp/protocol';


const LATENCY_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Train Poker latency check</title><style>body{font:18px/1.5 system-ui,sans-serif;background:#1b120d;color:#f3ead7;padding:20px}b{color:#ecd39b}</style></head>
<body><h1>Latency check</h1><p id="out">Measuring…</p><pre id="raw"></pre><script>
(async () => {
  const out = document.getElementById('out');
  const h = await fetch('/health').then((r) => r.json());
  const code = 'LAT' + Math.floor(Math.random() * 1e6);
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/table/' + code);
  const times = [];
  await new Promise((r) => (ws.onopen = r));
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    ws.send('ping:' + i);
    await new Promise((r) => (ws.onmessage = r));
    times.push(performance.now() - t0);
    await new Promise((r) => setTimeout(r, 60));
  }
  times.sort((a, b) => a - b);
  const p = (q) => Math.round(times[Math.min(times.length - 1, Math.floor(q * times.length))]);
  const res = { colo: h.colo, country: h.country, p50: p(0.5), p95: p(0.95), min: Math.round(times[0]), max: Math.round(times[times.length - 1]) };
  out.innerHTML = 'Data centre <b>' + res.colo + '</b> (' + res.country + ')<br>median <b>' + res.p50 + ' ms</b>, 95th percentile <b>' + res.p95 + ' ms</b>';
  out.dataset.result = JSON.stringify(res);
  document.getElementById('raw').textContent = JSON.stringify(res);
})();
</script></body></html>`;

export interface Env { TABLES: DurableObjectNamespace<Table> }

export class Table extends DurableObject<Env> {
  /** WebSocket upgrade for this table. Hibernation keeps idle tables free of duration charges. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    if (text.startsWith('ping:')) {
      ws.send(`pong:${text.slice(5)}`);
      return;
    }
    // fan out to everyone at the table, like a real action broadcast
    for (const peer of this.ctx.getWebSockets()) peer.send(`echo:${text}`);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code, 'bye');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (url.pathname === '/latency') return new Response(LATENCY_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url.pathname === '/health') {
      const cf = (request as Request & { cf?: { colo?: string; country?: string } }).cf;
      return Response.json({ ok: true, protocol: PROTOCOL_VERSION, colo: cf?.colo, country: cf?.country }, { headers: cors });
    }
    const m = url.pathname.match(/^\/table\/([A-Z0-9]{4,12})$/);
    if (m) return env.TABLES.getByName(m[1]!).fetch(request);
    return new Response('Not found', { status: 404, headers: cors });
  },
} satisfies ExportedHandler<Env>;
