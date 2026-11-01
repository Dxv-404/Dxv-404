-- Phase 3: accounts without sign-up, recovery codes, crew rescue, crews, invites, roles.
--
-- How identity works:
--   A phone signs in anonymously (Supabase Auth) and gets an auth user. That auth user is a *login*
--   for an *account* (our player). Recovering an account on a new phone adds the new phone's login to
--   the old account; nothing about tokens is ever handed out by the database.
--   Every check below uses private.me(): the account of the auth user making the request.
--
-- Phones never write tables directly except their own profile name and picture. Everything else goes
-- through the functions below, which check roles and limits. Row-level security is on for every table.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------- tables
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 20),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) < 4000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Each phone (anonymous auth user) is a login for exactly one account.
create table public.account_logins (
  auth_user uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index on public.account_logins (account_id);

-- Only a keyed hash of the code is kept.
create table private.recovery_codes (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now()
);

create table private.recovery_attempts (
  id bigint generated always as identity primary key,
  auth_user uuid not null,
  ip text,
  ok boolean not null,
  at timestamptz not null default now()
);
create index on private.recovery_attempts (auth_user, at);
create index on private.recovery_attempts (ip, at);

create table private.settings (key text primary key, value text not null);
insert into private.settings values ('code_pepper', encode(extensions.gen_random_bytes(32), 'hex'));

create type public.crew_role as enum ('owner', 'admin', 'member');

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#c9a227' check (color ~ '^#[0-9a-fA-F]{6}$'),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  house_rules jsonb not null default '{}'::jsonb check (pg_column_size(house_rules) < 4000),
  require_approval boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.crew_members (
  crew_id uuid not null references public.crews(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  role public.crew_role not null default 'member',
  status text not null default 'active' check (status in ('active', 'pending')),
  joined_at timestamptz not null default now(),
  primary key (crew_id, account_id)
);
create index on public.crew_members (account_id);
create unique index one_owner_per_crew on public.crew_members (crew_id) where role = 'owner';

create table public.crew_invites (
  code text primary key,
  crew_id uuid not null references public.crews(id) on delete cascade,
  created_by uuid references public.accounts(id) on delete set null,
  single_use boolean not null default false,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.crew_invites (crew_id);

-- Crew rescue: a new phone asks to be linked to an old account it says is its own; a crew admin decides.
create table public.rescue_requests (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews(id) on delete cascade,
  target_account uuid not null references public.accounts(id) on delete cascade,
  requester_auth uuid not null,
  requester_account uuid references public.accounts(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index on public.rescue_requests (crew_id, status);

-- What happened in a crew that members should be able to see (rescues, removals, role changes).
create table public.crew_audit (
  id bigint generated always as identity primary key,
  crew_id uuid not null references public.crews(id) on delete cascade,
  actor uuid references public.accounts(id) on delete set null,
  what text not null,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index on public.crew_audit (crew_id, at desc);

-- Short-lived tickets a phone shows a table server to prove which account it is.
create table private.table_tickets (
  token_hash text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  auth_user uuid not null,
  table_code text not null,
  expires_at timestamptz not null
);
create index on private.table_tickets (expires_at);

-- ---------------------------------------------------------------- helpers
-- The account of whoever is calling (null if this phone has no account yet).
create function private.me() returns uuid
language sql stable security definer set search_path = '' as $$
  select account_id from public.account_logins where auth_user = auth.uid()
$$;

create function private.need_me() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare a uuid := private.me();
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if a is null then raise exception 'No account yet' using errcode = 'P0002'; end if;
  return a;
end $$;

create function private.role_in(c uuid, a uuid) returns public.crew_role
language sql stable security definer set search_path = '' as $$
  select role from public.crew_members where crew_id = c and account_id = a and status = 'active'
$$;

create function private.is_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.crew_members where crew_id = c and account_id = private.me() and status = 'active')
$$;

create function private.need_admin(c uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare a uuid := private.need_me(); r public.crew_role := private.role_in(c, a);
begin
  if r is null or r = 'member' then raise exception 'Only a crew admin can do that' using errcode = '42501'; end if;
  return a;
end $$;

create function private.hash_code(code text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(regexp_replace(code, '\D', '', 'g'), (select value from private.settings where key = 'code_pepper'), 'sha256'), 'hex')
$$;

-- 12 random digits, never starting with 0 (so it is always 12 digits long when written down).
create function private.random_digits(n int) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare b bytea := extensions.gen_random_bytes(n * 2); s text := ''; d int; i int := 0;
begin
  while char_length(s) < n loop
    if i >= length(b) then b := extensions.gen_random_bytes(n * 2); i := 0; end if;
    d := get_byte(b, i); i := i + 1;
    if d >= 250 then continue; end if; -- keep it uniform
    d := d % 10;
    if s = '' and d = 0 then continue; end if;
    s := s || d::text;
  end loop;
  return s;
end $$;

create function private.request_ip() returns text
language sql stable set search_path = '' as $$
  select nullif(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), '')
$$;

-- Move everything one account owns to another, then remove the first. Same crew in both: keep the older
-- membership and the higher role.
create function private.merge_accounts(src uuid, dst uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  if src = dst then return; end if;
  for m in select * from public.crew_members where account_id = src loop
    if exists (select 1 from public.crew_members where crew_id = m.crew_id and account_id = dst) then
      update public.crew_members d set
        joined_at = least(d.joined_at, m.joined_at),
        status = case when d.status = 'active' or m.status = 'active' then 'active' else 'pending' end,
        role = case when 'owner' in (d.role, m.role) then 'owner'::public.crew_role
                    when 'admin' in (d.role, m.role) then 'admin'::public.crew_role else 'member'::public.crew_role end
      where d.crew_id = m.crew_id and d.account_id = dst;
      delete from public.crew_members where crew_id = m.crew_id and account_id = src;
    else
      update public.crew_members set account_id = dst where crew_id = m.crew_id and account_id = src;
    end if;
  end loop;
  update public.account_logins set account_id = dst where account_id = src;
  delete from public.accounts where id = src;
end $$;

-- ---------------------------------------------------------------- accounts
-- First open: make this phone's account (or return the one it has).
create function public.ensure_account(p_name text) returns public.accounts
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.me(); r public.accounts;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if a is null then
    insert into public.accounts (name) values (btrim(p_name)) returning id into a;
    insert into public.account_logins (auth_user, account_id) values (auth.uid(), a);
  else
    update public.account_logins set last_seen = now() where auth_user = auth.uid();
  end if;
  select * into r from public.accounts where id = a;
  return r;
end $$;

-- Make (or replace) the recovery code. The plain code is returned once and never stored.
create function public.new_recovery_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare a uuid := private.need_me(); code text; tries int := 0;
begin
  loop
    code := private.random_digits(12);
    begin
      insert into private.recovery_codes (account_id, code_hash) values (a, private.hash_code(code))
      on conflict (account_id) do update set code_hash = excluded.code_hash, created_at = now();
      exit;
    exception when unique_violation then -- the same 12 digits as someone else's code: draw again
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;
  return code;
end $$;

create function public.has_recovery_code() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.recovery_codes where account_id = private.me())
$$;

-- Type the code on a new phone: this phone becomes the old account. If this phone already has its own
-- account with things in it, merge (default) adds them to the old account; otherwise they are dropped.
-- At most 10 wrong codes per phone and per network an hour; then a 1-hour lock.
create function public.recover_account(p_code text, p_merge boolean default true) returns public.accounts
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); v_ip text := private.request_ip(); target uuid; mine uuid := private.me(); r public.accounts;
  fails int;
begin
  if me is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  select count(*) into fails from private.recovery_attempts
    where not ok and at > now() - interval '1 hour' and (recovery_attempts.auth_user = me or (v_ip is not null and recovery_attempts.ip = v_ip));
  if fails >= 10 then raise exception 'Too many wrong codes. Try again in an hour.' using errcode = '54000'; end if;
  select account_id into target from private.recovery_codes where code_hash = private.hash_code(p_code);
  if target is null or exists (select 1 from public.accounts where id = target and deleted_at is not null) then
    insert into private.recovery_attempts (auth_user, ip, ok) values (me, v_ip, false);
    return null; -- a wrong code: the caller shows "That code doesn't match an account"
  end if;
  insert into private.recovery_attempts (auth_user, ip, ok) values (me, v_ip, true);
  if mine is not null and mine <> target then
    if p_merge then
      perform private.merge_accounts(mine, target);
    else
      delete from public.account_logins where auth_user = me;
      delete from public.accounts a where a.id = mine and not exists (select 1 from public.account_logins l where l.account_id = mine);
    end if;
  end if;
  insert into public.account_logins (auth_user, account_id) values (me, target)
    on conflict (auth_user) do update set account_id = excluded.account_id, last_seen = now();
  select * into r from public.accounts where id = target;
  return r;
end $$;

-- "Log out my other phones": every other login of this account stops working.
create function public.logout_other_phones() returns int
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); n int;
begin
  delete from public.account_logins where account_id = a and auth_user <> auth.uid();
  get diagnostics n = row_count;
  delete from private.table_tickets where account_id = a and auth_user <> auth.uid();
  return n;
end $$;

-- Delete my account: the profile goes; crews keep a "Former player" so standings do not change.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); m record; heir uuid;
begin
  for m in select crew_id from public.crew_members where account_id = a and role = 'owner' loop
    select account_id into heir from public.crew_members
      where crew_id = m.crew_id and account_id <> a and status = 'active'
      order by (role = 'admin') desc, joined_at asc limit 1;
    if heir is null then delete from public.crews where id = m.crew_id; -- nobody left to own it
    else
      update public.crew_members set role = 'member' where crew_id = m.crew_id and account_id = a;
      update public.crew_members set role = 'owner' where crew_id = m.crew_id and account_id = heir;
      insert into public.crew_audit (crew_id, actor, what, detail) values (m.crew_id, a, 'ownership_passed', jsonb_build_object('to', heir));
    end if;
  end loop;
  update public.accounts set name = 'Former player', avatar_url = null, settings = '{}'::jsonb, deleted_at = now() where id = a;
  delete from public.account_logins where account_id = a;
  delete from private.recovery_codes where account_id = a;
end $$;

-- ---------------------------------------------------------------- crews
create function public.create_crew(p_name text, p_color text default '#c9a227', p_house_rules jsonb default '{}'::jsonb) returns public.crews
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); c public.crews;
begin
  if (select count(*) from public.crew_members where account_id = a) >= 10 then
    raise exception 'You can be in at most 10 crews' using errcode = '54000';
  end if;
  insert into public.crews (name, color, house_rules) values (btrim(p_name), p_color, coalesce(p_house_rules, '{}'::jsonb)) returning * into c;
  insert into public.crew_members (crew_id, account_id, role) values (c.id, a, 'owner');
  return c;
end $$;

-- An invite link code: 10 characters from an alphabet with no look-alikes.
create function public.create_invite(p_crew uuid, p_single_use boolean default false, p_days int default 7) returns text
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_admin(p_crew); alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text := ''; b bytea := extensions.gen_random_bytes(10); i int;
begin
  for i in 0..9 loop code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1); end loop;
  insert into public.crew_invites (code, crew_id, created_by, single_use, expires_at)
    values (code, p_crew, a, p_single_use, now() + make_interval(days => least(greatest(p_days, 1), 30)));
  return code;
