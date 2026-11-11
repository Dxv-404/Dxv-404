-- The notifications inbox (the bell): my own notifications of the last 30 days, the test notification, and
-- the outbox kept 30 days (20261111000021_game_score_inbox.sql).
begin;
set search_path = public, extensions;
select * from no_plan();

\set PA '''00000000-0000-0000-0000-000000180001'''
\set PB '''00000000-0000-0000-0000-000000180002'''
select testing.one(:PA, $$select (public.ensure_account('Asha')).id$$) as a \gset
select testing.one(:PB, $$select (public.ensure_account('Bala')).id$$) as b \gset

insert into private.push_outbox (account_id, kind, title, body, url, tag, dedupe, at) values
  (:'a', 'crewTable', 'A crew table is open', 'Bala opened table ABCD.', '/#/t/ABCD', 'table-ABCD', 't1', now() - interval '2 hours'),
  (:'a', 'crew', 'You’re in', 'Welcome to the crew.', '/#/crews/x', 'crew-x', 'r1', now() - interval '10 days'),
  (:'a', 'trophies', 'Season over', 'You finished 2nd.', '/', 'season', 's1', now() - interval '40 days'),
  (:'b', 'crew', 'For Bala', 'Not Asha''s.', '/', 'crew-y', 'r2', now());

select testing.as_phone(:PA, 'select public.my_notifications() as n') -> 0 -> 'n' as mine \gset
select is(jsonb_array_length(:'mine'::jsonb), 2, 'my notifications of the last 30 days (not the older one, not anyone else''s)');
select is(:'mine'::jsonb -> 0 ->> 'title', 'A crew table is open', 'newest first');
select is((:'mine'::jsonb -> 0 ->> 'kind') || ' ' || (:'mine'::jsonb -> 0 ->> 'url'), 'crewTable /#/t/ABCD', 'with its kind and where a tap goes');
select is(testing.one(null, 'select public.my_notifications()'), 'permission denied for function my_notifications', 'only a signed-in phone can ask');

-- the test notification
select is(testing.one(:PA, 'select public.send_test_push()'), 'Notifications are not on for this account yet', 'a test needs notifications on');
insert into public.push_subscriptions (endpoint, account_id, p256dh, auth) values ('https://fcm.googleapis.com/x', :'a', repeat('a', 87), repeat('b', 22));
select is(testing.one(:PA, $$select public.send_test_push() ->> 'phones'$$), '1', 'a test is queued for my phones');
select is((select count(*)::int from private.push_outbox where account_id = :'a' and kind = 'test' and sent_at is null), 1, 'it waits in the same queue as the real ones');
select is(testing.one(:PA, 'select public.send_test_push()'), 'A test is already on its way. Give it a moment.', 'one at a time');
select is(testing.one(:PA, 'select jsonb_array_length(public.my_notifications())'), '2', 'the test is not listed in the inbox');

-- the nightly clean-up keeps 30 days
select is(position('interval ''30 days''' in pg_get_functiondef('public.daily_upkeep(text, text)'::regprocedure)) > 0, true, 'the clean-up keeps the outbox 30 days');
select is(position('delete from private.push_outbox where at < now() - interval ''7 days''' in pg_get_functiondef('public.daily_upkeep(text, text)'::regprocedure)), 0, 'not 7 any more');

-- queued notifications are sent at once: the database tells the worker (where pg_net is not there, as here, nothing happens)
select is((select count(*)::int from pg_trigger where tgname = 'push_kick' and not tgisinternal), 1, 'a queued notification kicks the sender');
select is((select value from private.settings where key = 'push_kick_url'), 'https://train-poker-tables.apins-subdomain.workers.dev/push/drain', 'at the worker''s drain');
select lives_ok($$insert into private.push_outbox (account_id, kind, title, body, url, tag, dedupe) select id, 'crew', 't', 'b', '/', 'x', 'kick-test' from public.accounts limit 1$$, 'and queueing never fails because of it');

select * from finish();
rollback;
