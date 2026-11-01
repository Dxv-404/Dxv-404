// Authoritative No-Limit Texas Hold'em engine.
// Pure logic: no DOM, no timers. Every mutating call returns a list of events
// that clients animate; the per-seat view is produced by viewFor().
import { freshDeck, shuffle, evalBest, cardStr } from './cards';
import type {
  Action, ActResult, Award, GameConfig, GameEvent, GameState, Hand, HandEval, HandPlayer,
  HandPlayerView, Legal, Player, PlayerId, PotResult, Standing, View,
} from './types';

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
const rid = (n: number): string => Math.random().toString(36).slice(2, 2 + n);

/** Round a blind to a friendly number. */
export function niceRound(x: number): number {
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  let best = steps[0]! * mag;
  for (const s of steps) if (Math.abs(s * mag - x) < Math.abs(best - x)) best = s * mag;
  return Math.max(1, Math.round(best));
}

interface BuiltPot { amount: number; elig: PlayerId[] }

export class Engine {
  s: GameState;
  undoStack: GameState[] = [];

  constructor(state: GameState) {
    this.s = state;
  }

  // ---------------- setup ----------------
  static newGame(config: Partial<GameConfig>, names: string[]): Engine {
    const cfg: GameConfig = {
      startStack: 1000, sb: 5, bb: 10, blindUpEvery: 0, turnTime: 0, rebuys: true,
      ...config,
    };
    const players = names.map((n, i) => Engine.makePlayer(n, i, cfg.startStack));
    const st: GameState = {
      v: 1,
      gameId: rid(8),
      cfg,
      level: { sb: cfg.sb, bb: cfg.bb, n: 1 },
      players,
      button: -1,
      handNo: 0,
      hand: null,
      phase: 'lobby',
      log: [],
      stats: {},
      paused: false,
    };
    return new Engine(st);
  }

  static makePlayer(name: string, seat: number, stack: number): Player {
    return {
      id: 'p' + rid(7),
      name: String(name).trim().slice(0, 14) || 'Player',
      seat,
      stack,
      buyins: stack,
      sittingOut: false,
      leaving: false,
      connected: false,
      busted: false,
    };
  }

  get state(): GameState { return this.s; }
  player(id: PlayerId): Player | undefined { return this.s.players.find((p) => p.id === id); }

  /** Like player(), for ids the engine itself guarantees exist. */
  private P(id: PlayerId): Player {
    const p = this.player(id);
    if (!p) throw new Error(`Unknown player ${id}`);
    return p;
  }

  private get H(): Hand {
    if (!this.s.hand) throw new Error('No hand in progress');
    return this.s.hand;
  }

  private hp(id: PlayerId): HandPlayer {
    const x = this.H.ps[id];
    if (!x) throw new Error(`Player ${id} is not in this hand`);
    return x;
  }

  addPlayer(name: string): Player {
    const seat = this.s.players.length;
    const p = Engine.makePlayer(name, seat, this.s.cfg.startStack);
    this.s.players.push(p);
    this.logLine(`${p.name} joins the table`);
    return p;
  }

  removePlayer(id: PlayerId): void {
    const p = this.player(id);
    if (!p) return;
    const inHand = this.s.hand?.ps[id];
    if (inHand && !inHand.folded && this.s.phase === 'hand') {
      p.leaving = true; // removed after the hand
      return;
    }
    this.s.players = this.s.players.filter((x) => x.id !== id);
    this.s.players.forEach((x, i) => (x.seat = i));
    if (this.s.button >= this.s.players.length) this.s.button = this.s.players.length - 1;
  }

  movePlayer(id: PlayerId, dir: number): void {
    const arr = this.s.players;
    const i = arr.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
    arr.forEach((x, k) => (x.seat = k));
  }

