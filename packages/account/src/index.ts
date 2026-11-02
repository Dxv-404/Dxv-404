// The phone's account, with no sign-up. On first open the phone signs in anonymously and makes an
// account; the login lives in the phone's storage and everything else lives in the cloud. The recovery
// code (or a crew admin, through crew rescue) brings the account back on a wiped or new phone.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** The project the app talks to. The publishable key is meant to be public (it only allows what the
 * database's row-level security and functions allow). */
import { SUPABASE_KEY, SUPABASE_URL } from './ticket';
import { cleanDeviceCode, type AccountSummary, type Device, type DeviceCode, type DeviceKind, type DeviceNotice, type RedeemResult } from './devices';
export { SUPABASE_KEY, SUPABASE_URL };
export * from './devices';

export interface Profile { id: string; name: string; avatar_url: string | null; settings: Record<string, unknown>; created_at: string; deleted_at: string | null }
export type Role = 'owner' | 'admin' | 'member';
export interface Crew { id: string; name: string; color: string; avatar_url: string | null; house_rules: Record<string, unknown>; require_approval: boolean; role: Role; status: 'active' | 'pending' }
export interface Member { account_id: string; name: string; role: Role; status: 'active' | 'pending'; joined_at: string }
export interface InviteInfo { crew: string; name: string; color: string; members: { id: string; name: string }[] }
export interface GameRow { game_id: string; ended_at: string; crew_id: string | null; crew_name: string | null; table_code: string; players: number; hands: number; net: number | null; bb_won: number | null; place: number | null; casual: boolean; status: string }
export interface GamePlayer { player_key: string; account_id: string | null; name: string; buyins: number; final_chips: number | null; net: number | null; bb_won: number | null; place: number | null; points: number | null; hands: number; vpip: number; pfr: number; showdowns_won: number; biggest_pot: number; best_hand: number | null }
export interface Game { id: string; crew_id: string | null; season_id: string | null; table_code: string; casual: boolean; start_stack: number; big_blind: number; started_at: string; ended_at: string | null; status: string; void_reason: string | null; hands: number }
export interface LeagueRow { account_id: string; name: string; games: number; total_bb: number; avg_bb: number | null; points: number; wins: number; hands: number; vpip_pct: number | null; pfr_pct: number | null; showdowns_won: number; biggest_pot: number | null; best_hand: number | null }
export interface Season { id: string; name: string; starts_at: string; ends_at: string; closed_at: string | null }
export interface Trophy { id: number; account_id: string; kind: string; game_id: string | null; hand_no: number | null; season_id: string | null; at: string; detail: Record<string, unknown> }
export interface ResultChange { id: number; what: string; reason: string; detail: Record<string, unknown>; at: string; actor_name: string | null }
export interface PhoneLogin { phone: string; this_phone: boolean; added: string; last_seen: string }
export interface LogEntry { id: number; what: string; detail: Record<string, unknown>; at: string; actor_name: string | null }
export interface Rescue { id: string; crew_id: string; target_account: string; target_name?: string; status: string; created_at: string }
export type RecoverResult = { ok: true; profile: Profile } | { ok: false; reason: 'wrong' | 'locked' | 'error'; message: string };

/** Where the login is kept: browser localStorage, or anything with the same three methods. */
export interface KeyStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export interface PushPrefs { turn?: boolean; crewTable?: boolean; crew?: boolean; trophies?: boolean }

export class AccountError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}

/** Show the 12-digit code the way people read it out: 4821 0937 5562. */
export const formatCode = (code: string): string => code.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');

export class Account {
  readonly db: SupabaseClient;
  profile: Profile | null = null;

