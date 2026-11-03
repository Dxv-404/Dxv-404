// The table layout engine (a line-by-line port of the design phase's engine, gen/core.py and
// gen/responsive.py, whose output the 693 layout checks signed off): picks a layout mode from the screen,
// works out the table from the space actually left, then places 1 to 14 opponents by arc length on an
// ellipse around it, their bets on the felt where nothing collides, and the dealer button.

export type Mode = 'phone' | 'land' | 'lap';
export interface Geo { W: number; H: number; tl: number; tt: number; tw: number; th: number; rx: number; ry: number; gaps: [number, number][]; topx: number; yk: number; mode: Mode }
export interface SeatIn { mini: boolean; bet: boolean }
export interface SeatOut { x: number; y: number; bx?: number; by?: number }
export interface Placed { cx: number; cy: number; seats: SeatOut[]; dbtn: { x: number; y: number } | null; /** every pair of neighbours clear of each other */ ok: boolean }

/** -> mode, zoom, logical width and height, dock width */
export function modeFor(W: number, H: number): { mode: Mode; u: number; lw: number; lh: number; dock: number } {
  if (H >= W) {
    if (W < 600) return { mode: 'phone', u: 1, lw: W, lh: H, dock: 0 };
    const u = W / 540;
    return { mode: 'phone', u, lw: 540, lh: Math.round(H / u), dock: 0 }; // tablet portrait: the phone layout, larger
  }
  if (H < 600) return { mode: 'land', u: 1, lw: W, lh: H, dock: W < 700 ? 204 : W < 760 ? 240 : 284 }; // phone sideways
  const u = Math.max(0.9, Math.min(W / 1440, H / 760)); // never shrink type below 90 %
  return { mode: 'lap', u, lw: Math.round(W / u), lh: Math.round(H / u), dock: 0 };
}

/** short or narrow phones with a crowded table: slimmer hero and buttons (the dealer shows only where it fits: dealerSpot) */
export const isCompact = (mode: Mode, lw: number, lh: number, n: number): boolean => mode === 'phone' && (lh < 760 || (lw < 380 && n > 6));

export function arenaSize(mode: Mode, lw: number, lh: number, dock: number, compact: boolean): [number, number] {
  if (mode === 'phone') return [lw, lh - (compact ? 52 + 86 + 66 : 56 + 98 + 80)];
  if (mode === 'land') return [lw - dock, lh - 46];
  return [lw - 340, lh - 64 - 168];
}

export function makeGeo(mode: Mode, aw: number, ah: number, n: number, compact = false): Geo {
  const crowd = n > 10;
  if (mode === 'phone') {
    const tl = crowd ? 54 : 50;
    const tt = compact ? 52 : Math.trunc(Math.max(70, Math.min(104, ah * 0.17)));
    return { W: aw, H: ah, tl, tt, tw: aw - 2 * tl, th: ah - tt - 34, rx: crowd ? 14 : 12, ry: crowd ? 10 : 8,
      gaps: [[90, crowd ? 26 : n <= 6 ? 40 : 30], [270, 1]], topx: compact ? 0 : n <= 6 ? 88 : 76, yk: crowd ? 1.1 : 1, mode };
  }
  if (mode === 'land') {
    const tl = n > 10 ? 62 : 66;
    return { W: aw, H: ah, tl, tt: 44, tw: aw - 2 * tl, th: ah - (n > 10 ? 100 : 72), rx: 12, ry: 12, gaps: [[90, n > 10 ? 8 : 22], [270, 1]], topx: 0, yk: n > 10 ? 1.3 : 1, mode };
  }
  return { W: aw, H: ah, tl: 170, tt: 124, tw: aw - 340, th: ah - 124 - 84, rx: 16, ry: 14, gaps: [[90, 18], [270, 1]], topx: 108, yk: 1, mode };
}

