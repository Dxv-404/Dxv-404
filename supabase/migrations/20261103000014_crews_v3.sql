-- v3 crews: the Crews tab and the crew page (tools/design/gen/v3crews.py, v3crew.py, v3sys.py).
--   * every crew has a 6-character code (no 0/O or 1/I) that the leader can replace at any time; typing a wrong
--     code five times in a minute rests the boxes for 30 seconds
--   * people ask to join with the code; the leader or an admin approves or declines (or the crew lets people in
--     by themselves); the person can be told by notification when they are in
--   * a crew has a badge (shield, hex, round, diamond) and a colour, a season length (1, 3 or 6 months, or none),
--     who may host its tables (everyone, admins, only the leader), whether members may invite, and saved table rules
--   * hosting a crew table tells the crew (push outbox) and shows a LIVE strip on the crew's card
--   * roles exactly as the roles table in v3sys.py: the leader (role 'owner') alone renames, changes the badge,
--     seasons and who hosts, makes admins, removes members, hands over and deletes (only when alone); a leader
--     leaves only after handing over; admins approve requests, host, correct results and void games
-- Everything is read through the functions below (security definer), each checking who is asking.

-- ---------------------------------------------------------------- crews: badge, seasons, hosting, inviting
alter table public.crews
  add column badge text not null default 'shield' check (badge in ('shield', 'hex', 'round', 'diamond')),
  add column season_months int not null default 3 check (season_months in (0, 1, 3, 6)),
  add column who_hosts text not null default 'everyone' check (who_hosts in ('everyone', 'admins', 'leader')),
  add column members_invite boolean not null default true;

