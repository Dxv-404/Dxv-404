import { describe, expect, it } from 'vitest';
import { cachedTicketChecker, checkTicket } from '../src/ticket';

const info = { account: 'a', device: 'd', name: 'Riya', crews: ['c'] };
const fakeFetch = (answer: unknown, status = 200) => {
  const calls: unknown[] = [];
  const f = (async (url: string, init: RequestInit) => { calls.push([url, JSON.parse(String(init.body))]); return new Response(JSON.stringify(answer), { status }); }) as unknown as typeof fetch;
  return { f, calls };
};

describe('table tickets', () => {
  it('asks check_ticket with the token and table', async () => {
    const { f, calls } = fakeFetch(info);
    expect(await checkTicket('tok', 'QK7P', { fetch: f })).toEqual(info);
    expect(calls[0]).toEqual(['https://yghyartpurzwogtldzii.supabase.co/rest/v1/rpc/check_ticket', { p_token: 'tok', p_table: 'QK7P' }]);
  });
  it('a failed request throws', async () => {
    await expect(checkTicket('tok', 'QK7P', { fetch: fakeFetch(null, 500).f })).rejects.toThrow('500');
  });
  it('answers are remembered for a few minutes; refusals are not', async () => {
    let t = 0;
    const { f, calls } = fakeFetch(info);
    const check = cachedTicketChecker({ fetch: f, now: () => t, ttlMs: 1000 });
    await check('tok', 'QK7P'); await check('tok', 'QK7P');
    expect(calls).toHaveLength(1);
    t = 1000; await check('tok', 'QK7P');
    expect(calls).toHaveLength(2);
    const none = fakeFetch(null);
    const check2 = cachedTicketChecker({ fetch: none.f });
    expect(await check2('x', 'QK7P')).toBeNull();
    await check2('x', 'QK7P');
    expect(none.calls).toHaveLength(2);
  });
});
