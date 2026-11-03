// Draws a live table in the signed-off design: the same markup the design pages used (base2.css and the
// theme's CSS style it), filled from the engine's view of this seat, laid out by layout.ts.
import themesJson from './themes.json';
import { arenaSize, fitCard, isCompact, makeGeo, modeFor, place, type Mode } from './layout';
import type { ScreenView } from '../net-table';
import { describePartial, parseCard } from '@tp/engine';
import { FEEL } from './motion';
import { TIER_LABEL, bestOnBoard, chancesLine, handShort, handWords, nextLabel, runoutTitle, summarize, type ResStage, type Summary } from './results';
import { heroRebuyHint } from './rebuy-hint';
import { avatarMarkup, isAvatarId } from '../avatars';

interface ThemeArt { fx: string; arena: string; dealer: string; rail: string; felt: string; pot: string }
export interface Theme { name: string; css: string; sprite: string; phone: ThemeArt; lap: ThemeArt; avatars: string[] }
export const THEMES = themesJson as unknown as Record<string, Theme>;
export const THEME_KEYS = ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo'] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const fmt = (n: number): string => Math.round(n).toLocaleString('en-IN');
const use = (id: string, cls: string): string => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

const SUIT_WORD: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
const RANK_WORD: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', T: 'Ten' };
export const cardName = (code: string): string => `${RANK_WORD[code[0]!] ?? code[0]} of ${SUIT_WORD[code[1]!]}`;

/** A face-up card, e.g. "Ks" (as in the design: small, medium and large draw differently). */
export function card(code: string, w: number, cls = ''): string {
  const r = code[0]!, s = code[1]!;
  const rr = r === 'T' ? '10' : r;
  const size = w < 60 ? 's' : w < 100 ? 'm' : 'l';
  let inner = `<b class="r${rr === '10' ? ' ten' : ''}">${rr}</b>`;
  if (size !== 's') inner += use(`su-${s}`, 'su');
  inner += size === 'l' && 'JQK'.includes(rr) ? `<svg class="art" viewBox="0 0 60 80" aria-hidden="true"><use href="#f${rr}"/></svg>` : use(`su-${s}`, 'pip');
  if (size === 'l') inner += `<span class="ix2"><b>${rr}</b><svg aria-hidden="true"><use href="#su-${s}"/></svg></span>`;
  return `<div class="cd ${size} ${s} ${cls}" style="--w:${w}px" role="img" aria-label="${cardName(code)}">${inner}</div>`;
}
export const back = (w: number, cls = ''): string => `<div class="cd dn ${cls}" style="--w:${w}px"><svg class="bk" viewBox="0 0 50 70" preserveAspectRatio="none" aria-hidden="true"><use href="#cb"/></svg></div>`;
const slot = (w: number): string => `<div class="slot" style="--w:${w}px"></div>`;
const chip = (kind = 'a'): string => `<svg class="chip" viewBox="0 0 24 24" aria-hidden="true"><use href="#ch-${kind}"/></svg>`;

const hash = (s: string): number => { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)!) >>> 0; return h; };
/** Two letters for a name, unescaped: the first letters of the first two words, or the first two letters of one word. */
function initialsRaw(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = (s: string) => Array.from(s)[0] ?? '';
  const t = parts.length > 1 ? first(parts[0]!) + first(parts[1]!) : Array.from(parts[0] ?? '').slice(0, 2).join('');
  return t.toUpperCase();
}
export const initials = (name: string): string => esc(initialsRaw(name));
/**
 * The letters each lettered avatar style shows (design gen/classic.py and minimal.py): classic `ini` two capitals
 * ("RI"), noir `mono` a capital and a small letter ("Ri"), ivory `emb` and velvet `cam` one capital ("R"). The
 * other five themes draw a face and show no letters.
 */
export function avatarLetters(style: string, name: string): string {
  const t = Array.from(initialsRaw(name));
  if (style === 'mono') return (t[0] ?? '') + t.slice(1).join('').toLowerCase();
  if (style === 'emb' || style === 'cam') return t[0] ?? '';
  return t.join('');
}
// the span that carries the letters in a lettered avatar (any extra classes: hue, photo)
const LETTERED = /(<span class="(ini|mono|emb|cam)(?: [^"]*)?">)[^<]*(<\/span>)/;
/**
 * A player's avatar. With a picked avatar (`pick`, an id like "train-night-owl"): that avatar, in its own style
 * whatever the theme. Without one (or an id this build does not know): their initials as before, one of the
 * theme's 14 looks, chosen by id, with the letters of their name.
 */
