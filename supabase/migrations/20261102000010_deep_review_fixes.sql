-- Deep review after Phase 4: holes found by trying to break accounts, crews, rescue and the league.

-- ---------------------------------------------------------------- 1. crew rescue cannot steal an account
-- Before: any admin could approve "this new phone is Riya" and the phone became Riya at once; a crew made
-- for the purpose (create a crew, invite Riya, rescue her) was enough to take over her account, all her
-- crews, her cards and history, and then lock her out. Now:
--   * the crew can only vouch for someone who has been an active member of that crew for a week;
--   * an approved rescue finishes only after Riya's own phones have been quiet for 24 hours, and until
--     then those phones see it and can say "That's not me" (so does any admin);
--   * for 7 days a phone added by rescue cannot log other phones out, make a new recovery code, delete
--     the account or hand over / delete crews, so the real owner can always throw it out first.
alter table public.rescue_requests drop constraint rescue_requests_status_check;
update public.rescue_requests set status = 'done' where status = 'approved'; -- approved ones were finished at once
alter table public.rescue_requests add constraint rescue_requests_status_check check (status in ('pending', 'approved', 'denied', 'done'));
alter table public.rescue_requests add column completed_at timestamptz;
update public.rescue_requests set completed_at = decided_at where status = 'done';
alter table public.account_logins add column rescued_at timestamptz;
create index on public.rescue_requests (target_account, status);

-- when an approved rescue may finish: 24 hours after the target's phones were last used (and not before approval)
create function private.rescue_due(q public.rescue_requests) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest(q.decided_at, coalesce((select max(l.last_seen) from public.account_logins l where l.account_id = q.target_account and l.auth_user <> q.requester_auth), q.decided_at - interval '24 hours') + interval '24 hours')
$$;

