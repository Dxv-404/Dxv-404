-- League scoring ("points per night, with penalties") and season control (the leader's).
--
-- Points for one night (a crew game that counts):
--   +1 for playing
--   + finish points by table size: place p of n players gets n − p (1st of 9 gets 8, last gets 0); the place is
--     game_players.place, or the rank by net when it has none
--   + big blinds: +1 per 20 bb won, −1 per 20 bb lost, at most ±5 (toward zero: 39 bb is +1, −45 bb is −2)
--   − 1 per rebuy. game_players.buyins holds the chips bought in, so rebuys = round(buyins / start stack) − 1,
--     never below 0.
-- A season ranks by average points per night; every night counts. Fewer than 3 nights in the season: unranked
-- (listed after the ranked rows with their numbers, rank null). Ties: total bb won, then the name.
-- Crew setting scoring: 'points' (every crew), 'bb' (as before: total big blinds won, everyone ranked) or
-- 'average' (big blinds per night, 3 nights to be ranked).
--
-- Seasons: 2 weeks (season_weeks = 2, season_months kept above 0 so "seasons on" reads as before), 1, 2, 3 or 6
-- months, or off (season_months = 0). season_anchor is the India date seasons are counted from (set by "next
-- season starts on" or "start a new season now"); without it months follow the calendar as before and 2 weeks
-- count from Monday 5 Jan 2026. Seasons may have a name of their own (seasons.title: "Season 3 · Monsoon").
-- Everything here is additive: create or replace, new columns with defaults, new functions.

-- ---------------------------------------------------------------- columns
alter table public.crews drop constraint if exists crews_season_months_check;
alter table public.crews add constraint crews_season_months_check check (season_months in (0, 1, 2, 3, 6));
alter table public.crews
  add column if not exists season_weeks int check (season_weeks in (2)),
  add column if not exists season_anchor date,
  add column if not exists scoring text not null default 'points' check (scoring in ('points', 'bb', 'average'));
alter table public.seasons add column if not exists title text check (title is null or char_length(title) between 1 and 24);

-- '2w' '1m' '2m' '3m' '6m' 'off'
create or replace function private.season_length(c public.crews) returns text
language sql immutable set search_path = '' as $$
  select case when c.season_months = 0 then 'off' when c.season_weeks is not null then c.season_weeks || 'w' else c.season_months || 'm' end
$$;

-- ---------------------------------------------------------------- the season a moment falls in
-- The period of the crew's length (from its anchor) holding `at`; then, as before, it never overlaps a season
-- already there (one ended early or started now, or the length changed in between), and seasons are numbered.
create or replace function private.season_bounds(c uuid, at timestamptz, out s timestamptz, out e timestamptz, out nm text)
language plpgsql stable security definer set search_path = '' as $$
declare cr public.crews; loc timestamp := at at time zone 'Asia/Kolkata'; f0 timestamp; f1 timestamp; months int; anc date; k int; d int;
begin
  select * into cr from public.crews where id = c;
  months := coalesce(cr.season_months, 3);
  if months = 0 then
    s := date_trunc('day', loc) at time zone 'Asia/Kolkata'; e := 'infinity'; nm := 'All-time'; return;
  end if;
  if cr.season_weeks is not null then
    d := cr.season_weeks * 7;
    anc := coalesce(cr.season_anchor, date '2026-01-05');
    k := floor((loc::date - anc)::numeric / d)::int;
    f0 := (anc + k * d)::timestamp; f1 := f0 + make_interval(days => d);
    nm := to_char(f0, 'DD Mon') || '–' || to_char(f1 - interval '1 day', 'DD Mon YYYY');
  else
    if cr.season_anchor is null then
      f0 := date_trunc('month', loc) - make_interval(months => ((extract(month from loc)::int - 1) % months));
      f1 := f0 + make_interval(months => months);
    else
      anc := cr.season_anchor;
      k := floor(((extract(year from loc)::int * 12 + extract(month from loc)::int) - (extract(year from anc)::int * 12 + extract(month from anc)::int))::numeric / months)::int;
      loop
        f0 := anc::timestamp + make_interval(months => k * months);
        exit when f0 <= loc;
        k := k - 1;
      end loop;
      while anc::timestamp + make_interval(months => (k + 1) * months) <= loc loop k := k + 1; end loop;
      f0 := anc::timestamp + make_interval(months => k * months);
      f1 := anc::timestamp + make_interval(months => (k + 1) * months);
    end if;
    nm := case when months = 1 and extract(day from f0) = 1 then to_char(f0, 'Mon YYYY')
      when extract(day from f0) = 1 then to_char(f0, 'Mon') || '–' || to_char(f1 - interval '1 day', 'Mon YYYY')
      else to_char(f0, 'DD Mon') || '–' || to_char(f1 - interval '1 day', 'DD Mon YYYY') end;
  end if;
  s := f0 at time zone 'Asia/Kolkata'; e := f1 at time zone 'Asia/Kolkata';
end $$;

create or replace function private.season_for(c uuid, at timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s timestamptz; e timestamptz; nm text; sid uuid; prev timestamptz; nxt timestamptz;
begin
  select id into sid from public.seasons where crew_id = c and starts_at <= at and ends_at > at order by starts_at desc limit 1;
  if sid is not null then return sid; end if;
  select b.s, b.e, b.nm into s, e, nm from private.season_bounds(c, at) b;
  select max(ends_at) into prev from public.seasons where crew_id = c and starts_at <= at;
  if prev is not null and prev > s then s := prev; end if;
  select min(starts_at) into nxt from public.seasons where crew_id = c and starts_at > at;
  if nxt is not null and nxt < e then e := nxt; end if;
  insert into public.seasons (crew_id, name, starts_at, ends_at) values (c, nm, s, e)
    on conflict (crew_id, starts_at) do nothing returning seasons.id into sid;
  if sid is null then select seasons.id into sid from public.seasons where crew_id = c and starts_at = s; end if;
  perform private.number_seasons(c);
  return sid;
end $$;

create or replace function private.number_seasons(c uuid) returns void
language sql security definer set search_path = '' as $$
  update public.seasons x set number = r.n from (select id, row_number() over (order by starts_at) n from public.seasons where crew_id = c) r
    where r.id = x.id and x.number is distinct from r.n
$$;

-- ---------------------------------------------------------------- points for each night
create or replace function private.night_points(n int, place int, bb numeric, rebuys int) returns int
language sql immutable set search_path = '' as $$
  select 1 + greatest(n - least(place, n), 0) + (sign(bb) * least(floor(abs(bb) / 20), 5))::int - greatest(rebuys, 0)
$$;

create or replace function private.nights(c uuid, s uuid, all_time boolean)
returns table (account_id uuid, game_id uuid, ended_at timestamptz, bb numeric, place int, players int, rebuys int, busted boolean, pts int,
  hands int, showdowns int, showdowns_won int)
language sql stable security definer set search_path = '' as $$
  with p as (
    select gp.account_id, gp.game_id, g.ended_at, gp.bb_won, gp.final_chips, gp.hands, gp.showdowns, gp.showdowns_won,
      count(*) over (partition by gp.game_id)::int n,
      coalesce(gp.place, (rank() over (partition by gp.game_id order by gp.net desc))::int) pl,
      greatest(round(gp.buyins::numeric / nullif(g.start_stack, 0))::int - 1, 0) rb
    from public.games g join public.game_players gp on gp.game_id = g.id
    where g.crew_id = c and g.status = 'ended' and not g.casual and gp.net is not null and (all_time or g.season_id = s)
  )
  select p.account_id, p.game_id, p.ended_at, p.bb_won, least(p.pl, p.n), p.n, p.rb,
    p.final_chips = 0 or (p.n > 1 and p.pl >= p.n), private.night_points(p.n, p.pl, p.bb_won, p.rb),
    p.hands, p.showdowns, p.showdowns_won
  from p where p.account_id is not null and p.bb_won is not null
$$;

-- ---------------------------------------------------------------- standings in the crew's scoring
drop function if exists private.standings(uuid, uuid, boolean);
create function private.standings(c uuid, s uuid, all_time boolean)
returns table (account_id uuid, name text, games int, points int, avg numeric, bb numeric, wins int, top3 int, busts int, rebuys int,
  rank int, trend text, member boolean, ranked boolean)
language sql stable security definer set search_path = '' as $$
  with mode as (select coalesce((select scoring from public.crews where id = c), 'points') m),
  t as (
    select x.account_id, count(*)::int games, sum(x.pts)::int points, sum(x.bb) bb,
      (count(*) filter (where x.place = 1))::int wins, (count(*) filter (where x.place <= 3))::int top3,
      (count(*) filter (where x.busted))::int busts, sum(x.rebuys)::int rebuys,
      (array_agg(x.bb order by x.ended_at desc))[1] last
    from private.nights(c, s, all_time) x group by x.account_id
  ), u as (
    select t.*, case when m = 'points' then round(t.points::numeric / t.games, 2) else round(t.bb / t.games, 2) end av,
      (m = 'bb' or t.games >= 3) rk, m,
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

-- the season trophy goes to the top of the standings in the crew's scoring (everyone tied at the top); while
-- no one has 3 nights yet, to the first of the unranked
create or replace function private.award_season(p_season uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.seasons;
begin
  select * into s from public.seasons where id = p_season;
  if s is null then return; end if;
  delete from public.trophies where season_id = s.id and kind in ('season_winner', 'iron_chair');
  insert into public.trophies (account_id, crew_id, season_id, kind, detail)
    select st.account_id, s.crew_id, s.id, 'season_winner', jsonb_build_object('bb', st.bb, 'points', st.points, 'avg', st.avg)
    from private.standings(s.crew_id, s.id, false) st
    where st.rank = 1
       or (not exists (select 1 from private.standings(s.crew_id, s.id, false) z where z.ranked)
           and (st.avg, st.bb) = (select z.avg, z.bb from private.standings(s.crew_id, s.id, false) z limit 1))
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

-- ---------------------------------------------------------------- the crew's settings (leader)
drop function if exists public.crew_settings(uuid, text, text, text, int, text, boolean, boolean, jsonb);
create function public.crew_settings(p_crew uuid, p_name text default null, p_badge text default null, p_color text default null,
  p_season_months int default null, p_who_hosts text default null, p_members_invite boolean default null, p_auto_admit boolean default null,
  p_house_rules jsonb default null, p_scoring text default null, p_season_weeks int default null, p_season_start date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_leader(p_crew); c public.crews; cur public.seasons; at timestamptz;
begin
  if p_name is not null and char_length(btrim(p_name)) not between 1 and 24 then raise exception 'A crew name is 1 to 24 characters' using errcode = '22023'; end if;
  if p_season_start is not null and p_season_start < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'The next season starts today or later' using errcode = '22023';
  end if;
  update public.crews set
    name = coalesce(btrim(p_name), name), badge = coalesce(p_badge, badge), color = coalesce(p_color, color),
    season_weeks = case when p_season_weeks is not null then nullif(p_season_weeks, 0) when p_season_months is not null then null else season_weeks end,
    season_months = case when coalesce(p_season_weeks, 0) > 0 and coalesce(p_season_months, season_months) = 0 then 1 else coalesce(p_season_months, season_months) end,
    season_anchor = coalesce(p_season_start, season_anchor),
    scoring = coalesce(p_scoring, scoring),
    who_hosts = coalesce(p_who_hosts, who_hosts),
    members_invite = coalesce(p_members_invite, members_invite), require_approval = coalesce(not p_auto_admit, require_approval),
    house_rules = coalesce(p_house_rules, house_rules)
  where id = p_crew returning * into c;
  -- "next season starts on": the season running now ends then
  if p_season_start is not null and c.season_months > 0 then
    at := p_season_start::timestamp at time zone 'Asia/Kolkata';
    select * into cur from public.seasons where id = public.current_season(p_crew);
    if cur.id is not null and cur.closed_at is null and at > cur.starts_at then
      if exists (select 1 from public.seasons where crew_id = p_crew and starts_at > cur.starts_at and starts_at < at) then
        raise exception 'Another season is already planned before that day' using errcode = '22023';
      end if;
      update public.seasons set ends_at = at where id = cur.id;
    end if;
  end if;
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'settings_changed', jsonb_strip_nulls(jsonb_build_object(
    'name', p_name, 'badge', p_badge, 'color', p_color, 'season_months', p_season_months, 'who_hosts', p_who_hosts,
    'members_invite', p_members_invite, 'auto_admit', p_auto_admit, 'rules', case when p_house_rules is not null then true end,
    'scoring', p_scoring, 'season_weeks', p_season_weeks, 'season_start', p_season_start)));
  return private.crew_json(c);
end $$;

create or replace function private.crew_json(c public.crews) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'badge', c.badge, 'color', c.color, 'season_months', c.season_months,
    'season_weeks', c.season_weeks, 'season_length', private.season_length(c), 'season_anchor', c.season_anchor, 'scoring', c.scoring,
    'who_hosts', c.who_hosts, 'members_invite', c.members_invite, 'auto_admit', not c.require_approval, 'house_rules', c.house_rules,
    'created_at', c.created_at)
$$;

create or replace function private.season_json(s public.seasons) returns jsonb
language sql stable set search_path = '' as $$
  select case when s.id is null then null else jsonb_build_object('id', s.id, 'number', s.number, 'name', s.name, 'title', s.title,
    'starts_at', s.starts_at, 'ends_at', case when s.ends_at = 'infinity' then null else s.ends_at end, 'closed', s.closed_at is not null,
    'days_left', case when s.ends_at = 'infinity' or s.closed_at is not null then null
      else greatest(((s.ends_at at time zone 'Asia/Kolkata')::date - (now() at time zone 'Asia/Kolkata')::date), 0) end) end
$$;

-- ---------------------------------------------------------------- "Start a new season now" and season names
create or replace function public.start_season_now(p_crew uuid, p_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_leader(p_crew); cur uuid := public.current_season(p_crew); c public.crews; t timestamptz := now();
  e timestamptz; nm text; nxt timestamptz; sid uuid; ns public.seasons;
begin
  select * into c from public.crews where id = p_crew;
  if c.season_months = 0 then raise exception 'Seasons are off for this crew' using errcode = '22023'; end if;
  if p_name is not null and btrim(p_name) <> '' and char_length(btrim(p_name)) > 24 then raise exception 'A season name is 1 to 24 characters' using errcode = '22023'; end if;
  if cur is not null then
    update public.seasons set ends_at = t where id = cur;
    perform private.award_season(cur);
    update public.seasons set closed_at = t where id = cur;
    insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'season_ended', jsonb_build_object('season', cur));
  end if;
  -- the next seasons count from today
  update public.crews set season_anchor = (t at time zone 'Asia/Kolkata')::date where id = p_crew;
  select b.e, b.nm into e, nm from private.season_bounds(p_crew, t) b;
  select min(starts_at) into nxt from public.seasons where crew_id = p_crew and starts_at > t;
  if nxt is not null and nxt < e then e := nxt; end if;
  insert into public.seasons (crew_id, name, title, starts_at, ends_at) values (p_crew, nm, nullif(btrim(p_name), ''), t, e) returning id into sid;
  perform private.number_seasons(p_crew);
  select * into ns from public.seasons where id = sid;
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'season_started', jsonb_build_object('season', sid, 'name', ns.title));
  return private.season_json(ns);
end $$;

create or replace function public.rename_season(p_crew uuid, p_season uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_leader(p_crew); ns public.seasons;
begin
  if p_name is not null and char_length(btrim(p_name)) > 24 then raise exception 'A season name is 1 to 24 characters' using errcode = '22023'; end if;
  update public.seasons set title = nullif(btrim(coalesce(p_name, '')), '') where id = p_season and crew_id = p_crew returning * into ns;
  if ns.id is null then raise exception 'No such season in this crew' using errcode = 'P0002'; end if;
  insert into public.crew_audit (crew_id, actor, what, detail) values (p_crew, a, 'season_renamed', jsonb_build_object('season', p_season, 'name', ns.title));
  return private.season_json(ns);
end $$;

-- ---------------------------------------------------------------- what the screens show
create or replace function public.my_crews() returns jsonb
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
      'season_title', (select title from public.seasons where id = s.sid),
      'seasons_on', c.season_months > 0, 'scoring', c.scoring,
      'next_season', (select coalesce(max(number), 0) + 1 from public.seasons where crew_id = c.id),
      'rank', (select st.rank from private.standings(c.id, s.sid, false) st where st.account_id = a),
      'live', private.live_table(c.id),
      'usual', private.usual_night(c.id),
      'can_host', private.can_host(c.id, a), 'who_hosts', c.who_hosts,
      'requests', case when m.role in ('owner', 'admin') then (select count(*) from public.crew_requests where crew_id = c.id and status = 'pending') else 0 end) x
    from public.crew_members m join public.crews c on c.id = m.crew_id
    cross join lateral (select public.current_season(c.id) sid) s
    where m.account_id = a and m.status = 'active') y(x)), '[]'::jsonb);
