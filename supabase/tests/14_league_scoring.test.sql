-- League scoring (the game score: place points + chip score − rebuys; 'bb' and 'average'), unranked under 4 games, ties, the
-- player card's numbers, and season control: 2 weeks to 6 months or off, the anchor date, "start a new season
-- now", season names, no overlaps (20261103000017_league_scoring_seasons.sql).
begin;
set search_path = public, extensions;
select * from no_plan();

\set LEAD '''00000000-0000-0000-0000-0000000f0001'''
\set PB '''00000000-0000-0000-0000-0000000f0002'''
\set PC '''00000000-0000-0000-0000-0000000f0003'''
\set PD '''00000000-0000-0000-0000-0000000f0004'''
\set PE '''00000000-0000-0000-0000-0000000f0005'''
\set PF '''00000000-0000-0000-0000-0000000f0006'''
\set PG '''00000000-0000-0000-0000-0000000f0007'''
select testing.one(:LEAD, $$select (public.ensure_account('Anil')).id$$) as a \gset
select testing.one(:PB, $$select (public.ensure_account('Bina')).id$$) as b \gset
select testing.one(:PC, $$select (public.ensure_account('Chirag')).id$$) as c \gset
select testing.one(:PD, $$select (public.ensure_account('Divya')).id$$) as d \gset
select testing.one(:PE, $$select (public.ensure_account('Esha')).id$$) as e \gset
select testing.one(:PF, $$select (public.ensure_account('Farid')).id$$) as f \gset
select testing.one(:PG, $$select (public.ensure_account('Gita')).id$$) as g \gset

select testing.as_phone(:LEAD, $$select public.create_crew_v3('Points crew', 'shield', '#c0392b', true) ->> 'id' as id$$) -> 0 ->> 'id' as crew \gset
select testing.as_phone(:LEAD, $$select public.create_crew_v3('Tie crew', 'hex', '#2f6fd6', true) ->> 'id' as id$$) -> 0 ->> 'id' as crew2 \gset
insert into crew_members (crew_id, account_id) values (:'crew', :'b'), (:'crew', :'c'), (:'crew', :'d'),
  (:'crew2', :'e'), (:'crew2', :'f'), (:'crew2', :'g');

-- one night: players as rows "account|bb|buyins|final|place|hands|showdowns|showdowns_won" (place empty: by net)
create function pg_temp.night(cr uuid, at timestamptz, rows text[]) returns uuid language plpgsql as $$
declare gid uuid := gen_random_uuid(); r text; p text[];
begin
  insert into games (id, crew_id, season_id, table_code, server, start_stack, big_blind, started_at, ended_at, status)
    values (gid, cr, private.season_for(cr, at), 'T', 'test', 1000, 10, at - interval '2 hours', at, 'ended');
  foreach r in array rows loop
    p := string_to_array(r, '|');
    insert into game_players (game_id, player_key, account_id, name, buyins, final_chips, net, bb_won, place, hands, showdowns, showdowns_won)
      values (gid, p[1], p[1]::uuid, 'x', p[3]::int, p[4]::int, (p[2]::numeric * 10)::int, p[2]::numeric, nullif(p[5], '')::int,
        coalesce(nullif(p[6], '')::int, 0), coalesce(nullif(p[7], '')::int, 0), coalesce(nullif(p[8], '')::int, 0));
  end loop;
  return gid;
end $$;

