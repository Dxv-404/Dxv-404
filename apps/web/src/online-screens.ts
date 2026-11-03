// Online tables: a table server (Hyderabad, with Cloudflare as the backup) runs the table; phones join with
// a 4-letter code or a link. Signed-in phones sit as their account (their games go to history and the
// league); anyone else plays as a guest.
import { h, toast, ask } from './legacy/ui.js';
import type { TableSettings } from '@tp/protocol';
import { TableClient, newSeatToken, type SocketLike } from '@tp/table';
import { NetTable } from './net-table';
import { playNet, type Ui } from './offline-screens';
import { rebuyBlock, withRebuyDefaults, setupHead, setupFoot, blindsSeg } from './rebuys-setup';

/** No 0/O or 1/I: codes are read out loud and typed on phones. */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** The first letter says which server holds the table, so a code works from anywhere without a lookup. */
const ORACLE_FIRST = 'ABCDEFGHJKLM';
export const SERVERS = {
  oracle: 'wss://140-245-200-214.sslip.io',
  cloudflare: 'wss://train-poker-tables.apins-subdomain.workers.dev',
};
const httpOf = (ws: string) => ws.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
/** (tests point every table at a local server) */
const override = (): string | null => { try { return localStorage.getItem('tp-server-override'); } catch { return null; } };
export const serverFor = (code: string): string => override() ?? (ORACLE_FIRST.includes(code[0]!) ? SERVERS.oracle : SERVERS.cloudflare);

export function newCode(server: 'oracle' | 'cloudflare'): string {
  const first = server === 'oracle' ? ORACLE_FIRST : LETTERS.split('').filter((c) => !ORACLE_FIRST.includes(c)).join('');
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return first[b[0]! % first.length]! + [1, 2, 3].map((i) => LETTERS[b[i]! % LETTERS.length]).join('');
}
export const cleanCode = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 4);
const validCode = (c: string): boolean => c.length === 4 && [...c].every((ch) => LETTERS.includes(ch));

const store = {
  get<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(k) ?? 'null') as T | null; } catch { return null; } },
  set(k: string, v: unknown): void { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } },
};

/** Which server to open a new table on: Hyderabad if it answers quickly, else Cloudflare. */
export async function pickServer(): Promise<'oracle' | 'cloudflare'> {
  if (override()) return 'oracle';
  try {
    const r = await fetch(`${httpOf(SERVERS.oracle)}/health`, { signal: AbortSignal.timeout(2500), cache: 'no-store' });
    if (r.ok) return 'oracle';
  } catch { /* down or unreachable */ }
  return 'cloudflare';
}

interface Seat { id: string; name: string; token?: string; getTicket?: (fresh: boolean) => Promise<string> }
/** Who sits: the account (with a table ticket) when this phone is signed in, else a guest seat kept on this phone. */
async function mySeat(code: string, sitting = true): Promise<Seat> {
  const me = store.get<{ account: string; name: string }>('tp-me');
  if (me?.account) {
    try {
      const mod = await import('@tp/account');
      const a = new mod.Account();
      if (await a.hasLogin()) {
        await a.start(me.name);
        return { id: a.profile!.id, name: a.profile!.name, getTicket: () => a.ticket(code) };
      }
    } catch { /* offline accounts: play as a guest */ }
  }
  let id = store.get<string>('tp-guest-id');
  if (!id) { id = `g${newSeatToken().slice(0, 12)}`; store.set('tp-guest-id', id); }
  let token = store.get<string>('tp-guest-token');
  if (!token) { token = newSeatToken(); store.set('tp-guest-token', token); }
  let name = localStorage.getItem('tp-name');
  if (!name && !sitting) name = 'Watcher';
  if (!name) {
    name = (String((await ask('Your name at the table', { yes: 'Sit down', input: { placeholder: 'Your name', max: 20 } })) ?? '')).trim().slice(0, 20) || 'Player';
    try { localStorage.setItem('tp-name', name); } catch { /* blocked */ }
  }
  return { id, name, token };
}

