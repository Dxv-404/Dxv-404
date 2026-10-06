// Authoritative No-Limit Texas Hold'em engine. Runs on the host phone only.
// Pure logic: no DOM, no timers. Every mutating call returns a list of events
// that clients animate; the public/private view is produced by viewFor().
import { freshDeck, shuffle, evalBest, cardStr } from './cards.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

export function niceRound(x) {
  // round a blind to a friendly number
  const steps = [1, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const mag = Math.pow(10, Math.floor(Math.log10(x)));
  let best = steps[0] * mag;
  for (const s of steps) if (Math.abs(s * mag - x) < Math.abs(best - x)) best = s * mag;
  return Math.max(1, Math.round(best));
}

export class Engine {
  constructor(state) {
    this.s = state || null;
    this.undoStack = [];
  }

  // ---------------- setup ----------------
  static newGame(config, names) {
    const cfg = {
      startStack: 1000, sb: 5, bb: 10, blindUpEvery: 0, turnTime: 0, rebuys: true,
      ...config,
    };
    const players = names.map((n, i) => Engine.makePlayer(n, i, cfg.startStack));
    const st = {
      v: 1,
      gameId: Math.random().toString(36).slice(2, 10),
      cfg,
      level: { sb: cfg.sb, bb: cfg.bb, n: 1 },
      players,
      button: -1, // seat index of the button
      handNo: 0,
      hand: null,
      phase: 'lobby', // lobby | hand | between | ended
      log: [],
      stats: {},
      paused: false,
    };
    return new Engine(st);
  }

  static makePlayer(name, seat, stack) {
    return {
      id: 'p' + Math.random().toString(36).slice(2, 9),
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

  get state() { return this.s; }
  player(id) { return this.s.players.find((p) => p.id === id); }

  addPlayer(name) {
    const seat = this.s.players.length;
    const p = Engine.makePlayer(name, seat, this.s.cfg.startStack);
    this.s.players.push(p);
    this.logLine(`${p.name} joins the table`);
    return p;
  }

  removePlayer(id) {
    const p = this.player(id);
    if (!p) return;
    if (this.s.hand && this.s.hand.ps[id] && !this.s.hand.ps[id].folded && this.s.phase === 'hand') {
      p.leaving = true; // removed after the hand
      return;
    }
    this.s.players = this.s.players.filter((x) => x.id !== id);
    this.s.players.forEach((x, i) => (x.seat = i));
    if (this.s.button >= this.s.players.length) this.s.button = this.s.players.length - 1;
  }

  movePlayer(id, dir) {
    const arr = this.s.players;
    const i = arr.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    arr.forEach((x, k) => (x.seat = k));
  }

  rebuy(id) {
    const p = this.player(id);
    if (!p || !this.s.cfg.rebuys) return [];
    if (this.s.phase === 'hand' && this.s.hand.ps[id] && !this.s.hand.ps[id].folded) return [];
    if (p.stack >= this.s.cfg.startStack) return [];
    const add = this.s.cfg.startStack - p.stack;
    p.stack += add;
    p.buyins += add;
    p.busted = false;
    p.sittingOut = false;
    this.logLine(`${p.name} rebuys for ${add}`);
    return [{ t: 'rebuy', pid: id, amount: add }];
  }

  setSitOut(id, v) {
    const p = this.player(id);
    if (p) p.sittingOut = !!v;
  }

  logLine(text) {
    this.s.log.push({ h: this.s.handNo, text });
    if (this.s.log.length > 80) this.s.log.splice(0, this.s.log.length - 80);
  }

  // Players that will be dealt into the next hand, in seat order.
  eligible() {
    return this.s.players.filter((p) => p.stack > 0 && !p.sittingOut && !p.leaving);
  }

  canStartHand() {
    return this.eligible().length >= 2;
  }

  // ---------------- hand flow ----------------
  startHand() {
    const s = this.s;
    if (!this.canStartHand()) return [];
    this.undoStack = [];
    s.handNo += 1;
    // blind levels
    if (s.cfg.blindUpEvery > 0 && s.handNo > 1 && (s.handNo - 1) % s.cfg.blindUpEvery === 0) {
      const bb = niceRound(s.level.bb * 1.5);
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
    if (!seats.includes(b)) b = seats[0];
    s.button = b;
    // order of eligible players starting left of button
    const order = [];
    for (let k = 1; k <= n; k++) {
      const seat = (b + k) % n;
      if (seats.includes(seat)) order.push(s.players[seat].id);
    }
    // order currently: left of button ... button (button last)
    const deck = shuffle(freshDeck());
    const hand = {
      id: s.handNo,
      deck,
      board: [],
      burns: 0,
      street: 'preflop',
      order, // acting order, button last
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
      buttonId: s.players[b].id,
      runout: false,
      endedAt: null,
    };
    for (const pid of order) {
      hand.ps[pid] = { cards: [], streetBet: 0, total: 0, folded: false, allIn: false, acted: false, actedAt: 0, lastAction: null };
    }
    s.hand = hand;
    s.phase = 'hand';
    const ev = [{ t: 'handStart', handNo: s.handNo, buttonId: hand.buttonId, level: s.level }];

    // blinds
    let sbId, bbId;
    if (order.length === 2) {
      sbId = hand.buttonId; // heads-up: button is the small blind
      bbId = order[0] === hand.buttonId ? order[1] : order[0];
    } else {
      sbId = order[0];
      bbId = order[1];
    }
    hand.sbId = sbId; hand.bbId = bbId;
    ev.push(this.post(sbId, s.level.sb, 'sb'));
    ev.push(this.post(bbId, s.level.bb, 'bb'));
    hand.currentBet = s.level.bb; // even if the big blind is short, others call the full blind
    hand.lastFullRaise = s.level.bb;

    // deal two cards each, one at a time, starting left of the button
    const dealOrder = order.slice();
    for (let round = 0; round < 2; round++) {
      for (const pid of dealOrder) hand.ps[pid].cards.push(deck.pop());
    }
    ev.push({ t: 'dealHole', order: dealOrder });
    this.logLine(`Hand #${s.handNo} — ${this.player(hand.buttonId).name} has the button`);

    // first to act preflop: after the big blind
    hand.toAct = this.nextToAct(bbId);
    if (!hand.toAct) ev.push(...this.closeRound());
    else ev.push({ t: 'turn', pid: hand.toAct });
    return ev;
  }

  post(pid, amount, kind) {
    const p = this.player(pid);
    const hp = this.s.hand.ps[pid];
    const amt = Math.min(amount, p.stack);
    p.stack -= amt;
    hp.streetBet += amt;
    hp.total += amt;
    if (p.stack === 0) hp.allIn = true;
    this.logLine(`${p.name} posts ${kind === 'sb' ? 'small' : 'big'} blind ${amt}`);
    return { t: 'blind', pid, amount: amt, kind };
  }

  // Next player (after `fromId` in order) who still needs to act this round.
  nextToAct(fromId) {
    const h = this.s.hand;
    const ord = h.order;
    const start = ord.indexOf(fromId);
    for (let k = 1; k <= ord.length; k++) {
      const pid = ord[(start + k) % ord.length];
      const hp = h.ps[pid];
      if (hp.folded || hp.allIn) continue;
      if (!hp.acted || hp.streetBet < h.currentBet) return pid;
    }
    return null;
  }

  livePlayers() { return this.s.hand.order.filter((pid) => !this.s.hand.ps[pid].folded); }
  canActPlayers() { return this.s.hand.order.filter((pid) => { const hp = this.s.hand.ps[pid]; return !hp.folded && !hp.allIn; }); }

  // What `pid` may do right now.
  legal(pid) {
    const s = this.s, h = s.hand;
    if (!h || s.phase !== 'hand' || h.toAct !== pid) return null;
    const p = this.player(pid), hp = h.ps[pid];
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

  potTotal() {
    const h = this.s.hand;
    if (!h) return 0;
    return Object.values(h.ps).reduce((a, hp) => a + hp.total, 0);
  }

  snapshot() {
    this.undoStack.push(clone(this.s));
    if (this.undoStack.length > 10) this.undoStack.shift();
  }

  canUndo() {
    const prev = this.undoStack[this.undoStack.length - 1];
    if (!prev || !this.s.hand || !prev.hand) return false;
    return prev.hand.id === this.s.hand.id && prev.hand.board.length === this.s.hand.board.length && this.s.phase === 'hand';
  }

  undo() {
    if (!this.canUndo()) return null;
    this.s = this.undoStack.pop();
    this.logLine('Dealer undoes the last action');
    return [{ t: 'undo' }, { t: 'turn', pid: this.s.hand.toAct }];
  }

  // action: {type: 'fold'|'check'|'call'|'bet'|'raise'|'allin', to?: number}
  act(pid, action) {
    const s = this.s, h = s.hand;
    const L = this.legal(pid);
    if (!L) return { error: 'Not your turn' };
    const p = this.player(pid), hp = h.ps[pid];
    let type = action.type;
    this.snapshot();
    const ev = [];
    const say = (text) => this.logLine(`${p.name} ${text}`);

    if (type === 'allin') {
      if (L.canRaise && L.maxTo > h.currentBet) type = 'raise';
      else if (L.canCall) type = 'call';
      else if (L.canCheck && !L.canRaise) type = 'check';
      action = { type, to: L.maxTo };
    }

    if (type === 'fold') {
      if (L.canCheck && action.force !== true) {
        // folding when you can check is allowed but pointless; treat as fold anyway
      }
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

  // Return the uncalled part of the biggest bet this round.
  returnUncalled() {
    const h = this.s.hand;
    const bets = h.order.map((pid) => ({ pid, b: h.ps[pid].streetBet })).sort((a, b) => b.b - a.b);
    if (bets.length < 2) return [];
    const [top, second] = bets;
    if (top.b > second.b) {
      const extra = top.b - second.b;
      const hp = h.ps[top.pid];
      hp.streetBet -= extra; hp.total -= extra;
      this.player(top.pid).stack += extra;
      if (hp.allIn && this.player(top.pid).stack > 0) hp.allIn = false;
      this.logLine(`Uncalled ${extra} returned to ${this.player(top.pid).name}`);
      return [{ t: 'refund', pid: top.pid, amount: extra }];
    }
    return [];
  }

  closeRound() {
    const h = this.s.hand;
    const ev = [...this.returnUncalled()];
    ev.push({ t: 'collect' });
    for (const pid of h.order) { const hp = h.ps[pid]; hp.streetBet = 0; hp.acted = false; hp.actedAt = 0; if (!hp.folded && !hp.allIn) hp.lastAction = null; }
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
    const first = this.nextToAct(h.buttonId) ;
    h.toAct = first;
    ev.push({ t: 'turn', pid: first });
    return ev;
  }

  dealStreet() {
    const h = this.s.hand;
    h.deck.pop(); h.burns += 1; // burn
    let cards, street;
    if (h.board.length === 0) { cards = [h.deck.pop(), h.deck.pop(), h.deck.pop()]; street = 'flop'; }
    else if (h.board.length === 3) { cards = [h.deck.pop()]; street = 'turn'; }
    else { cards = [h.deck.pop()]; street = 'river'; }
    h.board.push(...cards);
    h.street = street;
    this.logLine(`${street[0].toUpperCase() + street.slice(1)}: ${h.board.map(cardStr).join(' ')}`);
    return { t: 'street', street, cards: cards.map(cardStr) };
  }

  revealAll() {
    const h = this.s.hand;
    const cards = {};
    for (const pid of this.livePlayers()) { h.revealed[pid] = true; cards[pid] = h.ps[pid].cards.map(cardStr); }
    return { t: 'reveal', cards };
  }

  buildPots() {
    const h = this.s.hand;
    const contrib = h.order.map((pid) => ({ pid, amt: h.ps[pid].total, live: !h.ps[pid].folded }));
    const levels = [...new Set(contrib.filter((c) => c.amt > 0).map((c) => c.amt))].sort((a, b) => a - b);
    const pots = [];
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

  // seat-order distance from the button (1 = first left of button)
  distFromButton(pid) {
    const n = this.s.players.length;
    return ((this.player(pid).seat - this.s.button) + n) % n || n;
  }

  showdown() {
    const s = this.s, h = s.hand;
    const ev = [];
    const live = this.livePlayers();
    // showing order: last aggressor of the final street first, else left of button
    let showOrder = live.slice().sort((a, b) => this.distFromButton(a) - this.distFromButton(b));
    if (h.lastAggressor && live.includes(h.lastAggressor) && !h.runout) {
      const i = showOrder.indexOf(h.lastAggressor);
      showOrder = showOrder.slice(i).concat(showOrder.slice(0, i));
    }
    const evals = {};
    for (const pid of live) {
      const e = evalBest(h.ps[pid].cards.concat(h.board));
      evals[pid] = { score: e.score, name: e.name, desc: e.desc, best: e.cards.map(cardStr) };
    }
    if (!h.runout) {
      const cards = {};
      for (const pid of showOrder) { h.revealed[pid] = true; cards[pid] = h.ps[pid].cards.map(cardStr); }
      ev.push({ t: 'reveal', cards, order: showOrder });
    }
    const pots = this.buildPots();
    const results = [];
    pots.forEach((pot, i) => {
      const best = Math.max(...pot.elig.map((pid) => evals[pid].score));
      const winners = pot.elig.filter((pid) => evals[pid].score === best)
        .sort((a, b) => this.distFromButton(a) - this.distFromButton(b));
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      const awards = winners.map((pid) => {
        const amt = share + (odd > 0 ? 1 : 0);
        if (odd > 0) odd -= 1;
        this.player(pid).stack += amt;
        return { pid, amount: amt };
      });
      const label = pots.length === 1 ? 'the pot' : i === 0 ? 'the main pot' : `side pot ${i}`;
      for (const a of awards) this.logLine(`${this.player(a.pid).name} wins ${a.amount} from ${label} with ${evals[a.pid].desc}`);
      results.push({ label, amount: pot.amount, awards, hand: evals[winners[0]] });
    });
    h.results = { pots: results, evals, showdown: true };
    this.endHand();
    ev.push({ t: 'win', results: h.results });
    return ev;
  }

  finishUncontested() {
    const h = this.s.hand;
    const ev = [...this.returnUncalled(), { t: 'collect' }];
    for (const pid of h.order) h.ps[pid].streetBet = 0;
    const winner = this.livePlayers()[0];
    const amount = this.potTotal();
    this.player(winner).stack += amount;
    this.logLine(`${this.player(winner).name} wins ${amount} uncontested`);
    h.results = { pots: [{ label: 'the pot', amount, awards: [{ pid: winner, amount }], hand: null }], evals: {}, showdown: false };
    this.endHand();
    ev.push({ t: 'win', results: h.results });
    return ev;
  }

  endHand() {
    const s = this.s, h = s.hand;
    h.toAct = null;
    h.endedAt = Date.now();
    s.phase = 'between';
    // stats
    for (const pot of h.results.pots) for (const a of pot.awards) {
      const st = (s.stats[a.pid] ||= { won: 0, biggest: 0 });
      st.won += 1;
      st.biggest = Math.max(st.biggest, a.amount);
    }
    for (const p of s.players) {
      if (p.stack === 0) p.busted = true;
    }
    // remove players who asked to leave
    const leaving = s.players.filter((p) => p.leaving).map((p) => p.id);
    if (leaving.length) {
      s.departed = (s.departed || []).concat(s.players.filter((p) => p.leaving).map((p) => ({ ...p })));
      s.players = s.players.filter((p) => !p.leaving);
      const btnId = h.buttonId;
      s.players.forEach((x, i) => (x.seat = i));
      const bp = s.players.find((p) => p.id === btnId);
      s.button = bp ? bp.seat : Math.max(0, Math.min(s.button, s.players.length - 1) - 1);
    }
    this.undoStack = [];
  }

  // Winner of an uncontested pot may choose to show.
  showCards(pid) {
    const h = this.s.hand;
    if (!h || !h.ps[pid] || this.s.phase !== 'between') return [];
    h.shown[pid] = true;
    this.logLine(`${this.player(pid).name} shows ${h.ps[pid].cards.map(cardStr).join(' ')}`);
    return [{ t: 'show', pid, cards: h.ps[pid].cards.map(cardStr) }];
  }

  // Timer / away handling: check if possible, otherwise fold.
  autoAct(pid) {
    const L = this.legal(pid);
    if (!L) return null;
    return this.act(pid, { type: L.canCheck ? 'check' : 'fold' });
  }

  endGame() {
    this.s.phase = 'ended';
    if (this.s.hand && this.s.hand.toAct) {
      // refund chips in the middle of an unfinished hand
      for (const pid of Object.keys(this.s.hand.ps)) {
        const p = this.player(pid);
        if (p) p.stack += this.s.hand.ps[pid].total;
      }
    }
    this.s.hand = null;
    return this.standings();
  }

  standings() {
    const all = this.s.players.concat(this.s.departed || []);
    return all.map((p) => ({ id: p.id, name: p.name, stack: p.stack, buyins: p.buyins, net: p.stack - p.buyins, won: this.s.stats[p.id]?.won || 0, biggest: this.s.stats[p.id]?.biggest || 0 }))
      .sort((a, b) => b.net - a.net);
  }

  // ---------------- views ----------------
  viewFor(pid) {
    const s = this.s, h = s.hand;
    const v = {
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
      const ps = {};
      for (const id of h.order) {
        const hp = h.ps[id];
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

  // pots made only of collected chips (for showing side pots mid-hand)
  livePotsPreview() {
    const h = this.s.hand;
    const anyAllIn = h.order.some((pid) => h.ps[pid].allIn);
    if (!anyAllIn) return null;
    return this.buildPots().map((p) => ({ amount: p.amount, n: p.elig.length }));
  }
}
