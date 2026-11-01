-- Phase 5: nights played offline on the host phone.
-- The host phone has no internet during the night, so it cannot check who each phone is. Its hands are
-- uploaded later (by the host phone through a table server, which replays every hand to check it) and the
-- game waits (awaiting_confirmation) until two of its players confirm it from their own phones, or a crew
-- admin does; until then it is not in the league and gives no trophies.
-- A player whose name was used by someone else says "That wasn't me" and the seat becomes a guest.
alter table public.games add column awaiting_confirmation boolean not null default false;

create table public.offline_confirmations (
  game_id uuid not null references public.games(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  at timestamptz not null default now(),
  primary key (game_id, account_id)
);
alter table public.offline_confirmations enable row level security;
create policy confirmations_read on public.offline_confirmations for select to authenticated using (private.can_see_game(game_id));
revoke all on public.offline_confirmations from anon, authenticated;
grant select on public.offline_confirmations to authenticated;

create or replace function public.record_hand(p_body text, p_sig text) returns text
language plpgsql security definer set search_path = '' as $$
declare b jsonb; g jsonb; h jsonb; gid uuid; hno int; st text; p jsonb; acc uuid; c uuid; inserted boolean; cd jsonb; srv text;
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
  select x.status, x.crew_id, x.server into st, c, srv from public.games x where x.id = gid for update; -- the game's crew, whatever a later body says
  -- an offline night (server 'host') is uploaded by whoever has it; it can never add hands to an online game, or the reverse
  if srv is distinct from (g ->> 'server') then raise exception 'That game was played elsewhere' using errcode = '22023'; end if;
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
    if srv <> 'host' and acc is not null and coalesce((p ->> 'won')::boolean, false) and coalesce((p ->> 'showdown')::boolean, false) and (p ->> 'bestHand')::int >= 7 then
      insert into public.trophies (account_id, crew_id, game_id, hand_no, kind)
        values (acc, c, gid, hno, case (p ->> 'bestHand')::int when 9 then 'royal_flush' when 8 then 'straight_flush' else 'four_of_a_kind' end)
        on conflict do nothing;
    end if;
  end loop;
  update public.games set hands = hands + 1 where id = gid;
  if st = 'ended' then perform private.score_game(gid); end if; -- arrived late: stats again
  return 'ok';
end $$;

create or replace function public.record_game_end(p_body text, p_sig text) returns text
language plpgsql security definer set search_path = '' as $$
declare b jsonb; g jsonb; gid uuid; st text; p jsonb; acc uuid; c uuid; v_casual boolean; v_end timestamptz; srv text; waiting boolean;
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
  select x.status, x.casual, x.crew_id, x.server, x.awaiting_confirmation into st, v_casual, c, srv, waiting from public.games x where x.id = gid for update;
  if srv is distinct from (g ->> 'server') then raise exception 'That game was played elsewhere' using errcode = '22023'; end if;
  if st <> 'live' or waiting then return 'duplicate'; end if;
  for p in select * from jsonb_array_elements(b -> 'players') loop
    acc := nullif(p ->> 'account', '')::uuid;
    if acc is not null and not exists (select 1 from public.accounts where id = acc) then acc := null; end if;
    insert into public.game_players (game_id, player_key, account_id, name, buyins, final_chips, min_stack)
      values (gid, p ->> 'key', acc, p ->> 'name', (p ->> 'buyins')::int, (p ->> 'final')::int, (p ->> 'minStack')::int)
      on conflict (game_id, player_key) do update set name = excluded.name, buyins = excluded.buyins, final_chips = excluded.final_chips, min_stack = excluded.min_stack;
  end loop;
  -- an offline night counts once two of its players (or a crew admin) confirm it online
  update public.games set status = case when srv = 'host' then 'live' else 'ended' end, awaiting_confirmation = (srv = 'host'), ended_at = v_end,
    season_id = case when c is not null and not v_casual then private.season_for(c, v_end) end
  where id = gid;
  perform private.score_game(gid);
  if srv <> 'host' then
    perform private.award_comeback(gid);
    perform private.season_changed(gid);
  end if; -- arrived after its season closed
  return 'ok';
end $$;

-- hand trophies (four of a kind and better, won at showdown) of one game, from its hands
create function private.award_hand_trophies(g uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c uuid := (select crew_id from public.games where id = g);
begin
  insert into public.trophies (account_id, crew_id, game_id, hand_no, kind)
    select hp.account_id, c, g, hp.hand_no, case hp.best_hand when 9 then 'royal_flush' when 8 then 'straight_flush' else 'four_of_a_kind' end
    from public.hand_players hp where hp.game_id = g and hp.account_id is not null and hp.won and hp.showdown and hp.best_hand >= 7
    on conflict do nothing;
end $$;

-- "Yes, I played this and the results are right." Two players (or one crew admin) make it count.
create function public.confirm_offline_game(p_game uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := private.need_me(); g public.games; n int; admin boolean;
begin
  select * into g from public.games where id = p_game for update;
  if g is null or g.status <> 'live' or not g.awaiting_confirmation then raise exception 'This game is not waiting for confirmation' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game and account_id = me)
     and not coalesce(private.role_in(g.crew_id, me) in ('owner', 'admin'), false) then
    raise exception 'Only its players or a crew admin can confirm this game' using errcode = '42501';
  end if;
  insert into public.offline_confirmations (game_id, account_id) values (p_game, me) on conflict do nothing;
  select count(*) into n from public.offline_confirmations x join public.game_players gp on gp.game_id = x.game_id and gp.account_id = x.account_id where x.game_id = p_game;
  if n >= 2 or coalesce(private.role_in(g.crew_id, me) in ('owner', 'admin'), false) then
    admin := coalesce(private.role_in(g.crew_id, me) in ('owner', 'admin'), false);
    -- every account vouches for itself: a seat whose account never confirmed becomes a guest's seat (so an
    -- upload can never put a made-up night into someone's history); a crew admin vouches for the crew's members
    update public.game_players p set account_id = null where p.game_id = p_game and p.account_id is not null
      and not exists (select 1 from public.offline_confirmations o where o.game_id = p_game and o.account_id = p.account_id)
      and not (admin and private.role_in(g.crew_id, p.account_id) is not null);
    update public.hand_players hp set account_id = null where hp.game_id = p_game and hp.account_id is not null
      and not exists (select 1 from public.game_players p where p.game_id = p_game and p.account_id = hp.account_id);
    delete from public.hand_cards_private c where c.game_id = p_game
      and not exists (select 1 from public.game_players p where p.game_id = p_game and p.account_id = c.account_id);
    -- and it reaches the crew's league only when two of the crew's own members (or an admin) confirmed it
    if g.crew_id is not null and not admin and (select count(*) from public.offline_confirmations o where o.game_id = p_game and private.role_in(g.crew_id, o.account_id) is not null) < 2 then
      update public.games set crew_id = null, season_id = null where id = p_game;
      g.crew_id := null;
    end if;
    update public.games set status = 'ended', awaiting_confirmation = false where id = p_game;
    perform private.score_game(p_game);
    perform private.award_comeback(p_game);
    perform private.award_hand_trophies(p_game);
    perform private.season_changed(p_game);
    if g.crew_id is not null then
      insert into public.result_changes (game_id, actor, what, reason) values (p_game, me, 'offline_confirmed', 'Played offline; confirmed by its players');
    end if;
    return 'ended';
  end if;
  return 'pending';
end $$;

-- "That wasn't me": someone used my name at an offline table. The seat becomes a guest's (no history, no league).
create function public.dispute_offline_seat(p_game uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := private.need_me(); g public.games;
begin
  select * into g from public.games where id = p_game for update;
  if g is null or g.server <> 'host' or g.status <> 'live' then raise exception 'Only an offline game waiting for confirmation can be disputed' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.game_players where game_id = p_game and account_id = me) then raise exception 'You are not in this game' using errcode = 'P0002'; end if;
  update public.game_players set account_id = null where game_id = p_game and account_id = me;
  update public.hand_players set account_id = null where game_id = p_game and account_id = me;
  delete from public.hand_cards_private where game_id = p_game and account_id = me;
  delete from public.offline_confirmations where game_id = p_game and account_id = me;
  if g.crew_id is not null then
    insert into public.result_changes (game_id, actor, what, reason) values (p_game, me, 'offline_disputed', 'A player said a seat with their name was not them');
  end if;
end $$;

-- My games waiting for confirmation (shown on the profile and in history)
create function public.pending_offline_games() returns table (game_id uuid, ended_at timestamptz, crew_name text, players int, hands int, net int, confirmed boolean, confirmations int)
language sql stable security definer set search_path = '' as $$
  select g.id, g.ended_at, c.name, (select count(*)::int from public.game_players x where x.game_id = g.id), g.hands, gp.net,
    exists (select 1 from public.offline_confirmations o where o.game_id = g.id and o.account_id = private.me()),
    (select count(*)::int from public.offline_confirmations o where o.game_id = g.id)
  from public.games g join public.game_players gp on gp.game_id = g.id and gp.account_id = private.me() left join public.crews c on c.id = g.crew_id
  where g.status = 'live' and g.awaiting_confirmation
  order by g.ended_at desc limit 20
$$;

revoke all on function private.award_hand_trophies(uuid) from public, anon, authenticated;
revoke all on function public.confirm_offline_game(uuid), public.dispute_offline_seat(uuid), public.pending_offline_games(),
  public.record_hand(text, text), public.record_game_end(text, text) from public, anon, authenticated;
grant execute on function public.confirm_offline_game(uuid), public.dispute_offline_seat(uuid), public.pending_offline_games() to authenticated;
grant execute on function public.record_hand(text, text), public.record_game_end(text, text) to anon;

create or replace function private.backup_tables() returns text[] language sql immutable set search_path = '' as $$
  select array['private.settings', 'public.accounts', 'public.account_logins', 'private.recovery_codes', 'public.crews', 'public.crew_members',
    'public.crew_invites', 'public.rescue_requests', 'public.crew_audit', 'public.seasons', 'public.games', 'public.game_players',
    'public.hands', 'public.hand_players', 'public.hand_cards_private', 'private.hand_records', 'public.trophies', 'public.result_changes',
    'public.offline_confirmations']
$$;

-- (found while testing the above) "x in (...)" is NULL, not false, when x is NULL: rescue_status let a
-- stranger who knew a request's id see it and move it on. Every check is now an explicit true.
create or replace function public.rescue_status(p_request uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.rescue_requests; st text;
begin
  select * into q from public.rescue_requests where id = p_request;
  if q is null or not coalesce(q.requester_auth = auth.uid() or q.target_account = private.me() or private.role_in(q.crew_id, private.me()) in ('owner', 'admin'), false) then
    return null;
  end if;
  st := private.finish_rescue_if_due(q.id);
  select * into q from public.rescue_requests where id = p_request;
  return jsonb_build_object('status', st, 'finishes_at', case when st = 'approved' then private.rescue_due(q) end);
end $$;
revoke all on function public.rescue_status(uuid) from public, anon, authenticated;
grant execute on function public.rescue_status(uuid) to authenticated;

-- History lists finished games only: an uploaded night waiting for confirmation is shown on its own
-- (pending_offline_games), where the player confirms it or says it was not them.
create or replace function public.my_games(p_limit int default 50, p_before timestamptz default null) returns table (
  game_id uuid, ended_at timestamptz, crew_id uuid, crew_name text, table_code text, players int, hands int,
  net int, bb_won numeric, place int, casual boolean, status text)
language sql stable security definer set search_path = '' as $$
  select g.id, coalesce(g.ended_at, g.started_at), g.crew_id, c.name, g.table_code,
    (select count(*)::int from public.game_players x where x.game_id = g.id), g.hands,
    gp.net, gp.bb_won, gp.place, g.casual, g.status
  from public.game_players gp join public.games g on g.id = gp.game_id left join public.crews c on c.id = g.crew_id
  where gp.account_id = private.me() and not g.awaiting_confirmation and (p_before is null or coalesce(g.ended_at, g.started_at) < p_before)
  order by coalesce(g.ended_at, g.started_at) desc limit least(greatest(p_limit, 1), 200)
$$;
revoke all on function public.my_games(int, timestamptz) from public, anon, authenticated;
grant execute on function public.my_games(int, timestamptz) to authenticated;
