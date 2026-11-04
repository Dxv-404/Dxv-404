// Research capture at the table, on this device: when each turn appeared here, what was sent and when the
// table answered (a round trip per action), every update as it arrived, connection drops and resumes, WebSocket
// clock samples, the raise amount path (about 30 Hz), the mouse path on laptops (20 Hz on my turn, 2 Hz
// otherwise), peeking at the cards, motion windows, and frame timings around the heavy animations.
// The table server records the authoritative game; this is how it looked and felt here.
import { SampleStream } from '@tp/research';
import { R } from './capture';
import { motionStart, motionStop, holdWatch } from './motion';

type V = { handNo: number; phase: string; me: string | null; hand: { id: number; street: string; toAct: string | null; currentBet: number; pot: number; board: string[]; ps: Record<string, { cards: string[] | null; folded: boolean }> } | null; legal: object | null; turnLeft?: number; turnTotal?: number; level?: { sb: number; bb: number } };

let current: TableCapture | null = null;
const setCurrent = (c: TableCapture | null): void => { current = c; };

export class TableCapture {
  private turnKey = '';
  private turnAt: number | null = null;
  private turnLegal: object | null = null;
  private dealtHand = -1;
  private sent = new Map<string, { at: number; kind: string }>();
  private via: string | null = null;
  private status = 'connecting';
  private statusAt = performance.now();
  private mouse: SampleStream;
  private mouseFast = false;
  private mouseTimer: ReturnType<typeof setInterval>;
  private onMove: (e: PointerEvent) => void;
  private lastPt = 'none';
  private onDown: (e: PointerEvent) => void;

  constructor(readonly code: string, readonly offline: boolean) {
    setCurrent(this);
    R.where = { tb: code, h: null, st: null };
    this.mouse = new SampleStream({ x: 1, y: 1 }, 500, 3000);
    this.onMove = R.guard((e: PointerEvent) => { if (e.pointerType === 'mouse') this.mouse.add(performance.now(), { x: e.clientX, y: e.clientY }); });
    this.onDown = (e: PointerEvent) => { this.lastPt = e.pointerType; };
    addEventListener('pointermove', this.onMove, { passive: true });
    addEventListener('pointerdown', this.onDown, { passive: true, capture: true });
    this.mouseTimer = setInterval(R.guard(() => { if (!this.mouseFast && this.mouse.count) this.flushMouse('idle'); }), 10_000);
    holdWatch(true);
    R.emit('table.view', { kind: 'open', offline, code });
  }

  /** A new view of the table arrived (an update, or a welcome). */
  view = R.guard((v: V, events: { t: string }[]) => {
    const h = v.hand;
    R.where = { tb: this.code, h: v.handNo || null, st: h ? h.street : v.phase === 'between' ? 'between' : null };
    const me = v.me;
    const types = events.map((e) => e.t);
    if (types.includes('handStart')) this.frames('deal');
    if (types.includes('win')) this.frames('result');
    // my cards were dealt: motion from now until my decision
    const mine = me && h?.ps[me]?.cards && !h.ps[me]!.folded;
    if (mine && h!.id !== this.dealtHand) { this.dealtHand = h!.id; motionStart('dealt'); }
    if (!mine || !h || v.phase !== 'hand') motionStop(!h || v.phase !== 'hand' ? 'hand over' : 'folded');
    // my turn
    const myTurn = !!(me && h?.toAct === me && v.legal);
    const key = myTurn ? `${v.handNo}:${h!.street}:${h!.currentBet}:${(v.legal as { streetBet?: number }).streetBet}` : '';
    if (myTurn && key !== this.turnKey) {
      this.turnKey = key; this.turnAt = performance.now(); this.turnLegal = v.legal;
      R.emit('turn.start', { handNo: v.handNo, street: h!.street, legal: v.legal, turnLeftMs: Math.round(v.turnLeft ?? 0), turnTotalMs: Math.round(v.turnTotal ?? 0), pot: h!.pot, board: h!.board, cards: h!.ps[me!]?.cards ?? null, players: Object.keys(h!.ps).length, live: Object.values(h!.ps).filter((x) => !x.folded).length, blinds: v.level ?? null, visible: document.visibilityState, focused: document.hasFocus(), events: types });
      this.setMouseFast(true);
      motionStart('turn');
    } else if (!myTurn && this.turnKey) {
      // the turn ended without an action from here (a timeout, or played from another device)
      if (this.turnAt !== null) R.emit('turn.start', { kind: 'ended', handNo: v.handNo, ms: Math.round(performance.now() - this.turnAt), sentFromHere: false });
      this.endTurn('turn over');
    }
  });

  private endTurn(why: string): void {
    this.turnKey = ''; this.turnAt = null; this.turnLegal = null;
    this.setMouseFast(false);
    motionStop(why);
  }

  /** How the next action is being made (set by the table screen: a button, a key, the raise sheet). */
  setVia(via: string): void { this.via = via; }

  /** Something was sent to the table (an action, a show, a rebuy, sitting out...). */
  sentMsg = R.guard((kind: string, payload: Record<string, unknown>, actionId: string | null) => {
    const now = performance.now();
    const turn = this.turnAt;
    if (actionId) this.sent.set(actionId, { at: now, kind });
    R.emit('act.send', { kind, actionId, ...payload, sinceTurnMs: kind === 'act' && turn !== null ? Math.round(now - turn) : null, legal: kind === 'act' ? this.turnLegal : null, via: this.via, pt: this.lastPt, wall: Date.now(), visible: document.visibilityState });
    this.via = null;
    if (kind === 'act' && turn !== null) { this.endTurnKeepKey(); }
  });

