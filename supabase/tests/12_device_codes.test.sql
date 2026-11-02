-- v3 devices: one-time codes (once, 5 minutes, new code cancels old, 5 wrong tries cancel it, pauses and
-- limits), bringing a device's own crews along or not, device names, and notices on the other devices.
begin;
set search_path = public, extensions;
select plan(55);

\set LAP '''00000000-0000-0000-0000-00000000d001'''
\set PHONE '''00000000-0000-0000-0000-00000000d002'''
\set THIEF '''00000000-0000-0000-0000-00000000d003'''
\set OWN '''00000000-0000-0000-0000-00000000d004'''
\set LEAVE '''00000000-0000-0000-0000-00000000d005'''
\set STRANGER '''00000000-0000-0000-0000-00000000d006'''
\set TAB '''00000000-0000-0000-0000-00000000d007'''

select testing.one(:LAP, $$select (public.ensure_account('Dev')).id$$) as dev \gset
select testing.one(:LAP, $$select public.set_this_device('laptop', 'Mac · Chrome')$$);
select testing.one(:LAP, $$select public.new_device_code()::text$$) as made \gset
select (:'made'::jsonb) ->> 'code' as code \gset

-- ---------------------------------------------------------------- the code
select ok(:'code' ~ '^[0-9]{6}$', 'six digits');
select ok(((:'made'::jsonb) ->> 'expires_at')::timestamptz between now() + interval '299 seconds' and now() + interval '301 seconds', 'works for 5 minutes');
select is((select count(*)::int from private.device_codes where code_hash like '%' || :'code' || '%'), 0, 'only a keyed hash of it is kept');
select is(testing.one(:LAP, $$select count(*) from private.device_codes$$), 'permission denied for table device_codes', 'devices cannot read the codes');
select is(testing.one(null, $$select public.new_device_code()$$), 'permission denied for function new_device_code', 'a device with no sign-in cannot make one');
select is(testing.one(:STRANGER, $$select public.new_device_code()$$), 'No account yet', 'a device with no account cannot make one');

-- a fresh phone (nothing on it) types it, with a space in the middle like the screen shows it
select testing.one(:PHONE, format($$select public.redeem_device_code('%s %s', null, 'phone', 'Pixel 7 · Chrome')::text$$, left(:'code', 3), right(:'code', 3))) as r \gset
select is((:'r'::jsonb) ->> 'ok', 'true', 'a fresh device signs in with the code');
select is((:'r'::jsonb) -> 'account' ->> 'id', :'dev', 'and is that account');
select is((:'r'::jsonb) ->> 'from', 'laptop', 'and which kind of device made the code');
select is((:'r'::jsonb) -> 'moved' ->> 'crews', '0', 'it says what moved with it');
select is(testing.one(:PHONE, $$select (public.ensure_account('Someone')).name$$), 'Dev', 'the phone is Dev now');
select is(testing.one(:LAP, $$select count(*) from public.my_devices()$$), '2', 'the laptop sees two devices');
select is(testing.as_phone(:LAP, $$select this_device, kind, detail from public.my_devices()$$),
  '[{"kind": "laptop", "detail": "Mac · Chrome", "this_device": true}, {"kind": "phone", "detail": "Pixel 7 · Chrome", "this_device": false}]', 'this device first, each with its kind and description');

-- works once
select is(testing.one(:THIEF, format($$select public.redeem_device_code(%L) ->> 'reason'$$, :'code')), 'used', 'a code works once');
select is(testing.one(:THIEF, $$select count(*) from public.my_devices()$$), '0', 'and the second device got nothing');

-- the other way round: the phone adds a tablet
select testing.one(:PHONE, $$select public.new_device_code() ->> 'code'$$) as pcode \gset
select is(testing.one(:TAB, format($$select public.redeem_device_code(%L, null, 'tablet') -> 'account' ->> 'id'$$, :'pcode')), :'dev', 'either way round: a phone can add a device too');