export function avatar(th: Theme, id: string, name: string, pick?: string | null): string {
  if (isAvatarId(pick)) return avatarMarkup(pick);
  const art = th.avatars[hash(id) % th.avatars.length] ?? '';
  return art.replace(LETTERED, (_m, open: string, style: string, close: string) => `${open}${esc(avatarLetters(style, name))}${close}`);
}

const ACTION: Record<string, string> = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' };

/** Parts that change during play sit in display:contents wrappers (data-k), so the screen can swap just them. */
const dyn = (k: string, html: string): string => `<div class="tpd" data-k="${k}">${html}</div>`;
export interface Frame { html: string; mode: Mode; u: number; lw: number; lh: number; compact: boolean; heroCardW: number; shell: string; parts: Record<string, string> }

/**
 * The whole table as HTML for a W x H screen. `peek`: the player is holding their cards up. `bubble`: what
 * the dealer last said. `code`: the table's code (shown in the top bar).
 */
export function renderTable(v: ScreenView, themeKey: ThemeKey, W: number, H: number, o: { peek: boolean; bubble: string | null; code: string; net: 'good' | 'weak' | 'lost'; title?: string; res?: ResStage | null; elsewhere?: { pid: string; where: string } | null }): Frame {
  const th = THEMES[themeKey] ?? THEMES.classic!;
  const me = v.me;
  const players = v.players;
  const n = players.length;
  const { mode, u, lw, lh, dock } = modeFor(W, H);
  const compact = isCompact(mode, lw, lh, n);
  const [aw, ah] = arenaSize(mode, lw, lh, dock, compact);
  const g = makeGeo(mode, aw, ah, Math.max(n, 2), compact);
  const art = mode === 'lap' ? th.lap : th.phone;
  const hand = v.hand;

  // opponents clockwise from my left (the seat after mine), the way they sit around the real table
  const mineAt = players.findIndex((p) => p.id === me);
  const others = mineAt >= 0 ? players.slice(mineAt + 1).concat(players.slice(0, mineAt)) : players.slice();
  const crowd = n > 10;
  const won = new Set<string>();
  for (const pot of hand?.results?.pots ?? []) for (const a of pot.awards) won.add(a.pid);
  // a crowded table (11 to 15) on a phone has no room for 14 full seats: seats that have nothing going on
  // right now (folded, out of the hand, or simply waiting) shrink to their avatar; the player to act, anyone
  // with chips in front of them, and anyone showing cards stay full size. On big screens only folded seats shrink.
  const seatsFor = (shrinkWaiting: boolean) => others.map((p) => {
    const hp = hand?.ps[p.id];
    const busy = !!hp && !hp.folded && (hand?.toAct === p.id || hp.streetBet > 0 || hp.allIn || (!!hand?.results && won.has(p.id)));
    const mini = crowd && (!!hp?.folded || (shrinkWaiting && !busy));
    return { p, hp, mini, bet: !!hp && hp.streetBet > 0 };
  });
  const dealerIdx = hand?.buttonId ? others.findIndex((p) => p.id === hand.buttonId) : -1;
  let st = seatsFor(mode !== 'lap');
  let placed = place(g, st.map((s) => ({ mini: s.mini, bet: s.bet })), dealerIdx >= 0 ? dealerIdx : null);
  if (!placed.ok && crowd && mode === 'lap') { // a big screen that still cannot fit them all: waiting seats shrink too
    st = seatsFor(true);
    placed = place(g, st.map((s) => ({ mini: s.mini, bet: s.bet })), dealerIdx >= 0 ? dealerIdx : null);
  }
  const cw = fitCard(g, placed, st.map((s) => ({ mini: s.mini, bet: s.bet })), Math.max(n, 2));
  const winners = new Set<string>();
  for (const pot of hand?.results?.pots ?? []) for (const a of pot.awards) winners.add(a.pid);
  // after the hand (results.ts): which step of the reveal is on screen; without one, its end state
  const R = hand?.results ?? null;
  const rs: ResStage | null = R ? (o.res ?? { step: R.showdown ? 'hold' : 'fold' }) : null;
  const step = rs?.step ?? null;
  const nameOf = (pid: string) => players.find((p) => p.id === pid)?.name ?? 'Someone';
  const sum = R ? summarize(R, nameOf) : null;
  // before the winner is shown (the board still running out, the scene) the stacks are as they were before the pot
  const early = step === 'runout' || step === 'scene';
  const stackOf = (p: { id: string; stack: number }): number => p.stack - (early ? sum?.winners.find((w) => w.pid === p.id)?.amount ?? 0 : 0);
  const evals = R?.evals ?? {};
  // seats that show their cards now, and how: the winners from 'winner' on, everyone else at the showdown from 'all'
  const showNow = (pid: string): boolean => !!evals[pid] && (step === 'runout' || ((step === 'winner') && winners.has(pid)) || step === 'all' || step === 'hold');
  const losers = R ? others.filter((p) => evals[p.id] && !winners.has(p.id)).map((p) => p.id) : [];
  const big = mode === 'lap' ? 4 : 0;

  // seats
  const seatsHtml = st.map((s, i) => {
    const { p, hp } = s;
    const pos = placed.seats[i]!;
    const cls = ['seat'];
    if (s.mini) cls.push('mini');
    else if (hp?.folded) cls.push('fold');
    if (p.away || p.sittingOut || (!hp && hand && v.phase === 'hand')) cls.push('away');
    if (hand?.toAct === p.id) cls.push('turn');
    const reveal = !!R && !!evals[p.id];
    if (winners.has(p.id) && R && step !== 'scene' && step !== 'runout') cls.push('win');
    else if (reveal && !winners.has(p.id) && (step === 'all' || step === 'hold')) cls.push('lose');
    let inner = '';
    let sd = ''; // a hand this seat turns over at a later step (the result pill keeps clear of it: pill.ts)
    if (reveal && hp?.cards?.length && !s.mini) {
      const w = (winners.has(p.id) || step === 'runout' ? 26 : 24) + big;
      const shl = pos.x + 8 + w * 2 + 4 > aw ? ' shl' : ''; // no room on the right of the seat: the cards sit on its left
      if (showNow(p.id)) {
        // the reveal flip: the winner when the table comes back, the others 0.6 s later, 80 ms apart
        const j = losers.indexOf(p.id);
        const flip = (step === 'winner' && winners.has(p.id)) || (step === 'all' && j >= 0) || step === 'runout';
        inner += `<div class="shown${flip ? ' rv' : ''}${shl}" style="--rd:${Math.max(0, j) * 80}ms">${hp.cards.map((c) => card(c, w)).join('')}</div>`;
      } else {
        inner += `<div class="backs">${back(17)}${back(17)}</div>`;
        if (step === 'winner' || step === 'scene') sd = ` data-sd="${w}${shl ? 'l' : ''}"`;
      }
    } else if (hp?.cards && hp.cards.length && !s.mini) inner += `<div class="shown">${hp.cards.map((c) => card(c, 22, winners.has(p.id) ? 'win' : '')).join('')}</div>`;
    else if (hp && !hp.folded) inner += `<div class="backs">${back(17)}${back(17)}</div>`;
    const status = !p.connected ? '<span class="status off" title="Connection lost">⏻</span>' : '';
    inner += `<div class="av">${avatar(th, p.id, p.name, p.avatar)}${status}</div>`;
    inner += `<div class="plate"><b>${esc(p.name)}</b><i>${fmt(stackOf(p))}</i></div>`;
    let tag: [string, string] | null = null;
    const ev = evals[p.id];
    if (R && step === 'runout' && ev && rs?.chances?.[p.id] !== undefined) tag = ['allin', `${rs.chances[p.id]}%`];
    else if (R && step === 'fold' && winners.has(p.id)) tag = ['win', `+${fmt(sum!.winners.find((w) => w.pid === p.id)?.amount ?? 0)}`];
    else if (R && ev && showNow(p.id) && step !== 'runout') tag = [winners.has(p.id) ? 'win hn' : 'hn', handShort(ev)];
    else if (hand?.toAct === p.id) tag = ['', 'Thinking'];
    else if (hp?.allIn) tag = ['allin', 'All-in'];
    else if (hp?.folded) tag = ['fold', 'Fold'];
    else if (hp?.lastAction) tag = [hp.lastAction === 'raise' || hp.lastAction === 'bet' ? 'raise' : '', `${ACTION[hp.lastAction] ?? hp.lastAction}${hp.streetBet && hp.lastAction !== 'check' && hp.lastAction !== 'fold' ? ` ${fmt(hp.streetBet)}` : ''}`];
    else if (!p.connected) tag = ['away', 'Connection lost'];
    else if (p.sittingOut) tag = ['away', p.away ? 'Away' : 'Sitting out'];
    else if (p.busted) tag = ['away', 'Out of chips'];
    if (tag) inner += `<div class="tag ${tag[0]}">${tag[1]}</div>`;
    return `<div class="${cls.join(' ')}" style="left:${pos.x.toFixed(0)}px;top:${pos.y.toFixed(0)}px" data-n="${esc(p.name)}" data-pid="${esc(p.id)}"${sd}>${inner}</div>`;
  }).join('');
  const betsHtml = st.map((s, i) => {
    const pos = placed.seats[i]!;
    if (pos.bx === undefined || !s.hp) return '';
    // a bet or raise has a second chip on top (the design's raise move lands it there)
    const two = !s.hp.allIn && (s.hp.lastAction === 'bet' || s.hp.lastAction === 'raise') ? `<span class="c2">${chip('a')}</span>` : '';
    return `<div class="bet" style="left:${pos.bx.toFixed(0)}px;top:${pos.by!.toFixed(0)}px" data-pid="${esc(s.p.id)}">${two}${chip(s.hp.allIn ? 'b' : 'a')}<span>${fmt(s.hp.streetBet)}</span></div>`;
  }).join('');
  const dbtn = placed.dbtn ? `<div class="dbtn" style="left:${placed.dbtn.x.toFixed(0)}px;top:${placed.dbtn.y.toFixed(0)}px">D</div>` : '';

  // felt: board, pot, side pots
  const gap = mode === 'lap' ? 10 : 5;
  const board = (step === 'runout' && rs?.board) || hand?.board || [];
  // the best five: the board cards that made the winning hand lift with the theme's glow, the others dim
  const lift = R?.showdown && (step === 'winner' || step === 'all' || step === 'hold') ? bestOnBoard(board, sum!.winners.map((w) => w.ev?.best ?? [])) : null;
  const boardCls = (c: string) => (!lift ? '' : lift.has(c) ? `win${step === 'winner' ? ' lift' : ''}` : 'lose');
  const boardHtml = board.map((c) => card(c, cw, boardCls(c))).join('') + Array.from({ length: Math.max(0, 5 - board.length) }, () => slot(cw)).join('');
  const board2 = hand?.board2 ? `<div class="board b2" style="gap:${gap}px">${hand.board2.map((c) => card(c, Math.round(cw * 0.8))).join('')}</div>` : '';
  const pot = hand ? (hand.collected || (hand.results ? hand.pot : 0)) : 0; // chips already in the middle (bets in front of seats are drawn there)
  // after the hand the pot line becomes the winner pill (the scene step still shows the pot)
  const pill = !R || !sum || step === 'scene' ? ''
    : step === 'runout' ? `<div class="wpill"><b>${runoutTitle(board.length)}</b><span>${esc(chancesLine(rs?.chances ?? {}, nameOf))}</span></div>`
    : `<div class="wpill${step === 'fold' ? ' fold' : ''}${step === 'winner' || step === 'fold' ? ' in' : ''}"><b>${esc(sum.title)}</b><span>${esc(sum.line)}</span></div>`;
  const potHtml = pill || (pot > 0 ? art.pot.replace('{POT}', fmt(pot)) : '');
  const side = hand?.pots && hand.pots.length > 1 ? `<div class="sidepot">${hand.pots.map((p, i) => `<span>${i ? 'Side' : 'Main'} ${fmt(p.amount)}</span>`).join('')}</div>` : '';
  const feltDyn = `<div class="board" style="gap:${gap}px">${boardHtml}</div>${board2}${potHtml}${mode !== 'land' ? side : ''}`;
  const felt = `<div class="felt">${art.felt}${dyn('felt', feltDyn)}</div>`;
  const table = `<div class="table" style="left:${g.tl}px;top:${g.tt}px;width:${g.tw}px;height:${g.th}px">${art.rail}${felt}</div>`;
  const dealer = !compact && art.dealer ? art.dealer : '';
  // what the dealer says: beside the dealer on phones and big screens (sideways phones have no room for it)
  const bubble = o.bubble && art.dealer && !compact && mode !== 'land'
    ? `<div class="bubble live" style="${mode === 'lap' ? 'left:calc(50% + 66px);top:18px' : 'top:8px;left:calc(50% + 48px)'}">${esc(o.bubble)}</div>` : '';
  const arenaDyn = `${bubble}${betsHtml}${dbtn}${seatsHtml}`;
  const arena = `<div class="arena">${art.arena}${dealer}${table}${dyn('arena', arenaDyn)}</div>`;

  // top bar
  const title = o.title ?? (v.handNo ? `Hand ${v.handNo}` : 'Table');
  const sub = `Blinds ${fmt(v.level.sb)} / ${fmt(v.level.bb)}${v.level.ante ? ` · ante ${fmt(v.level.ante)}` : ''} · ${n} player${n === 1 ? '' : 's'}`;
  const netCls = o.net === 'good' ? '' : o.net === 'weak' ? ' weak' : ' lost';
  const top = `<header class="top"><button class="ib" data-act="menu" aria-label="Table menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>`
    + `<div class="hm"><b>${esc(title)}</b><small>${sub}</small></div><span class="sp"></span>`
    + `<span class="net${netCls}" role="img" aria-label="Connection ${o.net}"><i></i><i></i><i></i></span>`
    + (o.code ? `<span class="pill code">${esc(o.code)}</span>` : '') + `<button class="ib info" data-act="info" aria-label="Hand rankings">i</button></header>`;

  // me
  const mine = players.find((p) => p.id === me);
  const myHp = me ? hand?.ps[me] : undefined;
  const heroW = mode === 'lap' ? 84 : mode === 'land' ? 52 : 66;
  const myCards = myHp?.cards ?? null;
  const flip = (c: string | undefined) => (c ? `<div class="flip">${card(c, heroW)}${back(heroW)}</div>` : `<div class="flip">${back(heroW)}${back(heroW)}</div>`);
  // after a showdown your own cards are face up in the hand area, with the hand in words (also when you lost)
  const myEv = me && R ? evals[me] : undefined;
  const openW = mode === 'lap' ? 70 : mode === 'land' ? 44 : 50;
  const hc = myEv && myCards ? `<div class="hc open${(step === 'winner' && !hand?.runout) || step === 'runout' ? ' rv' : ''}" role="img" aria-label="Your cards: ${myCards.map(cardName).join(' and ')}">${myCards.map((c) => card(c, openW)).join('')}</div>` : `<div class="hc${o.peek ? ' peek' : ''}${myCards ? '' : ' none'}" role="button" tabindex="0" data-act="peek" aria-label="${myCards ? (o.peek ? `Your cards: ${myCards.map(cardName).join(' and ')}` : 'Your two cards, press and hold to look') : 'No cards this hand'}">${myCards ? flip(myCards[0]) + flip(myCards[1]) : ''}<span class="thumb"></span></div>`;
  const myTurn = !!(me && hand?.toAct === me);
  const status = !mine ? 'watching' : myEv ? 'showed' : myTurn ? 'your turn' : mine.sittingOut ? 'sitting out' : myHp?.folded ? 'folded' : v.phase === 'hand' && myHp ? 'in the hand' : '';
  const partial = (cards: string[]) => { try { return cap(describePartial(cards.map(parseCard)).toLowerCase()); } catch { return ''; } };
  const hint = myEv && step === 'runout' && myCards ? partial([...myCards, ...(rs?.board ?? [])]) : myEv ? handWords(myEv) : R && myHp?.folded ? 'You folded this hand' : myCards ? (o.peek ? (handName(v) ?? 'Your cards') : (mode === 'lap' ? 'Hold cards or Space to look' : 'Hold your cards to look')) : '';
  const timer = myTurn && v.turnTotal ? `<div class="tbank"><span class="rg" style="background:conic-gradient(var(--acc) ${Math.round((100 * v.turnLeft) / v.turnTotal)}%,var(--line) 0)"><span>${Math.ceil(v.turnLeft / 1000)}</span></span>sec</div>` : '';
  // rebuys left and their size, always under your stack (v3rebuys.py: the hero hint)
  // (while the results play, the hint names my hand on its own; the rebuys line comes back once they are over)
  const rb = mine ? heroRebuyHint(v) : null;
  const hintHtml = rb && !(R && step !== 'hold' && step !== 'fold') && !(o.peek && myCards)
    ? `<span class="hhint rbh" data-testid="rb-hint"><span class="s1">${esc(myCards ? hint : rb[0])}</span><span class="s2">${esc(myCards ? rb[0] : rb[1])}</span></span>`
    : `<span class="hhint"><span class="s1">${esc(hint)}</span></span>`;
  // watching because my seat is played on another of my devices: my name, my stack and where the seat is
  // (v3devices.py seatmove: "Dev · 1,840 · Your seat is on your laptop")
  const away = !mine && o.elsewhere ? players.find((p) => p.id === o.elsewhere!.pid) : undefined;
  const heroMeta = away
    ? `<div class="hmeta" data-testid="hero-elsewhere"><span class="hname">${esc(away.name)}</span><span class="hstack">${fmt(stackOf(away))}</span><span class="hhint"><span class="s1">Your seat is on ${esc(o.elsewhere!.where)}</span></span></div>`
    : `<div class="hmeta"><span class="hname">${mine && isAvatarId(mine.avatar) ? `<span class="av hav">${avatar(th, mine.id, mine.name, mine.avatar)}</span>` : ''}${esc(mine?.name ?? 'Watching')}${status ? ` · ${status}` : ''}</span><span class="hstack">${mine ? fmt(stackOf(mine)) : ''}</span>${hintHtml}</div>`;
  const hero = `<section class="hero" aria-label="Your seat">${hc}${heroMeta}${timer}</section>`;
  const actions = actionsHtml(v, mode, rs);

  let body: string;
  let style = `width:${lw}px;height:${lh}px`;
  const parts: Record<string, string> = { top, arena: arenaDyn, felt: feltDyn, hero, actions, ...(mode === 'lap' ? { side: sidePanel(v, step === 'all' || step === 'hold' ? R : null) } : {}) };
  const T = dyn('top', top), He = dyn('hero', hero), A = dyn('actions', actions);
  if (mode === 'phone') body = `<div class="fx" aria-hidden="true">${art.fx}</div>${T}${arena}${He}<nav class="actions" aria-label="Your actions">${A}</nav>`;
  else if (mode === 'land') {
    body = `<div class="fx" aria-hidden="true">${art.fx}</div>${T}${arena}<aside class="dock">${He}<nav class="actions" aria-label="Your actions">${A}</nav></aside>`;
    style += `;grid-template-columns:minmax(0,1fr) ${dock}px`;
  } else {
    body = `<div class="fx" aria-hidden="true">${art.fx}</div>${T}${arena}<div class="dock">${He}<div class="actions">${A}</div></div><aside class="side">${dyn('side', parts.side!)}</aside>`;
  }
  if (u !== 1) style += `;zoom:${u.toFixed(4)}`;
  const feel = FEEL[themeKey] ?? FEEL.classic!;
  style += `;--rk:${feel.k};--re:${feel.ease}`;
  const dens = mode === 'phone' ? `dense${n > 10 || (compact && n > 6) ? ' xdense' : ''}${compact ? ' compact' : ''}${lw < 380 ? ' narrow' : ''}` : mode === 'land' ? `xdense${lh < 400 ? ' short' : ''}` : '';
  const html = `<div class="tp live ${mode} ${dens} th-${themeKey}" style="${style}" data-n="${n}">${body}</div>`;
  // what stays the same while the hand goes on: the theme, the screen, the table's shape
  const shell = [themeKey, mode, dens, style, n, g.tl, g.tt, g.tw, g.th, dealer ? 1 : 0].join('|');
  return { html, mode, u, lw, lh, compact, heroCardW: heroW, shell, parts };
}

