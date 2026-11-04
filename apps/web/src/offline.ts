// Offline tables: one Android phone runs the Train Poker Host app on its hotspot; everyone plays in their
// browser, on a page the host phone serves (the hotspot has no internet).
//
// The installed app (https) cannot talk to the host phone (plain http) in the background, so it hands
// over: it opens http://<host>:8765/join#<who I am>. That page, served by the host phone, runs the table.
// Coming back later needs no typing: the app remembers the last code and does the same hand-over.
//
// If the host phone dies, every phone still holds the last checkpoint (the table between hands). Any phone
// with the host app turns on its hotspot, opens the app, and taps "Carry on with this phone"; the others
// type the new code. The hand that was cut off is gone; stacks are as before it.
import { myAvatar } from './avatars';
import type { OfflineClaim, TableSettings } from '@tp/protocol';
import { TableClient, newSeatToken, type SocketLike } from '@tp/table';
import { NetTable } from './net-table';

export const HOST_PORT = 8765;
const TABLE = 'OFFLINE';

/** Who this phone is at an offline table (kept by the installed app; travels in the hand-over link). */
export interface Me {
  role: 'host' | 'guest';
  id: string;
  name: string;
  token: string;
  claim?: OfflineClaim;
  settings?: TableSettings;
  /** Carrying on another host's night: its checkpoint. */
  continueFrom?: string;
}

const store = {
  get<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(k) ?? 'null') as T | null; } catch { return null; } },
  set(k: string, v: unknown): void { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } },
};

// ---------------- the 5-digit code ----------------
/** The hotspot address written as a number: 192.168.X.Y is X * 256 + Y (the host app shows it). */
export function codeToAddress(code: string): string | null {
  const d = code.replace(/\D/g, '');
  if (d.length !== 5) return null;
  const n = Number(d);
  if (n > 65535) return null;
  return `192.168.${Math.floor(n / 256)}.${n % 256}`;
}
export const formatCode = (code: string): string => `${code.slice(0, 2)} ${code.slice(2)}`;

// ---------------- in the installed app ----------------
/** This phone's identity for offline tables: the account if it has one (remembered from the last time it was online). */
export function myIdentity(): { id: string; name: string; token: string; claim?: OfflineClaim } {
  let token = store.get<string>('tp-offline-token');
  if (!token) { token = newSeatToken(); store.set('tp-offline-token', token); }
  const me = store.get<{ account: string; name: string }>('tp-me');
  if (me?.account) {
    let device = store.get<string>('tp-offline-device');
    if (!device) { device = `d${newSeatToken().slice(0, 16)}`; store.set('tp-offline-device', device); }
    const crews = (store.get<{ id: string }[]>('tp-crews') ?? []).map((c) => c.id).slice(0, 10);
    return { id: me.account, name: me.name, token, claim: { account: me.account, device, crews } };
  }
  let id = store.get<string>('tp-offline-id');
  if (!id) { id = `g${newSeatToken().slice(0, 12)}`; store.set('tp-offline-id', id); }
  return { id, name: localStorage.getItem('tp-name') || 'Player', token };
}

const encode = (me: Me): string => btoa(unescape(encodeURIComponent(JSON.stringify(me)))).replace(/=+$/, '');
const decode = (s: string): Me | null => { try { return JSON.parse(decodeURIComponent(escape(atob(s)))) as Me; } catch { return null; } };

/** The hand-over: open the table page on the host phone (this phone itself for the host). */
export function handOverUrl(me: Me, address = '127.0.0.1'): string {
  return `http://${address}:${HOST_PORT}/join#${encode(me)}`;
}

export function rememberLastOffline(v: { role: 'host' | 'guest'; code?: string; settings?: TableSettings }): void { store.set('tp-offline-last', { ...v, at: Date.now() }); }
export function lastOffline(): { role: 'host' | 'guest'; code?: string; settings?: TableSettings; at: number } | null { return store.get('tp-offline-last'); }

// ---------------- on the host phone's page ----------------
export const onHostPhonePage = (): boolean => location.port === String(HOST_PORT) && location.protocol === 'http:';

export interface HostInfo {
  host: true; code: string | null; addresses: string[]; outbox: number; upload?: string;
  table: { players?: { id: string; name: string; connected: boolean; stack: number }[]; handNo?: number; phase?: string; host?: string | null; game?: string | null; ended?: boolean };
  engine?: { conserved?: boolean; proofs?: boolean; sha?: boolean; hands?: number; ms?: number; pending?: boolean };
}
export const hostInfo = async (): Promise<HostInfo> => (await fetch('/info', { cache: 'no-store' })).json() as Promise<HostInfo>;

/** The page opened from the hand-over link: who this phone is (kept here for reloads, then removed from the address bar). */
export function takeHandOver(): Me | null {
  const fromLink = location.hash.length > 1 ? decode(location.hash.slice(1)) : null;
  if (fromLink) {
    store.set('tp-offline-me', fromLink);
    history.replaceState(null, '', location.pathname);
  }
  return fromLink ?? store.get<Me>('tp-offline-me');
}

/** Ask this phone's own host app to carry a night on from a checkpoint (only works on the phone itself). */
export async function carryOn(me: Me): Promise<void> {
  const r = await fetch('/continue', { method: 'POST', body: JSON.stringify({ checkpoint: me.continueFrom, player: me.id }) });
  const j = (await r.json()) as { ok?: string; error?: string };
  if (!r.ok || !j.ok) throw new Error(j.error ?? 'The host app could not carry the table on');
  delete me.continueFrom;
  store.set('tp-offline-me', me);
}

/** The table on the host phone's page, as a NetTable the table screen can draw. */
export function offlineTable(me: Me): NetTable {
  return new NetTable({
    me: me.id, offline: true,
    makeClient: (cb) => new TableClient({
      url: `ws://${location.host}/table/${TABLE}`, table: TABLE, player: me.id, token: me.token, name: me.name, avatar: myAvatar(),
      ...(me.role === 'host' && me.settings ? { settings: me.settings } : {}),
      ...(me.claim ? { claim: me.claim } : {}),
      open: (u) => new WebSocket(u) as unknown as SocketLike,
      checkpointHash: () => store.get<{ hash: string }>('tp-offline-cp')?.hash ?? null,
      onCheckpoint: (handNo, hash, data) => store.set('tp-offline-cp', { handNo, hash, data, game: (JSON.parse(data) as { game?: { id: string } }).game?.id ?? null, at: Date.now() }),
      ...cb,
    }),
  });
}

/** The checkpoint this phone holds (to carry the night on with this phone). */
export const heldCheckpoint = (): { handNo: number; hash: string; data: string } | null => store.get('tp-offline-cp');
