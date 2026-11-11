// The Crews tab and the crew page, built from the v3 design (tools/design/gen/v3crews.py, v3crew.py, v3sizes.py):
// the tab for a new player, your crews and invitations, making a crew, joining one with a code / link / QR, the
// invitation and the wait, and a crew's Home, League, Games and Members, a player's card, inviting, settings and
// hosting. One layout per screen size: phones (one column, the bottom bar pinned), sideways phones (an icon rail),
// tablets (two panes over the bar), laptops (a rail with the logo, the crews column, the crew) and desktops (and
// a members column).
import { bellButton } from '../bell';
import type { Account, Badge, CrewCard, CrewGame, CrewLeague, CrewMemberV3, CrewPage, CrewPreview, Invitation, JoinRequest, LeagueRowV3, PendingRequest, PlayerCard, Scoring, SeasonLength, TableRules, WhoHosts } from '@tp/account';
import { cleanCrewCode, crewLink, formatCrewCode, isCrewCode, parseCrewLink, restSeconds, seasonLabel, seasonLengthArgs, seasonLengthOf } from '@tp/account/crews';
import { evalBest, parseCard, cardStr } from '@tp/engine';
import type { TableSettings } from '@tp/protocol';
import { navBar, railBar, type MenuActions } from '../ui/shell';
import { currentTheme } from '../table/screen';
import { ask, toast } from '../legacy/ui.js';
import { qrSvg, Scanner } from '../legacy/qr.js';
import { enablePush, pushSupported } from '../more-screens';
import { mountPushPrompt } from './push-prompt';
import { BADGES, COLORS, COLOR_NAMES, ICON, applyFeel, ago, av, bbText, cardImg, clock, cwToast, dayMonth, duration, el, emblem, endsIn, esc, fmtN, ic, level, monthDay, monthName, ms, ordinal, spark, stack, upDown, usualText, weekGroup } from './kit';
import { DEFAULT_RULES, rulesText, sizeOf, type Size } from './format';
export { rulesText, sizeOf };
import { cachedLists, ensure, existing, fetchLists, forget, type Lists } from './data';
import { R } from '../research/capture';

type Sheet = { close(): void; sheet: HTMLElement };
export interface CrewsDeps {
  screen(build: (el: HTMLElement) => void | (() => void)): void;
  openSheet(content: HTMLElement, o?: { label?: string; onClose?: () => void; tall?: boolean }): Sheet;
  nav(): MenuActions;
  /** the Play tab (the main menu) */
  play(): void;
  /** the existing game page (results, hands, replays; corrections for admins) */
  openGame(id: string, back: () => void): void;
  /** an online table: open one with these settings (a new code), or join one */
  openTable(cfg: TableSettings): Promise<string>;
  joinTable(code: string): void;
  /** "Change for tonight": the Open a table screen with the crew's rules filled in */
  changeForTonight(preset: TableSettings, opened: (code: string, cfg: TableSettings, save: boolean) => void, canSave: boolean): void;
  hostOffline(): void;
  hostQr(): void;
  joinOffline(): void;
}

type Tab = 'home' | 'overview' | 'league' | 'games' | 'members' | 'trophies';
type View =
  | { k: 'list'; tab?: 'mine' | 'invites' }
  | { k: 'crew'; id: string; tab: Tab }
  | { k: 'create' }
  | { k: 'made'; id: string; name: string; color: string; badge: Badge; code: string; autoAdmit: boolean }
  | { k: 'join'; code?: string }
  | { k: 'preview'; p: CrewPreview; from: string | null }
  | { k: 'waiting'; crewId: string }
  | { k: 'settings'; id: string }
  | { k: 'player'; crewId: string; accountId: string };
const FLOWS = new Set<View['k']>(['create', 'made', 'join', 'preview', 'waiting', 'settings']);

