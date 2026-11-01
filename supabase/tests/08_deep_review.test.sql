-- Deep review after Phase 4: every hole found by trying to break things stays closed.
begin;
set search_path = public, extensions;
select plan(47);

insert into private.settings values ('recorder_token_hash', encode(extensions.digest('test-recorder-token', 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value;
-- how the table servers sign now: v1.<ms>.<hmac of "ms.body" keyed with the token's hash>
create function pg_temp.sign(body text, at_ms bigint default null) returns text language sql as $$
  select 'v1.' || t || '.' || encode(extensions.hmac(t || '.' || body, encode(extensions.digest('test-recorder-token', 'sha256'), 'hex'), 'sha256'), 'hex')
  from (select coalesce(at_ms, (extract(epoch from now()) * 1000)::bigint)::text t) x $$;
create function pg_temp.rec(fn text, body text) returns text language sql as $$
  select testing.one(null, format('select public.%s(%L, %L)', fn, body, pg_temp.sign(body))) $$;

\set OWNER '''00000000-0000-0000-0000-00000000c001'''
\set VICTIM '''00000000-0000-0000-0000-00000000c002'''
\set EVE '''00000000-0000-0000-0000-00000000c003'''
\set EVE2 '''00000000-0000-0000-0000-00000000c004'''
\set NEWPHONE '''00000000-0000-0000-0000-00000000c005'''
select testing.one(:OWNER, $$select (public.ensure_account('Owner')).id$$) as owner \gset
select testing.one(:VICTIM, $$select (public.ensure_account('Victim')).id$$) as victim \gset
select testing.one(:EVE, $$select (public.ensure_account('Eve')).id$$) as eve \gset
select testing.one(:VICTIM, $$select public.new_recovery_code()$$) as victim_code \gset

-- ---------------------------------------------------------------- rescue cannot steal an account
-- Eve makes her own crew, gets the victim to join, then asks from a spare phone to be the victim
select testing.one(:EVE, $$select (public.create_crew('Eve crew')).id$$) as evecrew \gset
select testing.one(:EVE, $$select public.create_invite('$$ || :'evecrew' || $$')$$) as eveinv \gset
select testing.one(:VICTIM, $$select public.join_crew('$$ || :'eveinv' || $$')$$);
select testing.one(:EVE2, $$select public.request_rescue('$$ || :'eveinv' || $$', '$$ || :'victim' || $$')$$) as r1 \gset
select is(testing.one(:EVE, $$select public.decide_rescue('$$ || :'r1' || $$', true)$$),
  'They joined this crew less than a week ago, so the crew cannot vouch for them yet. Their recovery code still works.', 'a crew cannot vouch for someone who joined it this week');
-- a week later Eve tries again: approval does not hand the account over while the victim's phone is in use
update crew_members set joined_at = now() - interval '8 days' where account_id = :'victim';
select testing.one(:EVE, $$select public.decide_rescue('$$ || :'r1' || $$', true)$$);
select is(testing.one(:EVE2, $$select public.rescue_status('$$ || :'r1' || $$') ->> 'status'$$), 'approved', 'approved, but waiting');
select ok(testing.one(:EVE2, $$select (public.rescue_status('$$ || :'r1' || $$') ->> 'finishes_at')::timestamptz > now() + interval '23 hours'$$)::boolean, 'it finishes a day after the victim''s phone was last used');
select is(testing.one(:EVE2, $$select count(*) from public.my_phones()$$), '0', 'meanwhile the asking phone is not the victim');
select is(testing.one(:VICTIM, $$select crew_name from public.rescues_of_me()$$), 'Eve crew', 'the victim''s own phone sees the request (even as an ordinary member)');
select testing.one(:VICTIM, $$select public.decide_rescue('$$ || :'r1' || $$', false)$$);
select is(testing.one(:EVE2, $$select public.rescue_status('$$ || :'r1' || $$') ->> 'status'$$), 'denied', '"That''s not me" stops it, even after approval');
select is(testing.as_phone(:EVE, $$select what, detail ->> 'by_target' t from crew_audit where what like 'rescue%' order by id$$),
  '[{"t": null, "what": "rescue_requested"}, {"t": null, "what": "rescue_approved"}, {"t": "true", "what": "rescue_denied"}]', 'the crew log shows the player said no');
select is(testing.one(:EVE2, $$select public.request_rescue('$$ || :'eveinv' || $$', '$$ || :'victim' || $$')$$) is not null, true, 'asking again is possible');
select testing.one(:EVE2, $$select id from rescue_requests where status = 'pending'$$) as r2 \gset
select is(testing.one(:NEWPHONE, $$select public.request_rescue('$$ || :'eveinv' || $$', '$$ || :'victim' || $$')$$) is not null, true, 'a second request for the same player');
select is(testing.one(:EVE, $$select public.request_rescue('$$ || :'eveinv' || $$', '$$ || :'victim' || $$')$$), 'There are already requests waiting for that player', 'but not a pile of them');

-- the real case: the victim really lost the phone (quiet for a day); approval finishes at once
select testing.one(:EVE, $$select public.decide_rescue('$$ || :'r2' || $$', true)$$);
select is(testing.one(:EVE2, $$select public.rescue_status('$$ || :'r2' || $$') ->> 'status'$$), 'approved', 'still waiting while the old phone is in use');
update account_logins set last_seen = now() - interval '25 hours' where account_id = :'victim';
select is(testing.one(:EVE2, $$select public.rescue_status('$$ || :'r2' || $$') ->> 'status'$$), 'done', 'a day after the old phone went quiet it finishes');
select is(testing.one(:EVE2, $$select (public.ensure_account('x')).id$$), :'victim', 'the new phone is the account');
-- for 7 days the rescued phone cannot lock the owner out
select alike(testing.one(:EVE2, $$select public.logout_other_phones()$$), 'This phone joined your account through a crew rescue.%', 'it cannot log the other phones out');
select alike(testing.one(:EVE2, $$select public.new_recovery_code()$$), 'This phone joined your account through a crew rescue.%', 'nor make a new recovery code');
select alike(testing.one(:EVE2, $$select public.delete_my_account()$$), 'This phone joined your account through a crew rescue.%', 'nor delete the account');
select is(testing.one(:VICTIM, $$select public.logout_phone('$$ || :EVE2 || $$')$$), 'true', 'while the real owner can throw the rescued phone out');
select is(testing.one(:NEWPHONE, $$select (public.recover_account('$$ || :'victim_code' || $$')).id$$), :'victim', 'and the old recovery code still works');
-- a phone that came back with the code is fully trusted
select is(testing.one(:NEWPHONE, $$select public.new_recovery_code() is not null$$), 'true', 'a phone that used the recovery code is not held back');

-- ---------------------------------------------------------------- crews
\set M1 '''00000000-0000-0000-0000-00000000c011'''
select testing.one(:OWNER, $$select (public.create_crew('Main')).id$$) as crew \gset
select testing.one(:OWNER, $$select public.create_invite('$$ || :'crew' || $$')$$) as inv \gset
select testing.one(:OWNER, $$select public.create_invite('$$ || :'crew' || $$', true)$$) as once \gset
select testing.one(:M1, $$select (public.ensure_account('Member')).id$$) as m1 \gset
select testing.one(:M1, $$select public.join_crew('$$ || :'once' || $$')$$);
select is(testing.one(:EVE2, $$select public.request_rescue('$$ || :'once' || $$', '$$ || :'m1' || $$')$$), 'This invite has expired', 'a used single-use link cannot be used to ask for a rescue');
select testing.one(:OWNER, $$select public.remove_member('$$ || :'crew' || $$', '$$ || :'m1' || $$')$$);
select is(testing.one(:M1, $$select public.join_crew('$$ || :'inv' || $$')$$), 'This invite has expired', 'a removed member cannot walk back in with the old link');
select testing.one(:OWNER, $$select public.create_invite('$$ || :'crew' || $$')$$) as inv2 \gset
select is(testing.one(:OWNER, $$select public.revoke_invites('$$ || :'crew' || $$')$$), '1', 'admins can withdraw links');
select is(testing.one(:M1, $$select public.join_crew('$$ || :'inv2' || $$')$$), 'This invite has expired', 'a withdrawn link stops working');
select is(testing.one(:M1, $$select public.revoke_invites('$$ || :'crew' || $$')$$), 'Only a crew admin can do that', 'members cannot withdraw links');
-- throwaway phones cannot fill a crew that needs approval
select testing.one(:OWNER, $$select public.update_crew('$$ || :'crew' || $$', p_require_approval => true)$$);
select testing.one(:OWNER, $$select public.create_invite('$$ || :'crew' || $$')$$) as inv3 \gset
select testing.as_phone(('00000000-0000-0000-0000-0000000d00' || lpad(n::text, 2, '0'))::uuid, $$select (public.ensure_account('Spam')).id, public.join_crew('$$ || :'inv3' || $$')$$) from generate_series(1, 12) n;
select is((select count(*)::int from crew_members where crew_id = :'crew' and status = 'pending'), 10, 'at most 10 wait for approval');
select testing.one('00000000-0000-0000-0000-0000000d0099', $$select (public.ensure_account('Late')).id$$);
select is(testing.one('00000000-0000-0000-0000-0000000d0099', $$select public.join_crew('$$ || :'inv3' || $$')$$), 'Too many people are waiting to join this crew. Ask an admin.', 'the eleventh is told to ask an admin');

-- deleting an account leaves its crews and closes requests about it
\set DEL '''00000000-0000-0000-0000-00000000c021'''
\set DELNEW '''00000000-0000-0000-0000-00000000c022'''
select testing.one(:DEL, $$select (public.ensure_account('Leaving')).id$$) as del \gset
select testing.one(:OWNER, $$select public.update_crew('$$ || :'crew' || $$', p_require_approval => false)$$);
select testing.one(:DEL, $$select public.join_crew('$$ || :'inv3' || $$')$$);
select testing.one(:OWNER, $$select public.set_role('$$ || :'crew' || $$', '$$ || :'del' || $$', 'admin')$$);
select testing.one(:DELNEW, $$select public.request_rescue('$$ || :'inv3' || $$', '$$ || :'del' || $$')$$);
select testing.one(:DEL, $$select public.delete_my_account()$$);
select is((select count(*)::int from crew_members where account_id = :'del'), 0, 'a deleted account keeps no crew place or role');
select is((select count(*)::int from rescue_requests where target_account = :'del' and status in ('pending', 'approved')), 0, 'and no open rescue');

-- ---------------------------------------------------------------- league: corrections and late games
select testing.one(:VICTIM, $$select public.join_crew('$$ || :'inv3' || $$')$$);
\set G1 '22222222-2222-4222-8222-000000000001'
\set G2 '22222222-2222-4222-8222-000000000002'
select format('{"id":"%s","crew":"%s","table":"DR01","server":"test","casual":false,"startStack":1000,"bigBlind":10,"startedAt":"2026-09-20T14:00:00Z"}', :'G1', :'crew') as game1 \gset
select is(pg_temp.rec('record_game_end', format('{"game":%s,"endedAt":"2026-09-20T18:00:00Z","players":[{"key":"%s","account":"%s","name":"Owner","buyins":1000,"final":1500},{"key":"%s","account":"%s","name":"Victim","buyins":1000,"final":500}]}', :'game1', :'owner', :'owner', :'victim', :'victim')), 'ok', 'a game in the July–September season');
select is(pg_temp.rec('close_due_seasons', '{"close":1}'), '1', 'the season closes');
select is((select account_id::text from trophies where kind = 'season_winner' and crew_id = :'crew'), :'owner', 'owner wins it');
-- a server that was offline catches up: a bigger game from the same season arrives late
select format('{"id":"%s","crew":"%s","table":"DR02","server":"test","casual":false,"startStack":1000,"bigBlind":10,"startedAt":"2026-09-30T14:00:00Z"}', :'G2', :'crew') as game2 \gset
select is(pg_temp.rec('record_game_end', format('{"game":%s,"endedAt":"2026-09-30T18:29:00Z","players":[{"key":"%s","account":"%s","name":"Owner","buyins":1000,"final":0},{"key":"%s","account":"%s","name":"Victim","buyins":1000,"final":2000}]}', :'game2', :'owner', :'owner', :'victim', :'victim')), 'ok', 'a late game (23:59 India time on 30 September)');
select is((select account_id::text from trophies where kind = 'season_winner' and crew_id = :'crew'), :'victim', 'the closed season''s trophy is worked out again');
select testing.one(:OWNER, $$select public.void_game('$$ || :'G2' || $$', 'played twice')$$);
select is((select account_id::text from trophies where kind = 'season_winner' and crew_id = :'crew'), :'owner', 'voiding it gives the trophy back');
-- corrections cannot make chips
select pg_temp.rec('record_hand', format('{"game":%s,"hand":{"no":1,"playedAt":"2026-09-20T15:00:00Z","deckCommit":"x","pot":20,"replay":{},"players":[{"key":"ghost","name":"Ghost","net":0}]}}', :'game1'));
select is(testing.one(:OWNER, $$select public.adjust_result('$$ || :'G1' || $$', 'ghost', '$$ || :'owner' || $$', 5000, 'fix it')$$), 'Both players need a final chip count in this game', 'chips cannot come from a seat with no final count');
select is((select sum(final_chips) - sum(buyins) from game_players where game_id = :'G1')::int, 0, 'the game still adds up');
select testing.one(:OWNER, $$select public.adjust_result('$$ || :'G1' || $$', '$$ || :'owner' || $$', '$$ || :'victim' || $$', 1000, 'scored wrong')$$);
select is((select account_id::text from trophies where kind = 'season_winner' and crew_id = :'crew'), :'victim', 'a correction in a closed season moves its trophy');

-- ---------------------------------------------------------------- recorder
select is(pg_temp.rec('record_game_end', '{"game":{"id":"22222222-2222-4222-8222-000000000009"},"players":[]}'), 'That game end is not complete', 'an incomplete game end is refused (set aside, not retried for ever)');
select is(testing.one(null, format('select public.record_game_end(%L, %L)', '{"x":1}', pg_temp.sign('{"x":1}', ((extract(epoch from now()) - 3600) * 1000)::bigint))), 'Not a table server', 'a signed call from an hour ago is refused');
select is(testing.one(null, format('select public.record_game_end(%L, %L)', '{"x":2}', pg_temp.sign('{"x":1}'))), 'Not a table server', 'a signature for another body is refused');
select is(testing.one(null, format('select public.record_game_end(%L, %L)', '{"x":3}', 'test-recorder-token')), 'Not a table server', 'the token itself is no longer accepted (it would let anyone who saw one call sign anything)');
select is((select count(*)::int from jsonb_array_elements(testing.one(null, format('select public.export_backup(%L, %L)', '{"b":1}', pg_temp.sign('{"b":1}')))::jsonb -> 'private.settings') x where x ->> 'key' = 'recorder_token_hash'), 0, 'a backup does not carry the recorder key');
-- a hand trophy belongs to the game's crew, whatever a body says
select testing.one(:OWNER, $$select (public.create_crew('Other')).id$$) as other \gset
select pg_temp.rec('record_hand', format('{"game":%s,"hand":{"no":2,"playedAt":"2026-09-20T15:01:00Z","deckCommit":"x","pot":20,"replay":{},"players":[{"key":"%s","account":"%s","name":"Owner","net":10,"won":true,"showdown":true,"bestHand":8},{"key":"%s","account":"%s","name":"Victim","net":-10}]}}', replace(:'game1', :'crew', :'other'), :'owner', :'owner', :'victim', :'victim'));
select is((select crew_id::text from trophies where kind = 'straight_flush'), :'crew', 'hand trophies go to the game''s own crew');

-- ---------------------------------------------------------------- fairness proof on request
insert into private.hand_records (game_id, hand_no, record) values (:'G1', 2, '{"proof":{"dealerSeed":"ab","contributions":[]}}');
select is(testing.one(:VICTIM, $$select public.hand_proof('$$ || :'G1' || $$', 2) ->> 'dealerSeed'$$), 'ab', 'a player dealt into the hand gets the proof after the game');
select is(testing.one(:M1, $$select public.hand_proof('$$ || :'G1' || $$', 2)$$), 'Only players dealt into that hand can check it', 'others do not');

-- ---------------------------------------------------------------- rights
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'S' and n.nspname = 'public'
  and (has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE') or has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE'))), 0, 'phones have no rights on counters');
select is(has_function_privilege('anon', 'public.hand_proof(uuid, int)', 'execute'), false, 'functions for phones are not open to anonymous callers');

select * from finish();
rollback;
