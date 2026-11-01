// Screens for offline tables (see offline.ts for how they work).
import { h, toast, fmt } from './legacy/ui.js';
import { TableScreen, setTheme, currentTheme } from './table/screen';
import { THEME_KEYS, THEMES } from './table/render';
import { infoContent } from './legacy/info.js';
import type { TableSettings } from '@tp/protocol';
import {
  codeToAddress, formatCode, handOverUrl, myIdentity, rememberLastOffline, lastOffline, hostInfo, takeHandOver, carryOn,
  offlineTable, heldCheckpoint, type Me,
} from './offline';
import type { NetTable, ScreenView } from './net-table';

type Screen = (build: (el: HTMLElement) => void | (() => void)) => void;
type Sheet = (content: HTMLElement, o?: { label?: string; onClose?: () => void; tall?: boolean }) => { close(): void };
export interface Ui { screen: Screen; openSheet: Sheet; home(): void }

/** Leave for the host phone's page (tests replace this to see where it would go). */
const leaveFor = (url: string): void => { const w = window as unknown as { __tpNavigate?: (u: string) => void }; if (w.__tpNavigate) w.__tpNavigate(url); else location.href = url; };

const head = (title: string, back: () => void) => h('header', { class: 'page-head' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: back }, '‹'), h('h1', {}, title));

// ---------------- in the installed app ----------------
/** "Play offline": host with the host app, or join with the 5-digit code. */
export function offlineStart(ui: Ui): void {
  const last = lastOffline();
  ui.screen((el) => {
    el.className = 'screen offline';
    el.append(head('Play offline', ui.home),
      h('p', { class: 'hint' }, 'No internet needed. One Android phone runs the Train Poker Host app and turns on its hotspot; everyone else joins that hotspot\'s Wi-Fi.'),
      last && h('button', { class: 'btn primary', 'data-testid': 'offline-back', onclick: () => backToLast(last) }, last.role === 'host' ? 'Back to my offline table' : `Back to table ${formatCode(last.code ?? '')}`, h('small', {}, 'Your seat and chips are kept')),
      h('button', { class: 'btn ' + (last ? 'secondary' : 'primary'), 'data-testid': 'offline-host', onclick: () => hostSetup(ui) }, 'Host on this phone', h('small', {}, 'Needs the Train Poker Host app (Android)')),
      h('button', { class: 'btn secondary', 'data-testid': 'offline-join', onclick: () => joinCode(ui) }, 'Join a table', h('small', {}, 'Type the code on the host’s phone')),
      h('details', { class: 'howto' }, h('summary', {}, 'How it works'),
        h('ol', {},
          h('li', {}, 'The host turns on the phone’s hotspot (mobile data can stay off) and opens the Train Poker Host app.'),
          h('li', {}, 'Everyone else connects to that hotspot’s Wi-Fi. It may say “no internet”; that is fine.'),
          h('li', {}, 'Friends tap Join a table here and type the 5-digit code shown on the host phone. Only once a night.'),
          h('li', {}, 'Locked screens, closed browsers and walking out of range are fine: your seat and chips wait for you.'),
          h('li', {}, 'At most 10 players. The night goes to your history and league once two players confirm it online.'))));
  });
}

function backToLast(last: NonNullable<ReturnType<typeof lastOffline>>): void {
  const me: Me = { role: last.role, ...myIdentity(), ...(last.role === 'host' && last.settings ? { settings: last.settings } : {}) };
  const addr = last.role === 'host' ? '127.0.0.1' : codeToAddress(last.code ?? '');
  if (!addr) return;
  leaveFor(handOverUrl(me, addr));
}

