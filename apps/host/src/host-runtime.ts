// The table server of the offline host phone. This file is bundled to one plain script and runs inside
// QuickJS in the Android host app (and inside Node for the tests, see node-host.ts). It is the very same
// TableRoom the online servers run; the app around it only moves bytes: sockets, files and a timer.
//
// The app provides `native` (see HostBridge.kt) and calls the exported functions below, always from one
// thread, one call at a time.
import { TableRoom, type Conn, type Persisted, type RoomOptions } from '@tp/table';

export interface Native {
  send(id: number, text: string): void;
  close(id: number, code: number, reason: string): void;
  /** Wake the table (call wake()) at this time; -1 cancels. */
  schedule(at: number): void;
  /** The whole table, to keep (write it atomically: a crash must never leave half a file). */
  save(json: string): void;
  appendHand(json: string): void;
  /** A finished hand or the end of the game, to upload to the league when this phone is online. */
  league(kind: string, id: string, payload: string): void;
  log(message: string): void;
}
declare const native: Native;

/** The room's own name. Phones find the table by the 5-digit code (the hotspot address), not by this. */
export const TABLE = 'OFFLINE';

let room: TableRoom | null = null;
/** Timings the tests shorten (the phone never sets these). */
let tuning: Pick<RoomOptions, 'handPauseMs' | 'shuffleWaitMs' | 'hostHandoverMs' | 'offlineAfterMs' | 'silentCloseMs'> = {};
const conns = new Map<number, Conn>();

function make(saved: Persisted | null): void {
  for (const id of [...conns.keys()]) { native.close(id, 4001, 'restart'); conns.delete(id); }
  room = new TableRoom(TABLE, {
    now: () => Date.now(),
    schedule: (at) => native.schedule(at === null ? -1 : at),
  }, {
    save: (p) => native.save(JSON.stringify(p)),
    appendHand: (h) => native.appendHand(JSON.stringify(h)),
    league: (kind, id, payload) => native.league(kind, id, JSON.stringify(payload)),
  }, saved, { offline: true, server: 'host', ...tuning });
  room.settleAfterRestart();
}

/** Start the table: from the saved file after a restart (or a new, empty table). */
export function start(savedJson: string, tuningJson = ''): string {
  if (tuningJson) tuning = JSON.parse(tuningJson) as typeof tuning;
  let saved: Persisted | null = null;
  if (savedJson) {
    try { saved = JSON.parse(savedJson) as Persisted; } catch (e) { native.log(`saved table unreadable: ${String(e)}`); }
  }
  make(saved);
  return room!.engine ? 'restored' : 'new';
}

/** Throw away the table (the host chose "New table"); the file is replaced on the next save. */
export function reset(): string {
  make(null);
  native.save('');
  return 'new';
}

/**
 * "Continue last table": another host phone died; this phone carries the night on from the checkpoint it
 * kept as a guest. `host` is this phone's player.
 */
export function continueFrom(checkpoint: string, host: string): string {
  const p = TableRoom.fromCheckpoint(checkpoint, host);
  make(p);
  native.save(JSON.stringify(room!.persisted() ?? p));
  return 'continued';
}

export function open(id: number): void {
  const c: Conn = { send: (t) => native.send(id, t), close: (code, reason) => native.close(id, code, reason) };
  conns.set(id, c);
  room!.connect(c);
}

export function message(id: number, text: string): void {
  const c = conns.get(id);
  if (c) room!.message(c, text);
}

export function closed(id: number): void {
  const c = conns.get(id);
  if (!c) return;
  conns.delete(id);
  room!.disconnect(c);
}

export function wake(): void { room?.wake(); }

/** For the host's screen and /info: players, phase, hand number, connections. */
export function stats(): string {
  if (!room) return '{}';
  const e = room.engine;
  return JSON.stringify({
    ...room.stats(), host: room.host,
    players: e ? e.s.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected, stack: p.stack })) : [],
    game: room.game?.id ?? null, ended: room.game?.ended ?? false,
  });
}