/** n points spaced by arc length on an ellipse, skipping gap arcs; clockwise from just after the bottom gap. */
function ellipseSlots(cx: number, cy: number, rx: number, ry: number, n: number, gaps: [number, number][], wts: number[], topx: number, yk: number): [number, number][] {
  const N = 1800;
  const pts: [number, number][] = [], keep: boolean[] = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * 360;
    const x = cx + rx * Math.cos((a * Math.PI) / 180), y = cy + ry * Math.sin((a * Math.PI) / 180);
    const ok = gaps.every(([g, hw]) => Math.abs(((((a - g + 180) % 360) + 360) % 360) - 180) > hw) && !(y < cy && Math.abs(x - cx) < topx);
    pts.push([x, y]); keep.push(ok);
  }
  let start = 0;
  for (let k = 0; k < N; k++) if (keep[k] && !keep[(k - 1 + N) % N]) { start = k; break; }
  const seq: [number, number][] = [];
  for (let k = 0; k < N; k++) if (keep[(start + k) % N]) seq.push(pts[(start + k) % N]!);
  const L = [0];
  for (let k = 1; k < seq.length; k++) {
    const dx = seq[k]![0] - seq[k - 1]![0], dy = (seq[k]![1] - seq[k - 1]![1]) * yk;
    const d = Math.hypot(dx, dy);
    L.push(L[k - 1]! + (d < 20 ? d : 0));
  }
  const tot = L[L.length - 1]!;
  const W = wts.reduce((a, b) => a + b, 0);
  const out: [number, number][] = [];
  let acc = 0, j = 0;
  for (let m = 0; m < n; m++) {
    const target = (tot * (acc + wts[m]! / 2)) / W; acc += wts[m]!;
    while (j < L.length - 1 && L[j]! < target) j++;
    out.push(seq[j]!);
  }
  return out;
}

export type R = [number, number, number, number];
const hit = (r: R, q: R): boolean => !(r[2] <= q[0] || q[2] <= r[0] || r[3] <= q[1] || q[3] <= r[1]);

/** The same table drawn again (every tap redraws it) costs nothing: placements are remembered. */
const placedCache = new Map<string, Placed>();
export function place(g: Geo, states: SeatIn[], dealerAt: number | null, avoid: R | null = null): Placed {
  const key = JSON.stringify([g, states.map((s) => (s.mini ? 1 : 0) + (s.bet ? 2 : 0)), dealerAt, avoid]);
  const hit0 = placedCache.get(key);
  if (hit0) return { ...hit0, seats: hit0.seats.map((x) => ({ ...x })) };
  const out = placeNow(g, states, dealerAt, avoid);
  if (placedCache.size > 300) placedCache.clear();
  placedCache.set(key, out);
  return { ...out, seats: out.seats.map((x) => ({ ...x })) };
}

