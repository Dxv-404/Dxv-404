// The dealer on phones (table/layout.ts dealerSpot): laid out after the table, shown only where it fits above
// the felt and clear of every seat; the table itself is the same either way.
import { describe, it, expect } from 'vitest';
import { arenaSize, dealerSpot, isCompact, makeGeo, modeFor, place, DEALER_BOX, type Geo, type Placed, type SeatIn } from '../src/table/layout';

function table(W: number, H: number, n: number): { g: Geo; placed: Placed; st: SeatIn[] } {
  const { mode, lw, lh, dock } = modeFor(W, H);
  const compact = isCompact(mode, lw, lh, n);
  const [aw, ah] = arenaSize(mode, lw, lh, dock, compact);
  const g = makeGeo(mode, aw, ah, n, compact);
  const st = Array.from({ length: n - 1 }, () => ({ mini: false, bet: false }));
  return { g, placed: place(g, st, null), st };
}

describe('the dealer on phones', () => {
  it('stands above the felt, inside the table width, clear of every seat (and the cards it shows)', () => {
    let shown = 0;
    for (const [W, H] of [[390, 664], [375, 553], [412, 780], [430, 740], [390, 844], [430, 932], [360, 740]] as const) {
      for (let n = 2; n <= 15; n++) {
        const { g, placed, st } = table(W, H, n);
        const d = dealerSpot(g, placed, st);
        if (!d) continue;
        shown++;
        const [w, h] = DEALER_BOX[d.size];
        expect(d.box).toEqual([d.x - w / 2, 0, d.x + w / 2, h]);
        expect(d.box[0]).toBeGreaterThanOrEqual(g.tl);
        expect(d.box[2]).toBeLessThanOrEqual(g.tl + g.tw);
        // in the middle: above the felt, which starts at least 7 px inside the table's box (it curves down from there)
        if (d.x === g.tl + g.tw / 2) expect(h).toBeLessThanOrEqual(g.tt + 7);
        for (const s of placed.seats) expect(Math.abs(s.x - d.x) >= w / 2 + 36 || s.y - 50 >= h).toBe(true);
      }
    }
    expect(shown).toBeGreaterThan(20);
  });
  it('the full-size dealer on a tall phone, the small one on a short phone, none on a crowded short one', () => {
    const tall = table(430, 932, 9);
    expect(dealerSpot(tall.g, tall.placed, tall.st)?.size).toBe('lg');
    const short = table(375, 553, 2);
    expect(dealerSpot(short.g, short.placed, short.st)?.size).toBe('sm');
    const crowded = table(375, 553, 9);
    expect(dealerSpot(crowded.g, crowded.placed, crowded.st)).toBeNull();
  });
  it('no dealer spot on a phone held sideways or a big screen (those keep their own rules)', () => {
    for (const [W, H] of [[844, 390], [1440, 900]] as const) {
      const { g, placed, st } = table(W, H, 6);
      expect(dealerSpot(g, placed, st)).toBeNull();
    }
  });
  it('the dealer button keeps clear of the dealer; the seats do not move', () => {
    const { g, st } = table(390, 664, 2);
    const at = place(g, st, 0);
    const d = dealerSpot(g, at, st)!;
    const again = place(g, st, 0, d.box);
    expect(again.seats).toEqual(at.seats);
    const b = again.dbtn!;
    expect(b.x <= d.box[0] - 14 || b.x >= d.box[2] + 14 || b.y >= d.box[3] + 14).toBe(true);
  });
});