function hostSetup(ui: Ui): void {
  const saved = (lastOffline()?.settings ?? { startStack: 1000, sb: 5, bb: 10, turnTime: 20, rebuys: true }) as TableSettings;
  const cfg: TableSettings = { ...saved };
  ui.screen((el) => {
    el.className = 'screen setup';
    const num = (key: 'startStack' | 'sb' | 'bb', label: string) => h('label', { class: 'field' }, h('span', {}, label),
      h('input', { type: 'number', inputmode: 'numeric', min: 1, value: cfg[key], 'data-testid': `cfg-${key}`, oninput: (e: Event) => { cfg[key] = Math.max(1, Math.floor(Number((e.target as HTMLInputElement).value) || 0)); } }));
    const seg = (key: 'turnTime', label: string, opts: [number, string][]) => {
      const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
      const draw = () => wrap.replaceChildren(...opts.map(([v, t]) => h('button', { role: 'radio', 'aria-checked': cfg[key] === v ? 'true' : 'false', class: cfg[key] === v ? 'on' : '', onclick: () => { cfg[key] = v; draw(); } }, t)));
      draw();
      return h('div', { class: 'field' }, h('span', {}, label), wrap);
    };
    const crews = (() => { try { return JSON.parse(localStorage.getItem('tp-crews') ?? '[]') as { id: string; name: string }[]; } catch { return []; } })();
    const crewSel = crews.length ? h('label', { class: 'field' }, h('span', {}, 'Crew'),
      h('select', { 'data-testid': 'cfg-crew', onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; if (v) cfg.crew = v; else delete cfg.crew; } },
        h('option', { value: '' }, 'No crew (friends and guests)'), ...crews.map((c) => h('option', { value: c.id, selected: cfg.crew === c.id ? true : null }, c.name)))) : null;
    const go = h('button', { class: 'btn primary', 'data-testid': 'offline-open', onclick: () => {
      if ((cfg.bb ?? 10) < (cfg.sb ?? 5)) return toast('The big blind must be at least the small blind.');
      if ((cfg.startStack ?? 1000) < (cfg.bb ?? 10) * 2) return toast('Starting chips should be at least two big blinds.');
      cfg.maxPlayers = 10;
      rememberLastOffline({ role: 'host', settings: cfg });
      leaveFor(handOverUrl({ role: 'host', ...myIdentity(), settings: cfg }));
    } }, 'Open the table');
    el.append(head('Host offline', () => offlineStart(ui)),
      h('ol', { class: 'steps' },
        h('li', {}, 'Turn on this phone’s hotspot.'),
        h('li', {}, 'Open the Train Poker Host app once, so the table is running.'),
        h('li', {}, 'Come back here and tap Open the table.')),
      h('section', { class: 'block' }, h('h2', {}, 'Chips and blinds'), num('startStack', 'Starting chips'), h('div', { class: 'two' }, num('sb', 'Small blind'), num('bb', 'Big blind'))),
      h('section', { class: 'block' }, h('h2', {}, 'Rules'), seg('turnTime', 'Time to act', [[0, 'No limit'], [20, '20 s'], [30, '30 s'], [45, '45 s']]),
        h('label', { class: 'switch-row' }, h('span', {}, 'Allow rebuys', h('small', {}, 'Busted players can buy back in')),
          h('input', { type: 'checkbox', role: 'switch', checked: cfg.rebuys ? true : null, onchange: (e: Event) => { cfg.rebuys = (e.target as HTMLInputElement).checked; } })),
        crewSel),
      h('div', { class: 'sticky-go' }, go));
  });
}

