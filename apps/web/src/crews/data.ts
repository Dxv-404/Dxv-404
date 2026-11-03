// The crews screens' way to the cloud: one Account for the app, made quietly the first time a player creates or
// joins a crew ("No sign-up": only a name). The menu's "Your crews" strip and the bottom bar's badge are kept on
// the phone so they show at once next time.
import type { Account, CrewCard, Invitation, JoinRequest } from '@tp/account';
import { ask } from '../legacy/ui.js';

let acct: Account | null = null;
let started: Promise<Account> | null = null;

async function load(): Promise<Account> {
  if (acct) return acct;
  const mod = await import('@tp/account');
  acct = new mod.Account();
  return acct;
}

const getName = (): string | null => { try { return localStorage.getItem('tp-name'); } catch { return null; } };
const keepMe = (a: Account): void => { try { localStorage.setItem('tp-me', JSON.stringify({ account: a.profile!.id, name: a.profile!.name })); } catch { /* storage blocked */ } void claimGuest(a); };

/** The games this phone played as a guest join its profile (once per profile; quietly, in the background). */
async function claimGuest(a: Account): Promise<void> {
  try {
    const guest = localStorage.getItem('tp-guest-id');
    const id = a.profile?.id;
    if (!guest || !id || localStorage.getItem('tp-guest-claimed') === id) return;
    await a.claimGuestGames(JSON.parse(guest) as string);
    localStorage.setItem('tp-guest-claimed', id);
  } catch { /* next time */ }
}
/** On every open: a phone with a profile and an unclaimed guest seat claims it. */
export async function claimGuestGames(): Promise<void> {
  try {
    if (!localStorage.getItem('tp-me') || !localStorage.getItem('tp-guest-id')) return;
    const me = JSON.parse(localStorage.getItem('tp-me')!) as { account?: string };
    if (localStorage.getItem('tp-guest-claimed') === me.account) return;
    const a = await existing();
    if (a) await claimGuest(a);
  } catch { /* offline: next time */ }
}

/** The account if this phone has one (null for a new player: nothing is made just by looking). */
export async function existing(): Promise<Account | null> {
  const a = await load();
  if (a.profile) return a;
  if (!(await a.hasLogin())) return null;
  if (!started) started = a.start(getName() || 'Player').then(() => { keepMe(a); return a; }).finally(() => { started = null; });
  return started;
}

/** The account, made now if needed: asks only for a name when this phone has none. Null if the player backs out. */
export async function ensure(): Promise<Account | null> {
  const a = await existing();
  if (a) return a;
  let name = getName();
  if (!name) {
    const n = await ask('Your name, so your crew knows who you are', { yes: 'Go on', input: { placeholder: 'Your name', max: 20 } });
    name = typeof n === 'string' ? n.trim().slice(0, 20) : '';
    if (!name) return null;
    try { localStorage.setItem('tp-name', name); } catch { /* blocked */ }
  }
  const b = await load();
  await b.start(name);
  keepMe(b);
  try { navigator.storage?.persist?.(); } catch { /* not offered */ }
  return b;
}

export interface Lists { crews: CrewCard[]; invites: Invitation[]; requests: JoinRequest[] }
let lists: Lists | null = null;
export const cachedLists = (): Lists | null => lists;
export const forget = (): void => { lists = null; };

/** Everything the Crews tab shows; also refreshes what the menu and the bottom bar keep. */
export async function fetchLists(a: Account): Promise<Lists> {
  const [crews, invites, requests] = await Promise.all([a.myCrews(), a.myInvitations().catch(() => []), a.myJoinRequests().catch(() => [])]);
  lists = { crews, invites, requests };
  try {
    localStorage.setItem('tp-crews', JSON.stringify(crews.map((c) => ({ id: c.id, name: c.name, count: c.members, season: c.seasons_on ? c.season ?? undefined : undefined, live: !!c.live, members: c.faces.slice(0, 4), color: c.color, badge: c.badge }))));
    localStorage.setItem('tp-crews-badge', String(invites.length + crews.reduce((n, c) => n + (c.requests || 0), 0)));
  } catch { /* storage blocked */ }
  return lists;
}

/** The number on the bottom bar's Crews tab (invitations, plus requests waiting for a leader or admin). */
export const navBadge = (): number => { try { return Number(localStorage.getItem('tp-crews-badge') || 0); } catch { return 0; } };