const HAND_NAMES = ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush', 'Royal flush'];
const TROPHY: Record<string, [string, string]> = {
  season_winner: ['🏆', 'Season'], iron_chair: ['🪑', 'Iron chair'], royal_flush: ['👑', 'Royal flush'],
  straight_flush: ['🌈', 'Straight flush'], four_of_a_kind: ['🃏', 'Four of a kind'], comeback: ['🔥', 'Comeback'],
};
const ROLE_NAME = { owner: 'leader', admin: 'admin', member: 'member' } as const;
const roleChip = (r: string): string => (r === 'owner' ? '<span class="chipt a">Leader</span>' : r === 'admin' ? '<span class="chipt o">Admin</span>' : '');
export function crewsUi(deps: CrewsDeps) {
  let views: View[] = [{ k: 'list' }];
  let root: HTMLElement | null = null;
  let size: Size = 'phone';
  let selected: string | null = null; // the crew shown next to the list on big screens
  let listTab: 'mine' | 'invites' = 'mine';
  let token = 0;
  const pages = new Map<string, CrewPage>();
  let stopPoll: (() => void) | null = null;
  let shown: View | null = null; // the view last painted: a new one opens at the top
  let pushFor: string | null = null; // the crew just joined or made: its page offers to turn notifications on

  const top = (): View => views[views.length - 1]!;
  const wide = (): boolean => size !== 'phone';
  const go = (v: View): void => { views.push(v); paint(); };
  const replace = (v: View): void => { views[views.length - 1] = v; paint(); };
  const back = (): void => { if (views.length > 1) views.pop(); else views = [{ k: 'list' }]; paint(); };
  const home = (): void => { views = [{ k: 'list' }]; paint(); };

  // ---------------------------------------------------------------- entering
  function enter(v?: View, keep = false): void {
    if (!keep) { views = [{ k: 'list' }]; if (v) views.push(v); }
    deps.screen((main) => {
      main.className = 'screen cw-screen with-nav';
      root = main;
      size = sizeOf(innerWidth, innerHeight);
      const onResize = (): void => { const s = sizeOf(innerWidth, innerHeight); if (s !== size) { size = s; paint(); } };
      addEventListener('resize', onResize);
      const onTheme = (): void => paint();
      addEventListener('tp-theme', onTheme);
      paint();
      return () => { removeEventListener('resize', onResize); removeEventListener('tp-theme', onTheme); stopPoll?.(); stopPoll = null; root = null; };
    });
  }

  // ---------------------------------------------------------------- the layout
  let listOnScreen: string | null = null;
  let selTab: Tab | null = null; // the tab of the crew the list opened by itself (big screens)
  function paint(): void {
    if (!root) return;
    stopPoll?.(); stopPoll = null;
    const my = ++token;
    const v = top();
    const lay = el('div', `cw cw-lay s-${size}`);
    lay.dataset.size = size;
    applyFeel(lay);
    const rail = size === 'side' || size === 'lap' || size === 'desk';
    if (rail) lay.append(railEl(size !== 'side'));
    const showList = wide() || v.k === 'list';
    const listCol = el('section', 'cw-col clist' + (size === 'side' ? ' slim' : ''));
    listCol.setAttribute('aria-label', 'Your crews');
    const pane = el('section', 'cw-col cmain');
    pane.setAttribute('aria-live', 'polite');
    // the list column is already on screen (a tab or crew changed beside it): it is redrawn without its arrival
    // animations, so the crew cards stay still instead of sliding in again
    if (showList && listOnScreen === size) listCol.classList.add('again');
    listOnScreen = showList ? size : null;
    if (showList) lay.append(listCol);
    if (wide() || v.k !== 'list') lay.append(pane);
    if (size === 'desk') { const mc = el('section', 'cw-col mcol'); mc.setAttribute('aria-label', 'Members'); lay.append(mc); }
    const nodes: Node[] = [lay];
    // the bottom bar: on the tab's screens (a flow such as making or joining a crew has the whole phone)
    const withNav = !rail && !(size === 'phone' && FLOWS.has(v.k));
    if (withNav) { const n = navBar('crews', deps.nav()); n.classList.add('cw-nav'); nodes.push(n); }
    root.classList.toggle('with-nav', withNav);
    root.replaceChildren(...nodes);
    root.dataset.view = v.k;
    root.dataset.size = size;
    if (v !== shown) { shown = v; scrollTo(0, 0); root.scrollTop = 0; }
    if (showList) void drawList(listCol, my);
    if (pane.isConnected) void drawView(pane, v, my);
  }
  const live = (my: number): boolean => my === token && !!root;

  /** The rail of the app's five places; here Play is this screen's own way back and Crews its own list. */
  const railEl = (withLogo: boolean): HTMLElement => railBar('crews', { ...deps.nav(), play: deps.play }, withLogo, home);

  // ---------------------------------------------------------------- the list column
  async function drawList(col: HTMLElement, my: number): Promise<void> {
    const cached = cachedLists();
    if (cached) fillList(col, cached);
    else col.innerHTML = '<p class="hint" role="status">Loading your crews…</p>';
    try {
      const a = await existing();
      if (!a) { if (live(my)) fillList(col, { crews: [], invites: [], requests: [] }); return; }
      const L = await fetchLists(a);
      if (!live(my)) return;
      refreshBadge();
      fillList(col, L);
      // big screens: the first crew is open next to the list
      if (wide() && top().k === 'list' && !selected && L.crews[0]) { selected = L.crews[0].id; selTab = null; paint(); }
    } catch (e) {
      if (live(my) && !cached) col.innerHTML = failHtml(e);
    }
  }

  /** the bottom bar's number, once the lists are fresh */
  function refreshBadge(): void {
    const b = root?.querySelector('.nav [data-testid=nav-crews]');
    if (!b) return;
    const n = Number(localStorage.getItem('tp-crews-badge') || 0);
    b.querySelector('.bdg')?.remove();
    if (n > 0) b.insertAdjacentHTML('beforeend', `<b class="bdg" aria-label="${n} waiting">${n > 9 ? '9+' : n}</b>`);
  }

  function fillList(col: HTMLElement, L: Lists): void {
    const v = top();
    const empty = !L.crews.length && !L.invites.length && !L.requests.length;
    // (kept when it is already showing, so a code being typed survives the fresh lists arriving)
    if (!wide() && empty) { if (!col.querySelector(':scope > .cw-empty')) col.replaceChildren(emptyState()); return; }
    const sel = v.k === 'crew' ? v.id : v.k === 'list' ? selected : null;
    const cards = L.crews.map((c, i) => crewCardHtml(c, sel === c.id, i)).join('');
    const inv = L.invites.map(inviteRowHtml).join('');
    const req = L.requests.filter((r) => r.status === 'pending').map(requestRowHtml).join('');
    const nInv = L.invites.length + L.requests.filter((r) => r.status === 'pending').length;
    const buttons = `<div class="two"><button class="bb s hz${wide() ? ' sm' : ''}" data-x="create" data-testid="crews-create">${ic('plus')}Create</button><button class="bb s hz${wide() ? ' sm' : ''}" data-x="join" data-testid="crews-join">${ic('link')}${wide() ? 'Join' : 'Join with code'}</button></div>`;
    if (wide()) {
      col.innerHTML = `<div class="hrow"><h2 class="ct">Crews</h2><span class="sp"></span><button class="ib" data-x="create" aria-label="New crew">${ICON.plus}</button></div>`
        + (cards || (empty ? '<p class="hint">No crews yet. Make one, or join with a code.</p>' : '')) + inv + req + buttons;
    } else {
      const tab = listTab;
      col.innerHTML = head('Crews', '', `<button class="ib" data-x="create" aria-label="New crew" data-testid="crews-plus">${ICON.plus}</button>`, false)
        + `<div class="ktabs" role="tablist"><button role="tab" aria-selected="${tab === 'mine'}" class="${tab === 'mine' ? 'on' : ''}" data-x="tab-mine">My crews · ${L.crews.length}</button><button role="tab" aria-selected="${tab === 'invites'}" class="${tab === 'invites' ? 'on' : ''}" data-x="tab-invites" data-testid="tab-invites">Invites · ${nInv}</button></div>`
        + (tab === 'mine' ? `<div class="clist-cards">${cards}${inv}</div>` : `<div class="clist-cards">${inv + req || '<p class="hint">No invitations. When a friend sends you a crew link, it waits here.</p>'}</div>`)
        + buttons;
    }
    // the notifications bell, next to the + (the same panel as on the home screen)
    const plus = col.querySelector('button.ib[data-x=create]');
    plus?.parentElement?.insertBefore(bellButton({ theme: () => currentTheme(), account: () => existing(), openSheet: deps.openSheet }), plus);
    col.onclick = (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest('[data-x]') as HTMLElement | null;
      if (b) {
        e.stopPropagation();
        const x = b.dataset.x!;
        if (x === 'create') return go({ k: 'create' });
        if (x === 'join') return go({ k: 'join' });
        if (x === 'tab-mine' || x === 'tab-invites') { listTab = x === 'tab-mine' ? 'mine' : 'invites'; fillList(col, L); return; }
        if (x === 'live') { const c = L.crews.find((y) => y.id === b.dataset.id); if (c?.live) joinLive(c.live.table, c.live.mode); return; }
        if (x === 'invite') { void openInvitation(L.invites.find((i) => i.crew_id === b.dataset.id)!); return; }
        if (x === 'request') { go({ k: 'waiting', crewId: b.dataset.id! }); return; }
      }
      const card = t.closest('[data-crew]') as HTMLElement | null;
      if (card) openCrew(card.dataset.crew!);
    };
    col.onkeydown = (e) => { const card = (e.target as HTMLElement).closest('[data-crew]') as HTMLElement | null; if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCrew(card.dataset.crew!); } };
  }

  function openCrew(id: string): void {
    if (wide()) { selected = id; selTab = null; views = [{ k: 'list' }, { k: 'crew', id, tab: size === 'lap' || size === 'desk' ? 'overview' : 'home' }]; paint(); }
    else go({ k: 'crew', id, tab: 'home' });
  }

  function crewCardHtml(c: CrewCard, sel: boolean, i: number): string {
    const lv = c.live ? `<div class="lvbar"><span class="klive">LIVE</span><span class="txt"><b>Table ${esc(c.live.table ?? (c.live.mode === 'qr' ? 'by QR' : 'offline'))}${c.live.faces.length ? ` · ${c.live.faces.length} playing` : ''}</b><small>Started ${clock(c.live.since)} · blinds ${fmtN(c.live.rules.sb ?? DEFAULT_RULES.sb!)}/${fmtN(c.live.rules.bb ?? DEFAULT_RULES.bb!)}</small></span><button class="bb p sm" data-x="live" data-id="${c.id}" data-testid="live-join">Join</button></div>` : '';
    const season = c.seasons_on ? (c.season ? `Season ${c.season}` : `Season ${c.next_season} soon`) : 'All-time league';
    const meta = `${c.members} member${c.members === 1 ? '' : 's'} · ${season}${c.rank ? ` · you’re ${ordinal(c.rank)}` : ''}`;
    const extra = c.requests ? `<span class="chipt o" data-testid="card-requests">${c.requests} request${c.requests === 1 ? '' : 's'}</span>` : c.usual ? `<span class="chipt">Next: ${esc(usualText(c.usual))}</span>` : '';
    const more = c.members - c.faces.length;
    return `<div class="ccard${sel ? ' sel' : ''}" data-crew="${c.id}" role="link" tabindex="0" aria-label="${esc(c.name)}" style="--i:${i}" data-testid="crew-card">${lv}`
      + `<div class="hrow">${emblem(c, 50)}<div class="txt"><b>${esc(c.name)}</b><small>${esc(meta)}</small></div>${roleChip(c.role)}</div>`
      + `<div class="hrow ft">${stack(c.faces, 28)}${more > 0 ? `<span class="mut">+${more}</span>` : ''}<span class="sp"></span>${extra}</div></div>`;
  }
  // phones: "Arjun invited you to Office Fridays" over the crew's size; the crews column on big screens: the crew's
  // name over "Arjun invited you" (v3sizes.py)
  const inviteRowHtml = (i: Invitation): string => `<div class="row invite" data-testid="invite-row">${emblem(i, wide() ? 32 : 36)}<span class="txt">`
    + (wide()
      ? `<b>${esc(i.name)}</b><small>${esc(i.invited_by ?? 'A friend')} invited you</small>`
      : `<b>${esc(i.invited_by ?? 'A friend')} invited you to ${esc(i.name)}</b><small>${i.members} member${i.members === 1 ? '' : 's'}${i.seasons_on && i.season ? ` · Season ${i.season}` : ''}</small>`)
    + `</span><button class="bb p sm" data-x="invite" data-id="${i.crew_id}">View</button></div>`;
  const requestRowHtml = (r: JoinRequest): string => `<div class="row" data-testid="request-row">${emblem(r, 36)}<span class="txt"><b>${esc(r.name)}</b><small>Request sent · waiting for ${esc(r.leader ?? 'the leader')}</small></span><button class="bb s sm" data-x="request" data-id="${r.crew_id}">Open</button></div>`;

  function joinLive(table: string | null, mode: string): void {
    if (mode === 'online' && table) deps.joinTable(table);
    else if (mode === 'offline') deps.joinOffline();
    else toast('Scan the host’s QR code at the table to sit down.');
  }

  async function openInvitation(i: Invitation): Promise<void> {
    try {
      const a = await ensure(); if (!a) return;
      const p = await a.crewPreview(i.code);
      if (p.found) go({ k: 'preview', p, from: null });
      else { toast('That invitation’s code was changed. Ask for a new one.'); await a.dismissInvitation(i.crew_id); forget(); paint(); }
    } catch (e) { toast(msgOf(e)); }
  }

  // ---------------------------------------------------------------- the new player's tab
  function emptyState(): HTMLElement {
    const box = el('div', 'cw-empty');
    const look = (name: string, color: string, badge: Badge) => ({ name, color, badge });
    const ill = `<div class="cill">${emblem(look('?', COLORS[0]![0], 'shield'), 64, 'e1', '?')}${emblem(look('4B', COLORS[1]![0], 'hex'), 50, 'e2', '4B')}${emblem(look('OF', COLORS[2]![0], 'round'), 44, 'e3', 'OF')}</div>`;
    box.innerHTML = head('Crews', '', `<button class="ib" data-x="scan" aria-label="Scan a crew QR">${ICON.qr}</button>`, false)
      + `<div class="pnl hero1">${ill}<b class="h">Play with the same friends every week</b><p class="mut">A crew keeps your league, your games and your trophies together. Every table you play as a crew counts toward the season.</p></div>`
      + `<button class="bb p hz" data-x="create" data-testid="crews-create">${ic('plus')}Create a crew</button>`
      + `<div class="pnl"><h2 class="ttl">Join a crew</h2><span class="mut" style="font-size:12.5px">Type the 6-letter code your friend sent you</span><div data-slot="code"></div>`
      + `<div class="hrow"><button class="bb g sm hz" data-x="paste">${ic('link')}Paste a link</button><button class="bb g sm hz" data-x="scan">${ic('qr')}Scan a code</button></div></div>`;
    const boxes = codeBoxes((code) => void findCrew(code, null, boxes));
    box.querySelector('[data-slot=code]')!.replaceWith(boxes.el);
    box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-x]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.x === 'create') go({ k: 'create' });
      if (b.dataset.x === 'paste') void pasteLink(boxes);
      if (b.dataset.x === 'scan') scanQr(boxes);
    });
    return box;
  }

  // ---------------------------------------------------------------- the main pane
  async function drawView(pane: HTMLElement, v: View, my: number): Promise<void> {
    pane.onclick = null;
    switch (v.k) {
      case 'list':
        if (wide()) {
          if (selected) return drawCrew(pane, { k: 'crew', id: selected, tab: selTab ?? (size === 'lap' || size === 'desk' ? 'overview' : 'home') }, my);
          pane.replaceChildren(emptyState());
        }
        return;
      case 'crew': return drawCrew(pane, v, my);
      case 'create': return drawCreate(pane);
      case 'made': return drawMade(pane, v);
      case 'join': return drawJoin(pane, v.code);
      case 'preview': return drawPreview(pane, v.p, v.from);
      case 'waiting': return drawWaiting(pane, v.crewId, my);
      case 'settings': return drawSettings(pane, v.id, my);
      case 'player': return drawPlayer(pane, v.crewId, v.accountId, my);
    }
  }

  // ---------------------------------------------------------------- create
  function drawCreate(pane: HTMLElement): void {
    let name = '', badge: Badge = 'shield', color = COLORS[0]![0], seasons = true;
    pane.innerHTML = head('New crew', 'Step 1 of 2')
      + `<div class="prev" data-slot="prev"></div>`
      + `<label class="fld"><span>Crew name</span><span class="inp f"><input type="text" maxlength="24" placeholder="Hostel 4B" autocomplete="off" data-testid="crew-name" aria-label="Crew name"><span class="mut cnt" style="font-size:12px">0 / 24</span></span></label>`
      + `<div class="fld"><span id="cw-badge-l">Badge</span><div class="pick shapes" role="radiogroup" aria-labelledby="cw-badge-l">${BADGES.map((b) => `<button role="radio" data-badge="${b}" aria-label="${b}">${emblem({ name: '', color: COLORS[0]![0], badge: b }, 34, '', '')}</button>`).join('')}</div></div>`
      + `<div class="fld"><span id="cw-col-l">Colour</span><div class="pick cols" role="radiogroup" aria-labelledby="cw-col-l">${COLORS.map(([a, b], i) => `<button role="radio" data-color="${a}" aria-label="${COLOR_NAMES[i]}" style="background:${a};box-shadow:inset 0 0 0 3px ${b}"></button>`).join('')}</div></div>`
      + `<div class="pnl" style="gap:6px"><label class="swrow"><span>Seasons<small>The league resets every 3 months; all-time stays</small></span><input type="checkbox" role="switch" checked data-testid="crew-seasons"></label></div>`
      + `<button class="bb p bottom" data-x="make" data-testid="crew-create">Create crew</button>`;
    const input = pane.querySelector('input[type=text]') as HTMLInputElement;
    const draw = (stamp = false): void => {
      const n = name.trim() || 'Your crew';
      pane.querySelector('[data-slot=prev]')!.innerHTML = `${emblem({ name: n, color, badge }, 92, stamp ? 'stamp' : '')}<b>${esc(n)}</b><small class="mut">${seasons ? 'Season 1 starts with your first game' : 'One all-time league, no seasons'}</small>`;
      pane.querySelector('.cnt')!.textContent = `${name.length} / 24`;
      pane.querySelectorAll<HTMLElement>('[data-badge]').forEach((b) => { const on = b.dataset.badge === badge; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.innerHTML = emblem({ name: '', color, badge: b.dataset.badge as Badge }, 34, '', ''); });
      pane.querySelectorAll<HTMLElement>('[data-color]').forEach((b) => { const on = b.dataset.color === color; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    };
    draw(true);
    input.addEventListener('input', () => { name = input.value.slice(0, 24); draw(); });
    pane.querySelector<HTMLInputElement>('[data-testid=crew-seasons]')!.addEventListener('change', (e) => { seasons = (e.target as HTMLInputElement).checked; draw(); });
    pane.onclick = async (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest('[data-badge],[data-color],[data-x]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.badge) { badge = b.dataset.badge as Badge; draw(); return; }
      if (b.dataset.color) { color = b.dataset.color; draw(); return; }
      if (b.dataset.x === 'back') return back();
      if (b.dataset.x === 'make') {
        const n = name.trim();
        if (!n) { input.focus(); toast('Give the crew a name.'); return; }
        (b as HTMLButtonElement).disabled = true;
        try {
          const a = await ensure();
          if (!a) { (b as HTMLButtonElement).disabled = false; return; }
          const c = await a.createCrewV3(n, badge, color, seasons);
          forget();
          pushFor = c.id;
          replace({ k: 'made', id: c.id, name: c.name, color: c.color, badge: c.badge, code: c.code, autoAdmit: c.auto_admit });
        } catch (err) { (b as HTMLButtonElement).disabled = false; toast(msgOf(err)); }
      }
    };
    setTimeout(() => input.focus({ preventScroll: true }), 60);
  }

  function drawMade(pane: HTMLElement, v: Extract<View, { k: 'made' }>): void {
    const conf = level() === 'full' ? `<div class="conf" aria-hidden="true">${Array.from({ length: 26 }, (_, k) => `<i style="left:${((k * 37) % 96) + 2}%;background:${k % 2 ? COLORS[k % 6]![0] : 'var(--acc)'};animation-delay:${(-(k * 0.17) % 2.6).toFixed(2)}s"></i>`).join('')}</div>` : '';
    const digits = v.code.split('').map((ch, i) => `${i === 3 ? '<i></i>' : ''}<span>${ch}</span>`).join('');
    pane.innerHTML = conf + head(v.name, 'You’re the leader', `<button class="ib" data-x="done" aria-label="Close">✕</button>`, false)
      + `<div class="made">${emblem(v, 110, 'stamp')}<b data-testid="crew-made">Crew made</b><p class="mut">Invite your friends. Anyone with the code can ask to join; you let them in.</p></div>`
      + `<div class="pnl codep"><span class="klbl">Crew code</span><div class="digits" data-testid="made-code" aria-label="Crew code ${v.code.split('').join(' ')}">${digits}</div>`
      + shareButtons(v.code, v.name, true) + '</div>'
      + `<div class="pnl" style="gap:8px"><label class="swrow"><span>Let people in by themselves<small>Off: you approve each request</small></span><input type="checkbox" role="switch" ${v.autoAdmit ? 'checked' : ''} data-testid="made-auto"></label></div>`
      + `<button class="bb p bottom" data-x="done" data-testid="made-go">Go to the crew</button>`;
    pane.querySelector<HTMLInputElement>('[data-testid=made-auto]')!.addEventListener('change', async (e) => {
      const on = (e.target as HTMLInputElement).checked;
      try { const a = await ensure(); await a!.crewSettings(v.id, { autoAdmit: on }); v.autoAdmit = on; } catch (err) { (e.target as HTMLInputElement).checked = !on; toast(msgOf(err)); }
    });
    pane.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('[data-x]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.x === 'done') { selected = v.id; views = [{ k: 'list' }, { k: 'crew', id: v.id, tab: wide() && size !== 'tab' && size !== 'side' ? 'overview' : 'home' }]; paint(); return; }
      shareAction(b.dataset.x!, v.code, v.name);
    };
    if (pushFor === v.id) void mountPushPrompt(pane, pane.querySelector('[data-testid=made-go]'), ensure, () => { pushFor = null; });
    const c = pane.querySelector('.conf');
    if (c) setTimeout(() => c.remove(), ms(2.6) + 600);
  }

  // ---------------------------------------------------------------- sharing a code
  const myId = (): string | null => { try { return (JSON.parse(localStorage.getItem('tp-me') || 'null') as { account: string } | null)?.account ?? null; } catch { return null; } };
  const linkFor = (code: string): string => crewLink(`${location.origin}${location.pathname}`, code, myId());
  function shareButtons(code: string, _name: string, qrBtn: boolean): string {
    return `<div class="three"><button class="bb s sm hz" data-x="wa">${ic('whatsapp')}WhatsApp</button><button class="bb s sm hz" data-x="copy" data-testid="copy-link">${ic('copy')}${qrBtn ? 'Copy link' : 'Link'}</button>`
      + (qrBtn ? `<button class="bb s sm hz" data-x="qr">${ic('qr')}QR</button>` : `<button class="bb s sm hz" data-x="share">${ic('share')}Share</button>`) + '</div>';
  }
  function shareAction(x: string, code: string, name: string): void {
    const link = linkFor(code);
    const text = `Join our poker crew “${name}” on Train Poker: code ${formatCrewCode(code)} or ${link}`;
    if (x === 'wa') window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    if (x === 'copy') void copyText(link, 'Link copied');
    if (x === 'share') { if (navigator.share) navigator.share({ title: name, text, url: link }).catch(() => undefined); else void copyText(link, 'Link copied'); }
    if (x === 'qr') {
      const box = el('div', 'cw cw-sheet');
      applyFeel(box);
      box.innerHTML = `<h2 class="sh2">Scan to join ${esc(name)}</h2><div class="qrbig">${qrSvg(link, { dark: '#111111', light: '#ffffff' })}</div><b class="big" style="text-align:center">${formatCrewCode(code)}</b><p class="hint">Any phone camera opens the invitation.</p>`;
      deps.openSheet(box, { label: 'Crew QR code' });
    }
  }
  async function copyText(t: string, done: string): Promise<void> {
    try { await navigator.clipboard.writeText(t); cwToast(done, 'copy'); } catch { await ask('Copy this link:', { yes: 'Done', input: { value: t, max: 300 } }); }
  }

  // ---------------------------------------------------------------- join with a code
  interface Boxes { el: HTMLElement; input: HTMLInputElement; set(v: string): void; error(msg: string, rest?: number): void; calm(): void; busy(on: boolean): void; msg: HTMLElement }
  function codeBoxes(done: (code: string) => void, withMsg = false): Boxes {
    const wrap = el('div', 'kcode');
    const lab = el('label', 'kslots');
    const spans = Array.from({ length: 6 }, () => el('span'));
    const dash = el('span', 'dash', '–'); dash.setAttribute('aria-hidden', 'true');
    lab.append(spans[0]!, spans[1]!, spans[2]!, dash, spans[3]!, spans[4]!, spans[5]!);
    const input = el('input');
    Object.assign(input, { type: 'text', maxLength: 7, autocomplete: 'off', spellcheck: false });
    input.setAttribute('autocapitalize', 'characters'); input.setAttribute('aria-label', 'Crew code'); input.dataset.testid = 'crew-code';
    input.setAttribute('inputmode', 'text');
    lab.append(input);
    const msg = el('p', 'hint cmsg', withMsg ? 'Codes are 6 letters and numbers, like FNT-4Q2. Capitals don’t matter.' : '');
    msg.setAttribute('role', 'status'); msg.dataset.testid = 'code-msg';
    wrap.append(lab);
    if (withMsg) wrap.append(msg);
    let restTimer = 0;
    const draw = (): void => {
      const v = input.value;
      spans.forEach((s, i) => { s.textContent = v[i] ?? ''; s.className = v[i] ? 'f' : i === v.length && document.activeElement === input ? 'c' : ''; });
    };
    input.addEventListener('input', () => {
      const pasted = parseCrewLink(input.value);
      input.value = pasted ? pasted.code : cleanCrewCode(input.value);
      if (lab.classList.contains('err') && !restTimer) calmFn();
      draw();
      if (input.value.length === 6) done(input.value);
    });
    input.addEventListener('focus', draw); input.addEventListener('blur', draw);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.length === 6) done(input.value); });
    const calmFn = (): void => { lab.classList.remove('err'); if (withMsg) { msg.className = 'hint cmsg'; msg.textContent = 'Codes are 6 letters and numbers, like FNT-4Q2. Capitals don’t matter.'; } else msg.textContent = ''; };
    const b: Boxes = {
      el: wrap, input, msg,
      set(v) { input.value = cleanCrewCode(v); draw(); },
      error(text, rest) {
        lab.classList.remove('err'); void lab.offsetWidth; lab.classList.add('err');
        msg.className = 'errm cmsg'; msg.textContent = text;
        if (!wrap.contains(msg)) wrap.append(msg);
        if (rest && rest > 0) {
          input.disabled = true; lab.classList.add('rest');
          let left = rest;
          const tick = (): void => {
            if (!wrap.isConnected) { clearInterval(restTimer); restTimer = 0; return; }
            left -= 1;
            msg.textContent = left > 0 ? `Too many wrong codes. The boxes rest for ${left} s.` : 'Try again now.';
            if (left <= 0) { clearInterval(restTimer); restTimer = 0; input.disabled = false; lab.classList.remove('rest', 'err'); input.value = ''; draw(); input.focus(); }
          };
          msg.textContent = `Too many wrong codes. The boxes rest for ${left} s.`;
          clearInterval(restTimer); restTimer = window.setInterval(tick, 1000);
        }
      },
      calm: calmFn,
      busy(on) { lab.classList.toggle('busy', on); },
    };
    draw();
    return b;
  }

  /** A code typed, pasted or scanned: the invitation, or the wrong-code state. */
  async function findCrew(code: string, from: string | null, boxes: Boxes | null): Promise<void> {
    boxes?.busy(true);
    try {
      const a = await ensure();
      if (!a) return;
      const p = await a.crewPreview(code);
      if (!p.found) {
        const left = p.tries_left;
        const text = p.rest > 0 ? `Too many wrong codes. The boxes rest for ${p.rest} s.` : `No crew has the code ${p.code}. Check the last letters with your friend.${left <= 2 ? ` ${left} ${left === 1 ? 'try' : 'tries'} left this minute.` : ''}`;
        if (boxes) boxes.error(text, p.rest); else toast(text);
        return;
      }
      if (p.status === 'member') { forget(); openCrew(p.id); return; }
      if (from) void a.noteInvitation(p.code, from).catch(() => undefined);
      if (p.status === 'pending') { go({ k: 'waiting', crewId: p.id }); return; }
      go({ k: 'preview', p, from });
    } catch (e) {
      const rest = restSeconds(msgOf(e));
      if (boxes && rest) boxes.error(`Too many wrong codes. The boxes rest for ${rest} s.`, rest);
      else toast(msgOf(e));
    } finally { boxes?.busy(false); }
  }

  function drawJoin(pane: HTMLElement, code?: string): void {
    pane.innerHTML = head('Join a crew')
      + `<div class="pnl" style="gap:14px"><h2 class="ttl">Type the crew code</h2><div data-slot="code"></div></div>`
      + `<p class="or2"><span>or</span></p>`
      + `<button class="row" data-x="paste">${ic('link')}<span class="txt"><b>Paste an invite link</b><small>${esc(location.host)}/c/FNT4Q2</small></span><span class="go">›</span></button>`
      + `<button class="row" data-x="scan">${ic('qr')}<span class="txt"><b>Scan a crew QR</b><small>From a friend’s phone or a printed card</small></span><span class="go">›</span></button>`
      + `<button class="bb p bottom" data-x="find" data-testid="find-crew">Find crew</button>`;
    const boxes = codeBoxes((c) => void findCrew(c, null, boxes), true);
    pane.querySelector('[data-slot=code]')!.replaceWith(boxes.el);
    const find = pane.querySelector('[data-x=find]') as HTMLButtonElement;
    const obs = new MutationObserver(() => { find.textContent = boxes.el.querySelector('.kslots')!.classList.contains('err') ? 'Try again' : 'Find crew'; });
    obs.observe(boxes.el.querySelector('.kslots')!, { attributes: true, attributeFilter: ['class'] });
    if (code) { boxes.set(code); if (code.length === 6) void findCrew(cleanCrewCode(code), null, boxes); }
    pane.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('[data-x]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.x === 'back') return back();
      if (b.dataset.x === 'paste') void pasteLink(boxes);
      if (b.dataset.x === 'scan') scanQr(boxes);
      if (b.dataset.x === 'find') {
        if (boxes.input.value.length === 6) void findCrew(boxes.input.value, null, boxes);
        else { boxes.input.value = ''; boxes.set(''); boxes.input.focus(); }
      }
    };
    setTimeout(() => { if (!code) boxes.input.focus({ preventScroll: true }); }, 60);
  }

  async function pasteLink(boxes: Boxes | null): Promise<void> {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { /* not allowed: ask */ }
    if (!parseCrewLink(text)) {
      const t = await ask('Paste the crew link or code your friend sent', { yes: 'Open', input: { placeholder: 'trainpoker.app/c/FNT4Q2', max: 300 } });
      if (typeof t !== 'string') return;
      text = t;
    }
    const got = parseCrewLink(text);
    if (!got) { toast('That is not a crew link. It looks like …/c/FNT4Q2.'); return; }
    boxes?.set(got.code);
    void findCrew(got.code, got.from, boxes);
  }

  function scanQr(boxes: Boxes | null): void {
    const box = el('div', 'cw cw-sheet');
    applyFeel(box);
    box.innerHTML = '<h2 class="sh2">Scan a crew QR</h2><div class="scanbox"><video playsinline muted></video><div class="scanl"></div></div><p class="hint" role="status">Point the camera at the code on your friend’s phone.</p>';
    const video = box.querySelector('video') as HTMLVideoElement;
    const status = box.querySelector('[role=status]') as HTMLElement;
    const scanner = new Scanner(video, (t: string) => !!parseCrewLink(t));
    const s = deps.openSheet(box, { label: 'Scan a crew QR', onClose: () => scanner.stop() });
    scanner.start((text: string) => {
      const got = parseCrewLink(text);
      s.close();
      if (got) { boxes?.set(got.code); void findCrew(got.code, got.from, boxes); }
    }).catch(() => { status.textContent = 'The camera is not available. Type the code instead.'; });
  }

  // ---------------------------------------------------------------- the invitation and the wait
  function drawPreview(pane: HTMLElement, p: CrewPreview, from: string | null): void {
    const leader = p.leader?.name ?? 'The leader';
    pane.innerHTML = head('Invitation')
      + `<div class="invh">${emblem(p, 96, 'stamp')}<span class="klbl">You’re invited to</span><b data-testid="preview-name">${esc(p.name)}</b>`
      + `<div class="hrow" style="justify-content:center">${stack(p.faces, 30)}<span class="mut">${p.members} member${p.members === 1 ? '' : 's'}</span></div></div>`
      + `<div class="three"><div class="stat"><b>${p.seasons_on ? p.season : '∞'}</b><small>${p.seasons_on ? 'season' : 'all-time'}</small></div><div class="stat"><b>${p.games}</b><small>games played</small></div><div class="stat"><b>${esc(p.usual_day ?? '–')}</b><small>usually plays</small></div></div>`
      + (p.leader ? `<div class="row">${av(p.leader, 34)}<span class="txt"><b>${esc(leader)} leads this crew</b><small>${p.auto_admit ? 'Anyone with the code gets straight in' : 'They’ll see your request and let you in'}</small></span></div>` : '')
      + `<div class="pnl wyj"><span class="klbl">When you join</span><span>· Your games at crew tables count in the league</span><span>· Members see your name, picture and results</span><span>· You can leave any time; your results stay</span></div>`
      + `<div class="two bottom"><button class="bb g" data-x="later">Not now</button><button class="bb p" data-x="ask" data-testid="ask-join">${p.auto_admit ? 'Join' : 'Ask to join'}</button></div>`;
    pane.onclick = async (e) => {
      const b = (e.target as HTMLElement).closest('[data-x]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.x === 'back' || b.dataset.x === 'later') { home(); return; }
      if (b.dataset.x === 'ask') {
        (b as HTMLButtonElement).disabled = true;
        try {
          const a = await ensure(); if (!a) return;
          const st = await a.askToJoin(p.code, true, from);
          forget();
          if (st === 'wrong') { toast('That code was just changed. Ask for the new one.'); home(); return; }
          if (st === 'active' || st === 'member') { cwToast(`You’re in! Welcome to ${p.name}`); pushFor = p.id; openCrew(p.id); return; }
          replace({ k: 'waiting', crewId: p.id });
        } catch (err) { (b as HTMLButtonElement).disabled = false; toast(msgOf(err)); }
      }
    };
  }

  async function drawWaiting(pane: HTMLElement, crewId: string, my: number): Promise<void> {
    pane.innerHTML = '<p class="hint" role="status">Loading…</p>';
    const a = await existing().catch(() => null);
    if (!a || !live(my)) return;
    let reqs: JoinRequest[] = [];
    try { reqs = await a.myJoinRequests(); } catch (e) { pane.innerHTML = failHtml(e); return; }
    if (!live(my)) return;
    const r = reqs.find((x) => x.crew_id === crewId);
    if (!r) { home(); return; }
    const who = r.leader ?? 'the leader';
    pane.innerHTML = head(r.name, 'Request sent')
      + `<div class="made">${emblem(r, 84)}<div class="wait" aria-hidden="true"><i></i><i></i><i></i></div><b data-testid="waiting">Waiting for ${esc(who)}</b>`
      + `<p class="mut">We’ll let you know the moment you’re in. You can still play at any table in the meantime.</p></div>`
      + `<div class="pnl" style="gap:8px"><label class="swrow"><span>Tell me when I’m in<small>A notification on this phone</small></span><input type="checkbox" role="switch" ${r.notify ? 'checked' : ''} data-testid="notify-me"></label></div>`
      + `<button class="bb g bottom" data-x="cancel" data-testid="cancel-request">Cancel request</button>`;
    pane.querySelector<HTMLInputElement>('[data-testid=notify-me]')!.addEventListener('change', async (e) => {
      const on = (e.target as HTMLInputElement).checked;
      try {
        await a.setRequestNotify(crewId, on);
        if (on && pushSupported() && Notification.permission !== 'granted') await enablePush(a).catch(() => false);
      } catch (err) { (e.target as HTMLInputElement).checked = !on; toast(msgOf(err)); }
    });
    pane.onclick = async (e) => {
      const b = (e.target as HTMLElement).closest('[data-x]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.x === 'back') return back();
      if (b.dataset.x === 'cancel') {
        try { await a.cancelJoinRequest(crewId); forget(); toast('Request cancelled'); home(); } catch (err) { toast(msgOf(err)); }
      }
    };
    if (r.status !== 'pending') return settle(r);
    // the answer: checked every few seconds while this is open
    let stop = false;
    const poll = async (): Promise<void> => {
      if (stop) return;
      try {
        const now = (await a.myJoinRequests()).find((x) => x.crew_id === crewId);
        if (stop) return;
        if (now && now.status !== 'pending') return settle(now);
      } catch { /* try again */ }
      if (!stop) setTimeout(() => void poll(), 4000);
    };
    setTimeout(() => void poll(), 4000);
    stopPoll = () => { stop = true; };
    function settle(x: JoinRequest): void {
      forget();
      if (x.status === 'approved') { cwToast(`You’re in! Welcome to ${x.name}`); pushFor = x.crew_id; openCrew(x.crew_id); return; }
      const m = pane.querySelector('.made p');
      if (m) m.textContent = `${who} said no this time. You can ask again later.`;
      pane.querySelector('.wait')?.remove();
      pane.querySelector('[data-testid=waiting]')!.textContent = 'Not this time';
      const c = pane.querySelector('[data-x=cancel]') as HTMLButtonElement; c.textContent = 'Back to crews'; c.dataset.x = 'back';
    }
  }

  // ---------------------------------------------------------------- the crew page
  async function loadPage(id: string, fresh = false): Promise<CrewPage> {
    const a = await existing();
    if (!a) throw new Error('Make your profile first');
    if (!fresh && pages.has(id)) return pages.get(id)!;
    // (the league comes along to learn which scoring is in use, before any words about it are drawn)
    const [p, lg0] = await Promise.all([a.crewPage(id), a.crewLeague(id, 'season').catch(() => null)]);
    learnScoring(lg0);
    pages.set(id, p);
    return p;
  }

  async function drawCrew(pane: HTMLElement, v: Extract<View, { k: 'crew' }>, my: number): Promise<void> {
    const had = pages.get(v.id);
    if (!had) pane.innerHTML = '<p class="hint" role="status">Loading the crew…</p>';
    let p: CrewPage;
    try {
      p = had ?? await loadPage(v.id);
      if (had) void loadPage(v.id, true).then((q) => { if (live(my) && JSON.stringify(q) !== JSON.stringify(had)) paint(); }).catch(() => undefined);
    } catch (e) {
      if (!live(my)) return;
      if (/Only crew members/.test(msgOf(e))) { pages.delete(v.id); selected = null; forget(); pane.innerHTML = `<p class="hint">You are not in this crew any more.</p>`; return; }
      pane.innerHTML = failHtml(e);
      pane.onclick = (ev) => { if ((ev.target as HTMLElement).closest('[data-x=retry]')) paint(); };
      return;
    }
    if (!live(my)) return;
    const big = size === 'lap' || size === 'desk';
    const tabs: Tab[] = big ? ['overview', 'league', 'games', 'members', 'trophies'] : ['home', 'league', 'games', 'members'];
    let tab = v.tab;
    if (!tabs.includes(tab)) tab = big ? (tab === 'home' ? 'overview' : tab) : tab === 'overview' || tab === 'trophies' ? 'home' : tab;
    R.emit('crew.view', { kind: 'tab', crew: v.id, tab, size, role: p.role, cached: !!had });
    const staff = p.role !== 'member';
    const c = p.crew;
    const seasonLine = c.season_months === 0 ? 'All-time league' : p.season ? `${seasonLabel(p.season)}${p.season.ends_at ? ` · ${endsIn(p.season.ends_at)}` : ''}` : `Season ${p.next_season} starts with your first game`;
    const tabLabel = (t: Tab): string => ({ home: 'Home', overview: 'Overview', league: 'League', games: 'Games', members: 'Members', trophies: 'Trophies' })[t];
    const tabsHtml = `<div class="ktabs" role="tablist">${tabs.map((t) => `<button role="tab" aria-selected="${t === tab}" class="${t === tab ? 'on' : ''}" data-tab="${t}" data-testid="crew-tab-${t}">${tabLabel(t)}</button>`).join('')}</div>`;
    let header: string;
    if (big) {
      header = `<div class="cmh">${emblem(c, 64)}<div class="txt"><h1 class="t" data-testid="crew-title">${esc(c.name)}</h1><small>${p.members} members · ${esc(seasonLine)}${p.leader ? ` · led by ${esc(p.leader.name)}` : ''}</small></div><span class="sp"></span>`
        + (p.can_invite ? `<button class="bb s sm hz" data-x="invite" data-testid="crew-invite">${ic('share')}Invite</button>` : '')
        + `<button class="ib" data-x="more" aria-label="More" data-testid="crew-more">${ICON.more}</button></div>`;
    } else {
      const right = (p.can_invite ? `<button class="ib" data-x="invite" aria-label="Invite" data-testid="crew-invite">${ICON.share}</button>` : '')
        + (staff ? `<button class="ib" data-x="settings" aria-label="Crew settings" data-testid="crew-gear">${ICON.gear}</button>` : '');
      // the tablet: the big screens' header, a size smaller (v3sizes.py tablet)
      if (size === 'tab') header = `<div class="cmh">${emblem(c, 52)}<div class="txt"><h1 class="t" data-testid="crew-title">${esc(c.name)}</h1><small>${esc(seasonLine)}</small></div>${right}</div>`;
      else header = `<header class="v3h crh">${size === 'phone' ? '<button class="ib" data-x="back" aria-label="Back">‹</button>' : ''}${emblem(c, 44)}<div><h1 class="t" data-testid="crew-title">${esc(c.name)}</h1><small>${esc(seasonLine)}</small></div><span class="sp"></span>${right}</header>`;
    }
    pane.innerHTML = header + tabsHtml + '<div class="tabbody" data-slot="body"></div>';
    const body = pane.querySelector('[data-slot=body]') as HTMLElement;
    if (pushFor === v.id) void mountPushPrompt(pane, body, ensure, () => { pushFor = null; });
    // (on big screens the crew shown beside the list may be the list's own pick, not a crew view: its tab is kept
    // apart, or every tab would open on Overview again)
    const setTab = (t: Tab): void => { const cur = top(); if (cur.k === 'crew') cur.tab = t; else selTab = t; paint(); };
    pane.onclick = (e) => {
      const t = e.target as HTMLElement;
      const tb = t.closest('[data-tab]') as HTMLElement | null;
      if (tb) { setTab(tb.dataset.tab as Tab); return; }
      const b = t.closest('[data-x]') as HTMLElement | null;
      if (!b) return;
      const x = b.dataset.x!;
      if (x === 'back') return back();
      if (x === 'invite') return inviteSheet(p);
      if (x === 'settings') return go({ k: 'settings', id: p.crew.id });
      if (x === 'more') return moreSheet(p);
      if (x === 'host') return hostSheet(p);
      if (x === 'join-live' && p.live) return joinLive(p.live.table, p.live.mode);
      if (x === 'to-league') return setTab('league');
      if (x === 'how') return howSheet(scoringOf(p));
      if (x === 'to-games') return setTab('games');
      if (x === 'to-members') return setTab('members');
      if (x === 'game') return deps.openGame(b.dataset.id!, () => enter(undefined, true));
      if (x === 'player') return go({ k: 'player', crewId: p.crew.id, accountId: b.dataset.id! });
      if (x === 'leave') return void leave(p);
      if (x === 'req-yes' || x === 'req-no') return void decide(b, p, x === 'req-yes');
      if (x === 'member-more') return memberSheet(p, b.dataset.id!);
    };
    if (tab === 'home' && size === 'tab') void tabletHome(body, p, my);
    else if (tab === 'home') body.innerHTML = homeHtml(p, false);
    else if (tab === 'overview') { body.innerHTML = '<p class="hint" role="status">Loading…</p>'; void overview(body, p, my); }
    else if (tab === 'league') void leagueTab(body, p, my);
    else if (tab === 'games' || tab === 'trophies') void gamesTab(body, p, my, tab === 'trophies' ? 'trophies' : 'all');
    else if (tab === 'members') void membersTab(body, p, my);
    // desktop: the members column next to the crew
    const mc = root?.querySelector('.mcol') as HTMLElement | null;
    if (mc) void membersColumn(mc, p, my);
  }

  function liveHtml(p: CrewPage): string {
    if (!p.live) return '';
    const L = p.live;
    const free = (L.rules.maxPlayers ?? 0) - L.faces.length;
    return `<div class="pnl lvc" data-testid="live-card"><div class="hrow"><span class="klive">LIVE</span><b>${L.table ? `Table ${esc(L.table)}` : L.mode === 'qr' ? 'A QR table' : 'An offline table'}</b><span class="sp"></span><span class="mut" style="font-size:12px">since ${clock(L.since)}</span></div>`
      + `<div class="hrow">${L.faces.length ? stack(L.faces, 28) : ''}<span class="mut" style="font-size:12px">${L.faces.length ? `${L.faces.length} playing` : `Opened by ${esc(L.host ?? 'a member')}`}${free > 0 && L.faces.length ? ` · ${free} seat${free === 1 ? '' : 's'} free` : ''}</span></div>`
      + `<button class="bb p" data-x="join-live" data-testid="join-live">Join the table</button></div>`;
  }
  function requestsHtml(p: CrewPage, all: boolean): string {
    if (p.role === 'member' || !p.requests.length) return '';
    const rows = (all ? p.requests : p.requests.slice(0, 1)).map((r) => reqRow(r, all ? 36 : 32)).join('');
    if (all) return `<div class="pnl req" style="gap:8px" data-testid="requests"><span class="klbl">Wants to join · ${p.requests.length}</span>${rows}</div>`;
    return `<div class="pnl req" data-testid="requests"><div class="hrow"><h2 class="ttl" style="font-size:15px">${p.requests.length} ${p.requests.length === 1 ? 'person wants' : 'people want'} to join</h2><span class="sp"></span><button class="lnk" data-x="to-members">See all</button></div>${rows}</div>`;
  }
  const reqRow = (r: PendingRequest, size: number): string => `<div class="hrow mrow rq" data-req="${r.id}">${av({ id: r.account_id, name: r.name, avatar: r.avatar ?? null }, size)}<span class="txt"><b>${esc(r.name)}</b><small>asked ${ago(r.asked_at)}${r.invited_by ? ` · invited by ${esc(r.invited_by)}` : r.plays_at ? ` · plays at ${esc(r.plays_at)}` : ''}</small></span>`
    + `<button class="mb n" data-x="req-no" data-id="${r.id}" aria-label="Decline ${esc(r.name)}" data-testid="req-no">✕</button><button class="mb y" data-x="req-yes" data-id="${r.id}" aria-label="Let ${esc(r.name)} in" data-testid="req-yes">${ICON.check}</button></div>`;
  function seasonHtml(p: CrewPage): string {
    const m = p.me;
    const sc = scoringOf(p);
    const chip = `<span class="chipt">${m.games} ${sc === 'bb' ? 'game' : 'night'}${m.games === 1 ? '' : 's'}</span>`;
    const span = p.crew.season_months === 0 ? 'league' : 'season';
    const unranked = sc !== 'bb' && m.games > 0 && m.ranked === false;
    const rk = `<div class="rk"><b>${m.rank ? ordinal(m.rank) : '–'}</b><small>${unranked ? `${m.games} of ${minNights(sc)} nights` : `of ${m.of}`}</small></div>`;
    const main = sc === 'points'
      ? `<div class="nb"><b data-testid="my-avg">${m.avg == null ? '–' : ptsText(m.avg)}</b><small>points per night</small></div>`
      : sc === 'average'
        ? `<div class="nb"><b class="${upDown(m.avg)}" data-testid="my-avg">${m.avg == null ? '–' : bbText(m.avg)}</b><small>per night this ${span}</small></div>`
        : `<div class="nb"><b class="${upDown(m.bb)}">${bbText(m.bb ?? 0)}</b><small>won this ${span}</small></div>`;
    return `<div class="pnl" data-testid="your-season"><div class="hrow"><span class="klbl">${p.crew.season_months === 0 ? 'Your league' : 'Your season'}</span><span class="sp"></span>${chip}</div>`
      + `<div class="hrow">${rk}${main}`
      + `<span class="sp"></span><span class="acc">${spark([0, ...m.spark.map(Number)])}</span></div></div>`;
  }
  /** the podium's figure for a row in the crew's scoring */
  const podiumFig = (r: { bb: number; avg?: number | null }, sc: Scoring): string => (sc === 'points' ? `${ptsText(r.avg ?? 0)} pts` : sc === 'average' ? `${bbText(r.avg ?? 0)}/night` : bbText(r.bb));
  function podiumHtml(all: { account_id: string; name: string; avatar?: string | null; bb: number; avg?: number | null; ranked?: boolean }[], big: boolean, sc: Scoring): string {
    const rows = all.filter((r) => r.ranked !== false);
    if (!rows.length) return `<p class="hint" style="text-align:center">${all.length ? `The podium fills once players have ${minNights(sc)} nights.` : 'The podium fills after the first game.'}</p>`;
    const order = [rows[1], rows[0], rows[2]];
    const cls = ['p2', 'p1', 'p3'];
    return `<div class="podium${big ? ' big' : ''}">${order.map((r, i) => (r ? `<button class="pd ${cls[i]}" data-x="player" data-id="${r.account_id}">${av({ id: r.account_id, name: r.name, avatar: r.avatar ?? null }, big ? (i === 1 ? 52 : 42) : i === 1 ? 44 : 36)}<b>${esc(r.name)}</b><small>${podiumFig(r, sc)}</small><i>${i === 1 ? 1 : i === 0 ? 2 : 3}</i></button>` : '<span></span>')).join('')}</div>`;
  }
  function lastGameHtml(p: CrewPage): string {
    const g = p.last_game;
    if (!g) return '';
    const w = g.winner;
    return `<button class="row" data-x="game" data-id="${g.id}" data-testid="last-game"><span class="dev">${ICON.cards}</span><span class="txt"><b>${dayMonth(g.started_at)}${w ? ` · ${esc(w.name)} won ${bbText(w.bb)}` : ''}</b><small>${g.players} players · ${duration(g.started_at, g.ended_at)}${g.mine != null ? ` · you ${bbText(g.mine)}` : ''}</small></span><span class="go">›</span></button>`;
  }
  function homeHtml(p: CrewPage, side: boolean): string {
    const host = p.can_host && !p.live ? `<button class="bb p hz" data-x="host" data-testid="host-crew">${ic('cards')}Host a crew table</button>` : '';
    const league = `<div class="pnl"><div class="hrow"><span class="klbl">League</span><span class="sp"></span><button class="lnk" data-x="to-league">Full table ›</button></div>${podiumHtml(p.podium, false, scoringOf(p))}</div>`;
    if (side) return liveHtml(p) + requestsHtml(p, false) + host + seasonHtml(p);
    return liveHtml(p) + requestsHtml(p, false) + host + seasonHtml(p) + league + lastGameHtml(p);
  }

  /** The tablet's home: the live table, requests and your season, then the full league with its Season / All-time
   *  switch (v3sizes.py tablet) in place of the phone's podium and last game. */
  async function tabletHome(body: HTMLElement, p: CrewPage, my: number): Promise<void> {
    body.innerHTML = homeHtml(p, true) + '<p class="hint" role="status">Loading…</p>';
    const a = await existing();
    if (!a) return;
    const scope = leagueScope.get(p.crew.id) ?? (p.crew.season_months === 0 ? 'alltime' : 'season');
    try {
      const lg = await a.crewLeague(p.crew.id, scope);
      learnScoring(lg);
      if (!live(my)) return;
      body.innerHTML = homeHtml(p, true) + leagueBlock(p, lg, scope, 6);
      wireLeagueSeg(body, p, my, 6);
    } catch (e) { if (live(my)) body.innerHTML = homeHtml(p, true) + failHtml(e); }
  }

  async function overview(body: HTMLElement, p: CrewPage, my: number): Promise<void> {
    const a = await existing();
    if (!a) return;
    try {
      const [lg, games] = await Promise.all([a.crewLeague(p.crew.id, p.crew.season_months === 0 ? 'alltime' : 'season'), a.crewGamesV3(p.crew.id, 'all', 4)]);
      if (!live(my)) return;
      const grid = el('div', 'cgrid c2');
      const left = el('div', 'cc'); const right = el('div', 'cc');
      left.innerHTML = leagueBlock(p, lg, p.crew.season_months === 0 ? 'alltime' : 'season', size === 'desk' ? 10 : 8);
      right.innerHTML = homeHtml(p, true) + gamesBlock(p, games);
      grid.append(left, right);
      body.replaceChildren(grid);
      wireLeagueSeg(body, p, my);
    } catch (e) { if (live(my)) body.innerHTML = failHtml(e); }
  }
  function gamesBlock(p: CrewPage, games: CrewGame[]): string {
    const rows = games.map((g) => `<button class="grow" data-x="game" data-id="${g.id}"><div class="txt"><b>${dayMonth(g.started_at)}</b><small>${g.offline ? 'Offline' : esc(g.table)} · ${g.players} players</small></div>${g.winner ? `<div class="win">${av({ id: g.winner.id ?? g.winner.name, name: g.winner.name, avatar: g.winner.avatar ?? null }, 24)}<span>${bbText(g.winner.bb, false)}</span></div>` : ''}<span class="me ${upDown(g.mine)}">${g.mine != null ? bbText(g.mine, false) : ''}</span></button>`).join('');
    void p;
    return `<div class="pnl"><div class="hrow"><h2 class="ttl">Games</h2><span class="sp"></span><button class="lnk" data-x="to-games">All ›</button></div><div class="glist">${rows || '<p class="hint">No games yet. Host the first crew table.</p>'}</div></div>`;
  }

  // ---------------------------------------------------------------- league
  const leagueScope = new Map<string, 'season' | 'previous' | 'alltime'>();
  function leagueSeg(p: CrewPage, scope: string): string {
    const opts: [string, string][] = [];
    if (p.crew.season_months !== 0) {
      opts.push(['season', `Season ${p.season?.number ?? p.next_season}`]);
      const prev = p.seasons.find((s) => s.closed || (p.season && s.number === p.season.number - 1));
      if (prev) opts.push(['previous', `Season ${prev.number}`]);
    }
    opts.push(['alltime', 'All-time']);
    return `<div class="seg" role="radiogroup" aria-label="League view">${opts.map(([k, t]) => `<button role="radio" aria-checked="${k === scope}" class="${k === scope ? 'on' : ''}" data-scope="${k}" data-testid="league-${k}">${t}</button>`).join('')}</div>`;
  }
  /** League rows: the ranked ones (from the `skip`th on, at most `limit` rows in all), then the unranked under
   *  a "Fewer than 3 nights" divider. Columns follow the crew's scoring. */
  function leagueRows(lg: CrewLeague, sc: Scoring, skip = 0, limit = 99): string {
    const ranked = lg.rows.filter((r) => r.ranked !== false).slice(skip, skip + limit);
    const unranked = lg.rows.filter((r) => r.ranked === false).slice(0, Math.max(limit - ranked.length, 0));
    const row = (r: LeagueRowV3): string => {
      const tr = r.trend ? `<span class="trend ${r.trend === 'up' ? 'tu' : 'td'}">${r.trend === 'up' ? ICON.up : ICON.down}</span>` : '<span class="trend"></span>';
      const lead = sc === 'points' ? `<span class="v pt">${ptsText(r.avg ?? 0)}</span>` : sc === 'average' ? `<span class="v pt ${upDown(r.avg)}">${bbText(r.avg ?? 0, false)}</span>` : '';
      return `<button class="lrow${r.me ? ' me' : ''}${r.ranked === false ? ' ur' : ''}" data-x="player" data-id="${r.account_id}" data-testid="league-row"><span class="n">${r.rank ?? '–'}</span>${av({ id: r.account_id, name: r.name, avatar: r.avatar ?? null }, 30)}<b>${esc(r.name)}${r.me ? ' (you)' : ''}</b>${tr}${lead}<span class="g">${r.games}</span><span class="v ${upDown(r.bb)}">${bbText(r.bb, false)}</span></button>`;
    };
    return ranked.map(row).join('') + (unranked.length ? `<div class="ldiv" data-testid="unranked-divider"><span>Fewer than ${minNights(sc)} nights</span></div>${unranked.map(row).join('')}` : '');
  }
  const lhead = (sc: Scoring): string => '<div class="lhead" aria-hidden="true" data-testid="league-head"><span>#</span><span style="flex:1;padding-left:40px">Player</span>'
    + (sc === 'points' ? '<span class="hpt">Pts/night</span><span class="hg">Nights</span>' : sc === 'average' ? '<span class="hpt">Avg bb</span><span class="hg">Nights</span>' : '<span>Games</span>')
    + '<span style="width:58px;text-align:right">Won (bb)</span></div>';
  const HOW_LINE: Record<Scoring, string> = {
    get points() { return scoreV === 2 ? 'Points per night: players beaten, chips won, −1 a rebuy.' : 'Points per night: finish, big blinds won, −1 a rebuy.'; },
    average: 'Big blinds won per night; 3 nights to be ranked.',
    bb: 'Ranked by big blinds won, so different blinds count fairly.',
  };
  const howHtml = (sc: Scoring): string => `<div class="howpts" data-testid="how-points"><span>${HOW_LINE[sc]}</span><button class="ib info" data-x="how" aria-label="How points work" data-testid="how-info">i</button></div>`;
  function howSheet(sc: Scoring): void {
    const box = sheetBox();
    const li = (t: string): string => `<li>${t}</li>`;
    // (the words follow the scoring the database is using: the game score, or the points before it)
    const body = sc === 'points'
      ? (scoreV === 2
        ? `<ul class="howl">${li('<b>Finish:</b> one point for every player you finish above. 1st of 7 gets 6, last gets 0.')}${li('<b>Chips:</b> what you won or lost, against the starting stack. Doubling it is +5, losing all of it is −5, half of it is 2.5. Never more than 5 either way.')}${li('<b>Rebuys:</b> −1 for each.')}</ul>`
          + '<p class="hint flat">The season ranks by average points per night, and every night counts, so an average can be below zero. Nights with fewer than 3 players do not count. Fewer than 4 nights: not ranked yet. A tie goes to whoever won more big blinds.</p>'
        : `<ul class="howl">${li('<b>+1</b> for playing the night.')}${li('<b>Finish:</b> one point for every player you finish above. 1st of 9 gets 8, last gets 0.')}${li('<b>Big blinds:</b> +1 for every 20 bb you win, −1 for every 20 you lose, at most 5 either way.')}${li('<b>Rebuys:</b> −1 for each.')}</ul>`
          + '<p class="hint flat">The season ranks by average points per night, and every night counts. Fewer than 3 nights: not ranked yet. A tie goes to whoever won more big blinds.</p>')
      : sc === 'average'
        ? '<p class="hint flat">Big blinds won, divided by the nights played. Every night counts; fewer than 3 nights is not ranked yet. A tie goes to whoever won more big blinds.</p>'
        : '<p class="hint flat">Total big blinds won this season. Big blinds, not chips, so a 5/10 night and a 10/20 night count the same.</p>';
    box.innerHTML = `<div class="hrow"><b class="sh2">${sc === 'points' ? 'How points work' : 'How the league ranks'}</b></div>${body}<p class="hint flat">The crew leader picks the scoring in Crew settings.</p>`;
    deps.openSheet(box, { label: 'How points work' });
  }
  function leagueBlock(p: CrewPage, lg: CrewLeague, scope: string, n: number): string {
    const sc = lg.scoring ?? scoringOf(p);
    const s = lg.season ?? p.season;
    const title = scope === 'alltime' ? 'All-time' : s ? seasonLabel(s) : `Season ${p.next_season}`;
    return `<div class="pnl" data-slot="league"><div class="hrow"><h2 class="ttl">League · ${esc(title)}</h2><span class="sp"></span>${leagueSeg(p, scope).replace('class="seg"', 'class="seg" style="width:250px"')}</div>`
      + (lg.rows.length ? lhead(sc) + `<div class="ltable">${leagueRows(lg, sc, 0, n)}</div>` + howHtml(sc) : '<p class="hint">No league games yet.</p>') + '</div>';
  }
  function wireLeagueSeg(body: HTMLElement, p: CrewPage, my: number, n = size === 'desk' ? 10 : 8): void {
    body.querySelectorAll<HTMLElement>('[data-scope]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const scope = b.dataset.scope as 'season' | 'previous' | 'alltime';
      leagueScope.set(p.crew.id, scope);
      const a = await existing(); if (!a) return;
      const lg = await a.crewLeague(p.crew.id, scope).catch(() => null);
      if (!lg || !live(my)) return;
      const slot = body.querySelector('[data-slot=league]');
      if (slot) { const t = el('div'); t.innerHTML = leagueBlock(p, lg, scope, n); slot.replaceWith(t.firstElementChild!); wireLeagueSeg(body, p, my, n); }
    }));
  }

  async function leagueTab(body: HTMLElement, p: CrewPage, my: number): Promise<void> {
    const scope = leagueScope.get(p.crew.id) ?? (p.crew.season_months === 0 ? 'alltime' : 'season');
    body.innerHTML = leagueSeg(p, scope) + '<p class="hint" role="status">Loading…</p>';
    const a = await existing(); if (!a) return;
    let lg: CrewLeague;
    try { lg = await a.crewLeague(p.crew.id, scope); } catch (e) { if (live(my)) body.innerHTML = failHtml(e); return; }
    learnScoring(lg);
    if (!live(my)) return;
    const sc = lg.scoring ?? scoringOf(p);
    const ends = p.season?.ends_at ? `${seasonLabel(p.season)} ${endsIn(p.season.ends_at)}; the winner gets the season trophy.` : '';
    const ranked = lg.rows.filter((r) => r.ranked !== false);
    const rest = lg.rows.length - Math.min(ranked.length, 3);
    body.innerHTML = leagueSeg(p, scope)
      + (lg.rows.length ? podiumHtml(lg.rows, true, sc) + (rest > 0 ? lhead(sc) + `<div class="ltable" data-testid="league">${leagueRows(lg, sc, ranked.length ? 3 : 0)}</div>` : '') + howHtml(sc) : '<p class="hint">No league games yet. Every crew table counts.</p>')
      + (scope === 'season' && ends ? `<p class="hint flat" data-testid="season-ends">${esc(ends)}</p>` : '');
    body.querySelectorAll<HTMLElement>('[data-scope]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); leagueScope.set(p.crew.id, b.dataset.scope as 'season'); void leagueTab(body, p, my); }));
  }

  // ---------------------------------------------------------------- games
  const gamesFilter = new Map<string, 'all' | 'mine' | 'trophies'>();
  async function gamesTab(body: HTMLElement, p: CrewPage, my: number, forced?: 'all' | 'trophies'): Promise<void> {
    const f = forced === 'trophies' ? 'trophies' : gamesFilter.get(p.crew.id) ?? 'all';
    const seg = forced === 'trophies' ? '' : `<div class="seg" role="radiogroup" aria-label="Which games">${([['all', 'All games'], ['mine', 'I played'], ['trophies', 'Trophies']] as const).map(([k, t]) => `<button role="radio" aria-checked="${k === f}" class="${k === f ? 'on' : ''}" data-filter="${k}">${t}</button>`).join('')}</div>`;
    body.innerHTML = seg + '<p class="hint" role="status">Loading…</p>';
    const a = await existing(); if (!a) return;
    let games: CrewGame[];
    try { games = await a.crewGamesV3(p.crew.id, f, 60); } catch (e) { if (live(my)) body.innerHTML = failHtml(e); return; }
    if (!live(my)) return;
    let out = '', grp = '';
    for (const g of games) {
      const gg = weekGroup(g.started_at);
      if (gg !== grp) { grp = gg; out += `<span class="klbl gh">${esc(gg)}</span>`; }
      const tag = g.status === 'void' ? '<span class="chipt o">void</span>' : g.offline ? '<span class="chipt">offline</span>' : '';
      out += `<button class="grow${g.status === 'void' ? ' void' : ''}" data-x="game" data-id="${g.id}" data-testid="game-row"><div class="txt"><b>${dayMonth(g.started_at)} · ${clock(g.started_at)}</b><small>${g.offline ? 'Offline' : esc(g.table)} · ${g.players} players${g.ended_at ? ` · ${duration(g.started_at, g.ended_at)}` : ''}</small></div>`
        + (g.winner ? `<div class="win">${av({ id: g.winner.id ?? g.winner.name, name: g.winner.name, avatar: g.winner.avatar ?? null }, 26)}<span>${bbText(g.winner.bb, false)}</span></div>` : '')
        + `<span class="me ${upDown(g.mine)}">${g.mine != null ? bbText(g.mine, false) : ''}</span>${tag}<span class="go">›</span></button>`;
    }
    body.innerHTML = seg + `<div class="glist" data-testid="games">${out || `<p class="hint">${f === 'mine' ? 'You have not played a crew game yet.' : f === 'trophies' ? 'No trophies won at this crew’s tables yet.' : 'No games yet. Every crew table shows up here.'}</p>`}</div>`;
    body.querySelectorAll<HTMLElement>('[data-filter]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); gamesFilter.set(p.crew.id, b.dataset.filter as 'all'); void gamesTab(body, p, my); }));
  }

  // ---------------------------------------------------------------- members
  const memberCache = new Map<string, CrewMemberV3[]>();
  function memberSub(m: CrewMemberV3): string {
    if (m.me) return 'you';
    if (m.at_table) return `at table ${m.at_table}`;
    if (m.at_table === '') return 'at a table';
    if (m.last_played) return `last played ${ago(m.last_played)}`;
    const d = (Date.now() - new Date(m.joined_at).getTime()) / 86400000;
    return d < 7 ? `joined ${ago(m.joined_at)}` : `joined ${monthName(m.joined_at)}`;
  }
  const memberRow = (m: CrewMemberV3): string => `<div class="hrow mrow" data-testid="member-row" data-name="${esc(m.name)}"><button class="mhit" data-x="player" data-id="${m.account_id}" aria-label="${esc(m.name)}">${av({ id: m.account_id, name: m.name, avatar: m.avatar ?? null }, 36)}${m.at_table != null ? '<i class="onl" aria-label="at a table"></i>' : ''}<span class="txt"><b>${esc(m.name)}</b><small>${esc(memberSub(m))}</small></span></button>${roleChip(m.role)}`
    + (!m.me ? `<button class="mm" data-x="member-more" data-id="${m.account_id}" aria-label="What you can do with ${esc(m.name)}" data-testid="member-more">${ICON.more}</button>` : '<span class="mm"></span>') + '</div>';
  async function membersTab(body: HTMLElement, p: CrewPage, my: number): Promise<void> {
    body.innerHTML = '<p class="hint" role="status">Loading…</p>';
    const a = await existing(); if (!a) return;
    let ms: CrewMemberV3[];
    try { ms = await a.crewMembers(p.crew.id); memberCache.set(p.crew.id, ms); } catch (e) { if (live(my)) body.innerHTML = failHtml(e); return; }
    if (!live(my)) return;
    body.innerHTML = `<div class="hrow"><label class="inp srch">${ic('search')}<input type="search" placeholder="Search ${ms.length} member${ms.length === 1 ? '' : 's'}" aria-label="Search members" data-testid="member-search"></label>${p.can_invite ? `<button class="bb p sm hz" data-x="invite">${ic('plus')}Invite</button>` : ''}</div>`
      + requestsHtml(p, true)
      + `<div class="mlist" data-testid="members">${ms.map((m) => memberRow(m)).join('')}</div>`
      + `<button class="bb g sm leave" data-x="leave" data-testid="leave-crew">${ic('door')}Leave crew</button>`;
    const q = body.querySelector('input[type=search]') as HTMLInputElement;
    q.addEventListener('input', () => { const t = q.value.trim().toLowerCase(); body.querySelectorAll<HTMLElement>('.mlist .mrow').forEach((r) => { r.hidden = !!t && !r.dataset.name!.toLowerCase().includes(t); }); });
  }
  async function membersColumn(mc: HTMLElement, p: CrewPage, my: number): Promise<void> {
    const a = await existing(); if (!a) return;
    const ms = memberCache.get(p.crew.id) ?? await a.crewMembers(p.crew.id).catch(() => [] as CrewMemberV3[]);
    memberCache.set(p.crew.id, ms);
    if (!live(my)) return;
    mc.innerHTML = `<div class="pnl"><div class="hrow"><h2 class="ttl">Members · ${ms.length}</h2><span class="sp"></span>${p.can_invite ? `<button class="bb s sm hz" data-x="invite">${ic('plus')}Invite</button>` : ''}</div>${requestsHtml(p, true)}<div class="mlist">${ms.map((m) => memberRow(m)).join('')}</div></div>`;
    mc.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('[data-x]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.x === 'invite') inviteSheet(p);
      if (b.dataset.x === 'player') go({ k: 'player', crewId: p.crew.id, accountId: b.dataset.id! });
      if (b.dataset.x === 'member-more') memberSheet(p, b.dataset.id!);
      if (b.dataset.x === 'req-yes' || b.dataset.x === 'req-no') void decide(b, p, b.dataset.x === 'req-yes');
    };
  }

  /** ✓ or ✕ on a request: the row turns green and ticks, then slides up into the members (v3motion). */
  async function decide(b: HTMLElement, p: CrewPage, yes: boolean): Promise<void> {
    const row = b.closest('.rq') as HTMLElement | null;
    row?.querySelectorAll('button').forEach((x) => { (x as HTMLButtonElement).disabled = true; });
    try {
      const a = await existing(); if (!a) return;
      await a.decideJoinRequest(b.dataset.id!, yes);
      const name = row?.querySelector('b')?.textContent ?? '';
      if (row) { row.classList.add(yes ? 'ok' : 'gone'); await new Promise((r) => setTimeout(r, ms(0.5) + 40)); }
      cwToast(yes ? `${name} is in` : `${name} was declined`, yes ? 'check' : 'x');
      pages.delete(p.crew.id); memberCache.delete(p.crew.id); forget();
      paint();
    } catch (e) { row?.querySelectorAll('button').forEach((x) => { (x as HTMLButtonElement).disabled = false; }); toast(msgOf(e)); }
  }

  // ---------------------------------------------------------------- sheets: member actions, invite, more, host
  function sheetBox(): HTMLElement { const b = el('div', 'cw cw-sheet'); applyFeel(b); return b; }

  function memberSheet(p: CrewPage, accountId: string): void {
    const m = (memberCache.get(p.crew.id) ?? []).find((x) => x.account_id === accountId);
    if (!m) return go({ k: 'player', crewId: p.crew.id, accountId });
    if (p.role !== 'owner') return go({ k: 'player', crewId: p.crew.id, accountId });
    const box = sheetBox();
    const since = `Member since ${monthName(m.joined_at)} · ${m.games} game${m.games === 1 ? '' : 's'}${m.bb != null ? ` · ${bbText(m.bb)}` : ''}`;
    box.innerHTML = `<div class="hrow">${av({ id: m.account_id, name: m.name, avatar: m.avatar ?? null }, 54)}<span class="txt"><b class="sh2">${esc(m.name)}</b><small class="mut">${esc(since)}</small></span></div>`
      + `<div class="alist"><button class="row" data-x="card">${ic('cards')}<span class="txt"><b>Player card</b><small>Results, best hands, trophies</small></span><span class="go">›</span></button>`
      + (m.role === 'admin'
        ? `<button class="row" data-x="unadmin" data-testid="remove-admin">${ic('lock')}<span class="txt"><b>Remove as admin</b><small>Back to a member</small></span><span class="go">›</span></button>`
        : `<button class="row" data-x="admin" data-testid="make-admin">${ic('lock')}<span class="txt"><b>Make admin</b><small>Can approve requests and host crew tables</small></span><span class="go">›</span></button>`)
      + `<button class="row" data-x="handover" data-testid="hand-over">${ic('trophy')}<span class="txt"><b>Hand over leadership</b><small>${esc(m.name)} becomes leader, you become admin</small></span><span class="go">›</span></button></div>`
      + `<button class="bb d" data-x="remove" data-testid="remove-member">Remove from crew</button><p class="hint flat">Their past results stay in the league as before.</p>`;
    const s = deps.openSheet(box, { label: m.name });
    const done = (msg: string): void => { s.close(); cwToast(msg); pages.delete(p.crew.id); memberCache.delete(p.crew.id); forget(); paint(); };
    box.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest('[data-x]') as HTMLElement | null;
      if (!b) return;
      const a = await existing(); if (!a) return;
      try {
        if (b.dataset.x === 'card') { s.close(); go({ k: 'player', crewId: p.crew.id, accountId }); }
        if (b.dataset.x === 'admin') { await a.setRole(p.crew.id, accountId, 'admin'); done(`${m.name} is an admin`); }
        if (b.dataset.x === 'unadmin') { await a.setRole(p.crew.id, accountId, 'member'); done(`${m.name} is a member again`); }
        if (b.dataset.x === 'handover') {
          if (!(await ask(`Make ${m.name} the leader of ${p.crew.name}?`, { yes: 'Hand over', detail: 'You become an admin. Only the new leader can change the crew’s settings or hand it back.' }))) return;
          await a.handOver(p.crew.id, accountId); done(`${m.name} leads ${p.crew.name} now`);
        }
        if (b.dataset.x === 'remove') {
          if (!(await ask(`Remove ${m.name} from ${p.crew.name}?`, { yes: 'Remove', danger: true, detail: 'Their past results stay in the league as before.' }))) return;
          await a.removeMember(p.crew.id, accountId); done(`${m.name} was removed`);
        }
      } catch (err) { toast(msgOf(err)); }
    });
  }

  function inviteSheet(p: CrewPage): void {
    if (!p.code) { toast('Only the leader and admins can invite to this crew.'); return; }
    const code = p.code.code;
    const lead = p.role === 'owner';
    const box = sheetBox();
    const draw = (): void => {
      const k = p.code!.code;
      box.innerHTML = `<div class="hrow"><b class="sh2">Invite to ${esc(p.crew.name)}</b></div>`
        + `<div class="qrw"><div class="qrimg">${qrSvg(linkFor(k), { dark: '#111111', light: '#ffffff' })}</div><div class="qrc"><span class="klbl">Code</span><b class="big" data-testid="invite-code">${formatCrewCode(k)}</b><small class="mut">Scan with any phone camera, or type the code in Crews › Join</small></div></div>`
        + shareButtons(k, p.crew.name, false)
        + `<div class="pnl" style="gap:10px"><label class="swrow"><span>Let people in by themselves<small>Off: you or an admin approves each one</small></span><input type="checkbox" role="switch" ${p.crew.auto_admit ? 'checked' : ''} ${lead ? '' : 'disabled'} data-testid="invite-auto"></label>`
        + `<div class="hrow" style="font-size:12.5px"><span class="mut">Code made ${monthDay(p.code!.made_at)} · used ${p.code!.uses} time${p.code!.uses === 1 ? '' : 's'}</span><span class="sp"></span>${lead ? '<button class="lnk" data-x="newcode" data-testid="new-code">Make a new code</button>' : ''}</div></div>`;
    };
    draw();
    void code;
    deps.openSheet(box, { label: `Invite to ${p.crew.name}` });
    box.addEventListener('change', async (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.testid !== 'invite-auto') return;
      try { const a = await existing(); await a!.crewSettings(p.crew.id, { autoAdmit: t.checked }); p.crew.auto_admit = t.checked; pages.delete(p.crew.id); } catch (err) { t.checked = !t.checked; toast(msgOf(err)); }
    });
    box.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest('[data-x]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.x === 'newcode') {
        if (!(await ask('Make a new code?', { yes: 'New code', detail: 'The old code and links stop working at once.' }))) return;
        try { const a = await existing(); const k = await a!.newCrewCode(p.crew.id); p.code = { code: k, made_at: new Date().toISOString(), uses: 0 }; pages.delete(p.crew.id); draw(); cwToast('New code made'); } catch (err) { toast(msgOf(err)); }
        return;
      }
      shareAction(b.dataset.x!, p.code!.code, p.crew.name);
    });
  }

  function moreSheet(p: CrewPage): void {
    const box = sheetBox();
    box.innerHTML = `<div class="alist">${p.role !== 'member' ? `<button class="row" data-x="settings">${ic('gear')}<span class="txt"><b>Crew settings</b><small>${p.role === 'owner' ? 'Name, badge, who hosts, seasons, disputes' : 'Seat disputes, corrections'}</small></span><span class="go">›</span></button>` : ''}`
      + (p.can_host ? `<button class="row" data-x="host">${ic('cards')}<span class="txt"><b>Host a crew table</b><small>The crew’s rules filled in</small></span><span class="go">›</span></button>` : '')
      + `<button class="row" data-x="leave">${ic('door')}<span class="txt"><b>Leave crew</b><small>Your results stay in the league</small></span><span class="go">›</span></button></div>`;
    const s = deps.openSheet(box, { label: p.crew.name });
    box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-x]') as HTMLElement | null;
      if (!b) return;
      s.close();
      if (b.dataset.x === 'settings') go({ k: 'settings', id: p.crew.id });
      if (b.dataset.x === 'host') hostSheet(p);
      if (b.dataset.x === 'leave') void leave(p);
    });
  }

  function hostSheet(p: CrewPage): void {
    const rules: TableRules = { ...DEFAULT_RULES, ...p.crew.house_rules };
    const season = p.crew.season_months === 0 ? 'Counts for the league' : `Counts for Season ${p.season?.number ?? p.next_season}`;
    const box = sheetBox();
    box.innerHTML = `<div class="hrow"><b class="sh2">Host a crew table</b><span class="sp"></span><span class="chipt a">${season}</span></div>`
      + `<div class="pnl" style="gap:6px"><span class="klbl">Crew rules</span><span class="rules" data-testid="host-rules">${esc(rulesText(rules))}</span><button class="lnk" data-x="tonight" data-testid="host-tonight">Change for tonight ›</button></div>`
      + `<button class="bb p" data-x="online" data-testid="host-online">Online<small>Friends join from anywhere</small></button>`
      + `<button class="bb s" data-x="offline" data-testid="host-offline">Offline<small>No internet: the host app on a hotspot</small></button>`
      + `<button class="bb g" data-x="qr" data-testid="host-qr">Pair phones by QR<small>No internet and no host app</small></button>`
      + `<p class="hint flat">Everyone in the crew gets a notification that the table is open.</p>`;
    const s = deps.openSheet(box, { label: 'Host a crew table' });
    const cfg = (): TableSettings => ({ ...(rules as TableSettings), crew: p.crew.id });
    box.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest('[data-x]') as HTMLElement | null;
      if (!b) return;
      const a = await existing(); if (!a) return;
      const x = b.dataset.x!;
      try {
        if (x === 'online') {
          (b as HTMLButtonElement).disabled = true;
          const settings = cfg();
          const code = await deps.openTable(settings);
          await a.hostCrewTable(p.crew.id, code, 'online', rules).catch((err: unknown) => toast(msgOf(err)));
          s.close();
          return;
        }
        if (x === 'tonight') {
          s.close();
          deps.changeForTonight(cfg(), (code, c, save) => {
            const r: TableRules = { ...c }; delete (r as TableSettings).crew;
            void a.hostCrewTable(p.crew.id, code, 'online', r).catch((err: unknown) => toast(msgOf(err)));
            if (save) void a.crewSettings(p.crew.id, { houseRules: r }).then(() => pages.delete(p.crew.id)).catch((err: unknown) => toast(msgOf(err)));
          }, p.role === 'owner');
          return;
        }
        if (x === 'offline' || x === 'qr') {
          await a.hostCrewTable(p.crew.id, null, x, rules);
          s.close();
          if (x === 'offline') deps.hostOffline(); else deps.hostQr();
        }
      } catch (err) { (b as HTMLButtonElement).disabled = false; toast(msgOf(err)); }
    });
  }

  async function leave(p: CrewPage): Promise<void> {
    if (p.role === 'owner' && p.members > 1) {
      await ask(`Hand over ${p.crew.name} first`, { yes: 'OK', no: 'Close', detail: 'A leader leaves after making someone else the leader: Members › ⋯ › Hand over leadership.' });
      return;
    }
    const alone = p.role === 'owner';
    const yes = await ask(`Leave ${p.crew.name}?`, { yes: 'Leave', no: 'Stay', danger: true, detail: alone ? 'You are the last member: the crew closes. Its games stay in your history.' : 'Your results stay in the league as “Former player”. You can ask to join again later.' });
    if (!yes) return;
    try {
      const a = await existing(); await a!.leaveCrew(p.crew.id);
      pages.delete(p.crew.id); forget(); if (selected === p.crew.id) selected = null;
      cwToast(`You left ${p.crew.name}`, 'door'); home();
    } catch (e) { toast(msgOf(e)); }
  }

  // ---------------------------------------------------------------- crew settings (leader; admins see disputes and corrections)
  async function drawSettings(pane: HTMLElement, id: string, my: number): Promise<void> {
    let p: CrewPage;
    try { p = await loadPage(id, true); } catch (e) { if (live(my)) pane.innerHTML = failHtml(e); return; }
    if (!live(my)) return;
    const lead = p.role === 'owner';
    const c = p.crew;
    const dis = lead ? '' : 'disabled';
    const seg = <T extends string | number>(name: string, opts: [T, string, string?][], on: T, label = name): string => `<div class="seg" role="radiogroup" aria-label="${label}">${opts.map(([v, t, al]) => `<button role="radio" aria-checked="${v === on}" class="${v === on ? 'on' : ''}" data-set="${name}" data-v="${v}"${al ? ` aria-label="${al}"` : ''} ${dis}>${t}</button>`).join('')}</div>`;
    const len = seasonLengthOf(c);
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const anchor = c.season_anchor && c.season_anchor >= today ? c.season_anchor : '';
    const ends = p.season?.ends_at ? `${seasonLabel(p.season)} ${endsIn(p.season.ends_at)} (${dayMonth(p.season.ends_at)})` : c.season_months === 0 ? 'No seasons: one all-time league' : `Season ${p.next_season} starts with the next game`;
    pane.innerHTML = head('Crew settings', lead ? 'Only you and admins see this' : 'Only the leader changes the name, badge, hosting and seasons')
      + `<div class="pnl"><div class="hrow">${emblem(c, 54)}<label class="fld" style="flex:1"><span>Name</span><span class="inp"><input type="text" maxlength="24" value="${esc(c.name)}" ${dis} data-testid="set-name" aria-label="Crew name"></span></label></div>`
      + `<div class="hrow" style="font-size:12.5px"><span class="mut">Badge and colour</span><span class="sp"></span>${lead ? '<button class="lnk" data-x="badge" data-testid="set-badge">Change ›</button>' : ''}</div></div>`
      + `<div class="pnl"><span class="klbl">Who can host crew tables</span>${seg<WhoHosts>('hosts', [['everyone', 'Everyone'], ['admins', 'Admins'], ['leader', 'Only me']], c.who_hosts)}`
      + `<span class="klbl" style="margin-top:4px">League scoring</span>${seg<Scoring>('scoring', [['points', 'Points'], ['bb', 'Big blinds won'], ['average', 'Average']], scoringOf(p), 'League scoring')}`
      + `<p class="hint flat" data-testid="scoring-hint">${HOW_LINE[scoringOf(p)]}</p>`
      + `<span class="klbl" style="margin-top:4px">Season length</span>${seg<SeasonLength>('season', [['2w', '2 wk', '2 weeks'], ['1m', '1 mo', '1 month'], ['2m', '2 mo', '2 months'], ['3m', '3 mo', '3 months'], ['6m', '6 mo', '6 months'], ['off', 'Off']], len, 'Season length')}`
      + `<div class="hrow" style="font-size:12.5px"><span class="mut" data-testid="season-ends-set">${esc(ends)}</span></div>`
      + (len !== 'off' ? `<div class="two sctl"><label class="fld"><span>Next season starts</span><span class="inp"><input type="date" min="${today}" value="${anchor}" ${dis} data-testid="set-season-start" aria-label="Next season starts"></span></label>`
        + (p.season ? `<label class="fld"><span>Season ${p.season.number} name</span><span class="inp"><input type="text" maxlength="24" placeholder="e.g. Monsoon" value="${esc(p.season.title ?? '')}" ${dis} data-testid="set-season-name" aria-label="Season ${p.season.number} name"></span></label>` : '') + '</div>' : '')
      + (lead && len !== 'off' ? `<div class="hrow sbtns">${p.season ? '<button class="lnk" data-x="endnow" data-testid="end-season">End it now ›</button>' : ''}<span class="sp"></span><button class="lnk" data-x="startnow" data-testid="start-season">Start a new season now ›</button></div>` : '')
      + `<label class="swrow"><span>Members can invite<small>Off: only you and admins see the code</small></span><input type="checkbox" role="switch" ${c.members_invite ? 'checked' : ''} ${dis} data-testid="set-invite"></label></div>`
      + `<div class="pnl" style="gap:8px"><button class="row" data-x="disputes" data-testid="set-disputes"><span class="txt"><b>Seat disputes</b><small>${p.disputes ? `${p.disputes} open · someone says a seat wasn’t them` : 'None open'}</small></span>${p.disputes ? `<span class="chipt a">${p.disputes}</span>` : ''}<span class="go">›</span></button>`
      + `<button class="row" data-x="correct" data-testid="set-correct"><span class="txt"><b>Correct a result</b><small>Move chips between players, everyone sees why</small></span><span class="go">›</span></button></div>`
      + (lead ? `<button class="bb g bottom" data-x="delete" data-testid="delete-crew"${p.members > 1 ? ' style="opacity:.6"' : ''}>Delete crew</button><p class="hint flat" style="margin:0 0 20px">Only possible when you are the last member.</p>` : '');
    const save = async (change: Parameters<Account['crewSettings']>[1], ok = 'Saved'): Promise<void> => {
      try { const a = await existing(); await a!.crewSettings(id, change); pages.delete(id); forget(); cwToast(ok); paint(); } catch (e) { toast(msgOf(e)); paint(); }
    };
    const name = pane.querySelector<HTMLInputElement>('[data-testid=set-name]')!;
    name.addEventListener('change', () => { const n = name.value.trim(); if (n && n !== c.name) void save({ name: n }, 'Name saved'); });
    pane.querySelector<HTMLInputElement>('[data-testid=set-invite]')!.addEventListener('change', (e) => void save({ membersInvite: (e.target as HTMLInputElement).checked }));
    pane.querySelector<HTMLInputElement>('[data-testid=set-season-start]')?.addEventListener('change', (e) => { const v = (e.target as HTMLInputElement).value; if (v) void save({ seasonStart: v }, `Next season starts ${dayMonth(v)}`); });
    const sn = pane.querySelector<HTMLInputElement>('[data-testid=set-season-name]');
    sn?.addEventListener('change', async () => { if (!p.season) return; try { const a = await existing(); await a!.renameSeason(id, p.season.id, sn.value.trim()); pages.delete(id); cwToast('Season name saved'); paint(); } catch (err) { toast(msgOf(err)); paint(); } });
    pane.onclick = async (e) => {
      const b = (e.target as HTMLElement).closest('[data-x],[data-set]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.set === 'hosts') return void save({ whoHosts: b.dataset.v as WhoHosts });
      if (b.dataset.set === 'season') return void save(seasonLengthArgs(b.dataset.v as SeasonLength), 'Season length saved: it applies from the next season');
      if (b.dataset.set === 'scoring') return void save({ scoring: b.dataset.v as Scoring }, 'League scoring saved');
      if (x0(b) === 'startnow') {
        const nm = await ask(p.season ? `End ${seasonLabel(p.season)} and start a new season now?` : 'Start a new season now?', { yes: 'Start it', detail: 'The standings so far are final and the season trophy is given. Name the new season if you like.', input: { placeholder: 'Season name (optional)', max: 24 } });
        if (nm === false || nm == null) return;
        try { const a = await existing(); const ns = await a!.startSeasonNow(id, typeof nm === 'string' && nm.trim() ? nm.trim() : null); pages.delete(id); forget(); cwToast(`${seasonLabel(ns)} started`); paint(); } catch (err) { toast(msgOf(err)); }
        return;
      }
      const x = b.dataset.x;
      if (x === 'back') return back();
      if (x === 'badge') return badgeSheet(p, (badge, color) => void save({ badge, color }, 'Badge saved'));
      if (x === 'endnow') {
        if (!(await ask(`End Season ${p.season?.number} now?`, { yes: 'End it now', danger: true, detail: 'The standings are final and the season trophy is given. The next game starts a new season.' }))) return;
        try { const a = await existing(); await a!.endSeasonNow(id); pages.delete(id); cwToast('Season ended'); paint(); } catch (err) { toast(msgOf(err)); }
        return;
      }
      if (x === 'disputes') return void disputesSheet(p);
      if (x === 'correct') { const cur = top(); if (cur.k === 'settings') { views.pop(); } go({ k: 'crew', id, tab: 'games' }); toast('Open a game, then Correct a result.'); return; }
      if (x === 'delete') {
        if (p.members > 1) { await ask('Only the last member can delete a crew', { yes: 'OK', no: 'Close', detail: 'Remove the others or hand over first.' }); return; }
        if (!(await ask(`Delete ${p.crew.name}?`, { yes: 'Delete', danger: true, detail: 'The crew, its league and its code go. Games stay in your history.' }))) return;
        try { const a = await existing(); await a!.deleteCrew(id); pages.delete(id); forget(); selected = null; cwToast('Crew deleted', 'x'); home(); } catch (err) { toast(msgOf(err)); }
      }
    };
  }

  function badgeSheet(p: CrewPage, done: (b: Badge, c: string) => void): void {
    let badge = p.crew.badge, color = p.crew.color;
    const box = sheetBox();
    const draw = (): void => {
      box.innerHTML = `<b class="sh2">Badge and colour</b><div class="prev">${emblem({ name: p.crew.name, color, badge }, 80)}</div>`
        + `<div class="pick shapes" role="radiogroup" aria-label="Badge">${BADGES.map((b) => `<button role="radio" aria-checked="${b === badge}" class="${b === badge ? 'on' : ''}" data-badge="${b}" aria-label="${b}">${emblem({ name: '', color, badge: b }, 34, '', '')}</button>`).join('')}</div>`
        + `<div class="pick cols" role="radiogroup" aria-label="Colour">${COLORS.map(([a, b2], i) => `<button role="radio" aria-checked="${a === color}" class="${a === color ? 'on' : ''}" data-color="${a}" aria-label="${COLOR_NAMES[i]}" style="background:${a};box-shadow:inset 0 0 0 3px ${b2}"></button>`).join('')}</div>`
        + '<button class="bb p" data-x="save">Save</button>';
    };
    draw();
    const s = deps.openSheet(box, { label: 'Badge and colour' });
    box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-badge],[data-color],[data-x]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.badge) { badge = b.dataset.badge as Badge; draw(); }
      if (b.dataset.color) { color = b.dataset.color; draw(); }
      if (b.dataset.x === 'save') { s.close(); done(badge, color); }
    });
  }

  async function disputesSheet(p: CrewPage): Promise<void> {
    const a = await existing(); if (!a) return;
    const box = sheetBox();
    box.innerHTML = '<b class="sh2">Seat disputes</b><p class="hint" role="status">Loading…</p>';
    const s = deps.openSheet(box, { label: 'Seat disputes' });
    try {
      const list = await a.crewDisputes(p.crew.id);
      box.innerHTML = '<b class="sh2">Seat disputes</b>' + (list.length ? list.map((d) => `<div class="pnl" style="gap:8px"><b>${dayMonth(d.started_at)} · offline, ${d.players} players</b><small class="mut">Someone said a seat with their name was not them (${ago(d.at)}). It became a guest seat. Confirm the night if the rest is right, or void it.</small>`
        + `<div class="two"><button class="bb p sm" data-x="confirm" data-id="${d.game_id}">Confirm the night</button><button class="bb g sm" data-x="open" data-id="${d.game_id}">Open the game</button></div></div>`).join('') : '<p class="hint">No open disputes. When someone says a seat at an offline night was not them, it shows here.</p>');
      box.onclick = async (e) => {
        const b = (e.target as HTMLElement).closest('[data-x]') as HTMLElement | null;
        if (!b) return;
        if (b.dataset.x === 'open') { s.close(); deps.openGame(b.dataset.id!, () => enter(undefined, true)); }
        if (b.dataset.x === 'confirm') { try { await a.confirmOfflineGame(b.dataset.id!); s.close(); pages.delete(p.crew.id); cwToast('Night confirmed'); paint(); } catch (err) { toast(msgOf(err)); } }
      };
    } catch (e) { box.innerHTML = failHtml(e); }
  }

  // ---------------------------------------------------------------- a player's card
  /** The season in numbers: a compact grid (league scoring, 20261103000017). */
  function statsGrid(pc: PlayerCard): string {
    if (pc.nights == null) return '';
    const n = (v: number | null | undefined, f: (x: number) => string = String): string => (v == null ? '–' : f(Number(v)));
    const cells: [string, string, string?][] = [
      [n(pc.nights), 'nights'], [n(pc.avg_points, ptsText), 'pts/night'], [n(pc.wins), 'wins'],
      [n(pc.top3), 'top 3'], [n(pc.rebuys), 'rebuys'], [n(pc.busts), 'busts'],
      [n(pc.bb_night, (x) => bbText(x, false)), 'bb/night', upDown(pc.bb_night)], [n(pc.bb100, (x) => bbText(x, false)), 'bb/100 hands', upDown(pc.bb100)], [n(pc.sd_won, (x) => `${x}%`), 'showdowns won'],
      [n(pc.best_night, (x) => bbText(x, false)), 'biggest night', upDown(pc.best_night)], [n(pc.worst_night, (x) => bbText(x, false)), 'worst night', upDown(pc.worst_night)],
    ];
    return `<div class="pnl"><span class="klbl">This season</span><div class="sgrid" data-testid="player-stats">${cells.map(([v, l, c]) => `<div><b class="${c ?? ''}">${v}</b><small>${l}</small></div>`).join('')}</div></div>`;
  }
  async function drawPlayer(pane: HTMLElement, crewId: string, accountId: string, my: number): Promise<void> {
    R.emit('crew.view', { kind: 'card', crew: crewId, account: accountId, size });
    pane.innerHTML = '<p class="hint" role="status">Loading…</p>';
    const a = await existing(); if (!a) return;
    let pc: PlayerCard, p: CrewPage;
    try { [pc, p] = await Promise.all([a.playerCard(crewId, accountId), loadPage(crewId)]); } catch (e) { if (live(my)) pane.innerHTML = failHtml(e); return; }
    if (!live(my)) return;
    const role = pc.role ? ROLE_NAME[pc.role] : 'former member';
    const sub = [pc.rank ? `${ordinal(pc.rank)} this season` : '', pc.first_season && p.crew.season_months ? `member since Season ${pc.first_season}` : pc.joined_at ? `member since ${monthName(pc.joined_at)}` : ''].filter(Boolean).join(' · ');
    let best = '<p class="hint flat">No showdown won this season yet.</p>';
    if (pc.best) {
      let five: string[] = [];
      const known = [...(pc.best.cards ?? []), ...(pc.best.board ?? [])];
      if (known.length >= 5) { try { const e = evalBest(known.map(parseCard)); if (e) five = e.cards.map(cardStr); } catch { /* unreadable cards */ } }
      best = `${five.length ? `<div class="hrow bestc" style="gap:5px">${five.map((x) => cardImg(x, 34)).join('')}</div>` : ''}<small class="mut">${HAND_NAMES[pc.best.rank] ?? 'A good hand'} · ${dayMonth(pc.best.at)}</small>`;
    }
    const pct = pc.hands ? Math.round((100 * pc.won) / pc.hands) : null;
    pane.innerHTML = head(pc.name, `${p.crew.name} · ${role}`)
      + `<div class="pcard">${av({ id: pc.account_id, name: pc.name, avatar: pc.avatar ?? null }, 86)}<b data-testid="player-name">${esc(pc.name)}</b><span class="mut" style="font-size:12.5px">${esc(sub)}</span></div>`
      + `<div class="three"><div class="stat"><b>${pc.games}</b><small>${scoringOf(p) === 'bb' ? 'games' : 'nights'}</small></div><div class="stat"><b class="${upDown(pc.bb)}">${pc.bb == null ? '–' : bbText(pc.bb, false)}</b><small>bb this season</small></div><div class="stat"><b>${pct == null ? '–' : `${pct}%`}</b><small>hands won</small></div></div>`
      + statsGrid(pc)
      + `<div class="pnl"><span class="klbl">Best hand this season</span>${best}</div>`
      + `<div class="pnl"><div class="hrow"><span class="klbl">Last ${pc.form.length || 8} games</span><span class="sp"></span><span class="acc">${spark([0, ...pc.form.map(Number)], 140)}</span></div>${pc.form_points?.length ? `<div class="formp" data-testid="form-points" aria-label="Points, last ${pc.form_points.length} nights">${pc.form_points.map((v) => `<span class="${v > 0 ? 'tu' : v < 0 ? 'td' : ''}">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}</span>`).join('')}</div>` : ''}</div>`
      + `<div class="pnl"><span class="klbl">Trophies</span>${pc.trophies.length ? `<div class="troph">${pc.trophies.slice(0, 6).map((t) => `<span><i>${TROPHY[t.kind]?.[0] ?? '🏅'}</i><small>${t.kind === 'season_winner' && t.season ? `Season ${t.season}` : TROPHY[t.kind]?.[1] ?? t.kind}</small></span>`).join('')}</div>` : '<p class="hint flat">None yet.</p>'}</div>`;
    // their profile: the card, the achievements they show, their nights with this crew
    pane.insertAdjacentHTML('beforeend', `<button class="bb s" data-x="profile" data-testid="player-profile">${esc(pc.name)}’s card and achievements</button>`);
    pane.onclick = (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-x=back]')) back();
      else if (t.closest('[data-x=profile]')) location.hash = `#/profile/${pc.account_id}`;
    };
  }

  // ---------------------------------------------------------------- routes
  /** #/crews, #/crews/<id> (a notification), #/c/<6-character code>[?from=<id>] (a shared crew link) */
  function route(): boolean {
    const h = location.hash;
    let m = /^#\/crews(?:\/([0-9a-f-]{36}))?$/.exec(h);
    if (m) { history.replaceState(null, '', location.pathname); if (m[1]) { enter(); openCrew(m[1]); } else enter(); return true; }
    m = /^#\/c\/([A-Za-z0-9]{3}-?[A-Za-z0-9]{3})(?:\?from=([0-9a-f-]{36}))?$/.exec(h);
    if (m) {
      const code = cleanCrewCode(m[1]!);
      if (!isCrewCode(code)) return false;
      history.replaceState(null, '', location.pathname);
      enter({ k: 'join', code: undefined });
      void findCrew(code, m[2] ?? null, null).then(() => { const cur = top(); if (cur.k === 'join') { /* stays on the code boxes (a wrong code shows there) */ } });
      return true;
    }
    return false;
  }

  return {
    /** the Crews tab */
    tab: (): void => enter(),
    /** a crew's page (from the menu's "Your crews") */
    open: (id: string): void => { enter(); openCrew(id); },
    create: (): void => enter({ k: 'create' }),
    route,
  };
}