  constructor(opts: { url?: string; key?: string; storage?: KeyStore; fetch?: typeof fetch } = {}) {
    this.db = createClient(opts.url ?? SUPABASE_URL, opts.key ?? SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'tp-login', ...(opts.storage ? { storage: opts.storage } : {}) },
      ...(opts.fetch ? { global: { fetch: opts.fetch } } : {}),
    });
  }

  /** Signed in already (a login in storage)? */
  async hasLogin(): Promise<boolean> {
    const { data } = await this.db.auth.getSession();
    return !!data.session;
  }

  /** First open, or any open: make sure there is a login and an account, and load the profile. */
  async start(name: string): Promise<Profile> {
    if (!(await this.hasLogin())) {
      const { error } = await this.db.auth.signInAnonymously();
      if (error) throw new AccountError(error.message, error.code);
    }
    this.profile = await this.rpc<Profile>('ensure_account', { p_name: name });
    return this.profile;
  }

  async rename(name: string): Promise<Profile> {
    const { data, error } = await this.db.from('accounts').update({ name: name.trim() }).eq('id', this.need().id).select().single();
    if (error) throw new AccountError(error.message, error.code);
    return (this.profile = data as Profile);
  }

  // ---------------- recovery ----------------
  /** A new 12-digit code (shown once; the cloud keeps only a hash). Replaces any earlier code. */
  newRecoveryCode(): Promise<string> { return this.rpc<string>('new_recovery_code'); }
  hasRecoveryCode(): Promise<boolean> { return this.rpc<boolean>('has_recovery_code'); }

  /**
   * "Recover old account": this phone becomes the account the code belongs to. With merge (the default)
   * anything this phone already did under its own account is added to the old one; otherwise dropped.
   */
  async recover(code: string, merge = true): Promise<RecoverResult> {
    if (!(await this.hasLogin())) {
      const { error } = await this.db.auth.signInAnonymously();
      if (error) return { ok: false, reason: 'error', message: error.message };
    }
    const { data, error } = await this.db.rpc('recover_account', { p_code: code, p_merge: merge });
    if (error) return { ok: false, reason: error.code === '54000' ? 'locked' : 'error', message: error.message };
    const p = data as Profile | null;
    if (!p || !p.id) return { ok: false, reason: 'wrong', message: "That code doesn't match an account" };
    this.profile = p;
    return { ok: true, profile: p };
  }

  // ---------------- devices ----------------
  /** Every device signed in as this account: this one first, then by when each was last used. */
  myDevices(): Promise<Device[]> { return this.rpc<Device[]>('my_devices'); }
  /** Tell the cloud what this device is (kind and a short description); call after start(). */
  setThisDevice(kind: DeviceKind, detail: string): Promise<void> { return this.rpc('set_this_device', { p_kind: kind, p_detail: detail }); }
  /** Rename a device of this account (empty puts the plain name back). */
  renameDevice(device: string, name: string): Promise<void> { return this.rpc('rename_device', { p_device: device, p_name: name }); }

  /** "Add a device": a 6-digit code that works once, for 5 minutes. Any older code stops working. */
  async newDeviceCode(): Promise<DeviceCode> {
    const r = await this.rpc<{ code: string; expires_at: string }>('new_device_code');
    return { code: r.code, expiresAt: new Date(r.expires_at).getTime() };
  }
  cancelDeviceCode(): Promise<void> { return this.rpc('cancel_device_code'); }

  /**
   * "Use an account I already have": this device becomes the account the code belongs to. merge: true brings
   * this device's own crews and games along, false leaves them behind, null asks first when there is anything
   * (answered with reason 'ask' and what this device has; the code is not used up by asking).
   */
  async redeemDeviceCode(code: string, merge: boolean | null, device: { kind: DeviceKind; detail: string }): Promise<RedeemResult> {
    if (!(await this.hasLogin())) {
      const { error } = await this.db.auth.signInAnonymously();
      if (error) return { ok: false, reason: 'error', message: error.message };
    }
    const { data, error } = await this.db.rpc('redeem_device_code', { p_code: cleanDeviceCode(code), p_merge: merge, p_kind: device.kind, p_detail: device.detail });
    if (error) return { ok: false, reason: error.code === '54000' ? 'paused' : 'error', message: error.message };
    const r = data as { ok: boolean; reason?: string; tries_left?: number; mine?: AccountSummary; account?: Profile; moved?: { crews: number; games: number; trophies: number } };
    if (r.ok && r.account) {
      this.profile = r.account;
      return { ok: true, profile: r.account, moved: r.moved ?? { crews: 0, games: 0, trophies: 0 } };
    }
    switch (r.reason) {
      case 'ask': return { ok: false, reason: 'ask', mine: r.mine! };
      case 'wrong': return { ok: false, reason: 'wrong', triesLeft: r.tries_left ?? 0 };
      case 'expired': return { ok: false, reason: 'expired', message: 'This code ran out. Make a new one on your other device; it takes a second.' };
      case 'cancelled': return { ok: false, reason: 'cancelled', message: 'This code was cancelled (a new one was made, or too many wrong tries). Make a new one on your other device.' };
      case 'used': return { ok: false, reason: 'used', message: 'This code was already used. Make a new one on your other device.' };
      case 'self': return { ok: false, reason: 'self', message: 'This device is already your account.' };
      default: return { ok: false, reason: 'error', message: 'Something went wrong. Please try again.' };
    }
  }

  /** Sign-ins on this account's other devices since this one joined, not yet dismissed here. */
  deviceNotices(): Promise<DeviceNotice[]> { return this.rpc<DeviceNotice[]>('my_device_notices'); }
  dismissDeviceNotice(id: number): Promise<void> { return this.rpc('dismiss_device_notice', { p_id: id }); }

  logoutOtherPhones(): Promise<number> { return this.rpc<number>('logout_other_phones'); }
  /** The phones signed in to this account, most recently used first. */
  phones(): Promise<PhoneLogin[]> { return this.rpc<PhoneLogin[]>('my_phones'); }
  logoutPhone(phone: string): Promise<boolean> { return this.rpc<boolean>('logout_phone', { p_phone: phone }); }

  async deleteAccount(): Promise<void> {
    await this.rpc('delete_my_account');
    await this.db.auth.signOut({ scope: 'local' });
    this.profile = null;
  }

  // ---------------- crews ----------------
  async crews(): Promise<Crew[]> {
    const me = this.need().id;
    const { data, error } = await this.db.from('crew_members').select('role, status, crews(*)').eq('account_id', me);
    if (error) throw new AccountError(error.message, error.code);
    return (data as unknown as { role: Role; status: 'active' | 'pending'; crews: Omit<Crew, 'role' | 'status'> | null }[])
      .filter((r) => r.crews)
      .map((r) => ({ ...r.crews!, role: r.role, status: r.status }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async members(crewId: string): Promise<Member[]> {
    const { data, error } = await this.db.from('crew_members').select('account_id, role, status, joined_at, accounts(name)').eq('crew_id', crewId);
    if (error) throw new AccountError(error.message, error.code);
    return (data as unknown as (Omit<Member, 'name'> & { accounts: { name: string } | null })[])
      .map((m) => ({ account_id: m.account_id, role: m.role, status: m.status, joined_at: m.joined_at, name: m.accounts?.name ?? 'Former player' }))
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  }

  createCrew(name: string, color?: string, houseRules?: Record<string, unknown>): Promise<Crew> {
    return this.rpc<Crew>('create_crew', { p_name: name, ...(color ? { p_color: color } : {}), ...(houseRules ? { p_house_rules: houseRules } : {}) });
  }
  updateCrew(crewId: string, change: { name?: string; color?: string; houseRules?: Record<string, unknown>; requireApproval?: boolean }): Promise<Crew> {
    return this.rpc<Crew>('update_crew', { p_crew: crewId, p_name: change.name ?? null, p_color: change.color ?? null, p_house_rules: change.houseRules ?? null, p_require_approval: change.requireApproval ?? null });
  }
  createInvite(crewId: string, singleUse = false, days = 7): Promise<string> { return this.rpc<string>('create_invite', { p_crew: crewId, p_single_use: singleUse, p_days: days }); }
  inviteInfo(code: string): Promise<InviteInfo | null> { return this.rpc<InviteInfo | null>('invite_info', { p_code: code }); }
  joinCrew(code: string): Promise<'active' | 'pending'> { return this.rpc('join_crew', { p_code: code }); }
  approveMember(crewId: string, accountId: string, approve = true): Promise<void> { return this.rpc('approve_member', { p_crew: crewId, p_account: accountId, p_approve: approve }); }
  removeMember(crewId: string, accountId: string): Promise<void> { return this.rpc('remove_member', { p_crew: crewId, p_account: accountId }); }
  setRole(crewId: string, accountId: string, role: Role): Promise<void> { return this.rpc('set_role', { p_crew: crewId, p_account: accountId, p_role: role }); }
  leaveCrew(crewId: string): Promise<void> { return this.rpc('leave_crew', { p_crew: crewId }); }
  deleteCrew(crewId: string): Promise<void> { return this.rpc('delete_crew', { p_crew: crewId }); }

  // ---------------- crew rescue ----------------
  /** On a new phone, from a crew link: "I'm already in this crew" and pick your old name. */
  async requestRescue(invite: string, targetAccount: string): Promise<string> {
    if (!(await this.hasLogin())) {
      const { error } = await this.db.auth.signInAnonymously();
      if (error) throw new AccountError(error.message, error.code);
    }
    return this.rpc<string>('request_rescue', { p_invite: invite, p_target: targetAccount });
  }

  /** Requests an admin can answer ("Is this Rahul's new phone?"). */
  async pendingRescues(crewId: string): Promise<Rescue[]> {
    const { data, error } = await this.db.from('rescue_requests').select('id, crew_id, target_account, status, created_at, accounts!rescue_requests_target_account_fkey(name)').eq('crew_id', crewId).eq('status', 'pending');
    if (error) throw new AccountError(error.message, error.code);
    return (data as unknown as (Rescue & { accounts: { name: string } | null })[]).map((r) => ({ id: r.id, crew_id: r.crew_id, target_account: r.target_account, status: r.status, created_at: r.created_at, target_name: r.accounts?.name }));
  }
  decideRescue(requestId: string, approve: boolean): Promise<void> { return this.rpc('decide_rescue', { p_request: requestId, p_approve: approve }); }

  /**
   * The asking phone checks its own request: pending, approved (waiting until finishesAt: a day after the
   * player's own phones were last used, so they can say no), done or denied. Checking finishes it when due.
   */
  async rescueStatus(requestId: string): Promise<{ status: string; finishesAt: string | null } | null> {
    const r = await this.rpc<{ status: string; finishes_at: string | null } | null>('rescue_status', { p_request: requestId });
    return r ? { status: r.status, finishesAt: r.finishes_at } : null;
  }

  /** Requests from other phones to become this account (shown on this account's own phones, which can refuse them). */
  rescuesOfMe(): Promise<{ id: string; crew_id: string; crew_name: string; status: string; created_at: string; finishes_at: string | null }[]> {
    return this.rpc('rescues_of_me');
  }

  /** Nights played offline that I was in, uploaded and waiting for two players (or a crew admin) to confirm. */
  pendingOfflineGames(): Promise<{ game_id: string; ended_at: string; crew_name: string | null; players: number; hands: number; net: number | null; confirmed: boolean; confirmations: number }[]> {
    return this.rpc('pending_offline_games');
  }
  /** "Yes, I played this and the results are right." Returns 'ended' once the game counts, else 'pending'. */
  confirmOfflineGame(gameId: string): Promise<'ended' | 'pending'> { return this.rpc('confirm_offline_game', { p_game: gameId }); }
  /** "That wasn't me": my seat in an offline game becomes a guest's. */
  disputeOfflineSeat(gameId: string): Promise<void> { return this.rpc('dispute_offline_seat', { p_game: gameId }); }

  /** This phone's push subscription (Web Push) and which notifications it wants. */
  savePush(endpoint: string, p256dh: string, auth: string, prefs: PushPrefs): Promise<void> { return this.rpc('save_push', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_prefs: prefs }); }
  removePush(endpoint: string): Promise<void> { return this.rpc('remove_push', { p_endpoint: endpoint }); }
  myPush(endpoint: string): Promise<PushPrefs | null> { return this.rpc('my_push', { p_endpoint: endpoint }); }
  /** A warning for crew owners and admins (the free database filling up), or null. */
  serviceNotice(): Promise<string | null> { return this.rpc('service_notice'); }

  /** Withdraw every invite link of a crew (admins). */
  revokeInvites(crewId: string): Promise<number> { return this.rpc<number>('revoke_invites', { p_crew: crewId }); }

  /** What happened in the crew (rescues, removals, role changes), newest first. */
  async crewLog(crewId: string, limit = 20): Promise<LogEntry[]> {
    const { data, error } = await this.db.from('crew_audit').select('id, what, detail, at, accounts(name)').eq('crew_id', crewId).order('at', { ascending: false }).limit(limit);
    if (error) throw new AccountError(error.message, error.code);
    return (data as unknown as (Omit<LogEntry, 'actor_name'> & { accounts: { name: string } | null })[]).map((r) => ({ id: r.id, what: r.what, detail: r.detail, at: r.at, actor_name: r.accounts?.name ?? null }));
  }

  /** After crew rescue was approved, this phone is the old account: reload the profile. */
  async refresh(): Promise<Profile | null> {
    const { data } = await this.db.auth.getSession();
    if (!data.session) return (this.profile = null);
    const { data: rows, error } = await this.db.from('accounts').select('*').limit(50);
    if (error) throw new AccountError(error.message, error.code);
    const { data: logins } = await this.db.from('account_logins').select('account_id').eq('auth_user', data.session.user.id);
    const id = (logins as { account_id: string }[] | null)?.[0]?.account_id;
    return (this.profile = (rows as Profile[]).find((r) => r.id === id) ?? null);
  }

  // ---------------- history and league ----------------
  myGames(limit = 50, before?: string): Promise<GameRow[]> { return this.rpc<GameRow[]>('my_games', { p_limit: limit, p_before: before ?? null }); }

  async game(gameId: string): Promise<{ game: Game; players: GamePlayer[] } | null> {
    const [g, p] = await Promise.all([
      this.db.from('games').select('*').eq('id', gameId).maybeSingle(),
      this.db.from('game_players').select('*').eq('game_id', gameId),
    ]);
    if (g.error) throw new AccountError(g.error.message, g.error.code);
    if (p.error) throw new AccountError(p.error.message, p.error.code);
    if (!g.data) return null;
    const players = (p.data as GamePlayer[]).sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || (b.net ?? 0) - (a.net ?? 0));
    return { game: g.data as Game, players };
  }

  async hands(gameId: string): Promise<{ hand_no: number; pot: number; played_at: string }[]> {
    const { data, error } = await this.db.from('hands').select('hand_no, pot, played_at').eq('game_id', gameId).order('hand_no');
    if (error) throw new AccountError(error.message, error.code);
    return data as { hand_no: number; pot: number; played_at: string }[];
  }

  /** One hand's public replay (what everyone at the table saw), plus this player's own cards if they
   * were dealt in. Null if the replay has been cleared (replays are kept 90 days). */
  async hand(gameId: string, handNo: number): Promise<{ replay: unknown; myCards: string[] | null } | null> {
    const [h, c] = await Promise.all([
      this.db.from('hands').select('record').eq('game_id', gameId).eq('hand_no', handNo).maybeSingle(),
      this.db.from('hand_cards_private').select('cards').eq('game_id', gameId).eq('hand_no', handNo).maybeSingle(),
    ]);
    if (h.error) throw new AccountError(h.error.message, h.error.code);
    const replay = (h.data as { record: unknown } | null)?.record ?? null;
    if (!replay) return null;
    return { replay, myCards: (c.data as { cards: string[] } | null)?.cards ?? null };
  }

  /** The shuffle proof of a hand I was dealt into, once the game is over (null when older than 90 days). */
  handProof(gameId: string, handNo: number): Promise<{ dealerSeed: string; contributions: string[]; dealerSeedCommit: string | null; deckCommit: string } | null> {
    return this.rpc('hand_proof', { p_game: gameId, p_hand: handNo });
  }

  async seasons(crewId: string): Promise<Season[]> {
    const { data, error } = await this.db.from('seasons').select('id, name, starts_at, ends_at, closed_at').eq('crew_id', crewId).order('starts_at', { ascending: false });
    if (error) throw new AccountError(error.message, error.code);
    return data as Season[];
  }
  league(crewId: string, seasonId?: string): Promise<LeagueRow[]> { return this.rpc<LeagueRow[]>('league', { p_crew: crewId, p_season: seasonId ?? null }); }

  async crewGames(crewId: string, limit = 30): Promise<Game[]> {
    const { data, error } = await this.db.from('games').select('*').eq('crew_id', crewId).order('started_at', { ascending: false }).limit(limit);
    if (error) throw new AccountError(error.message, error.code);
    return data as Game[];
  }

  async trophies(filter: { crewId?: string; accountId?: string }): Promise<Trophy[]> {
    let q = this.db.from('trophies').select('id, account_id, kind, game_id, hand_no, season_id, at, detail').order('at', { ascending: false }).limit(100);
    if (filter.crewId) q = q.eq('crew_id', filter.crewId);
    if (filter.accountId) q = q.eq('account_id', filter.accountId);
    const { data, error } = await q;
    if (error) throw new AccountError(error.message, error.code);
    return data as Trophy[];
  }

  voidGame(gameId: string, reason: string): Promise<void> { return this.rpc('void_game', { p_game: gameId, p_reason: reason }); }
  adjustResult(gameId: string, from: string, to: string, chips: number, reason: string): Promise<void> {
    return this.rpc('adjust_result', { p_game: gameId, p_from: from, p_to: to, p_chips: chips, p_reason: reason });
  }
  async resultChanges(gameId: string): Promise<ResultChange[]> {
    const { data, error } = await this.db.from('result_changes').select('id, what, reason, detail, at, accounts(name)').eq('game_id', gameId).order('at');
    if (error) throw new AccountError(error.message, error.code);
    return (data as unknown as (Omit<ResultChange, 'actor_name'> & { accounts: { name: string } | null })[]).map((r) => ({ id: r.id, what: r.what, reason: r.reason, detail: r.detail, at: r.at, actor_name: r.accounts?.name ?? null }));
  }

  // ---------------- live tables ----------------
  /** A ticket for one table; the phone sends it in its hello and the table server checks it. */
  ticket(table: string): Promise<string> { return this.rpc<string>('table_ticket', { p_table: table }); }

  // ---------------- plumbing ----------------
  private need(): Profile {
    if (!this.profile) throw new AccountError('No account yet: call start() first');
    return this.profile;
  }

  private async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw new AccountError(error.message, error.code);
    return data as T;
  }
}

export { checkTicket, type TicketInfo } from './ticket';
