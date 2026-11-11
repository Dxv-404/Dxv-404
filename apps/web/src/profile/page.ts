// The Profile tab: the collectible card (its slot, until the card art is drawn), the next milestones, the
// season strip, a night's chip graph, the calendar of the year, big moments, streaks and history, and the
// achievements cabinet. One answer from the database fills it all (Account.profilePage); a sample page
// stands in for tests, screenshots and the preview a guest sees. One layout per screen size, as the crews
// screens: phones (one column), sideways phones (the card fixed on the left), tablets (two columns),
// laptops and desktops (the rail and three columns). Colours, type and corners are the theme's own tokens.
import type { HandTile, ProfileDay, ProfileNight, ProfilePage } from '@tp/account';
import { navBar, openPicker, railBar, type MenuActions } from '../ui/shell';
import { applyFeel, av, btn, cardImg, el, esc, fmtN, ic, level, ordinal, sizeOf, type Size } from '../crews/kit';
import { existing, ensure } from '../crews/data';
import { myAvatar } from '../avatars';
import { currentTheme } from '../table/screen';
import { allBars, areaOf, cabinet, cardStats, dayText, graphGeo, heatGrid, heatSummary, istDayKey, nextBars, pathOf, rankSteps, serialOf, sideOf, signed, titleOf, type Bar, type GraphMark, type Slot } from './math';
import { demoProfile } from './demo';
import { hasPoster, posterUrl, stageSvg } from './poster';
import { track, watchSections } from './track';

type Sheet = { close(): void; sheet: HTMLElement };

// a tap on the card's animated poster plays the character's move; the poster's page says so
if (typeof window !== 'undefined') window.addEventListener('message', (e) => { const d = e.data as { t?: string; id?: string } | null; if (e.origin === location.origin && d?.t === 'tp-poster') track('profile-card', { what: 'move', poster: String(d.id ?? '').slice(0, 40) }); });
export interface ProfileDeps {
  screen(build: (el: HTMLElement) => void | (() => void)): void;
  openSheet(content: HTMLElement, o?: { label?: string; onClose?: () => void; tall?: boolean }): Sheet;
  nav(): MenuActions;
  /** the game page (results, hands, replays) */
  openGame(id: string, back: () => void): void;
  /** one hand's replay */
  openReplay(game: string, hand: number, back: () => void): void;
}
type State = 'loading' | 'ok' | 'guest' | 'setup' | 'offline';
interface Target { account: string | null; crew: string | null; demo: boolean }

