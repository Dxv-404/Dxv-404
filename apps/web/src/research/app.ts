// App-wide research capture: the session and the device, attention (visible, focused, background, frozen),
// the network, errors, load and frame timings, every screen and sheet with its dwell and scroll depth, taps
// (and touches that did not become taps), hovers, keys, orientation, clock samples, and the capture's own cost.
import { R, INTERACTIVE, idbTake, keyOf, ingestBase } from './capture';
import type { Envelope } from '@tp/research';
import { requestMotionOnGesture } from './motion';
import { installApiTrace } from './api';

type NetInfo = { type?: string; effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean; addEventListener?(t: string, f: () => void): void };
const conn = (): NetInfo | null => (navigator as Navigator & { connection?: NetInfo }).connection ?? null;
const netNow = () => { const c = conn(); return c ? { type: c.type ?? null, eff: c.effectiveType ?? null, down: c.downlink ?? null, rtt: c.rtt ?? null, save: c.saveData ?? null } : null; };
const mq = (q: string): boolean => { try { return matchMedia(q).matches; } catch { return false; } };
const prefs = () => ({
  dark: mq('(prefers-color-scheme: dark)'), reducedMotion: mq('(prefers-reduced-motion: reduce)'), contrastMore: mq('(prefers-contrast: more)'),
  reducedData: mq('(prefers-reduced-data: reduce)'), fontPx: parseFloat(getComputedStyle(document.documentElement).fontSize) || null,
  coarse: mq('(pointer: coarse)'), fine: mq('(pointer: fine)'), hover: mq('(hover: hover)'), forcedColors: mq('(forced-colors: active)'),
});
const viewport = () => ({ w: innerWidth, h: innerHeight, vvw: visualViewport?.width ?? null, vvh: visualViewport?.height ?? null, vvScale: visualViewport?.scale ?? null, dpr: devicePixelRatio, orient: screen.orientation?.type ?? null, angle: screen.orientation?.angle ?? null });

let screenName = 'start';
let screenAt = performance.now();
let maxScroll = 0;
let scrollSeen = false;

/** A screen (route) came up: the previous one's dwell and how far down it was scrolled go with it. */
export const noteScreenView = R.guard((name: string) => {
  const now = performance.now();
  R.emit('ui.screen', { name, prev: screenName, prevMs: Math.round(now - screenAt), prevScroll: scrollSeen ? Math.round(maxScroll * 1000) / 1000 : null, hash: location.hash.slice(0, 40) });
  screenName = name; screenAt = now; maxScroll = 0; scrollSeen = false;
  if (!/tp-screen|table/.test(name)) R.where = {};
});

/** A sheet (panel) opened, or closed after `ms`. */
export const noteSheet = R.guard((label: string, open: boolean, ms?: number) => { R.emit('ui.sheet', { label: label.slice(0, 40), open, ms: ms ?? null, screen: screenName }); });

/** A setting changed (old and new value). */
export const noteSetting = R.guard((key: string, from: unknown, to: unknown, where = 'settings') => { R.emit('settings.change', { key, from: from ?? null, to: to ?? null, where, screen: screenName }); });

export function installResearch(): void {
  if (!R.enabled) return;
  try { install(); } catch { /* never into the app */ }
}

