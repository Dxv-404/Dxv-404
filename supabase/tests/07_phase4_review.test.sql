-- Phase 4 review: privacy of replays, late hands, merges carry games, voids remove trophies, deleted names,
-- and the 90-day replay clean-up.
begin;
set search_path = public, extensions;
select plan(17);

insert into private.settings values ('recorder_token_hash', encode(extensions.digest('t0k', 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value;
create function pg_temp.rec(fn text, body text) returns text language sql as $$ select testing.one(null, format('select public.%s(%L, %L)', fn, body, 't0k')) $$;

\set A '''00000000-0000-0000-0000-00000000c001'''
\set B '''00000000-0000-0000-0000-00000000c002'''
\set W '''00000000-0000-0000-0000-00000000c003'''
\set NEWP '''00000000-0000-0000-0000-00000000c004'''
select testing.one(:A, $$select (public.ensure_account('Anu')).id$$) as a \gset
select testing.one(:B, $$select (public.ensure_account('Babu')).id$$) as b \gset
select testing.one(:W, $$select (public.ensure_account('Watcher')).id$$) as w \gset
select testing.one(:A, $$select (public.create_crew('Privacy crew')).id$$) as crew \gset
select testing.one(:A, $$select public.create_invite('$$ || :'crew' || $$')$$) as inv \gset
select testing.one(:B, $$select public.join_crew('$$ || :'inv' || $$')$$);
select testing.one(:W, $$select public.join_crew('$$ || :'inv' || $$')$$);

\set G '33333333-3333-4333-8333-000000000001'
select format('{"id":"%s","crew":"%s","table":"PV01","server":"test","startStack":1000,"bigBlind":20,"startedAt":"2026-11-02T10:00:00Z"}', :'G', :'crew') as game \gset
create function pg_temp.hand(game text, no int, at text default '2026-11-02T10:05:00Z', best int default null) returns text language sql as $$
  select format('{"game":%s,"hand":{"no":%s,"playedAt":"%s","deckCommit":"c","pot":40,"replay":{"v":1,"frames":[{"say":{"t":"deal"},"players":[{"k":"x","cards":null}]}]},"full":{"proof":{"dealerSeed":"SECRET"}},"players":[{"key":"%s","account":"%s","name":"Anu","net":20,"won":true,"showdown":true,"bestHand":%s,"cards":["As","Ad"]},{"key":"%s","account":"%s","name":"Babu","net":-20,"cards":["7c","2d"]}]}}',
    game, no, at, current_setting('my.a'), current_setting('my.a'), coalesce(best::text, 'null'), current_setting('my.b'), current_setting('my.b')) $$;
select set_config('my.a', :'a', false), set_config('my.b', :'b', false);
select pg_temp.rec('record_hand', pg_temp.hand(:'game', 1, '2026-11-02T10:05:00Z', 7));

-- 1. privacy
select is(testing.one(:W, $$select record -> 'frames' -> 0 -> 'say' ->> 't' from hands$$), 'deal', 'a crew member who was not there sees the public replay');
select is(testing.one(:W, $$select count(*) from hand_cards_private$$), '0', 'but nobody''s hole cards');
select is(testing.one(:B, $$select array_to_string(cards, ' ') from hand_cards_private$$), '7c 2d', 'each player sees only their own cards');
select is(testing.one(:A, $$select count(*) from hand_cards_private$$), '1', 'one row each, their own');
select is(testing.one(:B, $$select count(*) from private.hand_records$$), 'permission denied for table hand_records', 'the full record (with the seed) is out of reach');
select is((select record -> 'proof' ->> 'dealerSeed' from private.hand_records where game_id = :'G'), 'SECRET', 'it is kept privately, for audits and backups');
select is((select count(*)::int from hands where game_id = :'G' and record::text like '%SECRET%'), 0, 'the public replay does not contain it');

-- 2. a hand that arrives after the end is still stored and counted
select pg_temp.rec('record_game_end', format('{"game":%s,"endedAt":"2026-11-02T11:00:00Z","players":[{"key":"%s","account":"%s","name":"Anu","buyins":1000,"final":1040},{"key":"%s","account":"%s","name":"Babu","buyins":1000,"final":960}]}', :'game', :'a', :'a', :'b', :'b'));
select is(pg_temp.rec('record_hand', pg_temp.hand(:'game', 2)), 'ok', 'a late hand after the end is stored');
select is((select hands || '/' || (select hands from game_players where game_id = :'G' and player_key = :'a') from games where id = :'G'), '2/2', 'and the game and player stats count it');

-- 3. merging (recovery with "add this phone's games") brings the games along
select testing.one(:A, $$select public.new_recovery_code()$$) as code \gset
select testing.one(:NEWP, $$select (public.ensure_account('Anu new phone')).id$$) as newacc \gset
\set G2 '33333333-3333-4333-8333-000000000002'
select pg_temp.rec('record_game_end', format('{"game":{"id":"%s","table":"PV02","server":"test","startStack":1000,"bigBlind":20,"startedAt":"2026-11-02T12:00:00Z"},"endedAt":"2026-11-02T13:00:00Z","players":[{"key":"%s","account":"%s","name":"Anu new phone","buyins":1000,"final":1500},{"key":"g","name":"Guest","buyins":1000,"final":500}]}', :'G2', :'newacc', :'newacc'));
select is(testing.one(:NEWP, $$select count(*) from public.my_games()$$), '1', 'the new phone has one game of its own');
select testing.one(:NEWP, $$select (public.recover_account('$$ || :'code' || $$', true)).id$$);
select is(testing.one(:NEWP, $$select count(*) from public.my_games()$$), '2', 'after recovering with merge, both games are in the old account''s history');

-- 4. voiding a game removes its trophies
select is((select count(*)::int from trophies where game_id = :'G'), 1, 'four of a kind was a trophy');
select testing.one(:A, $$select public.void_game('$$ || :'G' || $$', 'test night')$$);
select is((select count(*)::int from trophies where game_id = :'G'), 0, 'void: the trophy goes too');

-- 5. a deleted account's results stay, as "Former player"
select testing.one(:B, $$select public.delete_my_account()$$);
select is((select name from game_players where game_id = :'G' and player_key = :'b'), 'Former player', 'results stay, without the name');
select is((select count(*)::int from hand_cards_private where account_id = :'b'), 0, 'and their cards are gone');

-- 6. replays older than 90 days are cleared; hand rows and stats stay; hands with a trophy keep theirs
\set G3 '33333333-3333-4333-8333-000000000003'
select replace(replace(:'game', :'G', :'G3'), 'PV01', 'PV03') as game3 \gset
select pg_temp.rec('record_hand', pg_temp.hand(:'game3', 1, '2026-06-01T10:00:00Z'));
select pg_temp.rec('record_hand', pg_temp.hand(:'game3', 2, '2026-06-01T10:10:00Z', 8));
select is(pg_temp.rec('daily_upkeep', '{"x":1}')::jsonb ->> 'replays_pruned', '1', 'the old replay is cleared');
select is((select string_agg(hand_no || ':' || (record is not null) || ':' || (select count(*) from private.hand_records r where r.game_id = h.game_id and r.hand_no = h.hand_no), ' ' order by hand_no) from hands h where game_id = :'G3'), '1:false:0 2:true:1', 'the hand stays without its replay; the straight flush keeps everything');

select * from finish();
rollback;
