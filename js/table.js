// The poker table screen: rendering, the animation queue, the dealer NPC and the action controls.
import { h, $, fmt, cardEl, setCardFace, flipUp, initials, hueFor, chipStack, toast, flyFrom, flyTo, countTo, sleep, reduceMotion } from './ui.js';
import { sfx, buzz, settings } from './fx.js';
import { describePartial, parseCard } from './cards.js';

// Seat slots around the oval, clockwise from the hero's left (x%, y% of the table box).
const SLOT = {
  L1: [6, 84], L2: [-1, 60], L3: [1, 29], L4: [19, 8], T: [50, 13],
  R4: [81, 8], R3: [99, 29], R2: [101, 60], R1: [94, 84],
};
const LAYOUT = {
  1: ['T'], 2: ['L3', 'R3'], 3: ['L3', 'T', 'R3'], 4: ['L2', 'L4', 'R4', 'R2'],
  5: ['L2', 'L4', 'T', 'R4', 'R2'], 6: ['L1', 'L3', 'L4', 'R4', 'R3', 'R1'],
  7: ['L1', 'L3', 'L4', 'T', 'R4', 'R3', 'R1'], 8: ['L1', 'L2', 'L3', 'L4', 'R4', 'R3', 'R2', 'R1'],
};
const CENTER = [50, 47];
const HERO_POS = [50, 100];

const ACTION_WORD = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' };

export class TableView {
  constructor(root, client) {
    this.root = root;
    this.client = client; // { me, act, show, rebuy, sitOut, isHost, menu() }
    this.view = null;
    this.queue = [];
    this.busy = false;
    this.seatEls = new Map();
    this.pre = null; // pre-selected action while waiting
    this.peeking = false;
    this.lastTurnBuzz = null;
    this.raiseOpen = false;
    this.mount();
  }

