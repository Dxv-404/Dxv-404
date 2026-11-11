import { describe, expect, it } from 'vitest';
import type { LogLine } from '@tp/engine';
import { LogBook, handHtml, potOf, sizeNote, tookText, type LogCtx } from '../src/table/log-core';

const L = (n: number, h: number, more: Partial<LogLine> = {}): LogLine => ({ n, h, text: `line ${n}`, ...more });
const ctx = (o: Partial<LogCtx> = {}): LogCtx => ({ me: 'dev', only: null, bigHand: null, fmt: (n) => String(n), av: (pid) => `[${pid}]`, card: (c) => `<c>${c}</c>`, ...o });
const HAND: LogLine[] = [
  L(10, 3, { k: 'post', pid: 'rosh', who: 'Rosh', what: 'sb', amt: 10 }),
  L(11, 3, { k: 'post', pid: 'momo', who: 'Momo', what: 'bb', amt: 20 }),
  L(12, 3, { k: 'hand', pid: 'dev', who: 'Dev', sb: 10, bb: 20, players: 3, pot: 30 }),
  L(13, 3, { k: 'act', pid: 'dev', who: 'Dev', a: 'raise', amt: 60, to: 60, pot: 90, st: 'preflop', ms: 4200 }),
  L(14, 3, { k: 'act', pid: 'rosh', who: 'Rosh', a: 'fold', pot: 90, st: 'preflop' }),
  L(15, 3, { k: 'act', pid: 'momo', who: 'Momo', a: 'call', amt: 40, to: 60, pot: 130, st: 'preflop' }),
  L(16, 3, { k: 'street', st: 'flop', cards: ['Ks', 'Td', '4h'], fresh: 3, pot: 130 }),
  L(17, 3, { k: 'act', pid: 'momo', who: 'Momo', a: 'bet', amt: 65, to: 65, pot: 195, st: 'flop' }),
  L(18, 3, { k: 'act', pid: 'dev', who: 'Dev', a: 'raise', amt: 500, to: 500, pot: 695, st: 'flop', allin: true, ms: 21_000 }),
  L(19, 3, { k: 'act', pid: 'momo', who: 'Momo', a: 'call', amt: 435, to: 500, pot: 1130, st: 'flop' }),
  L(20, 3, { k: 'street', st: 'turn', cards: ['Ks', 'Td', '4h', '2c'], fresh: 1, pot: 1130 }),
  L(21, 3, { k: 'street', st: 'river', cards: ['Ks', 'Td', '4h', '2c', '9s'], fresh: 1, pot: 1130 }),
  L(22, 3, { k: 'show', pid: 'dev', who: 'Dev', cards: ['Kh', 'Kd'], desc: 'Three of a Kind, Kings' }),
  L(23, 3, { k: 'show', pid: 'momo', who: 'Momo', cards: ['Ac', 'Tc'], desc: 'Pair of Tens' }),
  L(24, 3, { k: 'win', pid: 'dev', who: 'Dev', amt: 1130, from: 'the pot', desc: 'Three of a Kind, Kings', cards: ['Kh', 'Kd', 'Ks', 'Td', '9s'], potAll: 1130 }),
];

