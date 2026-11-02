// Who won, and with what (apps/web/src/table/results.ts and the results steps in render.ts): the words, the
// best five, the split line, the chances, and which seats show their cards at each step.
import { describe, expect, it } from 'vitest';
import { Engine, evalBest, parseCard, type HandEval, type HandResults } from '@tp/engine';
import { bestOnBoard, chances, chancesLine, handShort, handWords, kickerWord, nextLabel, runoutTitle, summarize, type Step } from '../src/table/results';
import { orderFive, renderTable } from '../src/table/render';
import type { ScreenView } from '../src/net-table';

const ev = (cards: string[]): HandEval => { const e = evalBest(cards.map(parseCard))!; return { score: e.score, name: e.name, desc: e.desc, best: e.cards.map((c) => '23456789TJQKA'[c >> 2]! + 'shdc'[c & 3]!) }; };

describe('hands in words', () => {
  const cases: [string[], string, string][] = [
    [['As', 'Ks', 'Qs', 'Js', 'Ts'], 'Royal flush', 'Royal flush'],
    [['9h', '8h', '7h', '6h', '5h'], 'Straight flush, nine high', 'Straight flush'],
    [['Qc', 'Qd', 'Qh', 'Qs', '7d'], 'Four queens', 'Four queens'],
    [['Kh', 'Ks', 'Kc', '7d', '7h'], 'Full house, kings full of sevens', 'Full house'],
    [['Ad', 'Jd', '8d', '6d', '2d'], 'Flush, ace high', 'Flush'],
    [['Tc', '9d', '8s', '7h', '6c'], 'Straight, ten high', 'Straight'],
    [['As', '2d', '3c', '4h', '5s'], 'Straight, five high', 'Straight'],
    [['7s', '7h', '7d', 'Kc', '2s'], 'Three sevens', 'Three sevens'],
    [['Jh', 'Js', '5c', '5d', 'Ah'], 'Two pair, jacks and fives', 'Two pair'],
    [['Th', 'Tc', 'Ks', '8d', '3c'], 'Pair of tens', 'One pair'],
    [['Ah', 'Qd', '9c', '6s', '3h'], 'Ace high', 'Ace high'],
  ];
  for (const [cards, words, short] of cases) {
    it(words, () => {
      expect(handWords(ev(cards))).toBe(words);
      expect(handShort(ev(cards))).toBe(short);
    });
  }
  it('the best five out of seven, and the kicker that decides a tie', () => {
    const e = ev(['Ad', '9c', 'Ks', '7h', '2d', 'Kc', '9h']);
    expect(handWords(e)).toBe('Two pair, kings and nines');
    expect(e.best.sort()).toEqual(['9c', '9h', 'Ad', 'Kc', 'Ks'].sort());
    expect(kickerWord(e)).toBe('ace kicker');
    expect(kickerWord(ev(['Kh', 'Ks', 'Kc', '7d', '7h']))).toBeNull();
    expect(orderFive(['7h', 'Kc', '7d', 'Ks', 'Kh'])).toEqual(['Kc', 'Ks', 'Kh', '7h', '7d']);
    expect(orderFive(['3c', 'As', '5s', '2d', '4h'])).toEqual(['5s', '4h', '3c', '2d', 'As']);
  });
  it('board cards in a winner’s best five lift, the others dim', () => {
    const lift = bestOnBoard(['Ks', '7h', '2d', 'Kc', '9h'], [ev(['Kh', '7d', 'Ks', '7h', '2d', 'Kc', '9h']).best]);
    expect([...lift].sort()).toEqual(['7h', 'Kc', 'Ks']);
    // a split pot: the cards of both winners
    expect([...bestOnBoard(['Ks', '7h', '2d', 'Kc', '9h'], [['Ks', 'Kc', '9h', '9c', 'Ad'], ['Ks', 'Kc', '9h', '9d', 'Ac']])].sort()).toEqual(['9h', 'Kc', 'Ks']);
  });
});

