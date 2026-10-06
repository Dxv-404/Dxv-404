// Host controller: owns the Engine, the links to every guest phone, timers and persistence.
import { Engine } from './engine.js';
import { Link, keepAlive } from './net.js';

const SAVE_KEY = 'tp-host-v1';

export class Host {
  constructor(engine, myPid) {
    this.e = engine;
    this.me = myPid;
    this.links = new Map(); // pid -> Link
    this.pending = null; // { pid, link }
    this.listeners = new Set();
    this.seq = 0;
    this.turnTimer = null;
    this.nextTimer = null;
    this.turnStartedAt = 0;
    this.turnFor = null;
    this.nextHandAt = 0;
    const p = this.e.player(myPid);
    if (p) p.connected = true;
    // anyone else starts disconnected after a reload
    for (const x of this.e.s.players) if (x.id !== myPid) x.connected = false;
  }

  static create(config, names) {
    const e = Engine.newGame(config, names);
    const h = new Host(e, e.s.players[0].id);
    h.save();
    return h;
  }

  static restore() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || !d.state || d.state.phase === 'ended') return null;
      return new Host(new Engine(d.state), d.me);
    } catch { return null; }
  }

  static savedSummary() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!d || !d.state || d.state.phase === 'ended') return null;
      return { players: d.state.players.length, handNo: d.state.handNo, savedAt: d.savedAt };
    } catch { return null; }
  }

  static clearSave() { localStorage.removeItem(SAVE_KEY); }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ state: this.e.s, me: this.me, savedAt: Date.now() })); } catch {}
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // ---------- pairing ----------
  async pairOffer(pid) {
    this.cancelPairing();
    const p = this.e.player(pid);
    const link = new Link();
    this.pending = { pid, link };
    const payload = await link.createOffer({ n: p.name, pid, g: this.e.s.gameId });
    this.lastOffer = payload;
    return payload;
  }

  async pairAnswer(payload) {
    if (!this.pending) throw new Error('Start pairing again');
    const { pid, link } = this.pending;
    await link.acceptAnswer(payload);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('The phones could not reach each other. Check both are on the same hotspot, then try again.')), 12000);
      link.onopen = () => {
        clearTimeout(t);
        this.pending = null;
        this.attach(pid, link);
        resolve();
      };
    });
  }

  cancelPairing() {
    if (this.pending) { this.pending.link.close(); this.pending = null; }
  }

  attach(pid, link) {
    const old = this.links.get(pid);
    if (old && old !== link) { old.onclose = null; old.close(); }
    this.links.set(pid, link);
    const p = this.e.player(pid);
    if (p) {
      p.connected = true;
      if (p.autoSat) { p.sittingOut = false; p.autoSat = false; }
    }
    link.onmessage = (msg) => this.onMessage(pid, msg);
    link.onclose = () => {
      if (this.links.get(pid) !== link) return;
      this.links.delete(pid);
      const pl = this.e.player(pid);
      if (pl) pl.connected = false;
      this.e.logLine(`${pl ? pl.name : 'A player'} lost connection`);
      this.push([{ t: 'away', pid }]);
    };
    // a quiet link (locked screen, app in background) is shown as away but kept open
    link.onquiet = (q) => {
      if (this.links.get(pid) !== link) return;
      const pl = this.e.player(pid);
      if (!pl) return;
      pl.connected = !q;
      this.push([{ t: q ? 'idle' : 'back', pid }]);
    };
    keepAlive(link);
    this.e.logLine(`${p ? p.name : 'A player'} connected`);
    this.push([{ t: 'joined', pid }]);
  }

  onMessage(pid, msg) {
    switch (msg.t) {
      case 'act': return this.act(pid, msg.action, msg.handNo);
      case 'show': return this.push(this.e.showCards(pid));
      case 'rebuy': return this.push(this.e.rebuy(pid));
      case 'sitout': this.e.setSitOut(pid, msg.v); return this.push([{ t: 'sitout', pid, v: msg.v }]);
      case 'hello': return this.sendTo(pid, [{ t: 'sync' }]);
      case 'leave': this.e.removePlayer(pid); return this.push([{ t: 'left', pid }]);
      default:
    }
  }

  // ---------- game control ----------
  startGame() {
    for (const p of this.e.s.players) {
      if (!p.connected && p.id !== this.me) { p.sittingOut = true; p.autoSat = true; }
    }
    this.dealNext();
  }

  dealNext() {
    clearTimeout(this.nextTimer);
    this.nextHandAt = 0;
    if (!this.e.canStartHand()) { this.push([{ t: 'waiting' }]); return; }
    const ev = this.e.startHand();
    this.push(ev);
  }

  act(pid, action, handNo) {
    if (handNo && this.e.s.hand && handNo !== this.e.s.hand.id) return;
    const r = this.e.act(pid, action);
    if (r.error) { this.sendTo(pid, [{ t: 'error', msg: r.error }]); return; }
    this.push(r.events);
  }

  undo() {
    const ev = this.e.undo();
    if (ev) this.push(ev);
  }

  setPaused(v) {
    this.e.s.paused = !!v;
    if (!v && this.e.s.phase === 'between' && !this.nextTimer) this.scheduleNext(1500);
    if (v) { clearTimeout(this.nextTimer); this.nextTimer = null; this.nextHandAt = 0; }
    this.push([{ t: 'paused', v }]);
  }

  addPlayer(name) {
    const p = this.e.addPlayer(name);
    p.sittingOut = true; p.autoSat = true;
    this.push([{ t: 'seat', pid: p.id }]);
    return p;
  }

  removePlayer(pid) {
    const l = this.links.get(pid);
    if (l) { l.send({ t: 'kicked' }); l.onclose = null; l.close(); this.links.delete(pid); }
    this.e.removePlayer(pid);
    this.push([{ t: 'left', pid }]);
  }

  movePlayer(pid, dir) { this.e.movePlayer(pid, dir); this.push([{ t: 'seat' }]); }
  renamePlayer(pid, name) { const p = this.e.player(pid); if (p) p.name = String(name).trim().slice(0, 14) || p.name; this.push([{ t: 'seat' }]); }
  rebuyFor(pid) { this.push(this.e.rebuy(pid)); }
  sitOut(pid, v) { this.e.setSitOut(pid, v); const p = this.e.player(pid); if (p) p.autoSat = false; this.push([{ t: 'sitout', pid, v }]); }
  foldFor(pid) { const r = this.e.autoAct(pid); if (r && r.events) this.push(r.events); }

  endGame() {
    clearTimeout(this.nextTimer); clearTimeout(this.turnTimer);
    const standings = this.e.endGame();
    this.push([{ t: 'ended', standings }]);
    this.save();
    return standings;
  }

  // ---------- broadcasting ----------
  push(events) {
    if (!events) return;
    this.seq += 1;
    this.afterEvents(events);
    this.save();
    for (const p of this.e.s.players) {
      if (p.id === this.me) continue;
      this.sendTo(p.id, events);
    }
    const view = this.viewFor(this.me);
    for (const fn of this.listeners) fn(events, view);
  }

  sendTo(pid, events) {
    const l = this.links.get(pid);
    if (!l) return;
    l.send({ t: 'state', seq: this.seq, events, view: this.viewFor(pid) });
  }

  viewFor(pid) {
    const v = this.e.viewFor(pid);
    v.isHost = pid === this.me;
    v.hostId = this.me;
    v.turnTotal = this.turnLimitFor(this.e.s.hand && this.e.s.hand.toAct);
    v.turnLeft = v.turnTotal ? Math.max(0, v.turnTotal - (Date.now() - this.turnStartedAt)) : 0;
    v.nextIn = this.nextHandAt ? Math.max(0, this.nextHandAt - Date.now()) : 0;
    if (this.e.s.phase === 'ended') v.standings = this.e.standings();
    return v;
  }

  turnLimitFor(pid) {
    if (!pid) return 0;
    const p = this.e.player(pid);
    if (!p) return 0;
    if (!p.connected) return 20000; // away players are auto-checked/folded
    return (this.e.s.cfg.turnTime || 0) * 1000;
  }

  afterEvents(events) {
    const s = this.e.s;
    // turn timer
    const toAct = s.phase === 'hand' && s.hand ? s.hand.toAct : null;
    const turnChanged = events.some((x) => x.t === 'turn' || x.t === 'away' || x.t === 'joined');
    if (toAct !== this.turnFor || turnChanged) {
      if (toAct !== this.turnFor || events.some((x) => x.t === 'turn')) this.turnStartedAt = Date.now() + this.animLead(events);
      this.turnFor = toAct;
      clearTimeout(this.turnTimer);
      const lim = this.turnLimitFor(toAct);
      if (toAct && lim) {
        const wait = lim - (Date.now() - this.turnStartedAt);
        const handId = s.hand.id;
        this.turnTimer = setTimeout(() => {
          if (this.e.s.hand && this.e.s.hand.id === handId && this.e.s.hand.toAct === toAct) this.foldFor(toAct);
        }, Math.max(500, wait));
      }
    }
    // schedule next hand
    if (events.some((x) => x.t === 'win')) {
      const streets = events.filter((x) => x.t === 'street').length;
      const runout = s.hand && s.hand.runout;
      const showdown = s.hand && s.hand.results && s.hand.results.showdown;
      let d = 4200 + (showdown ? 2600 : 0) + (runout ? streets * 1700 + 1200 : streets * 600);
      d += (s.hand.results.pots.length - 1) * 1400;
      this.scheduleNext(d);
    }
  }

  // time the client spends animating before the turn indicator matters
  animLead(events) {
    let ms = 0;
    for (const x of events) {
      if (x.t === 'dealHole') ms += 1300;
      if (x.t === 'street') ms += 900;
      if (x.t === 'collect') ms += 450;
    }
    return ms;
  }

  scheduleNext(ms) {
    clearTimeout(this.nextTimer);
    this.nextTimer = null;
    if (this.e.s.paused) { this.nextHandAt = 0; return; }
    this.nextHandAt = Date.now() + ms;
    this.nextTimer = setTimeout(() => { this.nextTimer = null; this.dealNext(); }, ms);
  }

  // Local player helpers (host plays on this phone too)
  localAct(action) { const h = this.e.s.hand; this.act(this.me, action, h && h.id); }
  localShow() { this.push(this.e.showCards(this.me)); }
  localRebuy() { this.push(this.e.rebuy(this.me)); }
  localSitOut(v) { this.sitOut(this.me, v); }
  currentView() { return this.viewFor(this.me); }

  destroy() {
    clearTimeout(this.nextTimer); clearTimeout(this.turnTimer);
    for (const l of this.links.values()) { l.onclose = null; l.close(); }
    this.links.clear();
    this.cancelPairing();
  }
}