-- ---------------------------------------------------------------- crew codes
-- Kept apart from the crew row so a member of a crew that does not let members invite never reads the code.
create table public.crew_codes (
  crew_id uuid primary key references public.crews(id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  made_at timestamptz not null default now(),
  uses int not null default 0 check (uses >= 0)
);
alter table public.crew_codes enable row level security;
revoke all on public.crew_codes from anon, authenticated;
grant select on public.crew_codes to authenticated;

-- typed codes, for resting the boxes after too many wrong ones
create table private.crew_code_tries (
  id bigint generated always as identity primary key,
  auth_user uuid not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create index on private.crew_code_tries (auth_user, at);

-- ---------------------------------------------------------------- join requests and invitations
create table public.crew_requests (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  notify boolean not null default true,
  invited_by uuid references public.accounts(id) on delete set null,
  asked_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.accounts(id) on delete set null
);
create unique index crew_requests_one_pending on public.crew_requests (crew_id, account_id) where status = 'pending';
create index on public.crew_requests (account_id);
alter table public.crew_requests enable row level security;
revoke all on public.crew_requests from anon, authenticated;
grant select on public.crew_requests to authenticated;

-- "Arjun invited you to Office Fridays": a crew link opened by someone not in the crew, sent by a member
create table public.crew_invitations (
  crew_id uuid not null references public.crews(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  invited_by uuid references public.accounts(id) on delete set null,
  code text not null,
  at timestamptz not null default now(),
  primary key (crew_id, account_id)
);
alter table public.crew_invitations enable row level security;
revoke all on public.crew_invitations from anon, authenticated;
grant select on public.crew_invitations to authenticated;

-- ---------------------------------------------------------------- crew tables (the LIVE strip)
create table public.crew_tables (
  id bigint generated always as identity primary key,
  crew_id uuid not null references public.crews(id) on delete cascade,
  table_code text check (table_code is null or table_code ~ '^[A-Z0-9]{4,6}$'),
  mode text not null check (mode in ('online', 'offline', 'qr')),
  rules jsonb not null default '{}'::jsonb check (pg_column_size(rules) < 2000),
  opened_by uuid references public.accounts(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
create index on public.crew_tables (crew_id, opened_at desc);
alter table public.crew_tables enable row level security;
revoke all on public.crew_tables from anon, authenticated;
grant select on public.crew_tables to authenticated;

-- ---------------------------------------------------------------- seasons: numbered
alter table public.seasons add column number int;
update public.seasons s set number = r.n from (select id, row_number() over (partition by crew_id order by starts_at) n from public.seasons) r where r.id = s.id;

-- table opened is a new kind of push from the outbox
alter table private.push_outbox drop constraint push_outbox_kind_check;
alter table private.push_outbox add constraint push_outbox_kind_check check (kind in ('crew', 'trophies', 'crewTable'));

-- ---------------------------------------------------------------- who is allowed
create function private.need_leader(c uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  if private.role_in(c, a) is distinct from 'owner' then raise exception 'Only the crew leader can do that' using errcode = '42501'; end if;
  return a;
end $$;

create function private.can_host(c uuid, a uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case (select who_hosts from public.crews where id = c)
    when 'everyone' then r is not null when 'admins' then r in ('owner', 'admin') else r = 'owner' end, false)
  from (select private.role_in(c, a) r) x
$$;

create function private.can_invite(c uuid, a uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(r in ('owner', 'admin') or (r = 'member' and (select members_invite from public.crews where id = c)), false)
  from (select private.role_in(c, a) r) x
$$;

create policy codes_read on public.crew_codes for select to authenticated using (private.can_invite(crew_id, (select private.me())));
create policy requests_read on public.crew_requests for select to authenticated
  using (account_id = (select private.me()) or private.role_in(crew_id, (select private.me())) in ('owner', 'admin'));
create policy invitations_read on public.crew_invitations for select to authenticated using (account_id = (select private.me()));
create policy crew_tables_read on public.crew_tables for select to authenticated using (private.is_member(crew_id));

-- ---------------------------------------------------------------- codes
create function private.random_crew_code() returns text
language plpgsql security definer set search_path = '' as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; k text; b bytea; i int;
begin
  loop
    k := ''; b := extensions.gen_random_bytes(6);
    for i in 0..5 loop k := k || substr(alphabet, (get_byte(b, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.crew_codes where crew_codes.code = k);
  end loop;
  return k;
end $$;

-- every crew has a code (crews made before v3 get theirs the first time anyone needs it)
create function private.ensure_code(c uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare k text := (select code from public.crew_codes where crew_id = c);
begin
  if k is null then
    insert into public.crew_codes (crew_id, code) values (c, private.random_crew_code()) on conflict (crew_id) do nothing;
    k := (select code from public.crew_codes where crew_id = c);
  end if;
  return k;
end $$;
select private.ensure_code(id) from public.crews;

-- a typed code as the boxes show it: capitals, no dash or spaces
create function private.clean_code(p text) returns text
language sql immutable set search_path = '' as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- Five wrong codes in a minute rest the boxes for 30 seconds. Returns the seconds still to rest (0 = go on)
-- and how many tries are left in this minute.
create function private.code_rest(u uuid, out rest int, out tries_left int)
language plpgsql security definer set search_path = '' as $$
declare n int; last timestamptz;
begin
  select count(*), max(at) into n, last from private.crew_code_tries where auth_user = u and not ok and at > now() - interval '60 seconds';
  tries_left := greatest(0, 5 - n);
  rest := case when n >= 5 then greatest(0, ceil(extract(epoch from (last + interval '30 seconds' - now())))::int) else 0 end;
end $$;

create function private.note_try(u uuid, good boolean) returns void
language sql security definer set search_path = '' as $$
  delete from private.crew_code_tries where auth_user = u and at < now() - interval '1 hour';
  insert into private.crew_code_tries (auth_user, ok) values (u, good);
$$;

-- the crew a code belongs to, or null (the wrong try is counted: callers return instead of raising, so it stays
-- counted). While the boxes rest it refuses without looking.
create function private.crew_by_code(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); k text := private.clean_code(p_code); c uuid; r record;
begin
  if u is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  select * into r from private.code_rest(u);
  if r.rest > 0 then raise exception 'Too many wrong codes. Try again in % seconds.', r.rest using errcode = '54000'; end if;
  select crew_id into c from public.crew_codes where code = k;
  perform private.note_try(u, c is not null);
  return c;
end $$;

-- ---------------------------------------------------------------- seasons of the crew's length
-- 3 months: the calendar quarter in India time (as before); 1 month: the month; 6 months: Jan–Jun, Jul–Dec;
-- off: one season that never ends ("All-time"). A season never overlaps another (one ended early, or the length
-- changed in between), and seasons are numbered in order.
create or replace function private.season_for(c uuid, at timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare months int := coalesce((select season_months from public.crews where id = c), 3);
  loc timestamp := at at time zone 'Asia/Kolkata'; s timestamptz; e timestamptz; nm text; sid uuid; prev timestamptz; nxt timestamptz; f0 timestamp;
begin
  select id into sid from public.seasons where crew_id = c and starts_at <= at and ends_at > at order by starts_at desc limit 1;
  if sid is not null then return sid; end if;
  if months = 0 then
    s := date_trunc('day', loc) at time zone 'Asia/Kolkata'; e := 'infinity'; nm := 'All-time';
  else
    f0 := date_trunc('month', loc) - make_interval(months => ((extract(month from loc)::int - 1) % months));
    s := f0 at time zone 'Asia/Kolkata'; e := (f0 + make_interval(months => months)) at time zone 'Asia/Kolkata';
    nm := case when months = 1 then to_char(f0, 'Mon YYYY') else to_char(f0, 'Mon') || '–' || to_char(f0 + make_interval(months => months) - interval '1 day', 'Mon YYYY') end;
  end if;
  select max(ends_at) into prev from public.seasons where crew_id = c and starts_at <= at;
  if prev is not null and prev > s then s := prev; end if;
  select min(starts_at) into nxt from public.seasons where crew_id = c and starts_at > at;
  if nxt is not null and nxt < e then e := nxt; end if;
  insert into public.seasons (crew_id, name, starts_at, ends_at) values (c, nm, s, e)
    on conflict (crew_id, starts_at) do nothing returning seasons.id into sid;
  if sid is null then select seasons.id into sid from public.seasons where crew_id = c and starts_at = s; end if;
  update public.seasons x set number = r.n from (select id, row_number() over (order by starts_at) n from public.seasons where crew_id = c) r
    where r.id = x.id and x.number is distinct from r.n;
  return sid;
end $$;

-- ---------------------------------------------------------------- leader-only changes (roles table)
create or replace function public.update_crew(p_crew uuid, p_name text default null, p_color text default null, p_house_rules jsonb default null, p_require_approval boolean default null)
returns public.crews language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_leader(p_crew); c public.crews;
begin
  update public.crews set
    name = coalesce(btrim(p_name), name), color = coalesce(p_color, color),
    house_rules = coalesce(p_house_rules, house_rules), require_approval = coalesce(p_require_approval, require_approval)
  where id = p_crew returning * into c;
  return c;
end $$;

create or replace function public.remove_member(p_crew uuid, p_account uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); theirs public.crew_role;
begin
  select role into theirs from public.crew_members where crew_id = p_crew and account_id = p_account;
  if private.role_in(p_crew, a) is null then raise exception 'Only the crew leader can do that' using errcode = '42501'; end if;
  if theirs is null then raise exception 'Not a member' using errcode = 'P0002'; end if;
  if theirs = 'owner' then raise exception 'The leader cannot be removed' using errcode = '42501'; end if;
  if private.role_in(p_crew, a) <> 'owner' then raise exception 'Only the crew leader can remove members' using errcode = '42501'; end if;
  delete from public.crew_members where crew_id = p_crew and account_id = p_account;
  delete from public.crew_invites where crew_id = p_crew;
  update public.rescue_requests set status = 'denied', decided_by = a, decided_at = now() where crew_id = p_crew and target_account = p_account and status in ('pending', 'approved');
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'member_removed', jsonb_build_object('account', p_account));
end $$;

-- a leader leaves only after handing over; alone, leaving closes the crew
create or replace function public.leave_crew(p_crew uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  if private.role_in(p_crew, a) = 'owner' then
    if exists (select 1 from public.crew_members where crew_id = p_crew and account_id <> a and status = 'active') then
      raise exception 'Hand over leadership before you leave' using errcode = '42501';
    end if;
    delete from public.crews where id = p_crew;
    return;
  end if;
  delete from public.crew_members where crew_id = p_crew and account_id = a;
  update public.crew_requests set status = 'cancelled', decided_at = now() where crew_id = p_crew and account_id = a and status = 'pending';
end $$;

create or replace function public.delete_crew(p_crew uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_leader(p_crew);
begin
  perform private.need_settled();
  if exists (select 1 from public.crew_members where crew_id = p_crew and account_id <> a) then
    raise exception 'A crew can be deleted only by its last member' using errcode = '42501';
  end if;
  delete from public.crews where id = p_crew;
end $$;

-- crews made the old way get a code too
create or replace function public.create_crew(p_name text, p_color text default '#c9a227', p_house_rules jsonb default '{}'::jsonb) returns public.crews
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); c public.crews;
begin
  if (select count(*) from public.crew_members where account_id = a) >= 10 then
    raise exception 'You can be in at most 10 crews' using errcode = '54000';
  end if;
  insert into public.crews (name, color, house_rules) values (btrim(p_name), p_color, coalesce(p_house_rules, '{}'::jsonb)) returning * into c;
  insert into public.crew_members (crew_id, account_id, role) values (c.id, a, 'owner');
  perform private.ensure_code(c.id);
  return c;
end $$;

-- ---------------------------------------------------------------- create
-- "New crew": name (up to 24), badge, colour, seasons on or off. People ask to join; the leader lets them in
-- (the "let people in by themselves" switch on the next screen turns that off).
create function public.create_crew_v3(p_name text, p_badge text default 'shield', p_color text default '#c0392b', p_seasons boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); c public.crews; n text := btrim(coalesce(p_name, ''));
begin
  if char_length(n) < 1 or char_length(n) > 24 then raise exception 'A crew name is 1 to 24 characters' using errcode = '22023'; end if;
  if (select count(*) from public.crew_members where account_id = a) >= 10 then
    raise exception 'You can be in at most 10 crews' using errcode = '54000';
  end if;
  insert into public.crews (name, color, badge, season_months, require_approval)
    values (n, p_color, coalesce(p_badge, 'shield'), case when coalesce(p_seasons, true) then 3 else 0 end, true) returning * into c;
  insert into public.crew_members (crew_id, account_id, role) values (c.id, a, 'owner');
  return jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color, 'badge', c.badge, 'code', private.ensure_code(c.id),
    'season_months', c.season_months, 'auto_admit', not c.require_approval);
end $$;

-- ---------------------------------------------------------------- the crew's settings (leader)
create function public.crew_settings(p_crew uuid, p_name text default null, p_badge text default null, p_color text default null,
  p_season_months int default null, p_who_hosts text default null, p_members_invite boolean default null, p_auto_admit boolean default null,
  p_house_rules jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_leader(p_crew); c public.crews;
begin
  if p_name is not null and char_length(btrim(p_name)) not between 1 and 24 then raise exception 'A crew name is 1 to 24 characters' using errcode = '22023'; end if;
  update public.crews set
    name = coalesce(btrim(p_name), name), badge = coalesce(p_badge, badge), color = coalesce(p_color, color),
    season_months = coalesce(p_season_months, season_months), who_hosts = coalesce(p_who_hosts, who_hosts),
    members_invite = coalesce(p_members_invite, members_invite), require_approval = coalesce(not p_auto_admit, require_approval),
    house_rules = coalesce(p_house_rules, house_rules)
  where id = p_crew returning * into c;
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'settings_changed', jsonb_strip_nulls(jsonb_build_object(
    'name', p_name, 'badge', p_badge, 'color', p_color, 'season_months', p_season_months, 'who_hosts', p_who_hosts,
    'members_invite', p_members_invite, 'auto_admit', p_auto_admit, 'rules', case when p_house_rules is not null then true end)));
  return jsonb_build_object('id', c.id, 'name', c.name, 'badge', c.badge, 'color', c.color, 'season_months', c.season_months,
    'who_hosts', c.who_hosts, 'members_invite', c.members_invite, 'auto_admit', not c.require_approval, 'house_rules', c.house_rules);
end $$;

-- "Make a new code": the old one stops working at once
create function public.new_crew_code(p_crew uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_leader(p_crew); k text := private.random_crew_code();
begin
  insert into public.crew_codes (crew_id, code) values (p_crew, k)
    on conflict (crew_id) do update set code = excluded.code, made_at = now(), uses = 0;
  delete from public.crew_invitations where crew_id = p_crew;
  insert into public.crew_audit (crew_id, actor, what) values (p_crew, a, 'code_changed');
  return k;
end $$;

-- "End it now": the season closes today; the next game starts the next one
create function public.end_season_now(p_crew uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_leader(p_crew); s uuid := public.current_season(p_crew);
begin
  if s is null then raise exception 'No season is running' using errcode = 'P0002'; end if;
  update public.seasons set ends_at = now() where id = s;
  perform private.award_season(s);
  update public.seasons set closed_at = now() where id = s;
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'season_ended', jsonb_build_object('season', s));
end $$;

-- ---------------------------------------------------------------- joining with a code
-- The invitation: what a code opens before anyone joins. Wrong codes count towards the rest.
create function public.crew_preview(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.crews; me uuid := private.me(); cid uuid := private.crew_by_code(p_code); s public.seasons; ldr record; r record; k text := private.clean_code(p_code);
begin
  if cid is null then
    select * into r from private.code_rest(auth.uid());
    return jsonb_build_object('found', false, 'tries_left', r.tries_left, 'rest', r.rest,
      'code', case when char_length(k) = 6 then substr(k, 1, 3) || '-' || substr(k, 4) else k end);
  end if;
  select * into c from public.crews where id = cid;
  select * into s from public.seasons where id = public.current_season(c.id);
  select a.id, a.name into ldr from public.crew_members m join public.accounts a on a.id = m.account_id where m.crew_id = c.id and m.role = 'owner' and m.status = 'active' limit 1;
  return jsonb_build_object('found', true, 'id', c.id, 'name', c.name, 'color', c.color, 'badge', c.badge, 'code', k,
    'members', (select count(*) from public.crew_members where crew_id = c.id and status = 'active'),
    'faces', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.joined_at), '[]'::jsonb) from (
      select a.id, a.name, m.joined_at from public.crew_members m join public.accounts a on a.id = m.account_id
      where m.crew_id = c.id and m.status = 'active' and a.deleted_at is null order by m.joined_at limit 6) x),
    'season', coalesce(s.number, (select coalesce(max(number), 0) + 1 from public.seasons where crew_id = c.id)),
    'seasons_on', c.season_months > 0,
    'games', (select count(*) from public.games where crew_id = c.id and status = 'ended' and not casual),
    'usual_day', (select to_char(started_at at time zone 'Asia/Kolkata', 'Dy') from public.games where crew_id = c.id and status = 'ended'
      group by to_char(started_at at time zone 'Asia/Kolkata', 'Dy') order by count(*) desc limit 1),
    'leader', case when ldr.id is null then null else jsonb_build_object('id', ldr.id, 'name', ldr.name) end,
    'auto_admit', not c.require_approval,
    'status', case when me is null then null
      when exists (select 1 from public.crew_members where crew_id = c.id and account_id = me and status = 'active') then 'member'
      when exists (select 1 from public.crew_requests where crew_id = c.id and account_id = me and status = 'pending')
        or exists (select 1 from public.crew_members where crew_id = c.id and account_id = me and status = 'pending') then 'pending' end);
end $$;

-- "Ask to join" (or straight in when the crew lets people in by themselves). Returns active, pending, member,
-- or wrong (no crew has that code; the try counts towards the rest).
create function public.ask_to_join(p_code text, p_notify boolean default true, p_from uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); cid uuid := private.crew_by_code(p_code); c public.crews;
begin
  if cid is null then return 'wrong'; end if;
  select * into c from public.crews where id = cid for update;
  if exists (select 1 from public.crew_members where crew_id = c.id and account_id = a and status = 'active') then return 'member'; end if;
  if exists (select 1 from public.crew_members where crew_id = c.id and account_id = a and status = 'pending') then return 'pending'; end if;
  if exists (select 1 from public.crew_requests where crew_id = c.id and account_id = a and status = 'pending') then
    update public.crew_requests set notify = coalesce(p_notify, notify) where crew_id = c.id and account_id = a and status = 'pending';
    return 'pending';
  end if;
  if (select count(*) from public.crew_members where account_id = a) >= 10 then raise exception 'You can be in at most 10 crews' using errcode = '54000'; end if;
  if (select count(*) from public.crew_members where crew_id = c.id and status = 'active') >= 60 then raise exception 'This crew is full (60 members)' using errcode = '54000'; end if;
  if p_from is not null and private.role_in(c.id, p_from) is null then p_from := null; end if;
  if not c.require_approval then
    insert into public.crew_members (crew_id, account_id, role, status) values (c.id, a, 'member', 'active');
    update public.crew_codes set uses = uses + 1 where crew_id = c.id;
    delete from public.crew_invitations where crew_id = c.id and account_id = a;
    insert into public.crew_audit (crew_id, actor, what, detail) values (c.id, a, 'member_joined', jsonb_build_object('account', a));
    return 'active';
  end if;
  if (select count(*) from public.crew_requests where crew_id = c.id and status = 'pending') >= 10 then
    raise exception 'Too many people are waiting to join this crew. Ask the leader.' using errcode = '54000';
  end if;
  insert into public.crew_requests (crew_id, account_id, notify, invited_by) values (c.id, a, coalesce(p_notify, true), p_from);
  update public.crew_codes set uses = uses + 1 where crew_id = c.id;
  return 'pending';
end $$;

create function public.cancel_join_request(p_crew uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  update public.crew_requests set status = 'cancelled', decided_at = now() where crew_id = p_crew and account_id = a and status = 'pending';
  if not found then raise exception 'There is no request to cancel' using errcode = 'P0002'; end if;
end $$;

-- "Tell me when I'm in"
create function public.set_request_notify(p_crew uuid, p_notify boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  update public.crew_requests set notify = p_notify where crew_id = p_crew and account_id = a and status = 'pending';
  if not found then raise exception 'There is no request waiting' using errcode = 'P0002'; end if;
end $$;

-- my requests: those waiting, and those answered in the last two days (the waiting screen turns into "You're in")
create function public.my_join_requests() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'crew_id', r.crew_id, 'name', c.name, 'color', c.color, 'badge', c.badge,
      'status', r.status, 'notify', r.notify, 'asked_at', r.asked_at, 'decided_at', r.decided_at,
      'leader', (select x.name from public.crew_members m join public.accounts x on x.id = m.account_id where m.crew_id = c.id and m.role = 'owner' limit 1))
      order by r.asked_at desc)
    from public.crew_requests r join public.crews c on c.id = r.crew_id
    where r.account_id = a and (r.status = 'pending' or (r.status in ('approved', 'declined') and r.decided_at > now() - interval '2 days'))), '[]'::jsonb);
end $$;

-- who wants to join (leader and admins)
create function public.crew_join_requests(p_crew uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a uuid := private.need_admin(p_crew);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'account_id', r.account_id, 'name', x.name, 'asked_at', r.asked_at,
      'invited_by', (select y.name from public.accounts y where y.id = r.invited_by),
      'plays_at', (select c2.name from public.crew_members m2 join public.crews c2 on c2.id = m2.crew_id
        where m2.account_id = r.account_id and m2.status = 'active' and exists (select 1 from public.crew_members m3 where m3.crew_id = m2.crew_id and m3.account_id = a and m3.status = 'active')
        order by c2.name limit 1))
      order by r.asked_at)
    from public.crew_requests r join public.accounts x on x.id = r.account_id
    where r.crew_id = p_crew and r.status = 'pending'), '[]'::jsonb);
end $$;

-- approve (they are in, and told if they asked to be) or decline
create function public.decide_join_request(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.crew_requests; a uuid; cname text;
begin
  select * into r from public.crew_requests where id = p_request for update;
  if r is null then raise exception 'Nobody is waiting with that request' using errcode = 'P0002'; end if;
  a := private.need_admin(r.crew_id);
  if r.status <> 'pending' then raise exception 'That request was already answered' using errcode = 'P0002'; end if;
  update public.crew_requests set status = case when p_approve then 'approved' else 'declined' end, decided_at = now(), decided_by = a where id = r.id;
  if p_approve then
    if (select count(*) from public.crew_members where crew_id = r.crew_id and status = 'active') >= 60 then raise exception 'This crew is full (60 members)' using errcode = '54000'; end if;
    insert into public.crew_members (crew_id, account_id, role, status) values (r.crew_id, r.account_id, 'member', 'active')
      on conflict (crew_id, account_id) do update set status = 'active', joined_at = now();
    delete from public.crew_invitations where crew_id = r.crew_id and account_id = r.account_id;
    if r.notify then
      cname := (select name from public.crews where id = r.crew_id);
      insert into private.push_outbox (account_id, kind, title, body, url, tag, dedupe)
        values (r.account_id, 'crew', 'You’re in', format('Welcome to %s. Your games there count for its league.', cname), '/#/crews/' || r.crew_id, 'crew-' || r.crew_id, 'request:' || r.id)
        on conflict do nothing;
    end if;
  end if;
  insert into public.crew_audit (crew_id, actor, what, detail) values (r.crew_id, a, case when p_approve then 'member_approved' else 'member_refused' end, jsonb_build_object('account', r.account_id));
end $$;

-- ---------------------------------------------------------------- invitations from a link
create function public.note_invitation(p_code text, p_from uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); k text := private.clean_code(p_code); cid uuid := (select crew_id from public.crew_codes where code = k);
begin
  if cid is null or p_from is null or p_from = a or not private.can_invite(cid, p_from) then return; end if;
  if exists (select 1 from public.crew_members where crew_id = cid and account_id = a) then return; end if;
  insert into public.crew_invitations (crew_id, account_id, invited_by, code) values (cid, a, p_from, k)
    on conflict (crew_id, account_id) do update set invited_by = excluded.invited_by, code = excluded.code, at = now();
end $$;

create function public.my_invitations() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('crew_id', c.id, 'name', c.name, 'color', c.color, 'badge', c.badge, 'code', i.code,
      'invited_by', (select x.name from public.accounts x where x.id = i.invited_by), 'at', i.at,
      'members', (select count(*) from public.crew_members where crew_id = c.id and status = 'active'),
      'season', (select number from public.seasons where id = public.current_season(c.id)), 'seasons_on', c.season_months > 0) order by i.at desc)
    from public.crew_invitations i join public.crews c on c.id = i.crew_id
    where i.account_id = a and exists (select 1 from public.crew_codes k where k.crew_id = c.id and k.code = i.code)
      and not exists (select 1 from public.crew_members m where m.crew_id = c.id and m.account_id = a)), '[]'::jsonb);
end $$;

create function public.dismiss_invitation(p_crew uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.crew_invitations where crew_id = p_crew and account_id = private.need_me();
$$;

-- ---------------------------------------------------------------- what the screens show
-- each player's big blinds won in a crew, over a season (or every season), ranked
create function private.standings(c uuid, s uuid, all_time boolean)
returns table (account_id uuid, name text, games int, bb numeric, rank int, trend text, member boolean)
language sql stable security definer set search_path = '' as $$
  with gp as (
    select gp.account_id, gp.bb_won, g.ended_at from public.games g join public.game_players gp on gp.game_id = g.id
    where g.crew_id = c and g.status = 'ended' and not g.casual and gp.account_id is not null and gp.bb_won is not null and (all_time or g.season_id = s)
  ), t as (
    select gp.account_id, count(*)::int games, sum(gp.bb_won) bb,
      (array_agg(gp.bb_won order by gp.ended_at desc))[1] last from gp group by gp.account_id
  )
  select t.account_id, case when m.account_id is not null and a.deleted_at is null then a.name else 'Former player' end, t.games, t.bb,
    (rank() over (order by t.bb desc))::int, case when t.last > 0 then 'up' when t.last < 0 then 'down' else '' end, m.account_id is not null
  from t join public.accounts a on a.id = t.account_id
  left join public.crew_members m on m.crew_id = c and m.account_id = t.account_id and m.status = 'active'
  order by t.bb desc, a.name
$$;

-- the crew's table running now: opened in the last 6 hours and not finished, with who is playing
create function private.live_table(c uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('table', t.table_code, 'mode', t.mode, 'since', t.opened_at, 'rules', t.rules,
    'host', (select name from public.accounts where id = t.opened_by),
    'faces', coalesce((select jsonb_agg(jsonb_build_object('id', x.account_id, 'name', x.name)) from (
      select distinct hp.account_id, a.name from public.games g join public.hand_players hp on hp.game_id = g.id join public.accounts a on a.id = hp.account_id
      where g.crew_id = c and g.table_code = t.table_code and g.status = 'live' and g.started_at >= t.opened_at - interval '5 minutes'
        and hp.hand_no = (select max(hand_no) from public.hand_players h2 where h2.game_id = g.id) limit 9) x), '[]'::jsonb))
  from public.crew_tables t
  where t.crew_id = c and t.closed_at is null and t.opened_at > now() - interval '6 hours'
    and not exists (select 1 from public.games g where g.crew_id = c and g.table_code = t.table_code and g.status in ('ended', 'void') and g.ended_at > t.opened_at)
  order by t.opened_at desc limit 1
$$;

-- the usual night: the weekday most games started on, and the usual hour
create function private.usual_night(c uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('day', d, 'hour', (select percentile_disc(0.5) within group (order by extract(hour from started_at at time zone 'Asia/Kolkata'))::int
      from public.games where crew_id = c and status = 'ended' and to_char(started_at at time zone 'Asia/Kolkata', 'Dy') = d))
  from (select to_char(started_at at time zone 'Asia/Kolkata', 'Dy') d from public.games where crew_id = c and status = 'ended'
        group by 1 order by count(*) desc limit 1) x
$$;

-- The Crews tab: every crew I am in, as its card shows it
create function public.my_crews() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  return coalesce((select jsonb_agg(x order by x ->> 'name') from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color, 'badge', c.badge, 'role', m.role,
      'members', (select count(*) from public.crew_members where crew_id = c.id and status = 'active'),
      'faces', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.joined_at), '[]'::jsonb) from (
        select x.id, x.name, mm.joined_at from public.crew_members mm join public.accounts x on x.id = mm.account_id
        where mm.crew_id = c.id and mm.status = 'active' order by mm.joined_at limit 5) f),
      'season', (select number from public.seasons where id = s.sid), 'season_ends', (select ends_at from public.seasons where id = s.sid),
      'seasons_on', c.season_months > 0,
      'next_season', (select coalesce(max(number), 0) + 1 from public.seasons where crew_id = c.id),
      'rank', (select st.rank from private.standings(c.id, s.sid, false) st where st.account_id = a),
      'live', private.live_table(c.id),
      'usual', private.usual_night(c.id),
      'requests', case when m.role in ('owner', 'admin') then (select count(*) from public.crew_requests where crew_id = c.id and status = 'pending') else 0 end) x
    from public.crew_members m join public.crews c on c.id = m.crew_id
    cross join lateral (select public.current_season(c.id) sid) s
    where m.account_id = a and m.status = 'active') y(x)), '[]'::jsonb);