-- ---------------------------------------------------------------- the points for one night
select is(private.night_points(9, 1, 0, 0), 9, '1st of 9: 1 for playing + 8');
select is(private.night_points(9, 9, 0, 0), 1, 'last of 9: just the 1 for playing');
select is(private.night_points(4, 2, 39.99, 0), 4, '39.99 bb won is +1 (per 20, toward zero)');
select is(private.night_points(4, 2, 40, 0), 5, '40 bb won is +2');
select is(private.night_points(4, 2, 250, 0), 8, 'big blinds count at most +5');
select is(private.night_points(4, 2, -19.99, 0), 3, 'losing under 20 bb costs nothing');
select is(private.night_points(4, 2, -45, 0), 1, '45 bb lost is −2');
select is(private.night_points(4, 4, -900, 0), -4, 'and at most −5');
select is(private.night_points(4, 1, 0, 2), 2, '−1 per rebuy');
select is(private.night_points(4, 1, 0, -1), 4, 'rebuys never count below 0');
select is(private.night_points(3, 7, 0, 0), 1, 'a place past the table size gets no finish points (never negative)');
-- the game score (20261111000021): place points + chip score − rebuys, no point for playing
select is(private.game_score(7, 1, 0, 1000, 0), 6.0, '1st of 7: 6 place points');
select is(private.game_score(7, 7, 0, 1000, 0), 0.0, 'last of 7: none');
select is(private.game_score(4, 2, 500, 1000, 0), 4.5, 'half a starting stack won is +2.5');
select is(private.game_score(4, 2, 1000, 1000, 0), 7.0, 'doubling the starting stack is +5');
select is(private.game_score(4, 2, 9000, 1000, 0), 7.0, 'and that is the most');
select is(private.game_score(4, 4, -1000, 1000, 0), -5.0, 'losing all of it is −5');
select is(private.game_score(4, 4, -3000, 1000, 2), -7.0, 'never more than −5, and −1 per rebuy');
select is(private.game_score(4, 2, 390, 1000, 0), 4.0, 'one decimal (1.95 is 2.0)');
select is(private.game_score(4, 1, 0, 1000, -1), 3.0, 'rebuys never count below 0');
select is(private.game_score(3, 7, 0, 1000, 0), 0.0, 'a place past the table size gets no place points');
select is(private.game_score(4, 1, 100, 0, 0), 3.0, 'no starting stack on record: no chip score');

-- ---------------------------------------------------------------- a season of nights
-- N0 (3 players, nobody won or lost chips): Chirag 1st (2) · Anil 2nd (1) · Bina 3rd, last (0)
select pg_temp.night(:'crew', now() - interval '4 hours', array[:'c' || '|0|1000|1000|1', :'a' || '|0|1000|1000|2', :'b' || '|0|1000|1000|3']) as n0 \gset
-- N1: Anil 1st +50 (3 + 2.5) · Bina 2nd +10 (2 + 0.5) · Chirag 3rd −20 with a rebuy (1 − 1 − 1) · Divya 4th −40, bust (0 − 2)
select pg_temp.night(:'crew', now() - interval '3 hours', array[
  :'a' || '|50|1000|1500|1|50|4|3', :'b' || '|10|1000|1100|2|50', :'c' || '|-20|2000|1800|3|50', :'d' || '|-40|1000|0|4|50']) as n1 \gset
-- N2: Bina 1st +250 (3 + 5, capped) · Anil 2nd 0 (2) · Divya 3rd −10 (1 − 0.5) · Chirag 4th −240, bust (0 − 5)
select pg_temp.night(:'crew', now() - interval '2 hours', array[
  :'b' || '|250|1000|3500|1|40', :'a' || '|0|1000|1000|2|50|4|2', :'d' || '|-10|1000|900|3|40', :'c' || '|-240|1000|0|4|40']) as n2 \gset
-- N3 (3 players, no places recorded: ranked by net): Anil +39 (2 + 2) · Chirag 0 (1) · Bina −39, last (0 − 2)
select pg_temp.night(:'crew', now() - interval '1 hour', array[
  :'a' || '|39|1000|1390||50|2|1', :'c' || '|0|1000|1000||50', :'b' || '|-39|1000|610||50']) as n3 \gset
select season_id as s1 from games where id = :'n1' \gset

select is((select string_agg(pts::text, ',' order by ended_at) from private.nights(:'crew', :'s1', false) where account_id = :'a'), '1.0,5.5,2.0,4.0', 'Anil''s games: 1, 5.5, 2, 4');
select is((select string_agg(pts::text, ',' order by ended_at) from private.nights(:'crew', :'s1', false) where account_id = :'c'), '2.0,-1.0,-5.0,1.0', 'Chirag''s: the rebuy costs a point, losing the whole stack costs 5');
select is((select rebuys from private.nights(:'crew', :'s1', false) where account_id = :'c' and game_id = :'n1'), 1, 'rebuys come from the chips bought in (2000 at a 1000 start = 1)');
select is((select place from private.nights(:'crew', :'s1', false) where account_id = :'b' and game_id = :'n3'), 3, 'no place recorded: ranked by net');
select is((select string_agg(busted::text, ',' order by ended_at) from private.nights(:'crew', :'s1', false) where account_id = :'b'), 'true,false,false,true', 'last place is a bust');

