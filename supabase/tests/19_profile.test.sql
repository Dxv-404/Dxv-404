-- The Profile page: achievements recorded by table servers only (once), the card, what has been seen, and
-- profile_page: my own page in full, a crew mate's with only what they show, nobody else's
-- (20261111000022_profile.sql).
begin;
set search_path = public, extensions;
select * from no_plan();

insert into private.settings values ('recorder_token_hash', encode(extensions.digest('test-recorder-token', 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value;
create function pg_temp.rec(fn text, body text) returns text language sql as $$
  select testing.one(null, format('select public.%s(%L, %L)', fn, body, testing.sign('test-recorder-token', body))) $$;

\set PA '''00000000-0000-0000-0000-000000190001'''
\set PB '''00000000-0000-0000-0000-000000190002'''
\set PC '''00000000-0000-0000-0000-000000190003'''
\set PO '''00000000-0000-0000-0000-000000190004'''
\set PX '''00000000-0000-0000-0000-000000190005'''
select testing.one(:PA, $$select (public.ensure_account('Asha')).id$$) as a \gset
select testing.one(:PB, $$select (public.ensure_account('Bala')).id$$) as b \gset
select testing.one(:PC, $$select (public.ensure_account('Chitra')).id$$) as c \gset
select testing.one(:PO, $$select (public.ensure_account('Omar')).id$$) as o \gset
select testing.one(:PX, $$select (public.ensure_account('Old phone')).id$$) as x \gset
select testing.as_phone(:PA, $$select public.create_crew_v3('Profile crew', 'shield', '#c0392b', true) ->> 'id' as id$$) -> 0 ->> 'id' as crew \gset
insert into crew_members (crew_id, account_id, joined_at) values (:'crew', :'b', now() + interval '1 second'), (:'crew', :'c', now() + interval '2 seconds');

-- ---------------------------------------------------------------- three nights
-- t1 is 20:00 UTC three days ago: 01:30 the next morning in India, so that night belongs to the day after
select (date_trunc('day', now() at time zone 'utc') - interval '3 days' + interval '20 hours') at time zone 'utc' as t1,
  (date_trunc('day', now() at time zone 'utc') - interval '1 day' + interval '15 hours') at time zone 'utc' as t2,
  (date_trunc('day', now() at time zone 'utc') - interval '1 day' + interval '17 hours') at time zone 'utc' as t3,
  ((now() at time zone 'utc')::date - 2)::text as day1, ((now() at time zone 'utc')::date - 1)::text as day2 \gset
\set G1 '19191919-1919-4191-8191-000000000001'
\set G2 '19191919-1919-4191-8191-000000000002'
\set G3 '19191919-1919-4191-8191-000000000003'
\set G4 '19191919-1919-4191-8191-000000000004'
create function pg_temp.game(id text, crew text, at timestamptz) returns text language sql as $$
  select format('{"id":"%s","crew":%s,"table":"PR%s","server":"test","casual":false,"startStack":1000,"bigBlind":20,"startedAt":"%s"}',
    id, coalesce('"' || crew || '"', 'null'), right(id, 2), to_char(at - interval '2 hours', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) $$;
-- one hand: seat keys, their stacks when the cards were dealt and after the hand; the first seat's cards are
-- turned up only when `shown`
create function pg_temp.hand(game text, no int, at timestamptz, keys text[], names text[], s0 int[], s1 int[], shown boolean default false) returns text language sql as $$
  select format('{"game":%s,"hand":{"no":%s,"playedAt":"%s","deckCommit":"c","pot":%s,"replay":%s,"full":{"inputs":[]},"players":%s}}', game, no,
    to_char(at - interval '1 hour' + no * interval '1 minute', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    (select sum(greatest(s1[i] - s0[i], 0)) from generate_subscripts(keys, 1) i),
    jsonb_build_object('v', 2, 'handNo', no, 'deckCommit', 'c', 'keys', to_jsonb(keys), 'results', null, 'frames', jsonb_build_array(
      jsonb_build_object('say', jsonb_build_object('t', 'deal'), 'pot', 30, 'stacks', (select jsonb_agg(s0[i] - case i when 1 then 10 when 2 then 20 else 0 end order by i) from generate_subscripts(keys, 1) i),
        'bets', (select jsonb_agg(case i when 1 then 10 when 2 then 20 else 0 end order by i) from generate_subscripts(keys, 1) i), 'folded', 0, 'allIn', 0, 'board', '[]'::jsonb),
      jsonb_build_object('say', jsonb_build_object('t', 'act', 'k', 0, 'a', 'check'), 'pot', 0, 'stacks', to_jsonb(s1), 'bets', (select jsonb_agg(0) from generate_subscripts(keys, 1) i),
        'folded', 0, 'allIn', 0, 'board', '["As","Kd","7h","2c","9s"]'::jsonb) || case when shown then '{"cards":{"0":["Ah","Ad"]}}'::jsonb else '{}'::jsonb end)),
    (select jsonb_agg(jsonb_build_object('key', keys[i], 'account', case when keys[i] ~ '^[0-9a-f-]{36}$' then keys[i] end, 'name', names[i], 'net', s1[i] - s0[i],
        'showdown', true, 'won', s1[i] > s0[i], 'bestHand', case when s1[i] > s0[i] then 2 + i else 1 end, 'cards', case i when 1 then '["Ah","Ad"]'::jsonb else '["7c","2d"]'::jsonb end) order by i)
      from generate_subscripts(keys, 1) i)) $$;
create function pg_temp.ended(game text, at timestamptz, keys text[], names text[], buyins int[], final int[], low int[]) returns text language sql as $$
  select format('{"game":%s,"endedAt":"%s","players":%s}', game, to_char(at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    (select jsonb_agg(jsonb_build_object('key', keys[i], 'account', case when keys[i] ~ '^[0-9a-f-]{36}$' then keys[i] end, 'name', names[i], 'buyins', buyins[i], 'final', final[i], 'minStack', low[i]) order by i)
      from generate_subscripts(keys, 1) i)) $$;
select array[:'a', :'b', :'c'] as abc, array['Asha', 'Bala', 'Chitra'] as nabc \gset

-- night 1 (crew): Asha goes broke in hand 2, rebuys, and finishes last of three with −100
select pg_temp.rec('record_hand', pg_temp.hand(pg_temp.game(:'G1', :'crew', :'t1'), 1, :'t1', :'abc', :'nabc', '{1000,1000,1000}', '{1300,850,850}'));
select pg_temp.rec('record_hand', pg_temp.hand(pg_temp.game(:'G1', :'crew', :'t1'), 2, :'t1', :'abc', :'nabc', '{1300,850,850}', '{0,1500,1500}'));
select pg_temp.rec('record_hand', pg_temp.hand(pg_temp.game(:'G1', :'crew', :'t1'), 3, :'t1', :'abc', :'nabc', '{1000,1500,1500}', '{1900,950,1150}', true));
select is(pg_temp.rec('record_game_end', pg_temp.ended(pg_temp.game(:'G1', :'crew', :'t1'), :'t1', :'abc', :'nabc', '{2000,1000,1000}', '{1900,950,1150}', '{0,850,850}')), 'ok', 'night 1 is recorded');
-- night 2 (crew): Asha drops to 150, then wins the night with +1200
select pg_temp.rec('record_hand', pg_temp.hand(pg_temp.game(:'G2', :'crew', :'t2'), 1, :'t2', :'abc', :'nabc', '{1000,1000,1000}', '{150,1500,1350}'));
select pg_temp.rec('record_hand', pg_temp.hand(pg_temp.game(:'G2', :'crew', :'t2'), 2, :'t2', :'abc', :'nabc', '{150,1500,1350}', '{2200,500,300}'));
select is(pg_temp.rec('record_game_end', pg_temp.ended(pg_temp.game(:'G2', :'crew', :'t2'), :'t2', :'abc', :'nabc', '{1000,1000,1000}', '{2200,500,300}', '{150,500,300}')), 'ok', 'night 2 is recorded');
-- night 3 (no crew): Asha and Omar, the same India day as night 2
select pg_temp.rec('record_hand', pg_temp.hand(pg_temp.game(:'G3', null, :'t3'), 1, :'t3', array[:'a', :'o'], array['Asha', 'Omar'], '{1000,1000}', '{1200,800}'));
select is(pg_temp.rec('record_game_end', pg_temp.ended(pg_temp.game(:'G3', null, :'t3'), :'t3', array[:'a', :'o'], array['Asha', 'Omar'], '{1000,1000}', '{1200,800}', '{1000,800}')), 'ok', 'night 3 is recorded');

-- ---------------------------------------------------------------- only table servers record achievements, once
select format('{"ref":"%s:1","game":"%s","earned":[{"account":"%s","id":"quads","reveal":"now","at":"%s","hand":1},{"account":"%s","id":"quads","at":"%s","hand":1},{"account":"00000000-0000-4000-8000-00000000dead","id":"royal","at":"%s"}],"counts":[{"account":"%s","key":"bluffs","add":2}]}',
  :'G1', :'G1', :'a', :'t1', :'b', :'t1', :'t1', :'a') as body1 \gset
select is(testing.one(null, format('select public.record_achievements(%L, %L)', :'body1', 'deadbeef')), 'Not a table server', 'a wrong signature is refused');
select is(testing.one(:PA, format('select public.record_achievements(%L, %L)', :'body1', testing.sign('test-recorder-token', :'body1'))), 'permission denied for function record_achievements', 'a phone cannot give itself an achievement');
select is(pg_temp.rec('record_achievements', :'body1'), 'ok', 'a signed list is recorded');
select is(pg_temp.rec('record_achievements', :'body1'), 'duplicate', 'the same call again changes nothing');
select is((select count(*)::int from achievements), 2, 'one row per player; an account that does not exist is skipped');
select is((select n from achievement_counters where account_id = :'a' and key = 'bluffs'), 2, 'counts are added once');
select is((select hand_no || ' ' || reveal || ' ' || tier from achievements where account_id = :'a' and achievement = 'quads'), '1 now 0', 'with its hand, how it was told, and no tier');
select is(pg_temp.rec('record_achievements', format('{"ref":"%s:2","game":"%s","earned":[{"account":"%s","id":"quads","at":"%s","hand":2}],"counts":[{"account":"%s","key":"bluffs","add":1}]}', :'G1', :'G1', :'a', :'t2', :'a')), 'ok', 'earning it again later');
select is((select hand_no from achievements where account_id = :'a' and achievement = 'quads'), 1, 'keeps the first time');
select is((select n from achievement_counters where account_id = :'a' and key = 'bluffs'), 3, 'and the counter goes on');
select is(pg_temp.rec('record_achievements', '{"ref":"bad ref","earned":[]}'), 'That is not a list of achievements', 'a call without a proper ref is refused');
select is(pg_temp.rec('record_achievements', format('{"ref":"r3","earned":[{"account":"%s","id":"Quads!","at":"%s"}]}', :'a', :'t1')), 'That is not a list of achievements', 'so is an id that is not an id');
select is(pg_temp.rec('record_achievements', format('{"ref":"r4","earned":[{"account":"%s","id":"quads"}]}', :'a')), 'That is not a list of achievements', 'and one without a time');
select is(pg_temp.rec('record_achievements', format('{"ref":"r5","counts":[{"account":"%s","key":"bluffs","add":-5}]}', :'a')), 'That is not a list of achievements', 'a count only goes up');
select is((select count(*)::int from private.achievement_calls), 2, 'a refused call is not remembered');
-- a run over the whole history sets the totals (it never counts the old hands twice, and never lowers a count)
select is(pg_temp.rec('record_achievements', format('{"ref":"night:n1","counts":[{"account":"%s","key":"bluffs","set":7}]}', :'a')), 'ok', 'a total is set');
select is((select n from achievement_counters where account_id = :'a' and key = 'bluffs'), 7, 'to what the run counted');
select is(pg_temp.rec('record_achievements', format('{"ref":"night:n2","counts":[{"account":"%s","key":"bluffs","set":5}]}', :'a')), 'ok', 'a smaller total');
select is((select n from achievement_counters where account_id = :'a' and key = 'bluffs'), 7, 'does not lower it');
select is(pg_temp.rec('record_achievements', format('{"ref":"r6","counts":[{"account":"%s","key":"bluffs","set":5,"add":1}]}', :'a')), 'That is not a list of achievements', 'set or add, not both');
update achievement_counters set n = 3 where account_id = :'a' and key = 'bluffs';
-- what a table server reads for the run
select is(testing.one(null, format('select public.achievements_feed(%L, %L)', format('{"crew":"%s"}', :'crew'), 'deadbeef')), 'Not a table server', 'only a signed table server reads a crew''s hands');
select is(testing.one(:PA, format('select public.achievements_feed(%L, %L)', '{}', 'x')), 'permission denied for function achievements_feed', 'no phone can');
select is((pg_temp.rec('achievements_feed', format('{"crew":"%s"}', :'crew'))::jsonb -> 'crew' ->> 'id'), :'crew', 'the feed names the crew');
select is(jsonb_typeof(pg_temp.rec('achievements_feed', format('{"crew":"%s"}', :'crew'))::jsonb -> 'hands'), 'array', 'with its hands');
select is(pg_temp.rec('achievements_feed', '{"crew":"nope"}'), 'Which crew?', 'a call without a crew is refused');
-- tiers, a held one, and one from the crew's history (no hand)
select is(pg_temp.rec('record_achievements', format('{"ref":"%s:end","game":"%s","earned":[{"account":"%s","id":"regular","tier":1,"at":"%s","hand":2},{"account":"%s","id":"great_fold","reveal":"night","at":"%s","hand":1},{"account":"%s","id":"nemesis","reveal":"night","at":"%s","detail":{"name":"Bala"}}]}',
  :'G2', :'G2', :'a', :'t2', :'a', :'t2', :'a', :'t2')), 'ok', 'tiers and held ones are recorded');
select is(testing.as_phone(:PA, 'select count(*) from public.achievements') ->> 'error', 'permission denied for table achievements', 'no phone reads the table itself');
select is(testing.as_phone(:PA, 'select count(*) from public.card_config') ->> 'error', 'permission denied for table card_config', 'nor the cards');

-- ---------------------------------------------------------------- my own page
select testing.as_phone(:PA, 'select public.profile_page() as p') -> 0 -> 'p' as mine \gset
select is(:'mine'::jsonb ->> 'own', 'true', 'my own page');
select is(:'mine'::jsonb -> 'account' ->> 'name', 'Asha', 'with my name');
select is(:'mine'::jsonb -> 'crew' ->> 'name', 'Profile crew', 'the crew of my latest crew night is chosen');
select is((:'mine'::jsonb -> 'crew' ->> 'serial') || ' of ' || (:'mine'::jsonb -> 'crew' ->> 'members'), '1 of 3', 'the card serial is the order I joined');
select is(jsonb_array_length(:'mine'::jsonb -> 'crews'), 1, 'my crews to switch between');
select is((:'mine'::jsonb -> 'career' ->> 'nights') || ' nights ' || (:'mine'::jsonb -> 'career' ->> 'hands') || ' hands ' || (:'mine'::jsonb -> 'career' ->> 'wins') || ' win', '3 nights 6 hands 1 win',
  'career covers every game; a win is a crew night of three or more');
select is((:'mine'::jsonb -> 'career' ->> 'bluffs') || ' ' || (:'mine'::jsonb -> 'career' ->> 'achievements') || ' ' || (:'mine'::jsonb -> 'career' ->> 'hours'), '3 4 6.0', 'bluffs from the counter, achievements counted once each, hours at the table');
select is(:'mine'::jsonb -> 'milestones' -> 'values', jsonb_build_object('hands', 6, 'nights', 3, 'wins', 1, 'showdowns', 4, 'bluffs', 3, 'bb', 65, 'weeks', :'mine'::jsonb -> 'streaks' -> 'weeks' -> 'longest', 'achievements', 4),
  'the numbers the milestone bars fill from');
-- the season strip (points: two games are not enough to be ranked; −1.5 and 7.0)
select is((:'mine'::jsonb -> 'season' ->> 'games') || ' ' || (:'mine'::jsonb -> 'season' ->> 'avg') || ' ' || (:'mine'::jsonb -> 'season' ->> 'ranked') || ' ' || (:'mine'::jsonb -> 'season' ->> 'wins') || ' ' || (:'mine'::jsonb -> 'season' ->> 'min_games'),
  '2 2.75 false 1 4', 'the season strip: games, average score, not ranked yet, wins');
select is(:'mine'::jsonb -> 'season' ->> 'streak', '1', 'and the winning run I am on');
-- the nights and their chip graphs, newest first
select is(jsonb_array_length(:'mine'::jsonb -> 'nights'), 3, 'my last nights');
select is(:'mine'::jsonb -> 'nights' -> 0 ->> 'game', :'G3', 'newest first');
select :'mine'::jsonb -> 'nights' -> 2 as n1 \gset
select is((:'n1'::jsonb -> 'hands')::text || (:'n1'::jsonb -> 'stacks')::text, '[1, 2, 3][1300, 0, 1900]', 'night 1: my stack after each hand');
select is(:'n1'::jsonb -> 'rebuys', '[{"chips": 1000, "before": 3}]'::jsonb, 'the rebuy before hand 3');
select is((:'n1'::jsonb -> 'best')::text || (:'n1'::jsonb -> 'worst')::text, '{"hand": 3, "chips": 900}{"hand": 2, "chips": -1300}', 'the biggest pot won and lost, with their hands');
select is((:'n1'::jsonb ->> 'place') || ' of ' || (:'n1'::jsonb ->> 'players') || ' score ' || (:'n1'::jsonb ->> 'score') || ' buyins ' || (:'n1'::jsonb ->> 'buyins') || ' start ' || (:'n1'::jsonb ->> 'start_stack'),
  '3 of 3 score -1.5 buyins 2000 start 1000', 'place, game score and what was bought in (the buy-in line)');
select is(:'n1'::jsonb -> 'lines' -> 0, '{"name": "Chitra", "hands": [1, 2, 3], "stacks": [850, 1500, 1150]}'::jsonb, 'everyone else''s lines, for "show table"');
select is(:'n1'::jsonb ->> 'table', 'PR01', 'and the table''s code');
select is(:'n1'::jsonb -> 'achievements', '[{"id": "quads", "hand": 1, "tier": 0}]'::jsonb, 'and what I earned that night, on the line');
select is(:'mine'::jsonb -> 'nights' -> 0 ->> 'league', 'false', 'a game outside a crew is in my career but not the league');
-- the calendar, by India day
select is(jsonb_array_length(:'mine'::jsonb -> 'heatmap'), 2, 'two days played');
select is(:'mine'::jsonb -> 'heatmap' -> 0 ->> 'day', :'day1', 'a night that ended at 01:30 India time belongs to that India day (20:00 the day before in UTC)');
select is((:'mine'::jsonb -> 'heatmap' -> 0 ->> 'games') || ' ' || (:'mine'::jsonb -> 'heatmap' -> 0 ->> 'score') || ' ' || (:'mine'::jsonb -> 'heatmap' -> 0 ->> 'won') || ' ' || (:'mine'::jsonb -> 'heatmap' -> 0 ->> 'bb'),
  '1 -1.5 false -5.00', 'day 1: one game, its score, not won');
select is((:'mine'::jsonb -> 'heatmap' -> 1 ->> 'day') || ' ' || (:'mine'::jsonb -> 'heatmap' -> 1 ->> 'games') || ' ' || (:'mine'::jsonb -> 'heatmap' -> 1 ->> 'score') || ' ' || (:'mine'::jsonb -> 'heatmap' -> 1 ->> 'won'),
  :'day2' || ' 2 9.0 true', 'day 2: two games, scores added (7.0 and 2.0), a night won');
select is(:'mine'::jsonb -> 'heatmap' -> 1 ->> 'achievements', '3', 'achievements earned that day');
select is(jsonb_array_length(:'mine'::jsonb -> 'heatmap' -> 1 -> 'list'), 2, 'and the day''s games for the detail card');
-- big moments
select is((:'mine'::jsonb -> 'moments' -> 'biggest_won' ->> 'chips') || ' ' || (:'mine'::jsonb -> 'moments' -> 'biggest_won' ->> 'hand') || ' ' || (:'mine'::jsonb -> 'moments' -> 'biggest_won' ->> 'bb'), '2050 2 102.5', 'the biggest pot I won');
select is(:'mine'::jsonb -> 'moments' -> 'biggest_won' -> 'cards', '["Ah", "Ad"]'::jsonb, 'with my own cards');
select is(:'mine'::jsonb -> 'moments' -> 'biggest_won' -> 'board', '["As", "Kd", "7h", "2c", "9s"]'::jsonb, 'and the board');
select is(:'mine'::jsonb -> 'moments' -> 'biggest_lost' ->> 'chips', '-1300', 'the biggest pot I lost');
select is(:'mine'::jsonb -> 'moments' -> 'hand_of_season' ->> 'game', :'G2', 'the hand of the season');
select is(:'mine'::jsonb -> 'moments' -> 'winning_hands', '[{"n": 4, "hand": 3}]'::jsonb, 'what I win with most often');
select is((:'mine'::jsonb -> 'moments' -> 'comebacks' -> 0 ->> 'game') || ' ' || (:'mine'::jsonb -> 'moments' -> 'comebacks' -> 0 ->> 'low'), :'G2' || ' 150', 'a night won from under 20% of the starting stack is a comeback');
-- streaks and history
select is((:'mine'::jsonb -> 'streaks' -> 'wins' ->> 'current') || (:'mine'::jsonb -> 'streaks' -> 'wins' ->> 'longest') || (:'mine'::jsonb -> 'streaks' -> 'top3' ->> 'longest'), '112', 'streaks: wins and top-three finishes (league nights)');
select is(jsonb_array_length(:'mine'::jsonb -> 'history' -> 'rank_after'), 2, 'my rank after each of the season''s games');
select is(:'mine'::jsonb -> 'history' -> 'rank_after' -> 1 ->> 'rank', null, 'no rank until enough games are played');
select is((:'mine'::jsonb -> 'history' -> 'seasons' -> 0 ->> 'games') || ' ' || (:'mine'::jsonb -> 'history' -> 'seasons' -> 0 ->> 'current'), '2 true', 'my seasons, with this one');
-- achievements
select is((select jsonb_agg(x ->> 'id' order by x ->> 'id') from jsonb_array_elements(:'mine'::jsonb -> 'achievements') x), '["great_fold", "nemesis", "quads", "regular"]'::jsonb, 'everything I have earned');
select is((select x ->> 'tier' from jsonb_array_elements(:'mine'::jsonb -> 'achievements') x where x ->> 'id' = 'regular'), '1', 'with tiers');
select is((select bool_and((x ->> 'new')::boolean) from jsonb_array_elements(:'mine'::jsonb -> 'achievements') x), true, 'all new until I have looked');
select is(:'mine'::jsonb -> 'crew_has', '{"quads": 2, "regular": 1, "nemesis": 1, "great_fold": 1}'::jsonb, 'how many of the crew have each');
select is(:'mine'::jsonb -> 'card', 'null'::jsonb, 'no card choices yet');

-- ---------------------------------------------------------------- seen, shown, the card
select is(testing.one(:PA, 'select public.profile_news()'), '4', 'four new achievements: the dot on the tab');
select testing.as_phone(:PA, $$select public.mark_profile_seen('{"hands": 6, "wins": 1, "Bad Key": 3, "bluffs": "x"}'::jsonb)$$);
select is(testing.one(:PA, 'select public.profile_news()'), '0', 'opening the profile clears it');
select is(testing.as_phone(:PA, 'select public.profile_page() as p') -> 0 -> 'p' -> 'milestones' -> 'seen', '{"hands": 6, "wins": 1}'::jsonb, 'and the bars remember where they were (junk left out)');
select is(testing.one(:PA, $$select public.show_achievement('nemesis', false)$$), '', 'I can hide one');
select is(testing.one(:PA, $$select public.show_achievement('royal', false)$$), 'You do not have that achievement', 'but only one I have');
select is(testing.one(:PA, $$select public.save_card('{"frame":"four-corners","finish":"matte","title":"the-reader","stats":["wins","best_night","hands"],"emblem":"quads","tagline":"  never folds  ","back":"timetable"}'::jsonb) ->> 'tagline'$$), 'never folds', 'my card is saved');
select is(testing.one(:PA, $$select public.save_card('{"emblem":"royal"}'::jsonb)$$), 'That emblem is not earned yet', 'an emblem must be earned');
select is(testing.one(:PA, $$select public.save_card('{"tagline":"this tagline is far too long"}'::jsonb)$$), 'A tagline is up to 24 letters', 'a tagline is short');
select is(testing.one(:PA, $$select public.save_card('{"frame":"<script>"}'::jsonb)$$), 'That is not a card', 'a part is an id');
select is(testing.one(:PA, $$select public.save_card('{"stats":["a","b","c","d"]}'::jsonb)$$), 'That is not a card', 'three stats at most');
select is(testing.one(:PA, $$select public.save_card('{"frame":"laurel","stats":["hands"]}'::jsonb) ->> 'title'$$), null, 'saving again replaces the whole card');
select is(testing.one(null, $$select public.save_card('{}'::jsonb)$$), 'permission denied for function save_card', 'signed in only');

-- ---------------------------------------------------------------- a crew mate's page, and nobody else's
select testing.as_phone(:PB, format('select public.profile_page(%L) as p', :'a')) -> 0 -> 'p' as theirs \gset
select is(:'theirs'::jsonb ->> 'own', 'false', 'a crew mate can open my page');
select is((:'theirs'::jsonb -> 'career' ->> 'nights') || ' ' || jsonb_array_length(:'theirs'::jsonb -> 'nights') || ' ' || jsonb_array_length(:'theirs'::jsonb -> 'heatmap' -> 1 -> 'list'), '2 2 1', 'they see the games of the crew we share, not my others');
select is((select jsonb_agg(x ->> 'id' order by x ->> 'id') from jsonb_array_elements(:'theirs'::jsonb -> 'achievements') x), '["great_fold", "quads", "regular"]'::jsonb, 'and not the achievement I hid');
select is((select bool_or((x ->> 'new')::boolean) from jsonb_array_elements(:'theirs'::jsonb -> 'achievements') x), false, 'nothing is "new" to a visitor');
select is(:'theirs'::jsonb -> 'milestones' -> 'seen', '{}'::jsonb, 'what I have seen is mine');
select is(:'theirs'::jsonb -> 'card' ->> 'frame', 'laurel', 'they see my card');
select is(:'theirs'::jsonb -> 'moments' -> 'biggest_won' -> 'cards', 'null'::jsonb, 'cards I never showed stay hidden from them');
select is(:'theirs'::jsonb -> 'nights' -> 1 ->> 'game', :'G1', 'night 1 is in their view');
select is(testing.as_phone(:PB, format('select private.hand_tile(%L, 3, %L, false)', :'G1', :'a')) ->> 'error', 'permission denied for function hand_tile', 'the pieces cannot be called by a phone');
select is(private.hand_tile(:'G1', 3, :'a', false) -> 'cards', '["Ah", "Ad"]'::jsonb, 'cards turned up at the table are shown to them');
select is((:'theirs'::jsonb -> 'nights' -> 1 -> 'best' ->> 'chips'), '900', 'the chip graph is what the table saw anyway');
select is(testing.as_phone(:PA, format('select public.profile_page(%L) as p', :'b')) -> 0 -> 'p' -> 'moments' -> 'biggest_lost' ->> 'chips', '-1000', 'and I can open theirs');
select is(testing.one(:PB, format('select public.profile_page(%L, %L)', :'a', gen_random_uuid())), 'Only crew mates can see a profile', 'only through a crew we share');
select is(testing.one(:PO, format('select public.profile_page(%L)', :'a')), 'Only crew mates can see a profile', 'someone I only met at a table cannot');
select is(testing.one(:PA, format('select public.profile_page(null, %L)', gen_random_uuid())), 'Only crew members can open the crew', 'my own page for a crew I am not in is refused');
select is(testing.one(:PA, format('select public.profile_page(%L)', gen_random_uuid())), 'No such player', 'an unknown player');
select is(testing.one(null, 'select public.profile_page()'), 'permission denied for function profile_page', 'signed in only');
select is(testing.as_phone(:PO, 'select public.profile_page() as p') -> 0 -> 'p' -> 'season', 'null'::jsonb, 'a player in no crew still has a page: no season strip');
select is(testing.as_phone(:PO, 'select public.profile_page() as p') -> 0 -> 'p' -> 'career' ->> 'nights', '1', 'with their own games');

-- ---------------------------------------------------------------- held for the night summary
-- night 4 is still being played: a Great Fold in it would tell Bala that a face-down hand had him beat
select pg_temp.rec('record_hand', pg_temp.hand(pg_temp.game(:'G4', :'crew', now()), 1, now(), :'abc', :'nabc', '{1000,1000,1000}', '{1100,900,1000}'));
select is(pg_temp.rec('record_achievements', format('{"ref":"%s:1","game":"%s","earned":[{"account":"%s","id":"great_fold","reveal":"night","at":"%s","hand":1},{"account":"%s","id":"set_mining","at":"%s","hand":1}]}',
  :'G4', :'G4', :'b', now(), :'b', now())), 'ok', 'a held achievement is recorded during the game');
select is((select jsonb_agg(x ->> 'id' order by x ->> 'id') from jsonb_array_elements(testing.as_phone(:PB, 'select public.profile_page() as p') -> 0 -> 'p' -> 'achievements') x),
  '["quads", "set_mining"]'::jsonb, 'but is not on the page while the game runs (the others are)');
select is(testing.one(:PB, 'select public.profile_news()'), '2', 'nor counted as news');
select is(testing.as_phone(:PA, 'select public.profile_page() as p') -> 0 -> 'p' -> 'crew_has' ->> 'great_fold', '1', 'nor in the crew''s counts');
select pg_temp.rec('record_game_end', pg_temp.ended(pg_temp.game(:'G4', :'crew', now()), now(), :'abc', :'nabc', '{1000,1000,1000}', '{1100,900,1000}', '{1000,900,1000}'));
select is((select jsonb_agg(x ->> 'id' order by x ->> 'id') from jsonb_array_elements(testing.as_phone(:PB, 'select public.profile_page() as p') -> 0 -> 'p' -> 'achievements') x),
  '["great_fold", "quads", "set_mining"]'::jsonb, 'when the night is over it is there');

-- ---------------------------------------------------------------- helpers
select is(private.streak_of(array[true, true, false, true, true, true, false, true], array(select timestamptz '2026-11-01' + n * interval '1 day' from generate_series(1, 8) n)),
  jsonb_build_object('current', 1, 'longest', 3, 'longest_at', timestamptz '2026-11-07'), 'runs: the one going, the longest, and when it ended');
select is(private.streak_of(null, null), '{"current": 0, "longest": 0, "longest_at": null}'::jsonb, 'no nights, no runs');
-- 2 Nov 2026 is a Monday
select is(private.week_streak(array[date '2026-11-01', date '2026-11-02', date '2026-11-08', date '2026-11-09', date '2026-11-25'], date '2026-11-26'), '{"current": 1, "longest": 3}'::jsonb,
  'weeks run Monday to Sunday: Sun 1st, Mon 2nd, Sun 8th and Mon 9th are three weeks in a row');
select is(private.week_streak(array[date '2026-11-02', date '2026-11-09'], date '2026-11-22'), '{"current": 2, "longest": 2}'::jsonb, 'last week still counts as going');
select is(private.week_streak(array[date '2026-11-02', date '2026-11-09'], date '2026-11-23'), '{"current": 0, "longest": 2}'::jsonb, 'a whole week missed ends it');

-- ---------------------------------------------------------------- merging accounts, deleting one, backups
insert into achievements (account_id, achievement, tier, earned_at) values (:'x', 'quads', 0, :'t1'::timestamptz - interval '30 days'), (:'x', 'royal', 0, :'t1');
insert into achievement_counters values (:'x', 'bluffs', 4);
insert into milestone_seen (account_id, track, value) values (:'x', 'hands', 2), (:'x', 'nights', 1);
insert into card_config (account_id, frame) values (:'x', 'old');
select private.merge_accounts(:'x', :'a');
select is((select count(*)::int from achievements where account_id = :'a'), 5, 'merging brings the other account''s achievements over');
select is((select earned_at from achievements where account_id = :'a' and achievement = 'quads'), :'t1'::timestamptz - interval '30 days', 'keeping the earlier date of one both had');
select is((select n from achievement_counters where account_id = :'a' and key = 'bluffs'), 7, 'counters are added up');
select is((select frame from card_config where account_id = :'a'), 'laurel', 'the card stays');
select is((select string_agg(track || '=' || value, ' ' order by track) from milestone_seen where account_id = :'a'), 'hands=6 nights=1 wins=1', 'the bars keep theirs and gain the missing ones');
select is((select count(*)::int from achievements where account_id = :'x') + (select count(*)::int from card_config where account_id = :'x'), 0, 'nothing is left behind');
select is(private.backup_tables() @> array['public.achievements', 'public.achievement_counters', 'private.achievement_calls', 'public.card_config', 'public.milestone_seen'], true, 'backups carry the new tables');
select testing.as_phone(:PC, 'select public.delete_my_account()');
select is(testing.as_phone(:PA, 'select public.profile_page() as p') -> 0 -> 'p' ->> 'own', 'true', 'the page still opens after a crew mate deletes their account');

-- which crews the checker still has to see: any with a finished game since its last whole run
select pg_temp.rec('record_game_end', pg_temp.ended(pg_temp.game(gen_random_uuid()::text, :'crew', now() - interval '1 hour'), now() - interval '30 minutes', :'abc', :'nabc', '{1000,1000,1000}', '{1100,900,1000}', '{1000,900,1000}'));
select is(pg_temp.rec('achievements_due', '{"due":1}')::jsonb ? :'crew', true, 'a crew with a finished game is due');
select is(testing.one(null, format('select public.achievements_due(%L, %L)', '{}', 'bad')), 'Not a table server', 'only a table server asks');
select is(pg_temp.rec('record_achievements', format('{"ref":"due:1","crew":"%s","earned":[]}', :'crew')), 'ok', 'a whole run names its crew');
select is(pg_temp.rec('achievements_due', '{"due":2}')::jsonb ? :'crew', false, 'and the crew is up to date');
select is(pg_temp.rec('record_achievements', '{"ref":"due:2","crew":"not-a-crew","earned":[]}'), 'ok', 'a crew that is not one marks nothing');

select * from finish();
rollback;
