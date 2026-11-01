// The phone's account, with no sign-up. On first open the phone signs in anonymously and makes an
// account; the login lives in the phone's storage and everything else lives in the cloud. The recovery
// code (or a crew admin, through crew rescue) brings the account back on a wiped or new phone.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** The project the app talks to. The publishable key is meant to be public (it only allows what the
 * database's row-level security and functions allow). */
import { SUPABASE_KEY, SUPABASE_URL } from './ticket';
export { SUPABASE_KEY, SUPABASE_URL };

export interface Profile { id: string; name: string; avatar_url: string | null; settings: Record<string, unknown>; created_at: string; deleted_at: string | null }
export type Role = 'owner' | 'admin' | 'member';
export interface Crew { id: string; name: string; color: string; avatar_url: string | null; house_rules: Record<string, unknown>; require_approval: boolean; role: Role; status: 'active' | 'pending' }
export interface Member { account_id: string; name: string; role: Role; status: 'active' | 'pending'; joined_at: string }
export interface InviteInfo { crew: string; name: string; color: string; members: { id: string; name: string }[] }
export interface PhoneLogin { phone: string; this_phone: boolean; added: string; last_seen: string }
export interface LogEntry { id: number; what: string; detail: Record<string, unknown>; at: string; actor_name: string | null }
export interface Rescue { id: string; crew_id: string; target_account: string; target_name?: string; status: string; created_at: string }
export type RecoverResult = { ok: true; profile: Profile } | { ok: false; reason: 'wrong' | 'locked' | 'error'; message: string };

/** Where the login is kept: browser localStorage, or anything with the same three methods. */
export interface KeyStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

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

  /** The asking phone checks its own request: pending, approved or denied. */
  async rescueStatus(requestId: string): Promise<string | null> {
    const { data, error } = await this.db.from('rescue_requests').select('status').eq('id', requestId).maybeSingle();
    if (error) throw new AccountError(error.message, error.code);
    return (data as { status: string } | null)?.status ?? null;
  }

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
