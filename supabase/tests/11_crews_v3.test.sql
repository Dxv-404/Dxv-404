-- v3 crews: codes (and resting after wrong ones), asking to join, approving and declining, auto-admit, the
-- crew's settings, roles exactly as the roles table (member / admin / leader / outsider), hosting a crew table
-- (LIVE and the crew told), seasons of each length, the league, games, members and player card, invitations,
-- leaving and deleting.
begin;
set search_path = public, extensions;
select plan(151);

insert into private.settings values ('recorder_token_hash', encode(extensions.digest('test-recorder-token', 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value;
create function pg_temp.rec(fn text, body text) returns text language sql as $$
  select testing.one(null, format('select public.%s(%L, %L)', fn, body, testing.sign('test-recorder-token', body))) $$;

\set LEAD '''00000000-0000-0000-0000-0000000e0001'''
\set ADM '''00000000-0000-0000-0000-0000000e0002'''
\set MEM '''00000000-0000-0000-0000-0000000e0003'''
\set OUT '''00000000-0000-0000-0000-0000000e0004'''
\set NEW1 '''00000000-0000-0000-0000-0000000e0005'''
\set NEW2 '''00000000-0000-0000-0000-0000000e0006'''
\set NEW3 '''00000000-0000-0000-0000-0000000e0007'''
select testing.one(:LEAD, $$select (public.ensure_account('Meera')).id$$) as lead \gset
select testing.one(:ADM, $$select (public.ensure_account('Aditya')).id$$) as adm \gset
select testing.one(:MEM, $$select (public.ensure_account('Dev')).id$$) as mem \gset
select testing.one(:OUT, $$select (public.ensure_account('Outsider')).id$$) as outsider \gset
select testing.one(:NEW1, $$select (public.ensure_account('Rohan')).id$$) as new1 \gset
select testing.one(:NEW2, $$select (public.ensure_account('Nisha')).id$$) as new2 \gset
select testing.one(:NEW3, $$select (public.ensure_account('Kabir')).id$$) as new3 \gset

-- ---------------------------------------------------------------- create
select is(testing.one(:LEAD, $$select public.create_crew_v3('Friday Night Table plus more', 'shield', '#c0392b', true)$$), 'A crew name is 1 to 24 characters', 'names are at most 24 characters');
select is(testing.one(:LEAD, $$select public.create_crew_v3('  ', 'shield', '#c0392b', true)$$), 'A crew name is 1 to 24 characters', 'and not empty');
select is(testing.one(:LEAD, $$select public.create_crew_v3('Bad badge', 'star', '#c0392b', true)$$), 'new row for relation "crews" violates check constraint "crews_badge_check"', 'badges are shield, hex, round or diamond');
select testing.as_phone(:LEAD, $$select public.create_crew_v3('Friday Night Table', 'hex', '#2f6fd6', true) as c$$) -> 0 -> 'c' as made \gset
select :'made'::jsonb ->> 'id' as crew, :'made'::jsonb ->> 'code' as code \gset
select ok(:'code' ~ '^[A-HJ-NP-Z2-9]{6}$', 'a crew code is 6 characters with no 0/O or 1/I');
select is(:'made'::jsonb ->> 'badge', 'hex', 'the badge is kept');
select is(:'made'::jsonb ->> 'auto_admit', 'false', 'a new crew approves each request');
select is((select season_months from crews where id = :'crew'), 3, 'seasons on: 3 months');
select is(testing.one(:LEAD, $$select role from crew_members$$), 'owner', 'the maker leads the crew');
select is(testing.as_phone(:LEAD, $$select public.create_crew_v3('No seasons', 'round', '#1f8a5b', false) ->> 'season_months' as m$$) -> 0 ->> 'm', '0', 'seasons can be switched off');

-- ---------------------------------------------------------------- the code: preview, wrong codes, resting
select is(testing.one(:OUT, $$select public.crew_preview('ZZZ-ZZZ') ->> 'found'$$), 'false', 'a wrong code finds nothing');
select is(testing.one(:OUT, $$select public.crew_preview('ZZZ-ZZZ') ->> 'tries_left'$$), '3', 'and says how many tries are left in this minute');
select is(testing.one(:OUT, $$select public.crew_preview('ZZZ-ZZZ') ->> 'code'$$), 'ZZZ-ZZZ', 'the code is shown back with its dash');
select is(testing.one(:OUT, $$select public.ask_to_join('ZZZZZZ')$$), 'wrong', 'asking with a wrong code counts as a wrong try too');
select is(testing.one(:OUT, $$select public.crew_preview('ZZZZZY') ->> 'rest'$$), '30', 'the fifth wrong code in a minute rests the boxes for 30 seconds');
select is(testing.one(:OUT, format('select public.crew_preview(%L) ->> %L', :'code', 'found')), 'Too many wrong codes. Try again in 30 seconds.', 'while resting, even the right code waits');
delete from private.crew_code_tries where auth_user = :OUT;
select is(testing.one(:OUT, format('select public.crew_preview(%L) ->> %L', lower(substr(:'code', 1, 3)) || '-' || substr(:'code', 4), 'name')), 'Friday Night Table', 'the right code (any case, with a dash) shows the crew');
select testing.as_phone(:OUT, format('select public.crew_preview(%L) as p', :'code')) -> 0 -> 'p' as prev \gset
select is(:'prev'::jsonb -> 'leader' ->> 'name', 'Meera', 'the preview says who leads it');
select is(:'prev'::jsonb ->> 'members', '1', 'how many members');
select is(:'prev'::jsonb ->> 'season', '1', 'and the season it is on');
select is(:'prev'::jsonb ->> 'status', null, 'an outsider is neither in nor waiting');
select is(testing.one(null, format('select public.crew_preview(%L)', :'code')), 'permission denied for function crew_preview', 'a phone that is not signed in cannot look up codes');
select is(testing.one(:OUT, $$select count(*) from crew_codes$$), '0', 'outsiders never read crew codes');

-- ---------------------------------------------------------------- asking to join, approving, declining
select is(testing.one(:ADM, format('select public.ask_to_join(%L)', :'code')), 'pending', 'asking to join waits for the leader');
select is(testing.one(:ADM, format('select public.ask_to_join(%L)', :'code')), 'pending', 'asking twice changes nothing');
select is((select count(*)::int from crew_requests where crew_id = :'crew' and status = 'pending'), 1, 'one request');
select is(testing.one(:MEM, format('select public.ask_to_join(%L, true, %L)', :'code', :'lead')), 'pending', 'a second person asks');
select is(testing.one(:ADM, format('select public.crew_preview(%L) ->> %L', :'code', 'status')), 'pending', 'the preview knows the request is waiting');
select is(testing.one(:ADM, $$select r ->> 'leader' from jsonb_array_elements(public.my_join_requests()) r$$), 'Meera', 'the waiting screen says who decides');
select is(testing.one(:ADM, $$select count(*) from crews$$), '0', 'someone waiting sees nothing of the crew');
select is(testing.one(:MEM, format('select public.crew_join_requests(%L)', :'crew')), 'Only a crew admin can do that', 'someone waiting cannot see the requests');
select is(testing.one(:OUT, format('select public.crew_join_requests(%L)', :'crew')), 'Only a crew admin can do that', 'nor can an outsider');
select is(testing.one(:LEAD, format('select jsonb_array_length(public.crew_join_requests(%L))', :'crew')), '2', 'the leader sees both');
select is(testing.one(:LEAD, format($$select r ->> 'invited_by' from jsonb_array_elements(public.crew_join_requests(%L)) r where r ->> 'name' = 'Dev'$$, :'crew')), 'Meera', 'and who invited them');
select is(testing.one(:LEAD, $$select count(*) from crew_requests$$), '2', 'the leader reads the requests');
select is(testing.one(:ADM, $$select count(*) from crew_requests$$), '1', 'the asker reads only their own');
select is(testing.one(:OUT, $$select count(*) from crew_requests$$), '0', 'outsiders read none');

select (select id from crew_requests where account_id = :'adm') as req_adm, (select id from crew_requests where account_id = :'mem') as req_mem \gset
select testing.one(:MEM, format('select public.set_request_notify(%L, false)', :'crew'));
select is((select notify from crew_requests where id = :'req_mem'), false, '"tell me when I''m in" can be switched off');
select testing.one(:LEAD, format('select public.decide_join_request(%L, true)', :'req_adm'));
select is(testing.one(:ADM, format('select role from crew_members where account_id = %L', :'adm')), 'member', 'approved: in the crew as a member');
select is((select count(*)::int from private.push_outbox where account_id = :'adm' and kind = 'crew' and title = 'You’re in'), 1, 'and told by notification');
select is(testing.one(:ADM, $$select r ->> 'status' from jsonb_array_elements(public.my_join_requests()) r$$), 'approved', 'the waiting screen sees the answer');
select is(testing.one(:LEAD, format('select public.decide_join_request(%L, false)', :'req_adm')), 'That request was already answered', 'a request is answered once');
select testing.one(:LEAD, format('select public.decide_join_request(%L, true)', :'req_mem'));
select is((select count(*)::int from private.push_outbox where account_id = :'mem'), 0, 'no notification when they did not want one');
select is(testing.one(:NEW1, format('select public.ask_to_join(%L)', :'code')), 'pending', 'Rohan asks');
select testing.one(:LEAD, format($$select public.decide_join_request((select id from crew_requests where account_id = '%s'), false)$$, :'new1'));
select is(testing.one(:NEW1, $$select r ->> 'status' from jsonb_array_elements(public.my_join_requests()) r$$), 'declined', 'declined: Rohan is told');
select is((select count(*)::int from crew_members where crew_id = :'crew' and account_id = :'new1'), 0, 'and is not in the crew');
select is(testing.one(:NEW2, format('select public.ask_to_join(%L)', :'code')), 'pending', 'Nisha asks');
select testing.one(:NEW2, format('select public.cancel_join_request(%L)', :'crew'));
select is((select status from crew_requests where account_id = :'new2'), 'cancelled', 'and cancels');
select is(testing.one(:NEW2, format('select public.cancel_join_request(%L)', :'crew')), 'There is no request to cancel', 'once');

-- ---------------------------------------------------------------- roles: admins approve, members do not
select testing.one(:LEAD, format('select public.set_role(%L, %L, %L)', :'crew', :'adm', 'admin'));
select is(testing.one(:ADM, format('select public.set_role(%L, %L, %L)', :'crew', :'mem', 'admin')), 'Only the owner can change roles', 'an admin cannot make admins');
select testing.one(:NEW1, format('select public.ask_to_join(%L)', :'code'));
select id as req_new1 from crew_requests where account_id = :'new1' and status = 'pending' \gset
select is(testing.one(:MEM, format('select public.decide_join_request(%L, true)', :'req_new1')), 'Only a crew admin can do that', 'a member cannot approve');
select testing.one(:ADM, format('select public.decide_join_request(%L, true)', :'req_new1'));
select is((select status from crew_members where crew_id = :'crew' and account_id = :'new1'), 'active', 'an admin approves');
select is(testing.one(:MEM, format('select public.remove_member(%L, %L)', :'crew', :'new1')), 'Only the crew leader can remove members', 'a member cannot remove anyone');
select is(testing.one(:ADM, format('select public.remove_member(%L, %L)', :'crew', :'new1')), 'Only the crew leader can remove members', 'nor can an admin');
select is(testing.one(:OUT, format('select public.remove_member(%L, %L)', :'crew', :'new1')), 'Only the crew leader can do that', 'nor an outsider');

-- ---------------------------------------------------------------- settings (leader only)
select is(testing.one(:ADM, format('select public.crew_settings_v2(%L, p_name => %L)', :'crew', 'Renamed')), 'Only the crew leader can do that', 'an admin cannot rename');
select is(testing.one(:MEM, format('select public.crew_settings_v2(%L, p_auto_admit => true)', :'crew')), 'Only the crew leader can do that', 'a member cannot let people in by themselves');
select is(testing.one(:ADM, format('select public.update_crew(%L, p_require_approval => false)', :'crew')), 'Only the crew leader can do that', 'nor through the old way');
select is(testing.one(:LEAD, format('select public.crew_settings_v2(%L, p_name => %L)', :'crew', repeat('x', 25))), 'A crew name is 1 to 24 characters', 'a rename keeps to 24 characters');
select is(testing.one(:LEAD, format('select public.crew_settings_v2(%L, p_who_hosts => %L)', :'crew', 'nobody')), 'new row for relation "crews" violates check constraint "crews_who_hosts_check"', 'who hosts is everyone, admins or the leader');
select is(testing.one(:LEAD, format('select public.crew_settings_v2(%L, p_season_months => 4)', :'crew')), 'new row for relation "crews" violates check constraint "crews_season_months_check"', 'seasons are 1, 2, 3 or 6 months, or off (2 months since 0017)');
select testing.as_phone(:LEAD, format('select public.crew_settings_v2(%L, %L, %L, %L, 1, %L, false, true, %L) as s', :'crew', 'Friday Night', 'diamond', '#7d3cc8', 'admins', '{"startStack":1000,"sb":10,"bb":20,"rebuys":2}')) -> 0 -> 's' as st \gset
select is(:'st'::jsonb ->> 'name', 'Friday Night', 'the leader renames');
select is(:'st'::jsonb ->> 'badge', 'diamond', 'changes the badge');
select is(:'st'::jsonb ->> 'season_months', '1', 'the season length');
select is(:'st'::jsonb ->> 'who_hosts', 'admins', 'who can host');
select is(:'st'::jsonb ->> 'auto_admit', 'true', 'lets people in by themselves');
select is(:'st'::jsonb -> 'house_rules' ->> 'bb', '20', 'and keeps the table rules');
select is(testing.one(:NEW3, format('select public.ask_to_join(%L)', :'code')), 'active', 'with auto-admit, a code lets you straight in');
select is((select uses from crew_codes where crew_id = :'crew'), 6, 'the code counts its uses (each time someone asks with it)');
select is((select count(*)::int from crew_audit where crew_id = :'crew' and what = 'settings_changed'), 1, 'settings changes go in the crew log');

-- ---------------------------------------------------------------- who may invite and see the code
select is(testing.one(:MEM, format('select public.crew_page(%L) -> %L', :'crew', 'code')), null::text, 'members do not get the code when the crew does not let them invite');
select is(testing.one(:MEM, $$select count(*) from crew_codes$$), '0', 'and cannot read it');
select is(testing.one(:ADM, format('select public.crew_page(%L) -> %L ->> %L', :'crew', 'code', 'code')), :'code', 'admins always can');
select is(testing.one(:ADM, format('select public.new_crew_code(%L)', :'crew')), 'Only the crew leader can do that', 'only the leader makes a new code');
select testing.one(:LEAD, format('select public.new_crew_code(%L)', :'crew')) as code2 \gset
select isnt(:'code2'::text, :'code'::text, 'a new code');
select is(testing.one(:OUT, format('select public.crew_preview(%L) ->> %L', :'code', 'found')), 'false', 'the old code stops working');
select is((select uses from crew_codes where crew_id = :'crew'), 0, 'the new code has no uses yet');

-- invitations from a link: only when the sender may invite
select testing.one(:OUT, format('select public.note_invitation(%L, %L)', :'code2', :'mem'));
select is(testing.one(:OUT, $$select jsonb_array_length(public.my_invitations())$$), '0', 'a member who may not invite sends no invitation');
select testing.one(:LEAD, format('select public.crew_settings_v2(%L, p_members_invite => true)', :'crew'));
select testing.one(:OUT, format('select public.note_invitation(%L, %L)', :'code2', :'mem'));
select is(testing.one(:OUT, $$select r ->> 'invited_by' from jsonb_array_elements(public.my_invitations()) r$$), 'Dev', '"Dev invited you"');
select is(testing.one(:NEW2, $$select count(*) from crew_invitations$$), '0', 'nobody else sees that invitation');
select testing.one(:OUT, format('select public.dismiss_invitation(%L)', :'crew'));
select is(testing.one(:OUT, $$select jsonb_array_length(public.my_invitations())$$), '0', 'an invitation can be dismissed');

-- ---------------------------------------------------------------- hosting a crew table
select is(testing.one(:MEM, format('select public.host_crew_table(%L, %L)', :'crew', 'QK7P')), 'Only the leader and admins can host this crew''s tables', 'with "admins", members cannot host');
select is(testing.one(:OUT, format('select public.host_crew_table(%L, %L)', :'crew', 'QK7P')), 'Only crew members can host crew tables', 'nor can outsiders');
select testing.as_phone(:ADM, format('select public.host_crew_table(%L, %L, %L, null) as h', :'crew', 'qk7p', 'online')) -> 0 -> 'h' as hosted \gset
select is(:'hosted'::jsonb ->> 'notified', '4', 'an admin hosts; the other four members are told');
select is((select count(*)::int from private.push_outbox where kind = 'crewTable' and body like 'Aditya opened table QK7P%' and url = '/#/t/QK7P'), 4, 'by notification, with a link to the table');
select is(testing.one(:MEM, $$select r -> 'live' ->> 'table' from jsonb_array_elements(public.my_crews()) r$$), 'QK7P', 'the crew''s card shows the table LIVE');
select is(testing.one(:MEM, $$select r -> 'live' -> 'rules' ->> 'bb' from jsonb_array_elements(public.my_crews()) r$$), '20', 'with the crew''s saved rules');
select is(testing.one(:OUT, $$select count(*) from crew_tables$$), '0', 'outsiders see no crew tables');
select is(testing.one(:MEM, format('select public.close_crew_table(%L, %s)', :'crew', :'hosted'::jsonb ->> 'id')), 'That table is not open', 'a member cannot close someone else''s table');
select testing.one(:ADM, format('select public.close_crew_table(%L, %s)', :'crew', :'hosted'::jsonb ->> 'id'));
select is(testing.one(:MEM, $$select r -> 'live' from jsonb_array_elements(public.my_crews()) r$$), null, 'closed: no longer LIVE');
select testing.one(:LEAD, format('select public.crew_settings_v2(%L, p_who_hosts => %L)', :'crew', 'leader'));
select is(testing.one(:ADM, format('select public.host_crew_table(%L, %L)', :'crew', 'AB12')), 'Only the leader can host this crew''s tables', 'with "only me", admins cannot host either');
select is(testing.one(:MEM, format('select public.crew_page(%L) ->> %L', :'crew', 'can_host')), 'false', 'and the crew page says so');
select is(testing.one(:LEAD, format('select public.host_crew_table(%L, null, %L) ->> %L', :'crew', 'qr', 'notified')), '4', 'the leader hosts a QR table (no code)');
select testing.one(:LEAD, format('select public.crew_settings_v2(%L, p_who_hosts => %L)', :'crew', 'everyone'));

-- ---------------------------------------------------------------- the crew list and the crew page
select is(testing.one(:LEAD, $$select r ->> 'requests' from jsonb_array_elements(public.my_crews()) r where r ->> 'name' = 'Friday Night'$$), '0', 'the leader''s card counts requests');
select testing.one(:NEW2, format('select public.ask_to_join(%L)', :'code2'));
select testing.one(:LEAD, format('select public.crew_settings_v2(%L, p_auto_admit => false)', :'crew'));
select is(testing.one(:LEAD, $$select count(*) from jsonb_array_elements(public.my_crews())$$), '2', 'the leader is in two crews');
select is(testing.one(:MEM, $$select r ->> 'requests' from jsonb_array_elements(public.my_crews()) r$$), '0', 'a member''s card never shows requests');
select is(testing.one(:OUT, format('select public.crew_page(%L)', :'crew')), 'Only crew members can open the crew', 'outsiders cannot open the crew page');
select is(testing.one(:MEM, format('select public.crew_page(%L) ->> %L', :'crew', 'role')), 'member', 'the page knows my role');
select is(testing.one(:MEM, format('select public.crew_page(%L) -> %L', :'crew', 'season')), null::text, 'no season before the first game');
select is(testing.one(:MEM, format('select public.crew_page(%L) ->> %L', :'crew', 'next_season')), '1', '"Season 1 starts with your first game"');
select is(testing.one(:MEM, format('select jsonb_array_length(public.crew_page(%L) -> %L)', :'crew', 'requests')), '0', 'members do not get the requests');

-- ---------------------------------------------------------------- games, league, members, player card
-- two games at crew tables: Meera wins the first, Dev the second (1-month seasons now)
select format('{"id":"%s","crew":"%s","table":"QK7P","server":"test","startStack":1000,"bigBlind":20,"startedAt":"%s"}', '33333333-3333-4333-8333-000000000001', :'crew', to_char(now() - interval '3 hours', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) as g1,
       format('{"id":"%s","crew":"%s","table":"J2RM","server":"test","startStack":1000,"bigBlind":10,"startedAt":"%s"}', '33333333-3333-4333-8333-000000000002', :'crew', to_char(now() - interval '2 hours', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) as g2 \gset
select format('{"game":%s,"hand":{"no":1,"playedAt":"%s","deckCommit":"c","pot":200,"replay":{"v":1,"keys":["%s","%s","%s"],"frames":[{"board":["Kd","7c","2s"]},{"board":["Kd","7c","2s","Ks","7d"],"cards":[["Kh","9c"],null,null]}]},"full":{"inputs":[]},"players":[{"key":"%s","account":"%s","name":"Meera","net":100,"showdown":true,"won":true,"bestHand":6},{"key":"%s","account":"%s","name":"Dev","net":-60,"showdown":true},{"key":"%s","account":"%s","name":"Aditya","net":-40}]}}',
  :'g1', to_char(now() - interval '170 minutes', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), :'lead', :'mem', :'adm', :'lead', :'lead', :'mem', :'mem', :'adm', :'adm') as h1 \gset
-- these league checks are of the 'bb' scoring (total big blinds won); 'points', the default since 0017, is in 14_league_scoring
update crews set scoring = 'bb' where id = :'crew';
select is(pg_temp.rec('record_hand', :'h1'), 'ok', 'a hand at the crew table');
select is(pg_temp.rec('record_game_end', format('{"game":%s,"endedAt":"%s","players":[{"key":"%s","account":"%s","name":"Meera","buyins":1000,"final":1400},{"key":"%s","account":"%s","name":"Dev","buyins":1000,"final":800},{"key":"%s","account":"%s","name":"Aditya","buyins":1000,"final":800}]}',
  :'g1', to_char(now() - interval '150 minutes', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), :'lead', :'lead', :'mem', :'mem', :'adm', :'adm')), 'ok', 'the first game ends');
select is(pg_temp.rec('record_game_end', format('{"game":%s,"endedAt":"%s","players":[{"key":"%s","account":"%s","name":"Meera","buyins":1000,"final":900},{"key":"%s","account":"%s","name":"Dev","buyins":1000,"final":1300},{"key":"%s","account":"%s","name":"Aditya","buyins":1000,"final":800}]}',
  :'g2', to_char(now() - interval '60 minutes', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), :'lead', :'lead', :'mem', :'mem', :'adm', :'adm')), 'ok', 'the second game ends');
select is((select name || ' #' || number from seasons where id = (select season_id from games where id = '33333333-3333-4333-8333-000000000001')), to_char(now() at time zone 'Asia/Kolkata', 'Mon YYYY') || ' #1', 'a 1-month season, numbered 1');
select is(testing.one(:MEM, format('select public.crew_page(%L) -> %L ->> %L', :'crew', 'season', 'number')), '1', 'the page shows Season 1');

select testing.as_phone(:MEM, format('select public.crew_league(%L) as l', :'crew')) -> 0 -> 'l' as lg \gset
select is((select string_agg((r ->> 'rank') || ':' || (r ->> 'name') || ':' || (r ->> 'bb'), ' ' order by (r ->> 'rank')::int) from jsonb_array_elements(:'lg'::jsonb -> 'rows') r),
  '1:Dev:20.00 2:Meera:10.00 3:Aditya:-30.00', 'ranked by big blinds won (a 5/10 night and a 10/20 night count fairly)');
select is((select r ->> 'me' from jsonb_array_elements(:'lg'::jsonb -> 'rows') r where r ->> 'name' = 'Dev'), 'true', 'my row is marked');
select is((select r ->> 'trend' from jsonb_array_elements(:'lg'::jsonb -> 'rows') r where r ->> 'name' = 'Meera'), 'down', 'with which way they went last game');
select is(testing.one(:MEM, format('select jsonb_array_length(public.crew_league(%L, %L) -> %L)', :'crew', 'alltime', 'rows')), '3', 'all-time');
select is(testing.one(:MEM, format('select public.crew_league(%L, %L) -> %L', :'crew', 'previous', 'season')), null::text, 'no previous season yet');
select is(testing.one(:OUT, format('select public.crew_league(%L)', :'crew')), 'Only crew members can see the league', 'outsiders cannot see the league');
select is(testing.one(:MEM, format('select public.crew_league(%L, %L)', :'crew', 'forever')), 'Unknown league view', 'only the three views');

select is(testing.one(:MEM, format('select jsonb_array_length(public.crew_games(%L))', :'crew')), '2', 'the games tab lists both games');
select is(testing.one(:MEM, format($$select public.crew_games(%L) -> 0 -> 'winner' ->> 'name'$$, :'crew')), 'Dev', 'newest first, with who won');
select is(testing.one(:MEM, format($$select public.crew_games(%L) -> 1 ->> 'mine'$$, :'crew')), '-10.00', 'and what I made');
select is(testing.one(:NEW1, format($$select jsonb_array_length(public.crew_games(%L, 'mine'))$$, :'crew')), '0', '"I played" shows only my games');
select is(testing.one(:OUT, format('select public.crew_games(%L)', :'crew')), 'Only crew members can see the crew''s games', 'outsiders cannot see the games');

select is(testing.one(:MEM, format($$select string_agg((r ->> 'name') || ':' || (r ->> 'role'), ' ' order by (r ->> 'ord')::int, r ->> 'name') from jsonb_array_elements(public.crew_members_v3(%L)) r$$, :'crew')),
  'Meera:owner Aditya:admin Dev:member Kabir:member Nisha:member Rohan:member', 'members: leader, admins, then everyone else');
select is(testing.one(:MEM, format($$select r ->> 'games' from jsonb_array_elements(public.crew_members_v3(%L)) r where r ->> 'name' = 'Dev'$$, :'crew')), '2', 'with their games this season');
select is(testing.one(:OUT, format('select public.crew_members_v3(%L)', :'crew')), 'Only crew members can see the members', 'outsiders cannot list members');

select testing.as_phone(:MEM, format('select public.crew_player(%L, %L) as p', :'crew', :'lead')) -> 0 -> 'p' as card \gset
select is(:'card'::jsonb ->> 'rank', '2', 'a player''s card: their rank');
select is(:'card'::jsonb -> 'best' ->> 'rank', '6', 'their best hand this season');
select is(:'card'::jsonb -> 'best' ->> 'cards', '["Kh", "9c"]', 'with the cards they showed');
select is(:'card'::jsonb -> 'best' ->> 'board', '["Kd", "7c", "2s", "Ks", "7d"]', 'and the board');
select is(:'card'::jsonb ->> 'form', '[20.00, 10.00]', 'their form, game by game');
select is(:'card'::jsonb ->> 'won', '1', 'and hands won');
select is(testing.one(:MEM, format('select public.crew_player(%L, %L)', :'crew', :'outsider')), 'Not a player in this crew', 'only players of the crew have a card');

-- ---------------------------------------------------------------- seasons: end now, lengths, off
select is(testing.one(:ADM, format('select public.end_season_now(%L)', :'crew')), 'Only the crew leader can do that', 'only the leader ends a season early');
select testing.one(:LEAD, format('select public.end_season_now(%L)', :'crew'));
select is((select closed_at is not null from seasons where crew_id = :'crew' and number = 1), true, '"End it now" closes the season');
select is((select a.name from trophies t join accounts a on a.id = t.account_id where t.crew_id = :'crew' and t.kind = 'season_winner'), 'Dev', 'and gives its trophy');
select is((select count(*)::int from private.push_outbox where kind = 'trophies' and title = 'Season over' and account_id = :'mem'), 1, 'everyone is told the season is over');
select is(testing.one(:LEAD, format('select public.end_season_now(%L)', :'crew')), 'No season is running', 'once');
select is(testing.one(:MEM, format('select public.crew_league(%L, %L) -> %L ->> %L', :'crew', 'previous', 'season', 'number')), '1', 'it is now the previous season');
select private.season_for(:'crew', now() + interval '1 minute') as s2 \gset
select is((select number from seasons where id = :'s2'), 2, 'the next game starts Season 2, right after');
select is((select starts_at = (select ends_at from seasons where crew_id = :'crew' and number = 1) from seasons where crew_id = :'crew' and number = 2), true, 'without overlapping');
select testing.one(:LEAD, $$select (public.create_crew_v3('Six months', 'hex', '#2f6fd6', true)) ->> 'id'$$) as crew6 \gset
update crews set season_months = 6 where id = :'crew6';
select private.season_for(:'crew6', '2026-08-10T12:00:00Z') as h1, private.season_for(:'crew6', '2027-02-10T12:00:00Z') as h2 \gset
select is((select name from seasons where id = :'h1'), 'Jul–Dec 2026', '6-month seasons are half years');
select is((select name from seasons where id = :'h2'), 'Jan–Jun 2027', 'the next half');
select is((select number from seasons where id = :'h2'), 2, 'numbered in order');
select testing.one(:LEAD, $$select (public.create_crew_v3('Off', 'round', '#1f8a5b', false)) ->> 'id'$$) as crew0 \gset
select private.season_for(:'crew0', now()) as s0 \gset
select is((select name || ':' || ends_at::text from seasons where id = :'s0'), 'All-time:infinity', 'seasons off: one league that never ends');
select testing.one(:LEAD, $$select (public.create_crew_v3('Quarter', 'round', '#1f8a5b', true)) ->> 'id'$$) as crew3 \gset
select private.season_for(:'crew3', '2026-11-20T12:00:00Z') as q3 \gset
select is((select name from seasons where id = :'q3'), 'Oct–Dec 2026', '3-month seasons are still the quarters');

-- ---------------------------------------------------------------- disputes
select is(testing.one(:MEM, format('select public.crew_disputes(%L)', :'crew')), 'Only a crew admin can do that', 'members do not handle seat disputes');
select is(testing.one(:ADM, format('select jsonb_array_length(public.crew_disputes(%L))', :'crew')), '0', 'admins see the open disputes');

-- ---------------------------------------------------------------- leaving, removing, handing over, deleting
select is(testing.one(:LEAD, format('select public.leave_crew(%L)', :'crew')), 'Hand over leadership before you leave', 'the leader hands over before leaving');
select is(testing.one(:LEAD, format('select public.delete_crew(%L)', :'crew')), 'A crew can be deleted only by its last member', 'and cannot delete a crew with members');
select is(testing.one(:ADM, format('select public.delete_crew(%L)', :'crew')), 'Only the crew leader can do that', 'admins cannot delete');
select testing.one(:LEAD, format('select public.remove_member(%L, %L)', :'crew', :'new3'));
select is((select count(*)::int from crew_members where crew_id = :'crew' and account_id = :'new3'), 0, 'the leader removes a member');
select is(testing.one(:MEM, format('select jsonb_array_length(public.crew_league(%L, %L) -> %L)', :'crew', 'alltime', 'rows')), '3', 'results stay');
select testing.one(:MEM, format('select public.leave_crew(%L)', :'crew'));
select is(testing.one(:LEAD, format($$select r ->> 'name' from jsonb_array_elements(public.crew_league(%L, 'alltime') -> 'rows') r where r ->> 'rank' = '1'$$, :'crew')), 'Former player', 'someone who left shows as "Former player"');
select testing.one(:LEAD, format('select public.transfer_ownership(%L, %L)', :'crew', :'adm'));
select is(testing.one(:ADM, format('select public.crew_page(%L) ->> %L', :'crew', 'role')), 'owner', 'handed over: Aditya leads');
select is(testing.one(:LEAD, format('select public.crew_page(%L) ->> %L', :'crew', 'role')), 'admin', 'Meera becomes an admin');
select testing.one(:LEAD, format('select public.leave_crew(%L)', :'crew'));
select testing.one(:NEW1, format('select public.leave_crew(%L)', :'crew'));
select testing.one(:NEW2, format('select public.leave_crew(%L)', :'crew'));
select testing.one(:ADM, format('select public.delete_crew(%L)', :'crew'));
select is((select count(*)::int from crews where id = :'crew'), 0, 'the last member deletes the crew');

select * from finish();
rollback;
