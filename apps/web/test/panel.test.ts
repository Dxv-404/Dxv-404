import { describe, it, expect } from 'vitest';
import { Panel, byChips, rowHtml, TAG_MS } from '../src/table/panel';
import type { ScreenView } from '../src/net-table';

type P = { id: string; name: string; seat: number; chair: number; stack: number; connected?: boolean; sittingOut?: boolean };
const view = (ps: P[], o: { handNo?: number; phase?: string; results?: boolean; ps?: Record<string, { folded?: boolean; allIn?: boolean }> } = {}): ScreenView => ({
  gameId: 'g1', me: 'a', handNo: o.handNo ?? 1, phase: o.phase ?? 'hand',
  players: ps.map((p) => ({ connected: true, sittingOut: false, ...p })),
  hand: { results: o.results ? {} : null, ps: o.ps ?? {} },
}) as unknown as ScreenView;
const A = (stack: number): P => ({ id: 'a', name: 'Dev', seat: 0, chair: 0, stack });
const B = (stack: number): P => ({ id: 'b', name: 'Rosh', seat: 1, chair: 1, stack });
const C = (stack: number): P => ({ id: 'c', name: 'Momo', seat: 2, chair: 2, stack });
const ids = (p: Panel, v: ScreenView, live = false) => p.rows(v, live).map((r) => r.id);

describe('players list', () => {
  it('sorts by chips, biggest first; equal stacks keep seat order', () => {
    expect(byChips(view([A(500), B(900), C(500)]).players).map((p) => p.id)).toEqual(['b', 'a', 'c']);
  });

  it('is sorted when first shown, with no tags', () => {
    const p = new Panel();
    const v = view([A(500), B(900), C(700)]);
    expect(p.sync(v, true, 0)).toBe(false);
    expect(ids(p, v, true)).toEqual(['b', 'c', 'a']);
    expect(p.rows(v, true).every((r) => r.delta === 0)).toBe(true);
  });

  it('keeps its order while a hand is played, then re-sorts once it is over, with what each won or lost', () => {
    const p = new Panel();
    p.sync(view([A(500), B(900), C(700)]), true, 0);
    // chips move during the hand: the order stays
    const mid = view([A(1400), B(300), C(400)]);
    expect(p.sync(mid, true, 10)).toBe(false);
    expect(ids(p, mid, true)).toEqual(['b', 'c', 'a']);
    // the hand is over
    const end = view([A(1400), B(300), C(400)], { results: true });
    expect(p.sync(end, false, 20)).toBe(true);
    expect(p.gen).toBe(1);
    const rows = p.rows(end, false);
    expect(rows.map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.delta]))).toEqual({ a: 900, c: -300, b: -600 });
    expect(rows[0]!.newLead).toBe(true);
    // the same table again: nothing new
    expect(p.sync(end, false, 30)).toBe(false);
    // the tags go after a moment
    expect(p.wake(30)).toBeGreaterThan(0);
    p.sync(end, false, 20 + TAG_MS);
    expect(p.rows(end, false).every((r) => r.delta === 0 && !r.newLead)).toBe(true);
    expect(p.wake(20 + TAG_MS)).toBe(0);
  });

  it('a rebuy between hands re-sorts without a won/lost tag', () => {
    const p = new Panel();
    p.sync(view([A(500), B(900)], { results: true }), false, 0);
    const v = view([A(5500), B(900)], { results: true });
    expect(p.sync(v, false, 10)).toBe(false);
    expect(ids(p, v)).toEqual(['a', 'b']);
    expect(p.rows(v, false).every((r) => r.delta === 0)).toBe(true);
  });

  it('newcomers join at the bottom until the next hand ends; leavers go', () => {
    const p = new Panel();
    p.sync(view([A(500), B(900)]), true, 0);
    const v = view([A(500), B(900), C(5000)]);
    p.sync(v, true, 5);
    expect(ids(p, v, true)).toEqual(['b', 'a', 'c']);
    const gone = view([A(500), C(5000)]);
    p.sync(gone, true, 6);
    expect(ids(p, gone, true)).toEqual(['a', 'c']);
  });

  it('status: folded and all-in during the hand, out when busted, the connection first', () => {
    const p = new Panel();
    const v = view([A(500), B(0), { ...C(700), connected: false }], { ps: { a: { folded: true }, b: { allIn: true } } });
    p.sync(v, true, 0);
    const st = Object.fromEntries(p.rows(v, true).map((r) => [r.id, r.status]));
    expect(st).toEqual({ a: 'Folded', b: 'All-in', c: 'Connection lost' });
    const end = view([A(1200), B(0), C(700)], { results: true, handNo: 1 });
    p.sync(end, false, 10);
    const rows = p.rows(end, false);
    expect(rows.at(-1)).toMatchObject({ id: 'b', bust: true, status: 'Out' });
  });

  it('a result still being revealed shows the chips it is given and no tags', () => {
    const p = new Panel();
    p.sync(view([A(500), B(900)]), true, 0);
    const v = view([A(1400), B(0)], { results: true });
    p.sync(v, true, 5);
    const rows = p.rows(v, true, (x) => (x.id === 'a' ? 500 : x.stack));
    expect(rows.map((r) => [r.id, r.stack, r.delta, r.bust])).toEqual([['b', 0, 0, false], ['a', 500, 0, false]]);
  });

  it('a row: rank, name, chips and the tag, escaped, with one spoken label', () => {
    const html = rowHtml({ id: 'a', name: '<Dev>', rank: 1, stack: 12500, status: 'Playing', me: true, bust: false, delta: 1250, newLead: true }, () => 'AV');
    expect(html).toContain('class="prow me lead"');
    expect(html).toContain('&lt;Dev&gt;');
    expect(html).toContain('>12,500<');
    expect(html).toContain('<u class="dl up">+1,250</u>');
    expect(html).toContain('won 1,250 last hand');
    expect(rowHtml({ id: 'b', name: 'R', rank: 2, stack: 10, status: 'Folded', me: false, bust: false, delta: -40, newLead: false }, () => '')).toContain('<u class="dl dn">−40</u>');
  });
});