  // ---------------- static structure ----------------
  mount() {
    const r = this.root;
    r.innerHTML = '';
    r.className = 'screen table-screen';
    this.handInfo = h('div', { class: 'hand-info' }, h('span', { class: 'hand-no' }), h('span', { class: 'blinds' }));
    this.menuBtn = h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Table menu', onclick: () => this.client.menu() },
      h('span', { class: 'burger', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
    this.awayDot = h('button', { class: 'conn-pill', hidden: true, onclick: () => this.client.menu() });
    const top = h('header', { class: 'topbar' }, this.menuBtn, this.handInfo, this.awayDot);

    this.bubble = h('div', { class: 'bubble', 'aria-live': 'polite' });
    this.dealer = h('div', { class: 'dealer' },
      h('div', { class: 'dealer-photo' }, h('img', { src: 'assets/dealer.webp', alt: 'Marco, the dealer', width: 64, height: 64, draggable: 'false' })),
      h('div', { class: 'dealer-name' }, 'Marco'),
      this.bubble);

    this.potAmt = h('span', { class: 'pot-amt' }, '0');
    this.potChips = h('div', { class: 'pot-chips' });
    this.pot = h('div', { class: 'pot', hidden: true }, this.potChips, h('div', { class: 'pot-label' }, h('span', {}, 'Pot'), this.potAmt));
    this.sidepots = h('div', { class: 'sidepots' });
    this.boardEl = h('div', { class: 'board' });
    this.slots = [];
    for (let i = 0; i < 5; i++) { const s = h('div', { class: 'slot' }); this.slots.push(s); this.boardEl.append(s); }
    this.banner = h('div', { class: 'banner', 'aria-live': 'polite' });
    this.nextIn = h('div', { class: 'next-in' });
    this.burnSpot = h('div', { class: 'burn-spot' });
    this.muck = h('div', { class: 'muck' });
    const felt = h('div', { class: 'felt' }, h('div', { class: 'felt-mark', 'aria-hidden': 'true' }, 'Train Poker'), this.pot, this.sidepots, this.boardEl, this.banner, this.nextIn, this.burnSpot, this.muck);
    this.seatLayer = h('div', { class: 'seat-layer' });
    this.betLayer = h('div', { class: 'bet-layer' });
    this.button = h('div', { class: 'dealer-btn', 'aria-label': 'Dealer button' }, 'D');
    this.tableEl = h('div', { class: 'table' }, h('div', { class: 'rail' }, felt), this.betLayer, this.seatLayer, this.button);
    this.arena = h('div', { class: 'arena' }, this.dealer, this.tableEl);

    // hero
    this.heroCards = h('div', { class: 'hero-cards', role: 'button', tabindex: '0', 'aria-label': 'Your cards. Press and hold to look.' });
    this.heroHint = h('div', { class: 'hero-hint' });
    this.heroName = h('div', { class: 'hero-name' });
    this.heroStack = h('div', { class: 'hero-stack' });
    this.heroState = h('div', { class: 'hero-state' });
    this.heroRing = h('div', { class: 'hero-timer' });
    this.preBar = h('div', { class: 'pre-bar' });
    this.hero = h('section', { class: 'hero' },
      h('div', { class: 'hero-row' }, this.heroCards,
        h('div', { class: 'hero-meta' }, this.heroName, this.heroStack, this.heroState, this.heroHint)),
      this.heroRing);
    this.bindPeek();

    this.actions = h('nav', { class: 'actions', 'aria-label': 'Your actions' });
    this.raiseSheet = h('div', { class: 'raise-sheet', hidden: true });
    r.append(top, this.arena, this.hero, this.preBar, this.actions, this.raiseSheet);

    this.ro = new ResizeObserver(() => this.layoutSeats());
    this.ro.observe(this.tableEl);
    this.timerLoop();
  }

  bindPeek() {
    const el = this.heroCards;
    const on = (e) => { if (e.button > 0) return; this.peeking = true; this.applyPeek(); e.preventDefault(); };
    const off = () => { if (!this.peeking) return; this.peeking = false; this.applyPeek(); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { this.peeking = true; this.applyPeek(); e.preventDefault(); } });
    el.addEventListener('keyup', off);
  }

  applyPeek() {
    const v = this.view;
    const mine = v && v.hand && v.hand.ps[v.me];
    const cards = mine && mine.cards;
    const open = !!cards && (!settings.holdToPeek || this.peeking || (mine.revealed));
    const els = [...this.heroCards.querySelectorAll('.card')];
    els.forEach((el, i) => {
      if (!cards) return;
      setCardFace(el, cards[i]);
      if (open && el.classList.contains('down')) { el.classList.remove('down'); if (this.peeking) sfx.flip(); }
      else if (!open && !el.classList.contains('down')) el.classList.add('down');
    });
    this.heroCards.classList.toggle('peek', this.peeking);
    this.heroCards.classList.toggle('folded', !!(mine && mine.folded));
    // live hand description only while you can see your cards
    if (open && cards && !mine.folded) {
      const all = cards.concat(v.hand.board || []).map(parseCard);
      this.heroHint.textContent = 'You have ' + lowerFirst(describePartial(all));
    } else if (cards && settings.holdToPeek && !mine.folded) {
      this.heroHint.textContent = 'Hold your cards to look';
    } else this.heroHint.textContent = '';
  }

  // ---------------- seats ----------------
  orderedOthers(view) {
    const ps = view.players;
    const me = ps.find((p) => p.id === view.me);
    const n = ps.length;
    const mySeat = me ? me.seat : 0;
    const out = [];
    for (let k = 1; k < n; k++) out.push(ps.find((p) => p.seat === (mySeat + k) % n));
    return out.filter(Boolean);
  }

  layoutKey(view) { return view.players.map((p) => p.id + ':' + p.seat).join('|') + '|' + view.me; }

  buildSeats(view) {
    const key = this.layoutKey(view);
    if (key === this.seatKey) return;
    this.seatKey = key;
    const others = this.orderedOthers(view);
    const slots = LAYOUT[Math.min(8, others.length)] || [];
    const keep = new Set();
    this.pos = new Map();
    others.forEach((p, i) => {
      const [x, y] = SLOT[slots[i]];
      this.pos.set(p.id, [x, y]);
      keep.add(p.id);
      let el = this.seatEls.get(p.id);
      if (!el) {
        el = this.makeSeat(p);
        this.seatEls.set(p.id, el);
        this.seatLayer.append(el);
      }
      el.dataset.slot = slots[i];
      el.style.left = x + '%';
      el.style.top = y + '%';
      el.classList.toggle('right', x > 60);
      el.classList.toggle('top', y < 20);
    });
    this.pos.set(view.me, HERO_POS);
    for (const [pid, el] of this.seatEls) if (!keep.has(pid)) { el.remove(); this.seatEls.delete(pid); }
    // bet spots
    this.betEls = this.betEls || new Map();
    for (const [pid] of this.pos) {
      if (!this.betEls.has(pid)) {
        const b = h('div', { class: 'bet', hidden: true }, h('div', { class: 'bet-chips' }), h('span', { class: 'bet-amt' }));
        this.betEls.set(pid, b); this.betLayer.append(b);
      }
      const [x, y] = this.betPos(pid);
      const b = this.betEls.get(pid);
      b.style.left = x + '%'; b.style.top = y + '%';
    }
    for (const [pid, b] of this.betEls) if (!this.pos.has(pid)) { b.remove(); this.betEls.delete(pid); }
  }

  betPos(pid) {
    const [x, y] = this.pos.get(pid) || HERO_POS;
    if (pid === this.view.me) return [50, 80];
    if (y > 45 && y < 72) return [x < 50 ? x + 24 : x - 24, y + 4]; // side seats: below the board
    if (x > 40 && x < 60 && y < 40) return [x + 8, y + 22]; // seat at the head of the table
    const k = y < 40 ? 0.36 : 0.42;
    return [x + (CENTER[0] - x) * k, y + (CENTER[1] - y) * k + 3];
  }

  makeSeat(p) {
    const el = h('div', { class: 'seat', 'data-pid': p.id },
      h('div', { class: 'seat-cards' }),
      h('div', { class: 'avatar', style: { '--hue': hueFor(p.name) } },
        h('span', { class: 'ini' }, initials(p.name)),
        h('div', { class: 'ring' })),
      h('div', { class: 'plate' }, h('span', { class: 'name' }, p.name), h('span', { class: 'stack' }, fmt(p.stack))),
      h('div', { class: 'tag' }),
      h('div', { class: 'seat-hand' }));
    return el;
  }

  layoutSeats() { /* positions are % based; nothing to measure */ }

  seatAnchor(pid) {
    if (pid === this.view.me) return this.heroCards;
    const el = this.seatEls.get(pid);
    return el ? el.querySelector('.avatar') : this.dealer;
  }

  // ---------------- update pipeline ----------------
  update(events, view) {
    this.queue.push({ events, view });
    if (!this.busy) this.drain();
  }

  async drain() {
    this.busy = true;
    while (this.queue.length) {
      const { events, view } = this.queue.shift();
      const fast = this.queue.length > 1 || document.hidden;
      this.prevView = this.view;
      this.view = view;
      if (!this.prevView || events.some((e) => e.t === 'sync' || e.t === 'undo')) {
        this.reconcile(view);
        if (events.some((e) => e.t === 'undo')) this.say('Taking that back.');
        continue;
      }
      this.buildSeats(view);
      for (const ev of events) {
        try { await this.play(ev, view, fast); } catch (err) { console.error(err); }
      }
      this.reconcile(view);
    }
    this.busy = false;
  }

  name(pid) {
    const p = (this.view.players || []).find((x) => x.id === pid);
    return p ? p.name : 'Someone';
  }

  isMe(pid) { return pid === this.view.me; }

  async play(ev, view, fast) {
    const S = fast ? 0.35 : 1;
    switch (ev.t) {
      case 'handStart': return this.animHandStart(ev, view, S);
      case 'blind': return this.animBet(ev.pid, ev.amount, ev.kind === 'sb' ? 'Small blind' : 'Big blind', S, true);
      case 'dealHole': return this.animDealHole(ev, view, S);
      case 'act': return this.animAct(ev, view, S);
      case 'refund': return this.animRefund(ev, S);
      case 'collect': return this.animCollect(S);
      case 'street': return this.animStreet(ev, S);
      case 'reveal': return this.animReveal(ev, view, S);
      case 'win': return this.animWin(ev, view, S);
      case 'show': this.say(`${this.name(ev.pid)} shows.`); return this.revealSeat(ev.pid, ev.cards, true);
      case 'turn': return;
      case 'joined': if (!this.isMe(ev.pid)) this.say(`${this.name(ev.pid)} is connected.`); return;
      case 'idle': if (!this.isMe(ev.pid)) this.say(`Waiting for ${this.name(ev.pid)}’s phone to wake up.`); return;
      case 'back': if (!this.isMe(ev.pid)) this.say(`${this.name(ev.pid)} is back.`); return;
      case 'away': if (!this.isMe(ev.pid)) this.say(`${this.name(ev.pid)} dropped off. I'll check or fold for them.`); return;
      case 'rebuy': this.say(`${this.name(ev.pid)} rebuys for ${fmt(ev.amount)}.`); sfx.chip(3); return;
      case 'left': return;
      case 'paused': this.say(ev.v ? 'Dealing is paused.' : 'Back to it.'); return;
      case 'waiting': this.say('Waiting for at least two players with chips.'); return;
      case 'error': toast(ev.msg); return;
      case 'ended': return;
      default:
    }
  }

  say(text, ms = 3200) {
    const b = this.bubble;
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this._sayT);
    this._sayT = setTimeout(() => b.classList.remove('show'), ms);
  }