/**
 * The winner card over the win scene (design v3results.py strip()): each winner's avatar, "<name> wins <amount>",
 * the hand in words and their two cards, the tier label, and the best five. A split pot names both winners.
 */
export function winnerCardHtml(v: ScreenView, themeKey: ThemeKey, s: Summary, tier: number, mode: Mode): string {
  const th = THEMES[themeKey] ?? THEMES.classic!;
  const rows = s.winners.map((w, i) => {
    const cards = v.hand?.ps[w.pid]?.cards ?? [];
    const pick = v.players.find((p) => p.id === w.pid)?.avatar;
    return `<div class="hrow"><span class="av" style="--av:${s.winners.length > 1 ? 40 : 46}px">${avatar(th, w.pid, w.name, pick)}</span>`
      + `<div class="txt">${i === 0 ? `<small class="klbl">${TIER_LABEL[tier] ?? ''}</small>` : ''}<b><span class="wn">${esc(w.name)} wins</span> <span class="wa">${fmt(w.amount)}</span></b>`
      + `<span>${esc(w.ev ? handWords(w.ev) : s.line)}</span></div><div class="wcards">${cards.map((c) => card(c, 40, 'win')).join('')}</div></div>`;
  }).join('');
  const five = s.best ? `<div class="best">${orderFive(s.best.best).map((c) => card(c, 30, 'win')).join('')}<small>best five</small></div>` : '';
  return `<div class="tp-wcard th-${themeKey} m-${mode}" role="status" aria-label="${esc(`${s.title}. ${s.line}`)}">${rows}${five}</div>`;
}