end $$;

-- The crew page's header and home tab
create function public.crew_page(p_crew uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); c public.crews; r public.crew_role := private.role_in(p_crew, a); s public.seasons; me record; lg record; ldr record; can_inv boolean;
begin
  if r is null then raise exception 'Only crew members can open the crew' using errcode = '42501'; end if;
  select * into c from public.crews where id = p_crew;
  select * into s from public.seasons where id = public.current_season(p_crew);
  select * into me from private.standings(p_crew, s.id, false) st where st.account_id = a;
  select x.id, x.name into ldr from public.crew_members m join public.accounts x on x.id = m.account_id where m.crew_id = p_crew and m.role = 'owner' limit 1;
  select g.id, g.started_at, g.ended_at, g.server, g.table_code,
    (select count(*) from public.game_players where game_id = g.id) players,
    (select jsonb_build_object('id', w.account_id, 'name', w.name, 'bb', w.bb_won) from public.game_players w where w.game_id = g.id order by w.bb_won desc nulls last limit 1) winner,
    (select bb_won from public.game_players where game_id = g.id and account_id = a) mine
    into lg from public.games g where g.crew_id = p_crew and g.status = 'ended' and not g.casual order by g.ended_at desc limit 1;
  can_inv := private.can_invite(p_crew, a);
  if can_inv then perform private.ensure_code(p_crew); end if;
  return jsonb_build_object(
    'crew', jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color, 'badge', c.badge, 'season_months', c.season_months, 'who_hosts', c.who_hosts,
      'members_invite', c.members_invite, 'auto_admit', not c.require_approval, 'house_rules', c.house_rules, 'created_at', c.created_at),
    'role', r, 'can_host', private.can_host(p_crew, a), 'can_invite', can_inv,
    'code', case when can_inv then (select jsonb_build_object('code', k.code, 'made_at', k.made_at, 'uses', k.uses) from public.crew_codes k where k.crew_id = p_crew) end,
    'members', (select count(*) from public.crew_members where crew_id = p_crew and status = 'active'),
    'leader', case when ldr.id is null then null else jsonb_build_object('id', ldr.id, 'name', ldr.name) end,
    'season', case when s.id is null then null else jsonb_build_object('id', s.id, 'number', s.number, 'name', s.name, 'starts_at', s.starts_at,
      'ends_at', case when s.ends_at = 'infinity' then null else s.ends_at end) end,
    'next_season', (select coalesce(max(number), 0) + 1 from public.seasons where crew_id = p_crew),
    'seasons', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', number, 'name', name, 'closed', closed_at is not null) order by starts_at desc), '[]'::jsonb)
      from public.seasons where crew_id = p_crew),
    'me', jsonb_build_object('rank', me.rank, 'bb', me.bb, 'games', coalesce(me.games, 0),
      'of', (select count(*) from public.crew_members where crew_id = p_crew and status = 'active'),
      'spark', (select coalesce(jsonb_agg(v order by t), '[]'::jsonb) from (
        select g.ended_at t, sum(gp.bb_won) over (order by g.ended_at) v from public.games g join public.game_players gp on gp.game_id = g.id
        where g.crew_id = p_crew and g.season_id = s.id and g.status = 'ended' and not g.casual and gp.account_id = a) sp)),
    'podium', (select coalesce(jsonb_agg(jsonb_build_object('account_id', st.account_id, 'name', st.name, 'bb', st.bb, 'rank', st.rank) order by st.rank, st.name), '[]'::jsonb)
      from (select * from private.standings(p_crew, s.id, false) limit 3) st),
    'last_game', case when lg.id is null then null else jsonb_build_object('id', lg.id, 'started_at', lg.started_at, 'ended_at', lg.ended_at, 'players', lg.players,
      'winner', lg.winner, 'mine', lg.mine, 'offline', lg.server = 'host', 'table', lg.table_code) end,
    'live', private.live_table(p_crew),
    'usual', private.usual_night(p_crew),
    'requests', case when r in ('owner', 'admin') then public.crew_join_requests(p_crew) else '[]'::jsonb end,
    'disputes', case when r in ('owner', 'admin') then (select count(*) from public.games g where g.crew_id = p_crew and g.awaiting_confirmation and g.status = 'live'
      and exists (select 1 from public.result_changes rc where rc.game_id = g.id and rc.what = 'offline_disputed')) else 0 end);
