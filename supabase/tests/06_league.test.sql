-- Phase 4: recording hands and games (exactly once, chips checked), scoring, league views, seasons in
-- India time, trophies, who can see what, admin fixes, season close.
begin;
set search_path = public, extensions;
select plan(42);

insert into private.settings values ('recorder_token_hash', encode(extensions.digest('test-recorder-token', 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value;
create function pg_temp.sign(body text) returns text language sql as $$ select testing.sign('test-recorder-token', body) $$;
-- a recorder call as the table server makes it: the public key (anon) plus the signature
create function pg_temp.rec(fn text, body text) returns text language sql as $$
  select testing.one(null, format('select public.%s(%L, %L)', fn, body, pg_temp.sign(body))) $$;

\set OWNER '''00000000-0000-0000-0000-00000000a001'''
\set RIYA '''00000000-0000-0000-0000-00000000a002'''
\set ARJUN '''00000000-0000-0000-0000-00000000a003'''
\set OUT '''00000000-0000-0000-0000-00000000a004'''
select testing.one(:OWNER, $$select (public.ensure_account('Owner')).id$$) as owner \gset
select testing.one(:RIYA, $$select (public.ensure_account('Riya')).id$$) as riya \gset
select testing.one(:ARJUN, $$select (public.ensure_account('Arjun')).id$$) as arjun \gset
select testing.one(:OUT, $$select (public.ensure_account('Outsider')).id$$) as outsider \gset
select testing.one(:OWNER, $$select (public.create_crew('League crew')).id$$) as crew \gset
select testing.one(:OWNER, $$select public.create_invite('$$ || :'crew' || $$')$$) as inv \gset
select testing.one(:RIYA, $$select public.join_crew('$$ || :'inv' || $$')$$);
select testing.one(:ARJUN, $$select public.join_crew('$$ || :'inv' || $$')$$);

-- a game at the crew table: owner, riya, arjun and a guest
\set G1 '11111111-1111-4111-8111-000000000001'
select format('{"id":"%s","crew":"%s","table":"LG01","server":"test","casual":false,"startStack":1000,"bigBlind":20,"startedAt":"2026-11-02T14:00:00Z"}', :'G1', :'crew') as game1 \gset
create function pg_temp.hand(game text, no int, players text, pot int default 100) returns text language sql as $$
  select format('{"game":%s,"hand":{"no":%s,"playedAt":"2026-11-02T14:%s:00Z","deckCommit":"abc","pot":%s,"replay":{"v":1,"frames":[]},"full":{"inputs":[]},"players":%s}}', game, no, lpad((no % 60)::text, 2, '0'), pot, players) $$;
select format('[{"key":"%s","account":"%s","name":"Owner","net":-50,"vpip":true},{"key":"%s","account":"%s","name":"Riya","net":70,"vpip":true,"pfr":true,"showdown":true,"won":true,"bestHand":7},{"key":"%s","account":"%s","name":"Arjun","net":-10},{"key":"guest1","name":"Guest","net":-10}]',
  :'owner', :'owner', :'riya', :'riya', :'arjun', :'arjun') as h1players \gset

-- only table servers record
select is(testing.one(null, format('select public.record_hand(%L, %L)', pg_temp.hand(:'game1', 1, :'h1players'), 'deadbeef')), 'Not a table server', 'a wrong signature is refused');
select is(testing.one(:RIYA, format('select public.record_hand(%L, %L)', pg_temp.hand(:'game1', 1, :'h1players'), pg_temp.sign(pg_temp.hand(:'game1', 1, :'h1players')))), 'permission denied for function record_hand', 'phones cannot even call it');
select is(pg_temp.rec('record_hand', pg_temp.hand(:'game1', 1, replace(:'h1players', '"net":70', '"net":75'))), 'Chips do not add up in hand 1', 'a hand whose chips do not add up is refused');
select is(pg_temp.rec('record_hand', pg_temp.hand(:'game1', 1, :'h1players')), 'ok', 'a signed hand is recorded');
select is(pg_temp.rec('record_hand', pg_temp.hand(:'game1', 1, :'h1players')), 'duplicate', 'the same hand again is stored once');
select is((select count(*)::int from hands where game_id = :'G1'), 1, 'exactly one hand row');
select is((select hands from games where id = :'G1'), 1, 'and the game counts one hand');
select is((select count(*)::int from trophies where kind = 'four_of_a_kind' and account_id = :'riya'), 1, 'four of a kind won at showdown is a trophy');
-- more hands
select pg_temp.rec('record_hand', pg_temp.hand(:'game1', n, :'h1players', 100 + n)) from generate_series(2, 10) n;
select is((select hands from games where id = :'G1'), 10, 'ten hands');

-- the end: buy-ins and final chips must balance
select format('{"game":%s,"endedAt":"2026-11-02T17:00:00Z","players":[{"key":"%s","account":"%s","name":"Owner","buyins":1000,"final":600,"minStack":50},{"key":"%s","account":"%s","name":"Riya","buyins":2000,"final":2700,"minStack":40},{"key":"%s","account":"%s","name":"Arjun","buyins":1000,"final":700,"minStack":500},{"key":"guest1","name":"Guest","buyins":1000,"final":1000,"minStack":900}]}',
  :'game1', :'owner', :'owner', :'riya', :'riya', :'arjun', :'arjun') as end1 \gset
select is(pg_temp.rec('record_game_end', replace(:'end1', '"final":2700', '"final":2800')), 'Final chips do not add up to what was bought in', 'an end that does not balance is refused');
select is(pg_temp.rec('record_game_end', :'end1'), 'ok', 'the game ends');
select is(pg_temp.rec('record_game_end', :'end1'), 'duplicate', 'and ends once');
select is(pg_temp.rec('record_hand', pg_temp.hand(:'game1', 11, :'h1players')), 'ok', 'a hand arriving after the end (a recorder catching up) is still stored');
delete from hands where game_id = :'G1' and hand_no = 11; update games set hands = 10 where id = :'G1'; select private.score_game(:'G1');
select is((select bb_won::text from game_players where game_id = :'G1' and player_key = :'riya'), '35.00', 'big blinds won = (final - bought) / big blind');
select is((select string_agg(name || ':' || place || ':' || points, ' ' order by place, name) from game_players where game_id = :'G1'), 'Riya:1:10 Guest:2:7 Arjun:3:5 Owner:4:3', 'places and points 10/7/5/3');
select is((select hands || '/' || vpip || '/' || pfr || '/' || showdowns_won from game_players where game_id = :'G1' and player_key = :'riya'), '10/10/10/10', 'per-game stats come from the hands');
select is((select count(*)::int from trophies where kind = 'comeback'), 1, 'comeback: finished up after being under 10% of the starting stack');
select isnt((select season_id from games where id = :'G1'), null::uuid, 'a crew game lands in a season');
select is((select name from seasons where id = (select season_id from games where id = :'G1')), 'Oct–Dec 2026', 'the season is the quarter, named for people');

-- seasons are in India time: 19:00 UTC on 31 Dec is 00:30 on 1 Jan in India
\set G2 '11111111-1111-4111-8111-000000000002'
select replace(replace(:'game1', :'G1', :'G2'), 'LG01', 'LG02') as game2 \gset
select format('{"game":%s,"endedAt":"2026-12-31T19:00:00Z","players":[{"key":"%s","account":"%s","name":"Owner","buyins":1000,"final":1200},{"key":"%s","account":"%s","name":"Riya","buyins":1000,"final":800}]}', :'game2', :'owner', :'owner', :'riya', :'riya') as end2 \gset
select pg_temp.rec('record_game_end', :'end2');
select is((select name from seasons where id = (select season_id from games where id = :'G2')), 'Jan–Mar 2027', 'a game ending after midnight in India counts in the new season');
select is((select to_char(starts_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') from seasons where id = (select season_id from games where id = :'G2')), '2027-01-01 00:00', 'and the season starts at midnight India time');

-- casual and guest-only games stay out of the league
\set G3 '11111111-1111-4111-8111-000000000003'
select replace(replace(replace(:'game1', :'G1', :'G3'), 'LG01', 'LG03'), '"casual":false', '"casual":true') as game3 \gset
select pg_temp.rec('record_game_end', format('{"game":%s,"endedAt":"2026-11-03T17:00:00Z","players":[{"key":"%s","account":"%s","name":"Owner","buyins":1000,"final":5000},{"key":"%s","account":"%s","name":"Riya","buyins":5000,"final":1000}]}', :'game3', :'owner', :'owner', :'riya', :'riya'));
select is((select season_id from games where id = :'G3'), null::uuid, 'a casual game is in no season');

-- league: three views
select is(testing.one(:OUT, $$select count(*) from public.league('$$ || :'crew' || $$', '$$ || (select season_id from games where id = :'G1') || $$')$$), 'Only crew members can see the league', 'outsiders cannot see the league');
select testing.as_phone(:RIYA, $$select name, games, total_bb, avg_bb, points, wins, hands from public.league('$$ || :'crew' || $$', '$$ || (select season_id from games where id = :'G1') || $$')$$) as lg \gset
select is(:'lg'::jsonb, '[{"avg_bb": null, "name": "Riya", "wins": 1, "games": 1, "hands": 10, "points": 10, "total_bb": 35.00}, {"avg_bb": null, "name": "Arjun", "wins": 0, "games": 1, "hands": 10, "points": 5, "total_bb": -15.00}, {"avg_bb": null, "name": "Owner", "wins": 0, "games": 1, "hands": 10, "points": 3, "total_bb": -20.00}]'::jsonb, 'total, points, wins; guests and casual games left out; average needs 5 games');
-- league totals equal the sum of hands (chips): for each player, sum of hand nets = net chips across the season's games
select is((select sum(hp.net)::int from hand_players hp where hp.game_id = :'G1' and hp.player_key = :'riya'), 700, 'hand nets add up');

-- average shows from the 5th game
select pg_temp.rec('record_game_end', format('{"game":%s,"endedAt":"2026-11-%s T17:00:00Z","players":[{"key":"%s","account":"%s","name":"Owner","buyins":1000,"final":1100},{"key":"%s","account":"%s","name":"Riya","buyins":1000,"final":900}]}',
  replace(replace(:'game1', :'G1', '11111111-1111-4111-8111-00000000010' || n), 'LG01', 'LGA' || n), lpad((10 + n)::text, 2, '0'), :'owner', :'owner', :'riya', :'riya'))
  from generate_series(1, 4) n;
select is(testing.one(:OWNER, $$select avg_bb from public.league('$$ || :'crew' || $$', '$$ || (select season_id from games where id = :'G1') || $$') where name = 'Owner'$$), '0.00', 'average per game appears at 5 games (-20, then +5 four times)');

-- history and privacy
select is(testing.one(:ARJUN, $$select count(*) from public.my_games()$$), '1', 'my games: the games I played');
select is(testing.one(:OUT, $$select count(*) from hands$$), '0', 'an outsider sees no hands');
select is(testing.one(:OWNER, $$select count(*) from hands where game_id = '$$ || :'G3' || $$'$$), '0', 'casual game had no hands');
select is(testing.one(:ARJUN, $$select count(*) from games$$), '7', 'a member sees the crew''s games, including ones they did not play');
\set G4 '11111111-1111-4111-8111-000000000004'
select pg_temp.rec('record_hand', pg_temp.hand(format('{"id":"%s","table":"NOCR","server":"test","startStack":1000,"bigBlind":10,"startedAt":"2026-11-02T10:00:00Z"}', :'G4'), 1,
  format('[{"key":"%s","account":"%s","name":"Outsider","net":5},{"key":"g","name":"Guest","net":-5}]', :'outsider', :'outsider')));
select is(testing.one(:OUT, $$select count(*) from hands$$), '1', 'a game without a crew is visible to its own players');
select is(testing.one(:RIYA, $$select count(*) from hands where game_id = '$$ || :'G4' || $$'$$), '0', 'and to nobody else');

-- admin fixes, always logged
select is(testing.one(:RIYA, $$select public.void_game('$$ || :'G2' || $$', 'test')$$), 'Only a crew admin can do that', 'members cannot void');
select is(testing.one(:OWNER, $$select public.adjust_result('$$ || :'G1' || $$', '$$ || :'riya' || $$', '$$ || :'arjun' || $$', 300, 'Arjun''s all-in was misread')$$), '', 'an admin moves chips to correct a result');
select is((select sum(final_chips - buyins)::int from game_players where game_id = :'G1'), 0, 'totals still balance');
select is((select place from game_players where game_id = :'G1' and player_key = :'arjun'), 2, 'places are worked out again');
select is(testing.one(:ARJUN, $$select reason from result_changes$$), 'Arjun''s all-in was misread', 'the crew sees who changed what and why');
select testing.one(:OWNER, $$select public.void_game('$$ || :'G2' || $$', 'Played with the wrong blinds')$$);
select is((select status from games where id = :'G2'), 'void', 'a voided game');
select is(testing.one(:OWNER, $$select count(*) from public.league('$$ || :'crew' || $$', '$$ || (select season_id from games where id = :'G2') || $$')$$), '0', 'leaves the league');

-- season close: winner and iron chair; once
update seasons set ends_at = now() - interval '1 minute' where id = (select season_id from games where id = :'G1');
select is(pg_temp.rec('close_due_seasons', '{"at":"now"}'), '1', 'the due season closes');
select is(pg_temp.rec('close_due_seasons', '{"at":"again"}'), '0', 'and only once');
select is((select string_agg(t.kind || ':' || a.name, ' ' order by t.kind, a.name) from trophies t join accounts a on a.id = t.account_id where t.season_id = (select season_id from games where id = :'G1')), 'iron_chair:Owner iron_chair:Riya season_winner:Arjun season_winner:Owner season_winner:Riya', 'winner and iron chair; a three-way tie on 0 shares the title');

select * from finish();
rollback;