-- ---------------------------------------------------------------- new code cancels the old, expiry, self
select testing.one(:LAP, $$select public.new_device_code() ->> 'code'$$) as c1 \gset
select testing.one(:LAP, $$select public.new_device_code() ->> 'code'$$) as c2 \gset
select is(testing.one(:STRANGER, format($$select public.redeem_device_code(%L) ->> 'reason'$$, :'c1')), 'cancelled', 'making a new code cancels the old one');
select is(testing.one(:LAP, format($$select public.redeem_device_code(%L) ->> 'reason'$$, :'c2')), 'self', 'a device of the same account is told it already is');
update private.device_codes set expires_at = now() - interval '1 second' where account_id = :'dev' and status = 'open';
select is(testing.one(:STRANGER, format($$select public.redeem_device_code(%L) ->> 'reason'$$, :'c2')), 'expired', 'after 5 minutes the code ran out');
select is(testing.one(:STRANGER, $$select count(*) from public.my_devices()$$), '0', 'and signs nobody in');
select testing.one(:LAP, $$select public.new_device_code() ->> 'code'$$) as c3 \gset
select testing.one(:LAP, $$select public.cancel_device_code()$$);
select is(testing.one(:STRANGER, format($$select public.redeem_device_code(%L) ->> 'reason'$$, :'c3')), 'cancelled', 'Cancel stops the code at once');

-- ---------------------------------------------------------------- wrong tries
select testing.one(:LAP, $$select public.new_device_code() ->> 'code'$$) as live \gset
-- a wrong code: one that is not live (the live one plus one, wrapping round)
select lpad(((:'live'::int + 1) % 1000000)::text, 6, '0') as w1 \gset
select is(testing.as_phone(:THIEF, format($$select public.redeem_device_code(%L) - 'x' as r$$, :'w1')) -> 0 -> 'r', '{"ok": false, "reason": "wrong", "tries_left": 4}'::jsonb, 'a wrong code: 4 tries left');
select is(testing.one(:THIEF, format($$select public.redeem_device_code(%L) ->> 'tries_left'$$, :'w1')), '3', 'then 3');
select is(testing.one(:THIEF, $$select public.redeem_device_code('12') ->> 'tries_left'$$), '3', 'too short is wrong too, but not a try (a slip of the finger)');
select is((select wrong from private.device_codes where account_id = :'dev' and status = 'open'), 2, 'each wrong try counts against every open code');
select testing.one(:THIEF, format($$select public.redeem_device_code(%L)$$, :'w1')) from generate_series(1, 2);
select is(testing.one(:THIEF, format($$select public.redeem_device_code(%L) ->> 'tries_left'$$, :'w1')), '0', 'the fifth wrong code: no tries left');
select is(testing.one(:THIEF, format($$select public.redeem_device_code(%L)$$, :'live')), 'Too many wrong codes. Wait a few minutes, then try again.', 'then a short pause, even for the right code');
select is(testing.one(:STRANGER, format($$select public.redeem_device_code(%L) ->> 'reason'$$, :'live')), 'cancelled', '5 wrong tries cancelled the open code');
update private.device_code_attempts set at = at - interval '11 minutes' where auth_user = :THIEF;
select is(testing.one(:THIEF, format($$select public.redeem_device_code(%L) ->> 'reason'$$, :'w1')), 'wrong', '10 minutes later the pause is over');

-- per network: 30 wrong codes an hour from one address pause every device on it
select set_config('request.headers', '{"cf-connecting-ip": "198.51.100.9"}', false);
select testing.as_phone(('00000000-0000-0000-0000-0000000e00' || lpad(k::text, 2, '0'))::uuid, $$select public.redeem_device_code('000001')$$) from generate_series(1, 6) k, generate_series(1, 5) n;
select is(testing.one(:STRANGER, $$select public.redeem_device_code('000001')$$), 'Too many wrong codes. Wait a few minutes, then try again.', 'a network with 30 wrong codes in an hour waits too');
select set_config('request.headers', '', false);

-- ---------------------------------------------------------------- limits on making codes
update private.device_codes set created_at = created_at - interval '2 hours' where account_id = :'dev';
select testing.one(:LAP, $$select public.new_device_code()$$) from generate_series(1, 10);
select is(testing.one(:LAP, $$select public.new_device_code()$$), 'That is a lot of codes. Wait a little, then make one more.', 'at most 10 codes an hour');
select is((select count(*)::int from private.device_codes where account_id = :'dev' and status = 'open'), 1, 'and only ever one open');
update private.device_codes set created_at = created_at - interval '2 hours' where account_id = :'dev';

