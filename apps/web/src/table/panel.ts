// The players list (the laptop's side panel, the phone's pull-down): sorted by chips, biggest first.
// The order only changes once a hand is over, never while one is being played, so rows do not jump while
// somebody is deciding. This file is plain computing (the order, the tags, the row HTML); the screen moves
// the rows (screen.ts animatePanel).
import type { ScreenView } from '../net-table';

export interface PanelRow {
  id: string; name: string; avatar?: string | undefined;
  rank: number; stack: number;
  status: 'Playing' | 'Folded' | 'All-in' | 'Sitting out' | 'Connection lost' | 'Out';
  me: boolean; bust: boolean;
  /** chips won or lost in the hand that just ended (shown as a tag for a moment); 0: no tag */
  delta: number;
  /** took the lead in the hand that just ended */
  newLead: boolean;
}

/** How long the +/− tags stay after a hand. */
export const TAG_MS = 2600;

type P = ScreenView['players'][number];
const bySeat = (a: P, b: P): number => a.seat - b.seat || a.chair - b.chair;
/** Biggest stack first; equal stacks keep their seat order. */
export const byChips = (ps: P[]): P[] => [...ps].sort((a, b) => b.stack - a.stack || bySeat(a, b));

export class Panel {
  private order: string[] = [];
  /** each player's chips when the order was last settled */
  private settled: Record<string, number> = {};
  private key = '';
  private deltas: Record<string, number> = {};
  private until = 0;
  private lead: string | null = null;
  private newLead: string | null = null;
  /** the hand seen being played, and the hand whose result was last settled ("game:hand") */
  private liveHand = '';
  private doneHand = '';
  /** counts the times the order was settled after a hand (the screen animates once per count) */
  gen = 0;

  /**
   * Take in the table as it is now. `live`: a hand is being played or its result is still being revealed
   * (the order and the tags wait). Returns true when the order was settled anew after a hand.
   */
  sync(v: ScreenView, live: boolean, now: number): boolean {
    const here = new Set(v.players.map((p) => p.id));
    // people who left go; newcomers join at the bottom (in seat order) until the next hand ends
    this.order = this.order.filter((id) => here.has(id));
    const known = new Set(this.order);
    const fresh = v.players.filter((p) => !known.has(p.id)).sort(bySeat);
    const first = this.order.length === 0;
    for (const p of fresh) { this.order.push(p.id); this.settled[p.id] = p.stack; }
    if (now >= this.until) { this.deltas = {}; this.newLead = null; }
    const handKey = `${v.gameId ?? ''}:${v.handNo}`;
    if (live) this.liveHand = handKey;
    if (live && !first) return false;
    const sorted = byChips(v.players);
    const key = `${v.gameId ?? ''}:${v.handNo}:${sorted.map((p) => `${p.id}=${p.stack}`).join(',')}`;
    if (key === this.key) return false;
    // a hand this screen saw being played has just ended (a rebuy between hands re-sorts without tags)
    const afterHand = !first && !!v.hand?.results && this.liveHand === handKey && this.doneHand !== handKey;
    if (afterHand) this.doneHand = handKey;
    this.key = key;
    this.order = sorted.map((p) => p.id);
    const top = sorted[0] && sorted[0].stack > 0 && sorted[0].stack !== sorted[1]?.stack ? sorted[0].id : null;
    if (afterHand) {
      this.deltas = {};
      for (const p of v.players) { const d = p.stack - (this.settled[p.id] ?? p.stack); if (d) this.deltas[p.id] = d; }
      this.until = now + TAG_MS;
      this.newLead = top && top !== this.lead ? top : null;
      this.gen++;
    }
    this.lead = top;
    for (const p of v.players) this.settled[p.id] = p.stack;
    return afterHand;
  }

  /** ms until the tags go (0: none showing). */
  wake(now: number): number { return this.until > now ? this.until - now : 0; }

  /** The rows in the order to show. `stackOf`: the chips to show for a player (a result not yet revealed is held back). */
  rows(v: ScreenView, live: boolean, stackOf: (p: P) => number = (p) => p.stack): PanelRow[] {
    const by = new Map(v.players.map((p) => [p.id, p] as const));
    const inHand = v.phase === 'hand' && !v.hand?.results;
    return this.order.flatMap((id, i) => {
      const p = by.get(id);
      if (!p) return [];
      const hp = inHand ? v.hand?.ps[id] : undefined;
      const stack = stackOf(p);
      const bust = !live && p.stack <= 0;
      const status: PanelRow['status'] = !p.connected ? 'Connection lost' : p.sittingOut ? 'Sitting out' : bust ? 'Out' : hp?.folded ? 'Folded' : hp?.allIn ? 'All-in' : 'Playing';
      return [{ id, name: p.name, avatar: p.avatar, rank: i + 1, stack, status, me: id === v.me, bust, delta: live ? 0 : this.deltas[id] ?? 0, newLead: !live && this.newLead === id }];
    });
  }
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number): string => Math.round(n).toLocaleString('en-IN');

/** One row: rank, avatar, name, chips (with the last hand's + or −), status. */
export function rowHtml(r: PanelRow, av: (r: PanelRow) => string): string {
  const cls = ['prow', r.me ? 'me' : '', r.bust ? 'bust' : '', r.newLead ? 'lead' : '', r.status === 'Folded' ? 'fold' : '', r.status === 'All-in' ? 'allin' : ''].filter(Boolean).join(' ');
  const tag = r.delta ? `<u class="dl ${r.delta > 0 ? 'up' : 'dn'}">${r.delta > 0 ? '+' : '−'}${fmt(Math.abs(r.delta))}</u>` : '';
  const label = `${r.rank}. ${r.name}${r.me ? ' (you)' : ''}, ${fmt(r.stack)} chips, ${r.status.toLowerCase()}${r.delta ? `, ${r.delta > 0 ? 'won' : 'lost'} ${fmt(Math.abs(r.delta))} last hand` : ''}`;
  return `<div class="${cls}" data-id="${esc(r.id)}" role="listitem" aria-label="${esc(label)}"><em class="rk" aria-hidden="true">${r.rank}</em><span class="av" aria-hidden="true">${av(r)}</span><b aria-hidden="true">${esc(r.name)}</b>`
    + `<span class="pc" aria-hidden="true"><i data-n="${r.stack}" data-d="${r.delta}">${fmt(r.stack)}</i>${tag}</span><small aria-hidden="true">${r.me && r.status === 'Playing' ? 'You' : r.status}</small></div>`;
}
export const listHtml = (rows: PanelRow[], av: (r: PanelRow) => string): string => `<div class="plist" role="list" aria-label="Players by chips">${rows.map((r) => rowHtml(r, av)).join('')}</div>`;