/** The best five as the design shows them: by group (the made part first), then rank; straights high to low. */
export function orderFive(cards: string[]): string[] {
  const R = '23456789TJQKA';
  const n: Record<string, number> = {};
  for (const c of cards) n[c[0]!] = (n[c[0]!] ?? 0) + 1;
  const wheel = cards.some((c) => c[0] === 'A') && cards.some((c) => c[0] === '5') && cards.some((c) => c[0] === '2') && !cards.some((c) => c[0] === 'K') && Object.keys(n).length === 5;
  const v = (c: string) => (wheel && c[0] === 'A' ? -1 : R.indexOf(c[0]!));
  return cards.slice().sort((a, b) => n[b[0]!]! - n[a[0]!]! || v(b) - v(a));
}

/** "Pair of Fours" -> "a pair of fours", "Full House, Kings full of Sevens" -> "a full house, kings full of sevens". */
export function said(desc: string): string {
  const d = desc.toLowerCase();
  return /^(pair|straight|flush|full house|royal flush)\b/.test(d) ? `a ${d}` : d;
}

/** What you hold while you look at your cards: "You have a pair of kings" (the showdown's own words once it is over). */
function handName(v: ScreenView): string | null {
  const me = v.me;
  const ev = me ? v.hand?.results?.evals?.[me] : null;
  if (ev) { const d = (ev as { desc?: string }).desc; return d ? `You have ${said(d)}` : null; }
  const hp = me ? v.hand?.ps[me] : null;
  if (!hp?.cards?.length || hp.folded) return null;
  try {
    return `You have ${said(describePartial([...hp.cards, ...(v.hand?.board ?? [])].map(parseCard)))}`;
  } catch { return null; }
}

