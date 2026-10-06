import { h, $, fmt, toast, sleep } from './ui.js';
import { Host } from './host.js';
import { Guest } from './guest.js';
import { TableView } from './table.js';
import { qrSvg, Scanner } from './qr.js';
import { infoContent } from './info.js';
import { settings, saveSettings, unlockAudio, keepAwake, sfx } from './fx.js';
import { warmUpCamera, parsePayload } from './net.js';

const app = $('#app');
let host = null;
let guest = null;
let table = null;
let current = null; // cleanup for the active screen

// ---------------- sheets ----------------
function openSheet(content, { label = 'Panel', onClose, tall = false } = {}) {
  const close = () => {
    sheet.classList.remove('open');
    scrim.classList.remove('open');
    setTimeout(() => { wrap.remove(); }, 260);
    document.removeEventListener('keydown', onKey);
    onClose && onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const scrim = h('div', { class: 'scrim', onclick: close });
  const sheet = h('div', { class: 'sheet' + (tall ? ' tall' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': label },
    h('div', { class: 'grip', 'aria-hidden': 'true' }),
    h('button', { class: 'icon-btn sheet-close', 'aria-label': 'Close', onclick: close }, '✕'),
    h('div', { class: 'sheet-body' }, content));
  const wrap = h('div', { class: 'sheet-wrap' }, scrim, sheet);
  document.body.append(wrap);
  requestAnimationFrame(() => { sheet.classList.add('open'); scrim.classList.add('open'); });
  document.addEventListener('keydown', onKey);
  // swipe down to close
  let y0 = null;
  sheet.addEventListener('touchstart', (e) => { if (sheet.querySelector('.sheet-body').scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sheet.addEventListener('touchend', (e) => { if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; sheet.style.transform = ''; y0 = null; if (dy > 110) close(); });
  return { close, sheet };
}

// The info button is always on top of everything.
$('#info-btn').addEventListener('click', () => openSheet(infoContent(), { label: 'Poker hands', tall: true }));

function screen(build) {
  if (current) { try { current(); } catch {} current = null; }
  app.replaceChildren();
  const el = h('main', { class: 'screen' });
  app.append(el);
  const cleanup = build(el);
  current = typeof cleanup === 'function' ? cleanup : null;
  window.scrollTo(0, 0);
}

// ---------------- home ----------------
function home() {
  delete document.body.dataset.playing;
  screen((el) => {
    el.className = 'screen home';
    const saved = Host.savedSummary();
    const gsaved = Guest.saved();
    el.append(
      h('div', { class: 'home-hero' },
        h('div', { class: 'home-cards', 'aria-hidden': 'true' }, h('span', { class: 'hc a' }, 'A', h('i', {}, '♠')), h('span', { class: 'hc b' }, 'K', h('i', {}, '♥'))),
        h('h1', {}, 'Train Poker'),
        h('p', { class: 'tagline' }, "No-limit Texas Hold'em, one phone each, no internet needed.")),
      h('div', { class: 'home-actions' },
        saved && h('button', { class: 'btn primary', onclick: () => resumeHost() }, 'Resume your table', h('small', {}, `${saved.players} players, hand ${saved.handNo}`)),
        h('button', { class: 'btn ' + (saved ? 'secondary' : 'primary'), onclick: () => setup() }, 'Host a new table', h('small', {}, 'This phone deals the game')),
        h('button', { class: 'btn secondary', onclick: () => join() }, gsaved ? 'Join or rejoin a table' : 'Join a table', h('small', {}, gsaved ? `Last time you were ${gsaved.name}` : 'Scan the host’s code'))),
      h('details', { class: 'howto' },
        h('summary', {}, 'How phones connect without WiFi'),
        h('ol', {},
          h('li', {}, 'One person turns on their phone’s hotspot. Mobile data can stay off, the hotspot still works as a local network.'),
          h('li', {}, 'Everyone else connects to that hotspot’s WiFi. It will say “no internet”, that’s fine.'),
          h('li', {}, 'The host opens a table and shows each friend a code. Friends scan it, show a reply code, and the host scans that back.'),
          h('li', {}, 'Open this page once with internet and add it to your home screen, so it opens on the train.'))));
  });
}

// ---------------- setup (host) ----------------
function lastSetup() {
  try { return JSON.parse(localStorage.getItem('tp-last-setup') || 'null'); } catch { return null; }
}

function setup(prefill) {
  const last = prefill || lastSetup() || { names: ['', ''], startStack: 1000, sb: 5, bb: 10, blindUpEvery: 0, turnTime: 0, rebuys: true };
  screen((el) => {
    el.className = 'screen setup';
    const names = last.names.length >= 2 ? last.names.slice() : ['', ''];
    const list = h('div', { class: 'name-list' });
    const renderNames = () => {
      list.replaceChildren(...names.map((n, i) => h('div', { class: 'name-row' },
        h('span', { class: 'seat-n', 'aria-hidden': 'true' }, String(i + 1)),
        h('input', { type: 'text', value: n, maxlength: 14, placeholder: i === 0 ? 'Your name' : `Player ${i + 1}`, 'aria-label': i === 0 ? 'Your name' : `Player ${i + 1} name`, autocomplete: 'off', enterkeyhint: 'next', oninput: (e) => (names[i] = e.target.value) }),
        i === 0 ? h('span', { class: 'you' }, 'This phone') : h('button', { class: 'icon-btn ghost', 'aria-label': `Remove player ${i + 1}`, onclick: () => { names.splice(i, 1); renderNames(); } }, '✕'))));
      addBtn.disabled = names.length >= 9;
    };
    const addBtn = h('button', { class: 'btn ghost small', onclick: () => { names.push(''); renderNames(); list.lastChild.querySelector('input').focus(); } }, 'Add player');

    const cfg = { startStack: last.startStack, sb: last.sb, bb: last.bb, blindUpEvery: last.blindUpEvery, turnTime: last.turnTime, rebuys: last.rebuys };
    const num = (key, label, opts = {}) => h('label', { class: 'field' }, h('span', {}, label),
      h('input', { type: 'number', inputmode: 'numeric', min: 1, value: cfg[key], oninput: (e) => { cfg[key] = Math.max(1, Math.floor(Number(e.target.value) || 0)); opts.on && opts.on(); } }));
    const seg = (key, label, options) => {
      const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
      const draw = () => wrap.replaceChildren(...options.map(([v, t]) => h('button', { role: 'radio', 'aria-checked': cfg[key] === v ? 'true' : 'false', class: cfg[key] === v ? 'on' : '', onclick: () => { cfg[key] = v; draw(); } }, t)));
      draw();
      return h('div', { class: 'field' }, h('span', {}, label), wrap);
    };
    const stackChips = h('div', { class: 'quick' }, ...[500, 1000, 2000, 5000].map((v) => h('button', { class: 'chip-btn', onclick: () => { cfg.startStack = v; stackInput.value = v; } }, fmt(v))));
    const stackField = num('startStack', 'Starting chips');
    const stackInput = stackField.querySelector('input');
    const sbField = num('sb', 'Small blind', { on: () => { cfg.bb = cfg.sb * 2; bbField.querySelector('input').value = cfg.bb; } });
    const bbField = num('bb', 'Big blind');
    const rebuy = h('label', { class: 'switch-row' }, h('span', {}, 'Allow rebuys', h('small', {}, 'Busted players can buy back in for the starting chips')),
      h('input', { type: 'checkbox', role: 'switch', checked: cfg.rebuys ? true : null, onchange: (e) => (cfg.rebuys = e.target.checked) }));

    const go = h('button', { class: 'btn primary', onclick: () => {
      const clean = names.map((n, i) => n.trim() || (i === 0 ? 'Host' : `Player ${i + 1}`));
      const seen = new Map();
      const unique = clean.map((n) => { const k = n.toLowerCase(); const c = (seen.get(k) || 0) + 1; seen.set(k, c); return c > 1 ? `${n} ${c}` : n; });
      if (unique.length < 2) return toast('Add at least two players.');
      if (cfg.bb < cfg.sb) return toast('The big blind must be at least the small blind.');
      if (cfg.startStack < cfg.bb * 2) return toast('Starting chips should be at least two big blinds.');
      localStorage.setItem('tp-last-setup', JSON.stringify({ names: clean, ...cfg }));
      if (host) host.destroy();
      Host.clearSave();
      host = Host.create(cfg, unique);
      unlockAudio();
      lobby();
    } }, 'Open the table');

    el.append(
      h('header', { class: 'page-head' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: home }, '‹'), h('h1', {}, 'New table')),
      h('section', { class: 'block' }, h('h2', {}, 'Who’s playing'), h('p', { class: 'hint' }, 'Seats go clockwise in this order. Up to nine players.'), list, addBtn),
      h('section', { class: 'block' }, h('h2', {}, 'Chips and blinds'), stackField, stackChips, h('div', { class: 'two' }, sbField, bbField),
        seg('blindUpEvery', 'Blinds go up', [[0, 'Never'], [10, 'Every 10 hands'], [20, 'Every 20']])),
      h('section', { class: 'block' }, h('h2', {}, 'Table rules'), seg('turnTime', 'Time to act', [[0, 'No limit'], [20, '20 s'], [30, '30 s'], [45, '45 s']]), rebuy),
      h('div', { class: 'sticky-go' }, go));
    renderNames();
  });
}

// ---------------- lobby (host) ----------------
function lobby() {
  screen((el) => {
    el.className = 'screen lobby';
    const list = h('div', { class: 'seat-list' });
    const start = h('button', { class: 'btn primary', onclick: () => { playTable(); host.startGame(); } });
    const render = () => {
      const s = host.e.s;
      list.replaceChildren(...s.players.map((p, i) => {
        const me = p.id === host.me;
        const status = me ? h('span', { class: 'status ok' }, 'This phone') : p.connected ? h('span', { class: 'status ok' }, 'Connected') : h('button', { class: 'btn small primary', onclick: () => pair(p.id, render) }, 'Pair phone');
        return h('div', { class: 'seat-row' + (p.connected ? ' connected' : '') },
          h('div', { class: 'reorder' },
            h('button', { class: 'icon-btn ghost', 'aria-label': `Move ${p.name} up`, disabled: i === 0 ? true : null, onclick: () => { host.movePlayer(p.id, -1); render(); } }, '↑'),
            h('button', { class: 'icon-btn ghost', 'aria-label': `Move ${p.name} down`, disabled: i === s.players.length - 1 ? true : null, onclick: () => { host.movePlayer(p.id, 1); render(); } }, '↓')),
          h('div', { class: 'who' }, h('strong', {}, p.name), h('small', {}, `Seat ${i + 1}`)),
          status);
      }));
      const ready = s.players.filter((p) => p.connected).length;
      start.textContent = ready >= 2 ? (ready === s.players.length ? 'Start the game' : `Start with ${ready} players`) : 'Pair at least one phone';
      start.disabled = ready < 2;
    };
    const unsub = host.subscribe(() => render());
    el.append(
      h('header', { class: 'page-head' }, h('button', { class: 'icon-btn', 'aria-label': 'Back to setup', onclick: () => { host.destroy(); setup(); } }, '‹'), h('h1', {}, 'Pair the phones')),
      h('p', { class: 'hint' }, 'Everyone must be on the same hotspot. For each friend: tap Pair phone, let them scan the code with Join a table, then scan the reply code on their screen.'),
      list,
      h('p', { class: 'hint small' }, 'Players you skip now can be paired later from the table menu.'),
      h('div', { class: 'sticky-go' }, start));
    render();
    return unsub;
  });
}

// Host pairing flow: show join code, then scan reply.
async function pair(pid, after) {
  const p = host.e.player(pid);
  const body = h('div', { class: 'pair' });
  let scanner = null;
  const sheet = openSheet(body, { label: `Pair ${p.name}`, onClose: () => { scanner && scanner.stop(); host.cancelPairing(); after && after(); } });
  body.append(h('h2', {}, `Pair ${p.name}`), h('p', { class: 'hint' }, 'Getting the camera ready…'));
  // camera permission first: it also lets the browser share this phone's hotspot address directly
  // keep the camera open while the code is made: browsers only share this phone's
  // hotspot address (instead of a hidden one) while camera access is active
  const warm = await warmUpCamera();
  let offer;
  try { offer = await host.pairOffer(pid); } catch (e) { body.replaceChildren(h('h2', {}, 'Could not create a code'), h('p', {}, String(e.message || e))); return; }
  finally { if (warm) warm.getTracks().forEach((t) => t.stop()); }
  const noRoute = !parsePayload(offer).cands.length;
  const step1 = () => {
    body.replaceChildren(
      noRoute && h('p', { class: 'warn' }, 'This phone has no network to share the game on. Turn WiFi on and join the hotspot (or turn on this phone’s hotspot), then try again.'),
      h('h2', {}, `${p.name}, scan this`),
      h('p', { class: 'hint' }, `On ${p.name}’s phone: Train Poker, then Join a table.`),
      h('div', { class: 'qr', html: qrSvg(offer) }),
      h('button', { class: 'btn primary', onclick: step2 }, `Next: scan ${p.name}’s reply`));
  };
  const step2 = async () => {
    const video = h('video', { class: 'cam', playsinline: true, muted: true });
    const msg = h('p', { class: 'hint' }, `Point the camera at the code on ${p.name}’s screen.`);
    body.replaceChildren(h('h2', {}, `Scan ${p.name}’s reply`), h('div', { class: 'cam-wrap' }, video, h('div', { class: 'cam-frame' })), msg,
      h('button', { class: 'btn ghost', onclick: () => { scanner && scanner.stop(); step1(); } }, 'Show the join code again'));
    scanner = new Scanner(video);
    try {
      await scanner.start(async (text) => {
        scanner.stop();
        msg.textContent = 'Connecting…';
        try {
          await host.pairAnswer(text);
          sfx.chip(3);
          body.replaceChildren(h('div', { class: 'paired' }, h('div', { class: 'tick', 'aria-hidden': 'true' }, '✓'), h('h2', {}, `${p.name} is in`)));
          setTimeout(() => sheet.close(), 900);
        } catch (e) {
          msg.textContent = e.message || 'That did not work. Try again.';
          setTimeout(step2, 1800);
        }
      });
    } catch {
      msg.textContent = 'Camera is blocked. Allow camera access for this site in your browser settings, then try again.';
    }
  };
  step1();
}

// ---------------- join (guest) ----------------
function join() {
  if (guest) guest.destroy();
  guest = new Guest();
  screen((el) => {
    el.className = 'screen join';
    let scanner = null;
    const body = h('div', { class: 'join-body' });
    el.append(h('header', { class: 'page-head' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => { guest.destroy(); guest = null; home(); } }, '‹'), h('h1', {}, 'Join a table')), body);
    const scan = async () => {
      const video = h('video', { class: 'cam', playsinline: true, muted: true });
      const msg = h('p', { class: 'hint' }, 'Scan the join code on the host’s phone. Make sure you are on the host’s hotspot.');
      body.replaceChildren(h('div', { class: 'cam-wrap' }, video, h('div', { class: 'cam-frame' })), msg);
      scanner = new Scanner(video);
      try {
        await scanner.start(async (text) => {
          try {
            const reply = await guest.answer(text); // camera still on: see note in pair()
            scanner.stop();
            unlockAudio();
            showReply(reply);
          } catch (e) { scanner.stop(); msg.textContent = e.message; setTimeout(scan, 1600); }
        });
      } catch {
        msg.textContent = 'Camera is blocked. Allow camera access for this site in your browser settings, then reopen this page.';
      }
    };
    const showReply = (reply) => {
      const noRoute = !parsePayload(reply).cands.length;
      body.replaceChildren(
        noRoute && h('p', { class: 'warn' }, 'This phone is not on any network. Join the host’s hotspot WiFi, then scan again.'),
        h('h2', {}, `You’re joining as ${guest.name}`),
        h('p', { class: 'hint' }, 'Show this to the host so they can scan it.'),
        h('div', { class: 'qr', html: qrSvg(reply) }),
        h('p', { class: 'hint small waiting-dots' }, 'Waiting for the host'),
        h('button', { class: 'btn ghost', onclick: scan }, 'Scan the join code again'));
    };
    const offStatus = guest.onStatus((s) => {
      if (s === 'connected') { sfx.chip(3); playTable(); }
    });
    scan();
    return () => { scanner && scanner.stop(); offStatus(); };
  });
}

// ---------------- table ----------------
function playTable() {
  document.body.dataset.playing = '1';
  keepAwake();
  screen((el) => {
    const isHost = !!host && !guest;
    const client = isHost ? {
      isHost: true,
      act: (a) => host.localAct(a),
      show: () => host.localShow(),
      rebuy: () => host.localRebuy(),
      sitOut: (v) => host.localSitOut(v),
      dealNow: () => { host.e.s.paused = false; host.dealNext(); },
      menu: () => hostMenu(),
    } : {
      isHost: false,
      act: (a) => guest.act(a),
      show: () => guest.show(),
      rebuy: () => guest.rebuy(),
      sitOut: (v) => guest.sitOut(v),
      dealNow: () => {},
      menu: () => guestMenu(),
    };
    table = new TableView(el, client);
    const onUpdate = (events, view) => {
      if (events.some((e) => e.t === 'ended') || view.phase === 'ended') { standings(view.standings || events.find((e) => e.t === 'ended').standings, isHost); return; }
      table.update(events, view);
    };
    let unsub, offStatus;
    if (isHost) {
      unsub = host.subscribe(onUpdate);
      table.update([{ t: 'sync' }], host.currentView());
    } else {
      unsub = guest.subscribe(onUpdate);
      if (guest.view) table.update([{ t: 'sync' }], guest.view);
      offStatus = guest.onStatus((s) => {
        if (s === 'lost') lostHost();
        if (s === 'kicked') { toast('The host removed you from the table.'); guest.destroy(); guest = null; home(); }
      });
      if (!guest.view) table.say('Connected. Waiting for the host to start.');
    }
    return () => { unsub && unsub(); offStatus && offStatus(); table && table.destroy(); table = null; };
  });
}

function lostHost() {
  const body = h('div', { class: 'lost' },
    h('h2', {}, 'Lost the host'),
    h('p', {}, 'Your phone can’t reach the host. Your seat and chips are safe on the host’s phone. Make sure you’re still on the hotspot, then ask the host to pair you again from the table menu.'),
    h('button', { class: 'btn primary', onclick: () => { s.close(); join(); } }, 'Scan a new join code'));
  const s = openSheet(body, { label: 'Connection lost' });
}

function settingsBlock(onChange) {
  const sw = (key, label, hint) => h('label', { class: 'switch-row' }, h('span', {}, label, hint ? h('small', {}, hint) : null),
    h('input', { type: 'checkbox', role: 'switch', checked: settings[key] ? true : null, onchange: (e) => { settings[key] = e.target.checked; saveSettings(); onChange && onChange(key); } }));
  return h('section', { class: 'block' }, h('h3', {}, 'This phone'),
    sw('holdToPeek', 'Hold to see my cards', 'Keeps your cards hidden from people next to you'),
    sw('fourColor', 'Four-colour deck', 'Diamonds blue, clubs green'),
    sw('sound', 'Sound'),
    sw('haptics', 'Vibration'));
}

function logBlock(view) {
  return h('details', { class: 'log' }, h('summary', {}, 'Hand history'),
    h('ol', {}, ...view.log.slice().reverse().map((l) => h('li', {}, l.text))));
}

function hostMenu() {
  const v = host.currentView();
  const body = h('div', { class: 'menu' });
  const s = openSheet(body, { label: 'Table menu', tall: true });
  const rerender = () => {
    const v2 = host.currentView();
    const S = host.e.s;
    const rows = S.players.map((p) => {
      const me = p.id === host.me;
      const inHand = S.phase === 'hand' && S.hand && S.hand.ps[p.id] && !S.hand.ps[p.id].folded;
      const btns = [];
      if (!me && !p.connected) btns.push(h('button', { class: 'btn small primary', onclick: () => { s.close(); pair(p.id); } }, 'Pair phone'));
      if (!me && p.connected) btns.push(h('button', { class: 'btn small ghost', onclick: () => { s.close(); pair(p.id); } }, 'Re-pair'));
      if (!me && !p.connected && S.hand && S.hand.toAct === p.id) btns.push(h('button', { class: 'btn small ghost', onclick: () => { host.foldFor(p.id); rerender(); } }, 'Check/fold for them'));
      btns.push(h('button', { class: 'btn small ghost', onclick: () => { host.sitOut(p.id, !p.sittingOut); rerender(); } }, p.sittingOut ? 'Sit in' : 'Sit out'));
      if (S.cfg.rebuys && p.stack < S.cfg.startStack && !inHand) btns.push(h('button', { class: 'btn small ghost', onclick: () => { host.rebuyFor(p.id); rerender(); } }, 'Rebuy'));
      if (!me) btns.push(h('button', { class: 'btn small danger', onclick: () => { if (confirm(`Remove ${p.name} from the table? Their chips leave with them.`)) { host.removePlayer(p.id); rerender(); } } }, 'Remove'));
      return h('div', { class: 'p-row' },
        h('div', { class: 'who' }, h('strong', {}, p.name), h('small', {}, `${fmt(p.stack)} chips${me ? ', this phone' : p.connected ? ', connected' : ', away'}${p.sittingOut ? ', sitting out' : ''}`)),
        h('div', { class: 'p-btns' }, btns));
    });
    const addInput = h('input', { type: 'text', placeholder: 'Name', maxlength: 14, 'aria-label': 'New player name' });
    body.replaceChildren(
      h('h2', {}, 'Table'),
      h('section', { class: 'block' },
        h('div', { class: 'menu-actions' },
          h('button', { class: 'btn ghost', disabled: v2.canUndo ? null : true, onclick: () => { host.undo(); s.close(); } }, 'Undo last action'),
          h('button', { class: 'btn ghost', onclick: () => { host.setPaused(!S.paused); rerender(); } }, S.paused ? 'Resume dealing' : 'Pause after this hand'))),
      h('section', { class: 'block' }, h('h3', {}, 'Players'), rows,
        h('div', { class: 'add-row' }, addInput, h('button', { class: 'btn small primary', onclick: () => { const n = addInput.value.trim(); if (!n) return; if (S.players.length >= 9) return toast('The table is full.'); const p = host.addPlayer(n); s.close(); pair(p.id); } }, 'Add and pair'))),
      logBlock(v2),
      settingsBlock(() => table && table.reconcile(host.currentView())),
      h('section', { class: 'block' }, h('button', { class: 'btn danger', onclick: () => { if (confirm('End the game and show the final standings?')) { s.close(); host.endGame(); } } }, 'End game')));
  };
  rerender();
  void v;
}

function guestMenu() {
  const v = guest.view;
  if (!v) return;
  const me = v.players.find((p) => p.id === v.me);
  const body = h('div', { class: 'menu' },
    h('h2', {}, 'Table'),
    h('section', { class: 'block' }, h('div', { class: 'menu-actions' },
      me && h('button', { class: 'btn ghost', onclick: () => { guest.sitOut(!me.sittingOut); s.close(); } }, me.sittingOut ? 'Sit back in' : 'Sit out from next hand'),
      me && v.cfg.rebuys && me.stack < v.cfg.startStack && h('button', { class: 'btn ghost', onclick: () => { guest.rebuy(); s.close(); } }, `Top up to ${fmt(v.cfg.startStack)}`))),
    logBlock(v),
    settingsBlock(() => table && table.reconcile(guest.view)),
    h('section', { class: 'block' }, h('button', { class: 'btn danger', onclick: () => { if (confirm('Leave the table? Your chips leave with you.')) { s.close(); guest.leave(); guest = null; home(); } } }, 'Leave table')));
  const s = openSheet(body, { label: 'Table menu', tall: true });
}

// ---------------- standings ----------------
function standings(rows, isHost) {
  delete document.body.dataset.playing;
  screen((el) => {
    el.className = 'screen standings';
    const best = rows[0];
    el.append(
      h('header', { class: 'page-head' }, h('h1', {}, 'Final standings')),
      best && h('p', { class: 'lede' }, `${best.name} finishes ${best.net >= 0 ? 'up' : 'down'} ${fmt(Math.abs(best.net))}.`),
      h('ol', { class: 'stand-list' }, ...rows.map((r) => h('li', {},
        h('div', { class: 'who' }, h('strong', {}, r.name), h('small', {}, `${r.won} pots won${r.biggest ? `, biggest ${fmt(r.biggest)}` : ''}`)),
        h('div', { class: 'nums' }, h('span', { class: 'net ' + (r.net > 0 ? 'up' : r.net < 0 ? 'down' : '') }, (r.net > 0 ? '+' : r.net < 0 ? '−' : '') + fmt(Math.abs(r.net))), h('small', {}, `${fmt(r.stack)} chips`))))),
      isHost
        ? h('div', { class: 'sticky-go' },
          h('button', { class: 'btn primary', onclick: () => { const last = lastSetup() || {}; const names = rows.map((r) => r.name); const meName = host.e.player(host.me)?.name; const ordered = meName ? [meName, ...names.filter((n) => n !== meName)] : names; host.destroy(); host = null; Host.clearSave(); setup({ ...last, names: ordered }); } }, 'New game'),
          h('button', { class: 'btn ghost', onclick: () => { host.destroy(); host = null; Host.clearSave(); home(); } }, 'Done'))
        : h('div', { class: 'sticky-go' }, h('p', { class: 'hint' }, 'The host can start a new game and pair you again.'), h('button', { class: 'btn ghost', onclick: () => { guest && guest.destroy(); guest = null; home(); } }, 'Done')));
  });
}

function resumeHost() {
  host = Host.restore();
  if (!host) return home();
  unlockAudio();
  if (host.e.s.phase === 'lobby') return lobby();
  // a hand interrupted by a reload continues where it was; pending next hand gets rescheduled
  if (host.e.s.phase === 'between') host.scheduleNext(3000);
  playTable();
  setTimeout(() => toast('Table restored. Pair the other phones again from the menu.', 4200), 600);
}

// first touch unlocks audio on iOS
document.addEventListener('pointerdown', () => unlockAudio(), { once: true });

// service worker for offline use
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// test hooks
window.__tp = { get host() { return host; }, get guest() { return guest; }, get table() { return table; } };

home();
