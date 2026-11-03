// Avatars at the table: each player's pick travels in their hello, the room keeps it per player (only ids this
// build knows), puts it in everyone's view, keeps it across restarts and offline checkpoints; older apps that
// say nothing keep initials (or what the seat had).
import { describe, expect, it } from 'vitest';
import { encode, parseServer, type ClientMessage, type ServerMessage } from '@tp/protocol';
import { TableRoom, newSeatToken, type Conn, type Persisted } from '../src/room';
import { TableClient, type SocketLike, type Timers } from '../src/client';

class FakeConn implements Conn {
  inbox: ServerMessage[] = [];
  closed: string | null = null;
  send(text: string): void { const p = parseServer(text); if (!p.ok) throw new Error(p.error); this.inbox.push(p.msg); }
  close(_code: number, reason: string): void { this.closed = reason; }
  view(): { players: { id: string; avatar?: string }[] } {
    const m = [...this.inbox].reverse().find((x) => x.t === 'welcome' || x.t === 'update') as Extract<ServerMessage, { t: 'welcome' | 'update' }>;
    return m.view as unknown as { players: { id: string; avatar?: string }[] };
  }
  avatarOf(pid: string): string | undefined { return this.view().players.find((p) => p.id === pid)?.avatar; }
}

function setup(opts = {}, saved: Persisted | null = null) {
  const saves: Persisted[] = [];
  const clock = { now: () => 1000, schedule: () => {} };
  const store = { save: (p: Persisted) => saves.push(JSON.parse(JSON.stringify(p)) as Persisted), appendHand: () => {} };
  const room = new TableRoom('ABCD', clock, store, saved, { handPauseMs: 1000, ...opts });
  const tokens: Record<string, string> = {};
  const join = (pid: string, extra: Record<string, unknown> = {}) => {
    const c = new FakeConn();
    room.connect(c);
    tokens[pid] ??= newSeatToken();
    const host = !room.engine && !extra.spectate ? { settings: {} } : {};
    room.message(c, JSON.stringify({ t: 'hello', v: 1, table: 'ABCD', player: pid, lastSeq: 0, token: tokens[pid], name: pid.toUpperCase(), ...host, ...extra }));
    return c;
  };
  return { room, saves, join, clock, store, tokens };
}

