// Phase 0 early check: one Durable Object per table, holding live WebSocket connections.
// Measures round-trip time from phones in India; the real table logic arrives in Phase 2.
import { DurableObject } from 'cloudflare:workers';
import { PROTOCOL_VERSION } from '@tp/protocol';


const LATENCY_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Train Poker latency check</title><style>body{font:17px/1.5 system-ui,sans-serif;background:#1b120d;color:#f3ead7;padding:20px}b{color:#ecd39b}pre{white-space:pre-wrap;word-break:break-all;font-size:13px}button{font:inherit;padding:10px 16px;border-radius:10px;border:1px solid #ecd39b;background:#2a1d14;color:#f3ead7}</style></head>
<body><h1>Latency check</h1><p id="out">Measuring… (about 25 seconds)</p><p><button id="copy" hidden>Copy result</button></p><pre id="raw"></pre><script>
(async () => {
  const out = document.getElementById('out');
  const stats = (t) => { t = t.slice().sort((a, b) => a - b); const q = (x) => Math.round(t[Math.min(t.length - 1, Math.floor(x * t.length))]); return { p50: q(0.5), p95: q(0.95), min: Math.round(t[0]) }; };
  // 1) phone to Cloudflare's nearest edge: small plain requests
  const http = [];
  let edge = {};
  for (let i = 0; i < 15; i++) { const t0 = performance.now(); edge = await fetch('/health?i=' + i, { cache: 'no-store' }).then((r) => r.json()); http.push(performance.now() - t0); }
  // 2) phone to the table server (Durable Object) over the live connection
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/table/LAT' + Math.floor(Math.random() * 1e6));
  await new Promise((r) => (ws.onopen = r));
  const next = () => new Promise((r) => (ws.onmessage = (m) => r(m.data)));
  ws.send('where');
  const doColo = String(await next()).slice(6);
  const live = [];
  for (let i = 0; i < 40; i++) { const t0 = performance.now(); ws.send('ping:' + i); await next(); live.push(performance.now() - t0); await new Promise((r) => setTimeout(r, 50)); }
  // 3) for comparison: round trips to cloud data centres in Mumbai and Singapore (first request warms the connection)
  const probe = async (url) => { const t = []; for (let i = 0; i < 8; i++) { const t0 = performance.now(); try { await fetch(url + '?i=' + i + '&r=' + Math.random(), { mode: 'no-cors', cache: 'no-store' }); } catch (e) { return null; } t.push(performance.now() - t0); } return stats(t.slice(1)); };
  const mumbai = await probe('https://dynamodb.ap-south-1.amazonaws.com/ping');
  const singapore = await probe('https://dynamodb.ap-southeast-1.amazonaws.com/ping');
  const hyderabad = await probe('https://dynamodb.ap-south-2.amazonaws.com/ping');
  const ua = navigator.userAgent;
  const browser = /OPR|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Edg/.test(ua) ? 'Edge' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'other';
  const net = navigator.connection ? navigator.connection.effectiveType + (navigator.connection.rtt ? ' rtt' + navigator.connection.rtt : '') : '?';
  const res = { edge: edge.colo, country: edge.country, table: doColo, http: stats(http), live: stats(live), mumbai, hyderabad, singapore, browser, net, ua: ua.slice(0, 160) };
  out.innerHTML = 'Your phone reaches Cloudflare at <b>' + res.edge + '</b>: median <b>' + res.http.p50 + ' ms</b><br>'
    + 'Table server runs at <b>' + res.table + '</b>: live median <b>' + res.live.p50 + ' ms</b>, 95th percentile <b>' + res.live.p95 + ' ms</b><br>'
    + 'For comparison, a server in Mumbai: median <b>' + (mumbai ? mumbai.p50 + ' ms' : 'unreachable') + '</b>; Hyderabad: <b>' + (hyderabad ? hyderabad.p50 + ' ms' : 'unreachable') + '</b>; Singapore: <b>' + (singapore ? singapore.p50 + ' ms' : 'unreachable') + '</b><br>'
    + 'Browser: ' + browser + ', network: ' + net;
  const text = JSON.stringify(res);
  document.getElementById('raw').textContent = text;
  const b = document.getElementById('copy'); b.hidden = false; b.onclick = () => navigator.clipboard.writeText(text).then(() => (b.textContent = 'Copied'));
})();
</script></body></html>`;

export interface Env { TABLES: DurableObjectNamespace<Table> }

type Region = 'apac' | 'weur' | 'eeur' | 'wnam' | 'enam' | 'sam' | 'oc' | 'afr' | 'me';
const REGIONS: Region[] = ['apac', 'weur', 'eeur', 'wnam', 'enam', 'sam', 'oc', 'afr', 'me'];

/** Where to place a new table server: an explicit ?region= (for tests), else by the first player's country. */
export function regionFor(country?: string, continent?: string, forced?: string | null): Region | undefined {
  if (forced && (REGIONS as string[]).includes(forced)) return forced as Region;
  if (country === 'IN' || continent === 'AS') return 'apac';
  if (continent === 'OC') return 'oc';
  if (continent === 'EU') return 'weur';
  return undefined;
}

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
    if (text === 'where') {
      const trace = await fetch('https://cloudflare.com/cdn-cgi/trace').then((r) => r.text()).catch(() => '');
      ws.send(`where:${/colo=(\w+)/.exec(trace)?.[1] ?? 'unknown'}`);
      return;
    }
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
    if (m) {
      // A table server is created where Cloudflare decides unless asked: ask for Asia-Pacific when the
      // table's first player is in India or nearby, so it is not placed in the US or Europe.
      const cf = (request as Request & { cf?: { country?: string; continent?: string } }).cf;
      const hint = regionFor(cf?.country, cf?.continent, url.searchParams.get('region'));
      const id = env.TABLES.idFromName(m[1]!);
      return env.TABLES.get(id, hint ? { locationHint: hint } : undefined).fetch(request);
    }
    return new Response('Not found', { status: 404, headers: cors });
  },
} satisfies ExportedHandler<Env>;