end $$;

-- What an invite link shows before joining (crew name and colour, and member names for crew rescue).
create function public.invite_info(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i public.crew_invites; c public.crews;
begin
  select * into i from public.crew_invites where code = upper(p_code) and expires_at > now() and (not single_use or used_at is null);
  if i is null then return null; end if;
  select * into c from public.crews where id = i.crew_id;
  return jsonb_build_object('crew', c.id, 'name', c.name, 'color', c.color, 'members',
    (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name) order by a.name), '[]'::jsonb)
       from public.crew_members m join public.accounts a on a.id = m.account_id
      where m.crew_id = c.id and m.status = 'active' and a.deleted_at is null));
end $$;

create function public.join_crew(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); i public.crew_invites; c public.crews; st text;
begin
  select * into i from public.crew_invites where code = upper(p_code) for update;
  if i is null or i.expires_at <= now() or (i.single_use and i.used_at is not null) then
    raise exception 'This invite has expired' using errcode = 'P0002';
  end if;
  select * into c from public.crews where id = i.crew_id;
  if exists (select 1 from public.crew_members where crew_id = c.id and account_id = a) then
    return (select status from public.crew_members where crew_id = c.id and account_id = a);
  end if;
  if (select count(*) from public.crew_members where account_id = a) >= 10 then
    raise exception 'You can be in at most 10 crews' using errcode = '54000';
  end if;
  if (select count(*) from public.crew_members where crew_id = c.id) >= 60 then
    raise exception 'This crew is full (60 members)' using errcode = '54000';
  end if;
  st := case when c.require_approval then 'pending' else 'active' end;
  insert into public.crew_members (crew_id, account_id, role, status) values (c.id, a, 'member', st);
  if i.single_use then update public.crew_invites set used_at = now() where code = i.code; end if;
  return st;
