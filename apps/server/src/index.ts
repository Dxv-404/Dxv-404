// The Cloudflare table server (the backup to the Oracle server in Hyderabad): one Durable Object per table.
import { DurableObject } from 'cloudflare:workers';
import { PROTOCOL_VERSION, VAPID_PUBLIC_KEY, PUSH_SUBJECT } from '@tp/protocol';
import { TableRoom, Recorder, tokenSigner, supabaseSend, supabaseRpc, deliver, drainOutbox, verifySigned, checkOfflineUpload, offlineEvents, MAX_UPLOAD_BYTES, type Conn, type ConnInfo, type Persisted, type OutboxItem, type PushDeps, type PushRequest } from '@tp/table';
import { INGEST_HEADERS, RateLimiter, ResearchShipper, archiveDb, databaseWriter, ingest, runArchive, type Envelope } from '@tp/research';
import { cachedTicketChecker, checkTicket, SUPABASE_KEY, SUPABASE_URL } from '@tp/account/ticket';

// signed-in phones show a ticket; the accounts database says whose it is (cached while this isolate lives)
const identify = cachedTicketChecker();
import { LATENCY_PAGE } from './latency-page';
import { TAP_PAGE } from './tap-page';

export interface Env {
  TABLES: DurableObjectNamespace<Table>; ECHO: DurableObjectNamespace<Echo>; RECORDER_TOKEN?: string; VAPID_PRIVATE?: string; BACKUPS?: KVNamespace;
  /** Research: the archive bucket (R2), how many days the database keeps, most rows one archive run moves, and an off switch. */
  RESEARCH_ARCHIVE?: R2Bucket; RESEARCH_KEEP_DAYS?: string; RESEARCH_ARCHIVE_MAX_ROWS?: string; RESEARCH_OFF?: string;
}

// ---------------- research ----------------
/** The research database writer (signed like the league recorder), or null when this server cannot record. */
function researchWriter(env: Env): ((events: Envelope[]) => Promise<boolean>) | null {
  if (!env.RECORDER_TOKEN || env.RESEARCH_OFF === '1') return null;
  return databaseWriter(SUPABASE_URL, SUPABASE_KEY, tokenSigner(env.RECORDER_TOKEN));
}
// (per isolate: a phone's batches usually reach the same one; the database is the real limit)
const researchLimiter = new RateLimiter();
const RESEARCH_CRON = '47 22 * * *';

/** POST /research/ingest (the app's events), GET /research/ping (a clock sample). */
async function researchRoute(request: Request, env: Env, path: string): Promise<Response> {
  const headers = { ...INGEST_HEADERS, 'content-type': 'application/json' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: INGEST_HEADERS });
  if (path === '/research/ping') return Response.json({ st: Date.now() }, { headers });
  if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: INGEST_HEADERS });
  const write = researchWriter(env);
  if (!write) return Response.json({ ok: false, error: 'not recording', st: Date.now() }, { status: 503, headers });
  if (Number(request.headers.get('content-length') ?? 0) > 600_000) return Response.json({ ok: false, error: 'too large', st: Date.now() }, { status: 413, headers });
  const r = await ingest(await request.text(), { now: Date.now, limiter: researchLimiter, forward: write, log: (m) => console.log(m) });
  return Response.json(r.body, { status: r.status, headers });
}

