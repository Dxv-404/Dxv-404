// Turning finished hands and games into league records, and getting them to the database exactly once.
// The table server builds a payload from the engine's own hand record (never from what phones say),
// signs it with the recorder key, and keeps it in an outbox until the database says "ok" or "duplicate".
import { CATEGORY, Engine, cardStr, sha256hex, toHex, type GameState, type HandRecord, type Input, type PlayerId } from '@tp/engine';

export interface GameInfo {
  id: string; crew: string | null; table: string; server: 'oracle' | 'cloudflare' | 'host' | 'test';
  casual: boolean; startStack: number; bigBlind: number; startedAt: string;
}
export interface HandPlayerRow { key: string; account: string | null; name: string; net: number; vpip: boolean; pfr: boolean; showdown: boolean; won: boolean; bestHand: number | null; cards?: string[] }

/** One step of a public replay: what everyone at the table could see after it. Compact on purpose (it is
 * stored for every hand): players are listed once in `keys`; per step their stacks and bets are lists in
 * that order, folded and all-in are bit masks, the board is only given when it changes, and cards only
 * for players whose cards are face up. Names are not stored (the screen takes them from the results). */
export interface ReplayFrame {
  say: { t: 'deal' | 'act' | 'auto' | 'vote' | 'show' | 'host'; k?: number; a?: string; to?: number; yes?: boolean };
  board?: string[]; board2?: string[];
  pot: number; stacks: number[]; bets: number[]; folded: number; allIn: number;
  cards?: Record<number, string[]>;
}
export interface PublicReplay {
  v: 2; handNo: number; deckCommit: string; keys: string[]; frames: ReplayFrame[];
  results: { pots: { label: string; amount: number; hand: string | null; board?: 1 | 2; awards: { k: number; amount: number }[] }[]; showdown: boolean } | null;
}

/** The full record without what it does not need: the previous hand (cards and deck of a finished hand)
 * and the game log. Replaying it gives exactly the same hand. */
export function slimRecord(rec: HandRecord): HandRecord {
  const before: GameState = { ...rec.before, hand: null, log: [] };
  return { ...rec, before };
}

/** What everyone at the table saw, step by step: board, pot, stacks, bets, and only the cards that were
 * turned face up. No seed, no deck, no folded cards: safe to show to the whole crew. */
export function publicReplay(rec: HandRecord): PublicReplay {
  const e = Engine.fromSnapshot(slimRecord(rec).before);
  const frames: ReplayFrame[] = [];
  let keys: string[] = [];
  const idx = (k: string) => keys.indexOf(k);
  let lastBoard = '', lastBoard2 = '';
  const say = (i: Input): ReplayFrame['say'] | null => {
    switch (i.t) {
      case 'start': return { t: 'deal' };
      case 'act': return { t: 'act', k: idx(i.pid), a: i.action.type, ...(i.action.to !== undefined ? { to: i.action.to } : {}) };
      case 'tick': return { t: 'auto' };
      case 'vote': return { t: 'vote', k: idx(i.pid), yes: i.yes };
      case 'show': return { t: 'show', k: idx(i.pid) };
      case 'host': return { t: 'host', a: i.cmd };
      default: return null; // presence, seats, seeds: nothing to see
    }
  };
  for (const input of rec.inputs) {
    const r = e.apply(input);
    if (r.error) throw new Error(`hand ${rec.handNo} does not replay: ${r.error}`);
    const v = e.viewFor(null);
    if (!v.hand) continue;
    if (input.t === 'start') keys = v.hand.order.slice();
    const s = say(input);
    if (!s) continue;
    if (s.t === 'auto' && !(r.events ?? []).some((ev) => ev.t === 'act' || ev.t === 'twice')) continue; // a tick that did nothing
    const f: ReplayFrame = { say: s, pot: v.hand.pot, stacks: [], bets: [], folded: 0, allIn: 0 };
    keys.forEach((k, n) => {
      const hp = v.hand!.ps[k]!;
      f.stacks.push(v.players.find((x) => x.id === k)!.stack);
      f.bets.push(hp.streetBet);
      if (hp.folded) f.folded |= 1 << n;
      if (hp.allIn) f.allIn |= 1 << n;
      if (hp.cards) (f.cards ??= {})[n] = hp.cards;
    });
    const b = v.hand.board.join(' '), b2 = (v.hand.board2 ?? []).join(' ');
    if (b !== lastBoard) { f.board = v.hand.board; lastBoard = b; }
    if (b2 !== lastBoard2) { f.board2 = v.hand.board2 ?? []; lastBoard2 = b2; }
    frames.push(f);
  }
  const res = e.s.hand?.results;
  return {
    v: 2, handNo: rec.handNo, deckCommit: rec.deckCommit, keys, frames,
    results: res ? { showdown: res.showdown, pots: res.pots.map((p) => ({ label: p.label, amount: p.amount, hand: p.hand?.name ?? null, ...(p.board ? { board: p.board } : {}), awards: p.awards.map((a) => ({ k: idx(a.pid), amount: a.amount })) })) } : null,
  };
}

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
      ...(accountOf(pid) ? { cards: hp.cards.map(cardStr) } : {}), // only for the player themselves
    };
  });
  return { rows, pot: results.pots.reduce((s, p) => s + p.amount, 0) };
}

export interface Signer { (body: string): Promise<string> }

/** Table servers prove who they are with their recorder token (the database keeps only its hash). */
/**
 * Signs each database call: "v1.<ms>.<HMAC-SHA256 of '<ms>.<body>'>", keyed with the token's SHA-256 (what the
 * database keeps). The token itself never leaves the server, and a signed call is only good for 10 minutes.
 */
export function tokenSigner(token: string, now: () => number = Date.now): Signer {
  const subtle = (globalThis as unknown as { crypto: { subtle: SubtleCrypto } }).crypto.subtle;
  const enc = new TextEncoder();
  const key = subtle.importKey('raw', enc.encode(sha256hex(token)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return async (body) => {
    const t = String(Math.floor(now()));
    const mac = new Uint8Array(await subtle.sign('HMAC', await key, enc.encode(`${t}.${body}`)));
    return `v1.${t}.${toHex(mac)}`;
  };
}

export interface OutboxItem { id: string; fn: 'record_hand' | 'record_game_end'; body: string; tries: number; nextAt: number; /** Send order (stores list items alphabetically, which is not the order they were made). */ order?: number }
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

  private nextOrder = 0;

  async start(): Promise<void> {
    const loaded = (await this.store.load()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const it of loaded) { this.items.set(it.id, it); this.nextOrder = Math.max(this.nextOrder, (it.order ?? 0) + 1); }
  }

  async add(fn: OutboxItem['fn'], id: string, payload: unknown): Promise<void> {
    if (this.items.has(id)) return;
    this.nextOrder = Math.max(this.nextOrder + 1, this.now() * 1000);
    const it: OutboxItem = { id, fn, body: JSON.stringify(payload), tries: 0, nextAt: 0, order: this.nextOrder };
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
    const due = [...this.items.values()].filter((it) => it.nextAt <= this.now()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const it of due) {
      if (!this.items.has(it.id)) continue;
      // a game's end waits until every hand of that game is in
      if (it.fn === 'record_game_end') {
        const game = it.id.split(':')[0];
        if ([...this.items.values()].some((x) => x.fn === 'record_hand' && x.id.startsWith(`${game}:`))) continue;
      }
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
