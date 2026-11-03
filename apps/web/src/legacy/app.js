import { h, $, fmt, toast, sleep, ask } from './ui.js';
import { Host } from './host.js';
import { Guest } from './guest.js';
import { qrSvg, Scanner } from './qr.js';
import { infoContent } from './info.js';
import { settings, saveSettings, unlockAudio, keepAwake, sfx } from './fx.js';
import { warmUpCamera, parsePayload } from './net.js';
import { accountScreens } from './account-ui.js';
import { offlineStart, joinCode, hostPhoneHome, hostPhoneTable } from '../offline-screens.ts';
import { onHostPhonePage } from '../offline.ts';
import { onlineStart, routeOnline, playOnline, hostOnline } from '../online-screens.ts';
import { initShell, loadingScreen, menuScreen, pickerScreen, leaveMenu, navBar } from '../ui/shell.ts';
import { setTheme, currentTheme, TableScreen } from '../table/screen.ts';
import { settingsScreen, installErrorReporting, noteScreen } from '../more-screens.ts';
import { rebuyBlock, withRebuyDefaults, setupHead, setupFoot, blindsSeg, rulesContent, rebuysUsedText } from '../rebuys-setup.ts';
import { crewsUi } from '../crews/screens.ts';
import { newCode, pickServer, playOnline as openOnline, hostOnline as openTableScreen } from '../online-screens.ts';
import { joinCode as offlineJoin } from '../offline-screens.ts';