const HAND_NAMES = ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush', 'Royal flush'];
const GROUPS: [string, string][] = [['cards', 'The cards you hold'], ['play', 'How you play'], ['nights', 'Your nights'], ['crew', 'Crew and seasons'], ['hidden', 'Hidden']];
const chips = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtN(Math.abs(n))}`;
const num = (v: unknown): number => Number(v) || 0;
const store = { set(k: string, v: unknown): void { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } } };

export function profileUi(deps: ProfileDeps) {
  let root: HTMLElement | null = null;
  let size: Size = 'phone';
  let target: Target = { account: null, crew: null, demo: false };
  let state: State = 'loading';
  let data: ProfilePage | null = null;
  let token = 0;
  let nightIx = 0;
  let withTable = false;
  let everyBar = false;
  let seenSent = false;
  let stopWatch: (() => void) | null = null;

  // ---------------------------------------------------------------- entering and loading
  function enter(t: Partial<Target> = {}): void {
    target = { account: null, crew: null, demo: false, ...t };
    data = null; state = 'loading'; nightIx = 0; withTable = false; everyBar = false; seenSent = false;
    deps.screen((main) => {
      main.className = 'screen cw-screen pf-screen with-nav';
      root = main;
      size = sizeOf(innerWidth, innerHeight);
      const onResize = (): void => { const s = sizeOf(innerWidth, innerHeight); if (s !== size) { size = s; paint(false); } };
      const onTheme = (): void => paint(false);
      addEventListener('resize', onResize);
      addEventListener('tp-theme', onTheme);
      paint(true);
      void load();
      return () => { removeEventListener('resize', onResize); removeEventListener('tp-theme', onTheme); stopWatch?.(); stopWatch = null; root = null; token++; };
    });
  }

  async function load(): Promise<void> {
    const my = ++token;
    const done = (s: State, d: ProfilePage | null = null): void => {
      if (my !== token || !root) return;
      state = s; data = d;
      track('profile-open', { state: s, own: d ? d.own : target.account === null, demo: target.demo, crew: d?.crew?.id ?? null, size, nights: d?.nights.length ?? 0, achievements: d?.achievements.length ?? 0, theme: currentTheme() });
      paint(true);
    };
    if (target.demo) return done('ok', demoProfile());
    try {
      const a = await existing();
      if (!a) return done('guest', demoProfile());
      const p = await a.profilePage(target.account, target.crew);
      if (p.own) store.set('tp-profile-news', 0);
      done('ok', p);
      if (p.own) welcome(p);
    } catch {
      // the database part of the profile may not be live yet (or the phone is offline): say so kindly
      done(navigator.onLine === false ? 'offline' : 'setup');
    }
  }

  /**
   * What is new since the profile was last opened, in a sheet: the first time ever, everything already
   * earned ("Welcome: you've already earned 6"); after that, the new ones.
   */
  function welcome(p: ProfilePage): void {
    let first = true;
    try { first = !localStorage.getItem('tp-profile-welcomed'); } catch { /* blocked: greets again */ }
    const fresh = cabinet(p).filter((a) => a.owned && (first || a.owned.new));
    store.set('tp-profile-welcomed', 1);
    if (!fresh.length) return;
    const order = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
    fresh.sort((x, y) => order.indexOf(x.rarity) - order.indexOf(y.rarity));
    const box = el('div', 'cw cw-sheet pf-welcome');
    applyFeel(box);
    box.dataset.testid = 'profile-welcome';
    box.innerHTML = `<div class="hrow"><b class="sh2">${first ? `Welcome: you’ve already earned ${fresh.length}` : `New since last time: ${fresh.length}`}</b></div>`
      + `<p class="hint flat">${first ? 'Every hand you have played here was checked. These are yours already.' : 'Earned at the table since you last looked.'}</p>`
      + `<div class="pf-wlist">${fresh.map((a, i) => `<div class="pf-wrow" style="--i:${Math.min(i, 12)}">${medal(a, 44)}<span><b>${esc(a.name)}</b><small>${esc(a.rarity)}${a.unlocks.length ? ` · ${esc(a.unlocks.join(', '))}` : ''}</small></span></div>`).join('')}</div>`;
    track('profile-welcome', { first, n: fresh.length });
    deps.openSheet(box, { label: 'Profile welcome', tall: fresh.length > 5 });
  }

  /** The profile was looked at: its new achievements count as seen and the bars remember where they were. */
  function markSeen(p: ProfilePage): void {
    if (seenSent || target.demo || !p.own || state !== 'ok') return;
    seenSent = true;
    const vals = Object.fromEntries(Object.entries(p.milestones.values).map(([k, v]) => [k, num(v)]));
    void existing().then((a) => a?.markProfileSeen(vals)).catch(() => undefined);
  }

  // ---------------------------------------------------------------- the layout
  function paint(arrive: boolean): void {
    if (!root) return;
    stopWatch?.(); stopWatch = null;
    const lay = el('div', `cw pf pf-lay s-${size}`);
    lay.dataset.size = size;
    applyFeel(lay);
    if (!arrive) lay.dataset.motion = 'off'; // a redraw (a resize, a theme, a page of the graph) shows end states at once
    const rail = size === 'side' || size === 'lap' || size === 'desk';
    if (rail) lay.append(railBar('profile', deps.nav(), size !== 'side', () => enter()));
    const body = el('div', 'pf-body');
    lay.append(body);
    const nodes: Node[] = [lay];
    if (!rail) { const n = navBar('profile', deps.nav()); n.classList.add('cw-nav'); nodes.push(n); }
    root.classList.toggle('with-nav', !rail);
    root.dataset.size = size;
    root.dataset.state = state;
    root.replaceChildren(...nodes);
    if (state === 'loading') { body.append(headEl(null), el('p', 'hint pf-wait', 'Opening your profile…')); return; }
    if (state === 'setup' || state === 'offline') { body.append(headEl(null), noticeEl()); return; }
    const p = data!;
    const sec = { card: cardSec(p), miles: milesSec(p), season: seasonSec(p), graph: graphSec(p), heat: heatSec(p), moments: momentsSec(p), streaks: streaksSec(p), cabinet: cabinetSec(p) };
    const col = (cls: string, ...kids: (HTMLElement | null)[]): HTMLElement => { const c = el('div', `pf-col ${cls}`); c.append(...kids.filter((k): k is HTMLElement => !!k)); return c; };
    const top = state === 'guest' ? guestEl() : null;
    if (size === 'phone') body.append(headEl(p), col('one', top, sec.card, sec.miles, sec.season, sec.graph, sec.heat, sec.moments, sec.streaks, sec.cabinet), stickyEl(p));
    else if (size === 'side') body.append(col('fix', headEl(p), sec.card), col('rest', top, sec.miles, sec.season, sec.graph, sec.heat, sec.moments, sec.streaks, sec.cabinet));
    else if (size === 'tab') body.append(col('left', headEl(p), sec.card, sec.miles), col('rest', top, sec.season, sec.graph, sec.heat, sec.moments, sec.streaks, sec.cabinet));
    else body.append(col('left', headEl(p), sec.card, sec.miles), col('mid', top, sec.season, sec.graph, sec.moments), col('right', sec.heat, sec.streaks, sec.cabinet));
    if (state === 'guest') lay.classList.add('sample');
    afterPaint(lay, p);
  }

  function afterPaint(lay: HTMLElement, p: ProfilePage): void {
    // the calendar opens with this week in view
    lay.querySelectorAll<HTMLElement>('.pf-heat-scroll').forEach((s) => { s.scrollLeft = s.scrollWidth; });
    // the card shrinks into a slim bar at the top once it has scrolled away (phones)
    const bar = lay.querySelector<HTMLElement>('.pf-sticky'), card = lay.querySelector<HTMLElement>('.pf-card');
    let io: IntersectionObserver | null = null;
    if (bar && card && 'IntersectionObserver' in window) { io = new IntersectionObserver(([e]) => bar.classList.toggle('on', !e!.isIntersecting && e!.boundingClientRect.top < 0)); io.observe(card); }
    countUp(lay);
    const stop = watchSections(lay, () => markSeen(p));
    stopWatch = () => { stop(); io?.disconnect(); };
  }

  /** Full motion only: the milestone numbers count from where they were last seen. */
  function countUp(lay: HTMLElement): void {
    if (lay.dataset.motion !== 'full') return;
    lay.querySelectorAll<HTMLElement>('[data-count]').forEach((b) => {
      const to = Number(b.dataset.count), from = Number(b.dataset.from);
      if (!(to > from)) return;
      const t0 = performance.now();
      const step = (now: number): void => {
        const k = Math.min(1, (now - t0) / 700);
        b.textContent = fmtN(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
        if (k < 1 && b.isConnected) requestAnimationFrame(step);
      };
      b.textContent = fmtN(from);
      requestAnimationFrame(step);
    });
  }

  // ---------------------------------------------------------------- head, notices, the guest's prompt
  function headEl(p: ProfilePage | null): HTMLElement {
    const h = el('header', 'v3h pf-head');
    const other = !!p && !p.own;
    const sub = p ? [p.crew?.name, p.season ? (p.season.title ?? (p.season.number ? `Season ${p.season.number}` : '')) : ''].filter(Boolean).join(' · ') : '';
    h.innerHTML = `${other ? '<button class="ib" data-x="back" aria-label="Back">‹</button>' : ''}<div><h1 class="t">${other ? esc(p!.account.name) : 'Profile'}</h1>${sub ? `<small>${esc(sub)}</small>` : ''}</div><span class="sp"></span>`;
    if (other) h.querySelector('[data-x=back]')!.addEventListener('click', () => history.back());
    if (p && p.own && p.crews.length > 1 && state === 'ok') h.append(btn('bb g sm pf-crewbtn', `${esc(p.crew?.name ?? 'Crew')} <span aria-hidden="true">▾</span>`, () => crewSheet(p), { 'data-testid': 'profile-crew', 'aria-label': 'Change crew' }));
    if (!other && !target.demo) h.append(btn('ib', ic('gear'), () => deps.nav().profile(), { 'aria-label': 'Account', 'data-testid': 'profile-account' }));
    return h;
  }

  function noticeEl(): HTMLElement {
    const off = state === 'offline';
    const n = el('section', 'pnl pf-notice');
    n.setAttribute('role', 'status');
    n.innerHTML = `<h2 class="ttl">${off ? 'You are offline' : 'Profile is being set up'}</h2>`
      + `<p class="hint flat">${off ? 'Your profile needs the internet. Games still work offline.' : 'Your card, achievements and graphs are on their way. Every hand you play is already being counted, so nothing is lost: they will all be here when it opens.'}</p>`;
    n.append(btn('bb g sm', 'Try again', () => { state = 'loading'; paint(true); void load(); }, { 'data-testid': 'profile-retry' }));
    return n;
  }

  function guestEl(): HTMLElement {
    const g = el('section', 'pnl pf-guest');
    g.innerHTML = '<h2 class="ttl">Make your profile</h2><p class="hint flat">Sign in with just a name to get your own card, achievements, milestones and a chip graph of every night. Below is a sample.</p>';
    g.append(btn('bb p', 'Make my profile', async () => { const a = await ensure(); if (a) enter(); }, { 'data-testid': 'profile-signin' }));
    return g;
  }

  function crewSheet(p: ProfilePage): void {
    const box = el('div', 'cw cw-sheet'); applyFeel(box);
    box.innerHTML = `<b class="sh2">Whose league numbers</b><p class="hint flat">The season strip follows the crew. Your achievements, calendar and graphs cover every game.</p><div class="alist">${p.crews.map((c) => `<button class="row" data-crew="${esc(c.id)}"><span class="txt"><b>${esc(c.name)}</b></span>${c.id === p.crew?.id ? ic('check') : '<span class="go">›</span>'}</button>`).join('')}</div>`;
    const s = deps.openSheet(box, { label: 'Profile crew' });
    box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-crew]');
      if (!b) return;
      s.close();
      track('profile-crew', { crew: b.dataset.crew, from: p.crew?.id ?? null });
      if (target.demo) return;
      target = { ...target, crew: b.dataset.crew! }; state = 'loading'; paint(true); void load();
    });
  }

  // ---------------------------------------------------------------- 1. the card (its slot)
  function face(p: ProfilePage, px: number): string {
    return av({ id: p.account.id, name: p.account.name, avatar: p.own && state === 'ok' && !target.demo ? myAvatar() ?? p.account.avatar : p.account.avatar }, px);
  }
  /** The avatar a profile shows (my own pick is on this phone before the account has it). */
  const pickOf = (p: ProfilePage): string | null => ((p.own && state === 'ok') || target.demo || state === 'guest' ? myAvatar() ?? p.account.avatar : p.account.avatar) ?? null;
  function cardSec(p: ProfilePage): HTMLElement {
    const s = section('card', 'pf-cardsec');
    const title = titleOf(p);
    const stats = cardStats(p);
    const pick = pickOf(p);
    const lv = level();
    // the character's animated poster (drawn for the characters players have picked so far); everyone else:
    // their picture, or an empty chair, under the theme's spotlight
    const port = hasPoster(pick)
      ? `<div class="pf-c-port poster" data-poster="${esc(pick!)}"><iframe class="pf-poster" title="${esc(p.account.name)}'s character. Tap to see its move." src="${posterUrl(pick!, lv)}" loading="lazy" scrolling="no"></iframe></div>`
      : `<${p.own && state === 'ok' ? 'button data-x="pick-avatar"' : 'div'} class="pf-c-port stage${pick ? '' : ' empty'}" ${p.own && state === 'ok' ? `aria-label="${pick ? 'Change your character' : 'Choose your character'}"` : 'aria-hidden="true"'}>${stageSvg(!pick)}${pick ? face(p, 112) : ''}`
        + `${pick ? '' : `<span class="pf-c-none">${p.own ? 'No character yet<small>Tap to choose one</small>' : 'No character yet'}</span>`}</${p.own && state === 'ok' ? 'button' : 'div'}>`;
    s.innerHTML = `<div class="pf-card${hasPoster(pick) ? ' has-poster' : ''}" data-testid="profile-card" role="group" aria-label="${esc(p.account.name)}'s card">`
      + `<div class="pf-c-top"><span>${esc(serialOf(p))}</span></div>`
      + port
      + `<div class="pf-c-name"><b>${esc(p.account.name)}</b><small>${title ? esc(title) : 'No title yet'}</small>${p.card?.tagline ? `<i>${esc(p.card.tagline)}</i>` : ''}</div>`
      + `<div class="pf-c-stats">${stats.map((x) => `<span><b>${esc(x.value)}</b><small>${esc(x.label)}</small></span>`).join('')}</div></div>`;
    s.querySelector('[data-x="pick-avatar"]')?.addEventListener('click', () => { track('profile-card', { what: 'pick-avatar' }); void openPicker(() => { if (root?.isConnected) paint(false); }); });
    return s;
  }
  /** Phones: the card as a slim bar once the real one has scrolled away. */
  function stickyEl(p: ProfilePage): HTMLElement {
    const b = el('div', 'pf-sticky');
    b.setAttribute('aria-hidden', 'true');
    const rank = p.season?.rank ? `<span class="chipt a">${ordinal(p.season.rank)}</span>` : '';
    b.innerHTML = `${face(p, 28)}<b>${esc(p.account.name)}</b><span class="sp"></span>${rank}`;
    return b;
  }

  // ---------------------------------------------------------------- 2. milestones
  function barHtml(b: Bar): string {
    const gain = b.gained > 0 && b.from > 0 ? `<span class="pf-gain">+${fmtN(b.gained)}</span>` : '';
    return `<div class="pf-bar${b.done ? ' done' : ''}" data-bar="${b.id}"><div class="pf-bar-h"><b>${esc(b.name)}</b>${gain}<span class="sp"></span><span class="pf-bar-n"><b data-count="${b.value}" data-from="${Math.min(b.value, b.value - b.gained)}">${fmtN(b.value)}</b> / ${fmtN(b.next)}</span></div>`
      + `<div class="pf-track" role="progressbar" aria-valuemin="0" aria-valuemax="${b.next}" aria-valuenow="${Math.min(b.value, b.next)}" aria-label="${esc(b.name)}"><i style="--from:${b.from.toFixed(4)};--to:${b.part.toFixed(4)}"></i></div>`
      + `<small>${b.done ? 'Every step reached' : `${fmtN(Math.max(0, b.next - b.value))} ${esc(b.unit)} to go${b.reward ? ` · unlocks ${esc(b.reward)}` : ''}`}</small></div>`;
  }
  function milesSec(p: ProfilePage): HTMLElement {
    const s = section('miles', 'pnl');
    const bars = everyBar ? allBars(p) : nextBars(p);
    s.innerHTML = `<div class="pf-sh"><h2 class="ttl">${everyBar ? 'All milestones' : 'Next milestones'}</h2></div>${bars.length ? bars.map(barHtml).join('') : '<p class="hint flat">Every milestone is reached.</p>'}`;
    s.querySelector('.pf-sh')!.append(btn('pf-link', everyBar ? 'Show the next three' : 'All milestones', () => { everyBar = !everyBar; track('profile-milestones', { all: everyBar, bars: allBars(p).map((b) => [b.id, b.value, b.gained]) }); swap('miles', milesSec(p)); }, { 'data-testid': 'profile-all-miles' }));
    return s;
  }

  // ---------------------------------------------------------------- 3. the season strip
  function seasonSec(p: ProfilePage): HTMLElement | null {
    const sn = p.season;
    if (!sn) return null;
    const s = section('season', 'pnl');
    const left = Math.max(0, sn.min_games - sn.games);
    const rank = sn.rank ? `<b>${ordinal(sn.rank)}</b><small>of ${sn.of}</small>` : `<b>–</b><small>${left ? `${left} more to rank` : 'not ranked'}</small>`;
    const main = sn.scoring === 'bb' ? `<b>${sn.bb == null ? '–' : chips(Math.round(num(sn.bb)))}</b><small>big blinds</small>` : sn.scoring === 'average' ? `<b>${sn.avg == null ? '–' : signed(sn.avg)}</b><small>bb a night</small>` : `<b>${sn.avg == null ? '–' : signed(sn.avg, 2)}</b><small>average score</small>`;
    s.innerHTML = `<span class="klbl">${esc(sn.title ?? (sn.number ? `Season ${sn.number}` : sn.name))}${p.crew ? ` · ${esc(p.crew.name)}` : ''}</span>`
      + `<div class="pf-strip"><span class="k">${rank}</span><span>${main}</span><span><b>${sn.games}</b><small>game${sn.games === 1 ? '' : 's'}</small></span><span><b>${sn.wins}</b><small>win${sn.wins === 1 ? '' : 's'}</small></span>`
      + `<span><b>${sn.streak ? sn.streak : '–'}</b><small>${sn.streak ? 'won in a row' : 'no streak'}</small></span></div>`;
    return s;
  }

  // ---------------------------------------------------------------- 4. the night chip graph
  function graphSvg(n: ProfileNight): string {
    const big = size === 'tab' || size === 'desk';
    const W = big ? 520 : 358, H = big ? 230 : 204; // drawn at about its own size, so the small print stays readable
    const stepped = currentTheme() === 'pixel';
    const g = graphGeo(n, W, H, [40, 12, 14, 24], withTable);
    const id = `pfg${n.game.slice(-6)}`;
    const short = (c: number): string => (c >= 1000 ? `${(c / 1000).toFixed(c % 1000 ? 1 : 0)}k` : String(c));
    const grid = g.ticks.map((t) => `<path class="grid" d="M40 ${t.y}H${W - 12}"/><text class="ax" x="34" y="${t.y + 3.5}" text-anchor="end">${short(t.chips)}</text>`).join('');
    const others = g.others.map((o) => `<path class="other" d="${pathOf(o.line, stepped)}"><title>${esc(o.name)}</title></path>`).join('');
    const say: Record<GraphMark['kind'], (m: GraphMark) => string> = {
      best: (m) => `Biggest pot won: ${chips(m.chips)} in hand ${m.hand}`, worst: (m) => `Biggest pot lost: ${chips(m.chips)} in hand ${m.hand}`,
      rebuy: (m) => `Rebuy of ${fmtN(m.chips)} before hand ${m.hand}`, earned: (m) => `Achievement earned in hand ${m.hand}`, end: (m) => `Finished ${chips(m.chips)}`,
    };
    const shape: Record<GraphMark['kind'], (m: GraphMark) => string> = {
      best: (m) => `<path class="s" d="M${m.x} ${m.y - 13}l6 9h-12z"/>`, worst: (m) => `<path class="s" d="M${m.x} ${m.y + 13}l6 -9h-12z"/>`,
      rebuy: (m) => `<path class="s" d="M${m.x - 2} ${H - 24}v-16h4v16z"/>`, earned: (m) => `<path class="s" d="M${m.x} ${m.y - 6}l5 6l-5 6l-5 -6z"/>`, end: (m) => `<circle class="s" cx="${m.x}" cy="${m.y}" r="4"/>`,
    };
    const marks = g.marks.map((m, i) => {
      const tap = m.kind === 'best' || m.kind === 'worst' || m.kind === 'earned';
      const hit = tap ? `<circle class="hit" cx="${m.x}" cy="${m.kind === 'best' ? m.y - 9 : m.kind === 'worst' ? m.y + 9 : m.y}" r="20"/>` : '';
      return `<g class="mk ${m.kind}" style="--i:${i}" data-mk="${m.kind}" data-hand="${m.hand}"${tap ? ` tabindex="0" role="button" aria-label="${esc(say[m.kind](m))}. Open the replay"` : ''}>${shape[m.kind](m)}${hit}<title>${esc(say[m.kind](m))}</title></g>`;
    }).join('');
    return `<svg class="pf-graph${stepped ? ' stepped' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your chips after each hand: started with ${fmtN(n.start_stack)}, finished ${chips(n.net)}">`
      + `<defs><clipPath id="${id}a"><path d="${sideOf(g, true)}"/></clipPath><clipPath id="${id}b"><path d="${sideOf(g, false)}"/></clipPath>`
      + `<clipPath id="${id}r"><rect class="reveal" x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>`
      + `${grid}<text class="ax" x="40" y="${H - 7}">hand ${g.hands[0] + 1}</text><text class="ax" x="${W - 12}" y="${H - 7}" text-anchor="end">hand ${g.hands[1]}</text>`
      + `<g clip-path="url(#${id}r)">${others}<path class="g-up" clip-path="url(#${id}a)" d="${areaOf(g, stepped)}"/><path class="g-dn" clip-path="url(#${id}b)" d="${areaOf(g, stepped, true)}"/>`
      + `<path class="line" d="${pathOf(g.line, stepped)}"/></g>`
      + `<path class="buy" d="${pathOf(g.buyin)}"/><text class="ax buyl" x="${W - 14}" y="${g.buyin[g.buyin.length - 1]!.y - 5}" text-anchor="end">buy-in</text>${marks}</svg>`;
  }
  function graphSec(p: ProfilePage): HTMLElement {
    const s = section('graph', 'pnl');
    if (!p.nights.length) { s.innerHTML = '<h2 class="ttl">Night chip graph</h2><p class="hint flat">Play a night and its story is drawn here: your stack after every hand.</p>'; return s; }
    nightIx = Math.min(nightIx, p.nights.length - 1);
    const n = p.nights[nightIx]!;
    const day = dayText(istDayKey(Date.parse(n.at)));
    const legend = [n.best ? `<span class="pk pk-w"><i></i>biggest pot won ${chips(n.best.chips)}</span>` : '', n.worst ? `<span class="pk pk-l"><i></i>biggest lost ${chips(n.worst.chips)}</span>` : '',
      n.rebuys.length ? `<span class="pk pk-r"><i></i>${n.rebuys.length} rebuy${n.rebuys.length === 1 ? '' : 's'}</span>` : ''].join('');
    s.innerHTML = `<div class="pf-sh"><h2 class="ttl">Night chip graph</h2><span class="sp"></span><span class="pf-pager"></span></div>`
      + `<div class="pf-gh"><b>${esc(day)}</b><span class="mut">table ${esc(n.table)} · ${n.hands.length} hands</span><span class="sp"></span><b class="${n.net > 0 ? 'pos' : n.net < 0 ? 'neg' : ''}">${chips(n.net)}</b><span class="chipt${n.place === 1 ? ' a' : ''}">${ordinal(n.place)} of ${n.players}</span></div>`
      + `<div class="pf-gwrap" data-testid="profile-graph">${n.hands.length ? graphSvg(n) : '<p class="hint flat">This night was recorded before chip graphs were kept.</p>'}</div>`
      + `<div class="pf-legend">${legend}</div><div class="pf-gfoot"></div>`;
    const go = (d: number, how: string): void => {
      const to = Math.max(0, Math.min(p.nights.length - 1, nightIx + d));
      if (to === nightIx) return;
      nightIx = to; track('profile-night', { index: to, how, game: p.nights[to]!.game }); swap('graph', graphSec(p));
    };
    const pager = s.querySelector('.pf-pager')!;
    const older = btn('ib', '‹', () => go(1, 'button'), { 'aria-label': 'Older night', 'data-testid': 'graph-older' }), newer = btn('ib', '›', () => go(-1, 'button'), { 'aria-label': 'Newer night', 'data-testid': 'graph-newer' });
    older.disabled = nightIx >= p.nights.length - 1; newer.disabled = nightIx === 0;
    pager.append(older, el('span', 'mut', `${nightIx + 1} / ${p.nights.length}`), newer);
    const foot = s.querySelector('.pf-gfoot')!;
    if (n.lines.some((l) => l.hands?.length)) foot.append(btn(`pf-link${withTable ? ' on' : ''}`, withTable ? 'Hide the table' : 'Show table', () => { withTable = !withTable; track('profile-table', { on: withTable, game: n.game }); swap('graph', graphSec(p)); }, { 'data-testid': 'graph-table', 'aria-pressed': String(withTable) }));
    if (!target.demo && state === 'ok') foot.append(btn('pf-link', 'Open this game', () => deps.openGame(n.game, () => enter(target)), { 'data-testid': 'graph-game' }));
    // a mark opens its hand's replay
    const open = (e: Event): void => {
      const m = (e.target as Element).closest<SVGGElement>('.mk[role=button]');
      if (!m) return;
      const hand = Number(m.dataset.hand), can = !target.demo && state === 'ok';
      track('profile-mark', { mark: m.dataset.mk, hand, game: n.game, replay: can });
      if (can) deps.openReplay(n.game, hand, () => enter(target));
    };
    const wrap = s.querySelector<HTMLElement>('.pf-gwrap')!;
    wrap.addEventListener('click', open);
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
    // swipe sideways for older and newer nights
    let x0: number | null = null;
    wrap.addEventListener('touchstart', (e) => { x0 = e.touches[0]!.clientX; }, { passive: true });
    wrap.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0]!.clientX - x0; x0 = null; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1, 'swipe'); }, { passive: true });
    return s;
  }

  // ---------------------------------------------------------------- 5. the calendar
  function heatSec(p: ProfilePage): HTMLElement {
    const s = section('heat', 'pnl');
    const today = istDayKey(Date.now());
    const grid = heatGrid(p.heatmap, target.demo || state === 'guest' ? p.heatmap[p.heatmap.length - 1]?.day ?? today : today);
    const sum = heatSummary(p.heatmap);
    const line = sum.nights ? [`${sum.nights} night${sum.nights === 1 ? '' : 's'}`, sum.best ? `best day ${sum.best}` : '', sum.weekday ? `most played on ${sum.weekday}` : '', p.streaks.weeks.longest > 1 ? `longest weekly streak ${p.streaks.weeks.longest}` : ''].filter(Boolean).join(' · ') : 'No nights yet. Each day you play becomes a square here.';
    const cols = grid.map((w, i) => `<div class="pf-wk" style="--i:${i}">${w.month ? `<span class="pf-mo">${w.month}</span>` : ''}${w.cells.map((c) => {
      if (!c) return '<i class="pf-d none"></i>';
      if (c.level === null) return `<i class="pf-d${c.today ? ' today' : ''}"></i>`;
      const lab = `${dayText(c.day)}: ${c.games} game${c.games === 1 ? '' : 's'}, score ${signed(c.data!.score)}${c.won ? ', a night won' : ''}${c.earned ? `, ${c.earned} achievement${c.earned === 1 ? '' : 's'}` : ''}`;
      return `<button type="button" class="pf-d l${c.level < 0 ? 'n' : 'p'}${Math.abs(c.level)}${c.won ? ' won' : ''}${c.earned ? ' ach' : ''}${c.today ? ' today' : ''}" data-day="${c.day}" aria-label="${esc(lab)}"></button>`;
    }).join('')}</div>`).join('');
    s.innerHTML = `<h2 class="ttl">Calendar</h2><p class="hint flat">${esc(line)}</p>`
      + `<div class="pf-heat"><div class="pf-days" aria-hidden="true"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span>Sun</span></div><div class="pf-heat-scroll" data-testid="profile-heat" tabindex="0" role="group" aria-label="The last 12 months, a square a day">${cols}</div></div>`
      + `<div class="pf-legend heat"><span class="mut">loss</span>${[-3, -2, -1, 0, 1, 2, 3].map((l) => `<i class="pf-d l${l < 0 ? 'n' : 'p'}${Math.abs(l)}"></i>`).join('')}<span class="mut">win</span><span class="sp"></span><span class="pk"><i class="pf-d lp2 won"></i>night won</span><span class="pk"><i class="pf-d lp1 ach"></i>achievement</span></div>`;
    s.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-day]');
      const d = b && p.heatmap.find((x) => x.day === b.dataset.day);
      if (d) daySheet(p, d);
    });
    return s;
  }
  function daySheet(p: ProfilePage, d: ProfileDay): void {
    track('profile-day', { day: d.day, games: d.games, score: num(d.score), won: d.won });
    const box = el('div', 'cw cw-sheet pf-daysheet'); applyFeel(box);
    const live = !target.demo && state === 'ok';
    box.innerHTML = `<b class="sh2">${esc(dayText(d.day))}</b><p class="hint flat">${d.games} game${d.games === 1 ? '' : 's'} · score ${signed(d.score)}${d.bb != null ? ` · ${chips(Math.round(num(d.bb)))} bb` : ''}${d.achievements ? ` · ${d.achievements} achievement${d.achievements === 1 ? '' : 's'}` : ''}</p>`
      + `<div class="alist">${d.list.map((g) => `<div class="row"><span class="txt"><b>${ordinal(g.place)} of ${g.players}${g.place === 1 && g.league ? ' · night won' : ''}</b><small>score ${signed(g.score)}${g.bb != null ? ` · ${chips(Math.round(num(g.bb)))} bb` : ''}${g.league ? '' : ' · not a league game'}</small></span>`
        + `${p.nights.some((n) => n.game === g.game) ? `<button class="bb g sm" data-graph="${esc(g.game)}">Chip graph</button>` : ''}${live ? `<button class="bb g sm" data-game="${esc(g.game)}">Open</button>` : ''}</div>`).join('')}</div>`;
    const s = deps.openSheet(box, { label: 'Profile day' });
    box.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const gr = t.closest<HTMLElement>('[data-graph]'), gm = t.closest<HTMLElement>('[data-game]');
      if (gr) { s.close(); nightIx = p.nights.findIndex((n) => n.game === gr.dataset.graph); track('profile-night', { index: nightIx, how: 'day', game: gr.dataset.graph }); swap('graph', graphSec(p))?.scrollIntoView({ block: 'center', behavior: level() === 'off' ? 'auto' : 'smooth' }); }
      if (gm) { s.close(); deps.openGame(gm.dataset.game!, () => enter(target)); }
    });
  }

  // ---------------------------------------------------------------- 6. big moments
  function tileHtml(label: string, t: HandTile | null, key: string): string {
    if (!t) return '';
    const cards = t.cards?.length ? `<span class="pf-cards mine">${t.cards.map((c) => cardImg(c, 34)).join('')}</span>` : '';
    const board = t.board?.length ? `<span class="pf-cards">${t.board.map((c) => cardImg(c, 26)).join('')}</span>` : '';
    return `<button type="button" class="pf-tile" data-tile="${key}" data-game="${esc(t.game)}" data-hand="${t.hand}"><span class="klbl">${esc(label)}</span><b class="${t.chips > 0 ? 'pos' : 'neg'}">${chips(t.chips)}</b>`
      + `<small>${t.bb != null ? `${chips(Math.round(num(t.bb)))} bb · ` : ''}hand ${t.hand} · ${esc(dayText(istDayKey(Date.parse(t.at))))}${t.best_hand != null && t.showdown ? ` · ${HAND_NAMES[t.best_hand] ?? ''}` : ''}</small><span class="pf-tc">${cards}${board}</span></button>`;
  }
  function momentsSec(p: ProfilePage): HTMLElement {
    const s = section('moments', 'pnl');
    const m = p.moments;
    const total = m.winning_hands.reduce((a, w) => a + w.n, 0);
    const wh = m.winning_hands.slice(0, 4).map((w) => `<div class="pf-wh"><span>${esc(HAND_NAMES[w.hand] ?? '')}</span><i><b style="--to:${(w.n / Math.max(1, m.winning_hands[0]!.n)).toFixed(3)}"></b></i><small>${Math.round((100 * w.n) / total)}%</small></div>`).join('');
    const tiles = tileHtml('Biggest pot won', m.biggest_won, 'won') + tileHtml('Biggest pot lost', m.biggest_lost, 'lost') + tileHtml('Hand of the season', m.hand_of_season, 'season');
    s.innerHTML = `<h2 class="ttl">Big moments</h2>${tiles ? `<div class="pf-tiles">${tiles}</div>` : '<p class="hint flat">Your biggest pots and best hands will be kept here.</p>'}`
      + (wh ? `<div class="pf-sub"><span class="klbl">You win most often with</span>${wh}</div>` : '')
      + (m.comebacks.length ? `<div class="pf-sub"><span class="klbl">Comebacks</span>${m.comebacks.slice(0, 3).map((c) => `<button type="button" class="row" data-come="${esc(c.game)}"><span class="txt"><b>Won from ${fmtN(c.low)} chips</b><small>${esc(dayText(istDayKey(Date.parse(c.at))))} · down to ${Math.round((100 * c.low) / c.start_stack)}% of the starting stack</small></span><span class="go">›</span></button>`).join('')}</div>` : '');
    s.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tile]'), c = (e.target as HTMLElement).closest<HTMLElement>('[data-come]');
      const can = !target.demo && state === 'ok';
      if (t) { track('profile-mark', { mark: `tile-${t.dataset.tile}`, hand: Number(t.dataset.hand), game: t.dataset.game, replay: can }); if (can) deps.openReplay(t.dataset.game!, Number(t.dataset.hand), () => enter(target)); }
      if (c && can) deps.openGame(c.dataset.come!, () => enter(target));
    });
    return s;
  }

  // ---------------------------------------------------------------- 7. streaks and history
  function streaksSec(p: ProfilePage): HTMLElement {
    const s = section('streaks', 'pnl');
    const pips = (n: number): string => `<span class="pf-pips" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<i class="${i < Math.min(n, 8) ? 'on' : ''}"></i>`).join('')}</span>`;
    const row = (name: string, st: { current: number; longest: number; longest_at?: string | null }, unit: string): string =>
      `<div class="pf-streak"><span class="txt"><b>${esc(name)}</b><small>longest ${st.longest}${st.longest_at && st.longest ? ` · ${esc(dayText(istDayKey(Date.parse(st.longest_at))))}` : ''}</small></span>${pips(st.current)}<b class="n">${st.current}</b><small class="u">${unit}</small></div>`;
    const h = p.history;
    const ranks = h?.rank_after.map((r) => r.rank) ?? [];
    const rs = rankSteps(ranks, 300, 64, 8);
    const chart = h && rs.d ? `<div class="pf-sub"><span class="klbl">Rank after each game this season</span><div class="pf-rank"><span class="ax">1st</span><span class="ax b">${ordinal(rs.worst)}</span>`
      + `<svg viewBox="0 0 300 64" preserveAspectRatio="none" role="img" aria-label="Rank after each game: now ${ordinal(ranks.filter((r) => r !== null).at(-1) ?? 0)}"><path class="line" d="${rs.d}" vector-effect="non-scaling-stroke"/></svg></div></div>` : '';
    const seasons = h?.seasons.filter((x) => !x.current).slice(0, 4).map((x) => `<div class="pf-srow"><span class="txt"><b>${esc(x.title ?? (x.number ? `Season ${x.number}` : x.name))}</b><small>${x.games} games · ${x.wins} win${x.wins === 1 ? '' : 's'}${x.best_hand != null ? ` · best hand ${esc(HAND_NAMES[x.best_hand] ?? '')}` : ''}</small></span><b class="n">${x.rank ? ordinal(x.rank) : '–'}</b><small class="u">${x.avg != null ? signed(x.avg, 2) : ''}</small></div>`).join('') ?? '';
    const c = p.career;
    s.innerHTML = `<h2 class="ttl">Streaks and history</h2>${row('Nights won in a row', p.streaks.wins, 'now')}${row('Top-three finishes in a row', p.streaks.top3, 'now')}${row('Weeks played in a row', p.streaks.weeks, 'now')}`
      + chart + (seasons ? `<div class="pf-sub"><span class="klbl">Past seasons</span>${seasons}</div>` : '')
      + `<div class="pf-sub"><span class="klbl">Career</span><div class="pf-career"><span class="stat"><b>${fmtN(c.hands)}</b><small>hands</small></span><span class="stat"><b>${c.nights}</b><small>nights</small></span><span class="stat"><b>${Math.round(num(c.hours))}</b><small>hours</small></span><span class="stat"><b>${c.achievements}</b><small>achievements</small></span></div></div>`;
    return s;
  }

  // ---------------------------------------------------------------- 8. the cabinet
  const mono = (name: string): string => name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter((w) => !/^(the|of|a)$/i.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  /** The medal until its art is drawn: a shell whose rings say how rare it is, with the name's initials. */
  function medal(a: Slot, px = 54): string {
    const has = !!a.owned;
    return `<span class="pf-medal r-${a.rarity}${has ? '' : ' locked'}" style="--m:${px}px" aria-hidden="true"><svg viewBox="0 0 60 60"><circle class="o" cx="30" cy="30" r="27"/><circle class="in" cx="30" cy="30" r="21.5"/>${a.rarity === 'legendary' || a.rarity === 'mythic' ? '<circle class="dots" cx="30" cy="30" r="24.3"/>' : ''}</svg><b>${has ? esc(mono(a.name)) : a.hidden ? '?' : ''}</b>${a.tier ? `<i>${'I'.repeat(a.tier).replace('IIII', 'IV')}</i>` : ''}</span>`;
  }
  function cabinetSec(p: ProfilePage): HTMLElement {
    const s = section('cabinet', 'pnl');
    const all = cabinet(p);
    const have = all.filter((a) => a.owned).length;
    s.innerHTML = `<div class="pf-sh"><h2 class="ttl">Achievements</h2><span class="sp"></span><span class="mut"><b>${have}</b> of ${all.length}</span></div>`
      + GROUPS.map(([g, name]) => `<div class="pf-sub"><span class="klbl">${esc(name)}</span><div class="pf-cab">${all.filter((a) => a.group === g).map((a) => {
        const secret = a.hidden && !a.owned;
        return `<button type="button" class="pf-ach${a.owned ? ' has' : ''}${a.owned?.new ? ' new' : ''}" data-ach="${a.id}" aria-label="${secret ? 'A hidden achievement, not earned yet' : `${esc(a.name)}: ${a.owned ? 'earned' : `not earned yet. ${esc(a.how)}`}`}">${medal(a)}<b>${secret ? '???' : esc(a.name)}</b><small>${a.owned ? esc(a.rarity) : secret ? 'hidden' : esc(a.how)}</small></button>`;
      }).join('')}</div></div>`).join('');
    s.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ach]');
      const a = b && all.find((x) => x.id === b.dataset.ach);
      if (a) achSheet(p, a);
    });
    return s;
  }
  function achSheet(p: ProfilePage, a: Slot): void {
    const secret = a.hidden && !a.owned;
    track('profile-achievement', { id: a.id, owned: !!a.owned, hidden: a.hidden, tier: a.tier, rarity: a.rarity });
    const box = el('div', 'cw cw-sheet pf-achsheet'); applyFeel(box);
    const o = a.owned;
    const when = o ? `Earned ${dayText(istDayKey(Date.parse(o.at)))}${o.hand ? ` · hand ${o.hand}` : ''}${o.reveal === 'night' ? ' · told after the night' : ''}` : 'Not earned yet';
    const crew = p.crew ? `${a.crewHas} of ${p.crew.members} in ${p.crew.name} ${a.crewHas === 1 ? 'has' : 'have'} this` : '';
    box.innerHTML = `<div class="hrow">${medal(a, 72)}<span class="txt"><b class="sh2">${secret ? '???' : esc(a.name)}</b><small class="mut">${secret ? 'hidden' : esc(a.rarity)}${a.tiers ? ` · tier ${a.tier} of ${a.tiers}` : ''}</small></span></div>`
      + `<p class="pf-how">${secret ? 'This one stays a secret until you earn it.' : esc(a.how)}</p>`
      + `<div class="alist"><div class="row"><span class="txt"><b>${esc(when)}</b>${crew && !secret ? `<small>${esc(crew)}</small>` : ''}</span></div>`
      + (a.unlocks.length && !secret ? `<div class="row"><span class="txt"><b>${o ? 'Unlocked' : 'Unlocks'}</b><small>${esc(a.unlocks.join(' · '))}</small></span></div>` : '') + '</div>';
    const s = deps.openSheet(box, { label: `Achievement ${secret ? 'hidden' : a.id}` });
    if (o && p.own && state === 'ok' && !target.demo) {
      const t = btn('bb g sm', o.shown ? 'Hide from other players' : 'Show to other players', async () => {
        try { const acc = await existing(); await acc?.showAchievement(a.id, !o.shown); for (const x of p.achievements) if (x.id === a.id) x.shown = !o.shown; s.close(); } catch { t.textContent = 'That did not work. Try again'; }
      }, { 'data-testid': 'ach-show' });
      box.append(t);
    }
    if (o?.game && o.hand && state === 'ok' && !target.demo) box.append(btn('bb g sm', 'Open the hand', () => { s.close(); deps.openReplay(o.game!, o.hand!, () => enter(target)); }));
  }

  // ---------------------------------------------------------------- helpers
  function section(name: string, cls: string): HTMLElement {
    const s = el('section', `pf-sec ${cls}`);
    s.dataset.sec = name;
    return s;
  }
  /** One section drawn again in place (a page of the graph, "all milestones"): no arrival animation. */
  function swap(name: string, fresh: HTMLElement | null): HTMLElement | null {
    const old = root?.querySelector<HTMLElement>(`[data-sec=${name}]`);
    if (!old || !fresh) return null;
    fresh.dataset.again = '1';
    old.replaceWith(fresh);
    return fresh;
  }

  /** #/profile (the tab), #/profile/demo (the sample page), #/profile/<account id> (a crew mate's) */
  function route(): boolean {
    const m = /^#\/profile(?:\/(demo|[0-9a-f-]{36}))?$/.exec(location.hash);
    if (!m) return false;
    history.replaceState(null, '', location.pathname);
    enter(m[1] === 'demo' ? { demo: true } : m[1] ? { account: m[1] } : {});
    return true;
  }

  return {
    /** the Profile tab: my own page */
    tab: (): void => enter(),
    /** a crew mate's page (from the league or a player card) */
    open: (account: string, crew?: string | null): void => enter({ account, crew: crew ?? null }),
    /** the sample page */
    demo: (): void => enter({ demo: true }),
    route,
  };
}