function placeNow(g: Geo, states: SeatIn[], dealerAt: number | null, avoid: R | null): Placed {
  const cx = g.tl + g.tw / 2, cy = g.tt + g.th / 2;
  const wts = states.map((s) => (s.mini ? 0.5 : 1));
  const fp = { lap: [52, 32, 78], land: [31, 18, 46], phone: [37, 24, 56] }[g.mode] as [number, number, number];
  const mh = g.mode === 'lap' ? 24 : 18; // a shrunk seat: its avatar (a little more room on big screens, whose avatars are bigger)
  const foot = (s: SeatIn, x: number, y: number): R => (s.mini ? [x - mh, y - mh, x + mh, y + mh] : [x - fp[0], y - fp[1], x + fp[0], y + fp[2]]);
  let pts: [number, number][] = [];
  let ok = false;
  for (let it = 0; it < 80; it++) { // relax: give more arc to neighbours that would touch
    pts = ellipseSlots(cx, cy, g.tw / 2 + g.rx, g.th / 2 + g.ry, states.length, g.gaps, wts, g.topx, g.yk);
    const bad: number[] = [];
    for (let i = 0; i < states.length - 1; i++) if (hit(foot(states[i]!, ...pts[i]!), foot(states[i + 1]!, ...pts[i + 1]!))) bad.push(i);
    if (!bad.length) { ok = true; break; }
    for (const i of bad) { wts[i]! *= 1.12; wts[i + 1]! *= 1.12; }
  }
  const seats: SeatOut[] = pts.map(([x, y]) => ({ x, y }));
  // bets: along the seat->centre ray (with lateral nudges), the first spot that collides with nothing
  const ph = g.mode !== 'lap';
  const [sw, sh0, sh1] = ph ? [37, 38, 50] : [49, 46, 60];
  const seatR: R[] = seats.map((s) => [s.x - sw, s.y - sh0, s.x + sw, s.y + sh1]);
  const [bw, bh] = ph ? [134, 78] : [226, 92];
  const used: R[] = [[cx - bw, cy - bh, cx + bw, cy + bh]];
  states.forEach((st, i) => {
    if (!st.bet) return;
    const { x, y } = seats[i]!;
    const d = Math.hypot(cx - x, cy - y), ux = (cx - x) / d, uy = (cy - y) / d;
    const base = Math.atan2(uy, ux);
    const cand: [number, number][] = [];
    for (let D = 44; D < 170; D += 6) for (const lat of [0, 18, -18, 36, -36, 54, -54]) cand.push([x + ux * D - uy * lat, y + uy * D + ux * lat]);
    for (const t of [30, -30, 50, -50, 70, -70, 90, -90]) for (let D = 46; D < 110; D += 6) cand.push([x + Math.cos(base + (t * Math.PI) / 180) * D * 1.3, y + Math.sin(base + (t * Math.PI) / 180) * D]);
    for (const [bx, by] of cand) {
      const r: R = ph ? [bx - 32, by - 11, bx + 32, by + 11] : [bx - 40, by - 14, bx + 40, by + 14];
      const ex = (bx - cx) / (g.tw / 2 - g.rx - 14), ey = (by - cy) / (g.th / 2 - g.ry - 10);
      if (ex * ex + ey * ey > 1) continue;
      if (seatR.some((q) => hit(r, q)) || used.some((q) => hit(r, q))) continue;
      used.push(r); seats[i]!.bx = bx; seats[i]!.by = by; return;
    }
    // no room: the amount stays in the seat's action tag only
  });
  // the dealer button next to its seat, on a clear spot
  let dbtn: Placed['dbtn'] = null;
  if (dealerAt !== null && seats[dealerAt]) {
    const st0 = seats[dealerAt]!;
    const bets = seats.filter((s) => s.bx !== undefined) as Required<SeatOut>[];
    const FP = { lap: [54, 50, 82], land: [32, 32, 48], phone: [38, 42, 58] }[g.mode]!;
    const ring: [number, number][] = [];
    for (const r of [48, 60, 74, 90]) for (let a = 0; a < 360; a += 15) ring.push([Math.round(r * Math.cos((a * Math.PI) / 180)), Math.round(r * Math.sin((a * Math.PI) / 180))]);
    for (const [ox, oy] of ([[46, -30], [50, 4], [-46, -34], [30, -56], [64, -40], [-50, 6]] as [number, number][]).concat(ring)) {
      const dx = st0.x + ox, dy = st0.y + oy;
      const [cbw, cbh] = g.mode !== 'lap' ? [134, 78] : [226, 92];
      if (Math.abs(dx - cx) < cbw + 14 && Math.abs(dy - cy) < cbh + 14) continue;
      if (!(dx >= 16 && dx <= g.W - 16 && dy >= 16 && dy <= g.H - 16)) continue;
      const [bxw, byh] = g.mode !== 'lap' ? [44, 22] : [60, 28];
      if (!bets.every((b) => Math.abs(dx - b.bx) > bxw || Math.abs(dy - b.by) > byh)) continue;
      if (avoid && dx > avoid[0] - 14 && dx < avoid[2] + 14 && dy > avoid[1] - 14 && dy < avoid[3] + 14) continue; // clear of the dealer
      if (!states.every((s, k) => { const F = s.mini ? [18, 18, 18] : FP; const q = seats[k]!; return !(q.x - F[0]! - 14 < dx && dx < q.x + F[0]! + 14 && q.y - F[1]! - 14 < dy && dy < q.y + F[2]! + 14); })) continue;
      dbtn = { x: dx, y: dy }; break;
    }
  }
  return { cx, cy, seats, dbtn, ok };
}

