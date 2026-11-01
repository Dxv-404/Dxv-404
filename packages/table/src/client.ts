// The phone's side of a live table. Keeps one connection alive, and makes sure every tap reaches the
// table exactly once:
// - each action goes into an outbox with an actionId and stays there until the server acknowledges it;
//   it is resent after a reconnect, or if no answer comes within `retryMs`;
// - the server numbers its updates; a gap (a lost update) or a pong showing a newer seq makes the phone
//   reconnect and resume, so it never sits on a stale table;
// - after a drop the phone reconnects with backoff (0.5 s, 1 s, 2 s, ... up to 5 s) and says the last seq it saw.
import { PROTOCOL_VERSION, encode, parseServer, type ClientMessage, type ServerMessage, type TableSettings } from '@tp/protocol';
import type { Action, GameEvent, View } from '@tp/engine';

/** The parts of a WebSocket the client uses (browser WebSocket, Node's global WebSocket, or a test fake). */
export interface SocketLike {
  send(text: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface Timers {
  now(): number;
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export type Status = 'connecting' | 'live' | 'offline' | 'closed';

export interface ClientOptions {
  url: string;
  table: string;
  player: string;
  token?: string;
  name?: string;
  spectate?: boolean;
  settings?: TableSettings;
  open(url: string): SocketLike;
  timers?: Timers;
  retryMs?: number;
  pingEveryMs?: number;
  /** No message at all for this long means the connection is dead even if the socket says otherwise. */
  silentMs?: number;
  /** Give up on a connection that has not been welcomed within this time, and try again. */
  connectTimeoutMs?: number;
  /** Randomness for reconnect jitter (tests pass a seeded one). */
  random?: () => number;
  onView?(view: View, events: GameEvent[]): void;
  onReact?(from: string, reaction: string): void;
  onAck?(actionId: string, ok: boolean, error?: string): void;
  onStatus?(s: Status): void;
  onError?(code: string, message: string): void;
}

type Outgoing = Extract<ClientMessage, { actionId: string }>;
type Payload<T> = T extends Outgoing ? Omit<T, 'actionId'> : never;
export type ActionPayload = Payload<Outgoing>;

const realTimers: Timers = { now: () => Date.now(), set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const FATAL = new Set(['version', 'not_allowed', 'table_full', 'no_table', 'replaced']);

export class TableClient {
  status: Status = 'connecting';
  seq = 0;
  view: View | null = null;
  you: string | null = null;
  host: string | null = null;
  /** Round-trip time of the last ping, in ms. */
  rtt: number | null = null;
  /** Server clock minus phone clock, for showing turn timers. */
  clockOffset = 0;
  private ws: SocketLike | null = null;
  private outbox = new Map<string, { msg: Outgoing; sentAt: number }>();
  private nextId = 0;
  private attempts = 0;
  private lastHeard = 0;
  private connectStartedAt = 0;
  private reconnectTimer: unknown = null;
  private tickTimer: unknown = null;
  private readonly t: Timers;
  private readonly o: Required<Pick<ClientOptions, 'retryMs' | 'pingEveryMs' | 'silentMs' | 'connectTimeoutMs'>> & ClientOptions;
  private idPrefix: string;

  constructor(opts: ClientOptions) {
    this.t = opts.timers ?? realTimers;
    this.o = { retryMs: 3000, pingEveryMs: 10_000, silentMs: 25_000, connectTimeoutMs: 8000, ...opts };
    this.idPrefix = `${opts.player.slice(0, 20)}-${Math.floor(this.t.now() % 1e9).toString(36)}`;
    this.open();
    this.tick();
  }

  // ---------------- actions ----------------
  /** Queue an action; it is sent now if connected and kept until the table answers. Returns its actionId. */
  send(p: ActionPayload): string {
    const actionId = `${this.idPrefix}-${(this.nextId++).toString(36)}`;
    const msg = { ...p, actionId } as Outgoing;
    this.outbox.set(actionId, { msg, sentAt: -Infinity });
    this.flush();
    return actionId;
  }

  act(action: Action): string | null {
    const h = this.view?.hand;
    if (!h || !this.view) return null;
    return this.send({ t: 'act', handNo: this.view.handNo, action: action.to === undefined ? { type: action.type } : { type: action.type, to: action.to } });
  }

  react(reaction: Extract<ClientMessage, { t: 'react' }>['reaction']): void {
    this.raw({ t: 'react', reaction });
  }

  get pending(): number { return this.outbox.size; }

  close(): void {
    this.status = 'closed';
    this.t.clear(this.reconnectTimer);
    this.t.clear(this.tickTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'bye');
    this.o.onStatus?.('closed');
  }

  /** Drop the connection and reconnect (tests use it; phones call it when they come back to the foreground). */
  reconnect(): void {
    if (this.status === 'closed') return;
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(4002, 'reconnect'); } catch { /* already gone */ }
    this.setStatus('offline');
    this.scheduleReconnect(0);
  }

  // ---------------- connection ----------------
  private open(): void {
    if (this.status === 'closed') return;
    this.setStatus('connecting');
    this.connectStartedAt = this.t.now();
    let ws: SocketLike;
    try { ws = this.o.open(this.o.url); } catch { this.scheduleReconnect(); return; }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.lastHeard = this.t.now();
      this.raw({
        t: 'hello', v: PROTOCOL_VERSION, table: this.o.table, player: this.o.player, lastSeq: this.seq,
        ...(this.o.token ? { token: this.o.token } : {}), ...(this.o.name ? { name: this.o.name } : {}),
        ...(this.o.spectate ? { spectate: true } : {}), ...(this.o.settings ? { settings: this.o.settings } : {}),
      });
    };
    ws.onmessage = (ev) => { if (this.ws === ws) this.receive(String(ev.data)); };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.status !== 'closed') { this.setStatus('offline'); this.scheduleReconnect(); }
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  private scheduleReconnect(ms?: number): void {
    this.t.clear(this.reconnectTimer);
    const delay = ms ?? Math.min(5000, 500 * 2 ** Math.min(this.attempts, 4)) * (0.8 + 0.4 * (this.o.random ?? Math.random)());
    this.attempts++;
    this.reconnectTimer = this.t.set(() => this.open(), delay);
  }

  private receive(text: string): void {
    this.lastHeard = this.t.now();
    const p = parseServer(text);
    if (!p.ok) return;
    const m = p.msg;
    switch (m.t) {
      case 'welcome':
        this.attempts = 0;
        this.seq = m.seq; this.you = m.you; this.host = m.host;
        this.view = m.view as unknown as View;
        this.clockOffset = m.serverTime - this.t.now();
        this.setStatus('live');
        this.o.onView?.(this.view, (m.missed ?? []) as unknown as GameEvent[]);
        for (const o of this.outbox.values()) o.sentAt = -Infinity; // resend everything still unanswered
        this.flush();
        return;
      case 'update':
        if (this.status !== 'live' || m.seq <= this.seq) return; // before the welcome, or an old duplicate
        if (m.seq !== this.seq + 1) return this.reconnect(); // missed one: resume from what we have
        this.seq = m.seq; this.host = m.host;
        this.view = m.view as unknown as View;
        this.o.onView?.(this.view, m.events as unknown as GameEvent[]);
        return;
      case 'ack':
        if (!this.outbox.delete(m.actionId)) return;
        this.o.onAck?.(m.actionId, m.ok, m.error);
        return;
      case 'react':
        this.o.onReact?.(m.from, m.reaction);
        return;
      case 'pong':
        this.rtt = this.t.now() - m.c;
        this.clockOffset = m.s - (m.c + this.rtt / 2);
        if (m.seq > this.seq && this.status === 'live') this.reconnect(); // an update went missing
        return;
      case 'error':
        this.o.onError?.(m.code, m.message);
        if (FATAL.has(m.code)) this.close();
        return;
      case 'seedRequest':
        return; // Shared shuffle arrives in a later phase
    }
  }

  private flush(): void {
    if (this.status !== 'live') return;
    const now = this.t.now();
    for (const o of this.outbox.values()) {
      if (now - o.sentAt < this.o.retryMs) continue;
      o.sentAt = now;
      this.raw(o.msg);
    }
  }

  private tick(): void {
    if (this.status === 'closed') return;
    const now = this.t.now();
    if (this.status === 'connecting' && this.ws && now - this.connectStartedAt > this.o.connectTimeoutMs) {
      const ws = this.ws;
      this.ws = null;
      try { ws.close(4003, 'no welcome'); } catch { /* already gone */ }
      this.setStatus('offline');
      this.scheduleReconnect();
    } else if (this.status === 'live') {
      if (now - this.lastHeard > this.o.silentMs) this.reconnect();
      else {
        this.flush();
        if (now - this.lastHeard >= this.o.pingEveryMs / 2) this.raw({ t: 'ping', c: now });
      }
    }
    this.tickTimer = this.t.set(() => this.tick(), Math.min(this.o.retryMs, this.o.pingEveryMs) / 2);
  }

  private raw(m: ClientMessage): void {
    try { this.ws?.send(encode(m)); } catch { /* the close handler reconnects */ }
  }

  private setStatus(s: Status): void {
    if (this.status === s || this.status === 'closed') return;
    this.status = s;
    this.o.onStatus?.(s);
  }
}

export type { ServerMessage };