end $$;

create or replace function public.crew_page(p_crew uuid) returns jsonb
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
    'crew', private.crew_json(c),
    'role', r, 'can_host', private.can_host(p_crew, a), 'can_invite', can_inv,
    'code', case when can_inv then (select jsonb_build_object('code', k.code, 'made_at', k.made_at, 'uses', k.uses) from public.crew_codes k where k.crew_id = p_crew) end,
    'members', (select count(*) from public.crew_members where crew_id = p_crew and status = 'active'),
    'leader', case when ldr.id is null then null else jsonb_build_object('id', ldr.id, 'name', ldr.name) end,
    'season', private.season_json(s),
    'next_season', (select coalesce(max(number), 0) + 1 from public.seasons where crew_id = p_crew),
    'seasons', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', number, 'name', name, 'title', title, 'closed', closed_at is not null) order by starts_at desc), '[]'::jsonb)
      from public.seasons where crew_id = p_crew),
    'me', jsonb_build_object('rank', me.rank, 'bb', me.bb, 'games', coalesce(me.games, 0), 'points', me.points, 'avg', me.avg, 'ranked', coalesce(me.ranked, false),
      'of', (select count(*) from public.crew_members where crew_id = p_crew and status = 'active'),
      'spark', (select coalesce(jsonb_agg(v order by t), '[]'::jsonb) from (
        select g.ended_at t, sum(gp.bb_won) over (order by g.ended_at) v from public.games g join public.game_players gp on gp.game_id = g.id
        where g.crew_id = p_crew and g.season_id = s.id and g.status = 'ended' and not g.casual and gp.account_id = a) sp)),
    'podium', (select coalesce(jsonb_agg(jsonb_build_object('account_id', st.account_id, 'name', st.name, 'bb', st.bb, 'rank', st.rank,
        'points', st.points, 'avg', st.avg, 'games', st.games, 'ranked', st.ranked) order by st.o), '[]'::jsonb)
      from (select x.*, row_number() over () o from private.standings(p_crew, s.id, false) x limit 3) st),
    'last_game', case when lg.id is null then null else jsonb_build_object('id', lg.id, 'started_at', lg.started_at, 'ended_at', lg.ended_at, 'players', lg.players,
      'winner', lg.winner, 'mine', lg.mine, 'offline', lg.server = 'host', 'table', lg.table_code) end,
    'live', private.live_table(p_crew),
    'usual', private.usual_night(p_crew),
    'requests', case when r in ('owner', 'admin') then public.crew_join_requests(p_crew) else '[]'::jsonb end,
    'disputes', case when r in ('owner', 'admin') then (select count(*) from public.games g where g.crew_id = p_crew and g.awaiting_confirmation and g.status = 'live'
      and exists (select 1 from public.result_changes rc where rc.game_id = g.id and rc.what = 'offline_disputed')) else 0 end);
