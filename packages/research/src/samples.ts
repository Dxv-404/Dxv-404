// High-frequency streams (raise slider, mouse, motion sensors) are recorded as batches of samples, not one
// event per sample: a batch holds the first sample's time and, per column, the first value followed by the
// change from the previous sample. Values are stored as integers in a stated unit (`q`: the column is the
// real value times q, rounded), so a batch is small and exact to that unit.
//
//   { t0: 1234.5, dt: [33, 34, 33], q: { x: 1, y: 1 }, c: { x: [512, 3, -2, 0], y: [300, 0, 1, 1] } }
//   decodes to times t0, t0+33, t0+67, t0+100 and x = 512, 515, 513, 513 (pixels).
export interface SampleBatch {
  /** Monotonic time of the first sample (ms, 0.1 ms resolution). */
  t0: number;
  /** Gaps between consecutive samples (ms, rounded). Length = samples - 1. */
  dt: number[];
  /** Scale per column: stored integer = round(value * q). */
  q: Record<string, number>;
  /** Per column: the first value, then deltas. null marks a missing value (it is not part of the deltas). */
  c: Record<string, (number | null)[]>;
}

export class SampleStream {
  private t0: number | null = null;
  private lastT = 0;
  private dt: number[] = [];
  private cols: Record<string, (number | null)[]> = {};
  private last: Record<string, number | null> = {};
  private n = 0;
  private lastAccepted = -Infinity;

  /** minGapMs: samples closer than this to the last kept one are skipped (e.g. 33 for about 30 Hz). */
  constructor(private q: Record<string, number>, private minGapMs = 0, private maxSamples = 2000) {
    for (const k of Object.keys(q)) { this.cols[k] = []; this.last[k] = null; }
  }

  get count(): number { return this.n; }
  get full(): boolean { return this.n >= this.maxSamples; }

  /** Add one sample at monotonic time t. Returns false if it was skipped (too soon, or full). */
  add(t: number, values: Record<string, number | null | undefined>, force = false): boolean {
    if (this.n >= this.maxSamples) return false;
    if (!force && t - this.lastAccepted < this.minGapMs) return false;
    this.lastAccepted = t;
    if (this.t0 === null) this.t0 = t; else this.dt.push(Math.round(t - this.lastT));
    this.lastT = t;
    for (const k of Object.keys(this.q)) {
      const raw = values[k];
      if (raw === null || raw === undefined || !Number.isFinite(raw)) { this.cols[k]!.push(null); continue; }
      const v = Math.round(raw * this.q[k]!);
      const prev = this.last[k];
      this.cols[k]!.push(prev === null || prev === undefined ? v : v - prev);
      this.last[k] = v;
    }
    this.n++;
    return true;
  }

  /** The batch so far, and start a new one. null when empty. */
  take(): SampleBatch | null {
    if (this.t0 === null) return null;
    const out: SampleBatch = { t0: Math.round(this.t0 * 10) / 10, dt: this.dt, q: { ...this.q }, c: this.cols };
    this.t0 = null; this.dt = []; this.n = 0; this.lastAccepted = -Infinity;
    this.cols = {}; for (const k of Object.keys(this.q)) { this.cols[k] = []; this.last[k] = null; }
    return out;
  }
}

/** Back to times and real values (for tests and the export's optional --expand). */
export function decodeSamples(b: SampleBatch): { t: number[]; cols: Record<string, (number | null)[]> } {
  const t = [b.t0];
  for (const d of b.dt) t.push(t[t.length - 1]! + d);
  const cols: Record<string, (number | null)[]> = {};
  for (const [k, arr] of Object.entries(b.c)) {
    let acc: number | null = null;
    cols[k] = arr.map((x) => {
      if (x === null) return null;
      acc = acc === null ? x : acc + x;
      return acc / (b.q[k] ?? 1);
    });
  }
  return { t, cols };
}