describe('the log book', () => {
  it('takes the table’s recent lines update after update without losing or doubling any', () => {
    const b = new LogBook();
    expect(b.take([L(1, 0), L(2, 1), L(3, 1)])).toBe(true);
    expect(b.take([L(1, 0), L(2, 1), L(3, 1)])).toBe(false); // nothing new
    expect(b.take([L(2, 1), L(3, 1), L(4, 1), L(5, 2)])).toBe(true);
    // the table's window has moved on past hand 1: what was held of it stays
    b.take([L(5, 2), L(6, 2), L(7, 3)]);
    expect(b.list().map((h) => [h.h, h.lines.map((l) => l.n)])).toEqual([[0, [1]], [1, [2, 3, 4]], [2, [5, 6]], [3, [7]]]);
    expect(b.rich).toBe(true);
  });

  it('a line taken back by the dealer goes', () => {
    const b = new LogBook();
    b.take([L(1, 1), L(2, 1, { text: 'A bets' }), L(3, 1, { text: 'B calls' })]);
    b.take([L(1, 1), L(2, 1, { text: 'A bets' }), L(3, 1, { text: 'Dealer undoes the last action' })]);
    expect(b.list()[0]!.lines.map((l) => l.text)).toEqual(['line 1', 'A bets', 'Dealer undoes the last action']);
  });

  it('pages of earlier hands fill in behind; a hand held more fully is left alone; "more" follows the oldest page', () => {
    const b = new LogBook();
    b.take([L(40, 9), L(41, 9), L(42, 9)]);
    b.add({ hands: [{ h: 8, lines: [L(30, 8), L(31, 8)] }, { h: 9, lines: [L(40, 9), L(41, 9)] }], more: true, big: { h: 2, pot: 900 } });
    expect(b.list().map((h) => [h.h, h.lines.length])).toEqual([[8, 2], [9, 3]]);
    expect(b.more).toBe(true);
    expect(b.oldest()).toBe(8);
    expect(b.big).toEqual({ h: 2, pot: 900 });
    b.add({ hands: [{ h: 0, lines: [L(1, 0)] }, { h: 7, lines: [L(20, 7)] }], more: false });
    expect(b.more).toBe(false);
    // the latest page arriving late (asked for at the start) does not bring "more" back
    b.add({ hands: [{ h: 9, lines: [L(40, 9), L(41, 9), L(42, 9)] }], more: true });
    expect(b.more).toBe(false);
  });

  it('knows the biggest pot of the night (the earlier hand when equal)', () => {
    const b = new LogBook();
    b.take([L(1, 1, { k: 'win', potAll: 300 }), L(2, 2, { k: 'win', potAll: 800 }), L(3, 3, { k: 'win', potAll: 800 })]);
    expect(b.big).toEqual({ h: 2, pot: 800 });
    expect(potOf(HAND)).toBe(1130);
  });

  it('an older table (sentences only): the hands it sends are shown as sent, and no history is asked for', () => {
    const b = new LogBook();
    b.take([{ h: 1, text: 'Hand #1' }, { h: 1, text: 'A folds' }, { h: 2, text: 'Hand #2' }]);
    b.take([{ h: 1, text: 'A folds' }, { h: 2, text: 'Hand #2' }, { h: 2, text: 'B checks' }]);
    expect(b.rich).toBe(false);
    expect(b.list().map((h) => h.lines.map((l) => l.text))).toEqual([['Hand #1', 'A folds'], ['Hand #2', 'B checks']]);
    expect(handHtml(1, b.list()[0]!.lines, ctx())).toContain('<span>A folds</span>');
  });

  it('a new game starts a new book', () => {
    const b = new LogBook();
    b.take([L(1, 1)]);
    b.reset();
    expect(b.size).toBe(0);
  });
});

