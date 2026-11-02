// A table without a server, for the motion checks (e2e/tests/motion.spec.ts) and screenshots: a real
// engine deals and plays here, and the table screen gets exactly the events and views a phone would.
import { Engine, type Action, type GameEvent } from '@tp/engine';
import type { ScreenView } from '../net-table';
import { TableScreen, type TableLike } from './screen';

export function labTable(root: HTMLElement, names: string[], o: { me?: number; stack?: number } = {}) {
  const e = Engine.newGame({ startStack: o.stack ?? 2000, sb: 10, bb: 20 }, names);
  for (const p of e.s.players) p.connected = true; // everyone is at the table
  const me = e.s.players[o.me ?? 0]!.id;
  const subs = new Set<(events: GameEvent[], v: ScreenView) => void>();
  const shape = (): ScreenView => ({ ...e.viewFor(me), isHost: true, hostId: me, turnLeft: 0, turnTotal: 0, nextIn: 0 });
  const emit = (ev: GameEvent[]): void => { t.view = shape(); for (const fn of subs) fn(ev, t.view); };
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
    screen: null as TableScreen | null,
  };
  const t: TableLike = {
    view: shape(),
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    act(a: Action) { lab.act(a); }, show() {}, rebuy() {}, sitOut() {}, dealNow() {}, vote() {},
  };
  lab.screen = new TableScreen(root, t, { code: 'LAB', menu() {}, info() {} });
  return lab;
}