  private endTurnKeepKey(): void { this.turnAt = null; this.setMouseFast(false); motionStop('decision'); }

  /** The table answered an action: the round trip as seen here. */
  ack = R.guard((actionId: string, ok: boolean, error?: string) => {
    const s = this.sent.get(actionId);
    this.sent.delete(actionId);
    R.emit('act.ack', { actionId, ok, error: error ?? null, rttMs: s ? Math.round((performance.now() - s.at) * 10) / 10 : null, kind: s?.kind ?? null });
  });

  netStatus = R.guard((s: string) => {
    const now = performance.now();
    R.emit('net.status', { status: s, prev: this.status, prevMs: Math.round(now - this.statusAt), online: navigator.onLine });
    this.status = s; this.statusAt = now;
  });

  /** From the table client: pongs (clock samples), updates as they arrive, gaps, welcomes. */
  trace = R.guard((kind: string, d: Record<string, number>) => {
    if (kind === 'pong') { const t3 = performance.now(); R.clock.add({ k: 'ws', t0: t3 - d.rtt!, st: d.s!, t3 }); return; }
    if (kind === 'update') R.emit('table.view', { kind: 'update', seq: d.seq, at: d.at ?? null, recvWall: Date.now(), n: d.n });
    else if (kind === 'welcome') R.emit('table.view', { kind: 'welcome', seq: d.seq, missed: d.missed, serverTime: d.serverTime, recvWall: Date.now() });
    else if (kind === 'gap') R.emit('net.gap', { have: d.have, got: d.got });
  });

  peek = R.guard((on: boolean, how: string) => { R.emit('table.peek', { on, how, myTurn: this.turnAt !== null }); });

  private setMouseFast(on: boolean): void {
    if (on === this.mouseFast) return;
    if (this.mouse.count) this.flushMouse(on ? 'idle' : 'turn');
    this.mouseFast = on;
    this.mouse = new SampleStream({ x: 1, y: 1 }, on ? 50 : 500, 3000);
  }

  private flushMouse(phase: string): void {
    const b = this.mouse.take();
    if (!b) return;
    // where the action buttons were (so approaches toward them can be worked out later)
    const buttons = [...document.querySelectorAll<HTMLElement>('.tp-screen [data-act]')].filter((el) => el.offsetParent !== null).slice(0, 16).map((el) => {
      const r = el.getBoundingClientRect();
      return { k: el.dataset.act, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    R.emit('mouse.path', { phase, hz: phase === 'turn' ? 20 : 2, vw: innerWidth, vh: innerHeight, buttons, batch: b });
  }

  /** About 2 s of frame intervals (raw) while the deal or the result animates. */
  private frames(ctx: string): void {
    if (document.visibilityState !== 'visible') return;
    const dt: number[] = [];
    let last = performance.now();
    const end = last + 2000;
    const loop = (t: number): void => { dt.push(Math.round((t - last) * 10) / 10); last = t; if (t < end && dt.length < 300) requestAnimationFrame(loop); else R.emit('perf.frames', { ctx, dt }); };
    requestAnimationFrame(loop);
  }

  close = R.guard(() => {
    this.flushMouse(this.mouseFast ? 'turn' : 'idle');
    motionStop('left table');
    holdWatch(false);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerdown', this.onDown, { capture: true });
    clearInterval(this.mouseTimer);
    R.emit('table.view', { kind: 'close', code: this.code });
    if (current === this) current = null;
    R.where = {};
  });
}

// ---------------------------------------------------------------- the raise sheet's amount path
let raise: { open: number; stream: SampleStream; marks: (string | number)[][]; spot: unknown; pending: number | null; timer: ReturnType<typeof setTimeout> | null; last: number | null } | null = null;

/** From the raise sheet (raise.ts): opened, each amount it shows, presets / typing / steps, and how it closed. */
export const raiseTrace = R.guard((kind: string, d: Record<string, unknown>) => {
  const now = performance.now();
  if (kind === 'open') {
    raise = { open: now, stream: new SampleStream({ to: 1 }, 33, 3000), marks: [], spot: d.spot ?? null, pending: null, timer: null, last: null };
    raise.stream.add(now, { to: d.to as number }, true);
    raise.last = d.to as number;
    current?.setVia('raise');
    return;
  }
  const r = raise;
  if (!r) return;
  if (kind === 'value') {
    const to = d.to as number;
    if (to === r.last) return;
    r.last = to;
    // every value, at most about 30 a second: one that comes too soon waits for its slot (the latest wins)
    if (!r.stream.add(now, { to })) {
      r.pending = to;
      r.timer ??= setTimeout(() => { if (raise === r && r.pending !== null) { r.stream.add(performance.now(), { to: r.pending }, true); r.pending = null; } r.timer = null; }, 34);
    }
    return;
  }
  if (kind === 'close') {
    if (r.timer) clearTimeout(r.timer);
    if (r.pending !== null) r.stream.add(now, { to: r.pending }, true);
    R.emit('raise.path', { spot: r.spot, ms: Math.round(now - r.open), result: d.result ?? null, final: d.to ?? r.last, marks: r.marks, batch: r.stream.take() });
    raise = null;
    return;
  }
  // a mark: a preset, a step, typing, a drag starting or ending
  r.marks.push([Math.round(now - r.open), kind, (d.v as string | number | undefined) ?? '']);
});

export const tableVia = (via: string): void => { try { current?.setVia(via); } catch { /* ignore */ } };
export const tablePeek = (on: boolean, how: string): void => { try { current?.peek(on, how); } catch { /* ignore */ } };
