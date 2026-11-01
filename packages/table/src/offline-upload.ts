// A night played on the offline host phone reaches the league through a table server: the host phone
// uploads what its table recorded, and the server checks every hand by replaying it with the rules engine
// before its own recorder signs it for the database. Nothing a phone sends is taken as it is: stats, nets,
// the public replay and each player's own cards are all worked out again here from the hand's inputs.
// The game then waits in the database until two of its players confirm it (see migration 12).
import { Engine, type HandRecord } from '@tp/engine';
import { handPlayers, publicReplay, slimRecord, type GameInfo } from './record';

export type Upload = { fn: 'record_hand' | 'record_game_end'; id: string; payload: unknown };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9_-]{1,64}$/;
/** An uploaded item is one hand or one game end; anything bigger is not one of ours. */
export const MAX_UPLOAD_BYTES = 96 * 1024;

const isInt = (x: unknown, min = 0, max = 1e9): x is number => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;

function gameInfo(g: unknown): GameInfo {
  const x = g as Partial<GameInfo> | null;
  if (!x || typeof x !== 'object') throw new Error('no game');
  if (typeof x.id !== 'string' || !UUID.test(x.id)) throw new Error('bad game id');
  if (x.crew !== null && (typeof x.crew !== 'string' || !UUID.test(x.crew))) throw new Error('bad crew');
  if (!isInt(x.startStack, 1) || !isInt(x.bigBlind, 1)) throw new Error('bad stakes');
  if (typeof x.startedAt !== 'string' || Number.isNaN(Date.parse(x.startedAt))) throw new Error('bad start time');
  // whatever the phone says, an uploaded night is an offline one
  return { id: x.id, crew: x.crew ?? null, table: 'OFFLINE', server: 'host', casual: !!x.casual, startStack: x.startStack, bigBlind: x.bigBlind, startedAt: new Date(x.startedAt).toISOString() };
}

/** Check one uploaded item; returns what the recorder should send, or throws with the reason. */
export function checkOfflineUpload(item: { id?: unknown; fn?: unknown; body?: unknown }): Upload {
  if (typeof item.body !== 'string' || item.body.length > MAX_UPLOAD_BYTES) throw new Error('missing or too large');
  const body = JSON.parse(item.body) as Record<string, unknown>;
  const game = gameInfo(body.game);
  if (item.fn === 'record_hand') {
    const hand = body.hand as { no?: unknown; full?: HandRecord; players?: { key: string; account: string | null }[] } | undefined;
    if (!hand || !isInt(hand.no, 1, 100_000) || !hand.full || !Array.isArray(hand.players)) throw new Error('bad hand');
    const rec = hand.full;
    if (rec.handNo !== hand.no || !rec.before || !Array.isArray(rec.inputs)) throw new Error('bad record');
    // replay the hand: it must be a real hand under the rules, and end exactly as recorded
    const replayed = Engine.replay(rec.before, rec.inputs).lastHandRecord;
    if (!replayed || replayed.handNo !== rec.handNo || JSON.stringify(replayed.results) !== JSON.stringify(rec.results)) throw new Error('the hand does not replay to its result');
    // account seats: an account plays under its own id (the table sets this; the claim is checked by confirmations)
    const claimed = new Map(hand.players.filter((p) => p && KEY.test(p.key) && typeof p.account === 'string' && UUID.test(p.account) && p.account === p.key).map((p) => [p.key, p.account!]));
    const { rows, pot } = handPlayers(replayed, (pid) => claimed.get(pid) ?? null);
    return {
      fn: 'record_hand', id: `${game.id}:${rec.handNo}`,
      payload: { game, hand: { no: rec.handNo, playedAt: new Date(replayed.endedAt).toISOString(), deckCommit: replayed.deckCommit, pot, replay: publicReplay(replayed), full: slimRecord(replayed), players: rows } },
    };
  }
  if (item.fn === 'record_game_end') {
    const players = body.players as { key?: unknown; account?: unknown; name?: unknown; buyins?: unknown; final?: unknown; minStack?: unknown }[];
    if (!Array.isArray(players) || !players.length || players.length > 40) throw new Error('bad players');
    const rows = players.map((p) => {
      if (typeof p.key !== 'string' || !KEY.test(p.key) || typeof p.name !== 'string' || p.name.length > 40 || !isInt(p.buyins) || !isInt(p.final) || !isInt(p.minStack)) throw new Error('bad player');
      const account = typeof p.account === 'string' && UUID.test(p.account) && p.account === p.key ? p.account : null;
      return { key: p.key, account, name: p.name, buyins: p.buyins, final: p.final, minStack: p.minStack };
    });
    if (rows.reduce((s, r) => s + r.final - r.buyins, 0) !== 0) throw new Error('final chips do not add up');
    const endedAt = typeof body.endedAt === 'string' && !Number.isNaN(Date.parse(body.endedAt)) ? new Date(body.endedAt as string).toISOString() : null;
    if (!endedAt) throw new Error('bad end time');
    return { fn: 'record_game_end', id: `${game.id}:end`, payload: { game, endedAt, players: rows } };
  }
  throw new Error('unknown kind');
}
