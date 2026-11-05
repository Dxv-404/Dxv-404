// The research event model: one envelope for every event, whoever records it (a phone, a laptop, a table
// server, the service worker). Every field is short on the wire (events are many); the database keeps them
// as columns (see supabase/migrations/*_research.sql) and the data dictionary is docs/research-data.md.
//
// Rules every recorder follows:
// - `id` is a random UUID made when the event is made; a resend carries the same id, so the database
//   keeps it once;
// - `s` (session) + `q` (sequence) number every event of one recording session 1, 2, 3, ... with no gaps,
//   so a missing or doubled event can be seen later;
// - `tc` is the recorder's wall clock (ms since 1970) and `tm` its monotonic clock (performance.now(), ms
//   since the session's page or process started); the ingestion layer adds the server's clock (`ts`);
// - payloads are versioned per type (`v`); high-frequency streams arrive as batches of delta-coded samples.

/** Bumped when the envelope itself changes (not a payload: those have their own `v`). */
export const SCHEMA_VERSION = 1;

/** Who recorded an event. */
export type Source = 'c' | 's' | 'w';

export interface Envelope {
  /** Event id: a random UUID, the same on every resend. */
  id: string;
  /** Envelope schema version (SCHEMA_VERSION). */
  sv: number;
  /** Event type, e.g. "act.send" (see EVENT_TYPES). */
  t: string;
  /** Payload version for this type. */
  v: number;
  /** Recorder: c = app (phone/laptop page), s = table server, w = service worker. */
  src: Source;
  /** Recorder wall clock, ms since 1970 (Date.now()). */
  tc: number;
  /** Recorder monotonic clock, ms (performance.now() on pages; process uptime on servers). */
  tm: number;
  /** Recording session id (a page load, a server process / table object). */
  s: string;
  /** Sequence number within the session, from 1, no gaps. */
  q: number;
  /** Research device id (random, kept in the browser), or the server's id for server events without a device. */
  d: string | null;
  /** Account id (signed in) and guest id (this browser's guest seat), when known. Both may be set. */
  a: string | null;
  g: string | null;
  /** Table code, league game id, hand number, street: when the event belongs to a table / hand. */
  tb?: string | null;
  gm?: string | null;
  h?: number | null;
  st?: string | null;
  /** App version and build ("0.5.0+abc1234"). */
  app?: string | null;
  /** Server clock (ms since 1970): when the ingestion layer received it, or when a server event happened. */
  ts?: number;
  /** The payload (compact JSON). */
  p: unknown;
}

/** Limits the ingestion layer enforces (and recorders stay under). */
export const LIMITS = {
  /** One event, serialised. Hand summaries from the server are the largest. */
  eventBytes: 64 * 1024,
  /** One batch from a phone. */
  batchBytes: 512 * 1024,
  batchEvents: 1000,
  typeLength: 40,
  idLength: 64,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z0-9_:.-]{1,64}$/;
const TYPE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,3}$/;
const CODE = /^[A-Z0-9]{2,12}$/;
const STREETS = new Set(['preflop', 'flop', 'turn', 'river', 'showdown', 'between']);

export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

/** Why an event is refused (null = it is fine). Checks shape and sizes only, never meaning. */
export function checkEnvelope(e: unknown, src?: Source): string | null {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return 'not an object';
  const o = e as Record<string, unknown>;
  if (!isUuid(o.id)) return 'id';
  if (o.sv !== SCHEMA_VERSION) return 'sv';
  if (typeof o.t !== 'string' || o.t.length > LIMITS.typeLength || !TYPE.test(o.t)) return 't';
  if (!Number.isInteger(o.v) || (o.v as number) < 1 || (o.v as number) > 1000) return 'v';
  if (o.src !== 'c' && o.src !== 's' && o.src !== 'w') return 'src';
  if (src && o.src !== src && !(src === 'c' && o.src === 'w')) return 'src';
  if (!finite(o.tc) || (o.tc as number) < 1.5e12 || (o.tc as number) > 4.1e12) return 'tc';
  if (!finite(o.tm) || (o.tm as number) < 0) return 'tm';
  if (typeof o.s !== 'string' || !SAFE_ID.test(o.s)) return 's';
  if (!Number.isInteger(o.q) || (o.q as number) < 1 || (o.q as number) > 2_000_000_000) return 'q';
  for (const k of ['d', 'a', 'g'] as const) if (o[k] !== null && o[k] !== undefined && (typeof o[k] !== 'string' || !SAFE_ID.test(o[k] as string))) return k;
  if (o.a !== null && o.a !== undefined && !isUuid(o.a)) return 'a';
  if (o.tb !== null && o.tb !== undefined && (typeof o.tb !== 'string' || !CODE.test(o.tb))) return 'tb';
  if (o.gm !== null && o.gm !== undefined && !isUuid(o.gm)) return 'gm';
  if (o.h !== null && o.h !== undefined && (!Number.isInteger(o.h) || (o.h as number) < 0 || (o.h as number) > 1e7)) return 'h';
  if (o.st !== null && o.st !== undefined && (typeof o.st !== 'string' || !STREETS.has(o.st))) return 'st';
  if (o.app !== null && o.app !== undefined && (typeof o.app !== 'string' || o.app.length > 40)) return 'app';
  if (o.ts !== undefined && !finite(o.ts)) return 'ts';
  if (!('p' in o)) return 'p';
  return null;
}

