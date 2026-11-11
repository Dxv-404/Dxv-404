// The table log: the night's lines hand by hand (LogBook), and the HTML of one hand's block (handHtml).
// Plain computing and strings, no DOM, so it is unit tested. The screen part is log-view.ts.
import type { LogLine } from '@tp/engine';

export interface LogHandLines { h: number; lines: LogLine[] }
export interface LogPageMsg { hands: LogHandLines[]; more: boolean; big?: { h: number; pot: number } | undefined }

/** The whole pot of a hand, from its lines (the win lines carry it). */
export const potOf = (lines: LogLine[]): number => lines.reduce((m, l) => (l.k === 'win' && typeof l.potAll === 'number' ? Math.max(m, l.potAll) : m), 0);

export class LogBook {
  private hands = new Map<number, LogLine[]>();
  /** older hands exist at the table that this screen has not been sent */
  more = false;
  /** the table numbers its lines and sends them as data (older tables send sentences only: no history, plain lines) */
  rich = false;
  /** the biggest pot of the night, as far as this screen knows */
  big: { h: number; pot: number } | null = null;
  /** counts changes (a screen redraws when it moves) */
  ver = 0;

  /** Take in the lines that came with the table (its most recent ones). True when anything changed. */
  take(recent: LogLine[]): boolean {
    if (!recent.length) return false;
    const numbered = recent.filter((l) => typeof l.n === 'number');
    let changed = false;
    if (!numbered.length) {
      // an older table: whole sentences, nothing to line them up by: the hands they mention are shown as sent
      const by = new Map<number, LogLine[]>();
      for (const l of recent) { const a = by.get(l.h) ?? []; a.push(l); by.set(l.h, a); }
      const firstH = recent[0]!.h;
      for (const [h, a] of by) {
        const old = this.hands.get(h);
        if (h === firstH && old && old.length > a.length) continue; // the oldest hand sent is cut short: keep the fuller copy
        if (old && old.length === a.length && old[old.length - 1]!.text === a[a.length - 1]!.text) continue;
        this.hands.set(h, a); changed = true;
      }
    } else {
      this.rich = true;
      const first = numbered[0]!, lo = first.n!;
      const next = new Map<number, LogLine[]>();
      for (const [h, ls] of this.hands) {
        if (h < first.h) continue;
        const keep = ls.filter((l) => (l.n ?? 0) < lo);
        if (keep.length !== ls.length) next.set(h, keep);
      }
      for (const l of numbered) {
        let a = next.get(l.h);
        if (!a) { a = (this.hands.get(l.h) ?? []).filter((x) => (x.n ?? 0) < lo); next.set(l.h, a); }
        a.push(l);
      }
      for (const [h, a] of next) {
        const old = this.hands.get(h), lo2 = old?.[old.length - 1], ln = a[a.length - 1];
        if (old && old.length === a.length && lo2?.n === ln?.n && lo2?.text === ln?.text) continue;
        if (a.length) this.hands.set(h, a); else this.hands.delete(h);
        changed = true;
      }
    }
    if (changed) { this.noteBig(); this.ver++; }
    return changed;
  }

  /** A page of older hands from the table. A hand this screen already holds more of is left alone. */
  add(p: LogPageMsg): void {
    for (const { h, lines } of p.hands) {
      const old = this.hands.get(h);
      const lastOld = old?.[old.length - 1]?.n ?? -1, lastNew = lines[lines.length - 1]?.n ?? -1;
      if (old && (lastOld > lastNew || (lastOld === lastNew && old.length >= lines.length))) continue;
      if (lines.length) this.hands.set(h, lines);
    }
    const oldest = this.oldest();
    // `more` is about hands before the page; a page of the latest hands arriving late must not hide older ones already known
    if (oldest === undefined || p.hands.length === 0 || p.hands[0]!.h <= oldest) this.more = p.more;
    if (p.big && (!this.big || p.big.pot > this.big.pot)) this.big = p.big;
    this.rich = this.rich || p.hands.some((x) => x.lines.some((l) => typeof l.n === 'number'));
    this.noteBig();
    this.ver++;
  }