  async animHandStart(ev, view, S) {
    // sweep old cards away to the dealer
    const old = [...this.tableEl.querySelectorAll('.slot .card, .seat-cards .card, .seat-hand .card'), ...this.heroCards.querySelectorAll('.card')];
    this.banner.classList.remove('show');
    this.nextIn.textContent = '';
    this.tableEl.classList.remove('showdown');
    for (const el of this.tableEl.querySelectorAll('.win, .lose')) el.classList.remove('win', 'lose');
    if (old.length && !reduceMotion()) {
      const d = this.dealer.querySelector('.dealer-photo').getBoundingClientRect();
      await Promise.all(old.map((el, i) => {
        const ghost = el.cloneNode(true);
        const r = el.getBoundingClientRect();
        Object.assign(ghost.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: 0, zIndex: 40 });
        ghost.classList.add('fly-ghost');
        document.body.append(ghost);
        el.remove();
        return flyTo(ghost, d, { dur: 380 * S, delay: i * 18 * S, scaleTo: 0.4, fade: true });
      }));
    } else old.forEach((el) => el.remove());
    this.heroCards.innerHTML = '';
    for (const el of this.seatEls.values()) {
      el.querySelector('.seat-cards').innerHTML = '';
      el.querySelector('.seat-hand').innerHTML = '';
      el.classList.remove('folded', 'allin');
      el.querySelector('.tag').className = 'tag';
    }
    this.potAmt.dataset.v = 0; this.potAmt.textContent = '0';
    this.potChips.innerHTML = '';
    this.pot.hidden = true;
    this.sidepots.innerHTML = '';
    this.pre = null;
    // move the button
    this.placeButton(ev.buttonId, true);
    const lvlUp = this.prevView && this.prevView.level && ev.level.bb !== this.prevView.level.bb;
    this.say(lvlUp ? `Blinds are up: ${fmt(ev.level.sb)} and ${fmt(ev.level.bb)}.` : `Hand ${ev.handNo}. ${this.isMe(ev.buttonId) ? 'You have' : this.name(ev.buttonId) + ' has'} the button.`);
    this.renderTop(view);
    await sleep(250 * S);
  }

  placeButton(pid, animate) {
    if (!pid || !this.pos || !this.pos.has(pid)) { this.button.hidden = true; return; }
    this.button.hidden = false;
    let [x, y] = this.betPos(pid);
    if (pid === this.view.me) { x = 30; y = 84; } else { x += x < 50 ? 7 : -7; y -= 3; }
    const was = this.button.getBoundingClientRect();
    this.button.style.left = x + '%';
    this.button.style.top = y + '%';
    if (animate && was.width) flyFrom(this.button, was, { dur: 520, scale: 1 });
  }

  setBet(pid, amount) {
    const b = this.betEls && this.betEls.get(pid);
    if (!b) return null;
    const bb = this.view.level.bb;
    if (!amount) { b.hidden = true; b.dataset.v = 0; return b; }
    b.hidden = false;
    const c = b.querySelector('.bet-chips');
    c.replaceChildren(chipStack(amount, bb));
    const amt = b.querySelector('.bet-amt');
    amt.textContent = fmt(amount);
    b.dataset.v = amount;
    return b;
  }

  setStack(pid, amount, animate = true) {
    if (this.isMe(pid)) { animate ? countTo(this.heroStack, amount) : (this.heroStack.textContent = fmt(amount), this.heroStack.dataset.v = amount); return; }
    const el = this.seatEls.get(pid);
    if (!el) return;
    const s = el.querySelector('.stack');
    animate ? countTo(s, amount) : (s.textContent = fmt(amount), s.dataset.v = amount);
  }

  tag(pid, text, kind) {
    if (this.isMe(pid)) { this.heroState.textContent = text; this.heroState.className = 'hero-state ' + (kind || ''); return; }
    const el = this.seatEls.get(pid);
    if (!el) return;
    const t = el.querySelector('.tag');
    t.textContent = text;
    t.className = 'tag show ' + (kind || '');
  }

  async animBet(pid, amount, label, S, isBlind) {
    const b = this.betEls && this.betEls.get(pid);
    const prev = Number((b && b.dataset.v) || 0);
    const total = isBlind ? amount : amount; // caller passes new street total for acts
    const el = this.setBet(pid, total);
    if (label) this.tag(pid, label, 'blind');
    const p = this.view.players.find((x) => x.id === pid);
    if (p) {
      const stackEl = this.isMe(pid) ? this.heroStack : this.seatEls.get(pid)?.querySelector('.stack');
      const cur = Number(stackEl?.dataset.v ?? p.stack);
      this.setStack(pid, Math.max(0, cur - (total - prev)));
    }
    if (el && total > prev) {
      sfx.chip(2);
      await flyFrom(el.querySelector('.bet-chips'), this.seatAnchor(pid), { dur: 380 * S, scale: 0.6 });
    }
  }

  async animDealHole(ev, view, S) {
    const order = ev.order;
    const from = this.dealer.querySelector('.dealer-photo');
    // build face-down cards
    const heroCards = [];
    for (let round = 0; round < 2; round++) {
      for (const pid of order) {
        let card;
        if (this.isMe(pid)) {
          card = cardEl(null, { size: 'lg', down: true });
          card.style.setProperty('--n', round);
          this.heroCards.append(card);
          heroCards.push(card);
        } else {
          const seat = this.seatEls.get(pid);
          if (!seat) continue;
          card = cardEl(null, { size: 'xs', down: true });
          card.style.setProperty('--n', round);
          seat.querySelector('.seat-cards').append(card);
        }
        card.style.visibility = 'hidden';
        await sleep(95 * S);
        card.style.visibility = '';
        sfx.card();
        flyFrom(card, from, { dur: 420 * S, rotate: -200 + Math.random() * 60, scale: 0.5 });
      }
    }
    await sleep(380 * S);
    this.applyPeek();
  }

  async animAct(ev, view, S) {
    const { pid, a } = ev;
    const seat = this.seatEls.get(pid);
    const label = a === 'call' ? `Call ${fmt(ev.amount)}` : a === 'bet' ? `Bet ${fmt(ev.to)}` : a === 'raise' ? `Raise to ${fmt(ev.to)}` : a === 'allin' ? 'All-in' : ACTION_WORD[a];
    this.tag(pid, label, a);
    if (a === 'fold') {
      sfx.fold();
      if (seat) {
        seat.classList.add('folded');
        const cards = [...seat.querySelectorAll('.seat-cards .card')];
        cards.forEach((c, i) => {
          const ghost = c.cloneNode(true);
          const r = c.getBoundingClientRect();
          Object.assign(ghost.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: 0, zIndex: 30 });
          document.body.append(ghost);
          c.remove();
          flyTo(ghost, this.muck, { dur: 420 * S, delay: i * 40, scaleTo: 0.8, fade: true });
        });
      } else if (this.isMe(pid)) {
        this.heroCards.classList.add('folded');
      }
      await sleep(260 * S);
      return;
    }
    if (a === 'check') { sfx.check(); this.knock(pid); await sleep(260 * S); return; }
    if (a === 'allin') { this.say(`${this.isMe(pid) ? 'You are' : this.name(pid) + ' is'} all-in.`); seat && seat.classList.add('allin'); buzz(30); }
    await this.animBet(pid, ev.to, null, S);
    await sleep(120 * S);
  }

  knock(pid) {
    const el = this.isMe(pid) ? this.heroCards : this.seatEls.get(pid)?.querySelector('.avatar');
    if (!el || reduceMotion()) return;
    el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(0)' }], { duration: 320 });
  }

  async animRefund(ev, S) {
    const b = this.betEls && this.betEls.get(ev.pid);
    if (!b || b.hidden) return;
    const cur = Number(b.dataset.v || 0);
    const left = Math.max(0, cur - ev.amount);
    const ghost = this.chipGhost(b, ev.amount);
    this.setBet(ev.pid, left);
    await flyTo(ghost, this.seatAnchor(ev.pid), { dur: 420 * S, scaleTo: 0.6, fade: true });
    const stackEl = this.isMe(ev.pid) ? this.heroStack : this.seatEls.get(ev.pid)?.querySelector('.stack');
    this.setStack(ev.pid, Number(stackEl?.dataset.v || 0) + ev.amount);
  }

  chipGhost(fromEl, amount) {
    const r = fromEl.getBoundingClientRect();
    const g = chipStack(amount, this.view.level.bb);
    g.classList.add('ghost-chips');
    Object.assign(g.style, { position: 'fixed', left: r.left + r.width / 2 - 14 + 'px', top: r.top + r.height / 2 - 14 + 'px', zIndex: 35 });
    document.body.append(g);
    return g;
  }

  async animCollect(S) {
    const bets = [...(this.betEls || new Map()).entries()].filter(([, b]) => !b.hidden && Number(b.dataset.v) > 0);
    if (!bets.length) return;
    this.pot.hidden = false;
    const target = this.potChips;
    let add = 0;
    sfx.chip(4);
    await Promise.all(bets.map(([pid, b], i) => {
      const amt = Number(b.dataset.v);
      add += amt;
      const ghost = this.chipGhost(b.querySelector('.bet-chips'), amt);
      this.setBet(pid, 0);
      return flyTo(ghost, target, { dur: 460 * S, delay: i * 40 * S, scaleTo: 0.9 });
    }));
    const now = Number(this.potAmt.dataset.v || 0) + add;
    countTo(this.potAmt, now, 400);
    this.potChips.replaceChildren(chipStack(now, this.view.level.bb));
    for (const el of this.seatEls.values()) { const t = el.querySelector('.tag'); if (!el.classList.contains('folded') && !el.classList.contains('allin')) t.className = 'tag'; }
    if (!this.heroState.classList.contains('fold') && !this.heroState.classList.contains('allin')) { this.heroState.textContent = ''; this.heroState.className = 'hero-state'; }
  }

  async animStreet(ev, S) {
    const from = this.dealer.querySelector('.dealer-photo');
    const start = this.slots.findIndex((s) => !s.firstChild);
    // burn card
    if (!reduceMotion()) {
      const burn = cardEl(null, { size: 'sm', down: true });
      this.burnSpot.replaceChildren(burn);
      sfx.card();
      await flyFrom(burn, from, { dur: 300 * S, rotate: -90, scale: 0.6 });
      burn.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 * S, fill: 'forwards' });
    }
    const runout = this.view.hand && this.view.hand.runout;
    this.say(ev.street === 'flop' ? 'Flop.' : ev.street === 'turn' ? 'Turn.' : 'River.', 1800);
    if (runout && ev.street !== 'flop') await sleep(700 * S);
    const els = ev.cards.map((code, i) => {
      const c = cardEl(code, { size: 'md', down: true });
      this.slots[start + i].append(c);
      return c;
    });
    if (ev.street === 'flop' && !reduceMotion()) {
      // three cards land as a pile on the first slot, then spread and turn
      const first = this.slots[start].getBoundingClientRect();
      sfx.card();
      await Promise.all(els.map((c) => flyFrom(c, from, { dur: 420 * S, rotate: -160, scale: 0.6 })));
      await Promise.all(els.map((c, i) => i === 0 ? null : flyFrom(c, first, { dur: 360 * S, scale: 1, easing: 'cubic-bezier(.3,.7,.2,1)' })));
      els.forEach((c, i) => setTimeout(() => { flipUp(c, ev.cards[i]); sfx.flip(); }, i * 110 * S));
      await sleep(520 * S);
    } else {
      sfx.card();
      await Promise.all(els.map((c) => flyFrom(c, from, { dur: 420 * S, rotate: -160, scale: 0.6 })));
      els.forEach((c, i) => { flipUp(c, ev.cards[i]); });
      sfx.flip();
      await sleep(420 * S);
    }
    if (runout) await sleep(500 * S);
    // refresh hero hint with the new board
    if (this.view.hand) this.applyPeekWithBoard();
  }

  applyPeekWithBoard() {
    this.applyPeek();
  }

  async revealSeat(pid, cards, animate) {
    if (this.isMe(pid)) return;
    const seat = this.seatEls.get(pid);
    if (!seat) return;
    const box = seat.querySelector('.seat-hand');
    if (box.childElementCount === 2 && box.querySelector('.card[data-c]')?.dataset.c === cards[0]) return;
    box.innerHTML = '';
    seat.querySelector('.seat-cards').innerHTML = '';
    const els = cards.map((c) => { const e = cardEl(c, { size: 'sm', down: true }); box.append(e); return e; });
    if (animate) { sfx.flip(); els.forEach((e, i) => setTimeout(() => flipUp(e, cards[i]), i * 120)); await sleep(420); }
    else els.forEach((e, i) => flipUp(e, cards[i], false));
  }

  async animReveal(ev, view, S) {
    const order = ev.order || Object.keys(ev.cards);
    this.tableEl.classList.add('showdown');
    for (const pid of order) {
      await this.revealSeat(pid, ev.cards[pid], true);
      if (this.isMe(pid)) { this.peeking = false; this.applyPeek(); }
      await sleep(260 * S);
    }
  }

  async animWin(ev, view, S) {
    const R = ev.results;
    // reconcile pots before paying
    const boardEls = this.slots.map((s) => s.firstChild).filter(Boolean);
    this.pot.hidden = false;
    for (const [i, pot] of R.pots.entries()) {
      const winners = pot.awards.map((a) => a.pid);
      const names = winners.map((pid) => (this.isMe(pid) ? 'You' : this.name(pid)));
      const who = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
      const verb = names.length === 1 ? (names[0] === 'You' ? 'win' : 'wins') : 'split';
      const amt = names.length === 1 ? pot.awards[0].amount : pot.amount;
      const hand = pot.hand ? ` with ${lowerFirst(pot.hand.desc)}` : '';
      const label = R.pots.length > 1 ? ` (${pot.label})` : '';
      this.banner.replaceChildren(h('strong', {}, `${who} ${verb} ${fmt(amt)}`), h('span', {}, (pot.hand ? pot.hand.desc : 'Everyone else folded') + label));
      this.banner.classList.add('show');
      this.say(`${who} ${verb} ${fmt(amt)}${hand}.`, 4200);
      // highlight best five
      if (pot.hand && pot.hand.best) {
        const best = new Set(pot.hand.best);
        for (const c of boardEls) { c.classList.toggle('win', best.has(c.dataset.c)); c.classList.toggle('lose', !best.has(c.dataset.c)); }
        for (const pid of winners) {
          const cardsEls = this.isMe(pid) ? [...this.heroCards.querySelectorAll('.card')] : [...(this.seatEls.get(pid)?.querySelectorAll('.seat-hand .card') || [])];
          for (const c of cardsEls) c.classList.toggle('win', best.has(c.dataset.c));
        }
      }
      for (const pid of winners) {
        const seat = this.isMe(pid) ? this.hero : this.seatEls.get(pid);
        seat && seat.classList.add('winner');
      }
      if (winners.includes(this.view.me)) { sfx.win(); buzz([40, 60, 40]); }
      await sleep(500 * S);
      // chips fly to each winner
      sfx.chip(4);
      await Promise.all(pot.awards.map((a, k) => {
        const g = this.chipGhost(this.potChips, a.amount);
        return flyTo(g, this.seatAnchor(a.pid), { dur: 620 * S, delay: k * 120 * S, scaleTo: 0.7, fade: true }).then(() => {
          const stackEl = this.isMe(a.pid) ? this.heroStack : this.seatEls.get(a.pid)?.querySelector('.stack');
          this.setStack(a.pid, Number(stackEl?.dataset.v || 0) + a.amount);
        });
      }));
      const left = Math.max(0, Number(this.potAmt.dataset.v || 0) - pot.amount);
      countTo(this.potAmt, left, 300);
      if (!left) { this.potChips.innerHTML = ''; this.pot.hidden = true; }
      await sleep((i < R.pots.length - 1 ? 1300 : 600) * S);
      for (const pid of winners) { const seat = this.isMe(pid) ? this.hero : this.seatEls.get(pid); seat && seat.classList.remove('winner'); }
    }
  }

  // ---------------- full sync (no animation) ----------------
  reconcile(v) {
    this.view = v;
    this.buildSeats(v);
    this.renderTop(v);
    const hand = v.hand;
    const me = v.players.find((p) => p.id === v.me);
    // seats
    for (const p of v.players) {
      const hp = hand && hand.ps[p.id];
      if (p.id === v.me) continue;
      const el = this.seatEls.get(p.id);
      if (!el) continue;
      el.querySelector('.name').textContent = p.name;
      el.querySelector('.ini').textContent = initials(p.name);
      this.setStack(p.id, p.stack, false);
      el.classList.toggle('away', !p.connected);
      el.classList.toggle('out', !hp && (p.sittingOut || p.busted));
      el.classList.toggle('folded', !!(hp && hp.folded));
      el.classList.toggle('allin', !!(hp && hp.allIn));
      el.classList.toggle('turn', !!(hand && hand.toAct === p.id));
      const cardsBox = el.querySelector('.seat-cards');
      const handBox = el.querySelector('.seat-hand');
      if (hp && !hp.folded && hp.cards && hp.revealed) {
        if (handBox.childElementCount !== 2) { this.revealSeat(p.id, hp.cards, false); }
      } else if (hp && !hp.folded && v.phase === 'hand' && cardsBox.childElementCount !== 2 && !handBox.childElementCount) {
        cardsBox.replaceChildren(cardEl(null, { size: 'xs' }), cardEl(null, { size: 'xs' }));
        [...cardsBox.children].forEach((c, i) => c.style.setProperty('--n', i));
      } else if (!hp || hp.folded) {
        if (!hp) { cardsBox.innerHTML = ''; handBox.innerHTML = ''; }
        else cardsBox.innerHTML = '';
      }
      const t = el.querySelector('.tag');
      if (!hp) {
        t.textContent = p.busted ? 'Out of chips' : p.sittingOut ? 'Sitting out' : '';
        t.className = 'tag' + (t.textContent ? ' show muted' : '');
      } else if (hp.allIn) { t.textContent = 'All-in'; t.className = 'tag show allin'; }
      else if (hp.folded) { t.textContent = 'Fold'; t.className = 'tag show fold'; }
      else if (hp.lastAction && hp.streetBet >= 0 && v.phase === 'hand') {
        const la = hp.lastAction;
        const txt = la === 'call' ? 'Call' : la === 'bet' ? `Bet ${fmt(hp.streetBet)}` : la === 'raise' ? `Raise to ${fmt(hp.streetBet)}` : ACTION_WORD[la];
        t.textContent = txt; t.className = 'tag show ' + la;
      } else if (v.phase === 'hand') { t.className = 'tag'; }
      if (!p.connected) { t.textContent = 'Away'; t.className = 'tag show muted'; }
    }
    // bets
    if (this.betEls) for (const [pid] of this.betEls) this.setBet(pid, hand && hand.ps[pid] ? hand.ps[pid].streetBet : 0);
    // pot
    const collected = hand ? hand.collected : 0;
    if (hand && collected > 0 && v.phase === 'hand') {
      this.pot.hidden = false;
      this.potAmt.dataset.v = collected; this.potAmt.textContent = fmt(collected);
      this.potChips.replaceChildren(chipStack(collected, v.level.bb));
    } else if (!hand || v.phase !== 'hand') {
      if (v.phase !== 'between') { this.pot.hidden = true; this.potChips.innerHTML = ''; }
      else if (!Number(this.potAmt.dataset.v)) { this.pot.hidden = true; }
    }
    // side pots (only when someone is all-in)
    this.sidepots.replaceChildren(...(hand && hand.pots && hand.pots.length > 1 ? hand.pots.map((p, i) => h('span', { class: 'sp' }, i === 0 ? `Main ${fmt(p.amount)}` : `Side ${fmt(p.amount)}`)) : []));
    // board
    const board = hand ? hand.board : [];
    this.slots.forEach((s, i) => {
      const code = board[i];
      const c = s.firstChild;
      if (!code) { if (c) c.remove(); return; }
      if (!c) { s.append(cardEl(code, { size: 'md' })); }
      else if (c.dataset.c !== code || c.classList.contains('down')) { setCardFace(c, code); c.classList.remove('down'); }
    });
    // hero
    const mine = hand && hand.ps[v.me];
    this.heroName.textContent = me ? me.name : '';
    if (me) this.setStack(v.me, me.stack, false);
    if (mine && mine.cards) {
      if (this.heroCards.childElementCount !== 2) {
        this.heroCards.replaceChildren(...mine.cards.map((c, i) => { const e = cardEl(c, { size: 'lg', down: true }); e.style.setProperty('--n', i); return e; }));
      }
    } else if (!hand || !mine) {
      if (v.phase === 'hand' || !hand) this.heroCards.replaceChildren();
    }
    this.heroCards.hidden = !this.heroCards.childElementCount;
    this.applyPeek();
    const myState = !me ? '' : me.busted ? 'Out of chips' : me.sittingOut && !mine ? 'Sitting out' : mine && mine.allIn ? 'All-in' : mine && mine.folded ? 'Folded' : '';
    if (myState || !mine || !mine.lastAction) { this.heroState.textContent = myState; this.heroState.className = 'hero-state ' + (myState ? 'muted' : ''); }
    this.hero.classList.toggle('turn', !!(hand && hand.toAct === v.me));
    // dealer button
    if (hand) this.placeButton(hand.buttonId, false); else this.button.hidden = true;
    // turn timer bookkeeping
    this.turnInfo = { pid: hand && hand.toAct, left: v.turnLeft, total: v.turnTotal, at: performance.now() };
    // next hand
    this.nextInfo = v.phase === 'between' && v.nextIn ? { at: performance.now() + v.nextIn } : null;
    if (v.phase === 'between' && v.paused) this.nextIn.textContent = this.client.isHost ? 'Dealing is paused. Tap Deal next hand when ready.' : 'The host paused dealing.';
    else if (v.phase !== 'between') this.nextIn.textContent = '';
    this.renderActions(v);
    // your turn signal
    if (hand && hand.toAct === v.me && v.phase === 'hand') {
      const key = hand.id + ':' + hand.street + ':' + hand.currentBet + ':' + (v.log.length);
      if (this.lastTurnBuzz !== key) {
        this.lastTurnBuzz = key;
        if (!this.tryPreAction(v)) { buzz([25, 40, 25]); sfx.turn(); }
      }
    }
    // connection pill
    const away = v.players.filter((p) => !p.connected && p.id !== v.me && !p.sittingOut);
    if (v.isHost) {
      this.awayDot.hidden = !away.length;
      this.awayDot.disabled = false;
      this.awayDot.textContent = away.length ? `${away.length} away` : '';
    }
  }

  // guest side: the host phone has gone quiet (locked screen or app in background)
  setHostQuiet(q) {
    this.awayDot.hidden = !q;
    this.awayDot.disabled = true;
    this.awayDot.textContent = q ? 'Waiting for host' : '';
  }

  renderTop(v) {
    this.handInfo.querySelector('.hand-no').textContent = v.handNo ? `Hand ${v.handNo}` : 'Table ready';
    this.handInfo.querySelector('.blinds').textContent = `Blinds ${fmt(v.level.sb)} / ${fmt(v.level.bb)}`;
  }

  // ---------------- actions ----------------
  tryPreAction(v) {
    const pre = this.pre;
    if (!pre || !v.legal) return false;
    const L = v.legal;
    this.pre = null;
    if (pre === 'checkfold') { this.client.act({ type: L.canCheck ? 'check' : 'fold' }); return true; }
    if (pre === 'check' && L.canCheck) { this.client.act({ type: 'check' }); return true; }
    if (pre === 'callany') { this.client.act({ type: L.canCheck ? 'check' : 'call' }); return true; }
    return false;
  }

  renderActions(v) {
    const A = this.actions;
    const L = v.legal;
    const hand = v.hand;
    const mine = hand && hand.ps[v.me];
    const me = v.players.find((p) => p.id === v.me);
    A.replaceChildren();
    this.preBar.replaceChildren();
    A.className = 'actions';
    if (!L) this.closeRaise();
    if (v.phase === 'hand' && L) {
      A.classList.add('live');
      const fold = h('button', { class: 'act fold', onclick: () => this.send({ type: 'fold' }) }, 'Fold');
      const call = L.canCheck
        ? h('button', { class: 'act check', onclick: () => this.send({ type: 'check' }) }, 'Check')
        : h('button', { class: 'act call', onclick: () => this.send({ type: 'call' }) }, L.toCall >= me.stack ? 'Call all-in' : 'Call', h('small', {}, fmt(L.toCall)));
      const raise = L.canRaise
        ? h('button', { class: 'act raise', onclick: () => this.openRaise() }, L.isBet ? 'Bet' : 'Raise', h('small', {}, L.maxTo <= L.minTo ? 'All-in' : `${fmt(L.minTo)}+`))
        : h('button', { class: 'act raise', disabled: true }, 'Raise');
      if (L.canCheck) fold.classList.add('quiet');
      A.append(fold, call, raise);
      return;
    }
    if (v.phase === 'hand' && mine && !mine.folded && !mine.allIn) {
      // pre-actions while waiting
      const mk = (key, label) => h('button', { class: 'pre' + (this.pre === key ? ' on' : ''), 'aria-pressed': this.pre === key ? 'true' : 'false', onclick: () => { this.pre = this.pre === key ? null : key; this.renderActions(this.view); } }, label);
      const facing = hand.currentBet > mine.streetBet;
      if (facing) this.preBar.append(mk('checkfold', 'Fold'), mk('callany', 'Call any'));
      else this.preBar.append(mk('checkfold', 'Check / Fold'), mk('check', 'Check'), mk('callany', 'Call any'));
      if (facing && this.pre === 'check') this.pre = null;
      A.append(h('div', { class: 'waiting' }, hand.toAct ? `Waiting for ${this.name(hand.toAct)}` : 'Dealing'));
      return;
    }
    const btns = [];
    if (v.phase === 'between' && hand && hand.results && !hand.results.showdown && mine && !mine.folded && !hand.ps[v.me].revealed) {
      btns.push(h('button', { class: 'act subtle', onclick: () => this.client.show() }, 'Show my cards'));
    }
    if (me && me.busted && v.cfg.rebuys) btns.push(h('button', { class: 'act raise', onclick: () => this.client.rebuy() }, `Rebuy ${fmt(v.cfg.startStack)}`));
    if (me && me.sittingOut && !me.busted) btns.push(h('button', { class: 'act call', onclick: () => this.client.sitOut(false) }, 'Sit back in'));
    if (v.isHost && (v.phase === 'between' || v.phase === 'lobby') && (v.paused || !v.nextIn)) btns.push(h('button', { class: 'act call', onclick: () => this.client.dealNow() }, 'Deal next hand'));
    if (!btns.length) {
      const txt = v.phase === 'hand' ? (mine && mine.folded ? 'You folded. Next hand soon.' : mine && mine.allIn ? 'You are all-in.' : 'You are not in this hand.') : '';
      if (txt) btns.push(h('div', { class: 'waiting' }, txt));
    }
    A.append(...btns);
  }

  send(action) {
    this.closeRaise();
    if (action.type === 'fold') {
      const L = this.view.legal;
      if (L && L.canCheck && !this._foldConfirm) {
        this._foldConfirm = true;
        toast('You can check for free. Tap Fold again to fold anyway.');
        setTimeout(() => (this._foldConfirm = false), 2500);
        return;
      }
    }
    this._foldConfirm = false;
    this.client.act(action);
    // optimistic: hide buttons until the host answers
    this.actions.classList.remove('live');
    this.actions.replaceChildren(h('div', { class: 'waiting' }, 'Sent'));
  }

  openRaise() {
    const v = this.view, L = v.legal;
    if (!L) return;
    const me = v.players.find((p) => p.id === v.me);
    const sheet = this.raiseSheet;
    const bb = v.level.bb;
    const pot = L.pot; // all chips committed so far, including current bets
    let val = L.minTo;
    const amt = h('output', { class: 'raise-amt' });
    const sub = h('div', { class: 'raise-sub' });
    const slider = h('input', { type: 'range', min: L.minTo, max: L.maxTo, step: 1, value: L.minTo, 'aria-label': 'Raise amount' });
    const confirm = h('button', { class: 'act raise wide' });
    const set = (x) => {
      x = Math.round(x);
      if (x > L.maxTo - bb / 4) x = L.maxTo;
      val = Math.max(L.minTo, Math.min(L.maxTo, x));
      slider.value = val;
      const allin = val >= L.maxTo;
      amt.textContent = fmt(val);
      sub.textContent = allin ? 'Everything you have' : L.isBet ? `${Math.round((val / Math.max(1, pot)) * 100)}% of the pot` : `Raise of ${fmt(val - L.currentBet)}`;
      confirm.textContent = allin ? `All-in ${fmt(val)}` : L.isBet ? `Bet ${fmt(val)}` : `Raise to ${fmt(val)}`;
      confirm.classList.toggle('allin', allin);
    };
    slider.addEventListener('input', () => { set(Number(slider.value)); sfx.tick(); });
    const potTo = (f) => L.isBet ? f * pot : L.currentBet + f * (pot + L.toCall);
    const sb = v.level.sb;
    const preset = (label, fn) => h('button', { class: 'preset', onclick: () => { const x = fn(); set(x >= L.maxTo ? x : Math.round(x / sb) * sb); sfx.chip(1); } }, label);
    const presets = h('div', { class: 'presets' },
      preset('Min', () => L.minTo),
      preset('½ pot', () => potTo(0.5)),
      preset('¾ pot', () => potTo(0.75)),
      preset('Pot', () => potTo(1)),
      preset('All-in', () => L.maxTo));
    const nudge = (d) => h('button', { class: 'nudge', 'aria-label': d > 0 ? 'More' : 'Less', onclick: () => set(val + d * bb) }, d > 0 ? '+' : '−');
    confirm.onclick = () => {
      if (val >= L.maxTo && !confirm.dataset.sure) {
        confirm.dataset.sure = '1';
        confirm.textContent = `Tap again: all-in ${fmt(val)}`;
        setTimeout(() => { delete confirm.dataset.sure; set(val); }, 2500);
        return;
      }
      this.send({ type: L.isBet ? 'bet' : 'raise', to: val });
    };
    sheet.replaceChildren(
      h('div', { class: 'raise-head' },
        h('div', {}, amt, sub),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => this.closeRaise() }, '✕')),
      presets,
      h('div', { class: 'slider-row' }, nudge(-1), slider, nudge(1)),
      h('div', { class: 'raise-foot' }, h('span', {}, `Your stack ${fmt(me.stack)}`), h('span', {}, `Pot ${fmt(pot)}`)),
      confirm);
    set(L.minTo);
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('open'));
    this.raiseOpen = true;
  }

  closeRaise() {
    if (!this.raiseOpen) return;
    this.raiseOpen = false;
    this.raiseSheet.classList.remove('open');
    setTimeout(() => { if (!this.raiseOpen) this.raiseSheet.hidden = true; }, 250);
  }

  // turn countdown rings + next-hand countdown
  timerLoop() {
    const tick = () => {
      if (!this.root.isConnected) return;
      const T = this.turnInfo;
      for (const el of this.seatEls.values()) el.style.removeProperty('--p');
      this.heroRing.style.removeProperty('--p');
      if (T && T.pid && T.total) {
        const left = Math.max(0, T.left - (performance.now() - T.at));
        const p = left / T.total;
        if (T.pid === this.view.me) {
          this.heroRing.style.setProperty('--p', p);
          this.heroRing.classList.toggle('low', left < 6000);
          const sec = Math.ceil(left / 1000);
          if (left < 6000 && sec !== this._lastSec) { this._lastSec = sec; sfx.tick(); if (sec <= 3) buzz(15); }
        } else {
          const el = this.seatEls.get(T.pid);
          if (el) el.style.setProperty('--p', p);
        }
      }
      if (this.nextInfo && !this.busy) {
        const left = Math.max(0, this.nextInfo.at - performance.now());
        this.nextIn.textContent = left > 400 ? `Next hand in ${Math.ceil(left / 1000)}` : '';
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  destroy() { this.ro && this.ro.disconnect(); this.root.innerHTML = ''; }
}

function lowerFirst(s) {
  // "Pair of Kings" -> "a pair of Kings", "Full House, ..." -> "a full house, ..."
  const map = [['Royal Flush', 'a royal flush'], ['Straight Flush', 'a straight flush'], ['Four of a Kind', 'four of a kind'],
    ['Full House', 'a full house'], ['Flush', 'a flush'], ['Straight', 'a straight'], ['Three of a Kind', 'three of a kind'],
    ['Two Pair', 'two pair'], ['Pair of', 'a pair of']];
  for (const [a, b] of map) if (s.startsWith(a)) return b + s.slice(a.length);
  return s;
}