end $$;

create or replace function public.crew_league(p_crew uuid, p_scope text default 'season', p_season uuid default null) returns jsonb
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
  return jsonb_build_object('season', private.season_json(s), 'scoring', (select scoring from public.crews where id = p_crew), 'min_nights', 3,
    'rows', case when p_scope <> 'alltime' and s.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('account_id', st.account_id, 'name', st.name,
      'games', st.games, 'bb', st.bb, 'points', st.points, 'avg', st.avg, 'wins', st.wins, 'top3', st.top3, 'busts', st.busts, 'rebuys', st.rebuys,
      'rank', st.rank, 'ranked', st.ranked, 'trend', st.trend, 'member', st.member, 'me', st.account_id = a) order by st.o), '[]'::jsonb)
      from (select x.*, row_number() over () o from private.standings(p_crew, s.id, p_scope = 'alltime') x) st) end);
end $$;

create or replace function public.crew_player(p_crew uuid, p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a uuid := private.need_me(); s public.seasons; st record; m public.crew_members; best record; nm text; n record;
begin
  if not private.is_member(p_crew) then raise exception 'Only crew members can see players' using errcode = '42501'; end if;
  select * into m from public.crew_members where crew_id = p_crew and account_id = p_account and status = 'active';
  if m is null and not exists (select 1 from public.game_players gp join public.games g on g.id = gp.game_id where g.crew_id = p_crew and gp.account_id = p_account) then
    raise exception 'Not a player in this crew' using errcode = 'P0002';
  end if;
  nm := case when m is null then 'Former player' else (select name from public.accounts where id = p_account) end;
  select * into s from public.seasons where id = public.current_season(p_crew);
  select * into st from private.standings(p_crew, s.id, false) x where x.account_id = p_account;
  select count(*)::int nights, sum(x.bb) bb, sum(x.hands)::int hands, sum(x.showdowns)::int sd, sum(x.showdowns_won)::int sdw,
    max(x.bb) best, min(x.bb) worst
    into n from private.nights(p_crew, s.id, false) x where x.account_id = p_account;
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
    'season', s.number, 'season_title', s.title, 'scoring', (select scoring from public.crews where id = p_crew),
    'rank', st.rank, 'ranked', coalesce(st.ranked, false), 'games', coalesce(st.games, 0), 'bb', st.bb,
    'nights', coalesce(n.nights, 0), 'points', st.points, 'avg', st.avg,
    'avg_points', case when n.nights > 0 then round(st.points::numeric / n.nights, 2) end,
    'wins', coalesce(st.wins, 0), 'top3', coalesce(st.top3, 0), 'rebuys', coalesce(st.rebuys, 0), 'busts', coalesce(st.busts, 0),
    'bb_night', case when n.nights > 0 then round(n.bb / n.nights, 1) end,
    'bb100', case when n.hands > 0 then round(n.bb * 100 / n.hands, 1) end,
    'sd_won', case when n.sd > 0 then round(100.0 * n.sdw / n.sd)::int end,
    'best_night', n.best, 'worst_night', n.worst,
    'hands', (select count(*) from public.hand_players hp join public.games g on g.id = hp.game_id where hp.account_id = p_account and g.crew_id = p_crew and g.season_id = s.id),
    'won', (select count(*) from public.hand_players hp join public.games g on g.id = hp.game_id where hp.account_id = p_account and g.crew_id = p_crew and g.season_id = s.id and hp.won),
    'best', case when best.best_hand is null then null else jsonb_build_object('rank', best.best_hand, 'at', best.played_at, 'cards', best.cards, 'board', best.board) end,
    'form', (select coalesce(jsonb_agg(v order by t), '[]'::jsonb) from (
      select t, sum(b) over (order by t) v from (select g.ended_at t, gp.bb_won b from public.games g join public.game_players gp on gp.game_id = g.id
        where g.crew_id = p_crew and g.status = 'ended' and not g.casual and gp.account_id = p_account order by g.ended_at desc limit 8) l) f),
    'form_points', (select coalesce(jsonb_agg(x.pts order by x.ended_at), '[]'::jsonb) from (
      select y.pts, y.ended_at from private.nights(p_crew, null, true) y where y.account_id = p_account order by y.ended_at desc limit 8) x),
    'trophies', (select coalesce(jsonb_agg(jsonb_build_object('kind', t.kind, 'at', t.at, 'season', (select number from public.seasons where id = t.season_id)) order by t.at desc), '[]'::jsonb)
      from public.trophies t where t.account_id = p_account and t.crew_id = p_crew));
end $$;

-- ---------------------------------------------------------------- who may call what
revoke all on function private.season_length(public.crews), private.season_bounds(uuid, timestamptz), private.number_seasons(uuid),
  private.night_points(int, int, numeric, int), private.nights(uuid, uuid, boolean), private.standings(uuid, uuid, boolean),
  private.crew_json(public.crews), private.season_json(public.seasons) from public, anon, authenticated;
revoke all on function public.crew_settings(uuid, text, text, text, int, text, boolean, boolean, jsonb, text, int, date),
  public.start_season_now(uuid, text), public.rename_season(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.crew_settings(uuid, text, text, text, int, text, boolean, boolean, jsonb, text, int, date),
  public.start_season_now(uuid, text), public.rename_season(uuid, uuid, text) to authenticated;