-- ---------------------------------------------------------------- a device with crews of its own
select testing.one(:OWN, $$select (public.ensure_account('Dev (old phone)')).id$$) as own_acc \gset
select testing.one(:OWN, $$select (public.create_crew('Hostel 4B')).id$$) as hostel \gset
select testing.one(:LAP, $$select public.new_device_code() ->> 'code'$$) as mc \gset
select testing.one(:OWN, format($$select public.redeem_device_code(%L)::text$$, :'mc')) as ask \gset
select is((:'ask'::jsonb) ->> 'reason', 'ask', 'a device with a crew of its own is asked first');
select is((:'ask'::jsonb) -> 'mine' -> 'crews' -> 0 ->> 'name', 'Hostel 4B', 'with what it has: the crew');
select is((:'ask'::jsonb) -> 'mine' -> 'crews' -> 0 ->> 'role', 'owner', 'and its role there');
select is(testing.one(:OWN, $$select (public.ensure_account('x')).id$$), :'own_acc', 'asking changed nothing yet');
select is(testing.one(:OWN, format($$select public.redeem_device_code(%L, true) -> 'moved' ->> 'crews'$$, :'mc')), '1', 'Bring them over: the crew came along');
select is(testing.one(:LAP, $$select name from public.crews$$), 'Hostel 4B', 'the laptop is in Hostel 4B now');
select is((select role::text from public.crew_members where crew_id = :'hostel' and account_id = :'dev'), 'owner', 'as its owner');
select is((select count(*)::int from public.accounts where id = :'own_acc'), 0, 'the old phone''s own account is gone');

select testing.one(:LEAVE, $$select (public.ensure_account('Spare')).id$$) as leave_acc \gset
select testing.one(:LEAVE, $$select public.create_crew('Nobody''s crew')$$);
select testing.one(:LAP, $$select public.new_device_code() ->> 'code'$$) as lc \gset
select is(testing.one(:LEAVE, format($$select public.redeem_device_code(%L, false) ->> 'ok'$$, :'lc')), 'true', 'Leave them behind');
select is(testing.as_phone(:LEAVE, $$select name from crews order by name$$), '[{"name": "Hostel 4B"}]', 'nothing of it came along');
select is((select count(*)::int from public.accounts where id = :'leave_acc'), 0, 'its account is gone');

-- ---------------------------------------------------------------- notices and names
select is(testing.one(:LAP, $$select count(*) from public.my_device_notices()$$), '4', 'the laptop is told about each new device');
select is(testing.one(:PHONE, $$select string_agg(kind, ',' order by at) from public.my_device_notices()$$), 'tablet,phone,phone', 'the phone only about the ones after it (not itself)');
select is(testing.one(:LEAVE, $$select count(*) from public.my_device_notices()$$), '0', 'the newest device about none');
select is((select count(*)::int from private.push_outbox where account_id = :'dev' and kind = 'devices'), 4, 'a push for each new sign-in');
select testing.one(:LAP, $$select public.dismiss_device_notice(id) from public.my_device_notices()$$);
select is(testing.one(:LAP, $$select count(*) from public.my_device_notices()$$), '0', 'dismissed on the laptop');
select is(testing.one(:PHONE, $$select count(*) from public.my_device_notices()$$), '3', 'still there on the phone');
-- "Not me? Log it out"
select testing.one(:PHONE, format($$select public.logout_phone(%L)$$, :LEAVE));
select is(testing.one(:PHONE, format($$select still_signed_in from public.my_device_notices() where device = %L$$, :LEAVE)), 'false', 'logged out from the notice');

select testing.one(:LAP, format($$select public.rename_device(%L, '  Dev''s Pixel ')$$, :PHONE));
select is(testing.one(:PHONE, $$select name from public.my_devices() where this_device$$), 'Dev''s Pixel', 'a device can be renamed (trimmed)');
select is(testing.one(:STRANGER, format($$select public.rename_device(%L, 'mine')$$, :PHONE)), 'No account yet', 'nobody else can rename it');
select testing.one(:OWN, $$select (public.ensure_account('Other')).id$$);
select is(testing.one(:LAP, format($$select public.rename_device(%L, 'x')$$, :THIEF)), 'That device is not on your account', 'only devices of your own account');

-- the table server learns the device and its name
select testing.one(:PHONE, $$select public.table_ticket('QK7P')$$) as tk \gset
select is(testing.one(null, format($$select public.check_ticket(%L, 'QK7P') ->> 'deviceName'$$, :'tk')), 'Dev''s Pixel', 'a table ticket says which device it is');
select is(testing.one(null, format($$select public.check_ticket(%L, 'QK7P') ->> 'deviceKind'$$, :'tk')), 'phone', 'and what kind');

select * from finish();
rollback;