  rebuy(id: PlayerId): GameEvent[] {
    const p = this.player(id);
    if (!p || !this.s.cfg.rebuys) return [];
    const inHand = this.s.hand?.ps[id];
    if (this.s.phase === 'hand' && inHand && !inHand.folded) return [];
    if (p.stack >= this.s.cfg.startStack) return [];
    const add = this.s.cfg.startStack - p.stack;
    p.stack += add;
    p.buyins += add;
    p.busted = false;
    p.sittingOut = false;
    this.logLine(`${p.name} rebuys for ${add}`);
    return [{ t: 'rebuy', pid: id, amount: add }];
  }

  setSitOut(id: PlayerId, v: boolean): void {
    const p = this.player(id);
    if (p) p.sittingOut = !!v;
  }

  logLine(text: string): void {
    this.s.log.push({ h: this.s.handNo, text });
    if (this.s.log.length > 80) this.s.log.splice(0, this.s.log.length - 80);
  }

  /** Players that will be dealt into the next hand, in seat order. */
  eligible(): Player[] {
    return this.s.players.filter((p) => p.stack > 0 && !p.sittingOut && !p.leaving);
  }

  canStartHand(): boolean {
    return this.eligible().length >= 2;
  }

  // ---------------- hand flow ----------------
  startHand(): GameEvent[] {
    const s = this.s;
    // Bug fix (found in Phase 0): starting a hand while one is running threw away the pot.
    if (s.phase === 'hand' || s.phase === 'ended' || !this.canStartHand()) return [];
    this.undoStack = [];
    s.handNo += 1;
    // blind levels
    if (s.cfg.blindUpEvery > 0 && s.handNo > 1 && (s.handNo - 1) % s.cfg.blindUpEvery === 0) {
      // Bug fix (found in Phase 0): 10 x 1.5 used to round back down to 10, so blinds never rose.
      const bb = Math.max(niceRound(s.level.bb * 1.5), s.level.bb + 1);
      s.level = { bb, sb: Math.max(1, Math.round(bb / 2)), n: s.level.n + 1 };
      this.logLine(`Blinds up: ${s.level.sb}/${s.level.bb}`);
    }
    const seats = this.eligible().map((p) => p.seat);
    const n = s.players.length;
    // move button to the next eligible seat
    let b = s.button;
    for (let k = 1; k <= n; k++) {
      const cand = (b + k + n) % n;
      if (seats.includes(cand)) { b = cand; break; }
    }
    if (!seats.includes(b)) b = seats[0]!;
    s.button = b;
    // order of eligible players starting left of button (button last)
    const order: PlayerId[] = [];
    for (let k = 1; k <= n; k++) {
      const seat = (b + k) % n;
      if (seats.includes(seat)) order.push(s.players[seat]!.id);
    }
    const deck = shuffle(freshDeck());
    const hand: Hand = {
      id: s.handNo,
      deck,
      board: [],
      burns: 0,
      street: 'preflop',
      order,
      ps: {},
      currentBet: 0,
      lastFullRaise: s.level.bb,
      toAct: null,
      lastAggressor: null,
      pots: [],
      results: null,
      revealed: {},
      shown: {},
      sbId: null,
      bbId: null,
      buttonId: s.players[b]!.id,
      runout: false,
      endedAt: null,
    };
    for (const pid of order) {
      hand.ps[pid] = { cards: [], streetBet: 0, total: 0, folded: false, allIn: false, acted: false, actedAt: 0, lastAction: null };
    }
    s.hand = hand;
    s.phase = 'hand';
    const ev: GameEvent[] = [{ t: 'handStart', handNo: s.handNo, buttonId: hand.buttonId, level: s.level }];

    // blinds
    let sbId: PlayerId, bbId: PlayerId;
    if (order.length === 2) {
      sbId = hand.buttonId; // heads-up: button is the small blind
      bbId = order[0] === hand.buttonId ? order[1]! : order[0]!;
    } else {
      sbId = order[0]!;
      bbId = order[1]!;
    }
    hand.sbId = sbId; hand.bbId = bbId;
    ev.push(this.post(sbId, s.level.sb, 'sb'));
    ev.push(this.post(bbId, s.level.bb, 'bb'));
    hand.currentBet = s.level.bb; // even if the big blind is short, others call the full blind
    hand.lastFullRaise = s.level.bb;

    // deal two cards each, one at a time, starting left of the button
    const dealOrder = order.slice();
    for (let round = 0; round < 2; round++) {
      for (const pid of dealOrder) hand.ps[pid]!.cards.push(deck.pop()!);
    }
    ev.push({ t: 'dealHole', order: dealOrder });
    this.logLine(`Hand #${s.handNo} — ${this.P(hand.buttonId).name} has the button`);

    // first to act preflop: after the big blind
    hand.toAct = this.nextToAct(bbId);
    if (!hand.toAct) ev.push(...this.closeRound());
    else ev.push({ t: 'turn', pid: hand.toAct });
    return ev;
  }

