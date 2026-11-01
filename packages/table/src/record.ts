// Turning finished hands and games into league records, and getting them to the database exactly once.
// The table server builds a payload from the engine's own hand record (never from what phones say),
// signs it with the recorder key, and keeps it in an outbox until the database says "ok" or "duplicate".
import { CATEGORY, Engine, type HandRecord, type PlayerId } from '@tp/engine';

export interface GameInfo {
  id: string; crew: string | null; table: string; server: 'oracle' | 'cloudflare' | 'host' | 'test';
  casual: boolean; startStack: number; bigBlind: number; startedAt: string;
}
export interface HandPlayerRow { key: string; account: string | null; name: string; net: number; vpip: boolean; pfr: boolean; showdown: boolean; won: boolean; bestHand: number | null }
export interface EndPlayerRow { key: string; account: string | null; name: string; buyins: number; final: number; minStack: number }

/** Who put money in voluntarily, who raised before the flop, who reached a showdown and what they held. */
export function handPlayers(rec: HandRecord, accountOf: (pid: PlayerId) => string | null): { rows: HandPlayerRow[]; pot: number } {
  const e = Engine.fromSnapshot(rec.before);
  const vpip = new Set<PlayerId>(), pfr = new Set<PlayerId>();
  for (const input of rec.inputs) {
    const street = e.s.hand?.street;
    const bet = e.s.hand?.currentBet ?? 0;
    if (input.t === 'act' && street === 'preflop' && e.s.hand?.toAct === input.pid) {
      const t = input.action.type;
      if (t === 'call' || t === 'bet' || t === 'raise' || t === 'allin') vpip.add(input.pid);
      if (t === 'raise' || t === 'bet' || (t === 'allin' && e.player(input.pid)!.stack + (e.s.hand!.ps[input.pid]?.streetBet ?? 0) > bet)) pfr.add(input.pid);
    }
    const r = e.apply(input);
    if (r.error) throw new Error(`hand ${rec.handNo} does not replay: ${r.error}`);
  }
  const h = e.s.hand!;
  const results = h.results!;
  const won = new Map<PlayerId, number>();
  for (const pot of results.pots) for (const a of pot.awards) won.set(a.pid, (won.get(a.pid) ?? 0) + a.amount);
  const before = new Map(rec.before.players.map((p) => [p.id, p]));
  const after = new Map(e.s.players.concat(e.s.departed ?? []).map((p) => [p.id, p]));
  const rows: HandPlayerRow[] = h.order.map((pid) => {
    const hp = h.ps[pid]!;
    const showdown = results.showdown && !hp.folded;
    const ev = results.evals[pid];
    const cat = ev ? CATEGORY.indexOf(ev.name as (typeof CATEGORY)[number]) : -1;
    return {
      key: pid, account: accountOf(pid), name: (after.get(pid) ?? before.get(pid))!.name,
      net: (after.get(pid)?.stack ?? 0) - (before.get(pid)?.stack ?? 0) - ((after.get(pid)?.buyins ?? 0) - (before.get(pid)?.buyins ?? 0)),
      vpip: vpip.has(pid), pfr: pfr.has(pid), showdown, won: (won.get(pid) ?? 0) > 0,
      bestHand: showdown && cat >= 0 ? cat : null,
    };
  });
  return { rows, pot: results.pots.reduce((s, p) => s + p.amount, 0) };
}

export interface Signer { (body: string): Promise<string> }

/** Table servers prove who they are with their recorder token (the database keeps only its hash). */
export function tokenSigner(token: string): Signer {
  return async () => token;
}

export interface OutboxItem { id: string; fn: 'record_hand' | 'record_game_end'; body: string; tries: number; nextAt: number }
export interface OutboxStore { load(): Promise<OutboxItem[]>; put(item: OutboxItem): Promise<void>; remove(id: string): Promise<void> }
export type Send = (fn: OutboxItem['fn'], body: string, sig: string) => Promise<'ok' | 'duplicate' | 'game over' | 'refused'>;

/**
 * Keeps league records until the database has them. Items are stored before the first try, so a crash
 * loses nothing; the database ignores repeats, so sending twice is harmless. A record the database
 * refuses (chips that do not add up) is kept aside and logged instead of retried for ever.
 */
export class Recorder {
  private items = new Map<string, OutboxItem>();
  refused: OutboxItem[] = [];
  constructor(private store: OutboxStore, private sign: Signer, private send: Send, private now: () => number = Date.now, private log: (m: string) => void = () => {}) {}

  async start(): Promise<void> { for (const it of await this.store.load()) this.items.set(it.id, it); }

  async add(fn: OutboxItem['fn'], id: string, payload: unknown): Promise<void> {
    if (this.items.has(id)) return;
    const it: OutboxItem = { id, fn, body: JSON.stringify(payload), tries: 0, nextAt: 0 };
    this.items.set(id, it);
    await this.store.put(it);
    await this.flush();
  }

  get pending(): number { return this.items.size; }
  /** When the next retry is due (for servers that schedule a wake-up), or null if nothing is waiting. */
  get nextAt(): number | null { let m: number | null = null; for (const it of this.items.values()) m = m === null ? it.nextAt : Math.min(m, it.nextAt); return m; }

  /** Send whatever is due, oldest first (hands before the game's end). Calling it while a send is running
   * waits for that one and then sends anything still due, so "await flush()" always means "done". */
  flush(): Promise<void> {
    const run = (this.running ?? Promise.resolve()).then(() => this.flushOnce());
    this.running = run.finally(() => { if (this.running === tail) this.running = null; });
    const tail = this.running;
    return run;
  }

  private running: Promise<void> | null = null;

  private async flushOnce(): Promise<void> {
    const due = [...this.items.values()].filter((it) => it.nextAt <= this.now());
    for (const it of due) {
      if (!this.items.has(it.id)) continue;
      let res: Awaited<ReturnType<Send>>;
      try { res = await this.send(it.fn, it.body, await this.sign(it.body)); }
      catch (e) {
        it.tries++;
        it.nextAt = this.now() + Math.min(10 * 60_000, 2000 * 2 ** Math.min(it.tries, 9));
        await this.store.put(it);
        this.log(`recorder: ${it.id} failed (try ${it.tries}): ${String(e)}`);
        if (it.fn === 'record_hand') break; // keep the order: later hands wait for this one
        continue;
      }
      if (res === 'refused') { this.refused.push(it); this.log(`recorder: ${it.id} refused by the database`); }
      this.items.delete(it.id);
      await this.store.remove(it.id);
    }
  }
}

/** Talks to the database with the public key; the signature is what makes it a table server. */
export function supabaseSend(url: string, key: string, fetchFn: typeof fetch = fetch): Send {
  return async (fn, body, sig) => {
    const res = await fetchFn(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ p_body: body, p_sig: sig }) });
    if (res.ok) return (await res.json()) as 'ok' | 'duplicate' | 'game over';
    const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    if (err.code === '22023') return 'refused'; // the data itself is wrong: retrying will not help
    throw new Error(`${fn}: ${res.status} ${err.message ?? ''}`);
  };
}
