// Making envelopes: one maker per recording session numbers its events 1, 2, 3, ... and stamps the clocks.
import { EVENT_TYPES, SCHEMA_VERSION, type Envelope, type EventType, type Source } from './schema';

/** A random v4 UUID (WebCrypto exists on Node, Cloudflare, browsers and service workers). */
export function uuid(): string {
  const c = (globalThis as unknown as { crypto: { randomUUID?: () => string; getRandomValues(a: Uint8Array): Uint8Array } }).crypto;
  if (c.randomUUID) return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Where an event belongs: a table, a game, a hand, a street (all optional). */
export interface Where { tb?: string | null; gm?: string | null; h?: number | null; st?: string | null }
/** Who it is about: device, account, guest. */
export interface Who { d?: string | null; a?: string | null; g?: string | null }

export interface MakerClock { wall(): number; mono(): number }

export class EnvelopeMaker {
  readonly session: string;
  private seq = 0;
  constructor(readonly src: Source, private clock: MakerClock, private app: string | null, session?: string) {
    this.session = session ?? uuid();
  }

  /** The next event of this session. `at` overrides the wall clock (an event that happened earlier). */
  make(t: EventType, p: unknown, who: Who = {}, where: Where = {}, at?: { tc?: number; tm?: number; ts?: number }): Envelope {
    const e: Envelope = {
      id: uuid(), sv: SCHEMA_VERSION, t, v: EVENT_TYPES[t].v, src: this.src,
      tc: at?.tc ?? this.clock.wall(), tm: round3(at?.tm ?? this.clock.mono()),
      s: this.session, q: ++this.seq, d: who.d ?? null, a: who.a ?? null, g: who.g ?? null, p,
    };
    if (where.tb) e.tb = where.tb;
    if (where.gm) e.gm = where.gm;
    if (where.h !== undefined && where.h !== null) e.h = where.h;
    if (where.st) e.st = where.st;
    if (this.app) e.app = this.app;
    if (at?.ts !== undefined) e.ts = at.ts;
    return e;
  }

  /** Events made so far (the last sequence number). */
  get count(): number { return this.seq; }
}

export const round3 = (x: number): number => Math.round(x * 1000) / 1000;
