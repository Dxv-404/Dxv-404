// A table without a server, for the motion checks (e2e/tests/motion.spec.ts) and screenshots: a real
// engine deals and plays here, and the table screen gets exactly the events and views a phone would.
import { Engine, randomSeed, type Action, type GameConfig, type GameEvent } from '@tp/engine';
import type { ScreenView } from '../net-table';
import { TableScreen, type TableLike } from './screen';

export function labTable(root: HTMLElement, names: string[], o: { me?: number; stack?: number; cfg?: Partial<GameConfig>; offline?: boolean } = {}) {
  const e = Engine.newGame({ startStack: o.stack ?? 2000, sb: 10, bb: 20, ...(o.cfg ?? {}) }, names);
  for (const p of e.s.players) p.connected = true; // everyone is at the table
  const me = e.s.players[o.me ?? 0]!.id;
  const subs = new Set<(events: GameEvent[], v: ScreenView) => void>();
  let nextDealAt: number | null = null;
  const shape = (): ScreenView => ({ ...e.viewFor(me), isHost: true, hostId: me, turnLeft: 0, turnTotal: 0, nextIn: 0, nextDealAt: e.s.phase !== 'hand' ? nextDealAt : null });
  const emit = (ev: GameEvent[]): void => { t.view = shape(); for (const fn of subs) fn(ev, t.view); };
  /** Everyone checks or calls until the hand ends. */
  const checkDown = (x: Engine): GameEvent[] => {
    const out: GameEvent[] = [];
    for (let g = 0; g < 200 && x.s.phase === 'hand' && x.s.hand?.toAct; g++) {
      const pid = x.s.hand.toAct;
      const r = x.act(pid, { type: x.legal(pid)!.canCheck ? 'check' : 'call' });
      out.push(...(r.events ?? []));
    }
    return out;
  };
  const lab = {
    engine: e, me,
    ids: (): string[] => e.s.players.map((p) => p.id),
    start(): void { emit(e.startHand()); },
    /** The player to act does `a`; returns an error, if any. */
    act(a: Action): string | undefined {
      const pid = e.s.hand?.toAct;
      if (!pid) return 'nobody to act';
      const r = e.act(pid, a);
      if (r.events) emit(r.events);
      return r.error;
    },
    toAct: (): string | null => e.s.hand?.toAct ?? null,
    legal: () => { const pid = e.s.hand?.toAct; return pid ? e.legal(pid) : null; },
    /** Draw again with the same view (as when the dealer's bubble runs out). */
    redraw(): void { emit([]); },
    /** When the next hand is dealt (ms from now; null: not by itself). */
    setNextDeal(ms: number | null): void { nextDealAt = ms === null ? null : Date.now() + ms; emit([]); },
    /**
     * Play one real hand that leaves `pid` with no chips (all in with a short stack, everyone calls down), the
     * way a phone sees it: the win event, the scenes, then the bust-out sheet. Returns false if no deal did.
     */
    bustHand(pid = me, nextIn: number | null = 8000): boolean {
      for (let k = 0; k < 400; k++) {
        const seed = randomSeed();
        const trial = Engine.fromSnapshot(e.snapshot());
        trial.player(pid)!.stack = 10;
        trial.startHand(seed, Date.now());
        checkDown(trial);
        if (trial.player(pid)?.stack !== 0) continue;
        const short = e.player(pid)!, rich = e.s.players.find((p) => p.id !== pid)!;
        rich.stack += short.stack - 10; short.stack = 10; // chips stay on the table
        const ev = [...e.startHand(seed, Date.now()), ...checkDown(e)];
        nextDealAt = nextIn === null ? null : Date.now() + nextIn;
        emit(ev);
        return true;
      }
      return false;
    },
    /** Out of chips at once, without a hand (as after a reconnect). */
    bustNow(pid = me): void {
      const p = e.player(pid)!, rich = e.s.players.find((x) => x.id !== pid)!;
      rich.stack += p.stack; p.stack = 0; p.busted = true;
      emit([]);
    },
    /** Move the blinds on to level n (for rebuys that close after a level). */
    level(n: number): void { e.s.level = { ...e.s.level, n }; emit([]); },
    rebuys: 0,
    left: 0,
    screen: null as TableScreen | null,
  };
  const t: TableLike = {
    view: shape(),
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    act(a: Action) { lab.act(a); },
    show() {},
    rebuy() { lab.rebuys++; const r = e.apply({ t: 'rebuy', pid: me, now: Date.now() }); if (r.events) emit(r.events); },
    sitOut() {}, dealNow() {}, vote() {},
  };
  lab.screen = new TableScreen(root, t, { code: 'LAB', menu() {}, info() {}, offline: o.offline, leave: () => { lab.left++; } });
  return lab;
}