describe('avatars at the table', () => {
  it('a player\'s pick is in their own view and in everyone else\'s, including watchers', () => {
    const t = setup();
    const a = t.join('a', { avatar: 'train-night-owl' });
    const b = t.join('b', { avatar: 'pixel-wizard' });
    const w = t.join('w', { spectate: true });
    expect(a.avatarOf('a')).toBe('train-night-owl');
    expect(a.avatarOf('b')).toBe('pixel-wizard'); // the join's update already carries it
    expect(b.avatarOf('a')).toBe('train-night-owl');
    expect(w.avatarOf('b')).toBe('pixel-wizard');
  });

  it('players with no pick, null (initials) or an older app have no avatar in the view', () => {
    const t = setup();
    const a = t.join('a');
    t.join('b', { avatar: null });
    expect(a.avatarOf('a')).toBeUndefined();
    expect(a.avatarOf('b')).toBeUndefined();
    expect('avatar' in a.view().players[0]!).toBe(false); // nothing added for them: the view is as before
  });

  it('an id this build does not know (a newer app) is shown as initials, not refused', () => {
    const t = setup();
    const a = t.join('a', { avatar: 'space-astronaut' });
    expect(a.closed).toBeNull();
    expect(a.avatarOf('a')).toBeUndefined();
  });

  it('a malformed avatar is refused with the hello', () => {
    const t = setup();
    t.join('a');
    for (const av of ['<img src=x onerror=alert(1)>', 'tp:train-night-owl', 'X', 12]) {
      const c = t.join(`p${Math.random().toString(36).slice(2, 8)}`, { avatar: av });
      const err = [...c.inbox].reverse().find((m) => m.t === 'error') as Extract<ServerMessage, { t: 'error' }> | undefined;
      expect(err?.code, String(av)).toBe('bad_message');
      expect(err?.message).toMatch(/avatar/);
      expect(c.inbox.some((m) => m.t === 'welcome')).toBe(false);
      expect(t.room.engine!.s.players.some((p) => p.id.startsWith('p'))).toBe(false);
    }
  });

  it('coming back with a new pick changes it for everyone; null goes back to initials; saying nothing keeps it', () => {
    const t = setup();
    const a = t.join('a', { avatar: 'train-night-owl' });
    t.join('b', { avatar: 'edo-samurai' });
    // b opens the table on another tab (the seat never went away) with a new pick: everyone is told at once
    t.join('b', { avatar: 'noir-detective' });
    expect(a.avatarOf('b')).toBe('noir-detective');
    t.join('b', { avatar: null });
    expect(a.avatarOf('b')).toBeUndefined();
    t.join('b', { avatar: 'ink-crane' });
    t.join('b'); // an older app: keeps it
    expect(a.avatarOf('b')).toBe('ink-crane');
  });

  it('a hello that cannot sit (table full) leaves no avatar behind', () => {
    const t = setup();
    t.join('a', { settings: { maxPlayers: 2 } });
    t.join('b');
    const c = t.join('c', { avatar: 'velvet-diamond' });
    expect(c.closed).toBe('table_full');
    expect(t.saves.at(-1)!.avatars?.c).toBeUndefined();
  });

  it('survives a restart (saved with the table) and drops ids it does not know when loading', () => {
    const t = setup();
    t.join('a', { avatar: 'cyber-hex-cat' });
    t.join('b', { avatar: 'ivory-swan' });
    const saved = t.saves.at(-1)!;
    expect(saved.avatars).toEqual({ a: 'cyber-hex-cat', b: 'ivory-swan' });
    saved.avatars!.b = 'not-real';
    const t2 = setup({}, saved);
    t2.tokens.a = t.tokens.a!;
    const a = t2.join('a');
    expect(a.avatarOf('a')).toBe('cyber-hex-cat');
    expect(a.avatarOf('b')).toBeUndefined();
  });

  it('offline: the checkpoint another phone carries the night on with keeps everyone\'s avatar', () => {
    const t = setup({ offline: true });
    t.join('a', { avatar: 'edo-lucky-koi' });
    t.join('b', { avatar: 'classic-dealer' });
    const cp = t.room.checkpoint()!;
    const carried = TableRoom.fromCheckpoint(cp.data, 'b');
    expect(carried.avatars).toEqual({ a: 'edo-lucky-koi', b: 'classic-dealer' });
  });
});

describe('the phone says which avatar it picked', () => {
  class FakeSocket implements SocketLike {
    sent: ClientMessage[] = [];
    onopen: ((ev: unknown) => void) | null = null;
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    onclose: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    send(text: string): void { this.sent.push(JSON.parse(text) as ClientMessage); }
    close(): void { /* nothing */ }
    push(m: ServerMessage): void { this.onmessage?.({ data: encode(m) }); }
  }
  const timers: Timers = { now: () => 1000, set: () => null, clear: () => {} };
  const helloWith = (avatar?: string | null) => {
    const sock = new FakeSocket();
    new TableClient({ url: 'ws://x', table: 'QK7P', player: 'acc', name: 'Dev', open: () => sock, timers, ...(avatar !== undefined ? { avatar } : {}) });
    sock.onopen?.({});
    return sock.sent[0] as Extract<ClientMessage, { t: 'hello' }>;
  };
  it('in its hello: an id, null for initials, or nothing at all', () => {
    expect(helloWith('train-night-owl').avatar).toBe('train-night-owl');
    expect(helloWith(null).avatar).toBeNull();
    expect('avatar' in helloWith()).toBe(false);
  });
});