const finite = (x: unknown): boolean => typeof x === 'number' && Number.isFinite(x);

export interface BatchCheck { ok: Envelope[]; rejected: { i: number; why: string }[] }

/**
 * Checks a batch as it arrives: sizes, then each event. Bad events are dropped one by one (the rest are
 * kept). `src` limits which recorder may send it (a phone may send app and service worker events only).
 */
export function checkBatch(raw: string, src: Source): BatchCheck | { error: string } {
  if (raw.length > LIMITS.batchBytes) return { error: 'too large' };
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return { error: 'not JSON' }; }
  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events)) return { error: 'no events' };
  if (events.length > LIMITS.batchEvents) return { error: 'too many events' };
  const ok: Envelope[] = [];
  const rejected: { i: number; why: string }[] = [];
  events.forEach((e, i) => {
    const why = checkEnvelope(e, src) ?? (JSON.stringify(e).length > LIMITS.eventBytes ? 'too large' : null);
    if (why) rejected.push({ i, why }); else ok.push(e as Envelope);
  });
  return { ok, rejected };
}

/**
 * Every event type, its current payload version and who records it. The data dictionary
 * (docs/research-data.md) describes each; a test checks the two agree.
 */
export const EVENT_TYPES = {
  // ---- server: the table (authoritative) ----
  'table.open': { v: 1, src: 's' },
  'table.host': { v: 1, src: 's' },
  'conn.open': { v: 1, src: 's' },
  'conn.hello': { v: 1, src: 's' },
  'conn.close': { v: 1, src: 's' },
  'conn.bg': { v: 1, src: 's' },
  'seat.join': { v: 1, src: 's' },
  'seat.move': { v: 1, src: 's' },
  'msg.in': { v: 1, src: 's' },
  'game.input': { v: 1, src: 's' },
  'game.end': { v: 1, src: 's' },
  'react.send': { v: 1, src: 's' },
  'rebuy.offer': { v: 1, src: 's' },
  'hand.start': { v: 1, src: 's' },
  'hand.decision': { v: 1, src: 's' },
  'hand.action': { v: 1, src: 's' },
  'hand.street': { v: 1, src: 's' },
  'hand.vote': { v: 1, src: 's' },
  'hand.show': { v: 1, src: 's' },
  'hand.end': { v: 1, src: 's' },
  'hand.cut': { v: 1, src: 's' },
  'push.sent': { v: 1, src: 's' },
  'offline.hand': { v: 1, src: 's' },
  // ---- app: sessions, device, attention ----
  'session.start': { v: 1, src: 'c' },
  'session.end': { v: 1, src: 'c' },
  'session.resume': { v: 1, src: 'c' },
  'device.info': { v: 1, src: 'c' },
  'device.change': { v: 1, src: 'c' },
  'att.visibility': { v: 1, src: 'c' },
  'att.focus': { v: 1, src: 'c' },
  'att.lifecycle': { v: 1, src: 'c' },
  'net.status': { v: 1, src: 'c' },
  'net.online': { v: 1, src: 'c' },
  'net.gap': { v: 1, src: 'c' },
  'clock.sync': { v: 1, src: 'c' },
  'perf.load': { v: 1, src: 'c' },
  'perf.frames': { v: 1, src: 'c' },
  'perf.capture': { v: 1, src: 'c' },
  'err.client': { v: 1, src: 'c' },
  'report.problem': { v: 1, src: 'c' },
  // ---- app: input and decisions ----
  'ui.screen': { v: 1, src: 'c' },
  'ui.sheet': { v: 1, src: 'c' },
  'ui.tap': { v: 1, src: 'c' },
  'ui.abort': { v: 1, src: 'c' },
  'ui.hover': { v: 1, src: 'c' },
  'ui.key': { v: 1, src: 'c' },
  'ui.scroll': { v: 1, src: 'c' },
  'ui.orient': { v: 1, src: 'c' },
  'turn.start': { v: 1, src: 'c' },
  'act.send': { v: 1, src: 'c' },
  'act.ack': { v: 1, src: 'c' },
  'table.view': { v: 1, src: 'c' },
  'table.peek': { v: 1, src: 'c' },
  'raise.path': { v: 1, src: 'c' },
  'mouse.path': { v: 1, src: 'c' },
  'motion.perm': { v: 1, src: 'c' },
  'motion.samples': { v: 1, src: 'c' },
  'motion.hold': { v: 1, src: 'c' },
  'rebuy.sheet': { v: 1, src: 'c' },
  'qr.state': { v: 1, src: 'c' },
  // ---- app: everything around the table ----
  'api.call': { v: 1, src: 'c' },
  'settings.change': { v: 1, src: 'c' },
  'avatar.browse': { v: 1, src: 'c' },
  'replay.view': { v: 1, src: 'c' },
  'crew.view': { v: 1, src: 'c' },
  'id.event': { v: 1, src: 'c' },
  'push.prompt': { v: 1, src: 'c' },
  'push.open': { v: 1, src: 'c' },
  // ---- service worker ----
  'push.arrive': { v: 1, src: 'w' },
  'push.click': { v: 1, src: 'w' },
} as const satisfies Record<string, { v: number; src: Source }>;
export type EventType = keyof typeof EVENT_TYPES;
