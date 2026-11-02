// A local stand-in for the accounts project, for browser tests that must never touch the live one: a fresh
// Postgres database with every migration (the same as `pnpm test:db`), and a Playwright route that answers the
// app's Supabase calls from it. Anonymous sign-in makes a user id; every database function call runs as that
// phone (role authenticated, auth.uid() = its id) through testing.as_phone, exactly as PostgREST would run it.
import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Route } from '@playwright/test';

const PG = { host: process.env.PGHOST ?? '/tmp', port: String(process.env.PGPORT ?? 54329) };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SUPABASE = 'https://yghyartpurzwogtldzii.supabase.co';

export function pgUp(): boolean {
  try { execFileSync('pg_isready', ['-h', PG.host, '-p', PG.port], { stdio: 'ignore' }); return true; } catch { return false; }
}

const args = (db: string) => ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', db, '-q', '-X', '-v', 'ON_ERROR_STOP=1'];

export class LocalDb {
  readonly name = `tp_e2e_${process.pid}_${Math.floor(Math.random() * 1e6)}`;
  /** calls the stand-in could not answer (a test can check there were none) */
  readonly unknown: string[] = [];
  private kinds = new Map<string, { set: boolean; composite: boolean }>();

  create(): void {
    execFileSync('psql', [...args('postgres'), '-c', `create database ${this.name}`], { stdio: 'ignore' });
    execFileSync('psql', [...args(this.name), '-f', join(ROOT, 'supabase/tests/local-shim.sql')], { stdio: 'ignore' });
    for (const m of execFileSync('ls', [join(ROOT, 'supabase/migrations')]).toString().trim().split('\n')) {
      execFileSync('psql', [...args(this.name), '-f', join(ROOT, 'supabase/migrations', m)], { stdio: 'ignore' });
    }
    this.sqlSync(`insert into private.settings values ('recorder_token_hash', encode(extensions.digest('test-recorder-token', 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value`);
  }

  drop(): void {
    try { execFileSync('psql', [...args('postgres'), '-c', `drop database if exists ${this.name} with (force)`], { stdio: 'ignore' }); } catch { /* already gone */ }
  }

  /** Runs SQL as the database owner and returns the first column of the first row as text. */
  sqlSync(q: string): string {
    return execFileSync('psql', [...args(this.name), '-tA', '-c', q]).toString().trim();
  }
  sql(q: string): Promise<string> {
    return new Promise((res, rej) => execFile('psql', [...args(this.name), '-tA', '-c', q], { maxBuffer: 1 << 24 }, (err, out, errOut) => (err ? rej(new Error(errOut || err.message)) : res(out.trim()))));
  }

  /** A database function, called as a phone (null: not signed in), the way PostgREST answers it. */
  async rpc(user: string | null, fn: string, body: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
    if (!/^\w+$/.test(fn)) return { status: 404, json: { message: 'no such function', code: 'PGRST202' } };
    let kind = this.kinds.get(fn);
    if (!kind) {
      const r = await this.sql(`select coalesce(bool_or(p.proretset), false) || ',' || coalesce(bool_or(t.typtype = 'c'), false) from pg_proc p join pg_type t on t.oid = p.prorettype where p.proname = '${fn}' and p.pronamespace = 'public'::regnamespace`);
      const [set, comp] = r.split(',');
      kind = { set: set === 'true', composite: comp === 'true' };
      this.kinds.set(fn, kind);
    }
    const lit = (v: unknown): string => {
      if (v === null || v === undefined) return 'null';
      if (typeof v === 'boolean' || typeof v === 'number') return String(v);
      if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
      return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    };
    const call = `public.${fn}(${Object.entries(body).map(([k, v]) => `${k} => ${lit(v)}`).join(', ')})`;
    const q = kind.set || kind.composite ? `select * from ${call}` : `select ${call} as r`;
    const out = await this.sql(`select testing.as_phone(${user ? `'${user}'` : 'null'}, $tpq$${q}$tpq$)`);
    const j = JSON.parse(out || 'null') as unknown;
    if (j && !Array.isArray(j) && typeof j === 'object' && 'error' in j) {
      const e = j as { error: string; code: string };
      return { status: e.code === '42501' && /permission denied/.test(e.error) ? 401 : 400, json: { message: e.error, code: e.code, details: null, hint: null } };
    }
    const rows = (j as Record<string, unknown>[] | null) ?? [];
    if (kind.set) return { status: 200, json: rows };
    if (kind.composite) return { status: 200, json: rows[0] ?? null };
    return { status: 200, json: rows[0]?.r ?? null };
  }

  /** Answer every Supabase call of this browser context from the local database. */
  async attach(ctx: BrowserContext): Promise<void> {
    await ctx.route(`${SUPABASE}/**`, (route) => this.answer(route));
  }

  private async answer(route: Route): Promise<void> {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const bearer = (req.headers().authorization ?? '').replace(/^Bearer /, '');
    const user = userOf(bearer);
    const path = url.pathname;
    try {
      if (path === '/auth/v1/signup' || (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token')) {
        let id: string = randomUUID();
        if (path === '/auth/v1/token') { const b = req.postDataJSON() as { refresh_token?: string }; id = (b.refresh_token ?? '').replace(/^r-/, '') || id; }
        return json(200, session(id));
      }
      if (path === '/auth/v1/user') return user ? json(200, userObj(user)) : json(401, { message: 'no user' });
      if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      const m = /^\/rest\/v1\/rpc\/(\w+)$/.exec(path);
      if (m && req.method() === 'POST') {
        const r = await this.rpc(user, m[1]!, (req.postDataJSON() ?? {}) as Record<string, unknown>);
        return json(r.status, r.json);
      }
    } catch (e) { return json(500, { message: String((e as Error).message), code: 'XX000' }); }
    this.unknown.push(`${req.method()} ${path}${url.search}`);
    return json(400, { message: `The local stand-in does not answer ${path}`, code: 'PGRST000' });
  }
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(id: string): string {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 86400, is_anonymous: true, session_id: id })}.c2ln`;
}
function userOf(token: string): string | null {
  try { const p = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as { sub?: string; role?: string }; return p.role === 'authenticated' && p.sub ? p.sub : null; } catch { return null; }
}
const userObj = (id: string) => ({ id, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, identities: [], created_at: new Date().toISOString() });
const session = (id: string) => ({ access_token: jwt(id), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: `r-${id}`, user: userObj(id) });
