// Research capture in the app (the crew's agreed research project; docs/research-data.md is the data
// dictionary). Everything the app records goes through R: an event gets its envelope (ids, both clocks,
// session and sequence number, device / account / guest, the table and hand it belongs to) and waits in the
// research queue, which sends batches every few seconds to the table worker's /research/ingest.
//
// Ground rules, enforced here:
// - nothing here may throw into the app or slow it: every entry point is wrapped, listeners are passive,
//   high-frequency listeners exist only while needed, and the time spent in capture code is measured and
//   recorded (perf.capture);
// - nothing typed into a text box is recorded (only which box, and how long the text is);
// - with no network, events wait (memory, then this browser's storage, capped) and go later.
import { ClockSync, EnvelopeMaker, ResearchQueue, type Envelope, type EventType, type SendResult } from '@tp/research';

declare const __TP_BUILD__: string;
export const APP = `0.5.0+${typeof __TP_BUILD__ === 'string' ? __TP_BUILD__ : 'dev'}`;

const CLOUDFLARE = 'https://train-poker-tables.apins-subdomain.workers.dev';
const LS = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* full or blocked */ } },
  del(k: string): void { try { localStorage.removeItem(k); } catch { /* blocked */ } },
};
const json = <T>(s: string | null): T | null => { try { return s ? JSON.parse(s) as T : null; } catch { return null; } };

/** Where batches go: the Cloudflare table worker; tests point it at their local table server. */
export function ingestBase(): string {
  const o = LS.get('tp-research-url');
  if (o) return o.replace(/\/$/, '');
  const s = LS.get('tp-server-override');
  if (s) return s.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '');
  // a local build (tests, development) never sends to the live endpoint: nothing is sent, events wait in the queue
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return '';
  return CLOUDFLARE;
}

const uuid = (): string => crypto.randomUUID();

/** This browser's research device id (made once, kept in this browser; also given to the service worker). */
function deviceId(): string {
  let d = LS.get('tp-rdev');
  if (!d || !/^[A-Za-z0-9_-]{8,64}$/.test(d)) { d = uuid(); LS.set('tp-rdev', d); }
  return d;
}

export interface Where { tb?: string | null; h?: number | null; st?: string | null }

class Capture {
  readonly device = deviceId();
  readonly maker = new EnvelopeMaker('c', { wall: () => Date.now(), mono: () => performance.now() }, APP);
  readonly clock = new ClockSync();
  readonly queue: ResearchQueue;
  /** The table and hand on screen now (every event carries them). */
  where: Where = {};
  /** Milliseconds spent inside capture code (all handlers), and how many calls. */
  cost = { ms: 0, calls: 0, max: 0 };
  private off = LS.get('tp-research-off') === '1';
  private sessionStarted = false;

  constructor() {
    this.queue = new ResearchQueue({
      send: (body, beacon) => this.send(body, beacon),
      store: {
        load: () => json<Envelope[]>(LS.get('tp-rq')) ?? [],
        save: (events) => {
          // capped: the newest that fit in about 1.2 MB of this browser's storage
          let s = JSON.stringify(events);
          let list = events;
          while (s.length > 1_200_000 && list.length) { list = list.slice(Math.ceil(list.length / 4)); s = JSON.stringify(list); }
          if (!list.length) LS.del('tp-rq'); else LS.set('tp-rq', s);
        },
      },
      now: () => performance.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      onClock: (t0, st, t3) => this.clock.add({ k: 'http', t0, st, t3 }),
    });
  }

  get enabled(): boolean { return !this.off; }

  /** Who: the account this browser is signed in as (if any) and its guest seat id (if any). */
  who(): { d: string; a: string | null; g: string | null } {
    const me = json<{ account?: string }>(LS.get('tp-me'));
    const a = me?.account && /^[0-9a-f-]{36}$/i.test(me.account) ? me.account : null;
    const g = json<string>(LS.get('tp-guest-id'));
    return { d: this.device, a, g: typeof g === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(g) ? g : null };
  }

  /** Record one event now. Never throws. */
  emit(t: EventType, p: Record<string, unknown> | unknown[] | null, where?: Where): void {
    if (this.off) return;
    const t0 = performance.now();
    try {
      const w = where ?? this.where;
      this.queue.push(this.maker.make(t, p, this.who(), { tb: w.tb ?? null, h: w.h ?? null, st: w.st ?? null }));
    } catch { /* never into the app */ }
    this.spent(t0);
  }

  /** Run a capture handler: errors swallowed, time measured. */
  guard<A extends unknown[]>(fn: (...a: A) => void): (...a: A) => void {
    return (...a: A) => {
      if (this.off) return;
      const t0 = performance.now();
      try { fn(...a); } catch { /* never into the app */ }
      this.spent(t0);
    };
  }

  private spent(t0: number): void {
    const d = performance.now() - t0;
    this.cost.ms += d; this.cost.calls++; if (d > this.cost.max) this.cost.max = d;
  }

