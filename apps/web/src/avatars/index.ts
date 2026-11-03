// Player avatars (the approved board, tools/design/avatars): the 72 drawn avatars a player can pick, shown in
// their own style wherever the player appears, whatever the theme. Players who pick none keep their initials.
//
// How they are drawn. Screens build their markup as strings and the table compares those strings to decide
// what to redraw, so an avatar is written as a small, always-identical placeholder
//     <span class="tpav" data-av="train-night-owl" aria-hidden="true"></span>
// and filled in the page: a watcher fills every placeholder that appears with the avatar's SVG, giving each copy
// its own ids (the drawings use clip paths, and two copies sharing an id would draw from each other). The set
// (230 KB) is loaded only when an avatar is first needed, so the menu does not wait for it.
import { isAvatarId, avatarFromStored, type AvatarId } from '@tp/protocol/avatars';
import type { AvatarArt } from './set';

export { isAvatarId, avatarFromStored, type AvatarId };
export type { AvatarArt };

let SET: Record<AvatarId, AvatarArt> | null = null;
let loading: Promise<Record<AvatarId, AvatarArt>> | null = null;

/** The whole set (names, kinds, drawings): loads it once. */
export function loadAvatars(): Promise<Record<AvatarId, AvatarArt>> {
  if (SET) return Promise.resolve(SET);
  if (!loading) {
    loading = import('./set').then((m) => {
      SET = m.AVATARS;
      if (typeof document !== 'undefined') fillIn(document.documentElement);
      return SET;
    }, (e: unknown) => { loading = null; throw e; });
  }
  return loading;
}
/** The set, if it has loaded. */
export const avatarSet = (): Record<AvatarId, AvatarArt> | null => SET;

/** The placeholder for a picked avatar (see above). `id` must be a known id. */
export function avatarMarkup(id: AvatarId): string {
  watch();
  return `<span class="tpav" data-av="${id}" aria-hidden="true"></span>`;
}

// ---------------------------------------------------------------- filling placeholders
let copies = 0;
const filled = new WeakSet<Element>();
/** An avatar's SVG with its ids made unique to this copy ("tpav-…" -> "tpav12-…", references too). */
export function uniqueCopy(svg: string): string {
  const n = ++copies;
  return svg.replace(/tpav-/g, `tpav${n}-`);
}
function fill(el: Element): void {
  const id = el.getAttribute('data-av');
  const first = el.firstElementChild;
  if (first && filled.has(first)) return; // filled already (a copy made by cloning is not in the set: refilled)
  if (!SET) { if (isAvatarId(id)) void loadAvatars().catch(() => {}); return; }
  const art = isAvatarId(id) ? SET[id] : undefined;
  if (!art) return;
  el.innerHTML = uniqueCopy(art.svg);
  if (el.firstElementChild) filled.add(el.firstElementChild);
}
function fillIn(root: Element | Document): void {
  if (root instanceof Element && root.matches('.tpav[data-av]')) fill(root);
  root.querySelectorAll('.tpav[data-av]').forEach(fill);
}
let watching = false;
function watch(): void {
  if (watching || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  watching = true;
  // (a microtask after each change, before the page is painted: placeholders never show empty once loaded)
  new MutationObserver((list) => {
    for (const m of list) for (const n of Array.from(m.addedNodes)) if (n.nodeType === 1) fillIn(n as Element);
  }).observe(document.documentElement, { childList: true, subtree: true });
  fillIn(document.documentElement);
}

// ---------------------------------------------------------------- this player's own pick
const KEY = 'tp-avatar';
const FOR = 'tp-avatar-for'; // the account the pick on this phone belongs to (none: picked as a guest)
type Acct = { profile: unknown; setAvatar(id: string | null): Promise<string | null> };
const get = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string | null): void => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/** The avatar this phone's player picked (signed in: as their account keeps it; guests: kept on the phone). */
export function myAvatar(): AvatarId | null {
  try { const v = JSON.parse(get(KEY) ?? 'null') as unknown; return isAvatarId(v) ? v : null; } catch { return null; }
}
function keepLocal(id: AvatarId | null, account: string | null): void {
  const changed = id !== myAvatar();
  put(KEY, id ? JSON.stringify(id) : null);
  put(FOR, account);
  if (changed && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tp-avatar', { detail: id }));
}
const profileOf = (a: Acct | null | undefined): { id?: string; avatar_url?: string | null } | null => (a?.profile ?? null) as { id?: string; avatar_url?: string | null } | null;

/**
 * A profile came from the cloud. Its avatar is this phone's, except when the phone has a pick made as a guest
 * and the account has none yet (the phone just made its profile, or signed in): then the pick goes up to it.
 */
export async function syncFromProfile(p: { id?: string; avatar_url?: string | null } | null | undefined, account?: Acct | null): Promise<AvatarId | null> {
  if (!p?.id) return myAvatar();
  const cloud = avatarFromStored(p.avatar_url);
  const local = myAvatar();
  if (!cloud && local && get(FOR) !== p.id && account) {
    try { const v = await account.setAvatar(local); keepLocal(avatarFromStored(v), p.id); } catch { /* offline: next time */ }
    return myAvatar();
  }
  keepLocal(cloud, p.id);
  return cloud;
}
/** Keeps a pick: on the account when the phone has one (the cloud checks it), otherwise on the phone. */
export async function chooseAvatar(id: AvatarId | null, account?: Acct | null): Promise<void> {
  if (id !== null && !isAvatarId(id)) throw new Error('Unknown avatar');
  const p = profileOf(account);
  if (account && p?.id) {
    const v = await account.setAvatar(id);
    keepLocal(avatarFromStored(v), p.id);
  } else keepLocal(id, null);
}
/** Starts loading the set early when this phone's player has one (called once the first screen is up). */
export function preloadMine(): void {
  if (myAvatar()) void loadAvatars().catch(() => {});
}
