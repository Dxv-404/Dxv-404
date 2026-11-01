// The wire protocol between phones and table servers (online Durable Object or the offline host app).
// Every message is JSON with a `t` field. Phones number their actions (actionId) so a resend after a
// dropped connection is applied once; the server numbers its updates (seq) so a phone that reconnects
// asks only for what it missed.
import { z } from 'zod';

/** Bumped whenever a message shape changes. Servers accept this version and the one before. */
export const PROTOCOL_VERSION = 1;
export const SUPPORTED_VERSIONS = [PROTOCOL_VERSION, PROTOCOL_VERSION - 1].filter((v) => v >= 1);

/** Reactions only (no free-text chat): the fixed set phones may send. */
export const REACTIONS = ['👍', '😂', '😮', '😬', '🔥', '👏', '🙏', '😴', 'nice hand', 'unlucky', 'gg', 'thinking…'] as const;

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const seed = z.string().regex(/^[0-9a-f]{64}$/);
const tableCode = z.string().regex(/^[A-Z0-9]{4,12}$/);
const action = z.object({
  type: z.enum(['fold', 'check', 'call', 'bet', 'raise', 'allin']),
  to: z.number().int().nonnegative().optional(),
});

// ---------- phone -> server ----------
export const ClientMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello'), v: z.number().int(), table: tableCode, player: id, token: z.string().max(4096).optional(), lastSeq: z.number().int().nonnegative(), name: z.string().min(1).max(20).optional(), spectate: z.boolean().optional() }),
  z.object({ t: z.literal('act'), actionId: id, handNo: z.number().int().positive(), action }),
  z.object({ t: z.literal('sit'), actionId: id, out: z.boolean(), postNow: z.boolean().optional() }),
  z.object({ t: z.literal('rebuy'), actionId: id }),
  z.object({ t: z.literal('vote'), actionId: id, handNo: z.number().int().positive(), yes: z.boolean() }),
  z.object({ t: z.literal('straddle'), actionId: id, on: z.boolean() }),
  z.object({ t: z.literal('show'), actionId: id, handNo: z.number().int().positive() }),
  z.object({ t: z.literal('seed'), handNo: z.number().int().positive(), seed }),
  z.object({ t: z.literal('react'), reaction: z.enum(REACTIONS) }),
  z.object({
    t: z.literal('host'), actionId: id,
    cmd: z.enum(['pause', 'resume', 'undo', 'end', 'deal', 'move', 'remove', 'setBlinds']),
    pid: id.optional(), dir: z.number().int().min(-1).max(1).optional(),
    sb: z.number().int().positive().optional(), bb: z.number().int().positive().optional(), ante: z.number().int().nonnegative().optional(),
  }),
  z.object({ t: z.literal('ping'), c: z.number() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

// ---------- server -> phone ----------
// Views and events come from the engine and are passed through as they are.
const view = z.record(z.string(), z.unknown());
const events = z.array(z.record(z.string(), z.unknown()));

export const ServerMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('welcome'), v: z.number().int(), seq: z.number().int().nonnegative(), you: id.nullable(), view, serverTime: z.number() }),
  z.object({ t: z.literal('update'), seq: z.number().int().positive(), events, view }),
  z.object({ t: z.literal('ack'), actionId: id, ok: z.boolean(), error: z.string().optional() }),
  z.object({ t: z.literal('react'), from: id, reaction: z.enum(REACTIONS) }),
  z.object({ t: z.literal('seedRequest'), handNo: z.number().int().positive(), dealerSeedCommit: seed }),
  z.object({ t: z.literal('pong'), c: z.number(), s: z.number() }),
  z.object({ t: z.literal('error'), code: z.enum(['version', 'bad_message', 'not_allowed', 'table_full', 'no_table', 'rate_limited', 'server']), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

export type Parsed<T> = { ok: true; msg: T } | { ok: false; error: string };

/** Largest message a phone may send; anything bigger is dropped unread. */
export const MAX_CLIENT_BYTES = 8 * 1024;

function parse<T>(schema: z.ZodType<T>, raw: unknown): Parsed<T> {
  let data = raw;
  if (typeof raw === 'string') {
    if (raw.length > MAX_CLIENT_BYTES) return { ok: false, error: 'Message too large' };
    try { data = JSON.parse(raw); } catch { return { ok: false, error: 'Not JSON' }; }
  }
  const r = schema.safeParse(data);
  return r.success ? { ok: true, msg: r.data } : { ok: false, error: r.error.issues.map((i) => `${i.path.join('.') || 'message'}: ${i.message}`).join('; ') };
}

export const parseClient = (raw: unknown): Parsed<ClientMessage> => parse(ClientMessage, raw);
export const parseServer = (raw: unknown): Parsed<ServerMessage> => parse(ServerMessage, raw);

/** Does the server talk this phone's protocol version? */
export const versionOk = (v: number): boolean => SUPPORTED_VERSIONS.includes(v);

export const encode = (m: ClientMessage | ServerMessage): string => JSON.stringify(m);
