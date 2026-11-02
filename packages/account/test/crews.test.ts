// v3 crews in the account package: the crew code rules, and every crew call asking the right database
// function with the right arguments (and handing its answer or its error back).
import { describe, expect, it } from 'vitest';
import { Account, AccountError, CREW_CODE_ALPHABET, cleanCrewCode, crewLink, formatCrewCode, isCrewCode, parseCrewLink, restSeconds, type KeyStore } from '../src/index';

const URL = 'https://example.supabase.co';
const store = (): KeyStore => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };
/** An Account whose database answers every function call with `answer` (or an error), recording the calls. */
function fake(answer: unknown = null, error?: { message: string; code: string }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const m = /\/rest\/v1\/rpc\/(\w+)/.exec(url);
    if (m) calls.push({ fn: m[1]!, args: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
    if (error) return new Response(JSON.stringify({ message: error.message, code: error.code, details: null, hint: null }), { status: 400, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { a: new Account({ url: URL, key: 'k', storage: store(), fetch: f }), calls };
}

describe('crew codes', () => {
  it('has no look-alike characters', () => {
    expect(CREW_CODE_ALPHABET).toHaveLength(32);
    for (const ch of '01OI') expect(CREW_CODE_ALPHABET).not.toContain(ch);
  });
  it('keeps only what a code can have, in capitals, six at most', () => {
    expect(cleanCrewCode('fnt-4q2')).toBe('FNT4Q2');
    expect(cleanCrewCode(' h4b 7kx ')).toBe('H4B7KX');
    expect(cleanCrewCode('O0I1abcdefgh')).toBe('ABCDEF');
    expect(cleanCrewCode('')).toBe('');
  });
  it('knows a whole code', () => {
    expect(isCrewCode('FNT4Q2')).toBe(true);
    expect(isCrewCode('FNT4Q')).toBe(false);
    expect(isCrewCode('FNT4Q0')).toBe(false);
    expect(isCrewCode('fnt4q2')).toBe(false);
  });
  it('shows a dash after three', () => {
    expect(formatCrewCode('FNT4Q2')).toBe('FNT-4Q2');
    expect(formatCrewCode('FN')).toBe('FN');
    expect(formatCrewCode('FNT4')).toBe('FNT-4');
  });
  it('finds the code in a pasted link or a bare code', () => {
    expect(parseCrewLink('https://trainpoker.app/#/c/FNT4Q2')).toEqual({ code: 'FNT4Q2', from: null });
    expect(parseCrewLink('Join us! trainpoker.app/c/fnt-4q2 see you friday')).toEqual({ code: 'FNT4Q2', from: null });
    expect(parseCrewLink('https://x.app/#/c/H4B7KX?from=00000000-0000-0000-0000-0000000e0003')).toEqual({ code: 'H4B7KX', from: '00000000-0000-0000-0000-0000000e0003' });
    expect(parseCrewLink('fnt-4q2')).toEqual({ code: 'FNT4Q2', from: null });
    expect(parseCrewLink('https://x.app/#/c/ABCDEFGHJK')).toBeNull(); // an old 10-letter invite link
    expect(parseCrewLink('hello')).toBeNull();
    expect(parseCrewLink('FNT4Q0')).toBeNull();
  });
  it('makes the share link', () => {
    expect(crewLink('https://x.app/', 'FNT4Q2')).toBe('https://x.app/#/c/FNT4Q2');
    expect(crewLink('https://x.app/', 'FNT4Q2', 'abc')).toBe('https://x.app/#/c/FNT4Q2?from=abc');
  });
  it('reads the rest from the refusal', () => {
    expect(restSeconds('Too many wrong codes. Try again in 30 seconds.')).toBe(30);
    expect(restSeconds('Try again in 1 second')).toBe(1);
    expect(restSeconds('No crew')).toBeNull();
  });
});

describe('crew calls', () => {
  const C = 'c0000000-0000-4000-8000-000000000001';
  const P = 'a0000000-0000-4000-8000-000000000002';
  const cases: [string, (a: Account) => Promise<unknown>, string, Record<string, unknown>][] = [
    ['myCrews', (a) => a.myCrews(), 'my_crews', {}],
    ['createCrewV3', (a) => a.createCrewV3('Hostel 4B', 'hex', '#2f6fd6', true), 'create_crew_v3', { p_name: 'Hostel 4B', p_badge: 'hex', p_color: '#2f6fd6', p_seasons: true }],
    ['crewPreview', (a) => a.crewPreview('FNT4Q2'), 'crew_preview', { p_code: 'FNT4Q2' }],
    ['askToJoin', (a) => a.askToJoin('FNT4Q2'), 'ask_to_join', { p_code: 'FNT4Q2', p_notify: true, p_from: null }],
    ['askToJoin (quiet, invited)', (a) => a.askToJoin('FNT4Q2', false, P), 'ask_to_join', { p_code: 'FNT4Q2', p_notify: false, p_from: P }],
    ['cancelJoinRequest', (a) => a.cancelJoinRequest(C), 'cancel_join_request', { p_crew: C }],
    ['setRequestNotify', (a) => a.setRequestNotify(C, false), 'set_request_notify', { p_crew: C, p_notify: false }],
    ['myJoinRequests', (a) => a.myJoinRequests(), 'my_join_requests', {}],
    ['joinRequests', (a) => a.joinRequests(C), 'crew_join_requests', { p_crew: C }],
    ['decideJoinRequest', (a) => a.decideJoinRequest('r1', true), 'decide_join_request', { p_request: 'r1', p_approve: true }],
    ['noteInvitation', (a) => a.noteInvitation('FNT4Q2', P), 'note_invitation', { p_code: 'FNT4Q2', p_from: P }],
    ['myInvitations', (a) => a.myInvitations(), 'my_invitations', {}],
    ['dismissInvitation', (a) => a.dismissInvitation(C), 'dismiss_invitation', { p_crew: C }],
    ['crewPage', (a) => a.crewPage(C), 'crew_page', { p_crew: C }],
    ['crewLeague', (a) => a.crewLeague(C), 'crew_league', { p_crew: C, p_scope: 'season', p_season: null }],
    ['crewLeague (all-time)', (a) => a.crewLeague(C, 'alltime'), 'crew_league', { p_crew: C, p_scope: 'alltime', p_season: null }],
    ['crewGamesV3', (a) => a.crewGamesV3(C, 'mine', 20, '2026-11-01T00:00:00Z'), 'crew_games', { p_crew: C, p_filter: 'mine', p_limit: 20, p_before: '2026-11-01T00:00:00Z' }],
    ['crewMembers', (a) => a.crewMembers(C), 'crew_members_v3', { p_crew: C }],
    ['playerCard', (a) => a.playerCard(C, P), 'crew_player', { p_crew: C, p_account: P }],
    ['crewDisputes', (a) => a.crewDisputes(C), 'crew_disputes', { p_crew: C }],
    ['crewSettings', (a) => a.crewSettings(C, { whoHosts: 'admins', seasonMonths: 0 }), 'crew_settings',
      { p_crew: C, p_name: null, p_badge: null, p_color: null, p_season_months: 0, p_who_hosts: 'admins', p_members_invite: null, p_auto_admit: null, p_house_rules: null }],
    ['crewSettings (everything)', (a) => a.crewSettings(C, { name: 'N', badge: 'round', color: '#1f8a5b', seasonMonths: 6, whoHosts: 'leader', membersInvite: false, autoAdmit: true, houseRules: { bb: 20 } }), 'crew_settings',
      { p_crew: C, p_name: 'N', p_badge: 'round', p_color: '#1f8a5b', p_season_months: 6, p_who_hosts: 'leader', p_members_invite: false, p_auto_admit: true, p_house_rules: { bb: 20 } }],
    ['newCrewCode', (a) => a.newCrewCode(C), 'new_crew_code', { p_crew: C }],
    ['endSeasonNow', (a) => a.endSeasonNow(C), 'end_season_now', { p_crew: C }],
    ['hostCrewTable', (a) => a.hostCrewTable(C, 'QK7P', 'online', { bb: 20 }), 'host_crew_table', { p_crew: C, p_table: 'QK7P', p_mode: 'online', p_rules: { bb: 20 } }],
    ['hostCrewTable (QR, crew rules)', (a) => a.hostCrewTable(C, null, 'qr'), 'host_crew_table', { p_crew: C, p_table: null, p_mode: 'qr', p_rules: null }],
    ['closeCrewTable', (a) => a.closeCrewTable(C, 7), 'close_crew_table', { p_crew: C, p_id: 7 }],
    ['handOver', (a) => a.handOver(C, P), 'transfer_ownership', { p_crew: C, p_account: P }],
  ];
  for (const [name, call, fn, args] of cases) {
    it(`${name} asks ${fn}`, async () => {
      const { a, calls } = fake({ ok: 1 });
      expect(await call(a)).toEqual({ ok: 1 });
      expect(calls).toEqual([{ fn, args }]);
    });
  }
  it('hands the answer back as it came', async () => {
    const card = [{ id: C, name: 'Friday Night Table', role: 'owner', live: { table: 'QK7P' } }];
    expect(await fake(card).a.myCrews()).toEqual(card);
    expect(await fake({ found: false, tries_left: 3, rest: 0, code: 'ZZZ-ZZZ' }).a.crewPreview('ZZZZZZ')).toEqual({ found: false, tries_left: 3, rest: 0, code: 'ZZZ-ZZZ' });
  });
  it('a refusal is an AccountError with the database message and code', async () => {
    const { a } = fake(null, { message: 'Too many wrong codes. Try again in 30 seconds.', code: '54000' });
    const err = await a.crewPreview('ZZZZZZ').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AccountError);
    expect((err as AccountError).message).toBe('Too many wrong codes. Try again in 30 seconds.');
    expect((err as AccountError).code).toBe('54000');
    expect(restSeconds((err as AccountError).message)).toBe(30);
  });
  it('a leader-only change refused for an admin', async () => {
    const { a } = fake(null, { message: 'Only the crew leader can do that', code: '42501' });
    await expect(a.crewSettings(C, { name: 'x' })).rejects.toThrow('Only the crew leader can do that');
  });
});
