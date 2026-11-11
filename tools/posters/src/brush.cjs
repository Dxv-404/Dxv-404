// Brush helpers for ink posters (the same strokes as the Ink Sensei, as a factory with its own random seed
// so a new poster never changes an existing one's drawing).
module.exports = function mk(seed, INK = '#121212') {
  const f1 = v => (+v).toFixed(1);
  let rnd = seed; const R01 = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const rr = (a, b) => a + R01() * (b - a);
  const bez = ([a, b, c, d], n = 48) => Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return [u*u*u*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t*t*t*d[0], u*u*u*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t*t*t*d[1]];
  });
  // baked dry brush: a bundle of bristle lanes with dropouts; returns one path "d"
  function dry(p4, w, { inT = .06, outT = .6, lanes = 6, dry = .5, tail = .55 } = {}) {
    const n = 16, pts = bez(p4, n);
    const S = pts.map((p, i) => {
      const q = pts[Math.min(n, i + 1)], o = pts[Math.max(0, i - 1)];
      let dx = q[0] - o[0], dy = q[1] - o[1]; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
      const t = i / n, k = Math.min(1, t / inT) * Math.min(1, (1 - t) / outT);
      return { x: p[0], y: p[1], nx: -dy, ny: dx, hw: w * Math.pow(Math.max(k, 0), .7) / 2 };
    });
    let d = '';
    for (let j = 0; j < lanes; j++) {
      const u0 = -1 + (2 * j) / lanes, u1 = u0 + 2 / lanes + .04;
      const mid = 1 - Math.abs((j + .5) / lanes - .5) * 2;
      const end = Math.round(n * Math.min(1, tail + (1 - tail) * (mid * .6 + R01() * .5)));
      const on = []; for (let i = 0; i <= n; i++) on[i] = i <= end;
      for (let i = 3; i < end; i++) if (R01() < dry * Math.pow(i / n, 1.2) * .4) { const L = 1 + Math.floor(R01() * 3); for (let k = 0; k < L; k++) on[i + k] = false; i += L; }
      const j0 = rr(-.12, .12), j1 = rr(-.12, .12);
      const P = (i, u) => { const s = S[i]; const uu = u + (u === u0 ? j0 : j1) * Math.sin(i * 1.7 + j); return [s.x + s.nx * s.hw * uu, s.y + s.ny * s.hw * uu]; };
      let i = 0;
      while (i < n) {
        if (!on[i]) { i++; continue; }
        let e = i; while (e < n && on[e + 1]) e++;
        if (e > i) {
          const L = [], Rr = [];
          for (let q = i; q <= e; q++) { L.push(P(q, u0)); Rr.push(P(q, u1)); }
          if (!on[i - 1] || i === 0) { const m = [(L[0][0] + Rr[0][0]) / 2, (L[0][1] + Rr[0][1]) / 2]; L[0] = m; Rr[0] = m; }
          if (!on[e + 1]) { const z = L.length - 1, m = [(L[z][0] + Rr[z][0]) / 2, (L[z][1] + Rr[z][1]) / 2]; L[z] = m; Rr[z] = m; }
          d += 'M' + L.map(p => p.map(f1).join(' ')).join('L') + 'L' + Rr.reverse().map(p => p.map(f1).join(' ')).join('L') + 'Z';
        }
        i = e + 1;
      }
    }
    return d;
  }
  // flatten an absolute M/L/C/Z path into points
  function flat(d, n = 10) {
    const tk = d.match(/[MLCZ]|-?[\d.]+/g); const out = []; let i = 0, cur = [0, 0], cmd = '';
    while (i < tk.length) {
      if (/[MLCZ]/.test(tk[i])) cmd = tk[i++];
      if (cmd === 'Z') continue;
      if (cmd === 'M' || cmd === 'L') { cur = [+tk[i], +tk[i + 1]]; i += 2; out.push(cur); if (cmd === 'M') cmd = 'L'; }
      else if (cmd === 'C') { const p = [cur, [+tk[i], +tk[i + 1]], [+tk[i + 2], +tk[i + 3]], [+tk[i + 4], +tk[i + 5]]]; i += 6; bez(p, n).slice(1).forEach(q => out.push(q)); cur = p[3]; }
    }
    return out;
  }
  // a closed outline with a hand-made wobble (no filter)
  function rough(pts, amp = 1.1, step = 2.5) {
    const rs = []; const N = pts.length;
    for (let i = 0; i < N; i++) { const a = pts[i], b = pts[(i + 1) % N]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const m = Math.max(1, Math.round(L / step)); for (let k = 0; k < m; k++) rs.push([a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m]); }
    const M = rs.length, ws = Array.from({ length: 5 }, () => [Math.floor(rr(3, 19)), rr(0, 6.3), rr(.4, 1)]);
    const out = rs.map((p, i) => {
      const a = rs[(i - 1 + M) % M], b = rs[(i + 1) % M]; let dx = b[0] - a[0], dy = b[1] - a[1]; const m = Math.hypot(dx, dy) || 1;
      const nz = ws.reduce((s, [f, ph, am]) => s + Math.sin(i / M * 6.283 * f + ph) * am, 0) / 2.6;
      return [p[0] - dy / m * nz * amp, p[1] + dx / m * nz * amp];
    });
    return 'M' + out.map(p => p.map(f1).join(' ')).join('L') + 'Z';
  }
  return { f1, rr, R01, bez, dry, flat, rough, INK };
};