end $$;

-- The League tab: this season, the season before, or all-time (ranked by big blinds won)
create function public.crew_league(p_crew uuid, p_scope text default 'season', p_season uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a uuid := private.need_me(); s public.seasons;
begin
  if not private.is_member(p_crew) then raise exception 'Only crew members can see the league' using errcode = '42501'; end if;
  if p_scope not in ('season', 'previous', 'alltime') then raise exception 'Unknown league view' using errcode = '22023'; end if;
  if p_season is not null then select * into s from public.seasons where id = p_season and crew_id = p_crew;
  elsif p_scope = 'season' then select * into s from public.seasons where id = public.current_season(p_crew);
  elsif p_scope = 'previous' then select * into s from public.seasons where crew_id = p_crew and starts_at < coalesce((select starts_at from public.seasons where id = public.current_season(p_crew)), now())
    and ends_at <= now() order by starts_at desc limit 1;
  end if;
  return jsonb_build_object('season', case when s.id is null then null else jsonb_build_object('id', s.id, 'number', s.number, 'name', s.name, 'starts_at', s.starts_at,
      'ends_at', case when s.ends_at = 'infinity' then null else s.ends_at end, 'closed', s.closed_at is not null) end,
    'rows', case when p_scope <> 'alltime' and s.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('account_id', st.account_id, 'name', st.name,
      'games', st.games, 'bb', st.bb, 'rank', st.rank, 'trend', st.trend, 'member', st.member, 'me', st.account_id = a) order by st.rank, st.name), '[]'::jsonb)
      from private.standings(p_crew, s.id, p_scope = 'alltime') st) end);
