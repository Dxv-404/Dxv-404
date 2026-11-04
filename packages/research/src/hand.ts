// A finished hand, as research events. Worked out from the engine's own hand record (the table just before
// the hand, and every input during it, each with the server's time): replaying it gives exactly what each
// player could see at each moment, so this runs once per hand, after the hand, never while anyone waits.
// The same code serves the Cloudflare and Oracle servers and nights uploaded from the offline host phone.
//
// Everything here is server-side only: every player's hole cards (folded hands too), the seed and the full
// deck order. None of it is ever sent to phones.
import { Engine, cardStr, deckFromSeed, type GameEvent, type GameState, type HandRecord, type Input, type PlayerId, type View } from '@tp/engine';
import type { EventType } from './schema';

/** One research event of a hand, before it gets its envelope. `pid`: the player it is about (or null). */
export interface HandEvt { t: EventType; pid: PlayerId | null; at: number; st: string | null; p: Record<string, unknown> }

type Pots = { amount: number; elig: PlayerId[] }[];

/** Position at the table: index in acting order, how many seats from the button (0 = button), and role. */
function position(order: PlayerId[], pid: PlayerId, h: { sbId: PlayerId | null; bbId: PlayerId | null; straddleId: PlayerId | null; buttonId: PlayerId | null }) {
  const i = order.indexOf(pid);
  const n = order.length;
  const role = pid === h.buttonId ? 'btn' : pid === h.sbId ? 'sb' : pid === h.bbId ? 'bb' : pid === h.straddleId ? 'str' : null;
  return { i, n, fromBtn: n - 1 - i, role };
}

/** What a player could see, without what never changes or is not about the game (names, the text log). */
function infoSet(v: View): Record<string, unknown> {
  const { log: _log, cfg: _cfg, players, ...rest } = v;
  return { ...rest, players: players.map(({ name: _n, ...p }) => p) };
}

const stacksOf = (s: GameState): Record<PlayerId, number> => Object.fromEntries(s.players.concat(s.departed ?? []).map((p) => [p.id, p.stack]));

/**
 * The hand's events, in order: hand.start, then for each decision hand.decision (the information set) and
 * hand.action (what was done, its size and timing), hand.street, hand.vote, hand.show, and hand.end.
 * `withBefore`: include the table before the hand (needed to replay the hand exactly; large).
 */