  post(pid: PlayerId, amount: number, kind: 'sb' | 'bb'): GameEvent {
    const p = this.P(pid);
    const hp = this.hp(pid);
    const amt = Math.min(amount, p.stack);
    p.stack -= amt;
    hp.streetBet += amt;
    hp.total += amt;
    if (p.stack === 0) hp.allIn = true;
    this.logLine(`${p.name} posts ${kind === 'sb' ? 'small' : 'big'} blind ${amt}`);
    return { t: 'blind', pid, amount: amt, kind };
  }

  /** Next player (after `fromId` in order) who still needs to act this round. */
  nextToAct(fromId: PlayerId): PlayerId | null {
    const h = this.H;
    const ord = h.order;
    const start = ord.indexOf(fromId);
    for (let k = 1; k <= ord.length; k++) {
      const pid = ord[(start + k) % ord.length]!;
      const hp = h.ps[pid]!;
      if (hp.folded || hp.allIn) continue;
      if (!hp.acted || hp.streetBet < h.currentBet) return pid;
    }
    return null;
  }

  livePlayers(): PlayerId[] { const h = this.H; return h.order.filter((pid) => !h.ps[pid]!.folded); }
  canActPlayers(): PlayerId[] { const h = this.H; return h.order.filter((pid) => { const hp = h.ps[pid]!; return !hp.folded && !hp.allIn; }); }

  /** What `pid` may do right now, or null if it is not their turn. */
  legal(pid: PlayerId): Legal | null {
    const s = this.s, h = s.hand;
    if (!h || s.phase !== 'hand' || h.toAct !== pid) return null;
    const p = this.P(pid), hp = this.hp(pid);
    const toCall = Math.min(h.currentBet - hp.streetBet, p.stack);
    const maxTo = hp.streetBet + p.stack;
    const reopened = !hp.acted || (h.currentBet - hp.actedAt) >= h.lastFullRaise;
    const othersCanAct = this.canActPlayers().filter((x) => x !== pid).length > 0;
    const canRaise = reopened && p.stack > toCall && othersCanAct;
    const minTo = Math.min(h.currentBet === 0 ? s.level.bb : h.currentBet + h.lastFullRaise, maxTo);
    return {
      toCall,
      canCheck: toCall === 0,
      canCall: toCall > 0,
      canRaise,
      isBet: h.currentBet === 0,
      minTo,
      maxTo,
      currentBet: h.currentBet,
      streetBet: hp.streetBet,
      pot: this.potTotal(),
    };
  }

  potTotal(): number {
    const h = this.s.hand;
    if (!h) return 0;
    return Object.values(h.ps).reduce((a, hp) => a + hp.total, 0);
  }

  snapshot(): void {
    this.undoStack.push(clone(this.s));
    if (this.undoStack.length > 10) this.undoStack.shift();
  }

  canUndo(): boolean {
    const prev = this.undoStack[this.undoStack.length - 1];
    if (!prev || !this.s.hand || !prev.hand) return false;
    return prev.hand.id === this.s.hand.id && prev.hand.board.length === this.s.hand.board.length && this.s.phase === 'hand';
  }

