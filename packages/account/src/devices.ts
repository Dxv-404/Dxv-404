// Your account on every device: the small pure pieces (codes, links, what kind of device this is, what a
// device is called). The calls to the database are on Account (index.ts).

export type DeviceKind = 'phone' | 'tablet' | 'laptop';

/** One device signed in as this account (my_devices). */
export interface Device { device: string; this_device: boolean; name: string | null; kind: DeviceKind; detail: string | null; added: string; last_seen: string }
/** A sign-in on another device of this account, shown on this one until dismissed (my_device_notices). */
export interface DeviceNotice { id: number; device: string; kind: DeviceKind; detail: string | null; at: string; still_signed_in: boolean }
/** What a device brings along, or what an account has (redeem_device_code's summaries). */
export interface AccountSummary { name: string; crews: { id: string; name: string; color: string; role: 'owner' | 'admin' | 'member'; members: number; games: number }[]; games: number; trophies: number }
export interface DeviceCode { code: string; expiresAt: number }

export type RedeemResult =
  | { ok: true; profile: import('./index').Profile; moved: { crews: number; games: number; trophies: number } }
  | { ok: false; reason: 'ask'; mine: AccountSummary }
  | { ok: false; reason: 'wrong'; triesLeft: number }
  | { ok: false; reason: 'expired' | 'cancelled' | 'used' | 'self' | 'paused' | 'error'; message: string };

/** A code is good for 5 minutes. */
export const CODE_LIFE_MS = 5 * 60_000;
/** Wrong codes a device may type before a short pause. */
export const CODE_TRIES = 5;

/** Only the digits, at most 6 (pasting "482 913" or "Code: 482-913" works). */
export const cleanDeviceCode = (s: string): string => s.replace(/\D/g, '').slice(0, 6);
/** "482913" as people read it out: "482 913". */
export const formatDeviceCode = (code: string): string => cleanDeviceCode(code).replace(/^(\d{3})(\d)/, '$1 $2');

/** The link a QR carries: a phone's own camera opens the app straight on the code. */
export const deviceLink = (base: string, code: string): string => `${base}#/d/${cleanDeviceCode(code)}`;
/** The code in a scanned QR or a link (#/d/482913), or null. */
export function codeFromLink(text: string): string | null {
  const m = /#\/d\/(\d{6})(?:$|[^\d])/.exec(text.trim());
  return m ? m[1]! : /^\d{6}$/.test(text.trim()) ? text.trim() : null;
}

/** "4:52" for the time a code has left. */
export function timeLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** What kind of device this browser is, and a short description of it ("Pixel 7 · Chrome", "Mac · Safari"). */
export function describeDevice(ua: string, touch = false, width = 1024): { kind: DeviceKind; detail: string } {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const android = /Android/.test(ua);
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch);
  let kind: DeviceKind;
  let os: string;
  if (/iPhone|iPod/.test(ua)) { kind = 'phone'; os = 'iPhone'; }
  else if (ipad) { kind = 'tablet'; os = 'iPad'; }
  else if (android) {
    kind = /Mobile/.test(ua) ? 'phone' : 'tablet';
    const model = /Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?\)/.exec(ua)?.[1]?.trim();
    os = model && model !== 'K' && !/^[a-z]{2}-[a-z]{2}$/i.test(model) ? model : 'Android';
  } else if (/Windows/.test(ua)) { kind = 'laptop'; os = 'Windows'; }
  else if (/Macintosh|Mac OS X/.test(ua)) { kind = 'laptop'; os = 'Mac'; }
  else if (/CrOS/.test(ua)) { kind = 'laptop'; os = 'Chromebook'; }
  else if (/Linux/.test(ua)) { kind = touch && width < 900 ? 'phone' : 'laptop'; os = 'Linux'; }
  else { kind = touch ? (width < 700 ? 'phone' : 'tablet') : 'laptop'; os = 'Device'; }
  return { kind, detail: `${os} · ${browser}`.slice(0, 60) };
}

/** What to call a device: its own name, else "Dev's laptop" (or "This phone" for the one in your hand). */
export function deviceLabel(d: Pick<Device, 'name' | 'kind' | 'this_device'>, owner: string): string {
  if (d.this_device) return `This ${d.kind}`;
  if (d.name) return d.name;
  return `${owner}’s ${d.kind}`;
}

/** "now", "2 min ago", "3 h ago", "yesterday", "5 days ago". */
export function lastUsed(at: string | number, now = Date.now()): string {
  const m = Math.floor((now - new Date(at).getTime()) / 60_000);
  if (m < 2) return 'now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
