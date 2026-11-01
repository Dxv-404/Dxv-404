// Against the real Supabase project (LIVE_SUPABASE=1). Each "phone" is an Account with its own storage;
// wiping a phone = a new, empty storage. Uses 5 anonymous sign-ins per run.
import { afterAll, describe, expect, it } from 'vitest';
import { Account, checkTicket, formatCode, type KeyStore } from '../src/index';

const store = (): KeyStore => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };
const made: Account[] = [];
const phone = () => { const a = new Account({ storage: store() }); made.push(a); return a; };

describe.skipIf(!process.env.LIVE_SUPABASE)('accounts on the live project', () => {
  afterAll(async () => { for (const a of made) if (a.profile) await a.deleteAccount().catch(() => {}); }, 60_000);

  it('no sign-up, recovery on a wiped phone, merge, crew rescue, tickets', async () => {
    // Rahul's first phone: an account the moment the app opens
    const rahul = phone();
    const me = await rahul.start('Rahul');
    expect(me.name).toBe('Rahul');
    const crew = await rahul.createCrew('Live test crew', '#336699', { startStack: 2000 });
    const invite = await rahul.createInvite(crew.id);
    const code = await rahul.newRecoveryCode();
    expect(formatCode(code)).toMatch(/^\d{4} \d{4} \d{4}$/);
    expect(await rahul.hasRecoveryCode()).toBe(true);

    // a friend joins by link and sees Rahul
    const riya = phone();
    await riya.start('Riya');
    expect(await riya.joinCrew(invite)).toBe('active');
    expect((await riya.members(crew.id)).map((m) => m.name)).toEqual(['Rahul', 'Riya']);

    // Rahul's phone is wiped: a new phone with nothing on it types the code
    const wiped = phone();
    expect((await wiped.recover('000000000001')).ok).toBe(false);
    const back = await wiped.recover(code);
    expect(back.ok && back.profile.id).toBe(me.id);
    expect((await wiped.crews()).map((c) => [c.name, c.role])).toEqual([['Live test crew', 'owner']]);

    // a phone that already played under its own account: merge brings its crew along
    const third = phone();
    await third.start('Rahul 3');
    const own = await third.createCrew('Third phone crew');
    const merged = await third.recover(code, true);
    expect(merged.ok).toBe(true);
    expect((await third.crews()).map((c) => c.name).sort()).toEqual(['Live test crew', 'Third phone crew']);
    await third.deleteCrew(own.id);

    // crew rescue: a new phone says it is Riya. She joined today, so the crew cannot vouch for her yet
    // (a crew made to steal an account would otherwise work at once); her own phone sees it and says no
    const riyaNew = phone();
    const info = await riyaNew.inviteInfo(invite);
    const riyaId = info!.members.find((m) => m.name === 'Riya')!.id;
    const req = await riyaNew.requestRescue(invite, riyaId);
    const pending = await wiped.pendingRescues(crew.id);
    expect(pending.map((p) => [p.id, p.target_name])).toEqual([[req, 'Riya']]);
    await expect(wiped.decideRescue(req, true)).rejects.toThrow(/less than a week ago/);
    expect((await riya.rescuesOfMe()).map((r) => [r.id, r.crew_name, r.status])).toEqual([[req, 'Live test crew', 'pending']]);
    await riya.decideRescue(req, false);
    expect(await riyaNew.rescueStatus(req)).toEqual({ status: 'denied', finishesAt: null });
    expect(await riyaNew.refresh()).toBeNull(); // the asking phone got nothing
    // (an approved rescue finishing a day after the old phone went quiet is in the database tests, 08)

    // tickets for a crew table
    const t = await riya.ticket('LIVE1');
    const who = await checkTicket(t, 'LIVE1');
    expect(who).toMatchObject({ account: riyaId, name: 'Riya' });
    expect(who!.crews).toContain(crew.id);
    expect(await checkTicket(t, 'LIVE2')).toBeNull();
    expect(await checkTicket('nope', 'LIVE1')).toBeNull();

    // log out other phones: the first phone's login stops working
    expect(await wiped.logoutOtherPhones()).toBe(2); // the first phone and the merged third
    expect(await rahul.refresh()).toBeNull();
    await wiped.deleteCrew(crew.id);
    made.splice(made.indexOf(rahul), 1); made.splice(made.indexOf(third), 1);
  }, 120_000);
});
