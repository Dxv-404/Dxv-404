// Phase 3 at the table: signed-in phones (account tickets), crew-only tables, one seat per account,
// and a recovered account getting its seat back.
import { describe, expect, it } from 'vitest';
import { parseServer, type ServerMessage } from '@tp/protocol';
import { TableRoom, type Conn, type Identity, type Persisted } from '../src/room';

class FakeConn implements Conn {
  inbox: ServerMessage[] = [];
  closed: string | null = null;
  send(text: string): void { const p = parseServer(text); if (!p.ok) throw new Error(p.error); this.inbox.push(p.msg); }
  close(_c: number, reason: string): void { this.closed = reason; }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    return [...this.inbox].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined;
  }
}
const CREW = '11111111-2222-4333-8444-555555555555';
const OTHER_CREW = '99999999-2222-4333-8444-555555555555';
const RAHUL = 'aaaaaaaa-0000-0000-0000-000000000001';
const RIYA = 'aaaaaaaa-0000-0000-0000-000000000002';
const STRANGER = 'aaaaaaaa-0000-0000-0000-000000000003';
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  let now = 1000;
  const saves: Persisted[] = [];
  const tickets = new Map<string, Identity>();
  let broken = false;
  const room = new TableRoom('CREW1', { now: () => now, schedule: () => {} }, { save: (p) => saves.push(JSON.parse(JSON.stringify(p)) as Persisted), appendHand: () => {} }, null, {
    identify: async (t, table) => { if (broken) throw new Error('database down'); return table === 'CREW1' ? tickets.get(t) ?? null : null; },
  });
  let n = 0;
  const pass = (account: string, device: string, name: string, crews: string[]) => { const t = `ticket-${n++}-${'x'.repeat(16)}`; tickets.set(t, { account, device, name, crews }); return t; };
  const hello = async (player: string, ticket: string | null, extra: Record<string, unknown> = {}) => {
    const c = new FakeConn();
    room.connect(c);
    const host = !room.engine && !extra.settings && !extra.spectate ? { settings: {} } : {};
    room.message(c, JSON.stringify({ t: 'hello', v: 1, table: 'CREW1', player, lastSeq: 0, ...(ticket ? { ticket } : {}), ...host, ...extra }));
    await tick();
    return c;
  };
  return { room, saves, pass, hello, breakDb: () => { broken = true; }, get now() { return now; }, set now(v) { now = v; } };
}

