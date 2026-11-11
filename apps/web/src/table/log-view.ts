// The table log on screen: a scrolling list of hands that keeps its place. New lines arrive at the foot; if
// you have scrolled back to read, they do not pull you down (a "Latest" button appears instead); scrolling to
// the top asks the table for earlier hands. Only the hands that changed are redrawn.
import { handHtml, type LogBook, type LogCtx } from './log-core';

const NEAR_FOOT = 28, NEAR_TOP = 90;

export class LogView {
  readonly el: HTMLElement;
  private sc: HTMLElement;
  private list: HTMLElement;
  private older: HTMLElement;
  private bar: HTMLElement;
  private latest: HTMLButtonElement;
  private html = new Map<number, string>();
  private secs = new Map<number, HTMLElement>();
  private key = '';
  /** at the foot of the log (so new lines keep it there) */
  private pinned = true;
  /** asked the table for earlier hands; cleared when the book changes */
  private asked: number | null = null;
  private askedVer = -1;
  private first = false;
  private lastTop = 0;
  private book: LogBook | null = null;

  constructor(private o: { ask(before?: number): void }) {
    const el = this.el = document.createElement('div');
    el.className = 'tlog';
    el.innerHTML = '<div class="tlog-bar" hidden></div><div class="tlog-sc" tabindex="0" role="log" aria-label="Table log" aria-live="off"><div class="tlog-older" hidden>Earlier hands…</div><div class="tlog-list"></div></div><button class="tlog-latest" data-act="log-latest" hidden>Latest <i aria-hidden="true">↓</i></button>';
    this.sc = el.querySelector('.tlog-sc') as HTMLElement;
    this.list = el.querySelector('.tlog-list') as HTMLElement;
    this.older = el.querySelector('.tlog-older') as HTMLElement;
    this.bar = el.querySelector('.tlog-bar') as HTMLElement;
    this.latest = el.querySelector('.tlog-latest') as HTMLButtonElement;
    this.sc.addEventListener('scroll', () => this.onScroll(), { passive: true });
  }

  private atFoot(): boolean { return this.sc.scrollHeight - this.sc.scrollTop - this.sc.clientHeight < NEAR_FOOT; }
  private onScroll(): void {
    this.lastTop = this.sc.scrollTop;
    this.pinned = this.atFoot();
    this.latest.hidden = this.pinned;
    this.maybeAsk();
  }
  /** Near the top with earlier hands at the table: ask for them (once per answer). */
  private maybeAsk(): void {
    const b = this.book;
    if (!b || !b.rich || !b.more || this.sc.clientHeight === 0) return;
    if (this.asked !== null && this.askedVer === b.ver) return;
    if (this.sc.scrollTop > NEAR_TOP) return;
    const before = b.oldest();
    if (before === undefined || before === 0) return;
    this.asked = before; this.askedVer = b.ver;
    this.o.ask(before);
  }

  toLatest(): void { this.pinned = true; this.sc.scrollTop = this.sc.scrollHeight; this.latest.hidden = true; }

  /** Put the log in its place on the page (again after the page is redrawn) without losing where it was scrolled to. */
  attach(host: Element): void {
    if (this.el.parentNode === host) return;
    host.append(this.el);
    if (this.pinned) this.sc.scrollTop = this.sc.scrollHeight; else this.sc.scrollTop = this.lastTop;
  }

  draw(book: LogBook, ctx: LogCtx, onlyName: string | null): void {
    this.book = book;
    // the latest hands as the table holds them (more than the few lines that come with every update), once
    if (book.rich && !this.first) { this.first = true; this.o.ask(); }
    const key = `${ctx.only ?? ''}|${ctx.bigHand ?? ''}|${ctx.me ?? ''}`;
    const full = key.split('|')[0] !== this.key.split('|')[0];
    const bigWas = Number(this.key.split('|')[1] || -1);
    this.key = key;
    const hands = book.list();
    const want = new Map<number, string>();
    for (const { h, lines } of hands) {
      // a hand's block is worked out again only when its lines changed (or what is asked of it did)
      const sig = `${lines.length}:${lines[lines.length - 1]?.n ?? lines[lines.length - 1]?.text ?? ''}:${ctx.bigHand === h ? 1 : 0}`;
      const had = this.html.get(h);
      if (!full && had !== undefined && had.startsWith(sig + '\u0000') && bigWas !== h) { want.set(h, had); continue; }
      want.set(h, sig + '\u0000' + handHtml(h, lines, ctx));
    }
    const firstWas = this.secs.size ? Math.min(...this.secs.keys()) : null;
    const hWas = this.sc.scrollHeight, topWas = this.sc.scrollTop, pinned = this.pinned;
    for (const [h, el] of this.secs) if (!want.has(h) || want.get(h)!.endsWith('\u0000')) { el.remove(); this.secs.delete(h); }
    const order = [...want.keys()].sort((a, b) => a - b);
    for (const h of order) {
      const html = want.get(h)!, body = html.slice(html.indexOf('\u0000') + 1);
      if (!body) continue;
      if (this.html.get(h) === html && this.secs.has(h)) continue;
      const t = document.createElement('template');
      t.innerHTML = body;
      const el = t.content.firstElementChild as HTMLElement;
      const old = this.secs.get(h);
      if (old) old.replaceWith(el);
      else {
        let next: HTMLElement | null = null;
        for (const [k, e] of this.secs) if (k > h && (!next || k < Number(next.dataset.h))) next = e;
        this.list.insertBefore(el, next);
      }
      this.secs.set(h, el);
    }
    this.html = want;
    const shown = this.secs.size;
    this.list.classList.toggle('none', shown === 0);
    if (shown === 0) this.list.dataset.none = ctx.only ? 'Nothing from this player yet.' : 'The log starts with the first hand.'; else delete this.list.dataset.none;
    this.older.hidden = !(book.rich && book.more);
    this.bar.hidden = !ctx.only;
    this.bar.innerHTML = ctx.only ? `<span>Only <b></b></span><button data-act="log-all">Show everyone</button>` : '';
    if (ctx.only) (this.bar.querySelector('b') as HTMLElement).textContent = onlyName ?? 'one player';
    // keep the place: at the foot stay at the foot; reading earlier hands, stay on the same line when hands are added above
    if (pinned || full) { this.sc.scrollTop = this.sc.scrollHeight; this.pinned = true; }
    else {
      const firstNow = this.secs.size ? Math.min(...this.secs.keys()) : null;
      if (firstWas !== null && firstNow !== null && firstNow < firstWas) this.sc.scrollTop = topWas + (this.sc.scrollHeight - hWas);
    }
    this.lastTop = this.sc.scrollTop;
    this.latest.hidden = this.pinned;
    this.maybeAsk();
  }
}
