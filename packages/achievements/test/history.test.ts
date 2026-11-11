// The achievements that come from a crew's history, and the definition table itself.
import { describe, expect, it } from 'vitest';
import { checkHistory, weekStreaks, type HistoryFacts, type HistoryNight } from '../src/history';
import { ACHIEVEMENT, ACHIEVEMENTS, MILESTONES, milestoneBars, nextMilestones, ownedLook, tierFor } from '../src/defs';
import { istDay, istHour, istWeek } from '../src/cards';

const DAY = 86_400_000;
/** Saturday 7 November 2026, 9 in the evening in India. */
const SAT = Date.UTC(2026, 10, 7, 15, 30);
let g = 0;
const nt = (at: number, places: string[], host: string | null = null): HistoryNight => ({ game: `g${++g}`, endedAt: at, host, players: places.map((pid, i) => ({ pid, place: i + 1 })) });
const base = (nights: HistoryNight[], more: Partial<HistoryFacts> = {}): HistoryFacts => ({ nights, seasons: [], members: [], ...more });
const got = (f: HistoryFacts, p: string): string[] => checkHistory(f).filter((e) => e.pid === p).map((e) => e.id);

describe('India time', () => {
  it('days and weeks turn over at midnight in India, weeks on Monday', () => {
    expect(istHour(Date.UTC(2026, 10, 7, 20, 45))).toBe(2);
    expect(istDay(Date.UTC(2026, 10, 7, 18, 29))).toBe(istDay(SAT));
    expect(istDay(Date.UTC(2026, 10, 7, 18, 30))).toBe(istDay(SAT) + 1); // midnight in India
    expect(istWeek(Date.UTC(2026, 10, 8, 18, 29))).toBe(istWeek(SAT)); // Sunday 23:59
    expect(istWeek(Date.UTC(2026, 10, 8, 18, 30))).toBe(istWeek(SAT) + 1); // Monday 00:00
  });
});

describe('Every Week', () => {
  it('four weeks in a row with a night counts', () => {
    const f = base([0, 1, 2, 3].map((w) => nt(SAT + w * 7 * DAY, ['a', 'b'])));
    expect(got(f, 'a')).toContain('every_week');
    expect(checkHistory(f).find((e) => e.id === 'every_week' && e.pid === 'a')!.at).toBe(SAT + 21 * DAY);
  });
  it('a missed week starts the count again; two nights in one week are one week', () => {
    expect(got(base([0, 1, 3, 4, 5].map((w) => nt(SAT + w * 7 * DAY, ['a', 'b']))), 'a')).not.toContain('every_week');
    expect(got(base([nt(SAT, ['a', 'b']), nt(SAT + DAY, ['a', 'b']), nt(SAT + 7 * DAY, ['a', 'b']), nt(SAT + 14 * DAY, ['a', 'b'])]), 'a')).not.toContain('every_week');
  });
  it('streaks: the longest run, and the run still going', () => {
    const t = [0, 1, 2, 4, 5].map((w) => SAT + w * 7 * DAY);
    expect(weekStreaks(t, SAT + 5 * 7 * DAY)).toEqual({ longest: 3, current: 2 });
    expect(weekStreaks(t, SAT + 6 * 7 * DAY)).toEqual({ longest: 3, current: 2 }); // last week still counts
    expect(weekStreaks(t, SAT + 7 * 7 * DAY)).toEqual({ longest: 3, current: 0 });
    expect(weekStreaks([], SAT)).toEqual({ longest: 0, current: 0 });
  });
});

describe('Podium and Champion', () => {
  const season = (closed: boolean) => ({ id: 's1', name: 'Season 1', closed, closedAt: SAT, ranks: [{ pid: 'a', rank: 1 }, { pid: 'b', rank: 3 }, { pid: 'c', rank: 4 }, { pid: 'd', rank: null }] });
  it('a finished season gives its top three Podium and its winner Champion', () => {
    const f = base([], { seasons: [season(true)] });
    expect(got(f, 'a')).toEqual(['podium', 'champion']);
    expect(got(f, 'b')).toEqual(['podium']);
    expect(got(f, 'c')).toEqual([]);
    expect(got(f, 'd')).toEqual([]);
  });
  it('a season still running gives nothing', () => {
    expect(checkHistory(base([], { seasons: [season(false)] }))).toEqual([]);
  });
});

describe('Nemesis', () => {
  it('finishing above the same player three nights running counts, and says whose problem', () => {
    const f = base([nt(SAT, ['a', 'b', 'c']), nt(SAT + DAY, ['c', 'a', 'b']), nt(SAT + 2 * DAY, ['a', 'c', 'b'])], { names: { b: 'Bee' } });
    expect(got(f, 'a')).toContain('nemesis');
    expect(checkHistory(f).find((e) => e.id === 'nemesis' && e.pid === 'a')!.detail).toEqual({ victim: 'b', name: 'Bee' });
    expect(got(f, 'b')).not.toContain('nemesis');
  });
  it('a night the other way round breaks the run; nights apart do not', () => {
    expect(got(base([nt(SAT, ['a', 'b']), nt(SAT + DAY, ['b', 'a']), nt(SAT + 2 * DAY, ['a', 'b']), nt(SAT + 3 * DAY, ['a', 'b'])]), 'a')).not.toContain('nemesis');
    expect(got(base([nt(SAT, ['a', 'b']), nt(SAT + DAY, ['a', 'c']), nt(SAT + 2 * DAY, ['a', 'b']), nt(SAT + 3 * DAY, ['c', 'd']), nt(SAT + 4 * DAY, ['a', 'b'])]), 'a')).toContain('nemesis');
  });
});