describe('signed-in phones at the table', () => {
  it('nobody can take an account seat without that account\'s ticket (the id alone is not enough)', async () => {
    const t = setup();
    await t.hello(RAHUL, t.pass(RAHUL, 'phone-1', 'Rahul', []));
    const fake = await t.hello(RAHUL, null, { token: 'f'.repeat(20), name: 'Not Rahul' });
    expect(fake.last('error')!.message).toBe('Sign in to take this seat');
    const early = await t.hello(RIYA, null, { token: 'f'.repeat(20), name: 'Not Riya' });
    expect(early.last('error')!.message).toBe('Sign in to take this seat'); // not even before Riya arrives
    // and after a restart of the table server
    const back = new TableRoom('CREW1', { now: () => t.now, schedule: () => {} }, { save: () => {}, appendHand: () => {} }, t.saves.at(-1)!, {});
    const c = new FakeConn(); back.connect(c);
    back.message(c, JSON.stringify({ t: 'hello', v: 1, table: 'CREW1', player: RAHUL, lastSeq: 0, token: 'f'.repeat(20), name: 'X' }));
    expect(c.last('error')!.message).toBe('Sign in to take this seat');
  });

  it('two players with the same name are told apart: Riya, Riya 2, Riya 3', async () => {
    const t = setup();
    await t.hello(RAHUL, t.pass(RAHUL, 'p1', 'Riya', []));
    await t.hello(RIYA, t.pass(RIYA, 'p2', 'riya', []));
    await t.hello('guest-a', null, { token: 'g'.repeat(20), name: 'Riya' });
    await t.hello('guest-b', null, { token: 'h'.repeat(20), name: 'Abcdefghijklmn' });
    await t.hello('guest-c', null, { token: 'i'.repeat(20), name: 'Abcdefghijklmn' });
    expect(t.room.engine!.s.players.map((p) => p.name)).toEqual(['Riya', 'riya 2', 'Riya 3', 'Abcdefghijklmn', 'Abcdefghijkl 2']);
  });

  it('a crew table: members sit with their account name; outsiders and ticket-less phones are refused', async () => {
    const t = setup();
    const host = await t.hello(RAHUL, t.pass(RAHUL, 'phone-r1', 'Rahul', [CREW]), { settings: { crew: CREW, startStack: 1500 } });
    expect(host.last('welcome')!.you).toBe(RAHUL);
    expect(t.room.crew).toBe(CREW);
    expect(t.room.engine!.s.cfg.startStack).toBe(1500);
    expect(t.room.engine!.player(RAHUL)!.name).toBe('Rahul'); // name from the account
    const out = await t.hello(STRANGER, t.pass(STRANGER, 'phone-s', 'Stranger', [OTHER_CREW]));
    expect(out.last('error')).toMatchObject({ code: 'not_allowed', message: 'This table is for crew members' });
    expect(out.closed).toBe('not_allowed');
    const anon = await t.hello('guest1', null, { token: 'g'.repeat(20), name: 'Guest' });
    expect(anon.last('error')!.message).toBe('This table is for crew members');
    const watcher = await t.hello('guest2', null, { spectate: true });
    expect(watcher.last('error')!.message).toBe('This table is for crew members'); // outsiders cannot watch either
    const riya = await t.hello(RIYA, t.pass(RIYA, 'phone-y', 'Riya', [CREW]));
    expect(riya.last('welcome')!.you).toBe(RIYA);
  });

  it('a ticket only seats its own account', async () => {
    const t = setup();
    const c = await t.hello(RIYA, t.pass(RAHUL, 'phone-r1', 'Rahul', []));
    expect(c.last('error')!.message).toBe('That seat belongs to another account');
  });

  it('an expired ticket gets a "ticket" error (the phone fetches a new one); a database failure says so', async () => {
    const t = setup();
    const c = await t.hello(RAHUL, 'not-a-real-ticket-at-all');
    expect(c.last('error')!.code).toBe('ticket');
    t.breakDb();
    const d = await t.hello(RAHUL, t.pass(RAHUL, 'p', 'Rahul', []));
    expect(d.last('error')!.code).toBe('server');
  });

  it('a phone that leaves while its ticket is being checked is simply forgotten', async () => {
    const t = setup();
    const c = new FakeConn();
    t.room.connect(c);
    t.room.message(c, JSON.stringify({ t: 'hello', v: 1, table: 'CREW1', player: RAHUL, lastSeq: 0, ticket: t.pass(RAHUL, 'p', 'Rahul', []) }));
    t.room.message(c, JSON.stringify({ t: 'hello', v: 1, table: 'CREW1', player: RAHUL, lastSeq: 0, ticket: t.pass(RAHUL, 'p', 'Rahul', []) }));
    expect(c.last('error')!.message).toBe('Already said hello');
    t.room.disconnect(c);
    await tick();
    expect(t.room.engine).toBeNull();
  });

  it('one seat per account: a second phone of the same account watches instead', async () => {
    const t = setup();
    const first = await t.hello(RAHUL, t.pass(RAHUL, 'phone-1', 'Rahul', []));
    await t.hello(RIYA, t.pass(RIYA, 'phone-y', 'Riya', []));
    const second = await t.hello(RAHUL, t.pass(RAHUL, 'phone-2', 'Rahul', []));
    expect(second.last('welcome')!.you).toBeNull(); // spectator
    expect(first.closed).toBeNull(); // the first phone keeps the seat
    expect(t.room.connInfo(first)).toEqual({ pid: RAHUL, hello: true });
    // the same phone reconnecting (same device) takes its seat back as usual
    const again = await t.hello(RAHUL, t.pass(RAHUL, 'phone-1', 'Rahul', []));
    expect(again.last('welcome')!.you).toBe(RAHUL);
    expect(first.closed).toBe('replaced');
  });

  it('a recovered account (new phone, same account) gets its seat and chips back', async () => {
    const t = setup();
    const old = await t.hello(RAHUL, t.pass(RAHUL, 'old-phone', 'Rahul', [CREW]), { settings: { crew: CREW } });
    const riya = await t.hello(RIYA, t.pass(RIYA, 'phone-y', 'Riya', [CREW]));
    let n = 0;
    t.room.message(old, JSON.stringify({ t: 'host', cmd: 'deal', actionId: `d${n++}` }));
    const e = t.room.engine!;
    const chair = e.player(RAHUL)!.chair;
    const stackBefore = e.player(RAHUL)!.stack;
    // the old phone dies mid-hand; the account is recovered on a new phone, which opens the same table
    t.room.disconnect(old);
    const fresh = await t.hello(RAHUL, t.pass(RAHUL, 'new-phone', 'Rahul', [CREW]));
    expect(fresh.last('welcome')!.you).toBe(RAHUL);
    expect(e.player(RAHUL)!.chair).toBe(chair);
    expect(e.player(RAHUL)!.stack).toBe(stackBefore);
    const v = fresh.last('welcome')!.view as unknown as { hand: { ps: Record<string, { cards: string[] | null }> } };
    expect(v.hand.ps[RAHUL]!.cards).toHaveLength(2); // its own cards, on the new phone
    expect(riya.closed).toBeNull();
    // the crew survives a restart of the table server
    const back = new TableRoom('CREW1', { now: () => t.now, schedule: () => {} }, { save: () => {}, appendHand: () => {} }, t.saves.at(-1)!, {});
    expect(back.crew).toBe(CREW);
  });
});