export function handEvents(rec: HandRecord, o: { withBefore?: boolean } = { withBefore: true }): HandEvt[] {
  const before: GameState = { ...rec.before, hand: null, log: [] };
  const e = Engine.fromSnapshot(before);
  const out: HandEvt[] = [];
  const hist: (string | number)[][] = [];
  const stacks0 = stacksOf(before);
  let decisionKey = '';
  let k = 0;
  let lastAt = rec.startedAt;
  const shownVoluntarily: PlayerId[] = [];

  const potsNow = (): Pots => (e.s.hand ? e.buildPots().map((p) => ({ amount: p.amount, elig: p.elig })) : []);
  const decision = (at: number): void => {
    const h = e.s.hand;
    if (!h || e.s.phase !== 'hand' || !h.toAct || h.results) { decisionKey = ''; return; }
    if (h.vote) return;
    const key = `${h.toAct}:${h.turnStartedAt}:${h.street}:${h.currentBet}`;
    if (key === decisionKey) return;
    decisionKey = key;
    const pid = h.toAct;
    const p = e.player(pid)!;
    out.push({
      t: 'hand.decision', pid, at: h.turnStartedAt || at, st: h.street,
      p: {
        k: k++, pid, pos: position(h.order, pid, h), legal: e.legal(pid), bank: p.bank, turnTime: e.s.cfg.turnTime,
        turnStartedAt: h.turnStartedAt, deadline: e.deadline(), grace: !!h.graceUsed[pid], hist: hist.map((x) => x.slice()),
        pots: potsNow(), view: infoSet(e.viewFor(pid)),
      },
    });
  };

  for (const input of rec.inputs) {
    const h0 = e.s.hand;
    const pre = h0 && 'pid' in input && h0.ps[input.pid] ? (() => {
      const pid = input.pid;
      const pl = e.player(pid)!;
      return { pid, stack: pl.stack, bank: pl.bank, streetBet: h0.ps[pid]!.streetBet, legal: e.legal(pid), pot: e.potTotal(), street: h0.street, turnStartedAt: h0.turnStartedAt, toAct: h0.toAct };
    })() : null;
    const toActBefore = h0?.toAct ?? null;
    const preTick = input.t === 'tick' && h0 && toActBefore ? { pid: toActBefore, stack: e.player(toActBefore)!.stack, bank: e.player(toActBefore)!.bank, streetBet: h0.ps[toActBefore]!.streetBet, legal: e.legal(toActBefore), pot: e.potTotal(), street: h0.street, turnStartedAt: h0.turnStartedAt } : null;
    const r = e.apply(input);
    if (r.error) throw new Error(`hand ${rec.handNo} does not replay: ${r.error}`);
    const at = input.now ?? lastAt;
    lastAt = at;
    const h = e.s.hand;
    const evs: GameEvent[] = r.events ?? [];

    if (input.t === 'start' && h) {
      const seed = h.seedInfo.seed;
      out.push({
        t: 'hand.start', pid: null, at, st: 'preflop',
        p: {
          handNo: h.id, startedAt: h.startedAt, level: e.s.level, button: { pid: h.buttonId, chair: h.buttonChair }, sbChair: h.sbChair, bbChair: h.bbChair,
          sb: h.sbId, bb: h.bbId, straddle: h.straddleId, order: h.order, engineVersion: h.engineVersion,
          seed: { dealer: h.seedInfo.dealerSeed, contributions: h.seedInfo.contributions, combined: seed, dealerCommit: h.seedInfo.dealerSeedCommit, deckCommit: h.deckCommit },
          deck: deckFromSeed(seed).map(cardStr),
          holes: Object.fromEntries(h.order.map((pid) => [pid, h.ps[pid]!.cards.map(cardStr)])),
          posts: evs.filter((x) => x.t === 'blind' || x.t === 'ante').map((x) => ({ pid: (x as { pid: string }).pid, kind: x.t === 'ante' ? 'ante' : (x as { kind: string }).kind, amount: (x as { amount: number }).amount })),
          levelChanged: evs.some((x) => x.t === 'level'),
          players: e.s.players.map((p) => ({
            pid: p.id, seat: p.seat, chair: p.chair, stackBefore: stacks0[p.id] ?? null, stack: p.stack, dealt: h.order.includes(p.id), pos: h.order.includes(p.id) ? position(h.order, p.id, h) : null,
            sittingOut: p.sittingOut, away: p.away, waitForBB: p.waitForBB, missedSB: p.missedSB, missedBB: p.missedBB, connected: p.connected,
            bank: p.bank, buyins: p.buyins, rebuysUsed: p.rebuysUsed, wantsStraddle: p.wantsStraddle, leaving: p.leaving,
          })),
          cfg: e.s.cfg,
        },
      });
    }

    for (const ev of evs) {
      if (ev.t === 'act') {
        const b = pre && pre.pid === ev.pid ? pre : preTick && preTick.pid === ev.pid ? preTick : null;
        const pl = e.player(ev.pid) ?? e.s.departed?.find((x) => x.id === ev.pid);
        const amount = ev.amount ?? 0;
        const timeout = input.t === 'tick' && !!ev.auto;
        hist.push([h?.order.indexOf(ev.pid) ?? -1, ev.a, ev.to ?? 0, amount, b?.street ?? h?.street ?? '']);
        out.push({
          t: 'hand.action', pid: ev.pid, at, st: b?.street ?? h?.street ?? null,
          p: {
            pid: ev.pid, a: ev.a, to: ev.to ?? null, amount, auto: !!ev.auto, timeout,
            requested: input.t === 'act' && input.pid === ev.pid ? input.action : null,
            pos: h ? position(h.order, ev.pid, h) : null,
            toCall: b?.legal?.toCall ?? null, legal: b?.legal ?? null,
            potBefore: b?.pot ?? null, stackBefore: b?.stack ?? null, streetBetBefore: b?.streetBet ?? null,
            stackAfter: pl?.stack ?? null, potAfter: e.potTotal(),
            /** chips put in / pot before; / stack before; a bet or raise's total size (to) / pot before */
            sizePot: b && b.pot > 0 ? round4(amount / b.pot) : null,
            sizeStack: b && b.stack > 0 ? round4(amount / b.stack) : null,
            toPot: b && b.pot > 0 && ev.to !== undefined ? round4(ev.to / b.pot) : null,
            decisionMs: b ? at - b.turnStartedAt : null, bankBefore: b?.bank ?? null, bankAfter: pl?.bank ?? null,
            pots: potsNow(), stacks: stacksOf(e.s),
          },
        });
      } else if (ev.t === 'street') {
        out.push({ t: 'hand.street', pid: null, at, st: ev.street, p: { street: ev.street, cards: ev.cards, board: ev.board ?? 1, boardNow: h?.board.map(cardStr) ?? [], board2Now: h?.board2?.map(cardStr) ?? null, pot: e.potTotal(), pots: potsNow(), stacks: stacksOf(e.s), live: h ? h.order.filter((x) => !h.ps[x]!.folded) : [], runout: !!h?.runout } });
      } else if (ev.t === 'voteTwice') {
        out.push({ t: 'hand.vote', pid: null, at, st: h?.street ?? null, p: { kind: 'offer', pids: ev.pids, deadline: ev.deadline } });
      } else if (ev.t === 'twice') {
        out.push({ t: 'hand.vote', pid: null, at, st: h?.street ?? null, p: { kind: 'result', agreed: ev.agreed, timedOut: input.t === 'tick' } });
      } else if (ev.t === 'show') {
        shownVoluntarily.push(ev.pid);
        out.push({ t: 'hand.show', pid: ev.pid, at, st: h?.street ?? null, p: { pid: ev.pid, cards: ev.cards, voluntary: true, afterEnd: !!h?.results } });
      }
    }
    if (input.t === 'vote') out.push({ t: 'hand.vote', pid: input.pid, at, st: h?.street ?? null, p: { kind: 'vote', pid: input.pid, yes: input.yes } });
    decision(at);
  }

  const h = e.s.hand!;
  const res = h.results;
  const stacks1 = stacksOf(e.s);
  const buyins0 = Object.fromEntries(before.players.concat(before.departed ?? []).map((p) => [p.id, p.buyins]));
  const after = e.s.players.concat(e.s.departed ?? []);
  out.push({
    t: 'hand.end', pid: null, at: rec.endedAt, st: 'showdown',
    p: {
      handNo: rec.handNo, startedAt: rec.startedAt, endedAt: rec.endedAt, ms: rec.endedAt - rec.startedAt,
      board: rec.board, board2: rec.board2,
      holes: Object.fromEntries(h.order.map((pid) => [pid, h.ps[pid]!.cards.map(cardStr)])),
      folded: h.order.filter((pid) => h.ps[pid]!.folded),
      /** shown at the showdown by the rules (everyone still in shows); shown by choice; never shown */
      revealed: Object.keys(h.revealed).filter((x) => h.revealed[x]),
      shown: shownVoluntarily,
      mucked: h.order.filter((pid) => !h.revealed[pid] && !h.shown[pid]),
      showdown: !!res?.showdown, twice: !!res?.twice,
      pots: res?.pots.map((p) => ({ label: p.label, amount: p.amount, board: p.board ?? null, hand: p.hand?.name ?? null, awards: p.awards })) ?? [],
      evals: res ? Object.fromEntries(Object.entries(res.evals).map(([pid, ev]) => [pid, { score: ev.score, name: ev.name, best: ev.best }])) : {},
      evals2: res?.evals2 ? Object.fromEntries(Object.entries(res.evals2).map(([pid, ev]) => [pid, { score: ev.score, name: ev.name, best: ev.best }])) : null,
      stacksBefore: stacks0, stacksAfter: stacks1,
      net: Object.fromEntries(h.order.map((pid) => [pid, (stacks1[pid] ?? 0) - (stacks0[pid] ?? 0) - ((after.find((p) => p.id === pid)?.buyins ?? 0) - (buyins0[pid] ?? 0))])),
      contributed: Object.fromEntries(h.order.map((pid) => [pid, h.ps[pid]!.total])),
      level: e.s.level, deckCommit: rec.deckCommit, engineVersion: rec.engineVersion, decisions: k,
      /** the exact replay log: the inputs (each with the server's time) and, if asked, the table before */
      inputs: rec.inputs.map(slimInput),
      ...(o.withBefore ? { before } : {}),
    },
  });
  return out;
}

const round4 = (x: number): number => Math.round(x * 10000) / 10000;
/** Inputs as recorded, except a shuffle seed's long contribution list is kept (it is needed to replay). */
const slimInput = (i: Input): Input => i;