select is((select string_agg(coalesce(rank::text, '-') || ':' || name || ':' || points || ':' || avg || ':' || ranked, ' ') from private.league_standings(:'crew', :'s1', false)),
  '1:Anil:12.5:3.13:true 2:Bina:8.5:2.13:true 3:Chirag:-3.0:-0.75:true -:Divya:-1.5:-0.75:false',
  'points: ranked by the average game score; under 4 games is unranked and comes after, with its numbers');
select is((select wins || '/' || top3 || '/' || busts || '/' || rebuys from private.league_standings(:'crew', :'s1', false) where account_id = :'a'), '2/4/0/0', 'Anil: 2 wins, 4 top-3, no busts or rebuys');
select is((select wins || '/' || top3 || '/' || busts || '/' || rebuys from private.league_standings(:'crew', :'s1', false) where account_id = :'c'), '1/3/1/1', 'Chirag: 1 win, 3 top-3, 1 bust, 1 rebuy');
select is((select busts from private.league_standings(:'crew', :'s1', false) where account_id = :'d'), 1, 'chips at 0 is a bust');
select is((select scoring from crews where id = :'crew'), 'points', 'every crew scores in points unless the leader changes it');

update crews set scoring = 'bb' where id = :'crew';
select is((select string_agg(coalesce(rank::text, '-') || ':' || name || ':' || bb, ' ') from private.league_standings(:'crew', :'s1', false)),
  '1:Bina:221.00 2:Anil:89.00 3:Divya:-50.00 4:Chirag:-260.00', 'bb: total big blinds won, everyone ranked (as before)');
update crews set scoring = 'average' where id = :'crew';
select is((select string_agg(coalesce(rank::text, '-') || ':' || name || ':' || avg, ' ') from private.league_standings(:'crew', :'s1', false)),
  '1:Bina:55.25 2:Anil:22.25 3:Chirag:-65.00 -:Divya:-25.00', 'average: big blinds per night, 3 nights to be ranked');
select is(testing.one(:PB, format($$select public.crew_league(%L) ->> 'scoring'$$, :'crew')), 'average', 'the league says how it is scored');
update crews set scoring = 'points' where id = :'crew';

-- ties: the same average score → more bb won; equal bb too → the same rank, by name
-- (three games where each wins once with no chips moved; in the fourth Farid wins 20 bb but rebought twice)
select pg_temp.night(:'crew2', now() - interval '4 hours', array[:'e' || '|0|1000|1000|1', :'f' || '|0|1000|1000|2', :'g' || '|0|1000|1000|3']);
select pg_temp.night(:'crew2', now() - interval '3 hours', array[:'g' || '|0|1000|1000|1', :'e' || '|0|1000|1000|2', :'f' || '|0|1000|1000|3']);
select pg_temp.night(:'crew2', now() - interval '2 hours', array[:'f' || '|0|1000|1000|1', :'g' || '|0|1000|1000|2', :'e' || '|0|1000|1000|3']);
select pg_temp.night(:'crew2', now() - interval '1 hour', array[:'f' || '|20|3000|3200|1', :'e' || '|0|1000|1000|2', :'g' || '|0|1000|1000|2']);
select is((select string_agg(rank || ':' || name || ':' || avg || ':' || bb, ' ') from private.league_standings(:'crew2', public.current_season(:'crew2'), false)),
  '1:Farid:1.00:20.00 2:Esha:1.00:0.00 2:Gita:1.00:0.00', 'ties: bb won, then the name (equal both: the same rank)');

-- ---------------------------------------------------------------- what the screens get
select testing.as_phone(:PB, format('select public.crew_league(%L) as l', :'crew')) -> 0 -> 'l' as lg \gset
select is((select string_agg(r ->> 'name', ',' order by o) from jsonb_array_elements(:'lg'::jsonb -> 'rows') with ordinality x(r, o)), 'Anil,Bina,Chirag,Divya', 'the league: ranked rows, then unranked');
select is((select r ->> 'rank' from jsonb_array_elements(:'lg'::jsonb -> 'rows') r where r ->> 'name' = 'Divya'), null, 'unranked rows have no rank');
select is((select r ->> 'ranked' from jsonb_array_elements(:'lg'::jsonb -> 'rows') r where r ->> 'name' = 'Divya'), 'false', 'and say so');
select is((select (r ->> 'avg') || '/' || (r ->> 'points') || '/' || (r ->> 'games') from jsonb_array_elements(:'lg'::jsonb -> 'rows') r where r ->> 'name' = 'Anil'), '3.13/12.5/4', 'rows carry the average score, the points and the games');
select is(:'lg'::jsonb ->> 'min_nights', '4', 'and how many games it takes to be ranked');
select is(testing.one(:PB, format($$select public.crew_page(%L) -> 'podium' -> 0 ->> 'name'$$, :'crew')), 'Anil', 'the podium follows the crew''s scoring');
select is(testing.one(:PD, format($$select (public.crew_page(%L) -> 'me' ->> 'ranked') || '/' || (public.crew_page(%L) -> 'me' ->> 'avg')$$, :'crew', :'crew')), 'false/-0.75', 'my season: unranked, with my average score (below zero)');
select is(testing.one(:PB, format($$select public.crew_page(%L) -> 'crew' ->> 'scoring'$$, :'crew')), 'points', 'the crew page carries the scoring');

