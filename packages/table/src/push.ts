// Delivering push notifications for the table servers. The database keeps each phone's push subscription
// and what it allowed; a signed call (only table servers can sign) asks it who to push, and the push
// itself is signed with the VAPID key, kept only on Cloudflare. The Oracle server hands its pushes to
// Cloudflare (/push/send, signed with the recorder token), so the key lives in one place.
import { sha256hex, toHex } from '@tp/engine';
import type { Signer } from './record';
import type { PushRequest } from './room';
import { sendPush, type PushMessage, type PushSubscriptionKeys, type Vapid } from './webpush';

export type Rpc = (fn: string, body: string, sig: string) => Promise<unknown>;
export interface PushDeps { sign: Signer; rpc: Rpc; vapid: Vapid; fetchFn?: typeof fetch; log?: (m: string) => void }
export interface Delivery { sent: number; gone: number; failed: number }

/** A signed database call that returns JSON (push_targets, drop_push, take_push_outbox). */
export function supabaseRpc(url: string, key: string, fetchFn: typeof fetch = fetch): Rpc {
  return async (fn, body, sig) => {
    const res = await fetchFn(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ p_body: body, p_sig: sig }), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text().catch(() => '')}`);
    return res.json();
  };
}

const nonce = () => toHex(crypto.getRandomValues(new Uint8Array(8)));

async function sendAll(list: (PushSubscriptionKeys & { msg: PushMessage })[], d: PushDeps): Promise<Delivery> {
  const out: Delivery = { sent: 0, gone: 0, failed: 0 };
  const gone: string[] = [];
  for (let i = 0; i < list.length; i += 10) {
    const rs = await Promise.all(list.slice(i, i + 10).map((t) => sendPush(t, t.msg, d.vapid, d.fetchFn)));
    rs.forEach((r, j) => { out[r]++; if (r === 'gone') gone.push(list[i + j]!.endpoint); });
  }
  if (gone.length) {
    const body = JSON.stringify({ endpoints: gone, n: nonce() });
    await d.rpc('drop_push', body, await d.sign(body)).catch((e) => d.log?.(`push: drop failed ${String(e)}`));
  }
  return out;
}

/** One push request from a table (a turn, a crew table that started). */
export async function deliver(req: PushRequest, d: PushDeps): Promise<Delivery> {
  const body = JSON.stringify({ kind: req.kind, accounts: req.accounts ?? [], crew: req.crew ?? null, except: req.except ?? [], n: nonce() });
  const targets = (await d.rpc('push_targets', body, await d.sign(body))) as PushSubscriptionKeys[] | null;
  const msg: PushMessage = { title: req.title, body: req.body, url: req.url, tag: req.tag };
  return sendAll((targets ?? []).slice(0, 200).map((t) => ({ ...t, msg })), d);
}

/** Pushes the database queued (approved into a crew, a trophy, a season's end). */
export async function drainOutbox(d: PushDeps): Promise<Delivery> {
  const body = JSON.stringify({ n: nonce() });
  const rows = (await d.rpc('take_push_outbox', body, await d.sign(body))) as (PushSubscriptionKeys & PushMessage)[] | null;
  return sendAll((rows ?? []).map((r) => ({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth, msg: { title: r.title, body: r.body, url: r.url, tag: r.tag } })), d);
}

/** Checks a body signed by tokenSigner with the same token (the Oracle server handing a push to Cloudflare). */
export async function verifySigned(token: string, body: string, sig: string, now = Date.now()): Promise<boolean> {
  const m = /^v1\.(\d{10,16})\.([0-9a-f]{64})$/.exec(sig);
  if (!m || Math.abs(now - Number(m[1])) > 10 * 60_000) return false;
  const enc = new TextEncoder();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebCrypto types differ between Node and Workers
  const subtle = (globalThis as any).crypto.subtle;
  const key = await subtle.importKey('raw', enc.encode(sha256hex(token)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = toHex(new Uint8Array(await subtle.sign('HMAC', key, enc.encode(`${m[1]}.${body}`))));
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= mac.charCodeAt(i) ^ m[2]!.charCodeAt(i);
  return diff === 0;
}
