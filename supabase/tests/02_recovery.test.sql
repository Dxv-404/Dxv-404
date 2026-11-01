-- Recovery code: wiped phone, merge, discard, new code, logout other phones, brute-force lock.
begin;
set search_path = public, extensions;
select plan(23);

\set OLD '''00000000-0000-0000-0000-0000000000a1'''
\set WIPED '''00000000-0000-0000-0000-0000000000a2'''
\set NEW '''00000000-0000-0000-0000-0000000000a3'''
\set OTHER '''00000000-0000-0000-0000-0000000000a4'''
\set ATTACK '''00000000-0000-0000-0000-0000000000a5'''
\set SAMENET '''00000000-0000-0000-0000-0000000000a6'''

select testing.one(:OLD, $$select (public.ensure_account('Rahul')).id$$) as old_acc \gset
select testing.one(:OLD, $$select (public.create_crew('Friday crew')).id$$) as crew \gset
select testing.one(:OLD, $$select public.new_recovery_code()$$) as code \gset

select ok(:'code' ~ '^[1-9][0-9]{11}$', 'the code is 12 digits and does not start with 0');
select is(testing.one(:OLD, $$select public.has_recovery_code()$$), 'true', 'the account has a code');
select is((select count(*)::int from private.recovery_codes where code_hash = :'code' or code_hash like '%' || :'code' || '%'), 0, 'the code itself is not stored, only a keyed hash');

-- the phone is wiped: a brand-new anonymous login with nothing on it
select is(testing.one(:WIPED, $$select (public.recover_account('$$ || substr(:'code', 1, 4) || ' ' || substr(:'code', 5, 4) || ' ' || substr(:'code', 9) || $$')).id$$), :'old_acc', 'a wiped phone types the code (with spaces) and is the old account again');
select is(testing.one(:WIPED, $$select name from crews$$), 'Friday crew', 'its crews come back');
select is(testing.one(:WIPED, $$select (public.ensure_account('Someone new')).name$$), 'Rahul', 'and its name');
select is(testing.one(:OLD, $$select (public.ensure_account('x')).id$$), :'old_acc', 'the old phone stays logged in');

-- a phone that already played under its own account: merge (the default)
select testing.one(:NEW, $$select (public.ensure_account('Rahul (new phone)')).id$$) as new_acc \gset
select testing.one(:OLD, $$select public.create_invite('$$ || :'crew' || $$')$$) as inv \gset
select testing.one(:NEW, $$select public.create_crew('Sunday crew')$$);
select testing.one(:NEW, $$select public.join_crew('$$ || :'inv' || $$')$$); -- the new phone also joined Friday crew
select is(testing.one(:NEW, $$select (public.recover_account('$$ || :'code' || $$')).id$$), :'old_acc', 'recovering with merge');
select is(testing.as_phone(:NEW, $$select name from crews order by name$$), '[{"name": "Friday crew"}, {"name": "Sunday crew"}]', 'the new phone''s crew was added to the old account');
select is((select count(*)::int from crew_members where crew_id = :'crew'), 1, 'two accounts in the same crew became one member');
select is((select role::text from crew_members where crew_id = :'crew'), 'owner', 'keeping the higher role and the older membership');
select is((select count(*)::int from accounts where id = :'new_acc'), 0, 'the merged account is gone');

-- discard instead of merge
select testing.one(:OTHER, $$select (public.ensure_account('Throwaway')).id$$) as other_acc \gset
select testing.one(:OTHER, $$select public.create_crew('Nobody''s crew')$$);
select is(testing.one(:OTHER, $$select (public.recover_account('$$ || :'code' || $$', false)).id$$), :'old_acc', 'recovering and discarding this phone''s own games');
select is((select count(*)::int from accounts where id = :'other_acc'), 0, 'the discarded account is gone');
select is(testing.as_phone(:OTHER, $$select name from crews order by name$$), '[{"name": "Friday crew"}, {"name": "Sunday crew"}]', 'and nothing of it was added');

-- a new code cancels the old one
select testing.one(:OLD, $$select public.new_recovery_code()$$) as code2 \gset
select isnt(:'code2'::text, :'code'::text, 'Make a new code gives a different code');
select is(testing.as_phone(:ATTACK, $$select public.recover_account('$$ || :'code' || $$')$$), '[{"recover_account": null}]', 'the old code no longer works');

-- log out my other phones
select is(testing.one(:OLD, $$select public.logout_other_phones()$$), '3', 'three other phones logged out');
select is(testing.one(:WIPED, $$select (public.ensure_account('Fresh')).name$$), 'Fresh', 'a logged-out phone is a stranger again');

-- brute force: 10 wrong codes an hour per phone, then locked even for the right code
-- (this phone already tried the cancelled code once: 1 + 8 = 9 wrong)
select testing.as_phone(:ATTACK, $$select public.recover_account('$$ || (100000000000 + n)::text || $$')$$) from generate_series(1, 8) n;
select is(testing.one(:ATTACK, $$select (public.recover_account('$$ || :'code2' || $$')).id is not null$$), 'true', 'after 9 wrong codes the right one still works');
select testing.one(:OLD, $$select public.logout_other_phones()$$);
select testing.as_phone(:ATTACK, $$select public.recover_account('999999999999')$$) from generate_series(1, 2) n;
select is(testing.one(:ATTACK, $$select public.recover_account('$$ || :'code2' || $$')$$), 'Too many wrong codes. Try again in an hour.', 'after 10 wrong codes the phone is locked');

-- and per network: a second phone on the same connection is locked too
select set_config('request.headers', '{"cf-connecting-ip": "203.0.113.7"}', false);
\set NET1 '''00000000-0000-0000-0000-0000000000b1'''
select testing.as_phone(:NET1, $$select public.recover_account('$$ || (200000000000 + n)::text || $$')$$) from generate_series(1, 10) n;
select is(testing.one(:SAMENET, $$select public.recover_account('$$ || :'code2' || $$')$$), 'Too many wrong codes. Try again in an hour.', 'another phone on the same network is locked as well');
-- an hour later it works again
update private.recovery_attempts set at = at - interval '61 minutes';
select is(testing.one(:SAMENET, $$select (public.recover_account('$$ || :'code2' || $$')).name$$), 'Rahul', 'an hour later the lock is gone');
select set_config('request.headers', '', false);

select * from finish();
rollback;