function joinCode(ui: Ui): void {
  ui.screen((el) => {
    el.className = 'screen join';
    const input = h('input', { type: 'text', inputmode: 'numeric', maxlength: 6, placeholder: '48 213', 'aria-label': 'Table code', autocomplete: 'off', class: 'code-input', 'data-testid': 'offline-code' }) as HTMLInputElement;
    const go = () => {
      const code = input.value.replace(/\D/g, '');
      const addr = codeToAddress(code);
      if (!addr) return toast('The code is the 5 numbers on the host’s phone.');
      rememberLastOffline({ role: 'guest', code });
      leaveFor(handOverUrl({ role: 'guest', ...myIdentity() }, addr));
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    el.append(head('Join offline', () => offlineStart(ui)),
      h('p', { class: 'hint' }, 'Connect to the host’s hotspot first, then type the 5-digit code shown on the host phone.'),
      h('label', { class: 'field' }, h('span', {}, 'Table code'), input),
      h('div', { class: 'sticky-go' }, h('button', { class: 'btn primary', 'data-testid': 'offline-go', onclick: go }, 'Join')));
    setTimeout(() => input.focus(), 50);
  });
}

// ---------------- on the host phone's page ----------------
/** The host app's own screen (http://127.0.0.1:8765/): the code to share, who is here, the upload. */
export function hostPhoneHome(ui: Ui): void {
  ui.screen((el) => {
    el.className = 'screen host-home';
    const code = h('div', { class: 'big-code', 'data-testid': 'host-code', 'aria-live': 'polite' }, '…');
    const people = h('ul', { class: 'member-list', 'data-testid': 'host-players' });
    const status = h('p', { class: 'hint', role: 'status' });
    el.append(h('header', { class: 'page-head' }, h('h1', {}, 'Train Poker Host')),
      h('section', { class: 'block' }, h('h2', {}, 'Table code'), code, h('p', { class: 'hint small' }, 'Friends join this phone’s hotspot, open Train Poker, tap Play offline, then Join a table and type this code.')),
      h('section', { class: 'block' }, h('h2', {}, 'At the table'), people, status),
      h('section', { class: 'block' }, h('h2', {}, 'Play'),
        h('p', { class: 'hint' }, 'You play in your browser like everyone else: open Train Poker, tap Play offline, then Host on this phone.'),
        h('button', { class: 'btn ghost', 'data-testid': 'host-reset', onclick: async () => {
          if (!confirm('Close this table and start a new one? The night so far is kept for upload.')) return;
          await fetch('/reset', { method: 'POST' }); toast('Ready for a new table');
        } }, 'Start a new table')));
    let stop = false;
    const poll = async () => {
      if (stop) return;
      try {
        const i = await hostInfo();
        code.textContent = i.code ? formatCode(i.code) : 'Turn on the hotspot';
        const players = i.table.players ?? [];
        people.replaceChildren(...players.map((p) => h('li', {}, h('div', { class: 'who' }, h('strong', {}, p.name), h('small', {}, `${fmt(p.stack)} chips · ${p.connected ? 'here' : 'away'}`)))));
        const eng = i.engine;
        status.textContent = [
          players.length ? `${players.length} of 10 seats · hand ${i.table.handNo ?? 0}` : 'Nobody has joined yet.',
          i.outbox ? `${i.outbox} records waiting to upload (${i.upload ?? 'when online'})` : 'Nothing waiting to upload.',
          eng && !eng.pending ? (eng.conserved && eng.proofs && eng.sha ? `Rules engine checked (${eng.hands} hands).` : 'Rules engine check FAILED: do not play on this phone.') : '',
        ].filter(Boolean).join(' ');
      } catch { status.textContent = 'The table server is starting…'; }
      setTimeout(poll, 2000);
    };
    void poll();
    return () => { stop = true; };
  });
}

/** The table page every phone (the host's included) plays on, served by the host phone. */
export async function hostPhoneTable(ui: Ui): Promise<void> {
  const me = takeHandOver();
  if (!me) { hostPhoneHome(ui); return; }
  if (me.continueFrom) {
    try { await carryOn(me); toast('You are carrying the table on. Share the new code.'); }
    catch (e) { toast((e as Error).message); }
  }
  const net = offlineTable(me);
  playNet(ui, net, { offline: true, me });
}

// ---------------- the table screen for network tables ----------------
export function playNet(ui: Ui, net: NetTable, o: { offline: boolean; me?: Me; code?: string; onLeave?: () => void }): void {
  document.body.dataset.playing = '1';
  ui.screen((el) => {
    let lostSince: number | null = null;
    let sheetOpen: { close(): void } | null = null;
    const table = new TableScreen(el, net, {
      code: o.code ?? (o.offline ? 'OFFLINE' : ''),
      menu: () => tableMenu(ui, net, o),
      info: () => ui.openSheet(infoContent(), { label: 'Poker hands', tall: true }),
      offline: o.offline,
    });
    let ended = false;
    const offView = net.subscribe((_events, v) => { if (v.phase === 'ended' && !ended) { ended = true; standings(ui, v, o); } });
    const offErr = net.onError((code, m) => {
      // the table will not take this phone: say why and offer the way out (instead of "Connecting…" for ever)
      if (code === 'table_full' || code === 'not_allowed' || code === 'version' || code === 'replaced') {
        const box = h('div', { class: 'tp-fatal', role: 'alert' }, h('p', {}, m),
          h('button', { class: 'btn primary', onclick: () => (o.onLeave ? o.onLeave() : ui.home()) }, code === 'version' ? 'Reload' : 'Back'));
        if (code === 'version') box.querySelector('button')!.addEventListener('click', () => location.reload());
        el.querySelector('.tp-over')?.append(box);
      } else if (code === 'no_table') table.say(m);
      else if (code === 'refused') toast(m);
    });
    const offNotice = net.onNotice((t) => toast(t, 6000));
    const offStatus = net.onStatus((s) => {
      table.setConnection(s === 'live' ? 'good' : s === 'connecting' ? 'weak' : 'lost');
      if (s === 'live') { lostSince = null; sheetOpen?.close(); sheetOpen = null; return; }
      lostSince ??= Date.now();
    });
    // the host phone (or server) has been out of reach for a while: say what to do
    const watch = setInterval(() => {
      if (!o.offline || lostSince === null || sheetOpen || Date.now() - lostSince < 15_000) return;
      sheetOpen = lostHost(ui, o.me!, () => { sheetOpen = null; });
    }, 1000);
    return () => { clearInterval(watch); offView(); offErr(); offNotice(); offStatus(); table.destroy(); net.close(); delete document.body.dataset.playing; };
  });
}

function lostHost(ui: Ui, me: Me, closed: () => void): { close(): void } {
  const cp = heldCheckpoint();
  const input = h('input', { type: 'text', inputmode: 'numeric', maxlength: 6, placeholder: '48 213', 'aria-label': 'New table code', class: 'code-input', 'data-testid': 'lost-code' }) as HTMLInputElement;
  const body = h('div', { class: 'lost' },
    h('h2', {}, 'Can’t reach the host phone'),
    h('p', {}, 'Still trying. Your seat and chips are kept on the host phone. Check you are on the host’s hotspot.'),
    h('h3', {}, 'The host phone is gone?'),
    h('p', { class: 'hint' }, 'Any Android phone with the Train Poker Host app can carry the night on: turn on its hotspot, open the host app, then tap Carry on with this phone on that phone. Everyone else types its new code here. The hand that was cut off is cancelled; stacks go back to before it.'),
    cp && h('button', { class: 'btn primary', 'data-testid': 'carry-on', onclick: () => {
      leaveFor(`http://127.0.0.1:8765/join#${btoa(unescape(encodeURIComponent(JSON.stringify({ ...me, role: 'host', continueFrom: cp.data })))).replace(/=+$/, '')}`);
    } }, 'Carry on with this phone', h('small', {}, `From hand ${cp.handNo}`)),
    h('label', { class: 'field' }, h('span', {}, 'New table code'), input),
    h('button', { class: 'btn secondary', onclick: () => {
      const addr = codeToAddress(input.value);
      if (!addr) return toast('The code is 5 numbers.');
      leaveFor(`http://${addr}:8765/join#${btoa(unescape(encodeURIComponent(JSON.stringify({ ...me, role: 'guest' })))).replace(/=+$/, '')}`);
    } }, 'Join the new code'));
  void ui;
  return ui.openSheet(body, { label: 'Lost the host', onClose: closed });
}

function tableMenu(ui: Ui, net: NetTable, o: { offline: boolean; code?: string; onLeave?: () => void }): void {
  const v = net.view;
  if (!v) return;
  const meP = v.players.find((p) => p.id === v.me);
  const S = v as ScreenView;
  const body = h('div', { class: 'menu' }, h('h2', {}, 'Table'));
  const sheet = ui.openSheet(body, { label: 'Table menu', tall: true });
  const close = () => sheet.close();
  if (S.isHost) {
    body.append(h('section', { class: 'block' }, h('div', { class: 'menu-actions' },
      h('button', { class: 'btn ghost', onclick: () => { net.host(v.paused ? 'resume' : 'pause'); close(); } }, v.paused ? 'Resume dealing' : 'Pause after this hand'),
      v.canUndo && h('button', { class: 'btn ghost', onclick: () => { net.host('undo'); close(); } }, 'Undo last action'))),
    h('section', { class: 'block' }, h('h3', {}, 'Players'), ...v.players.filter((p) => p.id !== v.me).map((p) => h('div', { class: 'p-row' },
      h('div', { class: 'who' }, h('strong', {}, p.name), h('small', {}, `${fmt(p.stack)} chips${p.connected ? '' : ', away'}${p.sittingOut ? ', sitting out' : ''}`)),
      h('div', { class: 'p-btns' }, h('button', { class: 'btn small danger', onclick: () => { if (confirm(`Remove ${p.name}? Their chips leave with them.`)) { net.host('remove', { pid: p.id }); close(); } } }, 'Remove'))))));
  }
  if (!o.offline && 'code' in o && o.code) {
    const link = `${location.origin}${location.pathname}#/t/${o.code}`;
    body.append(h('section', { class: 'block' }, h('h3', {}, `Table ${o.code}`),
      h('p', { class: 'invite-link', 'data-testid': 'table-link' }, link),
      h('div', { class: 'two' },
        h('button', { class: 'btn ghost small', onclick: () => navigator.clipboard?.writeText(link).then(() => toast('Link copied'), () => toast('Select the link and copy it')) }, 'Copy link'),
        h('a', { class: 'btn ghost small', href: `https://wa.me/?text=${encodeURIComponent(`Poker table ${o.code}: ${link}`)}`, target: '_blank', rel: 'noopener' }, 'Send on WhatsApp'))));
  }
  const themeRow = h('div', { class: 'theme-grid', role: 'radiogroup', 'aria-label': 'Table theme' }, ...THEME_KEYS.map((k) => h('button', {
    role: 'radio', 'aria-checked': currentTheme() === k ? 'true' : 'false', class: 'theme-pick' + (currentTheme() === k ? ' on' : ''), 'data-theme': k,
    onclick: () => { setTheme(k); close(); },
  }, THEMES[k]!.name)));
  body.append(h('section', { class: 'block' }, h('h3', {}, 'Theme'), themeRow));
  body.append(h('section', { class: 'block' }, h('div', { class: 'menu-actions' },
    meP && h('button', { class: 'btn ghost', onclick: () => { net.sitOut(!meP.sittingOut); close(); } }, meP.sittingOut ? 'Sit back in' : 'Sit out from next hand'),
    meP && v.cfg.rebuys && meP.stack < v.cfg.startStack && v.phase !== 'hand' && h('button', { class: 'btn ghost', onclick: () => { net.rebuy(); close(); } }, `Top up to ${fmt(v.cfg.startStack)}`))),
  S.isHost && h('section', { class: 'block' }, h('button', { class: 'btn danger', 'data-testid': 'end-game', onclick: () => { if (confirm('End the game and show the final standings?')) { net.host('end'); close(); } } }, 'End game')));
  void o;
}

function standings(ui: Ui, v: ScreenView, o: { offline: boolean; onLeave?: () => void }): void {
  delete document.body.dataset.playing;
  const rows = v.standings ?? [];
  ui.screen((el) => {
    el.className = 'screen standings';
    el.append(h('header', { class: 'page-head' }, h('h1', {}, 'Final standings')),
      h('ol', { class: 'stand-list', 'data-testid': 'standings' }, ...rows.map((r) => h('li', {},
        h('div', { class: 'who' }, h('strong', {}, r.name)),
        h('div', { class: 'nums' }, h('span', { class: 'net ' + (r.net > 0 ? 'up' : r.net < 0 ? 'down' : '') }, (r.net > 0 ? '+' : r.net < 0 ? '−' : '') + fmt(Math.abs(r.net))), h('small', {}, `${fmt(r.stack)} chips`))))),
      o.offline
        ? h('p', { class: 'hint' }, 'The host phone uploads the night when it has internet. It counts for history and the league once two of you confirm it in the app (Profile).')
        : h('p', { class: 'hint' }, 'The night is in your history and your crew’s league.'),
      h('div', { class: 'sticky-go' }, h('button', { class: 'btn ghost', onclick: () => { if (o.onLeave) o.onLeave(); else ui.home(); } }, 'Done')));
  });
}
