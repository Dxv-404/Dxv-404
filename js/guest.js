// Guest controller: one link to the host; receives views, sends actions.
import { Link, parsePayload, keepAlive } from './net.js';

const KEY = 'tp-guest-v1';

export class Guest {
  constructor() {
    this.link = null;
    this.view = null;
    this.listeners = new Set();
    this.statusListeners = new Set();
    this.pid = null;
    this.status = 'idle'; // idle | waiting | connected | lost | kicked
  }

  static saved() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  setStatus(s) { this.status = s; for (const fn of this.statusListeners) fn(s); }

  // Scan step: host's join code -> our reply code.
  async answer(offerText) {
    const p = parsePayload(offerText);
    if (p.kind !== 'o') throw new Error('That is a reply code. Scan the join code on the host phone.');
    if (this.link) { this.link.onclose = null; this.link.close(); }
    const link = new Link();
    this.link = link;
    this.pid = p.extra.pid;
    this.name = p.extra.n;
    this.gameId = p.extra.g;
    const reply = await link.acceptOffer(p, {});
    this.lastReply = reply;
    link.onopen = () => {
      try { localStorage.setItem(KEY, JSON.stringify({ pid: this.pid, name: this.name, gameId: this.gameId })); } catch {}
      this.setStatus('connected');
      link.send({ t: 'hello' });
    };
    link.onmessage = (m) => this.onMessage(m);
    link.onclose = () => { if (this.link === link && this.status !== 'kicked') this.setStatus('lost'); };
    keepAlive(link);
    this.setStatus('waiting');
    return reply;
  }

  onMessage(m) {
    if (m.t === 'state') {
      // turn timers are sent as "ms left", convert to our own clock
      m.view.receivedAt = performance.now();
      this.view = m.view;
      for (const fn of this.listeners) fn(m.events, m.view);
    } else if (m.t === 'kicked') {
      this.setStatus('kicked');
    }
  }

  send(msg) { return this.link && this.link.send(msg); }
  act(action) { this.send({ t: 'act', action, handNo: this.view && this.view.hand && this.view.hand.id }); }
  show() { this.send({ t: 'show' }); }
  rebuy() { this.send({ t: 'rebuy' }); }
  sitOut(v) { this.send({ t: 'sitout', v }); }
  leave() { this.send({ t: 'leave' }); localStorage.removeItem(KEY); setTimeout(() => this.link && this.link.close(), 300); }
  destroy() { if (this.link) { this.link.onclose = null; this.link.close(); } }
}
