// The night's table log. The engine keeps only its most recent lines (they travel with every saved state);
// the room keeps every line since the table opened, hand by hand, and serves older hands a page at a time.
import { logFor } from '@tp/engine';
import type { LogLine, PlayerId } from '@tp/engine';

export interface LogPage { hands: { h: number; lines: LogLine[] }[]; more: boolean; /** the hand with the biggest pot of the night so far */ big?: { h: number; pot: number } }
/** Most hands kept (a very long night drops its oldest), and most lines kept of one hand. */
export const LOG_MAX_HANDS = 800;
export const LOG_MAX_LINES = 160;
export const LOG_PAGE = 12;

export class LogHistory {
  /** hand number -> its lines (0: before the first hand) */
  private hands = new Map<number, LogLine[]>();
  private dirty = new Set<number>();

  constructor(saved?: Record<number, LogLine[]> | null) {
    for (const [h, lines] of Object.entries(saved ?? {})) if (Array.isArray(lines) && lines.length) this.hands.set(Number(h), lines);
  }

  /**
   * Take in the engine's recent lines. Everything from the first number among them on is replaced by them,
   * so a line taken back (the dealer's undo) leaves the history too.
   */
  sync(recent: LogLine[]): void {
    const lines = recent.filter((l) => typeof l.n === 'number');
    const first = lines[0];
    if (!first) return;
    const lo = first.n!;
    const next = new Map<number, LogLine[]>();
    for (const [h, ls] of this.hands) {
      if (h < first.h) continue;
      const keep = ls.filter((l) => (l.n ?? 0) < lo);
      if (keep.length !== ls.length) next.set(h, keep);
    }
    for (const l of lines) {
      let a = next.get(l.h);
      if (!a) { a = (this.hands.get(l.h) ?? []).filter((x) => (x.n ?? 0) < lo); next.set(l.h, a); }
      if (a.length < LOG_MAX_LINES) a.push(l);
    }
    for (const [h, a] of next) {
      const old = this.hands.get(h), lastOld = old?.[old.length - 1], lastNew = a[a.length - 1];
      if (old && old.length === a.length && lastOld?.n === lastNew?.n && lastOld?.text === lastNew?.text) continue;
      if (a.length) this.hands.set(h, a); else this.hands.delete(h);
      this.dirty.add(h);
    }
    if (this.hands.size > LOG_MAX_HANDS) {
      for (const h of [...this.hands.keys()].sort((x, y) => x - y).slice(0, this.hands.size - LOG_MAX_HANDS)) { this.hands.delete(h); this.dirty.add(h); }
    }
  }

  /** Hand the changed hands to `save` (null: that hand has no lines any more). */
  flush(save: (h: number, lines: LogLine[] | null) => void): void {
    for (const h of this.dirty) save(h, this.hands.get(h) ?? null);
    this.dirty.clear();
  }

  reset(): void { this.hands.clear(); this.dirty.clear(); }

  /** The hands just before hand `before` (left out: the latest), oldest first, as `viewer` may see them. */
  page(before: number | undefined, viewer: PlayerId | null, count = LOG_PAGE): LogPage {
    const hs = [...this.hands.keys()].filter((h) => before === undefined || h < before).sort((a, b) => a - b);
    const take = hs.slice(-count);
    const big = this.biggest();
    return { hands: take.map((h) => ({ h, lines: this.hands.get(h)!.map((l) => logFor(l, viewer)) })), more: hs.length > take.length, ...(big ? { big } : {}) };
  }

  /** The hand with the biggest pot (the earliest, when equal). */
  biggest(): { h: number; pot: number } | null {
    let best: { h: number; pot: number } | null = null;
    for (const [h, lines] of this.hands) for (const l of lines) if (l.k === 'win' && typeof l.potAll === 'number' && (!best || l.potAll > best.pot || (l.potAll === best.pot && h < best.h))) best = { h, pot: l.potAll };
    return best;
  }

  get size(): number { return this.hands.size; }
}
