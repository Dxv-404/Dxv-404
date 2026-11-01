// Runs inside QuickJS on the host phone: plays hands with the real engine through its input door,
// checks every deck proof, and checks SHA-256 against a known answer, so we know the phone deals with
// exactly the same rules and the same shuffle maths as everywhere else.
import { Engine, randomSeed, sha256hex, verifyDeck, type Action, type Legal } from '@tp/engine';

function pick(L: Legal, r: number, r2: number): Action {
  if (r < 0.12) return { type: 'fold' };
  if (r < 0.5) return { type: L.canCheck ? 'check' : 'call' };
  if (r < 0.85 && L.canRaise) return { type: 'raise', to: L.minTo + Math.floor(r2 * (L.maxTo - L.minTo + 1)) };
  if (r < 0.92) return { type: 'allin' };
  return { type: L.canCheck ? 'check' : 'call' };
}

export interface CheckResult { hands: number; conserved: boolean; proofs: boolean; sha: boolean; showdowns: number; ms: number; engineVersion: number; error?: string }

export function run(hands: number): CheckResult {
  const t0 = Date.now();
  const sha = sha256hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const e = Engine.create('check', { startStack: 1000, turnTime: 20, dealItTwice: true }, t0);
  for (let i = 0; i < 10; i++) e.apply({ t: 'join', id: `p${i}`, name: `P${i}`, now: t0 });
  const chips = () => e.s.players.reduce((a, p) => a + p.stack, 0) + (e.s.phase === 'hand' ? e.potTotal() : 0);
  const bought = () => e.s.players.reduce((a, p) => a + p.buyins, 0);
  let played = 0, showdowns = 0, proofs = true, now = t0;
  try {
    while (played < hands) {
      now += 1000;
      for (const p of e.s.players) if (p.stack === 0) e.apply({ t: 'rebuy', pid: p.id, now });
      const r = e.apply({ t: 'start', seed: randomSeed(), now });
      if (r.error) throw new Error(r.error);
      played++;
      let guard = 0;
      while (e.s.phase === 'hand') {
        if (++guard > 400) throw new Error('stuck');
        const h = e.s.hand!;
        if (h.vote) { for (const pid of h.vote.pids) if (e.s.hand?.vote) e.apply({ t: 'vote', pid, yes: Math.random() < 0.5, now }); continue; }
        const pid = h.toAct!;
        const res = e.apply({ t: 'act', pid, action: pick(e.legal(pid)!, Math.random(), Math.random()), now });
        if (res.error) throw new Error(res.error);
      }
      const proof = e.viewFor(null).hand!.proof!;
      if (!verifyDeck({ ...proof, commit: e.s.hand!.deckCommit }).ok) proofs = false;
      if (e.s.hand!.results!.showdown) showdowns++;
      if (chips() !== bought()) throw new Error('chips changed');
    }
  } catch (err) {
    return { hands: played, conserved: false, proofs, sha, showdowns, ms: Date.now() - t0, engineVersion: 2, error: String(err) };
  }
  return { hands: played, conserved: chips() === bought(), proofs, sha, showdowns, ms: Date.now() - t0, engineVersion: e.viewFor(null).engineVersion };
}
