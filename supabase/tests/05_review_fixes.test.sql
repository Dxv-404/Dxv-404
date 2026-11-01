-- Phase 3 review: one test (or more) for each gap that was found and fixed.
begin;
set search_path = public, extensions;
select plan(24);

-- 1. the lock counts the address Cloudflare saw, not a forwarded-for value the caller made up
\set P1 '''00000000-0000-0000-0000-0000000000e1'''
\set P2 '''00000000-0000-0000-0000-0000000000e2'''
\set OWNER '''00000000-0000-0000-0000-0000000000e3'''
select testing.one(:OWNER, $$select (public.ensure_account('Owner')).id$$);
select testing.one(:OWNER, $$select public.new_recovery_code()$$) as code \gset
-- ten wrong tries, each pretending to come from a different address
select set_config('request.headers', json_build_object('cf-connecting-ip', '198.51.100.9', 'x-forwarded-for', '10.0.0.' || n || ', 198.51.100.9')::text, false),
       testing.as_phone(:P1, $$select public.recover_account('$$ || (300000000000 + n)::text || $$')$$)
  from generate_series(1, 10) n;
select set_config('request.headers', '{"cf-connecting-ip": "198.51.100.9", "x-forwarded-for": "203.0.113.250"}', false);
select is(testing.one(:P2, $$select public.recover_account('$$ || :'code' || $$')$$), 'Too many wrong codes. Try again in an hour.', 'faking x-forwarded-for does not dodge the lock');
select set_config('request.headers', '{"cf-connecting-ip": "198.51.100.10"}', false);
select is(testing.one(:P2, $$select (public.recover_account('$$ || :'code' || $$')).name$$), 'Owner', 'a different real address is not locked');
select is((select private.request_ip()), '198.51.100.10', 'IPv4 is used as it is');
select set_config('request.headers', '{"cf-connecting-ip": "2001:db8:aa:bb:1:2:3:4"}', false);
select is((select private.request_ip()), '2001:db8:aa:bb::/64', 'IPv6 counts per /64 (one home or phone)');
select set_config('request.headers', '{"cf-connecting-ip": "2001:db8::1"}', false);
select is((select private.request_ip()), '2001:db8:0:0::/64', 'shortened IPv6 too');
select set_config('request.headers', '', false);
select is((select private.request_ip()), null::text, 'no headers, no address');

-- 2. merging when the phone's own account owns a crew the old account is in
\set OLD '''00000000-0000-0000-0000-0000000000f1'''
\set NEWP '''00000000-0000-0000-0000-0000000000f2'''
select testing.one(:OLD, $$select (public.ensure_account('Old')).id$$) as old_acc \gset
select testing.one(:OLD, $$select public.new_recovery_code()$$) as oldcode \gset
select testing.one(:NEWP, $$select (public.ensure_account('New')).id$$);
select testing.one(:NEWP, $$select (public.create_crew('New phone crew')).id$$) as ncrew \gset
select testing.one(:NEWP, $$select public.create_invite('$$ || :'ncrew' || $$')$$) as ninv \gset
select testing.one(:OLD, $$select public.join_crew('$$ || :'ninv' || $$')$$);
select is(testing.one(:NEWP, $$select (public.recover_account('$$ || :'oldcode' || $$')).id$$), :'old_acc', 'merging works when the merged account owns a shared crew');
select is((select role::text || '/' || count(*) over () from crew_members where crew_id = :'ncrew'), 'owner/1', 'one membership, and it is the owner');