end $$;

-- The Games tab: every game, newest first (with who won and what I made); "I played" and "Trophies" filters
create function public.crew_games(p_crew uuid, p_filter text default 'all', p_limit int default 40, p_before timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  if not private.is_member(p_crew) then raise exception 'Only crew members can see the crew''s games' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by (x ->> 'started_at')::timestamptz desc) from (
    select jsonb_build_object('id', g.id, 'started_at', g.started_at, 'ended_at', g.ended_at, 'table', g.table_code, 'status', g.status,
      'offline', g.server = 'host', 'waiting', g.awaiting_confirmation, 'casual', g.casual, 'hands', g.hands,
      'players', (select count(*) from public.game_players where game_id = g.id),
      'winner', (select jsonb_build_object('id', w.account_id, 'name', w.name, 'bb', w.bb_won) from public.game_players w where w.game_id = g.id order by w.bb_won desc nulls last limit 1),
      'mine', (select bb_won from public.game_players where game_id = g.id and account_id = a),
      'trophy', exists (select 1 from public.trophies t where t.game_id = g.id)) x
    from public.games g
    where g.crew_id = p_crew and (g.status <> 'live' or g.awaiting_confirmation)
      and (p_before is null or g.started_at < p_before)
      and (p_filter <> 'mine' or exists (select 1 from public.game_players gp where gp.game_id = g.id and gp.account_id = a))
      and (p_filter <> 'trophies' or exists (select 1 from public.trophies t where t.game_id = g.id))
    order by g.started_at desc limit least(greatest(p_limit, 1), 100)) y(x)), '[]'::jsonb);