describe('who won, in words', () => {
  const names: Record<string, string> = { r: 'Riya', m: 'Meera', k: 'Kabir', t: 'Tara' };
  const nameOf = (pid: string) => names[pid]!;
  it('one winner', () => {
    const e = ev(['Kh', '7d', 'Ks', '7h', '2d', 'Kc', '9h']);
    const R: HandResults = { showdown: true, evals: { r: e, m: ev(['Qh', 'Qd', 'Ks', '7h', '2d', 'Kc', '9h']) }, pots: [{ label: 'the pot', amount: 1300, awards: [{ pid: 'r', amount: 1300 }], hand: e }] };
    const s = summarize(R, nameOf);
    expect(s.title).toBe('Riya wins 1,300');
    expect(s.line).toBe('Full house, kings full of sevens');
    expect(s.split).toBe(false);
    expect(s.winners.map((w) => w.pid)).toEqual(['r']);
  });
  it('a split pot names both, how it was split and why', () => {
    const a = ev(['Ad', '9c', 'Ks', '7h', '2d', 'Kc', '9h']), b = ev(['Ac', '9d', 'Ks', '7h', '2d', 'Kc', '9h']);
    const R: HandResults = { showdown: true, evals: { r: a, m: b }, pots: [{ label: 'the pot', amount: 1300, awards: [{ pid: 'r', amount: 650 }, { pid: 'm', amount: 650 }], hand: a }] };
    const s = summarize(R, nameOf);
    expect(s.split).toBe(true);
    expect(s.title).toBe('Split pot · 650 each');
    expect(s.line).toBe('Meera and Riya: kings and nines, ace kicker');
    // an odd chip
    const odd = summarize({ ...R, pots: [{ ...R.pots[0]!, amount: 1301, awards: [{ pid: 'r', amount: 651 }, { pid: 'm', amount: 650 }] }] }, nameOf);
    expect(odd.title).toBe('Split pot · 651 / 650');
  });
  it('a main pot and a side pot to different players', () => {
    const a = ev(['Ah', 'Ad', 'As', '7h', '2d', 'Kc', '9h']), b = ev(['Kh', 'Kd', 'As', '7h', '2d', 'Kc', '9h']);
    const R: HandResults = { showdown: true, evals: { r: a, m: b }, pots: [{ label: 'the main pot', amount: 900, awards: [{ pid: 'r', amount: 900 }], hand: a }, { label: 'side pot 1', amount: 400, awards: [{ pid: 'm', amount: 400 }], hand: b }] };
    const s = summarize(R, nameOf);
    expect(s.split).toBe(false);
    expect(s.title).toBe('Riya wins 900 · Meera wins 400');
    expect(s.line).toBe('Three aces');
  });
  it('everyone folded', () => {
    const s = summarize({ showdown: false, evals: {}, pots: [{ label: 'the pot', amount: 240, awards: [{ pid: 'k', amount: 240 }], hand: null }] }, nameOf);
    expect([s.title, s.line]).toEqual(['Everyone folded', 'Kabir wins 240 · cards stay hidden']);
  });
});

describe('chances when all-in before the river', () => {
  it('exact on the turn and the flop, add up to 100', () => {
    // aces against kings with K on the turn: kings ahead, an ace (2 left) or nothing saves aces
    const c = chances({ r: ['Ah', 'Ad'], t: ['Kh', 'Kd'] }, ['2c', '7s', '9h', 'Ks']);
    expect(c.r! + c.t!).toBe(100);
    expect(c.r).toBe(5); // 2 of 44 rivers
    const f = chances({ r: ['Kh', '7d'], t: ['Ah', 'Qh'] }, ['Ks', '7h', '2d']);
    expect(f.r! + f.t!).toBe(100);
    expect(f.r).toBeGreaterThan(90);
    expect(chancesLine({ r: 71, t: 29 }, (p) => (p === 'r' ? 'Riya' : 'Tara'))).toBe('Riya 71% · Tara 29%');
  });
  it('before the flop: sampled, repeatable, about right', () => {
    const a = chances({ r: ['Ah', 'Ad'], t: ['Kh', 'Kd'] }, []);
    expect(a).toEqual(chances({ r: ['Ah', 'Ad'], t: ['Kh', 'Kd'] }, []));
    expect(a.r).toBeGreaterThan(77); expect(a.r).toBeLessThan(86); // about 82 %
    const tie = chances({ r: ['Ah', 'Kd'], t: ['Ad', 'Kh'] }, ['2c', '3c', '4c', '9h', '9s']);
    expect(tie).toEqual({ r: 50, t: 50 });
  });
  it('labels', () => {
    expect(runoutTitle(0)).toBe('All-in · dealing the flop');
    expect(runoutTitle(3)).toBe('All-in · dealing the turn');
    expect(runoutTitle(4)).toBe('All-in · dealing the river');
    expect(nextLabel(4200, true, false)).toBe('Next hand in 5 · tap to skip');
    expect(nextLabel(4200, true, true)).toBe('Next hand in 5 · Space to skip');
    expect(nextLabel(900, false, false)).toBe('Next hand in 1');
  });
});