  undo(): GameEvent[] | null {
    if (!this.canUndo()) return null;
    this.s = this.undoStack.pop()!;
    this.logLine('Dealer undoes the last action');
    return [{ t: 'undo' }, { t: 'turn', pid: this.H.toAct }];
  }

  act(pid: PlayerId, action: Action): ActResult {
    const s = this.s, h = s.hand;
    const L = this.legal(pid);
    if (!L || !h) return { error: 'Not your turn' };
    const p = this.P(pid), hp = this.hp(pid);
    let type = action.type;
    this.snapshot();
    const ev: GameEvent[] = [];
    const say = (text: string): void => this.logLine(`${p.name} ${text}`);

    if (type === 'allin') {
      if (L.canRaise && L.maxTo > h.currentBet) type = 'raise';
      else if (L.canCall) type = 'call';
      else if (L.canCheck && !L.canRaise) type = 'check';
      action = { type, to: L.maxTo };
    }

    if (type === 'fold') {
      hp.folded = true;
      hp.acted = true;
      hp.lastAction = 'fold';
      say('folds');
      ev.push({ t: 'act', pid, a: 'fold' });
    } else if (type === 'check') {
      if (!L.canCheck) { this.undoStack.pop(); return { error: 'Cannot check' }; }
      hp.acted = true; hp.actedAt = h.currentBet; hp.lastAction = 'check';
      say('checks');
      ev.push({ t: 'act', pid, a: 'check' });
    } else if (type === 'call') {
      if (!L.canCall) { this.undoStack.pop(); return { error: 'Nothing to call' }; }
      const amt = L.toCall;
      p.stack -= amt; hp.streetBet += amt; hp.total += amt;
      if (p.stack === 0) hp.allIn = true;
      hp.acted = true; hp.actedAt = h.currentBet; hp.lastAction = hp.allIn ? 'allin' : 'call';
      say(hp.allIn ? `calls ${amt} and is all-in` : `calls ${amt}`);
      ev.push({ t: 'act', pid, a: hp.allIn ? 'allin' : 'call', amount: amt, to: hp.streetBet });
    } else if (type === 'bet' || type === 'raise') {
      if (!L.canRaise) { this.undoStack.pop(); return { error: 'Raising is not allowed here' }; }
      let to = Math.floor(Number(action.to) || 0);
      to = Math.max(Math.min(to, L.maxTo), Math.min(L.minTo, L.maxTo));
      if (to < L.minTo && to !== L.maxTo) { this.undoStack.pop(); return { error: `Minimum is ${L.minTo}` }; }
      const amt = to - hp.streetBet;
      const raiseSize = to - h.currentBet;
      const wasBet = h.currentBet === 0;
      p.stack -= amt; hp.streetBet = to; hp.total += amt;
      if (p.stack === 0) hp.allIn = true;
      if (raiseSize >= h.lastFullRaise) h.lastFullRaise = raiseSize; // full raise reopens action
      h.currentBet = to;
      h.lastAggressor = pid;
      hp.acted = true; hp.actedAt = to;
      hp.lastAction = hp.allIn ? 'allin' : (wasBet ? 'bet' : 'raise');
      say(hp.allIn ? `goes all-in for ${to}` : wasBet ? `bets ${to}` : `raises to ${to}`);
      ev.push({ t: 'act', pid, a: hp.lastAction, amount: amt, to });
    } else {
      this.undoStack.pop();
      return { error: 'Unknown action' };
    }

    // hand over by folds?
    if (this.livePlayers().length === 1) {
      ev.push(...this.finishUncontested());
      return { events: ev };
    }
    const next = this.nextToAct(pid);
    if (next) {
      h.toAct = next;
      ev.push({ t: 'turn', pid: next });
    } else {
      ev.push(...this.closeRound());
    }
    return { events: ev };
  }

