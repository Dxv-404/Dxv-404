// The ingestion layer: what a table server does with a batch of research events from a phone, and how it
// passes events on to the database. The same code runs on the Cloudflare worker and the Oracle (Node)
// server. Phones never write to the database themselves: the server checks every event, stamps it with
// its own clock, and signs the database call with the table servers' recorder key.
import { checkBatch, type Envelope } from './schema';

/** Per-device limits: a phone sends a batch every few seconds; a burst after hours offline is allowed. */
export class RateLimiter {
  private buckets = new Map<string, { batches: number; bytes: number; at: number }>();
  constructor(private perMinute = { batches: 60, bytes: 4_000_000 }, private now: () => number = Date.now, private maxKeys = 5000) {}

  /** May `key` send a batch of `bytes` now? (Token buckets refilled continuously, capacity one minute's worth.) */
  take(key: string, bytes: number): boolean {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) this.buckets.delete(this.buckets.keys().next().value!);
      b = { batches: this.perMinute.batches, bytes: this.perMinute.bytes, at: t };
      this.buckets.set(key, b);
    }
    const k = Math.max(0, t - b.at) / 60_000;
    b.batches = Math.min(this.perMinute.batches, b.batches + k * this.perMinute.batches);
    b.bytes = Math.min(this.perMinute.bytes, b.bytes + k * this.perMinute.bytes);
    b.at = t;
    if (b.batches < 1 || b.bytes < bytes) return false;
    b.batches -= 1; b.bytes -= bytes;
    return true;
  }
}

export interface IngestDeps {
  now(): number;
  limiter: RateLimiter;
  /** Pass checked events on (to the database). false or a throw: not stored, the phone keeps them. */
  forward(events: Envelope[]): Promise<boolean>;
  log?(m: string): void;
}

export interface IngestReply { status: number; body: Record<string, unknown> }

/** One POST /research/ingest. The reply carries the server's clock (`st`), which phones use as a clock sample. */
export async function ingest(raw: string, d: IngestDeps): Promise<IngestReply> {
  const st = d.now();
  const checked = checkBatch(raw, 'c');
  if ('error' in checked) return { status: checked.error === 'too large' ? 413 : 400, body: { ok: false, error: checked.error, st } };
  const key = checked.ok[0]?.d ?? checked.ok[0]?.s ?? 'unknown';
  if (!d.limiter.take(key, raw.length)) return { status: 429, body: { ok: false, error: 'rate limited', st } };
  for (const e of checked.ok) e.ts = st;
  if (checked.ok.length) {
    let stored = false;
    try { stored = await d.forward(checked.ok); } catch (e) { d.log?.(`research ingest: ${String(e)}`); }
    if (!stored) return { status: 503, body: { ok: false, error: 'not stored', st: d.now() } };
  }
  return { status: 200, body: { ok: true, st, accepted: checked.ok.length, rejected: checked.rejected.length, ...(checked.rejected.length ? { why: checked.rejected.slice(0, 5) } : {}) } };
}

/** The bit of fetch this needs (this package is built without DOM types). */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
const globalFetch: FetchLike = (u, i) => (globalThis as unknown as { fetch: FetchLike }).fetch(u, i);

/** The database call, signed like every other table-server call (see record.ts tokenSigner). */
export function databaseWriter(url: string, key: string, sign: (body: string) => Promise<string>, fetchFn: FetchLike = globalFetch): (events: Envelope[]) => Promise<boolean> {
  return async (events) => {
    const body = JSON.stringify({ events });
    const res = await fetchFn(`${url}/rest/v1/rpc/research_ingest`, { method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ p_body: body, p_sig: await sign(body) }) });
    if (!res.ok) throw new Error(`research_ingest ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return true;
  };
}

/** CORS for the app's requests (plain text bodies, so no preflight is needed; answered anyway). */
export const INGEST_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Cache-Control': 'no-store' } as const;