select testing.as_phone(:PB, format('select public.crew_player(%L, %L) as p', :'crew', :'a')) -> 0 -> 'p' as pc \gset
select is(:'pc'::jsonb ->> 'nights', '4', 'player card: nights');
select is(:'pc'::jsonb ->> 'avg_points', '3.13', 'points per night');
select is((:'pc'::jsonb ->> 'wins') || '/' || (:'pc'::jsonb ->> 'top3') || '/' || (:'pc'::jsonb ->> 'rebuys') || '/' || (:'pc'::jsonb ->> 'busts'), '2/4/0/0', 'wins, top 3, rebuys, busts');
select is(:'pc'::jsonb ->> 'bb_night', '22.3', 'bb per night');
select is(:'pc'::jsonb ->> 'bb100', '59.3', 'bb per 100 hands (89 bb in 150 hands)');
select is(:'pc'::jsonb ->> 'sd_won', '60', 'showdowns won (6 of 10)');
select is((:'pc'::jsonb ->> 'best_night') || '/' || (:'pc'::jsonb ->> 'worst_night'), '50.00/0.00', 'biggest and worst night in bb');
select is(:'pc'::jsonb -> 'form_points', '[1.0, 5.5, 2.0, 4.0]'::jsonb, 'the form line of points');
select is(:'pc'::jsonb ->> 'rank', '1', 'and the rank');
select is(testing.one(:PB, format($$select (public.crew_player(%L, %L) ->> 'rebuys') || '/' || (public.crew_player(%L, %L) ->> 'busts')$$, :'crew', :'c', :'crew', :'c')), '1/1', 'Chirag''s rebuy and bust');

-- the season trophy follows the scoring
select private.award_season(:'s1');
select is((select string_agg(a.name, ',') from trophies t join accounts a on a.id = t.account_id where t.season_id = :'s1' and t.kind = 'season_winner'), 'Anil', 'the season winner is first on points per night');
delete from trophies where season_id = :'s1';

-- ---------------------------------------------------------------- settings: scoring and season length
select is(testing.one(:PB, format('select public.crew_settings_v2(%L, p_scoring => %L)', :'crew', 'bb')), 'Only the crew leader can do that', 'only the leader changes the scoring');
select is(testing.one(:LEAD, format('select public.crew_settings_v2(%L, p_scoring => %L)', :'crew', 'fun')), 'new row for relation "crews" violates check constraint "crews_scoring_check"', 'scoring is points, bb or average');
select is(testing.one(:LEAD, format($$select public.crew_settings_v2(%L, p_scoring => %L) ->> 'scoring'$$, :'crew', 'average')), 'average', 'the leader sets the scoring');
select is(testing.one(:LEAD, format($$select public.crew_settings_v2(%L, p_scoring => %L) ->> 'scoring'$$, :'crew', 'points')), 'points', 'and back');
select is(testing.one(:LEAD, format($$select public.crew_settings_v2(%L, p_season_weeks => 2) ->> 'season_length'$$, :'crew')), '2w', 'seasons of 2 weeks');
select is((select season_months > 0 from crews where id = :'crew'), true, '(seasons stay on)');
select is(testing.one(:LEAD, format($$select public.crew_settings_v2(%L, p_season_weeks => 3)$$, :'crew')), 'new row for relation "crews" violates check constraint "crews_season_weeks_check"', 'weeks: only 2');
select is(testing.one(:LEAD, format($$select public.crew_settings_v2(%L, p_season_months => 2) ->> 'season_length'$$, :'crew')), '2m', '2 months (and months clear the weeks)');
select is(testing.one(:LEAD, format($$select public.crew_settings_v2(%L, p_season_weeks => 2, p_season_months => 0) ->> 'season_length'$$, :'crew')), '2w', '2 weeks switches seasons on');
select is(testing.one(:LEAD, format($$select public.crew_settings_v2(%L, p_season_months => 0) ->> 'season_length'$$, :'crew')), 'off', 'off');
select is(testing.one(:LEAD, format($$select public.crew_settings_v2(%L, p_season_months => 3) ->> 'season_length'$$, :'crew')), '3m', 'back to 3 months');

