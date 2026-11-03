-- Player avatars (the approved board: tools/design/avatars). A player picks one of 72 drawn avatars, or none
-- (initials, as before). The pick is kept on the account as accounts.avatar_url = 'tp:<id>' (e.g.
-- 'tp:train-night-owl'), set with set_avatar(), and comes back as 'avatar' (the bare id, or null) wherever the
-- crews screens get a player's face: crew cards' faces, the live table, the invitation preview and its leader,
-- the crew page (leader, podium, last game's winner, requests), the league, members, games and the player card.
--   * the database checks the shape of the id (theme-name), not the list: the app shows ids it does not know
--     (a newer app's) as initials, so adding avatars later needs no migration;
--   * accounts_avatar_here (0004) took only pictures stored in this project's storage; it now also takes
--     'tp:<id>' (the constraint is replaced under the same name: a check cannot be changed in place);
--   * functions are replaced with the same names and arguments (create or replace only, nothing dropped).

alter table public.accounts drop constraint accounts_avatar_here;
alter table public.accounts add constraint accounts_avatar_here check (avatar_url is null
  or avatar_url like 'https://yghyartpurzwogtldzii.supabase.co/storage/v1/object/public/%'
  or (char_length(avatar_url) <= 43 and avatar_url ~ '^tp:(classic|noir|ivory|velvet|cyber|ink|pixel|train|edo)-[a-z0-9]+(-[a-z0-9]+){0,3}$'));

-- a player's avatar id (without 'tp:'), or null: initials (none picked, a deleted account)
create or replace function private.avatar_of(p uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when a.deleted_at is null and a.avatar_url like 'tp:%' then substr(a.avatar_url, 4) end from public.accounts a where a.id = p
$$;

-- Pick an avatar ('train-night-owl', or the stored form 'tp:train-night-owl'); null or '' = initials.
-- Returns what is stored ('tp:<id>' or null).
create or replace function public.set_avatar(p_avatar text) returns text
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); v text := nullif(btrim(coalesce(p_avatar, '')), '');
begin
  if v is not null and v not like 'tp:%' then v := 'tp:' || v; end if;
  if v is not null and (char_length(v) > 43 or v !~ '^tp:(classic|noir|ivory|velvet|cyber|ink|pixel|train|edo)-[a-z0-9]+(-[a-z0-9]+){0,3}$') then
    raise exception 'Unknown avatar' using errcode = '22023';
  end if;
  update public.accounts set avatar_url = v where id = a and deleted_at is null;
  return v;
end $$;

revoke all on function private.avatar_of(uuid) from public, anon, authenticated;
revoke all on function public.set_avatar(text) from public, anon, authenticated;
grant execute on function public.set_avatar(text) to authenticated;

-- ---------------------------------------------------------------- the crews answers, now with 'avatar'
CREATE OR REPLACE FUNCTION private.live_table(c uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('table', t.table_code, 'mode', t.mode, 'since', t.opened_at, 'rules', t.rules,
    'host', (select name from public.accounts where id = t.opened_by),
    'faces', coalesce((select jsonb_agg(jsonb_build_object('id', x.account_id, 'name', x.name, 'avatar', private.avatar_of(x.account_id))) from (
      select distinct hp.account_id, a.name from public.games g join public.hand_players hp on hp.game_id = g.id join public.accounts a on a.id = hp.account_id
      where g.crew_id = c and g.table_code = t.table_code and g.status = 'live' and g.started_at >= t.opened_at - interval '5 minutes'
        and hp.hand_no = (select max(hand_no) from public.hand_players h2 where h2.game_id = g.id) limit 9) x), '[]'::jsonb))
  from public.crew_tables t
  where t.crew_id = c and t.closed_at is null and t.opened_at > now() - interval '6 hours'
    and not exists (select 1 from public.games g where g.crew_id = c and g.table_code = t.table_code and g.status in ('ended', 'void') and g.ended_at > t.opened_at)
  order by t.opened_at desc limit 1
$function$;

CREATE OR REPLACE FUNCTION public.crew_games(p_crew uuid, p_filter text DEFAULT 'all'::text, p_limit integer DEFAULT 40, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid := private.need_me();
begin
  if not private.is_member(p_crew) then raise exception 'Only crew members can see the crew''s games' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by (x ->> 'started_at')::timestamptz desc) from (
    select jsonb_build_object('id', g.id, 'started_at', g.started_at, 'ended_at', g.ended_at, 'table', g.table_code, 'status', g.status,
      'offline', g.server = 'host', 'waiting', g.awaiting_confirmation, 'casual', g.casual, 'hands', g.hands,
      'players', (select count(*) from public.game_players where game_id = g.id),
      'winner', (select jsonb_build_object('id', w.account_id, 'name', w.name, 'bb', w.bb_won, 'avatar', private.avatar_of(w.account_id)) from public.game_players w where w.game_id = g.id order by w.bb_won desc nulls last limit 1),
      'mine', (select bb_won from public.game_players where game_id = g.id and account_id = a),
      'trophy', exists (select 1 from public.trophies t where t.game_id = g.id)) x
    from public.games g
    where g.crew_id = p_crew and (g.status <> 'live' or g.awaiting_confirmation)
      and (p_before is null or g.started_at < p_before)
      and (p_filter <> 'mine' or exists (select 1 from public.game_players gp where gp.game_id = g.id and gp.account_id = a))
      and (p_filter <> 'trophies' or exists (select 1 from public.trophies t where t.game_id = g.id))
    order by g.started_at desc limit least(greatest(p_limit, 1), 100)) y(x)), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.crew_join_requests(p_crew uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid := private.need_admin(p_crew);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'account_id', r.account_id, 'name', x.name, 'avatar', private.avatar_of(x.id), 'asked_at', r.asked_at,
      'invited_by', (select y.name from public.accounts y where y.id = r.invited_by),
      'plays_at', (select c2.name from public.crew_members m2 join public.crews c2 on c2.id = m2.crew_id
        where m2.account_id = r.account_id and m2.status = 'active' and exists (select 1 from public.crew_members m3 where m3.crew_id = m2.crew_id and m3.account_id = a and m3.status = 'active')
        order by c2.name limit 1))
      order by r.asked_at)
    from public.crew_requests r join public.accounts x on x.id = r.account_id
    where r.crew_id = p_crew and r.status = 'pending'), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.crew_league(p_crew uuid, p_scope text DEFAULT 'season'::text, p_season uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'rows', case when p_scope <> 'alltime' and s.id is null then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('account_id', st.account_id, 'name', st.name, 'avatar', private.avatar_of(st.account_id),
      'games', st.games, 'bb', st.bb, 'points', st.points, 'avg', st.avg, 'wins', st.wins, 'top3', st.top3, 'busts', st.busts, 'rebuys', st.rebuys,
      'rank', st.rank, 'ranked', st.ranked, 'trend', st.trend, 'member', st.member, 'me', st.account_id = a) order by st.o), '[]'::jsonb)
      from (select x.*, row_number() over () o from private.league_standings(p_crew, s.id, p_scope = 'alltime') x) st) end);
