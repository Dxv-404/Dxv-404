-- Phase 5: a night played offline is uploaded, waits for its players, and counts once two confirm it.
begin;
set search_path = public, extensions;
select plan(22);
insert into private.settings values ('recorder_token_hash', encode(extensions.digest('t', 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value;
create function pg_temp.rec(fn text, body text) returns text language sql as $$ select testing.one(null, format('select public.%s(%L, %L)', fn, body, testing.sign('t', body))) $$;

\set A '''00000000-0000-0000-0000-00000000e101'''
\set B '''00000000-0000-0000-0000-00000000e102'''
\set C '''00000000-0000-0000-0000-00000000e103'''
\set OUT '''00000000-0000-0000-0000-00000000e104'''
select testing.one(:A, $$select (public.ensure_account('Anu')).id$$) as a \gset
select testing.one(:B, $$select (public.ensure_account('Babu')).id$$) as b \gset
select testing.one(:C, $$select (public.ensure_account('Chitra')).id$$) as c \gset
select testing.one(:OUT, $$select (public.ensure_account('Out')).id$$) as o \gset
select testing.one(:A, $$select (public.create_crew('Train crew')).id$$) as crew \gset
select testing.one(:A, $$select public.create_invite('$$ || :'crew' || $$')$$) as inv \gset
select testing.one(:B, $$select public.join_crew('$$ || :'inv' || $$')$$);
select testing.one(:C, $$select public.join_crew('$$ || :'inv' || $$')$$);
\set G '33333333-3333-4333-8333-000000000001'
select format('{"id":"%s","crew":"%s","table":"OFFLINE","server":"host","casual":false,"startStack":1000,"bigBlind":10,"startedAt":"2026-11-02T14:00:00Z"}', :'G', :'crew') as game \gset
select format('[{"key":"%s","account":"%s","name":"Anu","net":30,"won":true,"showdown":true,"bestHand":7},{"key":"%s","account":"%s","name":"Babu","net":-20},{"key":"%s","account":"%s","name":"Chitra","net":-10}]', :'a', :'a', :'b', :'b', :'c', :'c') as players \gset
select is(pg_temp.rec('record_hand', format('{"game":%s,"hand":{"no":1,"playedAt":"2026-11-02T14:05:00Z","deckCommit":"x","pot":60,"replay":{},"players":%s}}', :'game', :'players')), 'ok', 'an uploaded offline hand is stored');
select is((select count(*)::int from trophies where game_id = :'G'), 0, 'but no trophy yet');
select is(pg_temp.rec('record_game_end', format('{"game":%s,"endedAt":"2026-11-02T16:00:00Z","players":[{"key":"%s","account":"%s","name":"Anu","buyins":1000,"final":1030,"minStack":50},{"key":"%s","account":"%s","name":"Babu","buyins":1000,"final":980,"minStack":900},{"key":"%s","account":"%s","name":"Chitra","buyins":1000,"final":990,"minStack":900}]}', :'game', :'a', :'a', :'b', :'b', :'c', :'c')), 'ok', 'and the end of the night');
select is((select status || ' ' || awaiting_confirmation from games where id = :'G'), 'live true', 'the night waits for its players');
select is(testing.one(:B, $$select count(*) from public.league('$$ || :'crew' || $$')$$), '0', 'it is not in the league yet');
select is(testing.one(:B, $$select hands from public.pending_offline_games()$$), '1', 'Babu sees it waiting');
select is(testing.one(:B, $$select count(*) from public.my_games()$$), '0', 'not in his history until it is confirmed');
-- an online server can never add hands to this game, nor an offline upload to an online game
select is(pg_temp.rec('record_hand', format('{"game":%s,"hand":{"no":2,"playedAt":"2026-11-02T14:06:00Z","deckCommit":"x","pot":0,"replay":{},"players":[{"key":"g","name":"G","net":0}]}}', replace(:'game', '"host"', '"oracle"'))), 'That game was played elsewhere', 'a hand claiming another server is refused');
select is(testing.one(:OUT, $$select public.confirm_offline_game('$$ || :'G' || $$')$$), 'Only its players or a crew admin can confirm this game', 'an outsider cannot confirm it');
-- Chitra says the seat with her name was not her: it becomes a guest's
select testing.one(:C, $$select public.dispute_offline_seat('$$ || :'G' || $$')$$);
select is((select account_id::text from game_players where game_id = :'G' and name = 'Chitra'), null, 'a disputed seat no longer belongs to her account');
select is(testing.one(:C, $$select count(*) from public.pending_offline_games()$$), '0', 'and it leaves her list');
select is(testing.one(:B, $$select public.confirm_offline_game('$$ || :'G' || $$')$$), 'pending', 'one confirmation is not enough');
select is(testing.one(:B, $$select confirmed::text from public.pending_offline_games()$$), 'true', 'Babu''s confirmation shows');
-- the crew owner (Anu) confirms: it counts
select is(testing.one(:A, $$select public.confirm_offline_game('$$ || :'G' || $$')$$), 'ended', 'a second player makes it count');
select is(testing.one(:B, $$select count(*) from public.league('$$ || :'crew' || $$')$$), '2', 'now it is in the league (Chitra''s seat is a guest)');
select is(testing.one(:B, $$select count(*) from public.my_games()$$), '1', 'and in history');
select is((select count(*)::int from trophies where game_id = :'G' and kind = 'four_of_a_kind'), 1, 'and the hand trophy is given');
select is((select count(*)::int from trophies where game_id = :'G' and kind = 'comeback'), 1, 'and the comeback');
-- a made-up upload: two strangers confirm a night that claims Babu lost; Babu's seat does not stay his
\set G2 '33333333-3333-4333-8333-000000000002'
\set X1 '''00000000-0000-0000-0000-00000000e105'''
\set X2 '''00000000-0000-0000-0000-00000000e106'''
select testing.one(:X1, $$select (public.ensure_account('X1')).id$$) as x1 \gset
select testing.one(:X2, $$select (public.ensure_account('X2')).id$$) as x2 \gset
select format('{"id":"%s","crew":"%s","table":"OFFLINE","server":"host","casual":false,"startStack":1000,"bigBlind":10,"startedAt":"2026-11-02T14:00:00Z"}', :'G2', :'crew') as game2 \gset
select pg_temp.rec('record_game_end', format('{"game":%s,"endedAt":"2026-11-02T16:00:00Z","players":[{"key":"%s","account":"%s","name":"X1","buyins":1000,"final":1500,"minStack":900},{"key":"%s","account":"%s","name":"X2","buyins":1000,"final":1500,"minStack":900},{"key":"%s","account":"%s","name":"Babu","buyins":1000,"final":0,"minStack":0}]}', :'game2', :'x1', :'x1', :'x2', :'x2', :'b', :'b'));
select testing.one(:X1, $$select public.confirm_offline_game('$$ || :'G2' || $$')$$);
select is(testing.one(:X2, $$select public.confirm_offline_game('$$ || :'G2' || $$')$$), 'ended', 'two strangers can finish their own made-up night');
select is((select account_id::text from game_players where game_id = :'G2' and name = 'Babu'), null, 'but a seat whose owner never confirmed is a guest''s');
select is((select crew_id::text from games where id = :'G2'), null, 'and it is not in the crew''s league (its confirmers are not members)');
select is(testing.one(:OUT, $$select public.rescue_status('$$ || gen_random_uuid() || $$')$$), null, 'a stranger learns nothing about a rescue request');
select * from finish();
rollback;