-- the periods (a crew of its own, so only the arithmetic counts)
select testing.as_phone(:LEAD, $$select public.create_crew_v3('Lengths', 'round', '#1f8a5b', true) ->> 'id' as id$$) -> 0 ->> 'id' as cl \gset
update crews set season_weeks = 2 where id = :'cl';
select is((select (s at time zone 'Asia/Kolkata')::date || ' ' || (e at time zone 'Asia/Kolkata')::date || ' ' || nm from private.season_bounds(:'cl', '2026-01-20T12:00:00Z')),
  '2026-01-19 2026-02-02 19 Jan–01 Feb 2026', '2 weeks, counted from Monday 5 Jan 2026');
update crews set season_weeks = null, season_months = 2 where id = :'cl';
select is((select (s at time zone 'Asia/Kolkata')::date || ' ' || (e at time zone 'Asia/Kolkata')::date || ' ' || nm from private.season_bounds(:'cl', '2026-04-10T12:00:00Z')),
  '2026-03-01 2026-05-01 Mar–Apr 2026', '2 months follow the calendar');
update crews set season_months = 1, season_anchor = '2026-11-15' where id = :'cl';
select is((select (s at time zone 'Asia/Kolkata')::date || ' ' || (e at time zone 'Asia/Kolkata')::date || ' ' || nm from private.season_bounds(:'cl', '2026-12-20T12:00:00Z')),
  '2026-12-15 2027-01-15 15 Dec–14 Jan 2027', 'a month from the anchor date');
select is((select (s at time zone 'Asia/Kolkata')::date || ' ' || (e at time zone 'Asia/Kolkata')::date from private.season_bounds(:'cl', '2026-11-10T12:00:00Z')),
  '2026-10-15 2026-11-15', 'and before it');
update crews set season_months = 6 where id = :'cl';
select is((select (s at time zone 'Asia/Kolkata')::date || ' ' || (e at time zone 'Asia/Kolkata')::date from private.season_bounds(:'cl', '2027-06-01T12:00:00Z')),
  '2027-05-15 2027-11-15', '6 months from the anchor');
update crews set season_weeks = 2, season_anchor = '2026-11-04' where id = :'cl';
select is((select (s at time zone 'Asia/Kolkata')::date || ' ' || (e at time zone 'Asia/Kolkata')::date from private.season_bounds(:'cl', '2026-11-03T12:00:00Z')),
  '2026-10-21 2026-11-04', '2 weeks from the anchor, before it too');

-- ---------------------------------------------------------------- the next season's start date
select is(testing.one(:LEAD, format($$select public.crew_settings_v2(%L, p_season_start => %L)$$, :'crew', ((now() at time zone 'Asia/Kolkata')::date - 1)::text)), 'The next season starts today or later', 'not in the past');
select is(testing.one(:PB, format($$select public.crew_settings_v2(%L, p_season_start => %L)$$, :'crew', ((now() at time zone 'Asia/Kolkata')::date + 10)::text)), 'Only the crew leader can do that', 'only the leader');
select testing.one(:LEAD, format($$select public.crew_settings_v2(%L, p_season_months => 1, p_season_start => %L)$$, :'crew', ((now() at time zone 'Asia/Kolkata')::date + 10)::text));
select is((select (ends_at at time zone 'Asia/Kolkata') from seasons where id = :'s1'), ((now() at time zone 'Asia/Kolkata')::date + 10)::timestamp, 'the season now ends on the chosen day');
select is((select season_anchor from crews where id = :'crew'), (now() at time zone 'Asia/Kolkata')::date + 10, 'seasons count from it');
select private.season_for(:'crew', now() + interval '11 days') as s2 \gset
select is((select (starts_at at time zone 'Asia/Kolkata') || ' ' || (ends_at at time zone 'Asia/Kolkata') from seasons where id = :'s2'),
  ((now() at time zone 'Asia/Kolkata')::date + 10)::timestamp || ' ' || (((now() at time zone 'Asia/Kolkata')::date + 10)::timestamp + interval '1 month'), 'the next one starts that day and lasts a month');
