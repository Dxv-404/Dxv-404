-- Player avatars (20261103000019): set_avatar keeps a player's pick on their account as 'tp:<id>' (null =
-- initials) after checking its shape, and every crews answer that shows a player's face carries 'avatar'.
begin;
set search_path = public, extensions;
select plan(53);

insert into private.settings values ('recorder_token_hash', encode(extensions.digest('test-recorder-token', 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value;
create function pg_temp.rec(fn text, body text) returns text language sql as $$
  select testing.one(null, format('select public.%s(%L, %L)', fn, body, testing.sign('test-recorder-token', body))) $$;

\set DEV '''00000000-0000-0000-0000-0000000a0001'''
\set RIYA '''00000000-0000-0000-0000-0000000a0002'''
\set KABIR '''00000000-0000-0000-0000-0000000a0003'''
\set ZOYA '''00000000-0000-0000-0000-0000000a0004'''
select testing.one(:DEV, $$select (public.ensure_account('Dev')).id$$) as dev \gset
select testing.one(:RIYA, $$select (public.ensure_account('Riya')).id$$) as riya \gset
select testing.one(:KABIR, $$select (public.ensure_account('Kabir')).id$$) as kabir \gset
select testing.one(:ZOYA, $$select (public.ensure_account('Zoya')).id$$) as zoya \gset

-- ---------------------------------------------------------------- set_avatar
select is(testing.one(null, $$select public.set_avatar('train-night-owl')$$), 'permission denied for function set_avatar', 'not without signing in');
select is(has_function_privilege('anon', 'public.set_avatar(text)', 'execute'), false, 'not open to anonymous callers');
select is(testing.one(:DEV, $$select public.set_avatar('train-night-owl')$$), 'tp:train-night-owl', 'Dev picks the Night Owl (from another theme than his)');
select is((select avatar_url from accounts where id = :'dev'), 'tp:train-night-owl', 'kept on his account as tp:<id>');
select is(testing.one(:DEV, $$select public.set_avatar('tp:pixel-wizard')$$), 'tp:pixel-wizard', 'the stored form is taken too');
select is(testing.one(:DEV, $$select public.set_avatar('  edo-kabuki-star ')$$), 'tp:edo-kabuki-star', 'spaces around it are dropped');
select is(testing.one(:DEV, $$select coalesce(public.set_avatar(null), 'initials')$$), 'initials', 'null goes back to initials');
select is((select avatar_url from accounts where id = :'dev'), null, 'nothing stored');
select is(testing.one(:DEV, $$select coalesce(public.set_avatar(''), 'initials')$$), 'initials', 'and so does an empty pick');
select is(testing.one(:DEV, $$select public.set_avatar('noir-detective')$$), 'tp:noir-detective', 'picks again');

-- refused: anything that is not the shape of an avatar id; the stored pick stays as it was
select is(testing.one(:DEV, format('select public.set_avatar(%L)', x)), 'Unknown avatar', format('refuses %s', x))
  from unnest(array['https://example.com/me.png', 'tp:../../etc/passwd', 'Train-Night-Owl', 'train', 'train-', 'dragon-knight',
    '<svg onload=alert(1)>', 'tp:', 'classic-' || repeat('a', 40), 'train night owl', 'tp:tp:train-night-owl', 'pixel-wizard;drop table accounts']) x;
select is((select avatar_url from accounts where id = :'dev'), 'tp:noir-detective', 'a refused pick changes nothing');
select is(testing.one(:RIYA, $$select public.set_avatar('cyber-hex-cat')$$), 'tp:cyber-hex-cat', 'each player picks their own');
select is((select avatar_url from accounts where id = :'dev'), 'tp:noir-detective', 'Riya''s pick is not Dev''s');

-- the column itself only takes the shape too (a phone could update its row directly)
select is(testing.one(:DEV, format($$update accounts set avatar_url = 'javascript:alert(1)' where id = %L returning 1$$, :'dev')),
  'new row for relation "accounts" violates check constraint "accounts_avatar_here"', 'a direct update is checked by the database');
select is(testing.one(:DEV, format($$update accounts set avatar_url = 'tp:ink-crane' where id = %L returning avatar_url$$, :'dev')), 'tp:ink-crane', 'a good one is fine');
select is(testing.one(:DEV, $$select public.set_avatar('noir-detective')$$), 'tp:noir-detective', 'back to the detective');
select is(testing.one(:RIYA, format($$update accounts set avatar_url = 'tp:edo-samurai' where id = %L returning avatar_url$$, :'dev')), null, 'nobody changes someone else''s');

-- ---------------------------------------------------------------- a crew: Dev leads, Riya and Kabir play, Zoya asks to join
select testing.as_phone(:DEV, $$select public.create_crew_v3('Avatar Night', 'shield', '#c0392b', true) as c$$) -> 0 -> 'c' as made \gset
select :'made'::jsonb ->> 'id' as crew, :'made'::jsonb ->> 'code' as code \gset
select testing.one(:DEV, format('select public.crew_settings_v2(%L, p_auto_admit => true)', :'crew'));
select testing.one(:RIYA, format('select public.ask_to_join(%L)', :'code'));
select testing.one(:KABIR, format('select public.ask_to_join(%L)', :'code'));
select testing.one(:DEV, format('select public.crew_settings_v2(%L, p_auto_admit => false)', :'crew'));
select testing.one(:ZOYA, format('select public.ask_to_join(%L)', :'code'));
select testing.one(:ZOYA, $$select public.set_avatar('velvet-diamond')$$);
update crews set scoring = 'bb' where id = :'crew';

-- a finished game (Riya wins) and a live one at a hosted crew table
select format('{"id":"%s","crew":"%s","table":"QK7P","server":"test","startStack":1000,"bigBlind":20,"startedAt":"%s"}', '44444444-4444-4444-8444-000000000001', :'crew', to_char(now() - interval '3 hours', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) as g1,
       format('{"id":"%s","crew":"%s","table":"LV22","server":"test","startStack":1000,"bigBlind":20,"startedAt":"%s"}', '44444444-4444-4444-8444-000000000002', :'crew', to_char(now() - interval '2 minutes', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) as g2 \gset
select is(pg_temp.rec('record_game_end', format('{"game":%s,"endedAt":"%s","players":[{"key":"%s","account":"%s","name":"Riya","buyins":1000,"final":1400},{"key":"%s","account":"%s","name":"Dev","buyins":1000,"final":900},{"key":"%s","account":"%s","name":"Kabir","buyins":1000,"final":700}]}',
  :'g1', to_char(now() - interval '2 hours', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), :'riya', :'riya', :'dev', :'dev', :'kabir', :'kabir')), 'ok', 'a game ends');
select testing.one(:DEV, format('select public.host_crew_table(%L, %L, %L, null)', :'crew', 'LV22', 'online'));
select is(pg_temp.rec('record_hand', format('{"game":%s,"hand":{"no":1,"playedAt":"%s","deckCommit":"c","pot":40,"replay":{"v":1,"keys":["%s","%s"],"frames":[]},"full":{"inputs":[]},"players":[{"key":"%s","account":"%s","name":"Dev","net":20,"won":true},{"key":"%s","account":"%s","name":"Kabir","net":-20}]}}',
  :'g2', to_char(now() - interval '1 minute', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), :'dev', :'kabir', :'dev', :'dev', :'kabir', :'kabir')), 'ok', 'a hand at the live crew table');

-- ---------------------------------------------------------------- the crews answers carry 'avatar' (null = initials)
select testing.as_phone(:KABIR, 'select public.my_crews() as c') -> 0 -> 'c' -> 0 as card \gset
select is((select string_agg((f ->> 'name') || '=' || coalesce(f ->> 'avatar', '-'), ' ' order by f ->> 'name') from jsonb_array_elements(:'card'::jsonb -> 'faces') f),
  'Dev=noir-detective Kabir=- Riya=cyber-hex-cat', 'crew card faces');
select is((select string_agg((f ->> 'name') || '=' || coalesce(f ->> 'avatar', '-'), ' ' order by f ->> 'name') from jsonb_array_elements(:'card'::jsonb -> 'live' -> 'faces') f),
  'Dev=noir-detective Kabir=-', 'the live table''s faces');
select testing.as_phone(:ZOYA, format('select public.crew_preview(%L) as c', :'code')) -> 0 -> 'c' as pv \gset
select is(:'pv'::jsonb -> 'leader' ->> 'avatar', 'noir-detective', 'the invitation shows the leader''s avatar');
select is((select string_agg(coalesce(f ->> 'avatar', '-'), ' ' order by f ->> 'name') from jsonb_array_elements(:'pv'::jsonb -> 'faces') f), 'noir-detective - cyber-hex-cat', 'and the members''');
select testing.as_phone(:DEV, format('select public.crew_page(%L) as c', :'crew')) -> 0 -> 'c' as pg \gset
select is(:'pg'::jsonb -> 'leader' ->> 'avatar', 'noir-detective', 'crew page: the leader');
select is(:'pg'::jsonb -> 'podium' -> 0 ->> 'name', 'Riya', 'the podium is led by Riya');
select is((select string_agg((r ->> 'name') || '=' || coalesce(r ->> 'avatar', '-'), ' ' order by (r ->> 'rank')::int) from jsonb_array_elements(:'pg'::jsonb -> 'podium') r),
  'Riya=cyber-hex-cat Dev=noir-detective Kabir=-', 'the podium''s avatars');
select is(:'pg'::jsonb -> 'last_game' -> 'winner' ->> 'avatar', 'cyber-hex-cat', 'the last game''s winner');
select is(:'pg'::jsonb -> 'requests' -> 0 ->> 'avatar', 'velvet-diamond', 'a request to join');
select is(:'pg'::jsonb -> 'live' -> 'faces' -> 0 ? 'avatar', true, 'and the live table');
select is(testing.one(:DEV, format($$select string_agg((r ->> 'name') || '=' || coalesce(r ->> 'avatar', '-'), ' ' order by (r ->> 'rank')::int) from jsonb_array_elements(public.crew_league(%L) -> 'rows') r$$, :'crew')),
  'Riya=cyber-hex-cat Dev=noir-detective Kabir=-', 'league rows');
select is(testing.one(:DEV, format($$select public.crew_games(%L) -> 0 -> 'winner' ->> 'avatar'$$, :'crew')), 'cyber-hex-cat', 'the games list''s winner');
select is(testing.one(:DEV, format($$select string_agg((m ->> 'name') || '=' || coalesce(m ->> 'avatar', '-'), ' ' order by m ->> 'name') from jsonb_array_elements(public.crew_members_v3(%L)) m$$, :'crew')),
  'Dev=noir-detective Kabir=- Riya=cyber-hex-cat', 'members');
select is(testing.one(:DEV, format($$select public.crew_player(%L, %L) ->> 'avatar'$$, :'crew', :'riya')), 'cyber-hex-cat', 'the player card');
select is(testing.one(:DEV, format($$select coalesce(public.crew_player(%L, %L) ->> 'avatar', '-')$$, :'crew', :'kabir')), '-', 'initials on the player card for Kabir');
select is(testing.one(:DEV, format($$select public.crew_join_requests(%L) -> 0 ->> 'avatar'$$, :'crew')), 'velvet-diamond', 'the requests list');

-- a change shows at once; Initials clears it everywhere
select testing.one(:RIYA, $$select public.set_avatar(null)$$);
select is(testing.one(:DEV, format($$select coalesce(public.crew_player(%L, %L) ->> 'avatar', '-')$$, :'crew', :'riya')), '-', 'Riya back on initials: her card');
select is(testing.one(:DEV, format($$select coalesce(public.crew_page(%L) -> 'podium' -> 0 ->> 'avatar', '-')$$, :'crew')), '-', 'and the podium');
select testing.one(:RIYA, $$select public.set_avatar('edo-lucky-koi')$$);
select is(testing.one(:DEV, format($$select public.crew_league(%L) -> 'rows' -> 0 ->> 'avatar'$$, :'crew')), 'edo-lucky-koi', 'a new pick shows in the league');

-- the answers keep everything they had (only 'avatar' is new)
select is((select array_agg(k order by k) from jsonb_object_keys(:'pg'::jsonb) k),
  array['can_host', 'can_invite', 'code', 'crew', 'disputes', 'last_game', 'leader', 'live', 'me', 'members', 'next_season', 'podium', 'requests', 'role', 'season', 'seasons', 'usual'], 'the crew page has the same parts');

-- a deleted account's avatar goes with its name
select testing.one(:KABIR, $$select public.set_avatar('pixel-knight')$$);
select testing.one(:KABIR, $$select public.delete_my_account()$$);
select is((select avatar_url from accounts where id = :'kabir'), null, 'deleting an account clears its avatar');
select is(private.avatar_of(:'kabir'), null, 'and nobody sees it any more');

select * from finish();
rollback;
