-- Phase 3 review: gaps found by going through accounts and crews again.

-- 1. The wrong-code lock counted per network using the first x-forwarded-for address, which the caller
--    can set to anything. Use the address Cloudflare saw (cf-connecting-ip cannot be set by a caller), and
--    count IPv6 phones per /64 (one home or one phone gets a whole /64).
create or replace function private.request_ip() returns text
language plpgsql stable set search_path = '' as $$
declare h json := nullif(current_setting('request.headers', true), '')::json; ip text;
begin
  ip := coalesce(h ->> 'cf-connecting-ip', h ->> 'sb-forwarded-for');
  if ip is null or ip = '' then return null; end if;
  if position(':' in ip) > 0 then
    -- first four groups of the expanded address = the /64 network
    return array_to_string((string_to_array(split_part(ip, '::', 1), ':') || array['0','0','0','0'])[1:4], ':') || '::/64';
  end if;
  return ip;
end $$;

-- 2. Merge: if the phone's own account owned a crew the old account is also in, promoting the old
--    account before removing the other broke "one owner per crew". Remove first, then promote.
create or replace function private.merge_accounts(src uuid, dst uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m record; d record;
begin
  if src = dst then return; end if;
  for m in select * from public.crew_members where account_id = src loop
    select * into d from public.crew_members where crew_id = m.crew_id and account_id = dst;
    if found then
      delete from public.crew_members where crew_id = m.crew_id and account_id = src;
      update public.crew_members set
        joined_at = least(d.joined_at, m.joined_at),
        status = case when d.status = 'active' or m.status = 'active' then 'active' else 'pending' end,
        role = case when 'owner' in (d.role, m.role) then 'owner'::public.crew_role
                    when 'admin' in (d.role, m.role) then 'admin'::public.crew_role else 'member'::public.crew_role end
      where crew_id = m.crew_id and account_id = dst;
    else
      update public.crew_members set account_id = dst where crew_id = m.crew_id and account_id = src;
    end if;
  end loop;
  update public.account_logins set account_id = dst where account_id = src;
  delete from public.accounts where id = src;
end $$;

-- 3. Crew rescue merged the account the new phone had when it *asked*; by the time an admin answers that
--    phone may be another account. Use what the phone is now.
create or replace function public.decide_rescue(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.rescue_requests; a uuid; now_acc uuid;
begin
  select * into q from public.rescue_requests where id = p_request for update;
  if q is null or q.status <> 'pending' then raise exception 'This request is no longer open' using errcode = 'P0002'; end if;
  a := private.need_admin(q.crew_id);
  if a = q.target_account then raise exception 'Another admin has to approve your own rescue' using errcode = '42501'; end if;
  if exists (select 1 from public.accounts where id = q.target_account and deleted_at is not null) then
    raise exception 'That account was deleted' using errcode = 'P0002';
  end if;
  update public.rescue_requests set status = case when p_approve then 'approved' else 'denied' end, decided_by = a, decided_at = now() where id = q.id;
  if p_approve then
    select account_id into now_acc from public.account_logins where auth_user = q.requester_auth;
    if now_acc is not null and now_acc <> q.target_account then
      if (select count(*) from public.account_logins where account_id = now_acc) > 1 then
        -- that account is still used on other phones: only move this phone, keep the account
        delete from public.account_logins where auth_user = q.requester_auth;
      else
        perform private.merge_accounts(now_acc, q.target_account);
      end if;
    end if;
    insert into public.account_logins (auth_user, account_id) values (q.requester_auth, q.target_account)
      on conflict (auth_user) do update set account_id = excluded.account_id, last_seen = now();
  end if;
  insert into public.crew_audit (crew_id, actor, what, detail) values (q.crew_id, a, case when p_approve then 'rescue_approved' else 'rescue_denied' end, jsonb_build_object('request', q.id, 'for', q.target_account));
end $$;

-- 4. Someone waiting for approval could not see the crew they asked to join (name and colour).
create function private.has_membership(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.crew_members where crew_id = c and account_id = private.me())
$$;
revoke all on function private.has_membership(uuid) from public, anon, authenticated;
grant execute on function private.has_membership(uuid) to authenticated;
drop policy crews_read on public.crews;
create policy crews_read on public.crews for select to authenticated using (private.has_membership(id));

-- 5. Phones on my account: see them (when each was last used) and log out one you do not recognise.
--    After a crew rescue this is how the owner of an account notices a phone that should not be there.
create function public.my_phones() returns table (phone uuid, this_phone boolean, added timestamptz, last_seen timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.auth_user, l.auth_user = auth.uid(), l.created_at, l.last_seen
  from public.account_logins l where l.account_id = private.me() order by l.last_seen desc
$$;
create function public.logout_phone(p_phone uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  if p_phone = auth.uid() then raise exception 'Use Log out on this phone instead' using errcode = '22023'; end if;
  delete from private.table_tickets where account_id = a and auth_user = p_phone;
  delete from public.account_logins where account_id = a and auth_user = p_phone;
  return found;
end $$;
revoke all on function public.my_phones(), public.logout_phone(uuid) from public, anon, authenticated;
grant execute on function public.my_phones(), public.logout_phone(uuid) to authenticated;

-- 6. Names: not only spaces, no control or invisible formatting characters (they can make two names
--    look the same or break layouts). Pictures only from this project's storage.
alter table public.accounts drop constraint accounts_name_check;
alter table public.accounts add constraint accounts_name_check check (
  char_length(name) between 1 and 20 and name = btrim(name) and name !~ '[[:cntrl:]​-‏‪-‮⁠-⁤﻿]');
alter table public.crews drop constraint crews_name_check;
alter table public.crews add constraint crews_name_check check (
  char_length(name) between 1 and 40 and name = btrim(name) and name !~ '[[:cntrl:]​-‏‪-‮⁠-⁤﻿]');
alter table public.accounts add constraint accounts_avatar_here check (avatar_url is null or avatar_url like 'https://yghyartpurzwogtldzii.supabase.co/storage/v1/object/public/%');
alter table public.crews add constraint crews_avatar_here check (avatar_url is null or avatar_url like 'https://yghyartpurzwogtldzii.supabase.co/storage/v1/object/public/%');
-- a rename through the table trims like ensure_account does
create function private.trim_name() returns trigger language plpgsql set search_path = '' as $$
begin new.name := btrim(new.name); return new; end $$;
create trigger accounts_trim_name before insert or update of name on public.accounts for each row execute function private.trim_name();

-- 7. The crew log only records what actually happened; acting on someone who is not there is an error.
create or replace function public.approve_member(p_crew uuid, p_account uuid, p_approve boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_admin(p_crew);
begin
  if p_approve then
    update public.crew_members set status = 'active', joined_at = now() where crew_id = p_crew and account_id = p_account and status = 'pending';
  else
    delete from public.crew_members where crew_id = p_crew and account_id = p_account and status = 'pending';
  end if;
  if not found then raise exception 'Nobody is waiting with that name' using errcode = 'P0002'; end if;
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, case when p_approve then 'member_approved' else 'member_refused' end, jsonb_build_object('account', p_account));
end $$;

create or replace function public.remove_member(p_crew uuid, p_account uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_admin(p_crew); mine public.crew_role := private.role_in(p_crew, a); theirs public.crew_role;
begin
  select role into theirs from public.crew_members where crew_id = p_crew and account_id = p_account;
  if not found then raise exception 'Not a member' using errcode = 'P0002'; end if;
  if theirs = 'owner' then raise exception 'The owner cannot be removed' using errcode = '42501'; end if;
  if theirs = 'admin' and mine <> 'owner' then raise exception 'Only the owner can remove an admin' using errcode = '42501'; end if;
  delete from public.crew_members where crew_id = p_crew and account_id = p_account;
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'member_removed', jsonb_build_object('account', p_account));
end $$;

-- 8. Housekeeping so nothing grows without limit: at most 20 live table passes per account; failed-code
--    records older than a day are dropped (the lock only looks back one hour).
create or replace function public.table_ticket(p_table text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare a uuid := private.need_me(); t text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if p_table !~ '^[A-Z0-9]{4,12}$' then raise exception 'Bad table code' using errcode = '22023'; end if;
  delete from private.table_tickets where expires_at < now();
  delete from private.table_tickets where token_hash in (
    select token_hash from private.table_tickets where account_id = a order by expires_at desc offset 19);
  insert into private.table_tickets (token_hash, account_id, auth_user, table_code, expires_at)
    values (encode(extensions.digest(t, 'sha256'), 'hex'), a, auth.uid(), p_table, now() + interval '12 hours');
  return t;
end $$;

create or replace function private.forget_old_attempts() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if random() < 0.05 then delete from private.recovery_attempts where at < now() - interval '1 day'; end if;
  return null;
end $$;
create trigger recovery_attempts_tidy after insert on private.recovery_attempts for each statement execute function private.forget_old_attempts();

-- 9. Two first opens at the same moment (a double tap) made one fail; now both get the same account.
create or replace function public.ensure_account(p_name text) returns public.accounts
language plpgsql security definer set search_path = '' as $$
declare a uuid; r public.accounts;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  a := private.me();
  if a is null then
    insert into public.accounts (name) values (btrim(p_name)) returning id into a;
    insert into public.account_logins (auth_user, account_id) values (auth.uid(), a);
  else
    update public.account_logins set last_seen = now() where auth_user = auth.uid();
  end if;
  select * into r from public.accounts where id = a;
  return r;
end $$;

revoke all on function public.ensure_account(text), public.approve_member(uuid, uuid, boolean), public.remove_member(uuid, uuid),
  public.decide_rescue(uuid, boolean), public.table_ticket(text) from public, anon;
grant execute on function public.ensure_account(text), public.approve_member(uuid, uuid, boolean), public.remove_member(uuid, uuid),
  public.decide_rescue(uuid, boolean), public.table_ticket(text) to authenticated;