end $function$;

CREATE OR REPLACE FUNCTION public.crew_members_v3(p_crew uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid := private.need_me(); s uuid := public.current_season(p_crew);
begin
  if not private.is_member(p_crew) then raise exception 'Only crew members can see the members' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by (x ->> 'ord')::int, (x ->> 'joined_at')::timestamptz) from (
    select jsonb_build_object('account_id', m.account_id, 'name', x.name, 'avatar', private.avatar_of(m.account_id), 'role', m.role, 'joined_at', m.joined_at, 'me', m.account_id = a,
      'ord', case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      'last_played', (select max(g.ended_at) from public.game_players gp join public.games g on g.id = gp.game_id where gp.account_id = m.account_id and g.crew_id = p_crew and g.status = 'ended'),
      'at_table', (select case when g.crew_id = p_crew then g.table_code else '' end from public.hand_players hp join public.hands h using (game_id, hand_no) join public.games g on g.id = hp.game_id
        where hp.account_id = m.account_id and g.status = 'live' and h.played_at > now() - interval '15 minutes' order by h.played_at desc limit 1),
      'games', (select count(*) from public.game_players gp join public.games g on g.id = gp.game_id where gp.account_id = m.account_id and g.crew_id = p_crew and g.season_id = s and g.status = 'ended' and not g.casual),
      'bb', (select sum(gp.bb_won) from public.game_players gp join public.games g on g.id = gp.game_id where gp.account_id = m.account_id and g.crew_id = p_crew and g.season_id = s and g.status = 'ended' and not g.casual)) x
    from public.crew_members m join public.accounts x on x.id = m.account_id
    where m.crew_id = p_crew and m.status = 'active') y(x)), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.crew_page(p_crew uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid := private.need_me(); c public.crews; r public.crew_role := private.role_in(p_crew, a); s public.seasons; me record; lg record; ldr record; can_inv boolean;
begin
  if r is null then raise exception 'Only crew members can open the crew' using errcode = '42501'; end if;
  select * into c from public.crews where id = p_crew;
  select * into s from public.seasons where id = public.current_season(p_crew);
  select * into me from private.league_standings(p_crew, s.id, false) st where st.account_id = a;
  select x.id, x.name into ldr from public.crew_members m join public.accounts x on x.id = m.account_id where m.crew_id = p_crew and m.role = 'owner' limit 1;
  select g.id, g.started_at, g.ended_at, g.server, g.table_code,
    (select count(*) from public.game_players where game_id = g.id) players,
    (select jsonb_build_object('id', w.account_id, 'name', w.name, 'bb', w.bb_won, 'avatar', private.avatar_of(w.account_id)) from public.game_players w where w.game_id = g.id order by w.bb_won desc nulls last limit 1) winner,
    (select bb_won from public.game_players where game_id = g.id and account_id = a) mine
    into lg from public.games g where g.crew_id = p_crew and g.status = 'ended' and not g.casual order by g.ended_at desc limit 1;
  can_inv := private.can_invite(p_crew, a);
  if can_inv then perform private.ensure_code(p_crew); end if;
  return jsonb_build_object(
    'crew', private.crew_json(c),
    'role', r, 'can_host', private.can_host(p_crew, a), 'can_invite', can_inv,
    'code', case when can_inv then (select jsonb_build_object('code', k.code, 'made_at', k.made_at, 'uses', k.uses) from public.crew_codes k where k.crew_id = p_crew) end,
    'members', (select count(*) from public.crew_members where crew_id = p_crew and status = 'active'),
    'leader', case when ldr.id is null then null else jsonb_build_object('id', ldr.id, 'name', ldr.name, 'avatar', private.avatar_of(ldr.id)) end,
    'season', private.season_json(s),
    'next_season', (select coalesce(max(number), 0) + 1 from public.seasons where crew_id = p_crew),
    'seasons', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', number, 'name', name, 'title', title, 'closed', closed_at is not null) order by starts_at desc), '[]'::jsonb)
      from public.seasons where crew_id = p_crew),
    'me', jsonb_build_object('rank', me.rank, 'bb', me.bb, 'games', coalesce(me.games, 0), 'points', me.points, 'avg', me.avg, 'ranked', coalesce(me.ranked, false),
      'of', (select count(*) from public.crew_members where crew_id = p_crew and status = 'active'),
      'spark', (select coalesce(jsonb_agg(v order by t), '[]'::jsonb) from (
        select g.ended_at t, sum(gp.bb_won) over (order by g.ended_at) v from public.games g join public.game_players gp on gp.game_id = g.id
        where g.crew_id = p_crew and g.season_id = s.id and g.status = 'ended' and not g.casual and gp.account_id = a) sp)),
    'podium', (select coalesce(jsonb_agg(jsonb_build_object('account_id', st.account_id, 'name', st.name, 'avatar', private.avatar_of(st.account_id), 'bb', st.bb, 'rank', st.rank,
        'points', st.points, 'avg', st.avg, 'games', st.games, 'ranked', st.ranked) order by st.o), '[]'::jsonb)
      from (select x.*, row_number() over () o from private.league_standings(p_crew, s.id, false) x limit 3) st),
    'last_game', case when lg.id is null then null else jsonb_build_object('id', lg.id, 'started_at', lg.started_at, 'ended_at', lg.ended_at, 'players', lg.players,
      'winner', lg.winner, 'mine', lg.mine, 'offline', lg.server = 'host', 'table', lg.table_code) end,
    'live', private.live_table(p_crew),
    'usual', private.usual_night(p_crew),
    'requests', case when r in ('owner', 'admin') then public.crew_join_requests(p_crew) else '[]'::jsonb end,
    'disputes', case when r in ('owner', 'admin') then (select count(*) from public.games g where g.crew_id = p_crew and g.awaiting_confirmation and g.status = 'live'
      and exists (select 1 from public.result_changes rc where rc.game_id = g.id and rc.what = 'offline_disputed')) else 0 end);
