// v3 crews: what the Crews tab and the crew page read and change (supabase/migrations/20261103000014_crews_v3.sql),
// and the crew code rules shared by the screens: 6 characters, no 0/O or 1/I, shown with a dash after three.

export type Badge = 'shield' | 'hex' | 'round' | 'diamond';
export type WhoHosts = 'everyone' | 'admins' | 'leader';
export type SeasonMonths = 0 | 1 | 3 | 6;
export type CrewRole = 'owner' | 'admin' | 'member';
export interface Face { id: string; name: string }
export interface Usual { day: string; hour: number | null }
/** The crew's table running now (opened in the last hours and not finished). */
export interface LiveTable { table: string | null; mode: 'online' | 'offline' | 'qr'; since: string; rules: TableRules; host: string | null; faces: Face[] }
/** A crew's saved table rules (the host sheet fills them in). */
/** (the table settings a crew table is opened with: the same names the table servers take) */
export interface TableRules { startStack?: number; sb?: number; bb?: number; blindUpEvery?: number; turnTime?: number; timeBank?: number; rebuys?: boolean; maxRebuys?: number; maxPlayers?: number; straddle?: boolean; dealItTwice?: boolean }

export interface CrewCard {
  id: string; name: string; color: string; badge: Badge; role: CrewRole; members: number; faces: Face[];
  season: number | null; season_ends: string | null; seasons_on: boolean; next_season: number; rank: number | null;
  live: LiveTable | null; usual: Usual | null; requests: number;
}
export interface CrewPreview {
  found: true; id: string; name: string; color: string; badge: Badge; code: string; members: number; faces: Face[];
  season: number; seasons_on: boolean; games: number; usual_day: string | null; leader: Face | null; auto_admit: boolean;
  status: 'member' | 'pending' | null;
}
export interface WrongCode { found: false; tries_left: number; rest: number; code: string }
export interface JoinRequest { id: string; crew_id: string; name: string; color: string; badge: Badge; status: 'pending' | 'approved' | 'declined'; notify: boolean; asked_at: string; decided_at: string | null; leader: string | null }
export interface PendingRequest { id: string; account_id: string; name: string; asked_at: string; invited_by: string | null; plays_at: string | null }
export interface Invitation { crew_id: string; name: string; color: string; badge: Badge; code: string; invited_by: string | null; at: string; members: number; season: number | null; seasons_on: boolean }
export interface SeasonInfo { id: string; number: number; name: string; starts_at: string; ends_at: string | null; closed?: boolean }
export interface CrewSettings { id: string; name: string; color: string; badge: Badge; season_months: SeasonMonths; who_hosts: WhoHosts; members_invite: boolean; auto_admit: boolean; house_rules: TableRules; created_at?: string }
export interface CrewPage {
  crew: CrewSettings; role: CrewRole; can_host: boolean; can_invite: boolean;
  code: { code: string; made_at: string; uses: number } | null;
  members: number; leader: Face | null; season: SeasonInfo | null; next_season: number;
  seasons: { id: string; number: number; name: string; closed: boolean }[];
  me: { rank: number | null; bb: number | null; games: number; of: number; spark: number[] };
  podium: { account_id: string; name: string; bb: number; rank: number }[];
  last_game: { id: string; started_at: string; ended_at: string; players: number; winner: { id: string | null; name: string; bb: number | null } | null; mine: number | null; offline: boolean; table: string } | null;
  live: LiveTable | null; usual: Usual | null; requests: PendingRequest[]; disputes: number;
}
export interface LeagueRowV3 { account_id: string; name: string; games: number; bb: number; rank: number; trend: 'up' | 'down' | ''; member: boolean; me: boolean }
export interface CrewLeague { season: SeasonInfo | null; rows: LeagueRowV3[] }
export interface CrewGame { id: string; started_at: string; ended_at: string | null; table: string; status: 'ended' | 'void' | 'live'; offline: boolean; waiting: boolean; casual: boolean; hands: number; players: number; winner: { id: string | null; name: string; bb: number | null } | null; mine: number | null; trophy: boolean }
export interface CrewMemberV3 { account_id: string; name: string; role: CrewRole; joined_at: string; me: boolean; last_played: string | null; at_table: string | null; games: number; bb: number | null }
export interface PlayerCard {
  account_id: string; name: string; role: CrewRole | null; joined_at: string | null; member: boolean; first_season: number | null;
  season: number | null; rank: number | null; games: number; bb: number | null; hands: number; won: number;
  best: { rank: number; at: string; cards: string[] | null; board: string[] | null } | null; form: number[];
  trophies: { kind: string; at: string; season: number | null }[];
}
export interface Dispute { game_id: string; started_at: string; ended_at: string; table: string; players: number; at: string }
export interface Hosted { id: number; notified: number; season: number; seasons_on: boolean }

// ---------------------------------------------------------------- crew codes
/** Letters and numbers a crew code can have: no 0/O or 1/I (read out loud, typed on phones). */
export const CREW_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** What someone typed or pasted, as the boxes show it: capitals, only code characters, at most 6. */
export function cleanCrewCode(s: string): string {
  let out = '';
  for (const ch of s.toUpperCase()) if (CREW_CODE_ALPHABET.includes(ch) && out.length < 6) out += ch;
  return out;
}
export const isCrewCode = (s: string): boolean => /^[A-HJ-NP-Z2-9]{6}$/.test(s);
/** FNT4Q2 → FNT-4Q2 */
export const formatCrewCode = (s: string): string => (s.length > 3 ? `${s.slice(0, 3)}-${s.slice(3)}` : s);
/** The crew code in a pasted invite link (…#/c/FNT4Q2, …/c/FNT-4Q2?from=…) or a bare code; null if there is none. */
export function parseCrewLink(text: string): { code: string; from: string | null } | null {
  const t = text.trim();
  const m = /(?:#\/c\/|\/c\/)([A-Za-z0-9]{3}-?[A-Za-z0-9]{3})(?![A-Za-z0-9])(?:\?from=([0-9a-f-]{36}))?/.exec(t);
  if (m) { const code = cleanCrewCode(m[1]!); return isCrewCode(code) ? { code, from: m[2] ?? null } : null; }
  const bare = t.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z0-9]{6}$/.test(bare) && isCrewCode(bare) ? { code: bare, from: null } : null;
}
/** The link a crew code is shared as (opens the invitation). */
export const crewLink = (origin: string, code: string, from?: string | null): string => `${origin}#/c/${code}${from ? `?from=${from}` : ''}`;
/** "Too many wrong codes. Try again in 30 seconds." → 30 (else null). */
export function restSeconds(message: string): number | null {
  const m = /Try again in (\d+) seconds?/.exec(message);
  return m ? Number(m[1]) : null;
}