  /** Return the uncalled part of the biggest bet this round. */
  returnUncalled(): GameEvent[] {
    const h = this.H;
    const bets = h.order.map((pid) => ({ pid, b: h.ps[pid]!.streetBet })).sort((a, b) => b.b - a.b);
    if (bets.length < 2) return [];
    const top = bets[0]!, second = bets[1]!;
    if (top.b > second.b) {
      const extra = top.b - second.b;
      const hp = h.ps[top.pid]!;
      const p = this.P(top.pid);
      hp.streetBet -= extra; hp.total -= extra;
      p.stack += extra;
      if (hp.allIn && p.stack > 0) hp.allIn = false;
      this.logLine(`Uncalled ${extra} returned to ${p.name}`);
      return [{ t: 'refund', pid: top.pid, amount: extra }];
    }
    return [];
  }

  closeRound(): GameEvent[] {
    const h = this.H;
    const ev: GameEvent[] = [...this.returnUncalled()];
    ev.push({ t: 'collect' });
    for (const pid of h.order) {
      const hp = h.ps[pid]!;
      hp.streetBet = 0; hp.acted = false; hp.actedAt = 0;
      if (!hp.folded && !hp.allIn) hp.lastAction = null;
    }
    h.currentBet = 0;
    h.lastFullRaise = this.s.level.bb;
    h.toAct = null;

    if (this.livePlayers().length === 1) return ev.concat(this.finishUncontested());

    const actors = this.canActPlayers();
    if (h.street === 'river') return ev.concat(this.showdown());

    if (actors.length <= 1) {
      // no more betting possible: turn cards up and run it out
      h.runout = true;
      ev.push(this.revealAll());
      while (h.board.length < 5) ev.push(this.dealStreet());
      return ev.concat(this.showdown());
    }
    ev.push(this.dealStreet());
    // first to act after the flop: first live player left of the button
    const first = this.nextToAct(h.buttonId);
    h.toAct = first;
    ev.push({ t: 'turn', pid: first });
    return ev;
  }

  dealStreet(): GameEvent {
    const h = this.H;
    h.deck.pop(); h.burns += 1; // burn
    let cards: number[], street: Hand['street'];
    if (h.board.length === 0) { cards = [h.deck.pop()!, h.deck.pop()!, h.deck.pop()!]; street = 'flop'; }
    else if (h.board.length === 3) { cards = [h.deck.pop()!]; street = 'turn'; }
    else { cards = [h.deck.pop()!]; street = 'river'; }
    h.board.push(...cards);
    h.street = street;
    this.logLine(`${street.charAt(0).toUpperCase() + street.slice(1)}: ${h.board.map(cardStr).join(' ')}`);
    return { t: 'street', street, cards: cards.map(cardStr) };
  }

  revealAll(): GameEvent {
    const h = this.H;
    const cards: Record<PlayerId, string[]> = {};
    for (const pid of this.livePlayers()) { h.revealed[pid] = true; cards[pid] = h.ps[pid]!.cards.map(cardStr); }
    return { t: 'reveal', cards };
  }

  buildPots(): BuiltPot[] {
    const h = this.H;
    const contrib = h.order.map((pid) => ({ pid, amt: h.ps[pid]!.total, live: !h.ps[pid]!.folded }));
    const levels = [...new Set(contrib.filter((c) => c.amt > 0).map((c) => c.amt))].sort((a, b) => a - b);
    const pots: BuiltPot[] = [];
    let prev = 0;
    for (const lvl of levels) {
      let amount = 0;
      for (const c of contrib) amount += Math.max(0, Math.min(c.amt, lvl) - prev);
      const elig = contrib.filter((c) => c.live && c.amt >= lvl).map((c) => c.pid);
      prev = lvl;
      if (amount === 0) continue;
      const last = pots[pots.length - 1];
      if (elig.length === 0 && last) { last.amount += amount; continue; }
      if (last && last.elig.length === elig.length && last.elig.every((x) => elig.includes(x))) last.amount += amount;
      else pots.push({ amount, elig });
    }
    return pots;
  }

  /** Seat-order distance from the button (1 = first left of button). */
  distFromButton(pid: PlayerId): number {
    const n = this.s.players.length;
    return ((this.P(pid).seat - this.s.button) + n) % n || n;
  }

