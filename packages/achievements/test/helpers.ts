// Hand-built hands for the achievement tests: say who holds what, the board and the betting in a line,
// and get the same plain facts the adapter makes from a real record. A tiny betting book-keeper works
// out what each action cost; winners are worked out from the cards unless the test names them.
import { evalBest, parseCard } from '@tp/engine';
import type { ActionFact, HandFacts, StreetName } from '../src/facts';

export interface Spec {
  /** "As Ah" per player; the order of the keys is the acting order. */
  hole: Record<string, string>;
  board?: string;
  board2?: string;
  /** "preflop: a raise 300, b call | flop: a check, b bet 200, a fold". Amounts are "to" amounts;
   * "allin" puts in the rest of the stack; a trailing * marks a timeout. No blinds are posted. */
  acts?: string;
  /** Who is paid, splitting the pot evenly. Default: whoever is left, or the best hand at a showdown. */
  win?: string[];
  stacks?: Record<string, number> | number;
  buyins?: Record<string, number> | number;
  bb?: number; no?: number; at?: number; game?: string;
  peeks?: Record<string, number>;
}

const N: Record<StreetName, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
const cards = (s: string | undefined): string[] => (s ? s.trim().split(/\s+/) : []);

export function hand(o: Spec): HandFacts {
  const order = Object.keys(o.hole);
  const num = (v: Record<string, number> | number | undefined, d: number, p: string): number => (typeof v === 'number' ? v : (v?.[p] ?? d));
  const stack: Record<string, number> = {}, before: Record<string, number> = {}, buyins: Record<string, number> = {};
  for (const p of order) { before[p] = stack[p] = num(o.stacks, 10_000, p); buyins[p] = num(o.buyins, 10_000, p); }
  const actions: ActionFact[] = [];
  const folded = new Set<string>();
  let pot = 0;
  for (const part of (o.acts ?? '').split('|').map((x) => x.trim()).filter(Boolean)) {
    const [st, list] = part.split(':') as [StreetName, string];
    const street = st.trim() as StreetName;
    if (!(street in N)) throw new Error(`street? ${st}`);
    const bet: Record<string, number> = {};
    let cur = 0;
    for (const item of list.split(',').map((x) => x.trim()).filter(Boolean)) {
      const auto = item.endsWith('*');
      const [p, what, amt] = item.replace('*', '').split(/\s+/) as [string, string, string | undefined];
      if (!order.includes(p)) throw new Error(`who? ${item}`);
      const mine = bet[p] ?? 0, toCall = Math.min(Math.max(cur - mine, 0), stack[p]!);
      let kind: ActionFact['kind'], put = 0;
      if (what === 'fold' || what === 'check') kind = what;
      else if (what === 'call') { kind = 'call'; put = toCall; }
      else {
        const to = what === 'allin' ? mine + stack[p]! : Number(amt);
        if (what === 'allin' && to <= cur) { kind = 'call'; put = stack[p]!; }
        else { kind = cur === 0 ? 'bet' : 'raise'; put = to - mine; cur = to; }
      }
      if (kind === 'fold') folded.add(p);
      stack[p]! -= put; bet[p] = mine + put; pot += put;
      actions.push({ pid: p, street, kind, put, toCall, allIn: put > 0 && stack[p] === 0, auto, board: N[street] });
    }
  }
  const board = cards(o.board), left = order.filter((p) => !folded.has(p));
  const showdown = left.length > 1 ? left : [];
  let win = o.win;
  if (!win) {
    if (left.length === 1) win = left;
    else {
      const sc = (p: string): number => evalBest([...cards(o.hole[p]), ...board].map(parseCard))?.score ?? 0;
      const top = Math.max(...left.map(sc));
      win = left.filter((p) => sc(p) === top);
    }
  }
  const awards: Record<string, number> = {};
  for (const p of win) { awards[p] = Math.floor(pot / win.length); stack[p]! += awards[p]!; }
  const hole: Record<string, string[]> = {};
  for (const p of order) hole[p] = cards(o.hole[p]);
  return {
    game: o.game ?? 'g1', handNo: o.no ?? 1, endedAt: o.at ?? Date.UTC(2026, 10, 7, 15, 0), bb: o.bb ?? 100, order, hole, board,
    board2: o.board2 ? cards(o.board2) : null, actions, showdown, awards, pot, stackBefore: before, stackAfter: stack, buyins,
    ...(o.peeks ? { peeks: o.peeks } : {}),
  };
}