function head(title: string, sub = '', right = '', back = true): string {
  return `<header class="v3h">${back ? '<button class="ib" data-x="back" aria-label="Back">‹</button>' : ''}<div><h1 class="t">${esc(title)}</h1>${sub ? `<small>${esc(sub)}</small>` : ''}</div><span class="sp"></span>${right}</header>`;
}
const msgOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));
function failHtml(e: unknown): string {
  const off = navigator.onLine === false;
  return `<p class="hint" role="alert">${off ? 'This needs the internet. Games still work offline.' : `Something went wrong: ${esc(msgOf(e))}`}</p><button class="bb g sm" data-x="retry">Try again</button>`;
}

/** the crew's scoring (older answers have none: big blinds won) */
const scoringOf = (p: CrewPage): Scoring => p.crew.scoring ?? 'bb';
/** nights it takes to be ranked: 4 on points, 3 on big blinds per night (none on big blinds won) */
const minNights = (sc: Scoring): number => (sc === 'points' && scoreV === 2 ? 4 : 3);
/**
 * Which points scoring the database is using: 2 is the game score (players beaten + chip score − rebuys, four
 * nights to be ranked), 1 the points before it. A points crew's league says so (min_nights); this phone
 * remembers the answer, so the words never describe a scoring the numbers were not made with.
 */
let scoreV: 1 | 2 = ((): 1 | 2 => { try { return localStorage.getItem('tp-score-v') === '2' ? 2 : 1; } catch { return 1; } })();
function learnScoring(lg: { scoring?: Scoring; min_nights?: number } | null): void {
  if (!lg || (lg.scoring ?? 'points') !== 'points' || lg.min_nights == null) return;
  scoreV = lg.min_nights >= 4 ? 2 : 1;
  try { localStorage.setItem('tp-score-v', String(scoreV)); } catch { /* blocked */ }
}
/** points per night: 4.33 → "4.3", 4 → "4.0" */
const ptsText = (n: number | string): string => { const v = Number(n); return `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`; };
const x0 = (b: HTMLElement): string | undefined => b.dataset.x;