function actionsHtml(v: ScreenView, mode: Mode, rs: ResStage | null): string {
  const me = v.players.find((p) => p.id === v.me);
  const L = v.legal;
  const hand = v.hand;
  const kbd = (k: string) => (mode === 'lap' ? ` <kbd>${k}</kbd>` : '');
  if (hand && L && hand.toAct === v.me) {
    const call = L.canCheck ? `<button class="act call" data-act="check">Check${kbd('C')}</button>` : `<button class="act call" data-act="call">Call<small>${fmt(L.toCall)}</small>${kbd('C')}</button>`;
    const raise = L.canRaise ? `<button class="act raise" data-act="raise">${L.isBet ? 'Bet' : 'Raise'}<small>${fmt(L.minTo)}+</small>${kbd('R')}</button>`
      
      : (me?.stack ?? 0) > 0 && !L.canCheck && (me?.stack ?? 0) > L.toCall ? `<button class="act raise" data-act="allin">All-in<small>${fmt(me?.stack ?? 0)}</small></button>` : '';
    return `<button class="act fold" data-act="fold">Fold${kbd('F')}</button>${call}${raise}`;
  }
  const out: string[] = [];
  if (hand?.vote && v.me && hand.vote.pids.includes(v.me) && !hand.vote.voted.includes(v.me)) {
    return '<button class="act ghost" data-act="once">Run it once</button><button class="act call" data-act="twice">Run it twice</button>';
  }
  // everyone folded: the winner may still show their cards (folded hands are never shown)
  const R = hand?.results;
  const wonIt = !!R && !R.showdown && R.pots.some((p) => p.awards.some((a) => a.pid === v.me));
  if (wonIt && v.me && hand?.ps[v.me] && !hand.ps[v.me]!.revealed && hand.ps[v.me]!.cards) out.push(`<button class="act ghost" data-act="show"${rs?.next ? ' style="flex:0 0 auto;padding:0 18px"' : ''}>Show my cards</button>`);
  // (no rebuy before the winner is shown: it would give the result away)
  const early = rs?.step === 'runout' || rs?.step === 'scene';
  const rbv = v.rebuy;
  if (!early && me && me.stack === 0 && rbv?.can) out.push(`<button class="act raise" data-act="rebuy">Rebuy<small>${fmt(rbv.amount)}</small></button>`);
  else if (!early && me && me.stack === 0 && me.busted && v.phase !== 'ended') out.push('<button class="act ghost" data-act="bust" data-testid="out-of-chips">Out of chips</button>');
  if (me?.sittingOut && !me.busted) out.push('<button class="act call" data-act="sitin">Sit back in</button>');
  if (v.isHost && (v.phase === 'lobby' || (v.phase === 'between' && (v.paused || !v.nextIn)))) out.push(`<button class="act call" data-act="deal">${v.paused ? 'Resume dealing' : v.handNo ? 'Deal next hand' : 'Deal the first hand'}</button>`);
  // after the hand: the bar that drains to the next deal (tap or Space skips to the next step)
  if (!out.some((b) => b.includes('data-act="deal"')) && rs?.next && v.phase === 'between' && !v.paused) {
    const left = rs.next.at - performance.now();
    out.push(`<button class="act ghost nxt" data-act="skip" aria-label="${esc(nextLabel(left, false, false))}">${nextLabel(left, !!rs.skip, mode === 'lap')}<i aria-hidden="true"></i></button>`);
  }
  if (!out.length) {
    const why = !me ? 'You are watching' : v.phase === 'lobby' ? (v.isHost ? 'Waiting for players' : 'Waiting for the host to deal') : v.phase === 'between' ? (v.paused ? 'The host paused dealing' : 'Next hand in a moment') : hand?.ps[v.me!]?.folded ? 'You folded' : `Waiting for ${v.players.find((p) => p.id === hand?.toAct)?.name ?? 'the others'}`;
    out.push(`<div class="waitline" role="status">${esc(why)}</div>`);
  }
  return out.join('');
}

