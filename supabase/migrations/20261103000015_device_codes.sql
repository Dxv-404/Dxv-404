-- v3: your account on every device. A device that is already your account makes a 6-digit one-time code
-- (or shows it as a QR); another device types or scans it and becomes your account too. Works in either
-- direction (phone to laptop, laptop to phone, phone to phone).
--
--   * the code works once, for 5 minutes; only a keyed hash of it is kept;
--   * making a new code cancels the account's older one;
--   * every wrong code counts against every open code: an open code that has had 5 wrong tries is cancelled
--     (so guessing one of a million codes gets 5 tries, never more);
--   * a device that types 5 wrong codes waits 10 minutes ("a short pause"); a network, 30 an hour;
--   * an account makes at most 10 codes an hour;
--   * the device that redeems a code can bring along what it had (its crews and games: merge, like
--     recover_account) or leave it behind; it is asked only when there is something to bring;
--   * the account's other devices are told (a push, and a notice in the app with "Not me? Log it out").
-- Devices also get a kind (phone, tablet, laptop), a short description ("Pixel 7 · Chrome") and a name the
-- player can change; table servers learn the device's name so "You're playing on your laptop" can say so.

-- ---------------------------------------------------------------- devices
alter table public.account_logins
  add column device_name text check (device_name is null or (char_length(device_name) between 1 and 30 and device_name = btrim(device_name) and device_name !~ '[[:cntrl:]​-‏‪-‮⁠-⁤﻿]')),
  add column device_kind text not null default 'phone' check (device_kind in ('phone', 'tablet', 'laptop')),
  add column device_detail text check (device_detail is null or char_length(device_detail) <= 60);