describe('a hand in the log', () => {
  const html = handHtml(3, HAND, ctx({ bigHand: 3 }));
  it('header: the hand, the button, the blinds, and the biggest pot of the night', () => {
    expect(html).toContain('<b>Hand 3</b><span>Dev on the button · blinds 10/20</span>');
    expect(html).toContain('Biggest pot tonight');
    expect(handHtml(3, HAND, ctx({ bigHand: 2 }))).not.toContain('Biggest pot tonight');
  });
  it('the blinds on one line', () => {
    expect(html).toContain('<div class="lgp">Rosh small blind <u>10</u><i> · </i>Momo big blind <u>20</u></div>');
  });
  it('each action: who, the word for it, the amount, what it amounts to, the pot after', () => {
    expect(html).toContain('<b>Dev</b><i class="lg-a">raises to</i><u>60</u><small>3× · pot 90</small>');
    expect(html).toContain('<div class="lgl lx k-fold" data-pid="rosh"><span class="av" aria-hidden="true">[rosh]</span><b>Rosh</b><i class="lg-a">folds</i></div>');
    expect(html).toContain('<b>Momo</b><i class="lg-a">calls</i><u>40</u><small>pot 130</small>');
    expect(html).toContain('<b>Momo</b><i class="lg-a">bets</i><u>65</u><small>half pot · pot 195</small>');
    expect(html).toContain('<div class="lgl lx k-allin lg-me" data-pid="dev">');
    expect(html).toContain('<i class="lg-a">all-in</i><u>500</u><small>7.7× · pot 695</small>');
  });
  it('my own decision times, a long one marked; nobody else’s (the table does not send them)', () => {
    expect(html).toContain('<time class="" aria-label="took 4s">4s</time>');
    expect(html).toContain('<time class="lg-tank" aria-label="took 21s">21s</time>');
    expect(html.match(/<time/g)).toHaveLength(2);
    expect([tookText(300), tookText(59_400), tookText(75_000)]).toEqual(['under 1s', '59s', '1m 15s']);
  });
  it('the streets with the board as cards, the new card marked', () => {
    expect(html).toContain('<div class="lgs"><b>Flop</b><span class="lgc lg-fresh3"><c>Ks</c><c>Td</c><c>4h</c></span><small>pot 130</small></div>');
    expect(html).toContain('<b>Turn</b><span class="lgc lg-fresh1">');
  });
  it('hands shown, and the result with the five cards that made it', () => {
    expect(html).toContain('<b>Momo</b><i class="lg-a">shows</i><span class="lgc "><c>Ac</c><c>Tc</c></span><small>Pair of Tens</small>');
    expect(html).toContain('<p><b>Dev</b> wins <u>1130</u></p><p class="lg-d">Three of a Kind, Kings</p><span class="lgc lg-five"><c>Kh</c><c>Kd</c><c>Ks</c><c>Td</c><c>9s</c></span>');
    const fold = handHtml(4, [L(30, 4, { k: 'hand', bb: 20, sb: 10 }), L(31, 4, { k: 'back', pid: 'a', who: 'A', amt: 40 }), L(32, 4, { k: 'win', pid: 'a', who: 'A', amt: 70, from: 'the pot', potAll: 70 })], ctx());
    expect(fold).toContain('40 not called, back to A');
    expect(fold).toContain('everyone else folded');
    expect(handHtml(5, [L(40, 5, { k: 'win', pid: 'a', who: 'A', amt: 70, from: 'side pot 1', desc: 'Flush', cards: [] })], ctx())).toContain('<small class="lg-from">side pot 1</small>');
  });
  it('table events stand apart from the play', () => {
    const h = handHtml(0, [L(1, 0, { k: 'join', pid: 'a', who: 'Anish' }), L(2, 0, { k: 'blinds', up: true, sb: 20, bb: 40 }), L(3, 0, { k: 'rebuy', pid: 'a', who: 'Anish', amt: 2000 }), L(4, 0, { k: 'timeout', pid: 'a', who: 'Anish' }), L(5, 0, { k: 'undo' })], ctx());
    expect(h).toContain('Before the first hand');
    expect(h).toContain('<div class="lgn "><span>Anish joins the table</span></div>');
    expect(h).toContain('<div class="lgn lg-up"><span>Blinds go up to 20/40</span></div>');
    expect(h).toContain('Anish rebuys for 2000');
    expect(h).toContain('<div class="lgn lg-warn"><span>Anish ran out of time</span></div>');
    expect(h).toContain('The dealer took back the last action');
  });
  it('one player only: their lines, the streets up to their last one; a hand they took no part in is left out', () => {
    const rosh = handHtml(3, HAND, ctx({ only: 'rosh' }));
    expect(rosh).toContain('<b>Rosh</b><i class="lg-a">folds</i>');
    expect(rosh).not.toContain('Momo');
    expect(rosh).not.toContain('Flop');
    expect(rosh).not.toContain('lgp');
    const momo = handHtml(3, HAND, ctx({ only: 'momo' }));
    expect(momo).toContain('Flop');
    expect(momo).toContain('River'); // she showed at the end
    expect(momo).not.toContain('wins');
    expect(handHtml(3, HAND, ctx({ only: 'anish' }))).toBe('');
  });
  it('names are escaped', () => {
    expect(handHtml(1, [L(1, 1, { k: 'act', pid: 'x', who: '<b>x</b>', a: 'check' })], ctx())).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
  it('raise and bet sizes in words', () => {
    expect(sizeNote({ h: 1, text: '', a: 'raise', to: 250, pot: 400 }, 20, String)).toBe('13× · pot 400');
    expect(sizeNote({ h: 1, text: '', a: 'bet', amt: 100, to: 100, pot: 200 }, 0, String)).toBe('pot-size · pot 200');
    expect(sizeNote({ h: 1, text: '', a: 'bet', amt: 30, to: 30, pot: 130 }, 0, String)).toBe('30% of pot · pot 130');
    expect(sizeNote({ h: 1, text: '', a: 'call', amt: 30, to: 30, pot: 130 }, 60, String)).toBe('pot 130');
  });
});