end $$;

create function public.approve_member(p_crew uuid, p_account uuid, p_approve boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_admin(p_crew);
begin
  if p_approve then
    update public.crew_members set status = 'active', joined_at = now() where crew_id = p_crew and account_id = p_account and status = 'pending';
  else
    delete from public.crew_members where crew_id = p_crew and account_id = p_account and status = 'pending';
  end if;
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, case when p_approve then 'member_approved' else 'member_refused' end, jsonb_build_object('account', p_account));
end $$;

-- Admins remove members; nobody removes the owner; admins cannot remove other admins (the owner can).
create function public.remove_member(p_crew uuid, p_account uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_admin(p_crew); mine public.crew_role := private.role_in(p_crew, a); theirs public.crew_role := private.role_in(p_crew, p_account);
begin
  if theirs = 'owner' then raise exception 'The owner cannot be removed' using errcode = '42501'; end if;
  if theirs = 'admin' and mine <> 'owner' then raise exception 'Only the owner can remove an admin' using errcode = '42501'; end if;
  delete from public.crew_members where crew_id = p_crew and account_id = p_account;
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'member_removed', jsonb_build_object('account', p_account));
end $$;

create function public.set_role(p_crew uuid, p_account uuid, p_role public.crew_role) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  if private.role_in(p_crew, a) is distinct from 'owner' then raise exception 'Only the owner can change roles' using errcode = '42501'; end if;
  if p_account = a then raise exception 'Use transfer_ownership to hand the crew over' using errcode = '42501'; end if;
  if private.role_in(p_crew, p_account) is null then raise exception 'Not a member' using errcode = 'P0002'; end if;
  if p_role = 'owner' then
    update public.crew_members set role = 'admin' where crew_id = p_crew and account_id = a;
  end if;
  update public.crew_members set role = p_role where crew_id = p_crew and account_id = p_account;
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'role_changed', jsonb_build_object('account', p_account, 'role', p_role));
end $$;