/** the widest board card that clears every seat sitting level with the board and pot */
export function fitCard(g: Geo, placed: Placed, states: SeatIn[], n: number): number {
  const mode = g.mode;
  let w = { phone: n <= 10 ? 46 : 40, land: 36, lap: n <= 10 ? 74 : 66 }[mode];
  const half = { phone: n <= 10 ? 37 : 34, land: 32, lap: 49 }[mode];
  const gap = mode === 'lap' ? 10 : 5;
  while (w > 26) {
    const Hh = w * 1.4 + (mode !== 'land' ? 70 : 40);
    const bw = (5 * w + 4 * gap) / 2;
    if (bw > (g.tw - 40) / 2) { w -= 2; continue; }
    if (placed.seats.every((s, i) => states[i]!.mini || !(s.y + 50 > placed.cy - Hh / 2 && s.y - 40 < placed.cy + Hh / 2) || Math.abs(s.x - placed.cx) - half - 6 >= bw)) break;
    w -= 2;
  }
  return w;
}

export type DealerSize = 'lg' | 'sm';
/** Where the dealer stands on a phone: its size, its centre x in the arena, and the box it takes (arena px). */
export interface DealerSpot { size: DealerSize; x: number; box: R }
/** The box each dealer size takes, art and name together (base2.css: .dealer, .dealer.sm), width x height. */
export const DEALER_BOX: Record<DealerSize, [number, number]> = { lg: [96, 108], sm: [66, 64] };
/** The thinnest table rim of any theme (--rimw): the felt starts at least this far inside the table's box. */
const MIN_RIM = 7;

/** How far down the felt starts at x (the felt is a stadium inside the table's box). */
function feltTopAt(g: Geo, x: number): number {
  const fl = g.tl + MIN_RIM, fw = g.tw - 2 * MIN_RIM, ft = g.tt + MIN_RIM, fh = g.th - 2 * MIN_RIM;
  const r = Math.min(fw, fh) / 2;
  const dx = Math.abs(x - (fl + fw / 2)) - (fw / 2 - r);
  if (dx <= 0) return ft;
  if (dx >= r) return Infinity;
  return ft + r - Math.sqrt(r * r - dx * dx);
}

/**
 * Phones: the theme's dealer stands above the table only where it takes no space from the game. The table is
 * laid out first, exactly as without a dealer; then the dealer shows if there is a spot above the felt (between
 * the top of the arena and the felt, over the table, clear of every seat) at least as tall as the dealer: the
 * full-size dealer in the middle, else the small one in the middle, else the small one beside the middle (a
 * player sitting at the top). No spot: no dealer. Other modes: null (sideways phones have no dealer; big
 * screens always have room for theirs).
 */
export function dealerSpot(g: Geo, placed: Placed, states: SeatIn[]): DealerSpot | null {
  if (g.mode !== 'phone') return null;
  // what a seat draws in any theme: avatar, plate and tag, and the two cards it shows after a showdown (up and to
  // its right, or its left near the right edge: render.ts), so the dealer never has to make way during a hand
  const seatBoxes: R[] = placed.seats.flatMap((s, i): R[] => states[i]?.mini ? [[s.x - 20, s.y - 20, s.x + 20, s.y + 22]]
    : [[s.x - 36, s.y - 50, s.x + 36, s.y + 60], s.x + 66 > g.W ? [s.x - 66, s.y - 74, s.x - 6, s.y - 30] : [s.x + 6, s.y - 74, s.x + 66, s.y - 30]]);
  const cx = g.tl + g.tw / 2;
  const fits = (size: DealerSize, x: number): R | null => {
    const [w, h] = DEALER_BOX[size];
    const box: R = [x - w / 2, 0, x + w / 2, h];
    if (box[0] < g.tl || box[2] > g.tl + g.tw || box[0] < 4 || box[2] > g.W - 4) return null;
    for (let px = box[0]; px <= box[2]; px += 4) if (feltTopAt(g, px) < h) return null;
    if (feltTopAt(g, box[2]) < h) return null;
    const pad: R = [box[0] - 2, box[1], box[2] + 2, box[3] + 4];
    return seatBoxes.some((q) => hit(pad, q)) ? null : box;
  };
  for (const size of ['lg', 'sm'] as const) { const b = fits(size, cx); if (b) return { size, x: cx, box: b }; }
  for (let d = 4; d < g.tw / 2; d += 4) for (const x of [cx - d, cx + d]) { const b = fits('sm', x); if (b) return { size: 'sm', x, box: b }; }
  return null;
}