  private async send(body: string, beacon: boolean): Promise<SendResult> {
    const base = ingestBase();
    if (!base) return { ok: false, retry: false };
    const url = `${base}/research/ingest`;
    if (beacon) {
      // the page is going away: a beacon (text/plain, so no preflight), else a keepalive fetch
      try { if (navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain' }))) return { ok: true }; } catch { /* fall through */ }
      try { void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {}); } catch { /* ignore */ }
      return { ok: true };
    }
    try {
      const r = await fetch(url, { method: 'POST', body, headers: { 'content-type': 'text/plain' }, cache: 'no-store' });
      const j = await r.json().catch(() => ({})) as { st?: number };
      if (r.ok) return { ok: true, ...(typeof j.st === 'number' ? { serverTime: j.st } : {}) };
      return { ok: false, retry: r.status >= 500 || r.status === 429 || r.status === 408 };
    } catch { return { ok: false, retry: true }; }
  }

  /** Session start: the queue starts, and the session and the device are described. */
  start(): void {
    if (this.off || this.sessionStarted) return;
    this.sessionStarted = true;
    const last = Number(LS.get('tp-rlast') ?? 0);
    const now = new Date();
    this.emit('session.start', {
      session: this.maker.session, device: this.device, sinceLastMs: last ? Date.now() - last : null,
      local: { iso: now.toString().slice(0, 33), hour: now.getHours(), minute: now.getMinutes(), dow: now.getDay(), tzOffsetMin: now.getTimezoneOffset(), tz: tz() },
      url: { path: location.pathname, hash: location.hash.slice(0, 40), referrer: document.referrer ? new URL(document.referrer).host : null },
      authUser: authUser(), installed: standalone(), visible: document.visibilityState, navType: navType(),
    }, {});
    LS.set('tp-rlast', String(Date.now()));
    this.queue.start();
    // give the service worker what it needs to record push arrivals and taps
    void saveForWorker({ url: ingestBase(), device: this.device, app: APP });
  }
}

export const R = new Capture();

// ---------------------------------------------------------------- small helpers
const tz = (): string | null => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } };
const standalone = (): boolean => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const navType = (): string | null => { try { return (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? null; } catch { return null; } };
/** The Supabase sign-in of this browser (the existing "device" of the accounts feature), if any. */
function authUser(): string | null {
  const s = json<{ user?: { id?: string } }>(LS.get('tp-login'));
  return s?.user?.id ?? null;
}

/** The service worker cannot read localStorage: the bits it needs go to IndexedDB. */
function saveForWorker(cfg: Record<string, string>): Promise<void> {
  return new Promise((res) => {
    try {
      const open = indexedDB.open('tp-research', 1);
      open.onupgradeneeded = () => { open.result.createObjectStore('kv'); };
      open.onsuccess = () => {
        try { const tx = open.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(cfg, 'cfg'); tx.oncomplete = () => { open.result.close(); res(); }; tx.onerror = () => res(); } catch { res(); }
      };
      open.onerror = () => res();
    } catch { res(); }
  });
}

/** Read and delete a value the service worker left in IndexedDB (a notification tap, events it could not send). */
export function idbTake<T>(key: string): Promise<T | null> {
  return new Promise((res) => {
    try {
      const open = indexedDB.open('tp-research', 1);
      open.onupgradeneeded = () => { open.result.createObjectStore('kv'); };
      open.onsuccess = () => {
        try {
          const st = open.result.transaction('kv', 'readwrite').objectStore('kv');
          const r = st.get(key);
          r.onsuccess = () => { const v = (r.result ?? null) as T | null; if (v !== null) st.delete(key); res(v); };
          r.onerror = () => res(null);
        } catch { res(null); }
      };
      open.onerror = () => res(null);
    } catch { res(null); }
  });
}

/** A short, stable name for a UI element: its test id, action, role or label (never text typed into it). */
export function keyOf(el: Element | null): string | null {
  if (!el) return null;
  const e = el as HTMLElement;
  const d = e.dataset ?? {};
  const id = d.testid ?? (d.act ? `act:${d.act}` : d.x ? `x:${d.x}` : d.p ? `p:${d.p}` : d.k ? `k:${d.k}` : d.tab ? `tab:${d.tab}` : d.avId ? `av:${d.avId}` : null);
  if (id) return id.slice(0, 60);
  const label = e.getAttribute('aria-label');
  const tag = e.tagName.toLowerCase();
  if (label) return `${tag}:${label.slice(0, 40)}`;
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return `${tag}:${(e as HTMLInputElement).name || (e as HTMLInputElement).type || ''}:${(e as HTMLInputElement).placeholder?.slice(0, 20) ?? ''}`;
  const text = (e.textContent ?? '').trim().replace(/\s+/g, ' ');
  return `${tag}:${text.slice(0, 30)}`;
}

export const INTERACTIVE = '[data-testid],[data-act],[data-x],[data-p],[data-k],[data-tab],[data-av-id],button,a,[role=button],[role=tab],[role=radio],[role=slider],input,select,textarea,summary,label';