describe('Full House Party', () => {
  const members = [{ pid: 'a', joined: SAT - 30 * DAY }, { pid: 'b', joined: SAT - 30 * DAY }, { pid: 'c', joined: SAT - 30 * DAY }];
  it('a night with every member at the table counts for each of them (a guest does not get it)', () => {
    const f = base([nt(SAT, ['a', 'b', 'c', 'guest'])], { members });
    expect(got(f, 'a')).toContain('full_house_party');
    expect(got(f, 'c')).toContain('full_house_party');
    expect(got(f, 'guest')).toEqual([]);
  });
  it('one member missing, or a crew of two, does not', () => {
    expect(checkHistory(base([nt(SAT, ['a', 'b'])], { members }))).toEqual([]);
    expect(checkHistory(base([nt(SAT, ['a', 'b'])], { members: members.slice(0, 2) }))).toEqual([]);
  });
  it('who was a member is taken as of that night', () => {
    const late = [...members, { pid: 'd', joined: SAT + DAY }, { pid: 'e', joined: SAT - 40 * DAY, left: SAT - DAY }];
    expect(got(base([nt(SAT, ['a', 'b', 'c'])], { members: late }), 'a')).toContain('full_house_party');
    expect(got(base([nt(SAT + 2 * DAY, ['a', 'b', 'c'])], { members: late }), 'a')).not.toContain('full_house_party');
  });
});

describe('Host', () => {
  it('the tenth game you opened counts; nine do not', () => {
    const ten = Array.from({ length: 10 }, (_, i) => nt(SAT + i * DAY, ['a', 'b'], 'a'));
    expect(got(base(ten), 'a')).toContain('host');
    expect(got(base(ten.slice(0, 9)), 'a')).not.toContain('host');
    expect(got(base(ten), 'b')).not.toContain('host');
  });
});

describe('the definition table', () => {
  it('has the 37 achievements of the plan, each with its own id', () => {
    expect(ACHIEVEMENTS).toHaveLength(37);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(37);
    expect(ACHIEVEMENTS.filter((a) => a.hidden).map((a) => a.id)).toEqual(['trust_issues', 'same_again', 'gone_fishing']);
    const by = (grp: string) => ACHIEVEMENTS.filter((a) => a.group === grp).length;
    expect([by('cards'), by('play'), by('nights'), by('crew'), by('hidden')]).toEqual([9, 9, 8, 8, 3]);
    for (const a of ACHIEVEMENTS) { expect(a.id).toMatch(/^[a-z_]{3,24}$/); expect(a.name.length).toBeGreaterThan(2); expect(a.how.length).toBeGreaterThan(8); }
  });
  it('tiers: Stone Cold Bluff at 1, 10, 50 and Regular at 100, 500, 1,000, 5,000', () => {
    expect(ACHIEVEMENT.stone_cold_bluff!.tiers!.map((t) => t.at)).toEqual([1, 10, 50]);
    expect(ACHIEVEMENT.regular!.tiers!.map((t) => t.at)).toEqual([100, 500, 1000, 5000]);
    expect([tierFor('regular', 99), tierFor('regular', 100), tierFor('regular', 1000), tierFor('regular', 9999), tierFor('quads', 5)]).toEqual([0, 1, 3, 4, 0]);
    expect(ownedLook('regular', 3)).toEqual({ rarity: 'rare', unlocks: [{ kind: 'frame', name: 'Regular 1,000' }, { kind: 'finish', name: 'Gold Leaf' }] });
    expect(ownedLook('royal')).toEqual({ rarity: 'mythic', unlocks: [{ kind: 'backdrop', name: 'Throne Room' }] });
    expect(ownedLook('nope')).toBeNull();
  });
});

describe('milestones', () => {
  it('each bar shows the way to its next step', () => {
    const bars = milestoneBars({ hands: 86, nights: 30, wins: 0, bluffs: 50 });
    const b = (id: string) => bars.find((x) => x.id === id)!;
    expect(bars).toHaveLength(MILESTONES.length);
    expect(b('hands')).toMatchObject({ value: 86, next: 100, prev: 0, part: 0.86, done: false, reached: 0, reward: 'Frame' });
    expect(b('nights')).toMatchObject({ value: 30, next: 50, prev: 25, part: 0.6, reached: 2 });
    expect(b('wins')).toMatchObject({ value: 0, next: 1, part: 0 });
    expect(b('bluffs')).toMatchObject({ done: true, part: 1, next: 50, reached: 3 });
    expect(b('achievements').next).toBe(10);
  });
  it('the three closest are the ones furthest along, finished ones left out', () => {
    expect(nextMilestones({ hands: 86, nights: 4, wins: 3, bluffs: 50, showdowns: 5 }).map((x) => x.id)).toEqual(['hands', 'nights', 'wins']);
    expect(nextMilestones({}, 2).map((x) => x.id)).toEqual(['hands', 'nights']);
    expect(nextMilestones({ hands: -5, nights: NaN }, 1)[0]).toMatchObject({ id: 'hands', value: 0 });
  });
});