-- 3. crew rescue uses what the asking phone is when the admin answers
\set ADM '''00000000-0000-0000-0000-0000000000f3'''
\set LOST '''00000000-0000-0000-0000-0000000000f4'''
\set ASK '''00000000-0000-0000-0000-0000000000f5'''
\set ASK2 '''00000000-0000-0000-0000-0000000000f6'''
select testing.one(:ADM, $$select (public.ensure_account('Admin')).id$$);
select testing.one(:LOST, $$select (public.ensure_account('Lost')).id$$) as lost_acc \gset
select testing.one(:ADM, $$select (public.create_crew('Rescue crew')).id$$) as rcrew \gset
select testing.one(:ADM, $$select public.create_invite('$$ || :'rcrew' || $$')$$) as rinv \gset
select testing.one(:LOST, $$select public.join_crew('$$ || :'rinv' || $$')$$);
select testing.one(:ASK, $$select public.request_rescue('$$ || :'rinv' || $$', '$$ || :'lost_acc' || $$')$$) as req \gset
-- after asking, the new phone made its own account and a crew while waiting
select testing.one(:ASK, $$select (public.ensure_account('Waiting')).id$$);
select testing.one(:ASK, $$select public.create_crew('Made while waiting')$$);
select testing.one(:ADM, $$select public.decide_rescue('$$ || :'req' || $$', true)$$);
select is(testing.as_phone(:ASK, $$select name from crews order by name$$), '[{"name": "Made while waiting"}, {"name": "Rescue crew"}]', 'what the phone made while waiting is kept, on the rescued account');
-- a phone whose account is also used on other phones: only the phone moves
select testing.one(:ASK2, $$select (public.ensure_account('Shared')).id$$) as shared_acc \gset
select testing.one(:ASK2, $$select public.new_recovery_code()$$) as sharedcode \gset
\set ASK2B '''00000000-0000-0000-0000-0000000000f7'''
select testing.one(:ASK2B, $$select (public.recover_account('$$ || :'sharedcode' || $$')).id$$);
select testing.one(:ASK2, $$select public.request_rescue('$$ || :'rinv' || $$', '$$ || :'lost_acc' || $$')$$) as req2 \gset
select testing.one(:ADM, $$select public.decide_rescue('$$ || :'req2' || $$', true)$$);
select is(testing.one(:ASK2B, $$select (public.ensure_account('x')).id$$), :'shared_acc', 'the other phone keeps its account');
select is(testing.one(:ASK2, $$select (public.ensure_account('x')).id$$), :'lost_acc', 'and only the asking phone moved');

-- 4. waiting for approval, you can still see which crew you asked to join
\set WAIT '''00000000-0000-0000-0000-0000000000f8'''
select testing.one(:ADM, $$select public.update_crew('$$ || :'rcrew' || $$', p_require_approval => true)$$);
select testing.one(:WAIT, $$select (public.ensure_account('Waiter')).id$$) as wait_acc \gset
select testing.one(:WAIT, $$select public.join_crew('$$ || :'rinv' || $$')$$);
select is(testing.one(:WAIT, $$select name from crews$$), 'Rescue crew', 'a pending member sees the crew name');
select is(testing.one(:WAIT, $$select count(*) from crew_members where crew_id = '$$ || :'rcrew' || $$'$$), '1', 'but only their own membership, not the members');
select is(testing.one(:ADM, $$select public.approve_member('$$ || :'rcrew' || $$', '$$ || :'lost_acc' || $$')$$), 'Nobody is waiting with that name', 'approving someone who is not waiting is an error, not a log entry');
select is(testing.one(:ADM, $$select public.remove_member('$$ || :'rcrew' || $$', '$$ || :'old_acc' || $$')$$), 'Not a member', 'removing a non-member is an error');

-- 5. phones on my account
select is(testing.as_phone(:ASK2B, $$select this_phone from public.my_phones() order by this_phone$$), '[{"this_phone": true}]', 'after the rescue, the shared account has one phone left');
select is(testing.one(:LOST, $$select count(*) from public.my_phones()$$), '3', 'the rescued account lists its three phones');
select testing.one(:LOST, $$select phone from public.my_phones() where not this_phone limit 1$$) as other \gset
select is(testing.one(:LOST, $$select public.logout_phone('$$ || :'other' || $$')$$), 'true', 'a phone you do not recognise can be logged out');
select is(testing.one(:LOST, $$select public.logout_phone('$$ || :LOST || $$')$$), 'Use Log out on this phone instead', 'but not this phone');

-- 6. names and pictures
select is(testing.one(:WAIT, $$update accounts set name = '   ' returning name$$), 'new row for relation "accounts" violates check constraint "accounts_name_check"', 'a name of only spaces is refused');
select is(testing.one(:WAIT, $$update accounts set name = 'Ri' || chr(8203) || 'ya' returning name$$), 'new row for relation "accounts" violates check constraint "accounts_name_check"', 'invisible characters are refused');
select is(testing.one(:WAIT, $$update accounts set name = '  Riya  ' returning name$$), 'Riya', 'spaces around a name are trimmed');
select is(testing.one(:WAIT, $$update accounts set avatar_url = 'https://evil.example/pixel.gif' returning 1$$), 'new row for relation "accounts" violates check constraint "accounts_avatar_here"', 'pictures from other sites are refused');

-- 7. at most 20 live table passes per account
select testing.as_phone(:WAIT, $$select public.table_ticket('CAP1') from generate_series(1, 25)$$);
select is((select count(*)::int from private.table_tickets where account_id = :'wait_acc'), 20, 'old passes are dropped beyond 20');

select * from finish();
rollback;
