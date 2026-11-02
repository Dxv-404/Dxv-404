// The phone's side of "one seat per player": told where the seat is, asking for it, and dropping taps
// that can no longer be played when the seat moves away.
import { describe, expect, it } from 'vitest';
import { encode, type ClientMessage, type ServerMessage } from '@tp/protocol';
import { TableClient, type SocketLike, type Timers } from '../src/client';

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
const VIEW = { phase: 'between', handNo: 0, players: [], cfg: {} };

function client() {
  const sock = new FakeSocket();
  const seen: string[] = [];
  const c = new TableClient({
    url: 'ws://x', table: 'QK7P', player: 'acc', open: () => sock, timers,
    onSeatElsewhere: (d) => seen.push(`elsewhere:${d.kind}:${d.name ?? ''}`),
    onSeatMoved: (d) => seen.push(`moved:${d.kind}:${d.name ?? ''}`),
  });
  sock.onopen?.({});
  sock.push({ t: 'welcome', v: 1, seq: 1, you: null, host: 'other', view: VIEW, serverTime: 1000 });
  return { c, sock, seen };
}

describe('one seat per player, on the phone', () => {
  it('is told where the seat is, and asks for it', () => {
    const { c, sock, seen } = client();
    sock.push({ t: 'seatElsewhere', device: { kind: 'laptop', name: 'Work Mac' } });
    expect(seen).toEqual(['elsewhere:laptop:Work Mac']);
    c.moveSeat();
    expect(sock.sent.at(-1)).toEqual({ t: 'moveSeat' });
  });

  it('when the seat moves away, taps still waiting are dropped (never played from two devices)', () => {
    const { c, sock, seen } = client();
    sock.push({ t: 'welcome', v: 1, seq: 2, you: 'acc', host: 'other', view: VIEW, serverTime: 1000 });
    c.send({ t: 'sit', out: true });
    expect(c.pending).toBe(1);
    sock.push({ t: 'seatMoved', device: { kind: 'phone', name: null } });
    expect(seen).toEqual(['moved:phone:']);
    expect(c.pending).toBe(0);
  });

  it('asks only while connected', () => {
    const { c, sock } = client();
    c.close();
    const n = sock.sent.length;
    c.moveSeat();
    expect(sock.sent.length).toBe(n);
  });
});
