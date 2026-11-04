// A stand-in for the accounts project, for end-to-end tests that must never touch the live one: a fresh local
// Postgres database with every migration applied (as `pnpm test:db` makes it), behind just enough of Supabase's
// HTTP API for the app and the table servers: anonymous sign-in, rpc calls and the few table reads the app makes.
// Every call runs as the signed-in device (testing.as_phone: the authenticated role, row-level security on),
// so the database's own rules are what the test exercises.
//
// Browsers reach it through context routing (useFakeSupabase); table servers through SUPABASE_URL (url).
import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BrowserContext } from '@playwright/test';

const ROOT = join(import.meta.dirname, '..');
const PG = ['-h', process.env.PGHOST ?? '/tmp', '-p', process.env.PGPORT ?? '54329', '-U', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1'];
const LIVE = 'https://yghyartpurzwogtldzii.supabase.co';

function psql(args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = execFile('psql', [...PG, ...args], { maxBuffer: 32 * 1024 * 1024 }, (err, out, errOut) => (err ? reject(new Error(`${err.message}\n${errOut}`)) : resolve(out)));
    if (input !== undefined) { p.stdin!.end(input); }
  });
}
const lit = (v: unknown): string => {
  if (v === null || v === undefined) return 'null';
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return `'${t.replace(/'/g, "''")}'`;
};
const ident = (s: string): string => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad name ${s}`); return s; };

export interface FakeSupabase {
  url: string;
  db: string;
  /** Run SQL as the database owner (setting up a test, or looking behind the scenes). Returns psql's -tA output. */
  sql(q: string): Promise<string>;
  /** The auth user (device) behind an access token a page holds. */
  close(): Promise<void>;
}

/** What a request asks, answered like Supabase would. */
interface Reply { status: number; body: string; headers?: Record<string, string> }

export async function startFakeSupabase(): Promise<FakeSupabase> {
  const db = `tp_e2e_${process.pid}_${Math.floor(Math.random() * 1e6)}`;
  await psql(['-d', 'postgres', '-c', `create database ${db}`]);
  await psql(['-d', db, '-f', join(ROOT, 'supabase/tests/local-shim.sql')]);
  for (const m of readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) await psql(['-d', db, '-f', join(ROOT, 'supabase/migrations', m)]);
  const retset = new Map<string, boolean>();
  // (a long query goes in on stdin: a command-line argument is limited to 128 KB)
  const one = async (q: string): Promise<string> => (await (q.length > 60_000 ? psql(['-d', db, '-tA'], q.endsWith(';') ? q : `${q};`) : psql(['-d', db, '-tA', '-c', q]))).replace(/\n$/, '');

  /** Run a query as the device `user` (null: not signed in); the rows as JSON, or a Supabase-style error. */
  async function asDevice(user: string | null, q: string): Promise<{ rows?: unknown[]; error?: { message: string; code: string } }> {
    const out = await one(`select testing.as_phone(${user ? lit(user) + '::uuid' : 'null'}, ${lit(q)})`);
    const r = JSON.parse(out || '[]') as unknown;
    if (r && !Array.isArray(r)) { const e = r as { error: string; code: string }; return { error: { message: e.error, code: e.code } }; }
    return { rows: r as unknown[] };
  }

  const tokenFor = (user: string): string => {
    const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: user, role: 'authenticated', aud: 'authenticated', is_anonymous: true, iat: now, exp: now + 3600 })}.fake`;
  };
  const session = (user: string): string => {
    const now = Math.floor(Date.now() / 1000);
    return JSON.stringify({
      access_token: tokenFor(user), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: user,
      user: { id: user, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: { provider: 'anonymous' }, user_metadata: {}, identities: [], created_at: new Date().toISOString() },
    });
  };
  const userOf = (auth: string | undefined): string | null => {
    const t = auth?.replace(/^Bearer /i, '') ?? '';
    const part = t.split('.')[1];
    if (!part) return null;
    try { const p = JSON.parse(Buffer.from(part, 'base64url').toString()) as { sub?: string }; return p.sub ?? null; } catch { return null; }
  };
  const json = (status: number, v: unknown): Reply => ({ status, body: JSON.stringify(v) });

  async function handle(method: string, url: URL, headers: Record<string, string | undefined>, body: string): Promise<Reply> {
    const path = url.pathname;
    const user = userOf(headers.authorization);
    // ---- auth
    if (path === '/auth/v1/signup' && method === 'POST') return { status: 200, body: session(randomUUID()) };
    if (path === '/auth/v1/token') return { status: 200, body: session((JSON.parse(body || '{}') as { refresh_token?: string }).refresh_token ?? randomUUID()) };
    if (path === '/auth/v1/user') return user ? { status: 200, body: JSON.stringify(JSON.parse(session(user)).user) } : json(401, { message: 'no user' });
    if (path === '/auth/v1/logout') return { status: 204, body: '' };
    // ---- functions
    const rpc = /^\/rest\/v1\/rpc\/([a-z_0-9]+)$/.exec(path);
    if (rpc) {
      const fn = ident(rpc[1]!);
      const args = (body ? JSON.parse(body) : {}) as Record<string, unknown>;
      if (!retset.has(fn)) retset.set(fn, (await one(`select proretset from pg_proc where proname = ${lit(fn)} and pronamespace = 'public'::regnamespace`)) === 't');
      const call = `public.${fn}(${Object.entries(args).map(([k, v]) => `${ident(k)} => ${lit(v)}`).join(', ')})`;
      const r = await asDevice(user, retset.get(fn) ? `select * from ${call}` : `select ${call} as r`);
      if (r.error) return json(r.error.code === '42501' ? 403 : 400, { code: r.error.code, message: r.error.message, details: null, hint: null });
      return json(200, retset.get(fn) ? r.rows : (r.rows![0] as { r: unknown } | undefined)?.r ?? null);
    }
    // ---- table reads (and the profile's rename)
    const tbl = /^\/rest\/v1\/([a-z_]+)$/.exec(path);
    if (tbl) return table(ident(tbl[1]!), method, url, headers, body, user);
    return json(404, { message: `fake supabase: no ${method} ${path}` });
  }

  /** The few PostgREST reads the app makes: plain columns, eq filters, order, limit, and one level of embedded rows. */
  const EMBED: Record<string, Record<string, string>> = {
    crew_members: { crews: 'crew_id', accounts: 'account_id' }, crew_audit: { accounts: 'actor' }, result_changes: { accounts: 'actor' },
    rescue_requests: { accounts: 'target_account' },
  };
  async function table(t: string, method: string, url: URL, headers: Record<string, string | undefined>, body: string, user: string | null): Promise<Reply> {
    const where: string[] = [];
    let order = '', limit = '';
    for (const [k, v] of url.searchParams) {
      if (k === 'select' || k === 'columns') continue;
      if (k === 'order') { order = ' order by ' + v.split(',').map((o) => { const [c, dir] = o.split('.'); return `${ident(c!)} ${dir === 'desc' ? 'desc' : 'asc'}`; }).join(', '); continue; }
      if (k === 'limit') { limit = ` limit ${Number(v)}`; continue; }
      const m = /^eq\.(.*)$/.exec(v);
      if (m) where.push(`t.${ident(k)} = ${lit(m[1])}`);
    }
    const w = where.length ? ` where ${where.join(' and ')}` : '';
    let r: { rows?: unknown[]; error?: { message: string; code: string } };
    if (method === 'PATCH') {
      const set = Object.entries(JSON.parse(body) as Record<string, unknown>).map(([k, v]) => `${ident(k)} = ${lit(v)}`).join(', ');
      r = await asDevice(user, `update public.${t} t set ${set}${w} returning t.*`);
    } else {
      const sel = (url.searchParams.get('select') ?? '*').split(/,(?![^(]*\))/).map((c) => {
        const e = /^([a-z_]+)(?:!([a-z_]+))?\(([^)]*)\)$/.exec(c.trim());
        if (!e) return c.trim() === '*' ? 't.*' : `t.${ident(c.trim())}`;
        const fk = e[2] ? e[2].replace(new RegExp(`^${t}_|_fkey$`, 'g'), '') : EMBED[t]?.[e[1]!];
        if (!fk) throw new Error(`fake supabase: cannot embed ${e[1]} in ${t}`);
        const cols = e[3] === '*' ? 'x.*' : e[3]!.split(',').map((x) => `x.${ident(x.trim())}`).join(', ');
        return `(select to_jsonb(s) from (select ${cols} from public.${ident(e[1]!)} x where x.id = t.${ident(fk)}) s) as ${ident(e[1]!)}`;
      }).join(', ');
      r = await asDevice(user, `select ${sel} from public.${t} t${w}${order}${limit}`);
    }
    if (r.error) return json(400, { code: r.error.code, message: r.error.message, details: null, hint: null });
    if ((headers.accept ?? '').includes('vnd.pgrst.object')) {
      if (r.rows!.length !== 1) return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${r.rows!.length} rows`, hint: null });
      return json(200, r.rows![0]);
    }
    return json(200, r.rows);
  }

  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'content-type': 'application/json' };
  const server: Server = createServer((req: IncomingMessage, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString(); });
    req.on('end', () => {
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
      const h: Record<string, string | undefined> = { authorization: req.headers.authorization, accept: req.headers.accept };
      handle(req.method ?? 'GET', new URL(req.url ?? '/', 'http://x'), h, body)
        .then((r) => { res.writeHead(r.status, { ...cors, ...r.headers }); res.end(r.body); })
        .catch((e: unknown) => { res.writeHead(500, cors); res.end(JSON.stringify({ message: String(e) })); });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const fake = {
    url: `http://127.0.0.1:${port}`, db,
    sql: (q: string) => one(q),
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      await psql(['-d', 'postgres', '-c', `drop database if exists ${db} with (force)`]).catch(() => {});
    },
    handle,
  };
  return fake;
}

/** Point a browser context's accounts calls at the fake (nothing reaches the live project). */
export async function useFakeSupabase(ctx: BrowserContext, fake: FakeSupabase): Promise<void> {
  const handle = (fake as unknown as { handle: (m: string, u: URL, h: Record<string, string | undefined>, b: string) => Promise<Reply> }).handle;
  // (a predicate, not a glob: a glob stops at the "?" of a query, and those reads must not leave the machine either)
  await ctx.route((u) => u.origin === LIVE, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const hd = req.headers();
    try {
      const r = await handle(req.method(), new URL(req.url()), { authorization: hd.authorization, accept: hd.accept }, req.postData() ?? '');
      if (process.env.FAKE_SUPABASE_LOG && r.status >= 400) console.log(`fake supabase: ${req.method()} ${req.url()} -> ${r.status} ${r.body.slice(0, 300)}`);
      await route.fulfill({ status: r.status, body: r.body, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
    } catch (e) {
      console.error(`fake supabase: ${req.method()} ${req.url()}: ${String(e)}`);
      await route.fulfill({ status: 500, body: JSON.stringify({ message: String(e) }), headers: { 'content-type': 'application/json' } });
    }
  });
}