create function public.transfer_ownership(p_crew uuid, p_account uuid) returns void
language sql security definer set search_path = '' as $$
  select public.set_role(p_crew, p_account, 'owner')
$$;

create function public.leave_crew(p_crew uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); heir uuid;
begin
  if private.role_in(p_crew, a) = 'owner' then
    select account_id into heir from public.crew_members where crew_id = p_crew and account_id <> a and status = 'active'
      order by (role = 'admin') desc, joined_at asc limit 1;
    if heir is null then delete from public.crews where id = p_crew; return; end if;
    delete from public.crew_members where crew_id = p_crew and account_id = a; -- step down first: one owner at a time
    update public.crew_members set role = 'owner' where crew_id = p_crew and account_id = heir;
    insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'ownership_passed', jsonb_build_object('to', heir));
    return;
  end if;
  delete from public.crew_members where crew_id = p_crew and account_id = a;
end $$;

create function public.update_crew(p_crew uuid, p_name text default null, p_color text default null, p_house_rules jsonb default null, p_require_approval boolean default null) returns public.crews
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_admin(p_crew); c public.crews;
begin
  update public.crews set
    name = coalesce(btrim(p_name), name), color = coalesce(p_color, color),
    house_rules = coalesce(p_house_rules, house_rules), require_approval = coalesce(p_require_approval, require_approval)
  where id = p_crew returning * into c;
  return c;
