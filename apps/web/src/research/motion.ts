// Motion sensors (owner approved): acceleration, rotation rate and orientation at about 10 Hz, only from the
// moment a player's cards are dealt until their decision (and during each of their turns), plus a coarse
// "held or resting" summary between decisions from a short listen every 15 s. Listeners exist only inside
// those windows (battery). On iPhones the permission is asked inside a tap the player makes anyway (their
// first tap on sit, join or open); denied or unsupported is recorded, and nothing else changes.
import { SampleStream } from '@tp/research';
import { R } from './capture';

type Perm = 'granted' | 'denied' | 'unsupported' | 'not-required' | 'error' | 'unknown';
let perm: Perm = 'unknown';
let asked = false;

const MotionEv = (): { requestPermission?: () => Promise<string> } | undefined => (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
const OrientEv = (): { requestPermission?: () => Promise<string> } | undefined => (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;

/** Taps that count as "sit or join": the permission prompt (iOS) rides on the first of them. */
const SIT_OR_JOIN = '[data-testid=online-join],[data-testid=online-open],[data-testid=online-back],[data-testid=online-host],[data-testid=play-online],[data-act=sitin],[data-act=deal],[data-testid=join-table],[data-testid=crew-join-table],.tp-screen';

export function requestMotionOnGesture(): void {
  if (!('DeviceMotionEvent' in window)) { perm = 'unsupported'; R.emit('motion.perm', { state: perm, api: 'none' }, {}); return; }
  const M = MotionEv();
  if (typeof M?.requestPermission !== 'function') { perm = 'not-required'; R.emit('motion.perm', { state: perm, api: 'w3c' }, {}); return; }
  // iOS: must be called synchronously inside the tap's own handler
  const onTap = (e: Event): void => {
    if (asked) return;
    const t = e.target as Element | null;
    if (!t?.closest?.(SIT_OR_JOIN)) return;
    asked = true;
    document.removeEventListener('click', onTap, true);
    const t0 = performance.now();
    try {
      void M.requestPermission!().then((s) => {
        perm = s === 'granted' ? 'granted' : 'denied';
        R.emit('motion.perm', { state: perm, api: 'ios', ms: Math.round(performance.now() - t0), via: (t.closest('[data-testid]') as HTMLElement | null)?.dataset.testid ?? null }, {});
        // orientation has its own permission on iOS: asked right after (same gesture chain)
        const O = OrientEv();
        if (perm === 'granted' && typeof O?.requestPermission === 'function') void O.requestPermission().catch(() => {});
      }, () => { perm = 'error'; R.emit('motion.perm', { state: perm, api: 'ios' }, {}); });
    } catch { perm = 'error'; R.emit('motion.perm', { state: perm, api: 'ios' }, {}); }
  };
  document.addEventListener('click', onTap, true);
}

const canListen = (): boolean => perm === 'granted' || perm === 'not-required';

// ---------------------------------------------------------------- the 10 Hz window
const COLS = { ax: 100, ay: 100, az: 100, lx: 100, ly: 100, lz: 100, ra: 10, rb: 10, rg: 10, oa: 10, ob: 10, og: 10 };
let win: { why: string; stream: SampleStream; started: number; ctx: { tb?: string | null; h?: number | null; st?: string | null }; last: Record<string, number | null>; events: number; timer: ReturnType<typeof setInterval> } | null = null;

const onMotion = (e: DeviceMotionEvent): void => {
  if (!win) return;
  win.events++;
  const g = e.accelerationIncludingGravity, a = e.acceleration, r = e.rotationRate;
  Object.assign(win.last, { ax: g?.x ?? null, ay: g?.y ?? null, az: g?.z ?? null, lx: a?.x ?? null, ly: a?.y ?? null, lz: a?.z ?? null, ra: r?.alpha ?? null, rb: r?.beta ?? null, rg: r?.gamma ?? null });
};
const onOrient = (e: DeviceOrientationEvent): void => { if (win) Object.assign(win.last, { oa: e.alpha, ob: e.beta, og: e.gamma }); };

/** Start recording (cards dealt, or my turn). Ignored if already on. */
export const motionStart = R.guard((why: string) => {
  if (!canListen() || win || document.visibilityState !== 'visible') return;
  const stream = new SampleStream(COLS, 90, 1200);
  win = { why, stream, started: performance.now(), ctx: { ...R.where }, last: {}, events: 0, timer: setInterval(() => { if (win && Object.keys(win.last).length) win.stream.add(performance.now(), win.last); }, 100) };
  addEventListener('devicemotion', onMotion, { passive: true });
  addEventListener('deviceorientation', onOrient, { passive: true });
});

/** Stop (my decision went out, I folded, the hand ended): the samples go out as one event. */
export const motionStop = R.guard((why: string) => {
  const w = win;
  if (!w) return;
  win = null;
  clearInterval(w.timer);
  removeEventListener('devicemotion', onMotion);
  removeEventListener('deviceorientation', onOrient);
  const b = w.stream.take();
  R.emit('motion.samples', { from: w.why, to: why, ms: Math.round(performance.now() - w.started), rawEvents: w.events, hz: 10, batch: b }, w.ctx);
});

// ---------------------------------------------------------------- between decisions: held or resting
let holdTimer: ReturnType<typeof setInterval> | null = null;
/** While a table is on screen: every 15 s (outside the 10 Hz windows), listen for one second. */
export function holdWatch(on: boolean): void {
  if (!on) { if (holdTimer) clearInterval(holdTimer); holdTimer = null; return; }
  if (holdTimer || !canListen()) return;
  holdTimer = setInterval(R.guard(() => {
    if (win || document.visibilityState !== 'visible') return;
    const mags: number[] = []; let rotMax = 0; let beta: number | null = null; let gamma: number | null = null;
    const f = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (g?.x != null && g.y != null && g.z != null) mags.push(Math.hypot(g.x, g.y, g.z));
      const r = e.rotationRate; if (r) rotMax = Math.max(rotMax, Math.abs(r.alpha ?? 0), Math.abs(r.beta ?? 0), Math.abs(r.gamma ?? 0));
    };
    const o = (e: DeviceOrientationEvent) => { beta = e.beta; gamma = e.gamma; };
    addEventListener('devicemotion', f, { passive: true }); addEventListener('deviceorientation', o, { passive: true });
    setTimeout(R.guard(() => {
      removeEventListener('devicemotion', f); removeEventListener('deviceorientation', o);
      if (!mags.length) return;
      const mean = mags.reduce((s, x) => s + x, 0) / mags.length;
      const sd = Math.sqrt(mags.reduce((s, x) => s + (x - mean) ** 2, 0) / mags.length);
      // coarse rule (documented): a phone in a hand jitters; one on a table does not
      const state = sd > 0.12 || rotMax > 3 ? 'held' : 'resting';
      R.emit('motion.hold', { n: mags.length, accMean: round3(mean), accSd: round3(sd), rotMax: round3(rotMax), beta: beta === null ? null : round3(beta), gamma: gamma === null ? null : round3(gamma), state, rule: 'sd>0.12||rot>3' });
    }), 1000);
  }), 15_000);
}
const round3 = (x: number): number => Math.round(x * 1000) / 1000;
export const motionPermission = (): Perm => perm;