end $$;

-- The Members tab: roles, who is at a table right now, when they last played
create function public.crew_members_v3(p_crew uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a uuid := private.need_me(); s uuid := public.current_season(p_crew);
begin
  if not private.is_member(p_crew) then raise exception 'Only crew members can see the members' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by (x ->> 'ord')::int, (x ->> 'joined_at')::timestamptz) from (
    select jsonb_build_object('account_id', m.account_id, 'name', x.name, 'role', m.role, 'joined_at', m.joined_at, 'me', m.account_id = a,
      'ord', case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      'last_played', (select max(g.ended_at) from public.game_players gp join public.games g on g.id = gp.game_id where gp.account_id = m.account_id and g.crew_id = p_crew and g.status = 'ended'),
      'at_table', (select case when g.crew_id = p_crew then g.table_code else '' end from public.hand_players hp join public.hands h using (game_id, hand_no) join public.games g on g.id = hp.game_id
        where hp.account_id = m.account_id and g.status = 'live' and h.played_at > now() - interval '15 minutes' order by h.played_at desc limit 1),
      'games', (select count(*) from public.game_players gp join public.games g on g.id = gp.game_id where gp.account_id = m.account_id and g.crew_id = p_crew and g.season_id = s and g.status = 'ended' and not g.casual),
      'bb', (select sum(gp.bb_won) from public.game_players gp join public.games g on g.id = gp.game_id where gp.account_id = m.account_id and g.crew_id = p_crew and g.season_id = s and g.status = 'ended' and not g.casual)) x
    from public.crew_members m join public.accounts x on x.id = m.account_id
    where m.crew_id = p_crew and m.status = 'active') y(x)), '[]'::jsonb);
