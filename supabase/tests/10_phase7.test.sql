-- Phase 7: push subscriptions and who gets pushed, the queued pushes, Report a problem, the daily upkeep.
begin;
set search_path = public, extensions;
select plan(32);
insert into private.settings values ('recorder_token_hash', encode(extensions.digest('t', 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value;
create function pg_temp.rec(fn text, body text) returns text language sql as $$ select testing.one(null, format('select public.%s(%L, %L)', fn, body, testing.sign('t', body))) $$;

\set A '''00000000-0000-0000-0000-00000000f101'''
\set B '''00000000-0000-0000-0000-00000000f102'''
\set C '''00000000-0000-0000-0000-00000000f103'''
select testing.one(:A, $$select (public.ensure_account('Anu')).id$$) as a \gset
select testing.one(:B, $$select (public.ensure_account('Babu')).id$$) as b \gset
select testing.one(:C, $$select (public.ensure_account('Chitra')).id$$) as c \gset
select testing.one(:A, $$select (public.create_crew('Push crew')).id$$) as crew \gset
select testing.one(:A, $$select public.create_invite('$$ || :'crew' || $$')$$) as inv \gset
select testing.one(:B, $$select public.join_crew('$$ || :'inv' || $$')$$);

\set KEY '''BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'''
\set AUTH '''tBHItJI5svbpez7KI4CCXg'''
-- subscriptions
select is(testing.one(:A, $$select public.save_push('https://evil.example.com/x', $$ || quote_literal(:KEY) || $$, $$ || quote_literal(:AUTH) || $$, '{}')$$), 'That is not a push subscription', 'only real push services');
select is(testing.one(:A, $$select public.save_push('https://fcm.googleapis.com/fcm/send/a1', $$ || quote_literal(:KEY) || $$, 'short', '{}')$$), 'That is not a push subscription', 'keys are checked');
select testing.one(:A, $$select public.save_push('https://fcm.googleapis.com/fcm/send/a1', $$ || quote_literal(:KEY) || $$, $$ || quote_literal(:AUTH) || $$, '{"turn":true,"crewTable":false,"junk":1}')$$);
select is((select prefs::text from push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/a1'), '{"turn": true, "crewTable": false}', 'only known choices are kept');
select is(testing.one(:A, $$select public.my_push('https://fcm.googleapis.com/fcm/send/a1')::text$$), '{"turn": true, "crewTable": false}', 'the phone reads its own choices');
select is(testing.one(:B, $$select public.my_push('https://fcm.googleapis.com/fcm/send/a1')::text$$), null, 'nobody else''s');
select testing.one(:B, $$select public.save_push('https://fcm.googleapis.com/fcm/send/b1', $$ || quote_literal(:KEY) || $$, $$ || quote_literal(:AUTH) || $$, '{}')$$);
select testing.one(:C, $$select public.save_push('https://updates.push.services.mozilla.com/wpush/v2/c1', $$ || quote_literal(:KEY) || $$, $$ || quote_literal(:AUTH) || $$, '{}')$$);
select is((select count(*)::int from push_subscriptions), 3, 'three phones');
select is(testing.one(:A, $$select count(*) from public.push_subscriptions$$), 'permission denied for table push_subscriptions', 'phones cannot read the subscriptions');
-- at most 5 an account
select testing.one(:C, format($$select public.save_push('https://fcm.googleapis.com/fcm/send/c%s', %L, %L, '{}')$$, g, :KEY, :AUTH)) from generate_series(2, 7) g;
select is((select count(*)::int from push_subscriptions where account_id = :'c'), 5, 'an account keeps its 5 newest phones');
-- a phone that switched accounts takes its subscription along
select testing.one(:B, $$select public.save_push('https://fcm.googleapis.com/fcm/send/c7', $$ || quote_literal(:KEY) || $$, $$ || quote_literal(:AUTH) || $$, '{}')$$);
select is((select account_id::text from push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/c7'), :'b', 'the subscription moved to the new account');

-- who the table servers push
select is(testing.one(null, $$select public.push_targets('{"kind":"turn","accounts":[]}', 'nope')$$), 'Not a table server', 'only table servers ask');
select is(pg_temp.rec('push_targets', format('{"kind":"turn","accounts":["%s"]}', :'a')), '[{"auth": "tBHItJI5svbpez7KI4CCXg", "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", "endpoint": "https://fcm.googleapis.com/fcm/send/a1"}]', 'a turn goes to the player''s phone');
select is(pg_temp.rec('push_targets', format('{"kind":"crewTable","crew":"%s","except":[]}', :'crew')), (select jsonb_agg(x)::text from (select jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth) x from push_subscriptions where account_id = :'b' order by endpoint) s), 'a crew table goes to members who allow it (Anu turned it off; Chitra is not a member)');
select is(jsonb_array_length(pg_temp.rec('push_targets', format('{"kind":"crewTable","crew":"%s","except":["%s"]}', :'crew', :'b'))::jsonb), 0, 'players already at the table are not told');
select is(pg_temp.rec('push_targets', '{"kind":"other"}'), 'Unknown push', 'only known kinds');
select pg_temp.rec('drop_push', '{"endpoints":["https://fcm.googleapis.com/fcm/send/b1"]}');
select is((select count(*)::int from push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/b1'), 0, 'a push service''s "gone" removes the subscription');

-- pushes the database queues
\set D '''00000000-0000-0000-0000-00000000f104'''
select testing.one(:D, $$select (public.ensure_account('Deepa')).id$$) as d \gset
select testing.one(:D, $$select public.save_push('https://fcm.googleapis.com/fcm/send/d1', $$ || quote_literal(:KEY) || $$, $$ || quote_literal(:AUTH) || $$, '{}')$$);
select testing.one(:A, $$select (public.update_crew('$$ || :'crew' || $$', p_require_approval => true)).id$$);
select testing.one(:D, $$select public.join_crew('$$ || :'inv' || $$')$$);
select is((select count(*)::int from private.push_outbox where account_id = :'d'), 0, 'nothing while waiting for approval');
select testing.one(:A, $$select public.approve_member('$$ || :'crew' || $$', '$$ || :'d' || $$')$$);
select is((select title from private.push_outbox where account_id = :'d'), 'You’re in', 'approval queues a push');
insert into trophies (account_id, crew_id, kind) values (:'d', :'crew', 'royal_flush');
insert into trophies (account_id, crew_id, kind, at) values (:'d', :'crew', 'four_of_a_kind', now() - interval '1 day');
select is((select count(*)::int from private.push_outbox where account_id = :'d' and kind = 'trophies'), 1, 'a new trophy queues a push (not one a restore puts back)');
select is(jsonb_array_length(pg_temp.rec('take_push_outbox', '{}')::jsonb), 2, 'the job takes what is waiting, with the phone to send it to');
select is(jsonb_array_length(pg_temp.rec('take_push_outbox', '{"n":1}')::jsonb), 0, 'and sends it once');
select testing.one(:D, $$select public.save_push('https://fcm.googleapis.com/fcm/send/d1', $$ || quote_literal(:KEY) || $$, $$ || quote_literal(:AUTH) || $$, '{"trophies":false}')$$);
insert into trophies (account_id, crew_id, kind) values (:'d', :'crew', 'straight_flush');
select is(jsonb_array_length(pg_temp.rec('take_push_outbox', '{"n":2}')::jsonb), 0, 'a phone that turned trophies off is not pushed');

-- Report a problem and errors
select testing.one(:A, $$select public.report_problem('report', 'The raise slider jumps', '{"screen":"table"}', '0.5.0')$$);
select is((select message from private.problem_reports where kind = 'report'), 'The raise slider jumps', 'a report is kept');
select is((select account_id::text from private.problem_reports where kind = 'report'), :'a', 'with who sent it');
select is(testing.one(null, $$select public.report_problem('error', 'TypeError: x is undefined', '{}', '0.5.0')$$), '', 'an error from a phone with no account is taken');
select testing.one(:B, $$select public.report_problem('error', 'TypeError: x is undefined', '{}', '0.5.0')$$);
select is((select count::text || ' ' || count(*) over () from private.problem_reports where kind = 'error'), '2 1', 'the same error twice is counted, not stored twice');
select is(testing.one(:A, $$select public.report_problem('report', '   ', '{}', null)$$), 'Say what happened', 'an empty report is refused');
select testing.one(:C, format($$select public.report_problem('report', 'r%s', '{}', null)$$, g)) from generate_series(1, 10) g;
select is(testing.one(:C, $$select public.report_problem('report', 'one more', '{}', null)$$), 'Thanks, that is plenty for today', 'a phone sends at most 10 a day');
select is(testing.one(:A, $$select count(*) from private.problem_reports$$), 'permission denied for table problem_reports', 'phones cannot read reports');

-- daily upkeep: empty old accounts go, and the database size is kept for the warning
\set E '''00000000-0000-0000-0000-00000000f105'''
select testing.one(:E, $$select (public.ensure_account('Empty')).id$$) as e \gset
update accounts set created_at = now() - interval '100 days' where id in (:'e', :'c');
update account_logins set last_seen = now() - interval '100 days' where account_id in (:'e', :'c');
update accounts set created_at = now() - interval '100 days' where id = :'b';
update account_logins set last_seen = now() - interval '100 days' where account_id = :'b';
select is((pg_temp.rec('daily_upkeep', '{"n":"u"}')::jsonb ->> 'accounts_removed'), '2', 'accounts never used (no games, crews or trophies) and not opened for 90 days are removed');
select is((select count(*)::int from push_subscriptions where account_id = :'c'), 0, 'with their push subscriptions');
select is((select count(*)::int from accounts where id = :'b'), 1, 'an old account in a crew is kept');
select ok((select value::bigint from private.settings where key = 'db_bytes') > 0, 'the database size is kept');
select * from finish();
rollback;