function install(): void {
  (window as unknown as { __tpResearch: unknown }).__tpResearch = R; // (tests flush the queue through this)
  R.start();
  installApiTrace();
  // ---- the device
  const ua = navigator as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[]; mobile?: boolean; platform?: string; getHighEntropyValues?(h: string[]): Promise<Record<string, unknown>> }; deviceMemory?: number };
  const info: Record<string, unknown> = {
    ua: navigator.userAgent.slice(0, 300), platform: navigator.platform, lang: navigator.language, langs: (navigator.languages ?? []).slice(0, 5),
    uaData: ua.userAgentData ? { brands: ua.userAgentData.brands, mobile: ua.userAgentData.mobile, platform: ua.userAgentData.platform } : null,
    screen: { w: screen.width, h: screen.height, aw: screen.availWidth, ah: screen.availHeight, depth: screen.colorDepth }, viewport: viewport(),
    cores: navigator.hardwareConcurrency ?? null, memGB: ua.deviceMemory ?? null, touchPoints: navigator.maxTouchPoints, installed: mq('(display-mode: standalone)') || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    prefs: prefs(), net: netNow(), online: navigator.onLine, cookies: navigator.cookieEnabled, sw: !!navigator.serviceWorker?.controller,
    notifications: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported', motion: 'DeviceMotionEvent' in window, orientation: 'DeviceOrientationEvent' in window,
    motionNeedsPermission: typeof (window as unknown as { DeviceMotionEvent?: { requestPermission?: unknown } }).DeviceMotionEvent?.requestPermission === 'function',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone, locale: Intl.DateTimeFormat().resolvedOptions().locale, server: ingestBase(),
  };
  R.emit('device.info', info, {});
  // the model and OS version where the browser tells (Chrome on Android: e.g. "Pixel 7", "14.0.0")
  void ua.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion', 'fullVersionList', 'architecture', 'bitness', 'formFactors']).then(R.guard((h: Record<string, unknown>) => R.emit('device.change', { kind: 'uaHigh', ...h }, {}))).catch(() => {});
  void (navigator as Navigator & { getBattery?(): Promise<{ level: number; charging: boolean; addEventListener(t: string, f: () => void): void }> }).getBattery?.().then(R.guard((b: { level: number; charging: boolean; addEventListener(t: string, f: () => void): void }) => {
    const say = R.guard((why: string) => R.emit('device.change', { kind: 'battery', why, level: b.level, charging: b.charging }, {}));
    say('start');
    let lastLevel = b.level;
    b.addEventListener('chargingchange', () => say('charging'));
    b.addEventListener('levelchange', () => { if (Math.abs(b.level - lastLevel) >= 0.01) { lastLevel = b.level; say('level'); } });
  })).catch(() => {});
  void navigator.storage?.estimate?.().then(R.guard((e: StorageEstimate) => R.emit('device.change', { kind: 'storage', usage: e.usage ?? null, quota: e.quota ?? null }, {}))).catch(() => {});
  conn()?.addEventListener?.('change', R.guard(() => R.emit('device.change', { kind: 'net', net: netNow() })));
  for (const q of ['(prefers-color-scheme: dark)', '(prefers-reduced-motion: reduce)', '(prefers-contrast: more)', '(display-mode: standalone)']) {
    try { matchMedia(q).addEventListener('change', R.guard((e: MediaQueryListEvent) => R.emit('device.change', { kind: 'pref', query: q, matches: e.matches }))); } catch { /* old browser */ }
  }
  let resizeT: ReturnType<typeof setTimeout> | null = null;
  addEventListener('resize', () => { if (resizeT) clearTimeout(resizeT); resizeT = setTimeout(R.guard(() => R.emit('device.change', { kind: 'viewport', ...viewport() })), 500); }, { passive: true });
  screen.orientation?.addEventListener?.('change', R.guard(() => R.emit('ui.orient', { type: screen.orientation.type, ...viewport() })));

  // ---- attention
  let visAt = performance.now();
  document.addEventListener('visibilitychange', R.guard(() => {
    const now = performance.now();
    R.emit('att.visibility', { state: document.visibilityState, prevMs: Math.round(now - visAt) });
    visAt = now;
    if (document.visibilityState === 'hidden') { R.queue.hide(); try { localStorage.setItem('tp-rlast', String(Date.now())); } catch { /* blocked */ } }
    else { void R.queue.flush(true); pingClock(2); }
  }));
  let focusAt = performance.now();
  addEventListener('focus', R.guard(() => { const n = performance.now(); R.emit('att.focus', { focused: true, prevMs: Math.round(n - focusAt) }); focusAt = n; }));
  addEventListener('blur', R.guard(() => { const n = performance.now(); R.emit('att.focus', { focused: false, prevMs: Math.round(n - focusAt) }); focusAt = n; }));
  addEventListener('pagehide', R.guard((e: PageTransitionEvent) => { R.emit('att.lifecycle', { kind: 'pagehide', persisted: e.persisted }); R.emit('session.end', { why: 'pagehide', ms: Math.round(performance.now()), events: R.maker.count, cost: R.cost, queue: R.queue.stats }); R.queue.hide(); }));
  addEventListener('pageshow', R.guard((e: PageTransitionEvent) => { if (e.persisted) R.emit('session.resume', { kind: 'bfcache' }); }));
  document.addEventListener('freeze', R.guard(() => { R.emit('att.lifecycle', { kind: 'freeze' }); R.queue.hide(); }));
  document.addEventListener('resume', R.guard(() => R.emit('att.lifecycle', { kind: 'resume' })));
  addEventListener('online', R.guard(() => R.emit('net.online', { online: true, net: netNow() })));
  addEventListener('offline', R.guard(() => R.emit('net.online', { online: false })));

  // ---- errors (all of them, not only the first five the problem reports send)
  addEventListener('error', R.guard((e: ErrorEvent) => R.emit('err.client', { kind: 'error', msg: String(e.message ?? '').slice(0, 500), src: (e.filename ?? '').slice(-120), line: e.lineno ?? null, col: e.colno ?? null, stack: String((e.error as Error | undefined)?.stack ?? '').slice(0, 1500), screen: screenName })));
  addEventListener('unhandledrejection', R.guard((e: PromiseRejectionEvent) => { const r = e.reason as Error | string | undefined; R.emit('err.client', { kind: 'rejection', msg: String(typeof r === 'string' ? r : r?.message ?? r).slice(0, 500), stack: typeof r === 'object' ? String(r?.stack ?? '').slice(0, 1500) : '', screen: screenName }); }));

  // ---- load timings
  const loadT = () => R.guard(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const paints = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]));
    R.emit('perf.load', n ? { type: n.type, dns: Math.round(n.domainLookupEnd - n.domainLookupStart), connect: Math.round(n.connectEnd - n.connectStart), ttfb: Math.round(n.responseStart), response: Math.round(n.responseEnd), domInteractive: Math.round(n.domInteractive), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), transfer: n.transferSize, decoded: n.decodedBodySize, paints, sw: !!navigator.serviceWorker?.controller } : { paints }, {});
  })();
  if (document.readyState === 'complete') setTimeout(loadT, 0); else addEventListener('load', () => setTimeout(loadT, 0), { once: true });

  // ---- input: taps, touches that did not become taps, hovers, keys
  let down: { k: string | null; t: number; x: number; y: number; type: string; el: Element | null; pressure: number; w: number; h: number } | null = null;
  let lastPointer = 'none';
  document.addEventListener('pointerdown', R.guard((e: PointerEvent) => {
    lastPointer = e.pointerType;
    const el = (e.target as Element | null)?.closest?.(INTERACTIVE) ?? null;
    down = { k: keyOf(el), t: performance.now(), x: Math.round(e.clientX), y: Math.round(e.clientY), type: e.pointerType, el, pressure: Math.round(e.pressure * 100) / 100, w: Math.round(e.width), h: Math.round(e.height) };
  }), { capture: true, passive: true });
  document.addEventListener('pointerup', R.guard((e: PointerEvent) => {
    const d = down;
    if (!d?.el) return;
    // a touch that started on a button and was let go elsewhere (or moved off): touched, not pressed
    const el = (e.target as Element | null)?.closest?.(INTERACTIVE) ?? null;
    if (el !== d.el) { R.emit('ui.abort', { k: d.k, how: 'moved off', ms: Math.round(performance.now() - d.t), dx: Math.round(e.clientX) - d.x, dy: Math.round(e.clientY) - d.y, pt: d.type, screen: screenName }); down = null; }
  }), { capture: true, passive: true });
  document.addEventListener('pointercancel', R.guard(() => { const d = down; if (d?.el) R.emit('ui.abort', { k: d.k, how: 'cancel', ms: Math.round(performance.now() - d.t), pt: d.type, screen: screenName }); down = null; }), { capture: true, passive: true });
  document.addEventListener('click', R.guard((e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.(INTERACTIVE) ?? null;
    const d = down && down.el === el ? down : null;
    // a click with no pointer before it came from the keyboard (Enter / Space on a focused button)
    const pt = d ? d.type : e.detail === 0 ? 'keyboard' : lastPointer;
    R.emit('ui.tap', { k: keyOf(el), x: Math.round(e.clientX), y: Math.round(e.clientY), pt, downMs: d ? Math.round(performance.now() - d.t) : null, pressure: d?.pressure ?? null, cw: d?.w ?? null, ch: d?.h ?? null, screen: screenName, dis: !!(el as HTMLButtonElement | null)?.disabled });
    down = null;
  }), { capture: true, passive: true });
  let hover: { el: Element; t: number } | null = null;
  document.addEventListener('pointerover', R.guard((e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as Element | null)?.closest?.(INTERACTIVE) ?? null;
    if (el === hover?.el) return;
    if (hover) { const ms = performance.now() - hover.t; if (ms >= 80) R.emit('ui.hover', { k: keyOf(hover.el), ms: Math.round(ms), screen: screenName }); }
    hover = el ? { el, t: performance.now() } : null;
  }), { capture: true, passive: true });
  document.addEventListener('keydown', R.guard((e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    const typing = !!t?.closest?.('input, textarea, select, [contenteditable]');
    // in a text box only that a key was pressed and how long the text is, never what
    R.emit('ui.key', typing
      ? { typing: true, field: keyOf(t), len: (t as HTMLInputElement).value?.length ?? null, screen: screenName }
      : { key: e.key.length === 1 || /^(Arrow|Enter|Escape|Tab|Backspace|Home|End|Page| )/.test(e.key) ? e.key : 'other', code: e.code, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey, repeat: e.repeat, focus: keyOf(t), screen: screenName });
  }), { capture: true, passive: true });

  // ---- scroll depth (the screen's own scroller or the page), kept as the maximum until the screen changes
  document.addEventListener('scroll', R.guard((e: Event) => {
    const el = (e.target === document ? document.scrollingElement : e.target) as HTMLElement | null;
    if (!el || !el.scrollHeight) return;
    const depth = Math.min(1, (el.scrollTop + el.clientHeight) / el.scrollHeight);
    scrollSeen = true;
    if (depth > maxScroll + 0.05) { maxScroll = depth; R.emit('ui.scroll', { depth: Math.round(depth * 1000) / 1000, top: Math.round(el.scrollTop), height: el.scrollHeight, screen: screenName, el: keyOf(el) ?? el.className?.toString().slice(0, 30) ?? null }); }
  }), { capture: true, passive: true });

  // ---- clock samples: a few pings now, then every 5 minutes while on screen
  pingClock(5);
  setInterval(() => { if (document.visibilityState === 'visible') pingClock(1); }, 5 * 60_000);
  // samples go out as clock.sync events (with the current estimate); the capture's own cost every minute
  setInterval(R.guard(() => flushClock()), 15_000);
  setInterval(R.guard(() => R.emit('perf.capture', { cost: { ...R.cost, ms: Math.round(R.cost.ms * 100) / 100, max: Math.round(R.cost.max * 100) / 100 }, queue: { ...R.queue.stats, waiting: R.queue.length, bytes: R.queue.size }, events: R.maker.count, heapMB: heap() }, {})), 60_000);

  requestMotionOnGesture();

  // ---- notifications: a tap that opened (or brought back) the app, and what the service worker could not send
  const pushOpen = (via: string) => void idbTake<{ id: string | null; at: number; action: string; kind: string | null; tag: string | null }>('click').then(R.guard((c: { id: string | null; at: number; action: string; kind: string | null; tag: string | null } | null) => {
    if (c && Date.now() - c.at < 10 * 60_000) R.emit('push.open', { via, clickId: c.id, clickAt: c.at, msSinceClick: Date.now() - c.at, action: c.action, kind: c.kind, tag: c.tag, hash: location.hash.slice(0, 40) }, {});
  }));
  pushOpen('launch');
  setTimeout(() => pushOpen('launch-late'), 3000);
  navigator.serviceWorker?.addEventListener?.('message', (e: MessageEvent) => { if ((e.data as { t?: string } | null)?.t === 'open') setTimeout(() => pushOpen('message'), 300); });
  void idbTake<Envelope[]>('pending').then(R.guard((list: Envelope[] | null) => { for (const e of list ?? []) R.queue.push(e); }));
}

const heap = (): number | null => { const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory; return m ? Math.round(m.usedJSHeapSize / 1e5) / 10 : null; };

export const flushClock = (): void => {
  if (!R.clock.waiting) return;
  const est = R.clock.estimate();
  R.emit('clock.sync', { s: R.clock.take(), est: est ? { offset: Math.round(est.offset * 10) / 10, rtt: Math.round(est.rtt * 10) / 10, n: est.n } : null, wall: Date.now(), mono: Math.round(performance.now() * 10) / 10 }, {});
};

/** NTP-style pings to the ingestion server (POST, so the service worker stays out of the way). */
function pingClock(n: number): void {
  const one = async (): Promise<void> => {
    if (!ingestBase()) return;
    const t0 = performance.now();
    try {
      const r = await fetch(`${ingestBase()}/research/ping`, { method: 'POST', body: '', cache: 'no-store' });
      const t3 = performance.now();
      const j = await r.json() as { st?: number };
      if (typeof j.st === 'number') R.clock.add({ k: 'ping', t0, st: j.st, t3 });
    } catch { /* offline */ }
  };
  void (async () => { for (let i = 0; i < n; i++) { await one(); await new Promise((r) => setTimeout(r, 700)); } flushClock(); })();
}
