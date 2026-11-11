-- The league's new game score, and the notifications inbox (the bell).
--
-- Game score for one crew game that counts (three or more players):
--   + place points: one for every player you finish above (1st of 7 gets 6, last gets 0)
--   + chip score: net chips ÷ the starting stack × 5, to one decimal, at most ±5
--     (doubling your starting stack is +5, losing all of it is −5)
--   − 1 for every rebuy
-- There is no point for just playing any more, so a score (and an average) can be below zero.
-- A season ranks by the average game score; four games to be ranked (was three). Crew games with two
-- players no longer count for the league. Nothing stored changes: scores are worked out from the games as
-- they are, so the current season is recalculated the moment this runs.
-- The 'bb' and 'average' crew settings are as before (average: three nights to be ranked).

create or replace function private.game_score(n int, place int, net numeric, start_stack numeric, rebuys int) returns numeric
language sql immutable set search_path = '' as $$
  select greatest(n - least(place, n), 0)
    + round(greatest(least(coalesce(net / nullif(start_stack, 0), 0) * 5, 5), -5), 1)
    - greatest(rebuys, 0)
$$;

-- pts and points become numbers with one decimal: the two functions are made anew (the pages that read them
-- take whatever they return)
drop function private.league_standings(uuid, uuid, boolean);
drop function private.nights(uuid, uuid, boolean);

create function private.nights(c uuid, s uuid, all_time boolean)
returns table (account_id uuid, game_id uuid, ended_at timestamptz, bb numeric, place int, players int, rebuys int, busted boolean, pts numeric,
  hands int, showdowns int, showdowns_won int)
language sql stable security definer set search_path = '' as $$
  with p as (
    select gp.account_id, gp.game_id, g.ended_at, gp.bb_won, gp.final_chips, gp.hands, gp.showdowns, gp.showdowns_won, gp.net, g.start_stack,
      count(*) over (partition by gp.game_id)::int n,
      coalesce(gp.place, (rank() over (partition by gp.game_id order by gp.net desc))::int) pl,
      greatest(round(gp.buyins::numeric / nullif(g.start_stack, 0))::int - 1, 0) rb
    from public.games g join public.game_players gp on gp.game_id = g.id
    where g.crew_id = c and g.status = 'ended' and not g.casual and gp.net is not null and (all_time or g.season_id = s)
  )
  select p.account_id, p.game_id, p.ended_at, p.bb_won, least(p.pl, p.n), p.n, p.rb,
    p.final_chips = 0 or (p.n > 1 and p.pl >= p.n), private.game_score(p.n, p.pl, p.net, p.start_stack, p.rb),
    p.hands, p.showdowns, p.showdowns_won
  from p where p.account_id is not null and p.bb_won is not null and p.n >= 3
$$;

create function private.league_standings(c uuid, s uuid, all_time boolean)
returns table (account_id uuid, name text, games int, points numeric, avg numeric, bb numeric, wins int, top3 int, busts int, rebuys int,
  rank int, trend text, member boolean, ranked boolean)
language sql stable security definer set search_path = '' as $$
  with mode as (select coalesce((select scoring from public.crews where id = c), 'points') m),
  t as (
    select x.account_id, count(*)::int games, sum(x.pts) points, sum(x.bb) bb,
      (count(*) filter (where x.place = 1))::int wins, (count(*) filter (where x.place <= 3))::int top3,
      (count(*) filter (where x.busted))::int busts, sum(x.rebuys)::int rebuys,
      (array_agg(x.bb order by x.ended_at desc))[1] last
    from private.nights(c, s, all_time) x group by x.account_id
  ), u as (
    select t.*, case when m = 'points' then round(t.points / t.games, 2) else round(t.bb / t.games, 2) end av,
      (m = 'bb' or t.games >= case when m = 'points' then 4 else 3 end) rk, m,
      case when mm.account_id is not null and a.deleted_at is null then a.name else 'Former player' end nm, mm.account_id is not null mem
    from t cross join mode join public.accounts a on a.id = t.account_id
    left join public.crew_members mm on mm.crew_id = c and mm.account_id = t.account_id and mm.status = 'active'
  ), v as (
    select u.*, case when u.m = 'bb' then u.bb else u.av end k from u
  )
  select v.account_id, v.nm, v.games, v.points, v.av, v.bb, v.wins, v.top3, v.busts, v.rebuys,
    case when v.rk then (rank() over (partition by v.rk order by v.k desc, case when v.m = 'bb' then 0 else v.bb end desc))::int end,
    case when v.last > 0 then 'up' when v.last < 0 then 'down' else '' end, v.mem, v.rk
  from v
  order by v.rk desc, v.k desc, v.bb desc, v.nm
$$;

revoke all on function private.game_score(int, int, numeric, numeric, int), private.nights(uuid, uuid, boolean),
  private.league_standings(uuid, uuid, boolean) from public, anon, authenticated;

-- the league page says how many games it takes to be ranked: 4 for points, 3 for big blinds per night
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'crew_league';
  if d is null or position('''min_nights'', 3,' in d) = 0 then raise exception 'crew_league is not as expected: min_nights was not found'; end if;
  execute replace(d, '''min_nights'', 3,', '''min_nights'', case when (select scoring from public.crews where id = p_crew) = ''points'' then 4 else 3 end,');
end $$;

-- ---------------------------------------------------------------- the notifications inbox
-- Everything the app would notify you about is already written to private.push_outbox whether or not this
-- phone has notifications on. The bell reads your own rows; they are now kept 30 days (were 7).
alter table private.push_outbox drop constraint push_outbox_kind_check;
alter table private.push_outbox add constraint push_outbox_kind_check check (kind in ('crew', 'trophies', 'crewTable', 'devices', 'test'));

create function public.my_notifications() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'title', o.title, 'body', o.body, 'url', o.url, 'at', o.at) order by o.at desc, o.id desc), '[]'::jsonb)
  from (select * from private.push_outbox where account_id = private.need_me() and kind <> 'test' and at > now() - interval '30 days' order by at desc, id desc limit 100) o
$$;

-- "Send me a test": one notification to your own phones, through the same queue as the real ones
-- (so it shows the whole path works). At most one every 20 seconds.
create function public.send_test_push() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := private.need_me(); n int;
begin
  if exists (select 1 from private.push_outbox where account_id = me and kind = 'test' and at > now() - interval '20 seconds') then
    raise exception 'A test is already on its way. Give it a moment.' using errcode = '54000';
  end if;
  select count(*) into n from public.push_subscriptions where account_id = me;
  if n = 0 then raise exception 'Notifications are not on for this account yet' using errcode = '22023'; end if;
  insert into private.push_outbox (account_id, kind, title, body, url, tag, dedupe)
    values (me, 'test', 'Train Poker', 'Notifications work on this phone. You will hear when a crew table starts.', '/', 'test', 'test:' || extract(epoch from clock_timestamp())::text);
  return jsonb_build_object('phones', n);
end $$;

revoke all on function public.my_notifications(), public.send_test_push() from public, anon, authenticated;
grant execute on function public.my_notifications(), public.send_test_push() to authenticated;

-- the nightly clean-up keeps the outbox 30 days (the same function as it is now, with that one number changed)
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'daily_upkeep';
  if d is null or position('delete from private.push_outbox where at < now() - interval ''7 days''' in d) = 0 then
    raise exception 'daily_upkeep is not as expected: the outbox clean-up line was not found';
  end if;
  execute replace(d, 'delete from private.push_outbox where at < now() - interval ''7 days''', 'delete from private.push_outbox where at < now() - interval ''30 days''');
end $$;