end $function$;

CREATE OR REPLACE FUNCTION public.crew_player(p_crew uuid, p_account uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid := private.need_me(); s public.seasons; st record; m public.crew_members; best record; nm text; n record;
begin
  if not private.is_member(p_crew) then raise exception 'Only crew members can see players' using errcode = '42501'; end if;
  select * into m from public.crew_members where crew_id = p_crew and account_id = p_account and status = 'active';
  if m is null and not exists (select 1 from public.game_players gp join public.games g on g.id = gp.game_id where g.crew_id = p_crew and gp.account_id = p_account) then
    raise exception 'Not a player in this crew' using errcode = 'P0002';
  end if;
  nm := case when m is null then 'Former player' else (select name from public.accounts where id = p_account) end;
  select * into s from public.seasons where id = public.current_season(p_crew);
  select * into st from private.league_standings(p_crew, s.id, false) x where x.account_id = p_account;
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
  return jsonb_build_object('account_id', p_account, 'name', nm, 'avatar', case when m is null then null else private.avatar_of(p_account) end, 'role', m.role, 'joined_at', m.joined_at, 'member', m is not null,
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
end $function$;

CREATE OR REPLACE FUNCTION public.crew_preview(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'faces', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'avatar', private.avatar_of(x.id)) order by x.joined_at), '[]'::jsonb) from (
      select a.id, a.name, m.joined_at from public.crew_members m join public.accounts a on a.id = m.account_id
      where m.crew_id = c.id and m.status = 'active' and a.deleted_at is null order by m.joined_at limit 6) x),
    'season', coalesce(s.number, (select coalesce(max(number), 0) + 1 from public.seasons where crew_id = c.id)),
    'seasons_on', c.season_months > 0,
    'games', (select count(*) from public.games where crew_id = c.id and status = 'ended' and not casual),
    'usual_day', (select to_char(started_at at time zone 'Asia/Kolkata', 'Dy') from public.games where crew_id = c.id and status = 'ended'
      group by to_char(started_at at time zone 'Asia/Kolkata', 'Dy') order by count(*) desc limit 1),
    'leader', case when ldr.id is null then null else jsonb_build_object('id', ldr.id, 'name', ldr.name, 'avatar', private.avatar_of(ldr.id)) end,
    'auto_admit', not c.require_approval,
    'status', case when me is null then null
      when exists (select 1 from public.crew_members where crew_id = c.id and account_id = me and status = 'active') then 'member'
      when exists (select 1 from public.crew_requests where crew_id = c.id and account_id = me and status = 'pending')
        or exists (select 1 from public.crew_members where crew_id = c.id and account_id = me and status = 'pending') then 'pending' end);