function sidePanel(v: ScreenView, R: import('@tp/engine').HandResults | null): string {
  const rows = v.players.map((p) => `<div class="prow${p.id === v.me ? ' me' : ''}"><b>${esc(p.name)}</b><i>${fmt(p.stack)}</i><small>${p.id === v.me ? 'You' : !p.connected ? 'Connection lost' : p.sittingOut ? 'Sitting out' : 'Playing'}</small></div>`).join('');
  // after a showdown the log writes out each hand that was shown
  const shown = R ? Object.entries(R.evals).map(([pid, ev]) => `${v.players.find((p) => p.id === pid)?.name ?? 'Someone'} showed ${(v.hand?.ps[pid]?.cards ?? []).map(cardName).join(', ')}: ${handWords(ev).toLowerCase()}`) : [];
  const log = [...v.log.slice(-12).map((l) => (typeof l === 'string' ? l : (l as { text: string }).text)), ...shown].slice(-14).map((l) => `<span>${esc(l)}</span>`).join('');
  return `<span class="sh">At the table · ${v.players.length}</span><div class="plist">${rows}</div><span class="sh">Table log</span><div class="log">${log}</div>`;
}

/** The theme's SVG sprite (cards, chips, dealer art) for the page. */
// (the design's sprite points at img/ next to its pages; in the app the images are under /tp/img/)
export const sprite = (k: ThemeKey): string => `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${(THEMES[k] ?? THEMES.classic!).sprite.replace(/href="img\//g, 'href="/tp/img/')}</defs></svg>`;