end $$;

-- A player's card in the crew: their season, best hand, last 8 games and trophies
create function public.crew_player(p_crew uuid, p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a uuid := private.need_me(); s public.seasons; st record; m public.crew_members; best record; nm text;
begin
  if not private.is_member(p_crew) then raise exception 'Only crew members can see players' using errcode = '42501'; end if;
  select * into m from public.crew_members where crew_id = p_crew and account_id = p_account and status = 'active';
  if m is null and not exists (select 1 from public.game_players gp join public.games g on g.id = gp.game_id where g.crew_id = p_crew and gp.account_id = p_account) then
    raise exception 'Not a player in this crew' using errcode = 'P0002';
  end if;
  nm := case when m is null then 'Former player' else (select name from public.accounts where id = p_account) end;
  select * into s from public.seasons where id = public.current_season(p_crew);
  select * into st from private.standings(p_crew, s.id, false) x where x.account_id = p_account;
  select hp.best_hand, h.played_at,
    (select case when jsonb_typeof(x) = 'array' then x end from (select h.record -> 'frames' -> -1 -> 'cards' -> (k.i - 1)) q(x)) cards,
    (select f -> 'board' from jsonb_array_elements(h.record -> 'frames') with ordinality fr(f, o) where f ? 'board' order by o desc limit 1) board
    into best
    from public.hand_players hp join public.hands h using (game_id, hand_no) join public.games g on g.id = hp.game_id
    left join lateral (select ord::int i from jsonb_array_elements_text(h.record -> 'keys') with ordinality t(v, ord) where v = hp.player_key limit 1) k on true
    where hp.account_id = p_account and g.crew_id = p_crew and g.season_id = s.id and hp.best_hand is not null and hp.showdown
    order by hp.best_hand desc, h.played_at desc limit 1;
  return jsonb_build_object('account_id', p_account, 'name', nm, 'role', m.role, 'joined_at', m.joined_at, 'member', m is not null,
    'first_season', (select min(x.number) from public.seasons x where x.crew_id = p_crew and x.ends_at > coalesce(m.joined_at, now())),
    'season', s.number, 'rank', st.rank, 'games', coalesce(st.games, 0), 'bb', st.bb,
    'hands', (select count(*) from public.hand_players hp join public.games g on g.id = hp.game_id where hp.account_id = p_account and g.crew_id = p_crew and g.season_id = s.id),
    'won', (select count(*) from public.hand_players hp join public.games g on g.id = hp.game_id where hp.account_id = p_account and g.crew_id = p_crew and g.season_id = s.id and hp.won),
    'best', case when best.best_hand is null then null else jsonb_build_object('rank', best.best_hand, 'at', best.played_at, 'cards', best.cards, 'board', best.board) end,
    'form', (select coalesce(jsonb_agg(v order by t), '[]'::jsonb) from (
      select t, sum(b) over (order by t) v from (select g.ended_at t, gp.bb_won b from public.games g join public.game_players gp on gp.game_id = g.id
        where g.crew_id = p_crew and g.status = 'ended' and not g.casual and gp.account_id = p_account order by g.ended_at desc limit 8) l) f),
    'trophies', (select coalesce(jsonb_agg(jsonb_build_object('kind', t.kind, 'at', t.at, 'season', (select number from public.seasons where id = t.season_id)) order by t.at desc), '[]'::jsonb)
      from public.trophies t where t.account_id = p_account and t.crew_id = p_crew));
end $$;

-- Seat disputes: offline nights where someone said a seat with their name was not them
create function public.crew_disputes(p_crew uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a uuid := private.need_admin(p_crew);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('game_id', g.id, 'started_at', g.started_at, 'ended_at', g.ended_at, 'table', g.table_code,
      'players', (select count(*) from public.game_players where game_id = g.id),
      'at', (select max(rc.at) from public.result_changes rc where rc.game_id = g.id and rc.what = 'offline_disputed')) order by g.ended_at desc)
    from public.games g where g.crew_id = p_crew and g.awaiting_confirmation and g.status = 'live'
      and exists (select 1 from public.result_changes rc where rc.game_id = g.id and rc.what = 'offline_disputed')), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- hosting a crew table
