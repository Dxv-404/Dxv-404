// The result pill after a hand (render.ts: .wpill, on the felt under the board) moves out of the way of the seats
// and of the cards they show. Its own size depends on the theme's fonts, so it is placed on the page, after the
// table is drawn: as near its usual spot as it can be, inside the felt, clear of the board, every seat and every
// shown hand, including the hands that turn over a moment later (render.ts marks those seats with data-sd).
// If nowhere is clear it gets narrower (its lines wrap), then its type smaller, then it keeps its first line only.

interface Box { l: number; t: number; r: number; b: number }
const box = (r: DOMRect): Box => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
const hits = (a: Box, b: Box, pad: number): boolean => !(a.r + pad <= b.l || b.r + pad <= a.l || a.b + pad <= b.t || b.b + pad <= a.t);
const overlap = (a: Box, b: Box): number => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

/**
 * Measure with every animation of the table at rest (a card turning over or a seat pulsing has a smaller or larger
 * box for a moment): the animations are paused at their end state (a looping one at its start), read, and put back.
 */
function atRest<T>(root: HTMLElement, read: () => T): T {
  const anims = root.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' || a.playState === 'paused');
  const saved = anims.map((a) => ({ a, t: a.currentTime, run: a.playState === 'running' }));
  for (const { a } of saved) {
    const end = Number(a.effect?.getComputedTiming().endTime);
    try { a.pause(); a.currentTime = Number.isFinite(end) ? end : 0; } catch { /* an animation without a timeline */ }
  }
  try { return read(); } finally {
    for (const { a, t, run } of saved) { try { a.currentTime = t; if (run) a.play(); } catch { /* gone */ } }
  }
}

/** Is the point inside the felt (a rounded rectangle whose corner radius is its border radius)? */
function inFelt(f: Box, rad: number, x: number, y: number, m: number): boolean {
  if (x < f.l + m || x > f.r - m || y < f.t + m || y > f.b - m) return false;
  const cx = Math.min(Math.max(x, f.l + rad), f.r - rad), cy = Math.min(Math.max(y, f.t + rad), f.b - rad);
  return Math.hypot(x - cx, y - cy) <= rad - m;
}