const toBytes = async (s: ReadableStream): Promise<Uint8Array> => new Uint8Array(await new Response(s).arrayBuffer());
const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
/** The daily research archive: old days to the R2 bucket, checked, then deleted from the database. */
async function researchArchive(env: Env): Promise<void> {
  if (!env.RECORDER_TOKEN || !env.RESEARCH_ARCHIVE) { console.log('research archive: no bucket or key, skipped'); return; }
  const sign = tokenSigner(env.RECORDER_TOKEN);
  const bucket = env.RESEARCH_ARCHIVE;
  const call = async (fn: string, body: Record<string, unknown>): Promise<unknown> => {
    const b = JSON.stringify(body);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ p_body: b, p_sig: await sign(b) }) });
    if (!r.ok) throw new Error(`${fn} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };
  await runArchive({
    db: archiveDb(call),
    bucket: {
      put: async (key, data, meta) => { await bucket.put(key, data, { customMetadata: meta, sha256: meta.sha256 && meta.sha256.length === 64 ? meta.sha256 : undefined }); },
      get: async (key) => { const o = await bucket.get(key); return o ? new Uint8Array(await o.arrayBuffer()) : null; },
    },
    gzip: (d) => toBytes(new Blob([d]).stream().pipeThrough(new CompressionStream('gzip'))),
    gunzip: (d) => toBytes(new Blob([d]).stream().pipeThrough(new DecompressionStream('gzip'))),
    sha256: async (d) => hex(await crypto.subtle.digest('SHA-256', d)),
    now: Date.now,
    log: (m) => console.log(m),
  }, { keepDays: Number(env.RESEARCH_KEEP_DAYS ?? 14) || 14, maxRows: Number(env.RESEARCH_ARCHIVE_MAX_ROWS ?? 40_000) || 40_000 });
}

/** Push sending needs both the recorder token (to ask the database who) and the push key. */
function pushDeps(env: Env): PushDeps | null {
  if (!env.RECORDER_TOKEN || !env.VAPID_PRIVATE) return null;
  return { sign: tokenSigner(env.RECORDER_TOKEN), rpc: supabaseRpc(SUPABASE_URL, SUPABASE_KEY), vapid: { publicKey: VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE, subject: PUSH_SUBJECT }, log: (m) => console.log(m) };
}
const isPush = (p: unknown): p is PushRequest => {
  const o = p as PushRequest;
  return !!o && (o.kind === 'turn' || o.kind === 'crewTable') && typeof o.title === 'string' && o.title.length <= 60 && typeof o.body === 'string' && o.body.length <= 200
    && typeof o.url === 'string' && /^\/#\/t\/[A-Z0-9]{4}$/.test(o.url) && typeof o.tag === 'string' && o.tag.length <= 40
    && (o.accounts === undefined || (Array.isArray(o.accounts) && o.accounts.length <= 20 && o.accounts.every((x) => typeof x === 'string')))
    && (o.except === undefined || (Array.isArray(o.except) && o.except.length <= 60 && o.except.every((x) => typeof x === 'string')))
    && (o.crew === undefined || (typeof o.crew === 'string' && /^[0-9a-f-]{36}$/.test(o.crew)));
};

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

type Attachment = ConnInfo;

/**
 * One table. Runs the same TableRoom as the Oracle server. Hibernation lets Cloudflare put an idle table
 * to sleep while phones stay connected; on waking, the table is rebuilt from storage and the open
 * sockets are handed back with the seat each one said hello for (kept in the socket's attachment).
 */
export class Table extends DurableObject<Env> {
  private room: TableRoom | null = null;
  private conns = new Map<WebSocket, Conn>();
  private recorder: Recorder | null = null;
  /** Research events of this table, on their way to the database (null when this server does not record). */
  private research: ResearchShipper | null = null;
  /** One alarm serves both the table's timers and the league outbox's retries. */
  private roomAt: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      if (env.RECORDER_TOKEN) {
        const storage = ctx.storage;
        this.recorder = new Recorder({
          load: async () => [...(await storage.list<OutboxItem>({ prefix: 'outbox:' })).values()],
          put: async (it) => { await storage.put(`outbox:${it.id}`, it); },
          remove: async (id) => { await storage.delete(`outbox:${id}`); },
        }, tokenSigner(env.RECORDER_TOKEN), supabaseSend(SUPABASE_URL, SUPABASE_KEY), Date.now, (m) => console.log(m));
        await this.recorder.start();
      }
      const write = researchWriter(env);
      if (write) {
        const storage = ctx.storage;
        this.research = new ResearchShipper({
          write, now: Date.now, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
          keepAlive: (p) => ctx.waitUntil(p), log: (m) => console.log(m),
          store: {
            load: async () => [...(await storage.list<Envelope[]>({ prefix: 'research:' })).entries()].map(([key, events]) => ({ key, events })),
            put: async (key, events) => { await storage.put(`research:${key}`, events); },
            remove: async (key) => { await storage.delete(key.startsWith('research:') ? key : `research:${key}`); },
          },
        });
        await this.research.start();
      }
      this.roomAt = (await ctx.storage.get<number>('roomAt')) ?? null;
      const code = await ctx.storage.get<string>('code');
      if (code) this.init(code, (await ctx.storage.get<Persisted>('table')) ?? null);
    });
  }

  private setAlarm(): void {
    const at = [this.roomAt, this.recorder?.nextAt ?? null].filter((x): x is number => x !== null);
    void (at.length ? this.ctx.storage.setAlarm(Math.max(Date.now(), Math.min(...at))) : this.ctx.storage.deleteAlarm());
  }

  private init(code: string, saved: Persisted | null): TableRoom {
    const storage = this.ctx.storage;
    const room = new TableRoom(code, {
      now: () => Date.now(),
      schedule: (at) => { this.roomAt = at; void storage.put('roomAt', at); this.setAlarm(); },
    }, {
      save: (p) => { void storage.put('table', p); },
      appendHand: (h) => { void storage.put(`hand:${String(h.handNo).padStart(6, '0')}`, h); },
      league: (kind, id, payload) => {
        if (!this.recorder) return;
        this.ctx.waitUntil(this.recorder.add(kind === 'hand' ? 'record_hand' : 'record_game_end', id, payload).finally(() => this.setAlarm()));
      },
    }, saved, {
      identify, server: 'cloudflare',
      ...(this.research ? { research: { emit: (e: Envelope) => this.research!.emit(e) } } : {}),
      push: (p) => { const d = pushDeps(this.env); if (d) this.ctx.waitUntil(deliver(p, d).catch((e: unknown) => console.error('push failed', e))); },
    });
    this.room = room;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      const c = this.conn(ws);
      if (a?.hello) room.adopt(c, a.pid, { ...(a.device ? { device: a.device } : {}), ...(a.account ? { account: a.account } : {}), ...(a.info ? { info: a.info } : {}) });
      else room.connect(c);
    }
    room.settleAfterRestart();
    return room;
  }

  /** A night played offline: checked here (every hand replayed), then sent by this object's recorder. */
  private async offlineUpload(request: Request): Promise<Response> {
    const text = await request.text();
    if (text.length > MAX_UPLOAD_BYTES + 1024) return Response.json({ error: 'Too large' }, { status: 413 });
    if (!this.recorder) return Response.json({ error: 'This server cannot record games' }, { status: 503 });
    let up;
    try { up = checkOfflineUpload(JSON.parse(text) as { id?: unknown; fn?: unknown; body?: unknown }); }
    catch (e) { return Response.json({ error: (e as Error).message }, { status: 422 }); }
    await this.recorder.add(up.fn, up.id, up.payload);
    this.setAlarm();
    if (this.research) try { for (const e of offlineEvents(up)) this.research.emit(e); } catch (e) { console.error('research: offline upload', e); }
    return Response.json({ queued: up.id });
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
    if (new URL(request.url).pathname === '/offline/upload') return this.offlineUpload(request);
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
    if (info && (info.hello !== had?.hello || info.pid !== had?.pid || info.account !== had?.account)) ws.serializeAttachment(info satisfies Attachment);
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
    if (this.roomAt !== null && Date.now() >= this.roomAt) { this.roomAt = null; this.room?.wake(); }
    await this.recorder?.flush();
    this.setAlarm();
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
    if (url.pathname === '/research/ingest' || url.pathname === '/research/ping') return researchRoute(request, env, url.pathname);
    if (url.pathname === '/health') {
      const cf = (request as Request & { cf?: { colo?: string; country?: string } }).cf;
      return Response.json({ ok: true, protocol: PROTOCOL_VERSION, colo: cf?.colo, country: cf?.country }, { headers: cors });
    }
    // the Oracle server hands its pushes here (the push key is kept only on Cloudflare)
    if (url.pathname === '/push/send' && request.method === 'POST') {
      const d = pushDeps(env);
      if (!d || !env.RECORDER_TOKEN) return new Response('push is not set up', { status: 503 });
      const raw = await request.text();
      if (raw.length > 4000) return new Response('too big', { status: 413 });
      let msg: { body?: string; sig?: string };
      try { msg = JSON.parse(raw) as typeof msg; } catch { return new Response('bad', { status: 400 }); }
      if (typeof msg.body !== 'string' || typeof msg.sig !== 'string' || !(await verifySigned(env.RECORDER_TOKEN, msg.body, msg.sig))) return new Response('not a table server', { status: 403 });
      let p: unknown;
      try { p = JSON.parse(msg.body); } catch { return new Response('bad', { status: 400 }); }
      if (!isPush(p)) return new Response('bad push', { status: 400 });
      return Response.json(await deliver(p, d));
    }
    // nights played offline go through one table object (it has a recorder and an outbox)
    if (url.pathname === '/offline/upload' && request.method === 'POST') return env.TABLES.get(env.TABLES.idFromName('__offline_uploads__'), { locationHint: 'apac' }).fetch(request);
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

  // Daily keep-alive: a free Supabase project pauses after 7 days with no activity, and accounts would
  // stop working until someone restored it by hand. One tiny database call a day prevents that.
  // It also closes seasons whose end has passed (trophies for the winner and the iron chair).
  async scheduled(event, env, ctx): Promise<void> {
    // daily: research events older than RESEARCH_KEEP_DAYS go to the R2 archive (checked), then leave the database
    if (event.cron === RESEARCH_CRON) { ctx.waitUntil(researchArchive(env).catch((e: unknown) => console.error('research archive failed', e))); return; }
    // every few minutes: pushes the database queued (approved into a crew, trophies, a season's end)
    if (event.cron !== '23 21 * * *') {
      const d = pushDeps(env);
      if (d) ctx.waitUntil(drainOutbox(d).then((r) => { if (r.sent + r.gone + r.failed) console.log(`push outbox: ${JSON.stringify(r)}`); }, (e: unknown) => console.error('push outbox failed', e)));
      return;
    }
    ctx.waitUntil(checkTicket('keep-alive', 'KEEP').then(
      () => console.log('keep-alive: accounts database answered'),
      (e: unknown) => console.error('keep-alive failed', e),
    ));
    if (env.RECORDER_TOKEN) {
      const sign = tokenSigner(env.RECORDER_TOKEN);
      const call = async (fn: string, body: string) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ p_body: body, p_sig: await sign(body) }),
      });
      // close finished seasons, drop replays older than 90 days
      ctx.waitUntil(call('daily_upkeep', JSON.stringify({ upkeep: new Date().toISOString() })).then(async (r) => console.log(`upkeep: ${await r.text()}`), (e: unknown) => console.error('upkeep failed', e)));
      // a second copy of the nightly backup, away from the Oracle machine (last 30 nights)
      if (env.BACKUPS) {
        const kv = env.BACKUPS;
        ctx.waitUntil((async () => {
          const r = await call('export_backup', JSON.stringify({ backup: new Date().toISOString() }));
          if (!r.ok) throw new Error(`export ${r.status}`);
          const gz = await new Response(r.body!.pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
          const day = new Date().toISOString().slice(0, 10);
          await kv.put(`backup:${day}`, gz, { expirationTtl: 31 * 86_400, metadata: { bytes: gz.byteLength } });
          console.log(`backup ${day}: ${gz.byteLength} bytes`);
        })().catch((e: unknown) => console.error('backup failed', e)));
      }
    }
  },
} satisfies ExportedHandler<Env>;
