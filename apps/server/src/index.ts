// The Cloudflare table server (the backup to the Oracle server in Hyderabad): one Durable Object per table.
import { DurableObject } from 'cloudflare:workers';
import { PROTOCOL_VERSION } from '@tp/protocol';
import { TableRoom, type Conn, type Persisted } from '@tp/table';
import { LATENCY_PAGE } from './latency-page';
import { TAP_PAGE } from './tap-page';

export interface Env { TABLES: DurableObjectNamespace<Table>; ECHO: DurableObjectNamespace<Echo> }

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

interface Attachment { pid: string | null; hello: boolean }

/**
 * One table. Runs the same TableRoom as the Oracle server. Hibernation lets Cloudflare put an idle table
 * to sleep while phones stay connected; on waking, the table is rebuilt from storage and the open
 * sockets are handed back with the seat each one said hello for (kept in the socket's attachment).
 */
export class Table extends DurableObject<Env> {
  private room: TableRoom | null = null;
  private conns = new Map<WebSocket, Conn>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const code = await ctx.storage.get<string>('code');
      if (code) this.init(code, (await ctx.storage.get<Persisted>('table')) ?? null);
    });
  }

  private init(code: string, saved: Persisted | null): TableRoom {
    const storage = this.ctx.storage;
    const room = new TableRoom(code, {
      now: () => Date.now(),
      schedule: (at) => { void (at === null ? storage.deleteAlarm() : storage.setAlarm(at)); },
    }, {
      save: (p) => { void storage.put('table', p); },
      appendHand: (h) => { void storage.put(`hand:${String(h.handNo).padStart(6, '0')}`, h); },
    }, saved);
    this.room = room;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      const c = this.conn(ws);
      if (a?.hello) room.adopt(c, a.pid);
      else room.connect(c);
    }
    room.settleAfterRestart();
    return room;
  }

  private conn(ws: WebSocket): Conn {
    let c = this.conns.get(ws);
    if (!c) {
      c = { send: (t) => ws.send(t), close: (code, reason) => ws.close(code, reason) };
      this.conns.set(ws, c);
    }
    return c;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const code = new URL(request.url).pathname.split('/').pop()!;
    if (!this.room) {
      await this.ctx.storage.put('code', code);
      this.init(code, null);
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ pid: null, hello: false } satisfies Attachment);
    this.room!.connect(this.conn(pair[1]));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const room = this.room;
    if (!room) { ws.close(4005, 'no table'); return; }
    const c = this.conn(ws);
    room.message(c, typeof message === 'string' ? message : new TextDecoder().decode(message));
    const info = room.connInfo(c);
    const had = ws.deserializeAttachment() as Attachment | null;
    if (info && (info.hello !== had?.hello || info.pid !== had?.pid)) ws.serializeAttachment(info satisfies Attachment);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.gone(ws);
    try { ws.close(code, 'bye'); } catch { /* already closed */ }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }

  private gone(ws: WebSocket): void {
    const c = this.conns.get(ws);
    if (c) this.room?.disconnect(c);
    this.conns.delete(ws);
  }

  override async alarm(): Promise<void> {
    this.room?.wake();
  }
}

/** The latency page's plain echo (no table logic). */
export class Echo extends DurableObject<Env> {
  override async fetch(): Promise<Response> {
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
    if (text.startsWith('ping:')) ws.send(`pong:${text.slice(5)}`);
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
    if (url.pathname === '/tap') return new Response(TAP_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url.pathname === '/health') {
      const cf = (request as Request & { cf?: { colo?: string; country?: string } }).cf;
      return Response.json({ ok: true, protocol: PROTOCOL_VERSION, colo: cf?.colo, country: cf?.country }, { headers: cors });
    }
    const echo = url.pathname.match(/^\/echo\/([A-Z0-9]{4,12})$/);
    if (echo) {
      const cf = (request as Request & { cf?: { country?: string; continent?: string } }).cf;
      const hint = regionFor(cf?.country, cf?.continent, url.searchParams.get('region'));
      return env.ECHO.get(env.ECHO.idFromName(echo[1]!), hint ? { locationHint: hint } : undefined).fetch(request);
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