end $function$;

CREATE OR REPLACE FUNCTION public.my_crews()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid := private.need_me();
begin
  return coalesce((select jsonb_agg(x order by x ->> 'name') from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color, 'badge', c.badge, 'role', m.role,
      'members', (select count(*) from public.crew_members where crew_id = c.id and status = 'active'),
      'faces', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'avatar', private.avatar_of(f.id)) order by f.joined_at), '[]'::jsonb) from (
        select x.id, x.name, mm.joined_at from public.crew_members mm join public.accounts x on x.id = mm.account_id
        where mm.crew_id = c.id and mm.status = 'active' order by mm.joined_at limit 5) f),
      'season', (select number from public.seasons where id = s.sid), 'season_ends', (select ends_at from public.seasons where id = s.sid),
      'season_title', (select title from public.seasons where id = s.sid),
      'seasons_on', c.season_months > 0, 'scoring', c.scoring,
      'next_season', (select coalesce(max(number), 0) + 1 from public.seasons where crew_id = c.id),
      'rank', (select st.rank from private.league_standings(c.id, s.sid, false) st where st.account_id = a),
      'live', private.live_table(c.id),
      'usual', private.usual_night(c.id),
      'can_host', private.can_host(c.id, a), 'who_hosts', c.who_hosts,
      'requests', case when m.role in ('owner', 'admin') then (select count(*) from public.crew_requests where crew_id = c.id and status = 'pending') else 0 end) x
    from public.crew_members m join public.crews c on c.id = m.crew_id
    cross join lateral (select public.current_season(c.id) sid) s
    where m.account_id = a and m.status = 'active') y(x)), '[]'::jsonb);
end $function$;
