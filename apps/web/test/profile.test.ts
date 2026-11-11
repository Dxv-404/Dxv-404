// The Profile page's small rules: the chip graph's scale, the calendar's India days, the milestone bars
// and the card's words; and the sample page is a real profile_page answer the page can draw.
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '@tp/achievements';
import type { ProfileDay, ProfileNight } from '@tp/account';
import { allBars, areaOf, buyinAt, cabinet, cardStats, dayNo, dayText, graphGeo, heatGrid, heatLevel, heatSummary, istDayKey, keyOfDay, nextBars, niceStep, pathOf, rankSteps, serialOf, sideOf, signed, titleOf, weekdayOf } from '../src/profile/math';
import { demoProfile } from '../src/profile/demo';

const NIGHT: ProfileNight = {
  game: 'g', crew: 'c', table: 'ABCD', at: '2026-11-07T17:00:00Z', started_at: '2026-11-07T15:00:00Z', start_stack: 1000, big_blind: 20, players: 3, place: 3, score: -1.5, league: true,
  net: -100, bb: -5, buyins: 2000, hands: [1, 2, 3], stacks: [1300, 0, 1900], rebuys: [{ before: 3, chips: 1000 }], best: { hand: 3, chips: 900 }, worst: { hand: 2, chips: -1300 },
  achievements: [{ id: 'quads', tier: 0, hand: 1 }], lines: [{ name: 'Chitra', hands: [1, 2, 3, 4], stacks: [850, 1500, 1150, 3900] }, { name: 'Left early', hands: null, stacks: null }],
};

describe('the night chip graph', () => {
  it('round grid steps', () => {
    expect([niceStep(1900), niceStep(5000), niceStep(23000), niceStep(90), niceStep(0)]).toEqual([500, 2000, 10000, 50, 1]);
  });
  it('the buy-in line steps up at each rebuy', () => {
    expect([buyinAt(NIGHT, 1), buyinAt(NIGHT, 2), buyinAt(NIGHT, 3)]).toEqual([1000, 1000, 2000]);
  });
  it('puts the start, every hand and the floor where they belong', () => {
    const g = graphGeo(NIGHT, 300, 120, [0, 0, 0, 0]);
    expect(g.hands).toEqual([0, 3]);
    expect([g.lo, g.hi]).toEqual([0, 2500]); // above the tallest point, on a round number
    // sat down with 1,000 one hand before the first; then 1,300, broke, 1,900
    expect(g.line).toEqual([{ x: 0, y: 72 }, { x: 100, y: 57.6 }, { x: 200, y: 120 }, { x: 300, y: 28.8 }]);
    // the buy-in: 1,000 until the rebuy before hand 3 (drawn after hand 2), then 2,000
    expect(g.buyin).toEqual([{ x: 0, y: 72 }, { x: 200, y: 72 }, { x: 200, y: 24 }, { x: 300, y: 24 }]);
    expect(g.ticks.map((t) => t.chips)).toEqual([500, 1000, 1500, 2000]);
    expect(g.others).toEqual([]);
  });
  it('marks the biggest pot won and lost, the rebuy, what was earned and the finish', () => {
    const g = graphGeo(NIGHT, 300, 120, [0, 0, 0, 0]);
    const m = (k: string) => g.marks.find((x) => x.kind === k)!;
    expect(m('best')).toMatchObject({ hand: 3, x: 300, y: 28.8, chips: 900 });
    expect(m('worst')).toMatchObject({ hand: 2, x: 200, y: 120, chips: -1300 });
    expect(m('rebuy')).toMatchObject({ hand: 3, x: 200, y: 120, chips: 1000 });
    expect(m('earned')).toMatchObject({ hand: 1, id: 'quads', x: 100 });
    expect(m('end')).toMatchObject({ hand: 3, chips: -100 });
  });
  it('"show table" widens the plot to everyone and leaves out a player with no line', () => {
    const g = graphGeo(NIGHT, 400, 120, [0, 0, 0, 0], true);
    expect(g.hands).toEqual([0, 4]);
    expect(g.hi).toBe(5000);
    expect(g.others).toHaveLength(1);
    expect(g.others[0]!.line.at(-1)).toEqual({ x: 400, y: 26.4 });
    expect(g.line.at(-1)!.x).toBe(300); // my line still ends at my last hand
  });
  it('padding moves the plot in from the edges; a night with one hand still draws', () => {
    const g = graphGeo({ ...NIGHT, hands: [5], stacks: [1200], rebuys: [], best: null, worst: null, achievements: [] }, 200, 100, [20, 10, 10, 20]);
    expect(g.line).toEqual([{ x: 20, y: 33.3 }, { x: 190, y: 24 }]); // 1,000 then 1,200 on a plot that tops out at 1,500
    expect(graphGeo({ ...NIGHT, hands: [], stacks: [], rebuys: [], best: null, worst: null, achievements: [] }, 200, 100).line).toHaveLength(1);
  });
  it('paths: straight, stepped for Pixel, and the regions for the win and loss shading', () => {
    const g = graphGeo(NIGHT, 300, 120, [0, 0, 0, 0]);
    expect(pathOf(g.line)).toBe('M0 72L100 57.6L200 120L300 28.8');
    expect(pathOf(g.line, true)).toBe('M0 72H100V57.6H200V120H300V28.8');
    expect(sideOf(g, true)).toBe('M0 72L200 72L200 24L300 24V0H0Z');
    expect(sideOf(g, false)).toBe('M0 72L200 72L200 24L300 24V120H0Z');
    expect(areaOf(g)).toBe('M0 72L100 57.6L200 120L300 28.8V120H0Z'); // under the line
    expect(areaOf(g, true, true)).toBe('M0 72H100V57.6H200V120H300V28.8V0H0Z'); // above it
  });
});

