// The crews screens' small rules: which layout a screen size gets, how the crew's table rules read, the badge
// letters and colours, and the numbers and dates on the cards.
import { describe, expect, it } from 'vitest';
import { bbText, crewShort, duration, endsIn, ordinal, partner, upDown, usualText, weekGroup, ago, COLORS, emblem } from '../src/crews/format';
import { rulesText, sizeOf } from '../src/crews/format';

describe('layouts (v3sizes.py)', () => {
  it('gives every screen of the matrix its layout', () => {
    const want: [number, number, string][] = [[320, 568, 'phone'], [360, 740, 'phone'], [375, 667, 'phone'], [390, 844, 'phone'], [412, 915, 'phone'], [430, 932, 'phone'],
      [667, 375, 'side'], [844, 390, 'side'], [768, 1024, 'tab'], [820, 1180, 'tab'], [1180, 820, 'lap'], [1280, 720, 'lap'], [1440, 900, 'lap'], [1920, 1080, 'desk']];
    for (const [w, h, s] of want) expect(sizeOf(w, h), `${w}x${h}`).toBe(s);
  });
});

describe('the host sheet’s rules line', () => {
  it('reads like the design', () => {
    expect(rulesText({ startStack: 1000, sb: 10, bb: 20, blindUpEvery: 20, rebuys: true, maxRebuys: 2 })).toBe('1,000 chips · blinds 10/20, up every 20 hands · 2 rebuys of 1,000');
    expect(rulesText({ startStack: 2000, sb: 25, bb: 50, rebuys: false })).toBe('2,000 chips · blinds 25/50 · no rebuys');
    expect(rulesText({ rebuys: true, maxRebuys: 1 })).toBe('1,000 chips · blinds 10/20 · 1 rebuy of 1,000');
    expect(rulesText({ rebuys: true, maxRebuys: 0 })).toBe('1,000 chips · blinds 10/20 · rebuys of 1,000');
  });
});

describe('badges', () => {
  it('two letters from the name', () => {
    expect(crewShort('Friday Night Table')).toBe('FN');
    expect(crewShort('Hostel 4B')).toBe('4B');
    expect(crewShort('Office Fridays')).toBe('OF');
    expect(crewShort('aces')).toBe('AC');
  });
  it('the light partner of each crew colour, and a pale one for older colours', () => {
    for (const [a, b] of COLORS) expect(partner(a)).toBe(b);
    expect(partner('#000000')).toBe('#b8b8b8');
  });
  it('draws the chosen shape and escapes the letters', () => {
    const h = emblem({ name: '<b>', color: '#2f6fd6', badge: 'hex' }, 44);
    expect(h).toContain('M24 3 L42 13.5');
    expect(h).not.toContain('<b><b>');
  });
});

describe('numbers and dates', () => {
  it('big blinds with the design’s minus sign', () => {
    expect(bbText(96)).toBe('+96 bb'); expect(bbText(-48.4)).toBe('−48 bb'); expect(bbText(0)).toBe('0 bb'); expect(bbText(null)).toBe('–');
    expect(bbText(1234, false)).toBe('+1,234');
    expect(upDown(3)).toBe('tu'); expect(upDown(-1)).toBe('td'); expect(upDown(0)).toBe('');
  });
  it('places', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
  });
  it('times', () => {
    const now = Date.parse('2026-11-03T12:00:00Z');
    expect(ago('2026-11-03T10:00:00Z', now)).toBe('2 h ago');
    expect(ago('2026-11-02T08:00:00Z', now)).toBe('yesterday');
    expect(ago('2026-10-30T12:00:00Z', now)).toBe('4 days ago');
    expect(endsIn('2026-11-15T12:00:00Z', now)).toBe('ends in 12 days');
    expect(endsIn('2026-11-03T13:00:00Z', now)).toBe('ends tomorrow');
    expect(duration('2026-11-03T09:00:00Z', '2026-11-03T12:12:00Z')).toBe('3 h 12 min');
    expect(duration('2026-11-03T09:00:00Z', '2026-11-03T09:35:00Z')).toBe('35 min');
    expect(usualText({ day: 'Fri', hour: 21 })).toBe('Fri 9 pm');
    expect(usualText({ day: 'Sun', hour: 0 })).toBe('Sun 12 am');
    expect(usualText(null)).toBe('');
  });
  it('groups games by week', () => {
    const now = new Date('2026-11-05T12:00:00'); // a Thursday
    expect(weekGroup('2026-11-03T21:00:00', now)).toBe('This week');
    expect(weekGroup('2026-10-30T21:00:00', now)).toBe('Last week');
    expect(weekGroup('2026-10-17T21:00:00', now)).toBe('October');
  });
});
