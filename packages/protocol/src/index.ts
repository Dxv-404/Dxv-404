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

/** Settings the first player may choose when a table is created (everything else takes the defaults). */
export const TableSettings = z.object({
  startStack: z.number().int().min(100).max(1_000_000),
  sb: z.number().int().min(1).max(100_000),
  bb: z.number().int().min(1).max(200_000),
  blindUpEvery: z.number().int().min(0).max(1000),
  turnTime: z.number().int().min(0).max(300),
  timeBank: z.number().int().min(0).max(600),
  rebuys: z.boolean(),
  maxRebuys: z.number().int().min(0).max(100),
  straddle: z.boolean(),
  dealItTwice: z.boolean(),
  maxPlayers: z.number().int().min(2).max(15),
  /** A crew-only table: only active members of this crew may sit or watch. */
  crew: z.string().uuid(),
  /** A casual table: results go to the players' history but not the crew's league. */
  casual: z.boolean(),
}).partial().strict().refine((c) => c.sb === undefined || c.bb === undefined || c.bb >= c.sb, { message: 'Big blind must be at least the small blind' });
export type TableSettings = z.infer<typeof TableSettings>;

/** A phone's secret for its seat: sent on every hello so nobody else can take the seat over. */
const token = z.string().min(16).max(128);

// ---------- phone -> server ----------
/**
 * Offline only: who a phone says it is. The host phone has no internet to check a ticket, so it takes the
 * phone's word for it at the table; the league only counts the night once the players confirm it online.
 */
export const OfflineClaim = z.object({ account: z.string().uuid(), device: id, crews: z.array(z.string().uuid()).max(10) }).strict();
export type OfflineClaim = z.infer<typeof OfflineClaim>;

export const ClientMessage = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'), v: z.number().int(), table: tableCode, player: id, token: token.optional(), ticket: z.string().min(16).max(128).optional(),
    lastSeq: z.number().int().nonnegative(), name: z.string().min(1).max(20).optional(), spectate: z.boolean().optional(), settings: TableSettings.optional(),
    claim: OfflineClaim.optional(),
    /** Offline: fingerprint of the last table checkpoint this phone holds (checked when a table is continued on another phone). */
    cp: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  }),
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
  /** The app went to the background (or came back): a turn push is sent only while it is not on screen. */
  z.object({ t: z.literal('bg'), hidden: z.boolean() }),
  /** One seat per player: this device (watching, signed in as a player who plays from another device) takes the seat. */
  z.object({ t: z.literal('moveSeat') }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

// ---------- server -> phone ----------
/** Which device a seat is played from ("You're playing on your laptop"): its kind and the name the player gave it. */
export const DeviceInfo = z.object({ kind: z.enum(['phone', 'tablet', 'laptop']), name: z.string().max(30).nullable() });
export type DeviceInfo = z.infer<typeof DeviceInfo>;

// Views and events come from the engine and are passed through as they are.
const view = z.record(z.string(), z.unknown());
const events = z.array(z.record(z.string(), z.unknown()));

export const ServerMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('welcome'), v: z.number().int(), seq: z.number().int().nonnegative(), you: id.nullable(), host: id.nullable(), view, serverTime: z.number(), missed: events.optional() }),
  z.object({ t: z.literal('update'), seq: z.number().int().positive(), events, view, host: id.nullable(), at: z.number().optional() }),
  z.object({ t: z.literal('ack'), actionId: id, ok: z.boolean(), error: z.string().optional() }),
  z.object({ t: z.literal('react'), from: id, reaction: z.enum(REACTIONS), at: z.number().optional() }),
  z.object({ t: z.literal('seedRequest'), handNo: z.number().int().positive(), dealerSeedCommit: seed }),
  z.object({ t: z.literal('pong'), c: z.number(), s: z.number(), seq: z.number().int().nonnegative() }),
  /** Offline: the table between hands (no cards), kept by every phone so another phone can carry the night on. */
  z.object({ t: z.literal('checkpoint'), handNo: z.number().int().nonnegative(), hash: z.string().regex(/^[0-9a-f]{64}$/), data: z.string().max(200_000) }),
  /** This device watches: the player's seat is being played on another device (it may ask for it with moveSeat). */
  z.object({ t: z.literal('seatElsewhere'), device: DeviceInfo }),
  /** The seat moved to another device; this one watches now (a welcome as a watcher follows). */
  z.object({ t: z.literal('seatMoved'), device: DeviceInfo }),
  /** Something everyone at the table should be told (not part of the game itself). */
  z.object({ t: z.literal('notice'), text: z.string().max(300) }),
  z.object({ t: z.literal('error'), code: z.enum(['version', 'bad_message', 'not_allowed', 'table_full', 'no_table', 'rate_limited', 'server', 'replaced', 'need_hello', 'ticket']), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

export type Parsed<T> = { ok: true; msg: T } | { ok: false; error: string };

/** Largest message a phone may send; anything bigger is dropped unread. */
export const MAX_CLIENT_BYTES = 8 * 1024;
/** Largest message a server sends (a full table view with its log and results); a sanity cap, not a budget. */
export const MAX_SERVER_BYTES = 256 * 1024;

function parse<T>(schema: z.ZodType<T>, raw: unknown, maxBytes: number): Parsed<T> {
  let data = raw;
  if (typeof raw === 'string') {
    if (raw.length > maxBytes) return { ok: false, error: 'Message too large' };
    try { data = JSON.parse(raw); } catch { return { ok: false, error: 'Not JSON' }; }
  }
  const r = schema.safeParse(data);
  return r.success ? { ok: true, msg: r.data } : { ok: false, error: r.error.issues.map((i) => `${i.path.join('.') || 'message'}: ${i.message}`).join('; ') };
}

export const parseClient = (raw: unknown): Parsed<ClientMessage> => parse(ClientMessage, raw, MAX_CLIENT_BYTES);
export const parseServer = (raw: unknown): Parsed<ServerMessage> => parse(ServerMessage, raw, MAX_SERVER_BYTES);

/** Does the server talk this phone's protocol version? */
export const versionOk = (v: number): boolean => SUPPORTED_VERSIONS.includes(v);

export const encode = (m: ClientMessage | ServerMessage): string => JSON.stringify(m);

/** The public half of the push key (phones subscribe with it; the private half is a Cloudflare secret). */
export const VAPID_PUBLIC_KEY = 'BA49ZnpCIbcRzeR-XeKrrAUv0xUgJjm0--bYq490MgYjO2YAV3AYuk5xggcMgWMgNE2yrgAbl4N7GlEjZt034NY';
export const PUSH_SUBJECT = 'mailto:devkrishna6780@gmail.com';
