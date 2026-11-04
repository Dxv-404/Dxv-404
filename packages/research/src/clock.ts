// Clock and latency model (NTP-style). A request leaves the device at t0 (its monotonic clock), the server
// stamps it with its wall clock st, and the answer arrives at t3. With one server stamp, the best guess is
// that st happened halfway: offset = st - (t0 + t3) / 2 maps the device's monotonic clock to server time,
// and the round trip is t3 - t0. Samples with the shortest round trip are the most accurate (the error is
// at most half the round trip), so the estimate is the minimum-RTT sample of the recent ones.
// Raw samples are what gets recorded (clock.sync events); the estimate only helps the app (turn timers).
export interface ClockSample { k: 'http' | 'ws' | 'ping'; t0: number; st: number; t3: number }

export class ClockSync {
  private recent: ClockSample[] = [];
  private pending: ClockSample[] = [];
  constructor(private keep = 16) {}

  add(s: ClockSample): void {
    if (!(s.t3 >= s.t0) || !Number.isFinite(s.st)) return;
    this.recent.push(s);
    if (this.recent.length > this.keep) this.recent.shift();
    this.pending.push(s);
  }

  /** Server time minus device monotonic time (ms), and the round trip of the sample it came from. */
  estimate(): { offset: number; rtt: number; n: number } | null {
    if (!this.recent.length) return null;
    const best = this.recent.reduce((a, b) => (b.t3 - b.t0 < a.t3 - a.t0 ? b : a));
    return { offset: best.st - (best.t0 + best.t3) / 2, rtt: best.t3 - best.t0, n: this.recent.length };
  }

  /** Samples not yet recorded, as compact rows [kind, t0, st, t3] (t0/t3 to 0.1 ms). */
  take(): [string, number, number, number][] {
    const out = this.pending.map((s) => [s.k, r1(s.t0), Math.round(s.st), r1(s.t3)] as [string, number, number, number]);
    this.pending = [];
    return out;
  }

  get waiting(): number { return this.pending.length; }
}

const r1 = (x: number): number => Math.round(x * 10) / 10;
