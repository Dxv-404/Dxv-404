import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  cardStr, parseCard, freshDeck, shuffle, randInt, eval5, evalBest, describePartial,
  rankOf, suitOf, type RandomWords,
} from '../src/cards';

const cards = (s: string) => s.split(' ').map(parseCard);

/** Deterministic word source for reproducible tests. */
function seeded(seed: number): RandomWords {
  let x = seed >>> 0 || 1;
  return (out) => {
    for (let i = 0; i < out.length; i++) {
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      out[i] = x;
    }
  };
}

describe('card encoding', () => {
  it('round-trips every card', () => {
    for (let c = 0; c < 52; c++) expect(parseCard(cardStr(c))).toBe(c);
  });
  it('maps rank and suit', () => {
    expect(cardStr(parseCard('As'))).toBe('As');
    expect(rankOf(parseCard('As'))).toBe(12);
    expect(suitOf(parseCard('2c'))).toBe(3);
  });
  it('rejects things that are not cards', () => {
    for (const bad of ['', 'A', 'Ax', '1s', 'Ass', 'as']) expect(() => parseCard(bad)).toThrow();
  });
});

describe('shuffle', () => {
  it('always returns a permutation of the 52 cards', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 2 ** 31 }), (seed) => {
      const d = shuffle(freshDeck(), seeded(seed));
      expect(d).toHaveLength(52);
      expect(new Set(d).size).toBe(52);
      expect([...d].sort((a, b) => a - b)).toEqual(freshDeck());
    }), { numRuns: 300 });
  });

  it('uses the real crypto source by default and gives different decks', () => {
    const a = shuffle(freshDeck()).join(','), b = shuffle(freshDeck()).join(',');
    expect(a).not.toBe(b);
  });

  it('puts every card in every position about equally often (chi-square)', () => {
    // 52x52 position counts over N shuffles; chi-square per card must stay well under a loose bound.
    const N = 26_000;
    const counts = Array.from({ length: 52 }, () => new Array<number>(52).fill(0));
    for (let i = 0; i < N; i++) {
      const d = shuffle(freshDeck());
      d.forEach((card, pos) => { counts[card]![pos]! += 1; });
    }
    const expected = N / 52;
    let worst = 0;
    for (const row of counts) {
      const chi = row.reduce((a, o) => a + (o - expected) ** 2 / expected, 0);
      worst = Math.max(worst, chi);
    }
    // 51 degrees of freedom: p = 1e-6 is about 117. A biased shuffle blows far past this.
    expect(worst).toBeLessThan(117);
  });
});

describe('randInt', () => {
  it('stays in range and rejects bad ranges', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), (n) => {
      const x = randInt(n);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(n);
    }));
    expect(() => randInt(0)).toThrow();
    expect(() => randInt(1.5)).toThrow();
  });
  it('rejects words above the unbiased limit (rejection sampling)', () => {
    // n = 3: limit = floor(2^32/3)*3 = 4294967295, so 0xFFFFFFFF must be rejected.
    const seq = [0xffffffff, 7];
    let i = 0;
    const words: RandomWords = (out) => { out[0] = seq[i++]!; };
    expect(randInt(3, words)).toBe(7 % 3);
    expect(i).toBe(2);
  });
});

describe('hand evaluation', () => {
  const name = (s: string) => evalBest(cards(s))!.name;
  it('recognises every category', () => {
    expect(name('As Ks Qs Js Ts')).toBe('Royal Flush');
    expect(name('9s Ks Qs Js Ts')).toBe('Straight Flush');
    expect(name('9s 9h 9d 9c Ts')).toBe('Four of a Kind');
    expect(name('9s 9h 9d Tc Ts')).toBe('Full House');
    expect(name('2s 9s 4s Js Ts')).toBe('Flush');
    expect(name('9s 8h 7d 6c 5s')).toBe('Straight');
    expect(name('9s 9h 9d 6c 5s')).toBe('Three of a Kind');
    expect(name('9s 9h 6d 6c 5s')).toBe('Two Pair');
    expect(name('9s 9h 6d 4c 2s')).toBe('One Pair');
    expect(name('Ks 9h 6d 4c 2s')).toBe('High Card');
  });
  it('treats A-2-3-4-5 as the lowest straight', () => {
    expect(evalBest(cards('Ah 2c 3d 4s 5h'))!.score).toBeLessThan(evalBest(cards('2c 3d 4s 5h 6h'))!.score);
  });
  it('returns null for fewer than 5 cards', () => {
    expect(evalBest(cards('As Ks'))).toBeNull();
  });
  it('best-of-7 is never worse than any 5-card subset', () => {
    fc.assert(fc.property(fc.shuffledSubarray(freshDeck(), { minLength: 7, maxLength: 7 }), (seven) => {
      const best = evalBest(seven)!.score;
      for (let skip1 = 0; skip1 < 7; skip1++) for (let skip2 = skip1 + 1; skip2 < 7; skip2++) {
        const five = seven.filter((_, i) => i !== skip1 && i !== skip2);
        expect(eval5(five).score).toBeLessThanOrEqual(best);
      }
    }), { numRuns: 300 });
  });
  it('ignores suit order and card order', () => {
    fc.assert(fc.property(fc.shuffledSubarray(freshDeck(), { minLength: 7, maxLength: 7 }), (seven) => {
      const a = evalBest(seven)!.score;
      const b = evalBest([...seven].reverse())!.score;
      expect(a).toBe(b);
    }), { numRuns: 200 });
  });
  it('describes partial hands for the live hint', () => {
    expect(describePartial(cards('As Ad'))).toBe('Pair of Aces');
    expect(describePartial(cards('As Kd'))).toBe('Ace high');
    expect(describePartial(cards('As Ad Kc Kh'))).toBe('Two Pair, Aces and Kings');
    expect(describePartial(cards('As Ad Ac'))).toBe('Three of a Kind, Aces');
    expect(describePartial(cards('As Ad Ac Ah'))).toBe('Four of a Kind, Aces');
    expect(describePartial(cards('As Ad Ac Kh Kd'))).toBe('Full House, Aces full of Kings');
  });
  it('describes every category in words', () => {
    const d = (s: string) => evalBest(cards(s))!.desc;
    expect(d('9s Ks Qs Js Ts')).toBe('Straight Flush, King high');
    expect(d('9s 9h 9d 9c Ts')).toBe('Four of a Kind, Nines');
    expect(d('2s 9s 4s Js Ts')).toBe('Flush, Jack high');
    expect(d('9s 9h 9d 6c 5s')).toBe('Three of a Kind, Nines');
    expect(d('9s 9h 6d 4c 2s')).toBe('Pair of Nines');
    expect(d('Ks 9h 6d 4c 2s')).toBe('King high');
  });
});
