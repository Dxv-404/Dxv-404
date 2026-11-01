// For table servers: check a phone's table ticket with the accounts database. Uses only the public
// key and plain fetch (no Supabase client), so it runs in the Node server, a Durable Object and tests.

/** The project the app talks to. The publishable key is meant to be public (it only allows what the
 * database's row-level security and functions allow). */
export const SUPABASE_URL = 'https://yghyartpurzwogtldzii.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_kkp6rh7CrHks9RS5eDyOrw_J2CXKFdt';

export interface TicketInfo { account: string; device: string; name: string; crews: string[] }

export async function checkTicket(token: string, table: string, opts: { url?: string; key?: string; fetch?: typeof fetch } = {}): Promise<TicketInfo | null> {
  const f = opts.fetch ?? fetch;
  const key = opts.key ?? SUPABASE_KEY;
  const res = await f(`${opts.url ?? SUPABASE_URL}/rest/v1/rpc/check_ticket`, {
    method: 'POST', headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ p_token: token, p_table: table }),
  });
  if (!res.ok) throw new Error(`check_ticket failed: ${res.status}`);
  return (await res.json()) as TicketInfo | null;
}

/** A ticket checker that remembers answers for a few minutes (reconnects do not ask the database again). */
export function cachedTicketChecker(opts: { ttlMs?: number; fetch?: typeof fetch; now?: () => number } = {}): (token: string, table: string) => Promise<TicketInfo | null> {
  const ttl = opts.ttlMs ?? 5 * 60_000;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; info: TicketInfo }>();
  return async (token, table) => {
    const key = `${table}:${token}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttl) return hit.info;
    const info = await checkTicket(token, table, opts.fetch ? { fetch: opts.fetch } : {});
    if (info) {
      cache.set(key, { at: now(), info });
      if (cache.size > 5000) cache.delete(cache.keys().next().value!);
    } else cache.delete(key);
    return info;
  };
}