/** Place the result pill of the table drawn in `tp` (the .tp.live element). Does nothing without a pill. */
export function fitPill(tp: HTMLElement | null): void {
  const pill = tp?.querySelector<HTMLElement>('.felt .wpill');
  const felt = pill?.parentElement?.closest<HTMLElement>('.felt');
  if (!tp || !pill || !felt) return;
  pill.style.top = ''; pill.style.bottom = ''; pill.style.maxWidth = ''; pill.style.left = '';
  atRest(tp, () => {
    const s = tp.getBoundingClientRect().width / (parseFloat(tp.style.width) || tp.offsetWidth || 1) || 1; // the table's zoom
    const F = box(felt.getBoundingClientRect());
    const fs = getComputedStyle(felt);
    const rr = fs.borderTopLeftRadius.endsWith('%') ? Infinity : parseFloat(fs.borderTopLeftRadius) * s || 0;
    const rad = Math.min(rr, (F.r - F.l) / 2, (F.b - F.t) / 2);
    const board = felt.querySelector('.board:not(.b2)');
    const fixed: Box[] = Array.from(felt.querySelectorAll('.board, .sidepot')).map((e) => box(e.getBoundingClientRect()));
    // what is in the way: each seat's avatar, name plate, tag and cards, and the cards it is about to show
    const seats: Box[] = [];
    for (const st of Array.from(tp.querySelectorAll<HTMLElement>('.seat'))) {
      for (const e of Array.from(st.querySelectorAll(':scope > .av, :scope > .plate, :scope > .tag, :scope > .shown, :scope > .backs'))) {
        const r = e.getBoundingClientRect();
        if (r.width && r.height) seats.push(box(r));
      }
      const sd = st.dataset.sd; // "<card width>" or "<card width>l": the hand it shows at the next step (and on which side)
      if (sd) {
        const w = parseFloat(sd) * s, left = sd.endsWith('l');
        const r = st.getBoundingClientRect();
        const mid = (r.left + r.right) / 2, cw = 2 * w + 2 * s, ch = w * 1.4;
        const t = r.top - 16 * s;
        seats.push(left ? { l: mid - 6 * s - cw, t, r: mid - 6 * s, b: t + ch } : { l: mid + 6 * s, t, r: mid + 6 * s + cw, b: t + ch });
      }
    }
    for (const e of Array.from(tp.querySelectorAll('.arena .bet, .arena .dbtn'))) seats.push(box(e.getBoundingClientRect()));
    const B = board ? box(board.getBoundingClientRect()) : null;
    const pad = 3 * s, m = 2 * s;
    const cx = (F.l + F.r) / 2;
    let best: { top: number; dx: number; cost: number; maxW: number | null; tight: boolean; bare: boolean } | null = null;
    // narrower and narrower (its lines wrap), down to 120 px (80 for the first line alone); then the same in smaller type; last, on the most
    // crowded small tables, its first line alone (the hand is on the winner's seat tag, and the winner card said it)
    search: for (const [tight, bare] of [[false, false], [true, false], [true, true]] as const) {
      pill.classList.toggle('tight', tight);
      pill.classList.toggle('bare', bare);
      pill.style.maxWidth = ''; pill.style.top = '0px'; pill.style.bottom = 'auto';
      const fullW = pill.getBoundingClientRect().width;
      const minW = Math.min(fullW, (bare ? 80 : 120) * s);
      for (let k = 0; k <= 10; k++) {
        const maxW = k === 0 ? null : fullW - ((fullW - minW) * k) / 10;
        pill.style.maxWidth = maxW === null ? '' : `${(maxW / s).toFixed(0)}px`;
        pill.style.top = '0px'; pill.style.bottom = 'auto';
        const P0 = box(pill.getBoundingClientRect());
        const w = P0.r - P0.l, h = P0.b - P0.t;
        pill.style.top = ''; pill.style.bottom = ''; // back to its usual spot, to start there
        const home = pill.getBoundingClientRect().top;
        // its usual spot first, then further and further away from it (below the board first), a little to
        // either side if it must
        const tops: number[] = [];
        for (let d = 0; d <= F.b - F.t; d += 2 * s) { tops.push(home + d); if (d) tops.push(home - d); }
        for (const top of tops) {
          for (const dx of [0, -6, 6, -12, 12, -18, 18, -24, 24, -30, 30, -36, 36].map((x) => x * s)) {
            const P: Box = { l: cx + dx - w / 2, t: top, r: cx + dx + w / 2, b: top + h };
            if (P.t < F.t || P.b > F.b) continue;
            const inside = [[P.l + 4 * s, P.t], [P.r - 4 * s, P.t], [P.l + 4 * s, P.b], [P.r - 4 * s, P.b], [P.l, (P.t + P.b) / 2], [P.r, (P.t + P.b) / 2]].every(([x, y]) => inFelt(F, rad, x!, y!, m));
            if (B && hits(P, B, pad)) continue;
            if (fixed.some((q) => q !== B && hits(P, q, pad))) continue;
            const cost = seats.reduce((a, q) => a + (hits(P, q, pad) ? overlap(P, q) + 1 : 0), 0) + (inside ? 0 : 1e6);
            if (!best || cost < best.cost) best = { top, dx, cost, maxW, tight, bare };
            if (cost === 0) break search;
          }
        }
        if (fullW <= minW) break;
      }
    }
    pill.classList.toggle('tight', !!best?.tight);
    pill.classList.toggle('bare', !!best?.bare);
    pill.style.maxWidth = best?.maxW ? `${(best.maxW / s).toFixed(0)}px` : '';
    if (best) {
      pill.style.left = best.dx ? `calc(50% + ${(best.dx / s).toFixed(0)}px)` : '';
      pill.style.top = `${((best.top - F.t) / s).toFixed(1)}px`; pill.style.bottom = 'auto';
      const off = pill.getBoundingClientRect().top - best.top; // (a felt with a border: its top is inside it)
      if (Math.abs(off) > 0.5) pill.style.top = `${((best.top - F.t - off) / s).toFixed(1)}px`;
    }
  });
}