  showdown(): GameEvent[] {
    const h = this.H;
    const ev: GameEvent[] = [];
    const live = this.livePlayers();
    // showing order: last aggressor of the final street first, else left of button
    let showOrder = live.slice().sort((a, b) => this.distFromButton(a) - this.distFromButton(b));
    if (h.lastAggressor && live.includes(h.lastAggressor) && !h.runout) {
      const i = showOrder.indexOf(h.lastAggressor);
      showOrder = showOrder.slice(i).concat(showOrder.slice(0, i));
    }
    const evals: Record<PlayerId, HandEval> = {};
    for (const pid of live) {
      const e = evalBest(h.ps[pid]!.cards.concat(h.board))!;
      evals[pid] = { score: e.score, name: e.name, desc: e.desc, best: e.cards.map(cardStr) };
    }
    if (!h.runout) {
      const cards: Record<PlayerId, string[]> = {};
      for (const pid of showOrder) { h.revealed[pid] = true; cards[pid] = h.ps[pid]!.cards.map(cardStr); }
      ev.push({ t: 'reveal', cards, order: showOrder });
    }
    const pots = this.buildPots();
    const results: PotResult[] = [];
    pots.forEach((pot, i) => {
      const best = Math.max(...pot.elig.map((pid) => evals[pid]!.score));
      const winners = pot.elig.filter((pid) => evals[pid]!.score === best)
        .sort((a, b) => this.distFromButton(a) - this.distFromButton(b));
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      const awards: Award[] = winners.map((pid) => {
        const amt = share + (odd > 0 ? 1 : 0);
        if (odd > 0) odd -= 1;
        this.P(pid).stack += amt;
        return { pid, amount: amt };
      });
      const label = pots.length === 1 ? 'the pot' : i === 0 ? 'the main pot' : `side pot ${i}`;
      for (const a of awards) this.logLine(`${this.P(a.pid).name} wins ${a.amount} from ${label} with ${evals[a.pid]!.desc}`);
      results.push({ label, amount: pot.amount, awards, hand: evals[winners[0]!]! });
    });
    h.results = { pots: results, evals, showdown: true };
    this.endHand();
    ev.push({ t: 'win', results: h.results });
    return ev;
  }

  finishUncontested(): GameEvent[] {
    const h = this.H;
    const ev: GameEvent[] = [...this.returnUncalled(), { t: 'collect' }];
    for (const pid of h.order) h.ps[pid]!.streetBet = 0;
    const winner = this.livePlayers()[0]!;
    const amount = this.potTotal();
    this.P(winner).stack += amount;
    this.logLine(`${this.P(winner).name} wins ${amount} uncontested`);
    h.results = { pots: [{ label: 'the pot', amount, awards: [{ pid: winner, amount }], hand: null }], evals: {}, showdown: false };
    this.endHand();
    ev.push({ t: 'win', results: h.results });
    return ev;
  }

  endHand(): void {
    const s = this.s, h = this.H;
    h.toAct = null;
    h.endedAt = Date.now();
    s.phase = 'between';
    // stats
    for (const pot of h.results!.pots) for (const a of pot.awards) {
      const st = (s.stats[a.pid] ??= { won: 0, biggest: 0 });
      st.won += 1;
      st.biggest = Math.max(st.biggest, a.amount);
    }
    for (const p of s.players) {
      if (p.stack === 0) p.busted = true;
    }
    // remove players who asked to leave
    const leaving = s.players.filter((p) => p.leaving);
    if (leaving.length) {
      s.departed = (s.departed ?? []).concat(leaving.map((p) => ({ ...p })));
      s.players = s.players.filter((p) => !p.leaving);
      const btnId = h.buttonId;
      s.players.forEach((x, i) => (x.seat = i));
      const bp = s.players.find((p) => p.id === btnId);
      s.button = bp ? bp.seat : Math.max(0, Math.min(s.button, s.players.length - 1) - 1);
    }
    this.undoStack = [];
  }

