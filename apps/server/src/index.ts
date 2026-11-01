// Phase 0 early check: one Durable Object per table, holding live WebSocket connections.
// Measures round-trip time from phones in India; the real table logic arrives in Phase 2.
import { DurableObject } from 'cloudflare:workers';
import { PROTOCOL_VERSION } from '@tp/protocol';
import { LATENCY_PAGE } from './latency-page';




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