describe('the calendar', () => {
  it('a moment belongs to its India day', () => {
    expect(istDayKey(Date.UTC(2026, 10, 7, 18, 29))).toBe('2026-11-07'); // 23:59 in India
    expect(istDayKey(Date.UTC(2026, 10, 7, 18, 30))).toBe('2026-11-08'); // midnight in India
    expect(istDayKey(Date.UTC(2026, 11, 31, 20, 0))).toBe('2027-01-01');
  });
  it('day numbers, weekdays (Monday first) and the words for a day', () => {
    expect(keyOfDay(dayNo('2026-11-07'))).toBe('2026-11-07');
    expect(dayNo('2026-03-01') - dayNo('2026-02-28')).toBe(1);
    expect([weekdayOf('2026-11-02'), weekdayOf('2026-11-07'), weekdayOf('2026-11-08'), weekdayOf('1969-12-29')]).toEqual([0, 5, 6, 0]);
    expect(dayText('2026-11-07')).toBe('Sat 7 Nov');
  });
  it('colours by the game score per game, red to green', () => {
    expect([-7, -4, -3, -2, -1, -0.25, 0, 0.25, 1, 2, 3.9, 4, 11].map((s) => heatLevel(s))).toEqual([-3, -3, -2, -2, -1, 0, 0, 0, 1, 2, 2, 3, 3]);
    expect(heatLevel(9, 2)).toBe(3); // two games, 4.5 each
    expect(heatLevel(3, 2)).toBe(1);
  });
  const day = (d: string, score: number, more: Partial<ProfileDay> = {}): ProfileDay => ({ day: d, games: 1, score, bb: 0, won: false, achievements: 0, list: [], ...more });
  it('weeks across, weekdays down, ending with this week; days to come are empty', () => {
    const days = [day('2026-11-07', 7, { won: true, achievements: 2 }), day('2026-11-04', -1.5), day('2025-11-10', 3)];
    const g = heatGrid(days, '2026-11-11'); // a Wednesday
    expect(g).toHaveLength(53);
    const last = g[52]!.cells;
    expect(last.map((c) => c?.day ?? null)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', null, null, null, null]);
    expect(last[2]).toMatchObject({ today: true, level: null, games: 0 });
    const prev = g[51]!.cells;
    expect(prev[5]).toMatchObject({ day: '2026-11-07', level: 3, won: true, earned: 2, games: 1 });
    expect(prev[2]).toMatchObject({ day: '2026-11-04', level: -1, won: false });
    expect(prev[0]).toMatchObject({ day: '2026-11-02', level: null, data: null });
    expect(g[0]!.cells[0]).toMatchObject({ day: '2025-11-10', level: 2 }); // the first square: 52 weeks before this Monday
    expect(g.flatMap((w) => w.cells).filter((c) => c).length).toBe(52 * 7 + 3);
  });
  it('names each month once, on the week its first day is in', () => {
    const g = heatGrid([], '2026-11-11');
    const labels = g.map((w) => w.month).filter(Boolean);
    expect(labels).toEqual(['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']); // the first week says where the year starts
    expect(g[51]!.month).toBeNull();
    expect(g.find((w) => w.cells.some((c) => c?.day === '2026-11-01'))!.month).toBe('Nov');
    expect(heatGrid([], '2026-11-11', 20)).toHaveLength(20);
  });
  it('the summary line: nights, the best day, the weekday played most', () => {
    expect(heatSummary([day('2026-11-07', 7), day('2026-10-31', 2, { games: 2 }), day('2026-11-04', -1.5)])).toEqual({ nights: 4, best: 'Sat 7 Nov', weekday: 'Saturdays' });
    expect(heatSummary([])).toEqual({ nights: 0, best: null, weekday: null });
  });
});

describe('the sample page', () => {
  const p = demoProfile();
  it('is the same every time, and shaped like the database answer', () => {
    expect(JSON.stringify(demoProfile())).toBe(JSON.stringify(p));
    expect(Object.keys(p).sort()).toEqual(['account', 'achievements', 'card', 'career', 'crew', 'crew_has', 'crews', 'heatmap', 'history', 'milestones', 'moments', 'nights', 'own', 'season', 'streaks', 'v']);
    expect(p.nights).toHaveLength(8);
    for (const n of p.nights) {
      expect(n.hands.length).toBe(n.stacks.length);
      expect(n.stacks.at(-1)! - n.buyins).toBe(n.net);
      expect(n.buyins).toBe(n.start_stack + n.rebuys.reduce((s, r) => s + r.chips, 0));
      for (const l of n.lines) expect(l.hands!.length).toBe(l.stacks!.length);
      expect(graphGeo(n, 320, 150, undefined, true).line.every((q) => q.x >= 0 && q.x <= 320 && q.y >= 0 && q.y <= 150)).toBe(true);
    }
    expect(p.nights.some((n) => n.rebuys.length > 0)).toBe(true);
    expect(p.nights.map((n) => n.at)).toEqual(p.nights.map((n) => n.at).sort().reverse());
    expect(p.heatmap.map((d) => d.day)).toEqual([...new Set(p.heatmap.map((d) => d.day))].sort());
    expect(p.heatmap.at(-1)!.day).toBe(istDayKey(Date.parse(p.nights[0]!.at)));
    for (const a of p.achievements) expect(ACHIEVEMENTS.some((d) => d.id === a.id)).toBe(true);
  });
  it('milestones: the three closest, each filling from where it was last seen', () => {
    const bars = nextBars(p);
    expect(bars.map((b) => b.id)).toEqual(['bb', 'hands', 'showdowns']);
    expect(bars[1]).toMatchObject({ value: 862, next: 1000, prev: 500, part: 0.862, from: 0.815, gained: 47, reward: 'Frame and Gold Leaf finish' });
    expect(allBars(p)).toHaveLength(8);
    expect(allBars({ ...p, milestones: { values: { hands: 120 }, seen: { hands: 5000 } } })[0]).toMatchObject({ value: 120, next: 500, from: 0.24, gained: 0 }); // never fills backwards
    expect(allBars({ ...p, milestones: { values: { bluffs: 50 }, seen: {} } }).find((b) => b.id === 'bluffs')).toMatchObject({ done: true, part: 1, from: 0, gained: 50 });
    expect(nextBars({ ...p, milestones: { values: {}, seen: {} } })[0]).toMatchObject({ id: 'hands', value: 0, from: 0 });
  });
  it('the cabinet has all 37, with the best tier owned and how many of the crew have each', () => {
    const c = cabinet(p);
    expect(c).toHaveLength(37);
    expect(c.filter((s) => s.owned).length).toBe(p.career.achievements + 1); // the sample's count leaves out its hidden one
    expect(c.find((s) => s.id === 'regular')).toMatchObject({ tier: 2, tiers: 4, rarity: 'uncommon', crewHas: 6 });
    expect(c.find((s) => s.id === 'royal')).toMatchObject({ owned: null, tier: 0, rarity: 'mythic', unlocks: ['Backdrop: Throne Room'], crewHas: 0 });
    expect(c.find((s) => s.id === 'nemesis')!.unlocks).toEqual(["Title: Kabir's Problem"]);
    expect(c.filter((s) => s.hidden).map((s) => s.id)).toEqual(['trust_issues', 'same_again', 'gone_fishing']);
  });
  it('the card: a title, three stats and the serial', () => {
    expect(titleOf(p)).toBe('I Knew It'); // the rarest title unlocked (Hero Call and The Reader are both rare: the earlier one)
    expect(titleOf({ ...p, card: { frame: null, backdrop: null, pose: null, finish: null, title: 'nemesis', stats: [], emblem: null, tagline: null, back: null } })).toBe("Kabir's Problem");
    expect(titleOf({ ...p, achievements: [] })).toBeNull();
    expect(cardStats(p).map((s) => s.label)).toEqual(['Wins', 'Best night', 'Hands']);
    expect(cardStats(p)[2]!.value).toBe('862');
    expect(cardStats({ ...p, card: { frame: null, backdrop: null, pose: null, finish: null, title: null, stats: ['bluffs', 'nope'], emblem: null, tagline: null, back: null } }).map((s) => s.label)).toEqual(['Bluffs', 'Wins', 'Best night']);
    expect(serialOf(p)).toBe('No. 004 · Friday Night Table · Season 2');
    expect(serialOf({ ...p, crew: null })).toBe('No crew yet');
    expect([signed(7), signed(-1.5), signed(0), signed('2.75', 2)]).toEqual(['+7.0', '−1.5', '0.0', '+2.75']);
  });
  it('rank after each game is a stepped line with rank 1 at the top and gaps before being ranked', () => {
    const s = rankSteps([null, null, 4, 3, 3, 1, 2], 130, 50, 5);
    expect(s.worst).toBe(4);
    expect(s.d).toBe('M45 45H65V31.7H85V31.7H105V5H125V18.3');
    expect(s.last).toEqual({ x: 125, y: 18.3 });
    expect(rankSteps([null, null], 100, 40)).toMatchObject({ d: '', last: null });
    expect(rankSteps([1], 100, 40, 5).d).toBe('M50 5');
  });
});