-- The device tells the cloud what it is (on every open; the app works it out from the browser).
create function public.set_this_device(p_kind text, p_detail text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.need_me();
  if p_kind not in ('phone', 'tablet', 'laptop') then raise exception 'Unknown kind of device' using errcode = '22023'; end if;
  update public.account_logins set device_kind = p_kind,
    device_detail = nullif(left(regexp_replace(btrim(coalesce(p_detail, '')), '[[:cntrl:]]', '', 'g'), 60), ''), last_seen = now()
  where auth_user = auth.uid();
end $$;

-- Every device signed in as me, the one asking first, then by when each was last used.
create function public.my_devices() returns table (device uuid, this_device boolean, name text, kind text, detail text, added timestamptz, last_seen timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.auth_user, l.auth_user = auth.uid(), l.device_name, l.device_kind, l.device_detail, l.created_at, l.last_seen
  from public.account_logins l where l.account_id = private.me()
  order by l.auth_user = auth.uid() desc, l.last_seen desc
$$;

-- Rename one of my devices (null or empty puts the plain name back: "Dev's laptop").
create function public.rename_device(p_device uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  update public.account_logins set device_name = nullif(btrim(coalesce(p_name, '')), '') where auth_user = p_device and account_id = a;
  if not found then raise exception 'That device is not on your account' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------- one-time codes
create table private.device_codes (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  made_by uuid not null,
  code_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  wrong int not null default 0,
  status text not null default 'open' check (status in ('open', 'used', 'cancelled')),
  used_by uuid,
  used_at timestamptz
);
-- two open codes never share six digits (a clash is drawn again)
create unique index device_codes_open_once on private.device_codes (code_hash) where status = 'open';
create index on private.device_codes (account_id, created_at);
create index on private.device_codes (code_hash);

create table private.device_code_attempts (
  id bigint generated always as identity primary key,
  auth_user uuid not null,
  ip text,
  ok boolean not null,
  at timestamptz not null default now()
);
create index on private.device_code_attempts (auth_user, at);
create index on private.device_code_attempts (ip, at);

-- Notices for the account's other devices ("Signed in on a new laptop"): each device dismisses its own.
create table private.device_notices (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  new_device uuid not null,
  kind text not null,
  detail text,
  at timestamptz not null default now(),
  dismissed_by uuid[] not null default '{}'
);
create index on private.device_notices (account_id, at);

-- pushes for new sign-ins (missing from a phone's choices = yes, like the others)
alter table private.push_outbox drop constraint push_outbox_kind_check;
alter table private.push_outbox add constraint push_outbox_kind_check check (kind in ('crew', 'trophies', 'devices'));

create function private.code_life() returns interval language sql immutable as $$ select interval '5 minutes' $$;

-- 6 digits, leading zeros allowed (always written as 6)
create function private.six_digits() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare b bytea := extensions.gen_random_bytes(8); n bigint := 0; i int;
begin
  for i in 0..7 loop n := (n * 256 + get_byte(b, i)) % 1000000000000; end loop;
  return lpad((n % 1000000)::text, 6, '0');
end $$;

-- "Add a device": a new code for my account. Any older open code of mine stops working.
create function public.new_device_code() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare a uuid := private.need_me(); code text; tries int := 0; exp timestamptz := now() + private.code_life();
begin
  perform private.need_settled();
  perform pg_advisory_xact_lock(hashtext('device-code:' || a::text));
  if (select count(*) from private.device_codes where account_id = a and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'That is a lot of codes. Wait a little, then make one more.' using errcode = '54000';
  end if;
  update private.device_codes set status = 'cancelled' where account_id = a and status = 'open';
  delete from private.device_codes where created_at < now() - interval '1 day';
  delete from private.device_code_attempts where at < now() - interval '1 day';
  loop
    code := private.six_digits();
    begin
      insert into private.device_codes (account_id, made_by, code_hash, expires_at) values (a, auth.uid(), private.hash_code(code), exp);
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 10 then raise; end if;
    end;
  end loop;
  return jsonb_build_object('code', code, 'expires_at', exp);
end $$;

-- "Cancel" on the code screen: my open code stops working now.
create function public.cancel_device_code() returns void
language sql security definer set search_path = '' as $$
  update private.device_codes set status = 'cancelled' where account_id = private.me() and status = 'open';
$$;

-- What a device has of its own (to ask "Bring them over / Leave them behind"), as a summary.
create function private.account_summary(a uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', (select name from public.accounts where id = a),
    'crews', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color, 'role', m.role,
        'members', (select count(*) from public.crew_members x where x.crew_id = c.id and x.status = 'active'),
        'games', (select count(*) from public.game_players gp join public.games g on g.id = gp.game_id where gp.account_id = a and g.crew_id = c.id))
        order by c.name)
      from public.crew_members m join public.crews c on c.id = m.crew_id where m.account_id = a and m.status = 'active'), '[]'::jsonb),
    'games', (select count(distinct game_id) from public.game_players where account_id = a),
    'trophies', (select count(*) from public.trophies where account_id = a))
$$;

-- Type (or scan) the code on the other device. p_merge: true = bring this device's own crews and games along,
-- false = leave them behind, null = ask first (answered with reason 'ask' and what there is, the code untouched).
-- Answers (never an error for a wrong code, so the try is counted):
--   {ok:true, account, moved:{crews,games,trophies}}   {ok:false, reason:'ask', mine:{...}}
--   {ok:false, reason:'wrong', tries_left}  'expired'  'cancelled'  'used'  'self'
create function public.redeem_device_code(p_code text, p_merge boolean default null, p_kind text default null, p_detail text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); v_ip text := private.request_ip(); mine uuid := private.me(); c private.device_codes; r public.accounts;
  fails int; digits text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g'); s jsonb; k text;
begin
  if me is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  fails := (select count(*) from private.device_code_attempts where not ok and auth_user = me and at > now() - interval '10 minutes');
  if fails >= 5 or (v_ip is not null and (select count(*) from private.device_code_attempts where not ok and ip = v_ip and at > now() - interval '1 hour') >= 30) then
    raise exception 'Too many wrong codes. Wait a few minutes, then try again.' using errcode = '54000';
  end if;
  if char_length(digits) <> 6 then return jsonb_build_object('ok', false, 'reason', 'wrong', 'tries_left', 5 - fails); end if;
  select * into c from private.device_codes where code_hash = private.hash_code(digits) order by (status = 'open') desc, created_at desc limit 1 for update;
  if c.id is null then
    insert into private.device_code_attempts (auth_user, ip, ok) values (me, v_ip, false);
    -- every open code took a wrong try; one that has had 5 is cancelled
    update private.device_codes set wrong = wrong + 1, status = case when wrong + 1 >= 5 then 'cancelled' else status end
      where status = 'open' and expires_at > now();
    return jsonb_build_object('ok', false, 'reason', 'wrong', 'tries_left', greatest(0, 4 - fails));
  end if;
  if c.status = 'used' then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
  if c.status = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'cancelled'); end if;
  if c.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if mine = c.account_id then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if exists (select 1 from public.accounts where id = c.account_id and deleted_at is not null) then
    update private.device_codes set status = 'cancelled' where id = c.id;
    return jsonb_build_object('ok', false, 'reason', 'cancelled');
  end if;
  if mine is not null then
    s := private.account_summary(mine);
    -- only ask when there is something to bring
    if p_merge is null and (jsonb_array_length(s -> 'crews') > 0 or (s ->> 'games')::int > 0) then
      return jsonb_build_object('ok', false, 'reason', 'ask', 'mine', s);
    end if;
    if coalesce(p_merge, true) then
      perform private.merge_accounts(mine, c.account_id);
    else
      delete from public.account_logins where auth_user = me;
      delete from public.accounts a where a.id = mine and not exists (select 1 from public.account_logins l where l.account_id = mine);
    end if;
  end if;
  insert into private.device_code_attempts (auth_user, ip, ok) values (me, v_ip, true);
  update private.device_codes set status = 'used', used_by = me, used_at = now() where id = c.id;
  k := case when p_kind in ('phone', 'tablet', 'laptop') then p_kind else 'phone' end;
  -- the code is the account's own key, handed over by one of its devices: fully trusted (no rescue wait)
  -- (clock time, not the transaction's: the new device sees notices of devices added after it, never before)
  insert into public.account_logins (auth_user, account_id, device_kind, device_detail, created_at) values (me, c.account_id, k, nullif(left(btrim(coalesce(p_detail, '')), 60), ''), clock_timestamp())
    on conflict (auth_user) do update set account_id = excluded.account_id, last_seen = now(), rescued_at = null,
      device_kind = excluded.device_kind, device_detail = excluded.device_detail, device_name = null, created_at = excluded.created_at;
  insert into private.device_notices (account_id, new_device, kind, detail, at) values (c.account_id, me, k, nullif(left(btrim(coalesce(p_detail, '')), 60), ''), clock_timestamp());
  perform private.queue_push(c.account_id, 'devices', 'Signed in on a new ' || k,
    'Your account was just opened on a new ' || k || '. Not you? Open Train Poker and log it out.', 'device-' || me, 'device:' || me || ':' || c.id);
  select * into r from public.accounts where id = c.account_id;
  s := private.account_summary(c.account_id);
  return jsonb_build_object('ok', true, 'account', to_jsonb(r),
    'moved', jsonb_build_object('crews', jsonb_array_length(s -> 'crews'), 'games', s -> 'games', 'trophies', s -> 'trophies'),
    -- the kind of device that made the code ("Your laptop got a notice too"), if it is still signed in
    'from', (select device_kind from public.account_logins where auth_user = c.made_by and account_id = c.account_id));
end $$;

-- Notices for this device: sign-ins on other devices of my account since this device joined it, not dismissed here.
create function public.my_device_notices() returns table (id bigint, device uuid, kind text, detail text, at timestamptz, still_signed_in boolean)
language sql stable security definer set search_path = '' as $$
  select n.id, n.new_device, n.kind, n.detail, n.at,
    exists (select 1 from public.account_logins x where x.auth_user = n.new_device and x.account_id = n.account_id)
  from private.device_notices n
  join public.account_logins l on l.auth_user = auth.uid() and l.account_id = n.account_id
  where n.new_device <> auth.uid() and n.at > l.created_at and n.at > now() - interval '7 days' and not (auth.uid() = any (n.dismissed_by))
  order by n.at desc limit 5
$$;

create function public.dismiss_device_notice(p_id bigint) returns void
language sql security definer set search_path = '' as $$
  update private.device_notices set dismissed_by = array_append(dismissed_by, auth.uid())
  where id = p_id and account_id = private.me() and not (auth.uid() = any (dismissed_by));
$$;

-- Table servers learn which device a ticket came from, and what it is called (for "You're playing on your laptop").
create or replace function public.check_ticket(p_token text, p_table text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t private.table_tickets; l public.account_logins;
begin
  select * into t from private.table_tickets
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and table_code = p_table and expires_at > now();
  if t is null then return null; end if;
  select * into l from public.account_logins where auth_user = t.auth_user and account_id = t.account_id;
  if l is null then return null; end if;
  return jsonb_build_object(
    'account', t.account_id, 'device', t.auth_user,
    'name', (select name from public.accounts where id = t.account_id),
    'crews', (select coalesce(jsonb_agg(crew_id), '[]'::jsonb) from public.crew_members where account_id = t.account_id and status = 'active'),
    'deviceKind', l.device_kind, 'deviceName', l.device_name);
end $$;

-- ---------------------------------------------------------------- rights
revoke all on table private.device_codes, private.device_code_attempts, private.device_notices from public, anon, authenticated;
revoke all on function private.code_life(), private.six_digits(), private.account_summary(uuid) from public, anon, authenticated;
revoke all on function public.set_this_device(text, text), public.my_devices(), public.rename_device(uuid, text), public.new_device_code(),
  public.cancel_device_code(), public.redeem_device_code(text, boolean, text, text), public.my_device_notices(), public.dismiss_device_notice(bigint)
  from public, anon, authenticated;
grant execute on function public.set_this_device(text, text), public.my_devices(), public.rename_device(uuid, text), public.new_device_code(),
  public.cancel_device_code(), public.redeem_device_code(text, boolean, text, text), public.my_device_notices(), public.dismiss_device_notice(bigint)
  to authenticated;
grant execute on function public.check_ticket(text, text) to anon, authenticated;
