// Phase 7: push notifications. The payload encryption is checked by decrypting it the way a phone's push
// service does (RFC 8291); the VAPID signature is checked with the public key; the table pushes a turn only
// when the player's app is not on screen, once per turn, and tells a crew when its table starts.
import { describe, expect, it } from 'vitest';
import { parseServer, type ServerMessage } from '@tp/protocol';
import { TableRoom, type Conn, type Identity, type PushRequest } from '../src/room';
import { b64u, encryptPayload, fromB64u, sendPush, vapidHeader } from '../src/webpush';
import { verifySigned, deliver } from '../src/push';
import { tokenSigner } from '../src/record';

/* eslint-disable @typescript-eslint/no-explicit-any -- WebCrypto key types (no DOM types here) */
type CryptoKeyPair = { publicKey: any; privateKey: any };
const subtle = crypto.subtle;
const enc = new TextEncoder();
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) {
  const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, n * 8));
}
async function phoneKeys() {
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const pub = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { ua, sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: b64u(pub), auth: b64u(auth) }, pub, auth };
}
/** What the push service on the phone does with the body. */
async function decrypt(body: Uint8Array, ua: CryptoKeyPair, uaPub: Uint8Array, auth: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16), idlen = body[20]!, asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const asKey = await subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPub, ...asPub]);
  const ikm = await hkdf(auth, ecdh, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const k = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const pt = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, ct));
  expect(pt.at(-1)).toBe(2); // the last-record delimiter
  return new TextDecoder().decode(pt.slice(0, -1));
}
async function vapidKeys() {
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const jwk = await subtle.exportKey('jwk', kp.privateKey);
  const pub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
  return { kp, vapid: { publicKey: b64u(pub), privateKey: jwk.d!, subject: 'mailto:test@example.com' } };
}

describe('web push', () => {
  it('the payload decrypts on the phone (RFC 8291)', async () => {
    const p = await phoneKeys();
    const body = await encryptPayload(p.sub, enc.encode('{"title":"Your turn"}'));
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    expect(await decrypt(body, p.ua, p.pub, p.auth)).toBe('{"title":"Your turn"}');
  });

  it('the VAPID header is signed with the key and names the push service', async () => {
    const { kp, vapid } = await vapidKeys();
    const h = await vapidHeader('https://fcm.googleapis.com/fcm/send/abc', vapid, 1_700_000_000_000);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h)!;
    expect(m[4]).toBe(vapid.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(fromB64u(m[2]!))) as { aud: string; exp: number; sub: string };
    expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_700_000_000 + 12 * 3600, sub: 'mailto:test@example.com' });
    expect(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, fromB64u(m[3]!), enc.encode(`${m[1]}.${m[2]}`))).toBe(true);
  });

  it('only push services are called; gone subscriptions are reported', async () => {
    const { vapid } = await vapidKeys();
    const p = await phoneKeys();
    const calls: string[] = [];
    const f = (async (url: string) => { calls.push(url); return new Response('', { status: url.endsWith('dead') ? 410 : 201 }); }) as unknown as typeof fetch;
    const msg = { title: 't', body: 'b', url: '/', tag: 'x' };
    expect(await sendPush({ ...p.sub, endpoint: 'https://evil.example.com/steal' }, msg, vapid, f)).toBe('gone');
    expect(await sendPush({ ...p.sub, endpoint: 'http://fcm.googleapis.com/x' }, msg, vapid, f)).toBe('gone');
    expect(await sendPush({ ...p.sub, p256dh: 'AAAA' }, msg, vapid, f)).toBe('gone');
    expect(calls).toEqual([]);
    expect(await sendPush(p.sub, msg, vapid, f)).toBe('sent');
    expect(await sendPush({ ...p.sub, endpoint: 'https://fcm.googleapis.com/fcm/send/dead' }, msg, vapid, f)).toBe('gone');
    // deliver: asks the database who, sends, drops the gone ones
    const rpcs: [string, unknown][] = [];
    const rpc = async (fn: string, body: string) => {
      rpcs.push([fn, JSON.parse(body)]);
      return fn === 'push_targets' ? [p.sub, { ...p.sub, endpoint: 'https://fcm.googleapis.com/fcm/send/dead' }] : null;
    };
    const r = await deliver({ kind: 'turn', accounts: ['a1'], title: 'Your turn', body: 'b', url: '/#/t/ABCD', tag: 'turn-ABCD' }, { sign: tokenSigner('tok'), rpc, vapid, fetchFn: f });
    expect(r).toEqual({ sent: 1, gone: 1, failed: 0 });
    expect(rpcs.map((x) => x[0])).toEqual(['push_targets', 'drop_push']);
    expect((rpcs[1]![1] as { endpoints: string[] }).endpoints).toEqual(['https://fcm.googleapis.com/fcm/send/dead']);
  });

  it('a push handed from the other server is accepted only with a fresh signature from the same token', async () => {
    const now = 1_700_000_000_000;
    const sig = await tokenSigner('secret', () => now)('{"a":1}');
    expect(await verifySigned('secret', '{"a":1}', sig, now + 1000)).toBe(true);
    expect(await verifySigned('secret', '{"a":2}', sig, now + 1000)).toBe(false);
    expect(await verifySigned('other', '{"a":1}', sig, now + 1000)).toBe(false);
    expect(await verifySigned('secret', '{"a":1}', sig, now + 11 * 60_000)).toBe(false);
    expect(await verifySigned('secret', '{"a":1}', 'v1.x.y', now)).toBe(false);
  });
});

