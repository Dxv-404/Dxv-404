import { describe, it, expect } from 'vitest';
import { bellState, groupNotices, inboxHtml, noticeHtml, unreadCount, whenText } from '../src/bell-core';
import type { Notice } from '@tp/account';

const NOW = new Date(2026, 10, 11, 12, 0, 0).getTime();
const at = (minAgo: number): string => new Date(NOW - minAgo * 60_000).toISOString();
const N = (id: number, minAgo: number, o: Partial<Notice> = {}): Notice => ({ id, kind: 'crewTable', title: 'A crew table is open', body: 'Rosh opened table ABCD.', url: '/#/t/ABCD', at: at(minAgo), ...o });

describe('the bell', () => {
  it('counts what is new since it was last read', () => {
    expect(unreadCount([N(5, 1), N(4, 2), N(2, 9)], 3)).toBe(2);
    expect(unreadCount([N(5, 1)], 5)).toBe(0);
    expect(unreadCount([], 0)).toBe(0);
  });

  it('groups today and earlier', () => {
    const g = groupNotices([N(3, 10), N(2, 13 * 60), N(1, 3 * 24 * 60)], NOW);
    expect(g.today.map((n) => n.id)).toEqual([3]);
    expect(g.earlier.map((n) => n.id)).toEqual([2, 1]);
  });

  it('says when in words', () => {
    expect(whenText(at(0), NOW)).toBe('just now');
    expect(whenText(at(12), NOW)).toBe('12 min ago');
    expect(whenText(at(185), NOW)).toBe('3 h ago');
    expect(whenText(at(2 * 24 * 60), NOW)).toMatch(/Mon,? 9 Nov/);
    expect(whenText('nonsense', NOW)).toBe('');
  });

  it('the switch block: account, iPhone not yet on the Home Screen, blocked, off, on', () => {
    const base = { account: true, ios: false, standalone: false, supported: true, permission: 'default', subscribed: false };
    expect(bellState({ ...base, account: false })).toBe('no-account');
    expect(bellState({ ...base, ios: true })).toBe('ios-install');
    expect(bellState({ ...base, ios: true, standalone: true })).toBe('off');
    expect(bellState({ ...base, supported: false })).toBe('unsupported');
    expect(bellState({ ...base, permission: 'denied' })).toBe('blocked');
    expect(bellState(base)).toBe('off');
    expect(bellState({ ...base, permission: 'granted' })).toBe('off'); // allowed, but this phone has no subscription
    expect(bellState({ ...base, permission: 'granted', subscribed: true })).toBe('on');
  });

  it('an item: new ones are marked, a table that just opened has Join, text is escaped', () => {
    const h = noticeHtml(N(7, 5, { title: '<b>x</b>' }), 3, NOW);
    expect(h).toContain('class="bitem new"');
    expect(h).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(h).toContain('class="bjoin"');
    expect(h).toContain('5 min ago');
    const old = noticeHtml(N(2, 9 * 60), 3, NOW);
    expect(old).toContain('class="bitem"');
    expect(old).not.toContain('bjoin'); // the table has long closed
    expect(noticeHtml(N(8, 5, { kind: 'trophies', url: '/' }), 3, NOW)).not.toContain('bjoin');
  });

  it('the inbox: empty words, or Today and Earlier', () => {
    expect(inboxHtml([], 0, NOW)).toContain('Nothing yet');
    const h = inboxHtml([N(3, 10), N(1, 3 * 24 * 60)], 0, NOW);
    expect(h.indexOf('Today')).toBeGreaterThan(-1);
    expect(h.indexOf('Earlier')).toBeGreaterThan(h.indexOf('Today'));
    expect(inboxHtml([N(1, 3 * 24 * 60)], 0, NOW)).not.toContain('Today');
  });
});
