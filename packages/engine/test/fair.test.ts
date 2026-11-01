import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createHash, randomBytes } from 'node:crypto';
import {
  sha256, sha256hex, toHex, fromHex, utf8, seededWords, combineSeeds, deckFromSeed, deckCommit,
  seedCommit, verifyDeck, randomSeed, isSeed,
} from '../src/fair';
import { freshDeck } from '../src/cards';

const nodeSha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('sha256', () => {
  it('matches the standard test vectors', () => {
    expect(sha256hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  it('agrees with Node for any input, including lengths around block edges', () => {
    fc.assert(fc.property(fc.uint8Array({ minLength: 0, maxLength: 300 }), (b) => {
      expect(toHex(sha256(b))).toBe(nodeSha(b));
    }), { numRuns: 500 });
    for (const n of [55, 56, 63, 64, 65, 119, 120, 128]) {
      const b = new Uint8Array(n).fill(7);
      expect(toHex(sha256(b))).toBe(nodeSha(b));
    }
  });
  it('encodes text as UTF-8 exactly like Node', () => {
    fc.assert(fc.property(fc.string({ unit: 'binary' }), (s) => {
      expect(toHex(utf8(s))).toBe(Buffer.from(s, 'utf8').toString('hex'));
    }), { numRuns: 300 });
  });
  it('hex round-trips and rejects bad hex', () => {
    const b = randomBytes(32);
    expect(toHex(fromHex(toHex(b)))).toBe(toHex(b));
    expect(() => fromHex('abc')).toThrow();
    expect(() => fromHex('ZZ')).toThrow();
  });
});

describe('seeded decks', () => {
  it('the same seed always gives the same deck, different seeds different decks', () => {
    const s = randomSeed();
    expect(isSeed(s)).toBe(true);
    expect(deckFromSeed(s)).toEqual(deckFromSeed(s));
    expect(deckFromSeed(randomSeed())).not.toEqual(deckFromSeed(s));
  });
  it('every seed gives a full 52-card deck', () => {
    fc.assert(fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (b) => {
      const d = deckFromSeed(toHex(b));
      expect([...d].sort((x, y) => x - y)).toEqual(freshDeck());
    }), { numRuns: 300 });
  });
  it('word stream crosses block boundaries without repeating', () => {
    const w = seededWords('00'.repeat(32));
    const a = new Uint32Array(40);
    w(a);
    expect(new Set(a).size).toBe(40);
  });
  it('seeded decks are fair: each card lands in each position about equally (chi-square)', () => {
    const N = 26_000;
    const counts = Array.from({ length: 52 }, () => new Array<number>(52).fill(0));
    for (let i = 0; i < N; i++) deckFromSeed(randomSeed()).forEach((c, pos) => { counts[c]![pos]! += 1; });
    const e = N / 52;
    const worst = Math.max(...counts.map((row) => row.reduce((a, o) => a + (o - e) ** 2 / e, 0)));
    expect(worst).toBeLessThan(117);
  });
});

describe('Shared shuffle', () => {
  const dealer = randomSeed();
  it('no contributions means the dealer seed is used as is', () => {
    expect(combineSeeds(dealer, [])).toBe(dealer);
  });
  it('order of answers does not matter, but every contribution changes the deck', () => {
    const a = randomSeed(), b = randomSeed();
    expect(combineSeeds(dealer, [a, b])).toBe(combineSeeds(dealer, [b, a]));
    expect(combineSeeds(dealer, [a, b])).not.toBe(combineSeeds(dealer, [a]));
    expect(combineSeeds(dealer, [a])).not.toBe(dealer);
  });
  it('rejects malformed seeds', () => {
    expect(() => combineSeeds('xyz')).toThrow();
    expect(() => combineSeeds(dealer, ['short'])).toThrow();
  });
});

describe('deck proof', () => {
  it('verifies an honest deal and rebuilds the deck', () => {
    const dealerSeed = randomSeed(), contributions = [randomSeed(), randomSeed()];
    const seed = combineSeeds(dealerSeed, contributions);
    const deck = deckFromSeed(seed);
    const r = verifyDeck({ dealerSeed, contributions, commit: deckCommit(seed, deck), dealerSeedCommit: seedCommit(dealerSeed) });
    expect(r.ok).toBe(true);
    expect(r.deck).toEqual(deck);
  });
  it('catches a swapped card, a different seed, a broken promise and garbage', () => {
    const dealerSeed = randomSeed();
    const deck = deckFromSeed(dealerSeed);
    const swapped = [...deck];
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    expect(verifyDeck({ dealerSeed, contributions: [], commit: deckCommit(dealerSeed, swapped) }).ok).toBe(false);
    expect(verifyDeck({ dealerSeed: randomSeed(), contributions: [], commit: deckCommit(dealerSeed, deck) }).ok).toBe(false);
    expect(verifyDeck({ dealerSeed, contributions: [], commit: deckCommit(dealerSeed, deck), dealerSeedCommit: seedCommit(randomSeed()) }).reason).toMatch(/promised/);
    expect(verifyDeck({ dealerSeed: 'nope', contributions: [], commit: 'x' }).ok).toBe(false);
  });
});