create function private.finish_rescue_if_due(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare q public.rescue_requests; now_acc uuid;
begin
  select * into q from public.rescue_requests where id = p_id for update;
  if q is null then return null; end if;
  if q.status <> 'approved' or now() < private.rescue_due(q) then return q.status; end if;
  if exists (select 1 from public.accounts where id = q.target_account and deleted_at is not null) then
    update public.rescue_requests set status = 'denied' where id = q.id;
    return 'denied';
  end if;
  select account_id into now_acc from public.account_logins where auth_user = q.requester_auth;
  if now_acc is not null and now_acc <> q.target_account then
    if (select count(*) from public.account_logins where account_id = now_acc) > 1 then
      delete from public.account_logins where auth_user = q.requester_auth;
    else
      perform private.merge_accounts(now_acc, q.target_account);
    end if;
  end if;
  insert into public.account_logins (auth_user, account_id, rescued_at) values (q.requester_auth, q.target_account, now())
    on conflict (auth_user) do update set account_id = excluded.account_id, last_seen = now(), rescued_at = now();
  update public.rescue_requests set status = 'done', completed_at = now() where id = q.id;
  insert into public.crew_audit (crew_id, actor, what, detail) values (q.crew_id, null, 'rescue_done', jsonb_build_object('request', q.id, 'for', q.target_account));
  return 'done';
end $$;

-- a phone added by rescue waits 7 days before it can do anything that could lock the real owner out
create function private.need_settled() returns void
language plpgsql stable security definer set search_path = '' as $$
declare r timestamptz := (select rescued_at from public.account_logins where auth_user = auth.uid());
begin
  if r is not null and r > now() - interval '7 days' then
    raise exception 'This phone joined your account through a crew rescue. For safety it can do this from %.', to_char((r + interval '7 days') at time zone 'Asia/Kolkata', 'DD Mon HH24:MI')
      using errcode = '42501';
  end if;
end $$;

create or replace function public.request_rescue(p_invite text, p_target uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); i public.crew_invites; v_id uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  select * into i from public.crew_invites where code = upper(p_invite) and expires_at > now();
  if i is null or (i.single_use and i.used_at is not null) then raise exception 'This invite has expired' using errcode = 'P0002'; end if;
  if private.role_in(i.crew_id, p_target) is null then raise exception 'That player is not in this crew' using errcode = 'P0002'; end if;
  if private.me() = p_target then raise exception 'This phone is already that player' using errcode = '22023'; end if;
  if (select count(*) from public.rescue_requests where requester_auth = me and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Too many requests today' using errcode = '54000';
  end if;
  -- strangers cannot bury a player or a crew in requests
  if (select count(*) from public.rescue_requests where target_account = p_target and status in ('pending', 'approved')) >= 2 then
    raise exception 'There are already requests waiting for that player' using errcode = '54000';
  end if;
  if (select count(*) from public.rescue_requests where crew_id = i.crew_id and status = 'pending') >= 10 then
    raise exception 'This crew has too many requests waiting' using errcode = '54000';
  end if;
  insert into public.rescue_requests (crew_id, target_account, requester_auth, requester_account)
    values (i.crew_id, p_target, me, private.me()) returning rescue_requests.id into v_id;
  insert into public.crew_audit (crew_id, actor, what, detail) values (i.crew_id, private.me(), 'rescue_requested', jsonb_build_object('request', v_id, 'for', p_target));
  return v_id;
end $$;

-- Admins approve or refuse. The player the request claims to be (on any of their phones) can always
-- refuse it, also after approval while it is still waiting; so can any admin.
create or replace function public.decide_rescue(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.rescue_requests; me uuid := private.need_me(); a uuid; joined timestamptz;
begin
  select * into q from public.rescue_requests where id = p_request for update;
  if q is null or q.status not in ('pending', 'approved') then raise exception 'This request is no longer open' using errcode = 'P0002'; end if;
  if not p_approve then
    if me <> q.target_account and private.role_in(q.crew_id, me) is distinct from 'owner' and private.role_in(q.crew_id, me) is distinct from 'admin' then
      raise exception 'Only a crew admin can do that' using errcode = '42501';
    end if;
    update public.rescue_requests set status = 'denied', decided_by = me, decided_at = now() where id = q.id;
    insert into public.crew_audit (crew_id, actor, what, detail) values (q.crew_id, me, 'rescue_denied', jsonb_build_object('request', q.id, 'for', q.target_account, 'by_target', me = q.target_account));
    return;
  end if;
  if q.status <> 'pending' then raise exception 'Already approved' using errcode = '22023'; end if;
  a := private.need_admin(q.crew_id);
  if a = q.target_account then raise exception 'Another admin has to approve your own rescue' using errcode = '42501'; end if;
  if exists (select 1 from public.accounts where id = q.target_account and deleted_at is not null) then
    raise exception 'That account was deleted' using errcode = 'P0002';
  end if;
  select joined_at into joined from public.crew_members where crew_id = q.crew_id and account_id = q.target_account and status = 'active';
  if joined is null then raise exception 'That player is not in this crew' using errcode = 'P0002'; end if;
  if joined > now() - interval '7 days' then
    raise exception 'They joined this crew less than a week ago, so the crew cannot vouch for them yet. Their recovery code still works.' using errcode = '42501';
  end if;
  update public.rescue_requests set status = 'approved', decided_by = a, decided_at = now() where id = q.id;
  insert into public.crew_audit (crew_id, actor, what, detail) values (q.crew_id, a, 'rescue_approved', jsonb_build_object('request', q.id, 'for', q.target_account));
  perform private.finish_rescue_if_due(q.id);
end $$;

-- For the phone that asked (and the player and the crew's admins): where the request stands. Finishes it
-- when it is due, so the waiting phone moves on by itself.
create function public.rescue_status(p_request uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.rescue_requests; st text;
begin
  select * into q from public.rescue_requests where id = p_request;
  if q is null or not (q.requester_auth = auth.uid() or q.target_account = private.me() or private.role_in(q.crew_id, private.me()) in ('owner', 'admin')) then
    return null;
  end if;
  st := private.finish_rescue_if_due(q.id);
  select * into q from public.rescue_requests where id = p_request;
  return jsonb_build_object('status', st, 'finishes_at', case when st = 'approved' then private.rescue_due(q) end);
end $$;

-- Shown on the player's own phones: someone is asking to become them.
create function public.rescues_of_me() returns table (id uuid, crew_id uuid, crew_name text, status text, created_at timestamptz, finishes_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select q.id, q.crew_id, c.name, q.status, q.created_at, case when q.status = 'approved' then private.rescue_due(q) end
  from public.rescue_requests q join public.crews c on c.id = q.crew_id
  where q.target_account = private.me() and q.status in ('pending', 'approved')
  order by q.created_at desc
$$;

-- the lock-out actions wait 7 days on a rescued phone
create or replace function public.logout_other_phones() returns int
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); n int;
begin
  perform private.need_settled();
  delete from public.account_logins where account_id = a and auth_user <> auth.uid();
  get diagnostics n = row_count;
  delete from private.table_tickets where account_id = a and auth_user <> auth.uid();
  return n;
end $$;

create or replace function public.logout_phone(p_phone uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  if p_phone = auth.uid() then raise exception 'Use Log out on this phone instead' using errcode = '22023'; end if;
  perform private.need_settled();
  delete from private.table_tickets where account_id = a and auth_user = p_phone;
  delete from public.account_logins where account_id = a and auth_user = p_phone;
  return found;
end $$;

create or replace function public.new_recovery_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare a uuid := private.need_me(); code text; tries int := 0;
begin
  perform private.need_settled();
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

create or replace function public.delete_crew(p_crew uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  if private.role_in(p_crew, a) is distinct from 'owner' then raise exception 'Only the owner can delete the crew' using errcode = '42501'; end if;
  perform private.need_settled();
  delete from public.crews where id = p_crew;
end $$;

create or replace function public.set_role(p_crew uuid, p_account uuid, p_role public.crew_role) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  if private.role_in(p_crew, a) is distinct from 'owner' then raise exception 'Only the owner can change roles' using errcode = '42501'; end if;
  if p_account = a then raise exception 'Use transfer_ownership to hand the crew over' using errcode = '42501'; end if;
  if private.role_in(p_crew, p_account) is null then raise exception 'Not a member' using errcode = 'P0002'; end if;
  perform private.need_settled();
  if p_role = 'owner' then
    update public.crew_members set role = 'admin' where crew_id = p_crew and account_id = a;
  end if;
  update public.crew_members set role = p_role where crew_id = p_crew and account_id = p_account;
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'role_changed', jsonb_build_object('account', p_account, 'role', p_role));
end $$;

-- ---------------------------------------------------------------- 2. crews: removed means removed, no flooding
-- A removed member could walk straight back in with the old link, and links could not be withdrawn.
-- Removing someone now withdraws the crew's links (admins make a fresh one); admins can also withdraw
-- links at any time. Only active members count towards 60, and at most 10 can wait for approval, so
-- throwaway phones cannot fill a crew.
create or replace function public.remove_member(p_crew uuid, p_account uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_admin(p_crew); mine public.crew_role := private.role_in(p_crew, a); theirs public.crew_role;
begin
  select role into theirs from public.crew_members where crew_id = p_crew and account_id = p_account;
  if theirs is null then raise exception 'Not a member' using errcode = 'P0002'; end if;
  if theirs = 'owner' then raise exception 'The owner cannot be removed' using errcode = '42501'; end if;
  if theirs = 'admin' and mine <> 'owner' then raise exception 'Only the owner can remove an admin' using errcode = '42501'; end if;
  delete from public.crew_members where crew_id = p_crew and account_id = p_account;
  delete from public.crew_invites where crew_id = p_crew;
  update public.rescue_requests set status = 'denied', decided_by = a, decided_at = now() where crew_id = p_crew and target_account = p_account and status in ('pending', 'approved');
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'member_removed', jsonb_build_object('account', p_account));
end $$;

create function public.revoke_invites(p_crew uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_admin(p_crew); n int;
begin
  delete from public.crew_invites where crew_id = p_crew;
  get diagnostics n = row_count;
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'invites_revoked', jsonb_build_object('count', n));
  return n;
end $$;

create or replace function public.join_crew(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); i public.crew_invites; c public.crews; st text;
begin
  select * into i from public.crew_invites where code = upper(p_code) for update;
  if i is null or i.expires_at <= now() or (i.single_use and i.used_at is not null) then
    raise exception 'This invite has expired' using errcode = 'P0002';
  end if;
  select * into c from public.crews where id = i.crew_id for update;
  if exists (select 1 from public.crew_members where crew_id = c.id and account_id = a) then
    return (select status from public.crew_members where crew_id = c.id and account_id = a);
  end if;
  if (select count(*) from public.crew_members where account_id = a) >= 10 then
    raise exception 'You can be in at most 10 crews' using errcode = '54000';
  end if;
  if (select count(*) from public.crew_members where crew_id = c.id and status = 'active') >= 60 then
    raise exception 'This crew is full (60 members)' using errcode = '54000';
  end if;
  st := case when c.require_approval then 'pending' else 'active' end;
  if st = 'pending' and (select count(*) from public.crew_members where crew_id = c.id and status = 'pending') >= 10 then
    raise exception 'Too many people are waiting to join this crew. Ask an admin.' using errcode = '54000';
  end if;
  insert into public.crew_members (crew_id, account_id, role, status) values (c.id, a, 'member', st);
  if i.single_use then update public.crew_invites set used_at = now() where code = i.code; end if;
  return st;
end $$;

-- ---------------------------------------------------------------- 3. recovery codes: one network cannot lock everyone out
-- 10 wrong codes from one network (college Wi-Fi, a mobile carrier) locked every phone on it for an
-- hour. Now: 10 wrong codes per phone, 50 per network.
create or replace function public.recover_account(p_code text, p_merge boolean default true) returns public.accounts
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); v_ip text := private.request_ip(); target uuid; mine uuid := private.me(); r public.accounts;
begin
  if me is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if (select count(*) from private.recovery_attempts where not ok and at > now() - interval '1 hour' and auth_user = me) >= 10
     or (v_ip is not null and (select count(*) from private.recovery_attempts where not ok and at > now() - interval '1 hour' and ip = v_ip) >= 50) then
    raise exception 'Too many wrong codes. Try again in an hour.' using errcode = '54000';
  end if;
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
  -- the code is the account's own key: a phone that has it is fully trusted (no rescue wait)
  insert into public.account_logins (auth_user, account_id) values (me, target)
    on conflict (auth_user) do update set account_id = excluded.account_id, last_seen = now(), rescued_at = null;
  select * into r from public.accounts where id = target;
  return r;
end $$;

-- ---------------------------------------------------------------- 4. deleting an account leaves nothing behind
-- Before, the deleted account kept its crew places (and its admin role), and requests about it stayed open.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); m record; heir uuid;
begin
  perform private.need_settled();
  for m in select crew_id from public.crew_members where account_id = a and role = 'owner' loop
    select account_id into heir from public.crew_members
      where crew_id = m.crew_id and account_id <> a and status = 'active'
      order by (role = 'admin') desc, joined_at asc limit 1;
    if heir is null then delete from public.crews where id = m.crew_id;
    else
      update public.crew_members set role = 'member' where crew_id = m.crew_id and account_id = a;
      update public.crew_members set role = 'owner' where crew_id = m.crew_id and account_id = heir;
      insert into public.crew_audit (crew_id, actor, what, detail) values (m.crew_id, a, 'ownership_passed', jsonb_build_object('to', heir));
    end if;
  end loop;
  delete from public.crew_members where account_id = a;
  update public.rescue_requests set status = 'denied', decided_at = now() where (target_account = a or requester_account = a) and status in ('pending', 'approved');
  update public.accounts set name = 'Former player', avatar_url = null, settings = '{}'::jsonb, deleted_at = now() where id = a;
  update public.game_players set name = 'Former player' where account_id = a;
  delete from public.hand_cards_private where account_id = a;
  delete from public.account_logins where account_id = a;
  delete from private.recovery_codes where account_id = a;
  delete from private.table_tickets where account_id = a;
end $$;

-- ---------------------------------------------------------------- 5. seasons and corrections stay right
-- (a) A game that reaches the database after its season was closed (a server catching up), a void, or a
--     correction changed the standings but not the season's trophies. Season trophies are now worked
--     out again whenever a closed season changes.
-- (b) adjust_result could move chips from a player with no final count (NULL passed the check) and so
--     make chips from nothing; it also left the comeback trophy as it was.
create function private.award_season(p_season uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.seasons;
begin
  select * into s from public.seasons where id = p_season;
  if s is null then return; end if;
  delete from public.trophies where season_id = s.id and kind in ('season_winner', 'iron_chair');
  insert into public.trophies (account_id, crew_id, season_id, kind, detail)
    select gp.account_id, s.crew_id, s.id, 'season_winner', jsonb_build_object('bb', sum(gp.bb_won))
    from public.games g join public.game_players gp on gp.game_id = g.id
    where g.season_id = s.id and g.status = 'ended' and not g.casual and gp.account_id is not null
    group by gp.account_id
    having sum(gp.bb_won) = (select max(t) from (select sum(gp2.bb_won) t from public.games g2 join public.game_players gp2 on gp2.game_id = g2.id
                              where g2.season_id = s.id and g2.status = 'ended' and not g2.casual and gp2.account_id is not null group by gp2.account_id) m)
    on conflict do nothing;
  insert into public.trophies (account_id, crew_id, season_id, kind, detail)
    select gp.account_id, s.crew_id, s.id, 'iron_chair', jsonb_build_object('games', count(*))
    from public.games g join public.game_players gp on gp.game_id = g.id
    where g.season_id = s.id and g.status = 'ended' and not g.casual and gp.account_id is not null
    group by gp.account_id
    having count(*) = (select max(t) from (select count(*) t from public.games g2 join public.game_players gp2 on gp2.game_id = g2.id
                        where g2.season_id = s.id and g2.status = 'ended' and not g2.casual and gp2.account_id is not null group by gp2.account_id) m)
    on conflict do nothing;
end $$;

-- the comeback trophy of one game, worked out from its results as they stand
create function private.award_comeback(g uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare x public.games;
begin
  select * into x from public.games where id = g;
  delete from public.trophies where game_id = g and kind = 'comeback';
  if x.status <> 'ended' then return; end if;
  insert into public.trophies (account_id, crew_id, game_id, kind, detail)
    select account_id, x.crew_id, g, 'comeback', jsonb_build_object('low', min_stack)
    from public.game_players where game_id = g and account_id is not null and net > 0 and min_stack is not null and min_stack < x.start_stack * 0.1
    on conflict do nothing;
end $$;

-- a change to a game in a season that is already closed: its trophies again
create function private.season_changed(g uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s uuid := (select season_id from public.games where id = g);
begin
  if s is not null and exists (select 1 from public.seasons where id = s and closed_at is not null) then perform private.award_season(s); end if;
end $$;

create or replace function public.close_due_seasons(p_body text, p_sig text) returns int
language plpgsql security definer set search_path = '' as $$
declare s record; n int := 0;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  for s in select * from public.seasons where closed_at is null and ends_at <= now() for update loop
    perform private.award_season(s.id);
    update public.seasons set closed_at = now() where id = s.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.record_game_end(p_body text, p_sig text) returns text
language plpgsql security definer set search_path = '' as $$
declare b jsonb; g jsonb; gid uuid; st text; p jsonb; acc uuid; c uuid; v_casual boolean; v_end timestamptz;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  begin
    b := p_body::jsonb; g := b -> 'game'; gid := (g ->> 'id')::uuid; v_end := (b ->> 'endedAt')::timestamptz;
    if gid is null or v_end is null or jsonb_typeof(b -> 'players') <> 'array' or (g ->> 'startStack') is null or (g ->> 'bigBlind') is null or (g ->> 'startedAt') is null
       or exists (select 1 from jsonb_array_elements(b -> 'players') x where x ->> 'key' is null or x ->> 'name' is null or (x ->> 'buyins') is null or (x ->> 'final') is null) then
      raise exception 'incomplete';
    end if;
  exception when others then
    -- a record that can never be stored is refused (the server sets it aside) instead of retried for ever
    raise exception 'That game end is not complete' using errcode = '22023';
  end;
  if (select coalesce(sum((x ->> 'final')::int - (x ->> 'buyins')::int), 1) from jsonb_array_elements(b -> 'players') x) <> 0 then
    raise exception 'Final chips do not add up to what was bought in' using errcode = '22023';
  end if;
  c := nullif(g ->> 'crew', '')::uuid;
  if c is not null and not exists (select 1 from public.crews where id = c) then c := null; end if;
  insert into public.games (id, crew_id, table_code, server, casual, start_stack, big_blind, started_at)
    values (gid, c, g ->> 'table', g ->> 'server', coalesce((g ->> 'casual')::boolean, false), (g ->> 'startStack')::int, (g ->> 'bigBlind')::int, (g ->> 'startedAt')::timestamptz)
    on conflict (id) do nothing;
  select x.status, x.casual, x.crew_id into st, v_casual, c from public.games x where x.id = gid for update;
  if st <> 'live' then return 'duplicate'; end if;
  for p in select * from jsonb_array_elements(b -> 'players') loop
    acc := nullif(p ->> 'account', '')::uuid;
    if acc is not null and not exists (select 1 from public.accounts where id = acc) then acc := null; end if;
    insert into public.game_players (game_id, player_key, account_id, name, buyins, final_chips, min_stack)
      values (gid, p ->> 'key', acc, p ->> 'name', (p ->> 'buyins')::int, (p ->> 'final')::int, (p ->> 'minStack')::int)
      on conflict (game_id, player_key) do update set name = excluded.name, buyins = excluded.buyins, final_chips = excluded.final_chips, min_stack = excluded.min_stack;
  end loop;
  update public.games set status = 'ended', ended_at = v_end,
    season_id = case when c is not null and not v_casual then private.season_for(c, v_end) end
  where id = gid;
  perform private.score_game(gid);
  perform private.award_comeback(gid);
  perform private.season_changed(gid); -- arrived after its season closed
  return 'ok';
end $$;

create or replace function public.void_game(p_game uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.games; a uuid;
begin
  select * into g from public.games where id = p_game for update;
  if g is null or g.crew_id is null then raise exception 'Only crew games can be voided' using errcode = 'P0002'; end if;
  a := private.need_admin(g.crew_id);
  if g.status = 'void' then raise exception 'Already void' using errcode = '22023'; end if;
  update public.games set status = 'void', void_reason = p_reason where id = p_game;
  delete from public.trophies where game_id = p_game;
  insert into public.result_changes (game_id, actor, what, reason) values (p_game, a, 'void', p_reason);
  perform private.season_changed(p_game);
end $$;

create or replace function public.adjust_result(p_game uuid, p_from text, p_to text, p_chips int, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.games; a uuid; have int; to_have int;
begin
  select * into g from public.games where id = p_game for update;
  if g is null or g.crew_id is null then raise exception 'Only crew games can be corrected' using errcode = 'P0002'; end if;
  a := private.need_admin(g.crew_id);
  if g.status <> 'ended' then raise exception 'Only a finished game can be corrected' using errcode = '22023'; end if;
  if p_chips is null or p_chips <= 0 or p_from = p_to then raise exception 'Move a positive number of chips between two players' using errcode = '22023'; end if;
  select final_chips into have from public.game_players where game_id = p_game and player_key = p_from for update;
  select final_chips into to_have from public.game_players where game_id = p_game and player_key = p_to for update;
  if have is null or to_have is null then raise exception 'Both players need a final chip count in this game' using errcode = 'P0002'; end if;
  if have < p_chips then raise exception 'That player does not have that many chips' using errcode = '22023'; end if;
  update public.game_players set final_chips = final_chips - p_chips where game_id = p_game and player_key = p_from;
  update public.game_players set final_chips = final_chips + p_chips where game_id = p_game and player_key = p_to;
  if (select sum(final_chips) - sum(buyins) from public.game_players where game_id = p_game and final_chips is not null) <> 0 then
    raise exception 'Chips would not add up' using errcode = '22023';
  end if;
  perform private.score_game(p_game);
  perform private.award_comeback(p_game);
  perform private.season_changed(p_game);
  insert into public.result_changes (game_id, actor, what, reason, detail)
    values (p_game, a, 'adjust', p_reason, jsonb_build_object('from', p_from, 'to', p_to, 'chips', p_chips));
end $$;

-- ---------------------------------------------------------------- 6. hands: trophies belong to the game's crew
create or replace function public.record_hand(p_body text, p_sig text) returns text
language plpgsql security definer set search_path = '' as $$
declare b jsonb; g jsonb; h jsonb; gid uuid; hno int; st text; p jsonb; acc uuid; c uuid; inserted boolean; cd jsonb;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  begin
    b := p_body::jsonb; g := b -> 'game'; h := b -> 'hand';
    gid := (g ->> 'id')::uuid; hno := (h ->> 'no')::int;
    if gid is null or hno is null or hno < 1 or jsonb_typeof(h -> 'players') <> 'array' or (h ->> 'playedAt') is null or (h ->> 'pot') is null
       or (g ->> 'startStack') is null or (g ->> 'bigBlind') is null or (g ->> 'startedAt') is null then
      raise exception 'incomplete';
    end if;
  exception when others then
    raise exception 'That hand is not complete' using errcode = '22023';
  end;
  if (select coalesce(sum((x ->> 'net')::int), 1) from jsonb_array_elements(h -> 'players') x) <> 0 then
    raise exception 'Chips do not add up in hand %', hno using errcode = '22023';
  end if;
  c := nullif(g ->> 'crew', '')::uuid;
  if c is not null and not exists (select 1 from public.crews where id = c) then c := null; end if;
  insert into public.games (id, crew_id, table_code, server, casual, start_stack, big_blind, started_at)
    values (gid, c, g ->> 'table', g ->> 'server', coalesce((g ->> 'casual')::boolean, false), (g ->> 'startStack')::int, (g ->> 'bigBlind')::int, (g ->> 'startedAt')::timestamptz)
    on conflict (id) do nothing;
  select x.status, x.crew_id into st, c from public.games x where x.id = gid for update; -- the game's crew, whatever a later body says
  if st = 'void' then return 'game over'; end if;
  insert into public.hands (game_id, hand_no, played_at, deck_commit, pot, record)
    values (gid, hno, (h ->> 'playedAt')::timestamptz, h ->> 'deckCommit', (h ->> 'pot')::int, h -> 'replay')
    on conflict do nothing returning true into inserted;
  if inserted is null then return 'duplicate'; end if;
  if h ? 'full' then insert into private.hand_records (game_id, hand_no, record) values (gid, hno, h -> 'full') on conflict do nothing; end if;
  for p in select * from jsonb_array_elements(h -> 'players') loop
    acc := nullif(p ->> 'account', '')::uuid;
    if acc is not null and not exists (select 1 from public.accounts where id = acc) then acc := null; end if;
    insert into public.game_players (game_id, player_key, account_id, name) values (gid, p ->> 'key', acc, p ->> 'name')
      on conflict (game_id, player_key) do nothing;
    insert into public.hand_players (game_id, hand_no, player_key, account_id, net, vpip, pfr, showdown, won, best_hand)
      values (gid, hno, p ->> 'key', acc, (p ->> 'net')::int, coalesce((p ->> 'vpip')::boolean, false), coalesce((p ->> 'pfr')::boolean, false),
              coalesce((p ->> 'showdown')::boolean, false), coalesce((p ->> 'won')::boolean, false), (p ->> 'bestHand')::int);
    cd := p -> 'cards';
    if acc is not null and jsonb_typeof(cd) = 'array' then
      insert into public.hand_cards_private (game_id, hand_no, account_id, cards)
        values (gid, hno, acc, array(select jsonb_array_elements_text(cd))) on conflict do nothing;
    end if;
    if acc is not null and coalesce((p ->> 'won')::boolean, false) and coalesce((p ->> 'showdown')::boolean, false) and (p ->> 'bestHand')::int >= 7 then
      insert into public.trophies (account_id, crew_id, game_id, hand_no, kind)
        values (acc, c, gid, hno, case (p ->> 'bestHand')::int when 9 then 'royal_flush' when 8 then 'straight_flush' else 'four_of_a_kind' end)
        on conflict do nothing;
    end if;
  end loop;
  update public.games set hands = hands + 1 where id = gid;
  if st = 'ended' then perform private.score_game(gid); end if; -- arrived late: stats again
  return 'ok';
end $$;

-- ---------------------------------------------------------------- 7. the fairness proof, on request
-- The live table no longer shows the shuffle seed (with it anyone could work out the hands that were
-- folded). A player who was dealt into a hand can ask for it once the game is over, and check that the
-- deck was the one promised before the deal.
create function public.hand_proof(p_game uuid, p_hand int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare st text; r jsonb; dc text;
begin
  if not exists (select 1 from public.hand_players where game_id = p_game and hand_no = p_hand and account_id = private.me()) then
    raise exception 'Only players dealt into that hand can check it' using errcode = '42501';
  end if;
  select status into st from public.games where id = p_game;
  if st = 'live' then raise exception 'The proof is shown once the game is over' using errcode = '22023'; end if;
  select x.record -> 'proof', h.deck_commit into r, dc from private.hand_records x join public.hands h using (game_id, hand_no) where x.game_id = p_game and x.hand_no = p_hand;
  if r is null then return null; end if; -- older than 90 days
  return r || jsonb_build_object('deckCommit', dc);
end $$;

-- ---------------------------------------------------------------- 8. the recorder signs every call
-- The table servers used to send the recorder token itself with every call; anyone who saw one call
-- could make up results for ever. Now each call carries "v1.<time>.<HMAC-SHA256 of time.body>", keyed
-- with the token's hash (the value the database already keeps); a call is good for 10 minutes. The old
-- form is accepted until the servers are updated (removed in the next migration).
create or replace function private.recorder_ok(body text, sig text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare k text := (select value from private.settings where key = 'recorder_token_hash'); parts text[]; ts bigint;
begin
  if k is null or sig is null or body is null then return false; end if;
  parts := string_to_array(sig, '.');
  if array_length(parts, 1) = 3 and parts[1] = 'v1' and parts[2] ~ '^[0-9]{10,16}$' then
    ts := parts[2]::bigint;
    if abs(extract(epoch from now()) * 1000 - ts) > 600000 then return false; end if;
    return encode(extensions.hmac(parts[2] || '.' || body, k, 'sha256'), 'hex') = lower(parts[3]);
  end if;
  return encode(extensions.digest(sig, 'sha256'), 'hex') = k; -- the old form (until the next migration)
end $$;
revoke all on function private.recorder_ok(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 9. backups leave the recorder key out
-- (A copy of the database must not let its holder sign results.) A restore keeps the new project's key.
create or replace function public.export_backup(p_body text, p_sig text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb := jsonb_build_object('version', 1, 'at', now()); t text; rows jsonb;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  foreach t in array private.backup_tables() loop
    if t = 'private.settings' then
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into rows from private.settings x where x.key <> 'recorder_token_hash';
    else
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %s x', t) into rows;
    end if;
    out := out || jsonb_build_object(t, rows);
  end loop;
  return out;
end $$;

create or replace function private.import_backup(b jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t text; n int; counts jsonb := '{}'::jsonb; seq text;
begin
  if (b ->> 'version')::int is distinct from 1 then raise exception 'Unknown backup version'; end if;
  delete from private.settings where key <> 'recorder_token_hash';
  foreach t in array private.backup_tables() loop
    execute format('insert into %s overriding system value select * from jsonb_populate_recordset(null::%s, $1) on conflict do nothing', t, t) using coalesce(b -> t, '[]'::jsonb);
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object(t, n);
  end loop;
  for t, seq in select c.relnamespace::regnamespace || '.' || c.relname, pg_get_serial_sequence(c.relnamespace::regnamespace || '.' || c.relname, a.attname)
    from pg_attribute a join pg_class c on c.oid = a.attrelid
    where a.attidentity <> '' and c.relnamespace::regnamespace::text in ('public', 'private') loop
    execute format('select setval(%L, greatest((select coalesce(max(id), 0) from %s), 1))', seq, t);
  end loop;
  return counts;
end $$;

-- daily upkeep also finishes rescues that have waited long enough (nobody has to keep a phone open)
create or replace function public.daily_upkeep(p_body text, p_sig text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare closed int; pruned int; q record; finished int := 0;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  closed := public.close_due_seasons(p_body, p_sig);
  update public.hands h set record = null
    where h.record is not null and h.played_at < now() - interval '90 days'
      and not exists (select 1 from public.trophies t where t.game_id = h.game_id and t.hand_no = h.hand_no);
  get diagnostics pruned = row_count;
  delete from public.hand_cards_private c using public.hands h
    where h.game_id = c.game_id and h.hand_no = c.hand_no and h.played_at < now() - interval '90 days'
      and not exists (select 1 from public.trophies t where t.game_id = h.game_id and t.hand_no = h.hand_no);
  delete from private.hand_records r using public.hands h
    where h.game_id = r.game_id and h.hand_no = r.hand_no and h.played_at < now() - interval '90 days'
      and not exists (select 1 from public.trophies t where t.game_id = h.game_id and t.hand_no = h.hand_no);
  for q in select id from public.rescue_requests where status = 'approved' loop
    if private.finish_rescue_if_due(q.id) = 'done' then finished := finished + 1; end if;
  end loop;
  delete from private.recovery_attempts where at < now() - interval '1 day';
  return jsonb_build_object('seasons_closed', closed, 'replays_pruned', pruned, 'rescues_finished', finished);
end $$;

-- ---------------------------------------------------------------- 10. rights
revoke all on all sequences in schema public from anon, authenticated;
revoke all on function private.rescue_due(public.rescue_requests), private.finish_rescue_if_due(uuid), private.need_settled(), private.award_season(uuid),
  private.award_comeback(uuid), private.season_changed(uuid), private.import_backup(jsonb) from public, anon, authenticated;
revoke all on function public.request_rescue(text, uuid), public.decide_rescue(uuid, boolean), public.rescue_status(uuid), public.rescues_of_me(),
  public.logout_other_phones(), public.logout_phone(uuid), public.new_recovery_code(), public.delete_crew(uuid), public.set_role(uuid, uuid, public.crew_role),
  public.remove_member(uuid, uuid), public.revoke_invites(uuid), public.join_crew(text), public.recover_account(text, boolean), public.delete_my_account(),
  public.void_game(uuid, text), public.adjust_result(uuid, text, text, int, text), public.hand_proof(uuid, int) from public, anon, authenticated;
grant execute on function public.request_rescue(text, uuid), public.decide_rescue(uuid, boolean), public.rescue_status(uuid), public.rescues_of_me(),
  public.logout_other_phones(), public.logout_phone(uuid), public.new_recovery_code(), public.delete_crew(uuid), public.set_role(uuid, uuid, public.crew_role),
  public.remove_member(uuid, uuid), public.revoke_invites(uuid), public.join_crew(text), public.recover_account(text, boolean), public.delete_my_account(),
  public.void_game(uuid, text), public.adjust_result(uuid, text, text, int, text), public.hand_proof(uuid, int) to authenticated;
revoke all on function public.record_hand(text, text), public.record_game_end(text, text), public.close_due_seasons(text, text), public.daily_upkeep(text, text),
  public.export_backup(text, text) from public, anon, authenticated;
grant execute on function public.record_hand(text, text), public.record_game_end(text, text), public.close_due_seasons(text, text), public.daily_upkeep(text, text),
  public.export_backup(text, text) to anon;