end $$;

create function public.delete_crew(p_crew uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  if private.role_in(p_crew, a) is distinct from 'owner' then raise exception 'Only the owner can delete the crew' using errcode = '42501'; end if;
  delete from public.crews where id = p_crew;
end $$;

-- ---------------------------------------------------------------- crew rescue
-- On a new phone, from the crew's invite link: "I'm already in this crew", pick your old name.
create function public.request_rescue(p_invite text, p_target uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); i public.crew_invites; v_id uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  select * into i from public.crew_invites where code = upper(p_invite) and expires_at > now();
  if i is null then raise exception 'This invite has expired' using errcode = 'P0002'; end if;
  if private.role_in(i.crew_id, p_target) is null then raise exception 'That player is not in this crew' using errcode = 'P0002'; end if;
  if private.me() = p_target then raise exception 'This phone is already that player' using errcode = '22023'; end if;
  if (select count(*) from public.rescue_requests where requester_auth = me and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Too many requests today' using errcode = '54000';
  end if;
  insert into public.rescue_requests (crew_id, target_account, requester_auth, requester_account)
    values (i.crew_id, p_target, me, private.me()) returning rescue_requests.id into v_id;
  insert into public.crew_audit (crew_id, actor, what, detail) values (i.crew_id, private.me(), 'rescue_requested', jsonb_build_object('request', v_id, 'for', p_target));
  return v_id;
end $$;

-- An admin answers "Is this Rahul's new phone?". Approving links the new phone to the old account; the
-- owner always sees it in the crew log. An admin cannot approve a rescue of their own account.
create function public.decide_rescue(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.rescue_requests; a uuid;
begin
  select * into q from public.rescue_requests where id = p_request for update;
  if q is null or q.status <> 'pending' then raise exception 'This request is no longer open' using errcode = 'P0002'; end if;
  a := private.need_admin(q.crew_id);
  if a = q.target_account then raise exception 'Another admin has to approve your own rescue' using errcode = '42501'; end if;
  update public.rescue_requests set status = case when p_approve then 'approved' else 'denied' end, decided_by = a, decided_at = now() where id = q.id;
  if p_approve then
    if q.requester_account is not null and q.requester_account <> q.target_account then
      perform private.merge_accounts(q.requester_account, q.target_account);
    end if;
    insert into public.account_logins (auth_user, account_id) values (q.requester_auth, q.target_account)
      on conflict (auth_user) do update set account_id = excluded.account_id, last_seen = now();
  end if;
  insert into public.crew_audit (crew_id, actor, what, detail) values (q.crew_id, a, case when p_approve then 'rescue_approved' else 'rescue_denied' end, jsonb_build_object('request', q.id, 'for', q.target_account));
end $$;

-- ---------------------------------------------------------------- table tickets
-- A phone asks for a ticket before joining a live table; the table server checks it with check_ticket.
create function public.table_ticket(p_table text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare a uuid := private.need_me(); t text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if p_table !~ '^[A-Z0-9]{4,12}$' then raise exception 'Bad table code' using errcode = '22023'; end if;
  delete from private.table_tickets where expires_at < now();
  insert into private.table_tickets (token_hash, account_id, auth_user, table_code, expires_at)
    values (encode(extensions.digest(t, 'sha256'), 'hex'), a, auth.uid(), p_table, now() + interval '12 hours');
  return t;
end $$;

-- For table servers (callable with the public key: knowing a ticket is the proof). Returns who it is,
-- which phone, and the crews they are an active member of.
create function public.check_ticket(p_token text, p_table text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t private.table_tickets;
begin
  select * into t from private.table_tickets
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and table_code = p_table and expires_at > now();
  if t is null then return null; end if;
  if not exists (select 1 from public.account_logins where auth_user = t.auth_user and account_id = t.account_id) then return null; end if;
  return jsonb_build_object(
    'account', t.account_id, 'device', t.auth_user,
    'name', (select name from public.accounts where id = t.account_id),
    'crews', (select coalesce(jsonb_agg(crew_id), '[]'::jsonb) from public.crew_members where account_id = t.account_id and status = 'active'));
end $$;

-- ---------------------------------------------------------------- row-level security
alter table public.accounts enable row level security;
alter table public.account_logins enable row level security;
alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.crew_invites enable row level security;
alter table public.rescue_requests enable row level security;
alter table public.crew_audit enable row level security;

-- Accounts: yourself, and anyone who shares an active crew with you.
create policy accounts_read on public.accounts for select to authenticated using (
  id = private.me() or exists (
    select 1 from public.crew_members mine join public.crew_members theirs on theirs.crew_id = mine.crew_id
    where mine.account_id = private.me() and mine.status = 'active' and theirs.account_id = accounts.id));
create policy accounts_update_own on public.accounts for update to authenticated using (id = private.me() and deleted_at is null) with check (id = private.me());

create policy logins_read_own on public.account_logins for select to authenticated using (account_id = private.me());

create policy crews_read on public.crews for select to authenticated using (private.is_member(id));
create policy members_read on public.crew_members for select to authenticated using (private.is_member(crew_id) or account_id = private.me());
create policy invites_read on public.crew_invites for select to authenticated using (private.role_in(crew_id, private.me()) in ('owner', 'admin'));
create policy rescue_read on public.rescue_requests for select to authenticated using (private.role_in(crew_id, private.me()) in ('owner', 'admin') or requester_auth = auth.uid());
create policy audit_read on public.crew_audit for select to authenticated using (private.is_member(crew_id));

-- Column rights: only name, picture and settings of your own account can be written directly.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.accounts, public.account_logins, public.crews, public.crew_members, public.crew_invites, public.rescue_requests, public.crew_audit to authenticated;
grant update (name, avatar_url, settings) on public.accounts to authenticated;

-- Functions: phones (signed in, anonymous included) may call the public ones; table servers call check_ticket
-- with the public key. Nothing in private is reachable from outside.
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated, anon; -- needed so policies can call the helpers
grant execute on function private.me(), private.is_member(uuid), private.role_in(uuid, uuid) to authenticated, anon;
grant execute on function
  public.ensure_account(text), public.new_recovery_code(), public.has_recovery_code(), public.recover_account(text, boolean),
  public.logout_other_phones(), public.delete_my_account(), public.create_crew(text, text, jsonb), public.create_invite(uuid, boolean, int),
  public.invite_info(text), public.join_crew(text), public.approve_member(uuid, uuid, boolean), public.remove_member(uuid, uuid),
  public.set_role(uuid, uuid, public.crew_role), public.transfer_ownership(uuid, uuid), public.leave_crew(uuid),
  public.update_crew(uuid, text, text, jsonb, boolean), public.delete_crew(uuid), public.request_rescue(text, uuid),
  public.decide_rescue(uuid, boolean), public.table_ticket(text)
  to authenticated;
grant execute on function public.check_ticket(text, text) to anon, authenticated;