select is(testing.one(:PB, format($$select public.crew_page(%L) -> 'season' ->> 'days_left'$$, :'crew')), '10', '"ends in 10 days"');

-- ---------------------------------------------------------------- "Start a new season now"
select is(testing.one(:PB, format($$select public.start_season_now(%L, 'Monsoon')$$, :'crew')), 'Only the crew leader can do that', 'only the leader starts a season');
select is(testing.one(:LEAD, format($$select public.start_season_now(%L, %L)$$, :'crew', repeat('m', 25))), 'A season name is 1 to 24 characters', 'season names keep to 24 characters');
select testing.as_phone(:LEAD, format($$select public.start_season_now(%L, '  Monsoon ') as s$$, :'crew')) -> 0 -> 's' as ns \gset
select is(:'ns'::jsonb ->> 'title', 'Monsoon', 'a new season now, with its name');
select is((select closed_at is not null and ends_at = now() from seasons where id = :'s1'), true, 'the old one is closed now');
select is((select starts_at = now() from seasons where id = (:'ns'::jsonb ->> 'id')::uuid), true, 'the new one starts now');
select is((:'ns'::jsonb ->> 'number')::int, (select number + 1 from seasons where id = :'s1'), 'numbered next');
select is((select count(*)::int from trophies where season_id = :'s1' and kind = 'season_winner'), 1, 'the old season''s trophy is given');
select is(public.current_season(:'crew'), (:'ns'::jsonb ->> 'id')::uuid, 'it is the season running');
select is((select (ends_at at time zone 'Asia/Kolkata')::date from seasons where id = (:'ns'::jsonb ->> 'id')::uuid), (select starts_at at time zone 'Asia/Kolkata' from seasons where id = :'s2')::date,
  'it runs up to the season already planned');
select is((select season_anchor from crews where id = :'crew'), (now() at time zone 'Asia/Kolkata')::date, 'later seasons count from today');
select is(testing.one(:PB, format($$select public.crew_page(%L) -> 'season' ->> 'title'$$, :'crew')), 'Monsoon', 'the crew page shows the name');
select is(testing.one(:PB, format($$select jsonb_array_length(public.crew_league(%L) -> 'rows')$$, :'crew')), '0', 'the new season starts empty');
update crews set season_months = 0 where id = :'cl';
select is(testing.one(:LEAD, format($$select public.start_season_now(%L)$$, :'cl')), 'Seasons are off for this crew', 'not when seasons are off');

-- names
select is(testing.one(:LEAD, format($$select public.rename_season(%L, %L, 'Diwali') ->> 'title'$$, :'crew', :'s1')), 'Diwali', 'the leader names a season');
select is(testing.one(:LEAD, format($$select public.rename_season(%L, %L, '') ->> 'title'$$, :'crew', :'s1')), null, 'an empty name clears it');
select is(testing.one(:PB, format($$select public.rename_season(%L, %L, 'x')$$, :'crew', :'s1')), 'Only the crew leader can do that', 'only the leader names seasons');
select is(testing.one(:LEAD, format($$select public.rename_season(%L, %L, 'x')$$, :'crew2', :'s1')), 'No such season in this crew', 'only the crew''s own seasons');

-- no season overlaps another, in any crew here
select is((select count(*)::int from seasons x join seasons y on x.crew_id = y.crew_id and x.id < y.id
  and tstzrange(x.starts_at, x.ends_at) && tstzrange(y.starts_at, y.ends_at) where x.crew_id in (:'crew', :'crew2', :'cl')), 0, 'no two seasons overlap');

-- the Crews tab knows who may host
select is(testing.one(:PB, format($$select (select (c ->> 'can_host') || '/' || (c ->> 'who_hosts') from jsonb_array_elements(public.my_crews()) c where c ->> 'id' = %L)$$, :'crew')), 'true/everyone', 'my crews: can I host, and who hosts');
update crews set who_hosts = 'leader' where id = :'crew';
select is(testing.one(:PB, format($$select (select (c ->> 'can_host') || '/' || (c ->> 'who_hosts') from jsonb_array_elements(public.my_crews()) c where c ->> 'id' = %L)$$, :'crew')), 'false/leader', 'a member when only the leader hosts');

select * from finish();
rollback;