  /** Winner of an uncontested pot may choose to show. */
  showCards(pid: PlayerId): GameEvent[] {
    const h = this.s.hand;
    const hp = h?.ps[pid];
    if (!h || !hp || this.s.phase !== 'between') return [];
    h.shown[pid] = true;
    this.logLine(`${this.P(pid).name} shows ${hp.cards.map(cardStr).join(' ')}`);
    return [{ t: 'show', pid, cards: hp.cards.map(cardStr) }];
  }

  /** Timer / away handling: check if possible, otherwise fold. */
  autoAct(pid: PlayerId): ActResult | null {
    const L = this.legal(pid);
    if (!L) return null;
    return this.act(pid, { type: L.canCheck ? 'check' : 'fold' });
  }

  endGame(): Standing[] {
    this.s.phase = 'ended';
    const h = this.s.hand;
    if (h && h.toAct) {
      // refund chips in the middle of an unfinished hand
      for (const [pid, hp] of Object.entries(h.ps)) {
        const p = this.player(pid);
        if (p) p.stack += hp.total;
      }
    }
    this.s.hand = null;
    return this.standings();
  }

  standings(): Standing[] {
    const all = this.s.players.concat(this.s.departed ?? []);
    return all.map((p) => ({
      id: p.id, name: p.name, stack: p.stack, buyins: p.buyins, net: p.stack - p.buyins,
      won: this.s.stats[p.id]?.won ?? 0, biggest: this.s.stats[p.id]?.biggest ?? 0,
    })).sort((a, b) => b.net - a.net);
  }

  // ---------------- views ----------------
  viewFor(pid: PlayerId): View {
    const s = this.s, h = s.hand;
    const v: View = {
      gameId: s.gameId,
      phase: s.phase,
      handNo: s.handNo,
      level: s.level,
      cfg: { startStack: s.cfg.startStack, rebuys: s.cfg.rebuys, turnTime: s.cfg.turnTime, blindUpEvery: s.cfg.blindUpEvery },
      button: s.button,
      paused: s.paused,
      players: s.players.map((p) => ({
        id: p.id, name: p.name, seat: p.seat, stack: p.stack, sittingOut: p.sittingOut,
        connected: p.connected, busted: p.busted, leaving: p.leaving, buyins: p.buyins,
      })),
      log: s.log.slice(-30),
      me: pid,
      hand: null,
      legal: null,
      canUndo: this.canUndo(),
    };
    if (h) {
      const ps: Record<PlayerId, HandPlayerView> = {};
      for (const id of h.order) {
        const hp = h.ps[id]!;
        const show = id === pid || h.revealed[id] || h.shown[id];
        ps[id] = {
          streetBet: hp.streetBet, total: hp.total, folded: hp.folded, allIn: hp.allIn,
          lastAction: hp.lastAction, inHand: true,
          cards: show ? hp.cards.map(cardStr) : null,
          revealed: !!(h.revealed[id] || h.shown[id]),
        };
      }
      v.hand = {
        id: h.id, board: h.board.map(cardStr), street: h.street, order: h.order, ps,
        toAct: h.toAct, currentBet: h.currentBet, pot: this.potTotal(),
        collected: Object.values(h.ps).reduce((a, x) => a + x.total - x.streetBet, 0),
        sbId: h.sbId, bbId: h.bbId, buttonId: h.buttonId, results: h.results, runout: h.runout,
        pots: s.phase === 'hand' && h.toAct ? this.livePotsPreview() : null,
      };
      v.legal = this.legal(pid);
    }
    return v;
  }

  /** Pots made only of collected chips (for showing side pots mid-hand). */
  livePotsPreview(): { amount: number; n: number }[] | null {
    const h = this.H;
    const anyAllIn = h.order.some((pid) => h.ps[pid]!.allIn);
    if (!anyAllIn) return null;
    return this.buildPots().map((p) => ({ amount: p.amount, n: p.elig.length }));
  }
}