export function onlineTable(code: string, seat: Seat, settings?: TableSettings, spectate = false): NetTable {
  return new NetTable({
    me: seat.id,
    makeClient: (cb) => new TableClient({
      url: `${serverFor(code)}/table/${code}`, table: code, player: seat.id, name: seat.name,
      ...(seat.token ? { token: seat.token } : {}), ...(seat.getTicket ? { getTicket: seat.getTicket } : {}),
      ...(settings ? { settings } : {}), ...(spectate ? { spectate: true } : {}),
      open: (u) => new WebSocket(u) as unknown as SocketLike,
      ...cb,
    }),
  });
}

export async function playOnline(ui: Ui, code: string, settings?: TableSettings, tries = 0, watch = false): Promise<void> {
  const seat = await mySeat(code, !watch);
  const net = onlineTable(code, seat, settings, watch);
  if (settings) {
    // opening a table: if the code happens to be a table that already exists, pick another code
    const off = net.subscribe((_e, v) => {
      off();
      if (v.players.some((p) => p.id !== seat.id) && tries < 3) { net.close(); void playOnline(ui, newCode(ORACLE_FIRST.includes(code[0]!) ? 'oracle' : 'cloudflare'), settings, tries + 1); }
    });
  }
  if (!watch) store.set('tp-online-last', { code, at: Date.now() });
  playNet(ui, net, { offline: false, code, onLeave: ui.home, ...(watch ? { takeSeat: () => void playOnline(ui, code) } : {}) });
}

/** "Play online": open a table or join one. */
export function onlineStart(ui: Ui): void {
  const last = store.get<{ code: string; at: number }>('tp-online-last');
  const recent = last && Date.now() - last.at < 12 * 3600_000 ? last.code : null;
  ui.screen((el) => {
    el.className = 'screen online';
    const input = h('input', { type: 'text', maxlength: 4, placeholder: 'QK7P', 'aria-label': 'Table code', autocomplete: 'off', autocapitalize: 'characters', class: 'code-input', 'data-testid': 'online-code' }) as HTMLInputElement;
    input.addEventListener('input', () => { input.value = cleanCode(input.value); });
    const join = (watch = false) => {
      const c = cleanCode(input.value);
      if (!validCode(c)) return toast('A table code is 4 letters and numbers.');
      void playOnline(ui, c, undefined, 0, watch);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    el.append(
      h('header', { class: 'page-head' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: ui.home }, '‹'), h('h1', {}, 'Play online')),
      recent && h('button', { class: 'btn primary', 'data-testid': 'online-back', onclick: () => void playOnline(ui, recent) }, `Back to table ${recent}`, h('small', {}, 'Your seat and chips are kept')),
      h('button', { class: 'btn ' + (recent ? 'secondary' : 'primary'), 'data-testid': 'online-host', onclick: () => hostOnline(ui) }, 'Open a table', h('small', {}, 'Friends join with a code or a link')),
      h('section', { class: 'block' }, h('h2', {}, 'Join a table'), h('label', { class: 'field' }, h('span', {}, 'Table code'), input),
        h('div', { class: 'two' }, h('button', { class: 'btn secondary', 'data-testid': 'online-join', onclick: () => join() }, 'Join'),
          h('button', { class: 'btn ghost', 'data-testid': 'online-watch', onclick: () => join(true) }, 'Just watch'))));
  });
}

/** "Open a table". From a crew's host sheet ("Change for tonight") it starts from the crew's rules, says when the
 *  table is open (so the crew is told), and the leader can keep tonight's rules as the crew's. */