-- Checks who may host, keeps the table for the LIVE strip, and tells the crew. Returns the season it counts for.
create function public.host_crew_table(p_crew uuid, p_table text, p_mode text default 'online', p_rules jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); c public.crews; tid bigint; n int := 0; m record; who text; code text := nullif(upper(btrim(coalesce(p_table, ''))), '');
begin
  if private.role_in(p_crew, a) is null then raise exception 'Only crew members can host crew tables' using errcode = '42501'; end if;
  if not private.can_host(p_crew, a) then
    raise exception '%', case (select who_hosts from public.crews where id = p_crew) when 'admins' then 'Only the leader and admins can host this crew''s tables' else 'Only the leader can host this crew''s tables' end
      using errcode = '42501';
  end if;
  if p_mode not in ('online', 'offline', 'qr') then raise exception 'Unknown kind of table' using errcode = '22023'; end if;
  select * into c from public.crews where id = p_crew;
  who := (select name from public.accounts where id = a);
  insert into public.crew_tables (crew_id, table_code, mode, rules, opened_by) values (p_crew, code, p_mode, coalesce(p_rules, c.house_rules), a) returning crew_tables.id into tid;
  for m in select account_id from public.crew_members where crew_id = p_crew and status = 'active' and account_id <> a loop
    insert into private.push_outbox (account_id, kind, title, body, url, tag, dedupe)
      values (m.account_id, 'crewTable', 'A crew table is open',
        case when code is null then format('%s is hosting %s tonight.', who, c.name) else format('%s opened table %s for %s. Tap to join.', who, code, c.name) end,
        case when p_mode = 'online' and code is not null then '/#/t/' || code else '/#/crews/' || p_crew end,
        'table-' || coalesce(code, p_crew::text), 'table:' || tid)
      on conflict do nothing;
    n := n + 1;
  end loop;
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'table_opened', jsonb_build_object('table', code, 'mode', p_mode));
  return jsonb_build_object('id', tid, 'notified', n,
    'season', (select coalesce((select number from public.seasons where id = public.current_season(p_crew)), (select coalesce(max(number), 0) + 1 from public.seasons where crew_id = p_crew))),
    'seasons_on', c.season_months > 0);
end $$;

-- the host closes the strip early (the table was never played)
create function public.close_crew_table(p_crew uuid, p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  update public.crew_tables set closed_at = now() where id = p_id and crew_id = p_crew and closed_at is null
    and (opened_by = a or private.role_in(p_crew, a) in ('owner', 'admin'));
  if not found then raise exception 'That table is not open' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------- backups carry the new tables
create or replace function private.backup_tables() returns text[] language sql immutable set search_path = '' as $$
  select array['private.settings', 'public.accounts', 'public.account_logins', 'private.recovery_codes', 'public.crews', 'public.crew_members',
    'public.crew_invites', 'public.rescue_requests', 'public.crew_audit', 'public.seasons', 'public.games', 'public.game_players',
    'public.hands', 'public.hand_players', 'public.hand_cards_private', 'private.hand_records', 'public.trophies', 'public.result_changes',
    'public.offline_confirmations', 'public.push_subscriptions', 'private.problem_reports',
    'public.crew_codes', 'public.crew_requests', 'public.crew_invitations', 'public.crew_tables']
$$;

-- ---------------------------------------------------------------- grants
revoke all on function private.need_leader(uuid), private.can_host(uuid, uuid), private.can_invite(uuid, uuid), private.random_crew_code(),
  private.ensure_code(uuid), private.clean_code(text), private.code_rest(uuid), private.note_try(uuid, boolean), private.crew_by_code(text),
  private.standings(uuid, uuid, boolean), private.live_table(uuid), private.usual_night(uuid) from public, anon, authenticated;
-- (row-level security on crew_codes asks these as the reader)
grant execute on function private.can_invite(uuid, uuid), private.can_host(uuid, uuid) to authenticated;
revoke all on function public.create_crew_v3(text, text, text, boolean), public.crew_settings(uuid, text, text, text, int, text, boolean, boolean, jsonb),
  public.new_crew_code(uuid), public.end_season_now(uuid), public.crew_preview(text), public.ask_to_join(text, boolean, uuid),
  public.cancel_join_request(uuid), public.set_request_notify(uuid, boolean), public.my_join_requests(), public.crew_join_requests(uuid),
  public.decide_join_request(uuid, boolean), public.note_invitation(text, uuid), public.my_invitations(), public.dismiss_invitation(uuid),
  public.my_crews(), public.crew_page(uuid), public.crew_league(uuid, text, uuid), public.crew_games(uuid, text, int, timestamptz),
  public.crew_members_v3(uuid), public.crew_player(uuid, uuid), public.crew_disputes(uuid), public.host_crew_table(uuid, text, text, jsonb),
  public.close_crew_table(uuid, bigint) from public, anon, authenticated;
grant execute on function public.create_crew_v3(text, text, text, boolean), public.crew_settings(uuid, text, text, text, int, text, boolean, boolean, jsonb),
  public.new_crew_code(uuid), public.end_season_now(uuid), public.crew_preview(text), public.ask_to_join(text, boolean, uuid),
  public.cancel_join_request(uuid), public.set_request_notify(uuid, boolean), public.my_join_requests(), public.crew_join_requests(uuid),
  public.decide_join_request(uuid, boolean), public.note_invitation(text, uuid), public.my_invitations(), public.dismiss_invitation(uuid),
  public.my_crews(), public.crew_page(uuid), public.crew_league(uuid, text, uuid), public.crew_games(uuid, text, int, timestamptz),
  public.crew_members_v3(uuid), public.crew_player(uuid, uuid), public.crew_disputes(uuid), public.host_crew_table(uuid, text, text, jsonb),
  public.close_crew_table(uuid, bigint) to authenticated;
