// Web Push (RFC 8030) with VAPID (RFC 8292) and the aes128gcm payload encryption (RFC 8291), using only
// WebCrypto, so the same code runs on the Oracle server (Node 22) and on Cloudflare. Push is a backup for
// phones whose app is in the background; while the table is open the socket does the job.

export interface PushSubscriptionKeys { endpoint: string; p256dh: string; auth: string }
export interface Vapid { publicKey: string; privateKey: string; subject: string }
export interface PushMessage { title: string; body: string; url: string; tag: string }
export type PushResult = 'sent' | 'gone' | 'failed';

/* eslint-disable @typescript-eslint/no-explicit-any -- WebCrypto types differ between Node and Workers */
const subtle = (): any => (globalThis as any).crypto.subtle;
const enc = { encode: (s: string): Uint8Array => new TextEncoder().encode(s) }; // (made when used: the host phone's script engine has no TextEncoder)

export const b64u = (b: Uint8Array): string => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const fromB64u = (s: string): Uint8Array => {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i);
  return out;
};
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** The encrypted body for one subscription (exported for the round-trip test). */
export async function encryptPayload(sub: PushSubscriptionKeys, plaintext: Uint8Array, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<Uint8Array> {
  const uaPublic = fromB64u(sub.p256dh), authSecret = fromB64u(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('bad subscription keys');
  const as = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await subtle().exportKey('raw', as.publicKey));
  const uaKey = await subtle().importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await subtle().importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = 65;
  return concat(header, asPublic, ct);
}

/** The VAPID Authorization header for an endpoint's push service. */
export async function vapidHeader(endpoint: string, v: Vapid, now = Date.now()): Promise<string> {
  const pub = fromB64u(v.publicKey);
  const jwk = { kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
  const key = await subtle().importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const part = (o: object) => b64u(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: v.subject })}`;
  const sig = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${v.publicKey}`;
}

/** Only real push services (no requests to anywhere else a stored endpoint might point). */
export const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)$/;

export async function sendPush(sub: PushSubscriptionKeys, msg: PushMessage, v: Vapid, fetchFn: typeof fetch = fetch): Promise<PushResult> {
  let host: string;
  try { const u = new URL(sub.endpoint); if (u.protocol !== 'https:') return 'gone'; host = u.hostname; } catch { return 'gone'; }
  if (!PUSH_HOSTS.test(host)) return 'gone';
  let body: Uint8Array;
  try { body = await encryptPayload(sub, enc.encode(JSON.stringify(msg))); } catch { return 'gone'; } // keys that can never work
  try {
    const res = await fetchFn(sub.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidHeader(sub.endpoint, v), 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream',
        ttl: '120', urgency: 'high', topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'tp',
      },
      body: body as unknown as NonNullable<Parameters<typeof fetch>[1]>["body"],
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'sent' : 'failed';
  } catch { return 'failed'; }
}