// every screen sits inside the player's theme (its background, tokens and art); screens go in #view
const appRoot = $('#app');
const app = initShell(appRoot);
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
  appRoot.append(wrap);
  requestAnimationFrame(() => { sheet.classList.add('open'); scrim.classList.add('open'); });
  document.addEventListener('keydown', onKey);
  // swipe down to close
  let y0 = null;
  sheet.addEventListener('touchstart', (e) => { if (sheet.querySelector('.sheet-body').scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sheet.addEventListener('touchend', (e) => { if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; sheet.style.transform = ''; y0 = null; if (dy > 110) close(); });
  return { close, sheet };
}

const ui = { screen, openSheet, home: () => home(), qrJoin: () => join() };
// the Crews tab and the crew page (v3)
const crews = crewsUi({
  screen, openSheet, nav: () => menuActions(), play: () => home(),
  openGame: (id, back) => accounts.game(id, back),
  openTable: async (cfg) => { const code = newCode(await pickServer()); void openOnline(ui, code, cfg); return code; },
  joinTable: (code) => void openOnline(ui, code),
  changeForTonight: (preset, opened, canSave) => openTableScreen(ui, { preset, opened, canSave, back: () => crews.tab() }),
  hostOffline: () => offlineStart(ui),
  hostQr: () => setup(),
  joinOffline: () => offlineJoin(ui),
});
const accounts = accountScreens({ screen, openSheet, home: () => home(), nav: () => navBar('play', menuActions()), crews });
window.addEventListener('hashchange', () => { if (!routeOnline(ui) && !crews.route()) accounts.route(); });

// (the old floating info button: the table and Settings have their own way to the hand rankings)
$('#info-btn')?.remove();
export const showHands = () => openSheet(infoContent(), { label: 'Poker hands', tall: true });
window.__tpHands = showHands;
window.__tpPicker = () => themePicker();

function screen(build) {
  if (current) { try { current(); } catch {} current = null; }
  leaveMenu();
  app.replaceChildren();
  const el = h('main', { class: 'screen' });
  app.append(el);
  const cleanup = build(el);
  noteScreen(el.className.replace(/^screen\s*/, '') || 'screen');
  current = typeof cleanup === 'function' ? cleanup : null;
  window.scrollTo(0, 0);
}

// ---------------- home: the theme's main menu ----------------
function menuActions() {
  const saved = Host.savedSummary();
  return {
    ...(saved ? { resumeHost: { sub: `QR table · ${saved.players} players, hand ${saved.handNo}`, go: () => resumeHost() } } : {}),
    joinOnline: (code) => playOnline(ui, code),
    joinOffline: () => joinCode(ui),
    host: () => hostChoice(),
    profile: () => accounts.profile(),
    settings: () => settingsScreen(ui),
    crew: (id) => crews.open(id),
    rejoin: (code) => playOnline(ui, code),
    crews: () => crews.tab(),
    play: () => home(),
    replays: () => accounts.history(),
    theme: () => themePicker(),
  };
}

function home() {
  delete document.body.dataset.playing;
  screen((el) => menuScreen(el, menuActions()));
  void accounts.notices(); // a sign-in on another device: "Not me? Log it out"
}

function themePicker() {
  screen((el) => {
    pickerScreen(el, () => home(), menuActions());
    return () => setTheme(currentTheme()); // leaving without Use puts your own theme back
  });
}

/** Host a new table: online (a table server) or offline (the host app on a hotspot). */
function hostChoice() {
  const s = openSheet(h('div', { class: 'menu-actions' },
    h('h2', {}, 'Host a new table'),
    h('button', { class: 'btn primary', 'data-testid': 'online-host', onclick: () => { s.close(); hostOnline(ui); } }, 'Online', h('small', {}, 'Friends join with a code or a link, from anywhere')),
    h('button', { class: 'btn secondary', 'data-testid': 'offline-host', onclick: () => { s.close(); offlineStart(ui); } }, 'Offline', h('small', {}, 'No internet: the host app runs the table on your hotspot')),
    h('button', { class: 'btn ghost', 'data-testid': 'qr-host', onclick: () => { s.close(); setup(); } }, 'Pair phones by QR', h('small', {}, 'No internet and no host app: each phone scans this one'))), { label: 'Host a new table' });
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

    const cfg = withRebuyDefaults({ startStack: last.startStack, sb: last.sb, bb: last.bb, blindUpEvery: last.blindUpEvery, turnTime: last.turnTime, rebuys: last.rebuys, maxRebuys: last.maxRebuys, rebuyAmount: last.rebuyAmount, rebuyUntilLevel: last.rebuyUntilLevel });
    const rb = rebuyBlock(cfg);
    const num = (key, label, opts = {}) => h('label', { class: 'field' }, h('span', {}, label),
      h('input', { type: 'number', inputmode: 'numeric', min: 1, value: cfg[key], 'data-testid': `cfg-${key}`, oninput: (e) => { cfg[key] = Math.max(1, Math.floor(Number(e.target.value) || 0)); opts.on && opts.on(); rb.refresh(); } }));
    const seg = (key, label, options) => {
      const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
      const draw = () => wrap.replaceChildren(...options.map(([v, t]) => h('button', { type: 'button', role: 'radio', 'aria-checked': cfg[key] === v ? 'true' : 'false', class: cfg[key] === v ? 'on' : '', onclick: () => { cfg[key] = v; draw(); rb.refresh(); } }, t)));
      draw();
      return h('div', { class: 'field' }, h('span', {}, label), wrap);
    };
    const stackChips = h('div', { class: 'quick' }, ...[500, 1000, 2000, 5000].map((v) => h('button', { class: 'chip-btn', onclick: () => { cfg.startStack = v; stackInput.value = v; } }, fmt(v))));
    const stackField = num('startStack', 'Starting chips');
    const stackInput = stackField.querySelector('input');
    const sbField = num('sb', 'Small blind', { on: () => { cfg.bb = cfg.sb * 2; bbField.querySelector('input').value = cfg.bb; } });
    const bbField = num('bb', 'Big blind');

    const go = h('button', { class: 'btn primary', onclick: () => {
      const clean = names.map((n, i) => n.trim() || (i === 0 ? 'Host' : `Player ${i + 1}`));
      const seen = new Map();
      const unique = clean.map((n) => { const k = n.toLowerCase(); const c = (seen.get(k) || 0) + 1; seen.set(k, c); return c > 1 ? `${n} ${c}` : n; });
      if (unique.length < 2) return toast('Add at least two players.');
      if (cfg.bb < cfg.sb) return toast('The big blind must be at least the small blind.');
      if (cfg.startStack < cfg.bb * 2) return toast('Starting chips should be at least two big blinds.');
      rb.finish();
      localStorage.setItem('tp-last-setup', JSON.stringify({ names: clean, ...cfg }));
      if (host) host.destroy();
      Host.clearSave();
      host = Host.create(cfg, unique);
      unlockAudio();
      lobby();
    } }, 'Open the table');

    el.className = 'screen setup setup3';
    el.append(
      setupHead('New table', 'Pair by QR', 'Pair phones by QR · no internet', home),
      h('section', { class: 'block s3-c1' }, h('h2', {}, 'Chips and blinds'), stackField, stackChips, h('div', { class: 'two' }, sbField, bbField),
        blindsSeg(cfg, () => rb.refresh())),
      rb.el,
      h('section', { class: 'block s3-c3' }, h('h2', {}, 'Table'), h('h3', {}, 'Who’s playing'), h('p', { class: 'hint' }, 'Seats go clockwise in this order. Up to nine players.'), list, addBtn,
        seg('turnTime', 'Time to act', [[0, 'No limit'], [20, '20 s'], [30, '30 s'], [45, '45 s']])),
      setupFoot('Each phone scans this one to join', go));
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
      h('p', { class: 'hint small' }, 'Players you skip now can be paired later from the table menu. Keep this phone on the game screen: it runs the table. Other phones can lock for a while and catch up when unlocked.'),
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
      noRoute ? h('p', { class: 'warn' }, 'This phone has no network to share the game on. Turn WiFi on and join the hotspot (or turn on this phone’s hotspot), then try again.') : '',
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
        noRoute ? h('p', { class: 'warn' }, 'This phone is not on any network. Join the host’s hotspot WiFi, then scan again.') : '',
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
    // the QR mode's host and guests drive the same designed table as online and offline tables
    const src = isHost ? host : guest;
    const like = {
      get view() { return isHost ? host.currentView() : guest.view; },
      subscribe: (fn) => src.subscribe(fn),
      act: (a) => (isHost ? host.localAct(a) : guest.act(a)),
      show: () => (isHost ? host.localShow() : guest.show()),
      rebuy: () => (isHost ? host.localRebuy() : guest.rebuy()),
      sitOut: (v) => (isHost ? host.localSitOut(v) : guest.sitOut(v)),
      dealNow: () => { if (isHost) { host.e.s.paused = false; host.dealNext(); } },
      vote: () => {},
    };
    table = new TableScreen(el, like, { code: 'QR', menu: () => (isHost ? hostMenu() : guestMenu()), info: () => showHands(), offline: true,
      leave: isHost ? null : async () => { if (await ask('Leave the table? Your chips leave with you.', { yes: 'Leave' })) { guest.leave(); guest = null; home(); } } });
    let done = false;
    const unsub = src.subscribe((events, view) => {
      if (done) return;
      if (events.some((e) => e.t === 'ended') || view.phase === 'ended') { done = true; standings(view.standings || events.find((e) => e.t === 'ended').standings, isHost); }
    });
    let offStatus;
    if (!isHost) {
      offStatus = guest.onStatus((s) => {
        if (s === 'lost') lostHost();
        if (table) table.setConnection(s === 'quiet' ? 'weak' : s === 'lost' ? 'lost' : 'good');
        if (s === 'kicked') { toast('The host removed you from the table.'); guest.destroy(); guest = null; home(); }
      });
      if (!guest.view) table.say('Connected. Waiting for the host to start.');
    }
    return () => { unsub && unsub(); offStatus && offStatus(); table && table.destroy(); table = null; delete document.body.dataset.playing; };
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
      if (host.e.viewFor(p.id).rebuy.can && !inHand) btns.push(h('button', { class: 'btn small ghost', onclick: () => { host.rebuyFor(p.id); rerender(); } }, 'Rebuy'));
      if (!me) btns.push(h('button', { class: 'btn small danger', onclick: async () => { if (await ask(`Remove ${p.name} from the table? Their chips leave with them.`, { yes: 'Remove', danger: true })) { host.removePlayer(p.id); rerender(); } } }, 'Remove'));
      return h('div', { class: 'p-row' },
        h('div', { class: 'who' }, h('strong', {}, p.name), h('small', { 'data-testid': 'p-row-sub' }, `${fmt(p.stack)} chips${rebuysUsedText(p.rebuysUsed)}${me ? ', this phone' : p.connected ? ', connected' : ', away'}${p.sittingOut ? ', sitting out' : ''}`)),
        h('div', { class: 'p-btns' }, btns));
    });
    const addInput = h('input', { type: 'text', placeholder: 'Name', maxlength: 14, 'aria-label': 'New player name' });
    body.replaceChildren(
      h('h2', {}, 'Table'),
      h('section', { class: 'block' },
        h('div', { class: 'menu-actions' },
          h('button', { class: 'btn ghost', disabled: v2.canUndo ? null : true, onclick: () => { host.undo(); s.close(); } }, 'Undo last action'),
          h('button', { class: 'btn ghost', onclick: () => { host.setPaused(!S.paused); rerender(); } }, S.paused ? 'Resume dealing' : 'Pause after this hand'),
          h('button', { class: 'btn ghost', 'data-testid': 'open-rules', onclick: () => { s.close(); const r = openSheet(rulesContent(host.currentView(), () => r.close()), { label: 'Table rules' }); } }, 'Table rules'))),
      h('section', { class: 'block' }, h('h3', {}, 'Players'), rows,
        h('div', { class: 'add-row' }, addInput, h('button', { class: 'btn small primary', onclick: () => { const n = addInput.value.trim(); if (!n) return; if (S.players.length >= 9) return toast('The table is full.'); const p = host.addPlayer(n); s.close(); pair(p.id); } }, 'Add and pair'))),
      logBlock(v2),
      settingsBlock(() => {}),
      h('section', { class: 'block' }, h('button', { class: 'btn danger', onclick: async () => { if (await ask('End the game and show the final standings?', { yes: 'End game', danger: true })) { s.close(); host.endGame(); } } }, 'End game')));
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
      h('button', { class: 'btn ghost', 'data-testid': 'open-rules', onclick: () => { s.close(); const r = openSheet(rulesContent(guest.view, () => r.close()), { label: 'Table rules' }); } }, 'Table rules'),
      me && v.rebuy && v.rebuy.can && h('button', { class: 'btn ghost', onclick: () => { guest.rebuy(); s.close(); } }, `Rebuy ${fmt(v.rebuy.amount)}`))),
    logBlock(v),
    settingsBlock(() => {}),
    h('section', { class: 'block' }, h('button', { class: 'btn danger', onclick: async () => { if (await ask('Leave the table? Your chips leave with you.', { yes: 'Leave', danger: true })) { s.close(); guest.leave(); guest = null; home(); } } }, 'Leave table')));
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
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // look for a new version whenever the app comes back to the front
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  // A new version took over (the old one served this page from its cache): load it now, or, mid-game, as soon as
  // the table is left, so an update never needs two reloads and never interrupts a hand.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    const go = () => { if (reloading) return; if (document.body.dataset.playing) { setTimeout(go, 5000); return; } reloading = true; location.reload(); };
    go();
  });
}

// test hooks
window.__tp = { get host() { return host; }, get guest() { return guest; }, get table() { return table; } };

// on the host phone's own page (http://<hotspot>:8765): the offline table, or the host app's screen
if (onHostPhonePage()) {
  if (location.pathname === '/join') hostPhoneTable(ui); else hostPhoneHome(ui);
} else loadingScreen(() => { if (!routeOnline(ui) && !crews.route() && !accounts.route()) home(); });
installErrorReporting();