class FakeConn implements Conn {
  inbox: ServerMessage[] = [];
  send(text: string): void { const p = parseServer(text); if (!p.ok) throw new Error(p.error); this.inbox.push(p.msg); }
  close(): void {}
}
const CREW = '11111111-2222-4333-8444-555555555555';
const A = 'aaaaaaaa-0000-0000-0000-000000000001', B = 'aaaaaaaa-0000-0000-0000-000000000002';
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the table pushes', () => {
  it('a turn waiting 3 s on a phone whose app is hidden, once; never while the app is on screen; a crew table once', async () => {
    let now = 1000;
    const pushes: PushRequest[] = [];
    const ids = new Map<string, Identity>([['ticket-a-xxxxxxxxxxxx', { account: A, device: 'pa', name: 'Anu', crews: [CREW] }], ['ticket-b-xxxxxxxxxxxx', { account: B, device: 'pb', name: 'Babu', crews: [CREW] }]]);
    const room = new TableRoom('PUSH', { now: () => now, schedule: () => {} }, { save: () => {}, appendHand: () => {} }, null, {
      identify: async (t) => ids.get(t) ?? null, push: (p) => pushes.push(p), handPauseMs: 100, server: 'oracle',
    });
    const join = async (pid: string, ticket: string, extra: object = {}) => {
      const c = new FakeConn(); room.connect(c);
      room.message(c, JSON.stringify({ t: 'hello', v: 1, table: 'PUSH', player: pid, lastSeq: 0, ticket, ...extra }));
      await tick();
      return c;
    };
    const ca = await join(A, 'ticket-a-xxxxxxxxxxxx', { settings: { crew: CREW, turnTime: 0 } });
    const cb = await join(B, 'ticket-b-xxxxxxxxxxxx');
    room.message(ca, JSON.stringify({ t: 'host', actionId: 'd1', cmd: 'deal' }));
    const crewPush = pushes.filter((p) => p.kind === 'crewTable');
    expect(crewPush).toHaveLength(1);
    expect(crewPush[0]).toMatchObject({ crew: CREW, url: '/#/t/PUSH' });
    expect(crewPush[0]!.except!.sort()).toEqual([A, B].sort());
    const toAct = () => room.engine!.s.hand!.toAct!;
    const connOf = (pid: string) => (pid === A ? ca : cb);
    // the player to act has the app on screen: no push
    now += 5000; room.wake();
    expect(pushes.filter((p) => p.kind === 'turn')).toHaveLength(0);
    // they switch apps: the next check after 3 s pushes them, once
    const first = toAct();
    room.message(connOf(first), JSON.stringify({ t: 'bg', hidden: true }));
    now += 1000; room.wake();
    expect(pushes.filter((p) => p.kind === 'turn')).toHaveLength(0); // the turn already waited, but the push timer for it already ran out while they looked
    // a fresh turn for the hidden player: acting moves the turn on, then back
    room.message(connOf(first), JSON.stringify({ t: 'act', actionId: 'a1', handNo: room.engine!.s.handNo, action: { type: 'call' } }));
    const second = toAct();
    expect(second).not.toBe(first);
    room.message(connOf(second), JSON.stringify({ t: 'bg', hidden: true }));
    now += 2000; room.wake();
    expect(pushes.filter((p) => p.kind === 'turn')).toHaveLength(0); // not yet 3 s
    now += 1500; room.wake();
    const turns = pushes.filter((p) => p.kind === 'turn');
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ accounts: [second], title: 'Your turn', url: '/#/t/PUSH' });
    now += 10_000; room.wake();
    expect(pushes.filter((p) => p.kind === 'turn')).toHaveLength(1); // once per turn
    expect(pushes.filter((p) => p.kind === 'crewTable')).toHaveLength(1); // and the crew is told once
  });
});
