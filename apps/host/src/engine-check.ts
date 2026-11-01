// Runs inside QuickJS on the host phone: plays random hands with the real engine and reports
// whether chips were conserved, so we know the phone runs the same rules as everywhere else.
import { Engine, type Action, type Legal } from '@tp/engine';

function pick(L: Legal, r: number, r2: number): Action {
  if (r < 0.12) return { type: 'fold' };
  if (r < 0.5) return { type: L.canCheck ? 'check' : 'call' };
  if (r < 0.85 && L.canRaise) return { type: 'raise', to: L.minTo + Math.floor(r2 * (L.maxTo - L.minTo + 1)) };
  if (r < 0.92) return { type: 'allin' };
  return { type: L.canCheck ? 'check' : 'call' };
}

export function run(hands: number): { hands: number; conserved: boolean; showdowns: number; ms: number; error?: string } {
  const t0 = Date.now();
  const e = Engine.newGame({ startStack: 1000 }, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
  const total = () => e.s.players.reduce((a, p) => a + p.stack, 0) + (e.s.phase === 'hand' ? e.potTotal() : 0);
  const T = total();
  let played = 0, showdowns = 0;
  try {
    while (played < hands) {
      if (!e.canStartHand()) for (const p of e.s.players) if (p.stack === 0) e.rebuy(p.id);
      e.startHand();
      played++;
      let guard = 0;
      while (e.s.phase === 'hand') {
        const pid = e.s.hand!.toAct!;
        const r = e.act(pid, pick(e.legal(pid)!, Math.random(), Math.random()));
        if (r.error) throw new Error(r.error);
        if (++guard > 400) throw new Error('stuck');
      }
      if (e.s.hand!.results!.showdown) showdowns++;
    }
  } catch (err) {
    return { hands: played, conserved: false, showdowns, ms: Date.now() - t0, error: String(err) };
  }
  const buyins = e.s.players.reduce((a, p) => a + p.buyins, 0);
  return { hands: played, conserved: total() === buyins && T === 10_000, showdowns, ms: Date.now() - t0 };
}