export interface HostOpts { preset: TableSettings; opened(code: string, cfg: TableSettings, save: boolean): void; canSave: boolean; back(): void }
export function hostOnline(ui: Ui, opts?: HostOpts): void {
  const cfg: TableSettings = withRebuyDefaults(opts ? { ...opts.preset } : { ...(store.get<TableSettings>('tp-online-settings') ?? { startStack: 1000, sb: 5, bb: 10, turnTime: 20, rebuys: true }) });
  let save = false;
  ui.screen((el) => {
    el.className = 'screen setup setup3';
    const rb = rebuyBlock(cfg);
    const num = (key: 'startStack' | 'sb' | 'bb', label: string) => h('label', { class: 'field' }, h('span', {}, label),
      h('input', { type: 'number', inputmode: 'numeric', min: 1, value: cfg[key], 'data-testid': `cfg-${key}`, oninput: (e: Event) => { cfg[key] = Math.max(1, Math.floor(Number((e.target as HTMLInputElement).value) || 0)); rb.refresh(); } }));
    const seg = (key: 'turnTime' | 'maxPlayers', label: string, opts: [number, string][]) => {
      const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
      const draw = () => wrap.replaceChildren(...opts.map(([v, t]) => h('button', { role: 'radio', 'aria-checked': cfg[key] === v ? 'true' : 'false', class: cfg[key] === v ? 'on' : '', onclick: () => { cfg[key] = v; draw(); } }, t)));
      draw();
      return h('div', { class: 'field' }, h('span', {}, label), wrap);
    };
    // a table for anyone (casual), or for one of my crews: turning Casual off asks which crew, from the crews
    // I am allowed to host for (the crew's "who can host"); a crew table counts for that crew's league
    if (!opts) { cfg.casual = cfg.crew ? false : true; }
    const crewSel = opts ? (opts.canSave ? h('label', { class: 'switch-row' }, h('span', {}, 'Keep as the crew’s rules', h('small', {}, 'Off: just for tonight')),
      h('input', { type: 'checkbox', role: 'switch', 'data-testid': 'save-crew-rules', onchange: (e: Event) => { save = (e.target as HTMLInputElement).checked; } })) : null) : null;
    const pick = h('div', { class: 'crew-pick', role: 'radiogroup', 'aria-label': 'Which crew is this table for?', 'data-testid': 'crew-pick', hidden: true });
    let hostable: { id: string; name: string; members: number }[] | null = null;
    const drawPick = (): void => {
      if (cfg.casual) { pick.hidden = true; return; }
      pick.hidden = false;
      if (hostable === null) { pick.replaceChildren(h('p', { class: 'hint', role: 'status' }, 'Finding your crews…')); return; }
      if (!hostable.length) {
        pick.replaceChildren(h('p', { class: 'hint', 'data-testid': 'crew-pick-none' }, 'You can’t host for any crew yet: make a crew, or ask your crew’s leader to let you host. This table stays casual.'));
        return;
      }
      pick.replaceChildren(h('span', { class: 'pick-q' }, 'Which crew is this table for?'), ...hostable.map((c) => h('button', {
        type: 'button', role: 'radio', class: 'pick-row' + (cfg.crew === c.id ? ' on' : ''), 'aria-checked': cfg.crew === c.id ? 'true' : 'false', 'data-testid': 'crew-pick-row',
        onclick: () => { cfg.crew = c.id; drawPick(); },
      }, h('b', {}, c.name), h('small', {}, `${c.members} member${c.members === 1 ? '' : 's'} · counts for its league`))));
    };
    const loadHostable = async (): Promise<void> => {
      try {
        const { existing } = await import('./crews/data');
        const a = await existing();
        const list = a ? await a.myCrews() : [];
        // (my_crews says can_host; where it doesn't yet, the crew page does)
        const can = await Promise.all(list.map(async (c) => (c as { can_host?: boolean }).can_host ?? (a ? (await a.crewPage(c.id)).can_host : false)));
        hostable = list.filter((_c, i) => can[i]).map((c) => ({ id: c.id, name: c.name, members: c.members }));
      } catch { hostable = []; }
      if (hostable.length === 1 && !cfg.crew) cfg.crew = hostable[0]!.id;
      if (!hostable.length) {
        // nothing to host for: the table stays casual, and the switch says why
        cfg.casual = true; delete cfg.crew; casualBox.checked = true;
        pick.hidden = false;
        pick.replaceChildren(h('p', { class: 'hint', 'data-testid': 'crew-pick-none' }, 'You can’t host for any crew yet: make a crew, or ask your crew’s leader to let you host. This table stays casual.'));
        return;
      }
      drawPick();
    };
    const casualBox = h('input', { type: 'checkbox', role: 'switch', 'data-testid': 'casual', checked: cfg.casual ? true : null, onchange: (e: Event) => {
      cfg.casual = (e.target as HTMLInputElement).checked;
      if (cfg.casual) delete cfg.crew;
      drawPick();
      if (!cfg.casual && hostable === null) void loadHostable();
    } }) as HTMLInputElement;
    const casualRow = opts ? null : h('div', { class: 'casual-wrap' },
      h('label', { class: 'switch-row' }, h('span', {}, 'Casual game', h('small', {}, 'Anyone with the code; not in any crew league. Turn off to play for a crew.')), casualBox), pick);
    const go = h('button', { class: 'btn primary', 'data-testid': 'online-open', onclick: async () => {
      if ((cfg.bb ?? 10) < (cfg.sb ?? 5)) return toast('The big blind must be at least the small blind.');
      if ((cfg.startStack ?? 1000) < (cfg.bb ?? 10) * 2) return toast('Starting chips should be at least two big blinds.');
      if (!opts && !cfg.casual && !cfg.crew) { drawPick(); return toast('Pick the crew this table is for, or turn Casual back on.'); }
      rb.finish();
      if (!opts) store.set('tp-online-settings', cfg);
      (go as HTMLButtonElement).disabled = true;
      const code = newCode(await pickServer());
      opts?.opened(code, { ...cfg }, save);
      // a crew table opened from here tells the crew too (the LIVE strip and a notification), like the crew's host sheet
      if (!opts && cfg.crew && !cfg.casual) {
        const crew = cfg.crew;
        void import('./crews/data').then(async ({ existing }) => { const a = await existing(); await a?.hostCrewTable(crew, code, 'online'); }).catch(() => undefined);
      }
      void playOnline(ui, code, cfg);
    } }, 'Open the table');
    el.append(setupHead(opts ? 'Tonight’s crew table' : 'Open a table', 'Online', opts ? 'Crew table · counts for the season' : 'Online · anyone with the code', () => (opts ? opts.back() : onlineStart(ui))),
      h('section', { class: 'block s3-c1' }, h('h2', {}, 'Chips and blinds'), num('startStack', 'Starting chips'), h('div', { class: 'two' }, num('sb', 'Small blind'), num('bb', 'Big blind')),
        blindsSeg(cfg, () => rb.refresh())),
      rb.el,
      h('section', { class: 'block s3-c3' }, h('h2', {}, 'Table'), seg('maxPlayers', 'Seats', [[6, '6'], [9, '9'], [12, '12'], [15, '15']]),
        seg('turnTime', 'Time to act', [[20, '20 s'], [30, '30 s'], [45, '45 s'], [0, 'No limit']]),
        opts ? h('label', { class: 'switch-row' }, h('span', {}, 'Casual game', h('small', {}, 'In history, not in the crew league')), h('input', { type: 'checkbox', role: 'switch', checked: cfg.casual ? true : null, onchange: (e: Event) => { cfg.casual = (e.target as HTMLInputElement).checked; } })) : casualRow,
        crewSel),
      setupFoot('Friends join with the table’s code or its link', go));
  });
}

/** A shared link (#/t/CODE) opens the table. */
export function routeOnline(ui: Ui): boolean {
  const m = /^#\/(t|w)\/([A-Za-z0-9]{4})(\?watch)?$/.exec(location.hash);
  if (!m) return false;
  const code = cleanCode(m[2]!);
  history.replaceState(null, '', location.pathname);
  if (validCode(code)) void playOnline(ui, code, undefined, 0, m[1] === 'w' || !!m[3]);
  return validCode(code);
}

export const shareLink = (code: string): string => `${location.origin}${location.pathname}#/t/${code}`;
export const watchLink = (code: string): string => `${location.origin}${location.pathname}#/w/${code}`;