describe('the table at each step after a showdown', () => {
  // Dev (me) A A, Riya K 7 (wins a full house), Arjun folds, Meera Q Q
  const play = () => {
    const e = Engine.newGame({ startStack: 2000, sb: 10, bb: 20 }, ['Dev', 'Riya', 'Arjun', 'Meera']);
    for (const p of e.s.players) p.connected = true;
    e.startHand();
    const h = e.s.hand!;
    const [dev, riya, arjun, meera] = e.s.players.map((p) => p.id) as [string, string, string, string];
    const hole: Record<string, string[]> = { [dev]: ['As', 'Ah'], [riya]: ['Kh', '7d'], [arjun]: ['2c', '3c'], [meera]: ['Qh', 'Qd'] };
    for (const [pid, c] of Object.entries(hole)) h.ps[pid]!.cards = c.map(parseCard);
    const used = new Set([...Object.values(hole).flat(), 'Ks', '7h', '2d', 'Kc', '9h']);
    const rest = [...'23456789TJQKA'].flatMap((r) => [...'shdc'].map((s) => r + s)).filter((c) => !used.has(c)).map(parseCard);
    h.deck = [...rest.slice(0, -3), parseCard('9h'), rest.at(-1)!, parseCard('Kc'), rest.at(-2)!, parseCard('2d'), parseCard('7h'), parseCard('Ks'), rest.at(-3)!];
    for (let i = 0; i < 30 && e.s.hand?.toAct; i++) {
      const pid = e.s.hand.toAct;
      const L = e.legal(pid)!;
      e.act(pid, { type: pid === arjun ? 'fold' : L.canCheck ? 'check' : 'call' });
    }
    const v = { ...e.viewFor(dev), isHost: true, hostId: dev, turnLeft: 0, turnTotal: 0, nextIn: 1 } as ScreenView;
    return { v, dev, riya, arjun, meera };
  };
  const at = (step: Step) => {
    const t = play();
    const f = renderTable(t.v, 'classic', 390, 844, { peek: false, bubble: null, code: 'X', net: 'good', res: { step, next: { at: performance.now() + 5000, total: 8000 }, skip: step !== 'hold' } });
    const seat = (pid: string) => new RegExp(`<div class="seat[^"]*"[^>]*data-pid="${pid}">([\\s\\S]*?)(?=<div class="seat|$)`).exec(f.parts.arena!)?.[0] ?? '';
    return { ...t, f, seat };
  };
  it('scene: nobody shows yet; the pot is still there', () => {
    const t = at('scene');
    expect(t.v.hand!.results!.showdown).toBe(true);
    expect(t.seat(t.riya)).not.toContain('class="shown');
    expect(t.f.parts.felt).not.toContain('wpill');
    expect(t.f.parts.felt).toContain('pot');
  });
  it('winner: only the winner turns over (bigger), the best five lift, the pill names it', () => {
    const t = at('winner');
    expect(t.seat(t.riya)).toMatch(/class="seat[^"]* win/);
    expect(t.seat(t.riya)).toMatch(/class="shown rv( shl)?"/);
    expect(t.seat(t.riya)).toContain('--w:26px');
    expect(t.seat(t.riya)).toContain('>Full house<');
    expect(t.seat(t.meera)).not.toContain('class="shown');
    expect(t.f.parts.felt).toContain('Riya wins 80');
    expect(t.f.parts.felt).toContain('Full house, kings full of sevens');
    expect((t.f.parts.felt!.match(/class="cd [sml] [shdc] win lift"/g) ?? []).length).toBe(3);
    expect((t.f.parts.felt!.match(/class="cd [sml] [shdc] lose"/g) ?? []).length).toBe(2);
  });
  it('all: everyone at the showdown shows and is named; folded hands never', () => {
    const t = at('all');
    expect(t.seat(t.meera)).toMatch(/class="shown rv( shl)?"/);
    expect(t.seat(t.meera)).toMatch(/class="seat[^"]* lose/);
    expect(t.seat(t.meera)).toContain('>Two pair<');
    expect(t.seat(t.riya)).toMatch(/class="shown( shl)?"/); // already up: no second flip
    expect(t.seat(t.arjun)).not.toContain('class="shown');
    expect(t.seat(t.arjun)).not.toContain('Two of clubs');
    // my own cards face up in the hand area with the hand in words
    expect(t.f.parts.hero).toContain('hc open');
    expect(t.f.parts.hero).toContain('Two pair, aces and kings');
    expect(t.f.parts.actions).toContain('Next hand in 5 · tap to skip');
  });
  it('hold: the end state, the bar without skipping', () => {
    const t = at('hold');
    expect(t.f.parts.actions).toMatch(/Next hand in 5</);
    expect(t.f.parts.felt).not.toContain(' lift');
  });
});