  private noteBig(): void {
    for (const [h, lines] of this.hands) { const pot = potOf(lines); if (pot > 0 && (!this.big || pot > this.big.pot || (pot === this.big.pot && h < this.big.h))) this.big = { h, pot }; }
  }

  /** The hands held, oldest first. */
  list(): LogHandLines[] { return [...this.hands.entries()].sort((a, b) => a[0] - b[0]).map(([h, lines]) => ({ h, lines })); }
  oldest(): number | undefined { let m: number | undefined; for (const h of this.hands.keys()) if (m === undefined || h < m) m = h; return m; }
  get size(): number { return this.hands.size; }
  reset(): void { this.hands.clear(); this.more = false; this.big = null; this.ver++; }
}

// ---------------------------------------------------------------- one hand, as HTML
export interface LogCtx {
  me: string | null;
  /** the avatar of a player (by id and the name the line carries) */
  av(pid: string, name: string): string;
  /** a small face-up card */
  card(code: string): string;
  fmt(n: number): string;
  /** show only this player's lines (null: everyone's) */
  only: string | null;
  /** the hand with the biggest pot of the night */
  bigHand: number | null;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const STREET: Record<string, string> = { preflop: 'Before the flop', flop: 'Flop', turn: 'Turn', river: 'River', second: 'Second board' };
const POSTED: Record<string, string> = { sb: 'small blind', bb: 'big blind', straddle: 'straddle', missedbb: 'missed big blind', ante: 'ante', deadsb: 'dead small blind' };
/** How long a decision took, in words a line has room for. */
export const tookText = (ms: number): string => (ms < 950 ? 'under 1s' : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`);
const TANK_MS = 15_000;

/** What a bet or raise amounts to, next to the number: "3× · pot 210", "half pot · pot 90". */
export function sizeNote(l: LogLine, prevBet: number, fmt: (n: number) => string): string {
  const parts: string[] = [];
  if (l.a === 'raise' && prevBet > 0 && typeof l.to === 'number') {
    const x = l.to / prevBet;
    parts.push(`${x >= 10 ? Math.round(x) : Math.round(x * 10) / 10}×`);
  } else if (l.a === 'bet' && typeof l.amt === 'number' && typeof l.pot === 'number' && l.pot > l.amt) {
    const f = l.amt / (l.pot - l.amt);
    parts.push(f > 0.95 && f < 1.05 ? 'pot-size' : f > 0.45 && f < 0.55 ? 'half pot' : `${Math.round(f * 100)}% of pot`);
  }
  if (typeof l.pot === 'number') parts.push(`pot ${fmt(l.pot)}`);
  return parts.join(' · ');
}

function actLine(l: LogLine, c: LogCtx, prevBet: number): string {
  const who = l.who ?? 'Someone', mine = !!l.pid && l.pid === c.me;
  const kind = l.allin ? 'allin' : (l.a ?? 'check');
  let verb: string, num = '';
  if (l.a === 'fold') verb = 'folds';
  else if (l.a === 'check') verb = 'checks';
  else if (l.a === 'call') { verb = l.allin ? 'calls all-in' : 'calls'; num = c.fmt(l.amt ?? 0); }
  else if (l.allin) { verb = 'all-in'; num = c.fmt(l.to ?? 0); }
  else if (l.a === 'bet') { verb = 'bets'; num = c.fmt(l.to ?? 0); }
  else { verb = 'raises to'; num = c.fmt(l.to ?? 0); }
  const note = l.a === 'fold' || l.a === 'check' ? '' : sizeNote(l, prevBet, c.fmt);
  const took = typeof l.ms === 'number' ? `<time class="${l.ms >= TANK_MS ? 'lg-tank' : ''}" aria-label="took ${tookText(l.ms)}">${tookText(l.ms)}</time>` : '';
  return `<div class="lgl lx k-${kind}${mine ? ' lg-me' : ''}" data-pid="${esc(l.pid ?? '')}"><span class="av" aria-hidden="true">${l.pid ? c.av(l.pid, who) : ''}</span><b>${esc(who)}</b><i class="lg-a">${verb}</i>${num ? `<u>${num}</u>` : ''}${note ? `<small>${note}</small>` : ''}${took}</div>`;
}

const cards = (codes: string[] | undefined, c: LogCtx, cls = ''): string => (codes?.length ? `<span class="lgc ${cls}">${codes.map((x) => c.card(x)).join('')}</span>` : '');
const note = (text: string, cls = ''): string => `<div class="lgn ${cls ? `lg-${cls}` : ''}"><span>${esc(text)}</span></div>`;

/** One hand's block: header, blinds, the streets with their actions, the result. Empty when the filter leaves nothing. */
export function handHtml(h: number, lines: LogLine[], c: LogCtx): string {
  const rich = lines.some((l) => !!l.k);
  if (!rich) {
    // an older table's sentences
    const body = lines.map((l) => `<div class="lgl lg-plain"><span>${esc(l.text)}</span></div>`).join('');
    return `<section class="lgh" data-h="${h}">${h > 0 ? `<header class="lgh-h"><b>Hand ${h}</b></header>` : ''}${body}</section>`;
  }
  const head = lines.find((l) => l.k === 'hand');
  const mineOnly = (l: LogLine): boolean => !c.only || l.pid === c.only;
  const out: string[] = [];
  let shown = 0;
  // blinds and antes: one line
  const posts = lines.filter((l) => l.k === 'post');
  if (posts.length && !c.only) {
    const antes = posts.filter((l) => l.what === 'ante');
    const rest = posts.filter((l) => l.what !== 'ante').map((l) => `${esc(l.who ?? '')} ${POSTED[l.what ?? ''] ?? 'posts'} <u>${c.fmt(l.amt ?? 0)}</u>`);
    if (antes.length) rest.push(`${antes.length} ${antes.length === 1 ? 'ante' : 'antes'} of <u>${c.fmt(Math.max(...antes.map((l) => l.amt ?? 0)))}</u>`);
    out.push(`<div class="lgp">${rest.join('<i> · </i>')}</div>`);
  }
  let prevBet = Math.max(0, ...posts.filter((l) => l.what === 'bb' || l.what === 'straddle' || l.what === 'sb' || l.what === 'missedbb').map((l) => l.amt ?? 0));
  // one player's lines only: the streets after their last line in the hand are left out
  let lastMine = -1;
  if (c.only) lines.forEach((l, i) => { if (l.pid === c.only && l.k !== 'hand' && l.k !== 'post') lastMine = i; });
  for (const [i, l] of lines.entries()) {
    switch (l.k) {
      case 'hand': case 'post': break;
      case 'act':
        if (mineOnly(l)) { out.push(actLine(l, c, prevBet)); shown++; }
        if ((l.a === 'bet' || l.a === 'raise') && typeof l.to === 'number') prevBet = Math.max(prevBet, l.to);
        break;
      case 'street':
        prevBet = 0;
        if (c.only && i > lastMine) break;
        out.push(`<div class="lgs"><b>${STREET[l.st ?? ''] ?? esc(l.st ?? '')}</b>${cards(l.cards, c, l.st === 'second' ? '' : `lg-fresh${l.fresh ?? 0}`)}${typeof l.pot === 'number' ? `<small>pot ${c.fmt(l.pot)}</small>` : ''}</div>`);
        break;
      case 'show':
        if (mineOnly(l)) { out.push(`<div class="lgl lg-show${l.pid === c.me ? ' lg-me' : ''}" data-pid="${esc(l.pid ?? '')}"><span class="av" aria-hidden="true">${l.pid ? c.av(l.pid, l.who ?? '') : ''}</span><b>${esc(l.who ?? '')}</b><i class="lg-a">shows</i>${cards(l.cards, c)}${l.desc ? `<small>${esc(l.desc)}</small>` : ''}</div>`); shown++; }
        break;
      case 'back':
        if (mineOnly(l)) { out.push(`<div class="lgl lg-back" data-pid="${esc(l.pid ?? '')}"><span class="av" aria-hidden="true"></span><span class="lg-t">${c.fmt(l.amt ?? 0)} not called, back to ${esc(l.who ?? '')}</span></div>`); shown++; }
        break;
      case 'win':
        if (mineOnly(l)) {
          const from = l.from && l.from !== 'the pot' ? `<small class="lg-from">${esc(l.from)}</small>` : '';
          out.push(`<div class="lgw${l.pid === c.me ? ' lg-me' : ''}" data-pid="${esc(l.pid ?? '')}"><span class="av" aria-hidden="true">${l.pid ? c.av(l.pid, l.who ?? '') : ''}</span><div class="lg-w"><p><b>${esc(l.who ?? '')}</b> wins <u>${c.fmt(l.amt ?? 0)}</u>${from}</p>${l.desc ? `<p class="lg-d">${esc(l.desc)}</p>` : '<p class="lg-d">everyone else folded</p>'}${cards(l.cards, c, 'lg-five')}</div></div>`);
          shown++;
        }
        break;
      case 'timeout': if (mineOnly(l)) { out.push(note(`${l.who ?? 'A player'} ran out of time`, 'warn')); shown++; } break;
      case 'join': if (mineOnly(l)) out.push(note(`${l.who ?? 'A player'} joins the table`)); break;
      case 'rebuy': if (mineOnly(l)) { out.push(note(`${l.who ?? 'A player'} rebuys for ${c.fmt(l.amt ?? 0)}`, 'chips')); shown++; } break;
      case 'blinds': if (!c.only) out.push(note(l.up ? `Blinds go up to ${c.fmt(l.sb ?? 0)}/${c.fmt(l.bb ?? 0)}${l.ante ? `, ante ${c.fmt(l.ante)}` : ''}` : `Blinds change to ${c.fmt(l.sb ?? 0)}/${c.fmt(l.bb ?? 0)}${l.ante ? `, ante ${c.fmt(l.ante)}` : ''} from the next hand`, 'up')); break;
      case 'pause': if (!c.only) out.push(note('The host paused the table')); break;
      case 'resume': if (!c.only) out.push(note('The host resumed the table')); break;
      case 'undo': if (!c.only) out.push(note('The dealer took back the last action', 'warn')); break;
      case 'twice': if (!c.only) out.push(note(l.agreed ? 'Everyone agreed: the rest of the board is dealt twice' : 'The board is dealt once')); break;
      default: if (!c.only) out.push(note(l.text));
    }
  }
  if (c.only && !shown) return '';
  let header = '';
  if (h > 0) {
    const bits: string[] = [];
    if (head?.who) bits.push(`${esc(head.who)} on the button`);
    if (head?.bb) bits.push(`blinds ${c.fmt(head.sb ?? 0)}/${c.fmt(head.bb)}`);
    const big = c.bigHand === h ? '<em class="lg-big" title="The biggest pot of the night so far">Biggest pot tonight</em>' : '';
    header = `<header class="lgh-h"><b>Hand ${h}</b>${bits.length ? `<span>${bits.join(' · ')}</span>` : ''}${big}</header>`;
  } else header = '<header class="lgh-h lg-pre"><b>Before the first hand</b></header>';
  return `<section class="lgh${c.bigHand === h ? ' lg-bigpot' : ''}" data-h="${h}">${header}${out.join('')}</section>`;
}
