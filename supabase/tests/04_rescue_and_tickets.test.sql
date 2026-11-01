-- Crew rescue (no code, a crew admin vouches) and table tickets (how a live table knows who you are).
begin;
set search_path = public, extensions;
select plan(18);

\set OWNER '''00000000-0000-0000-0000-0000000000d1'''
\set RAHUL '''00000000-0000-0000-0000-0000000000d2'''
\set RAHUL2 '''00000000-0000-0000-0000-0000000000d3'''
\set THIEF '''00000000-0000-0000-0000-0000000000d4'''

select testing.one(:OWNER, $$select (public.ensure_account('Owner')).id$$) as owner_acc \gset
select testing.one(:RAHUL, $$select (public.ensure_account('Rahul')).id$$) as rahul_acc \gset
select testing.one(:OWNER, $$select (public.create_crew('Crew')).id$$) as crew \gset
select testing.one(:OWNER, $$select public.create_invite('$$ || :'crew' || $$')$$) as inv \gset
select testing.one(:RAHUL, $$select public.join_crew('$$ || :'inv' || $$')$$);

-- Rahul's phone is lost with the code. On a new phone he opens the crew link: "I'm already in this crew"
select is(testing.one(:RAHUL2, $$select jsonb_array_length(public.invite_info('$$ || :'inv' || $$') -> 'members')$$), '2', 'the link lists the members to pick from');
select is(testing.one(null, $$select public.invite_info('$$ || :'inv' || $$') ->> 'name'$$), 'Crew', 'even on a phone that has not signed in yet');
select testing.one(:RAHUL2, $$select public.request_rescue('$$ || :'inv' || $$', '$$ || :'rahul_acc' || $$')$$) as req \gset
select is(testing.one(:OWNER, $$select status from rescue_requests$$), 'pending', 'an admin sees the request');
select is(testing.one(:RAHUL, $$select count(*) from rescue_requests$$), '0', 'ordinary members do not');
select is(testing.one(:THIEF, $$select public.decide_rescue('$$ || :'req' || $$', true)$$), 'No account yet', 'a stranger cannot decide it');
select is(testing.one(:RAHUL, $$select public.decide_rescue('$$ || :'req' || $$', true)$$), 'Only a crew admin can do that', 'nor can a member');
select testing.one(:OWNER, $$select public.decide_rescue('$$ || :'req' || $$', true)$$);
select is(testing.one(:RAHUL2, $$select (public.ensure_account('x')).id$$), :'rahul_acc', 'approved: the new phone is Rahul''s account');
select is(testing.one(:RAHUL2, $$select count(*) from crews$$), '1', 'with his crew');
select is(testing.as_phone(:OWNER, $$select what from crew_audit where what like 'rescue%' order by id$$), '[{"what": "rescue_requested"}, {"what": "rescue_approved"}]', 'the crew log shows the rescue, so it cannot happen quietly');
select is(testing.one(:OWNER, $$select public.decide_rescue('$$ || :'req' || $$', true)$$), 'This request is no longer open', 'a request is decided once');

-- a thief asks to be the owner: refused, and an admin cannot approve their own rescue
select testing.one(:THIEF, $$select public.request_rescue('$$ || :'inv' || $$', '$$ || :'owner_acc' || $$')$$) as req2 \gset
select is(testing.one(:OWNER, $$select public.decide_rescue('$$ || :'req2' || $$', true)$$), 'Another admin has to approve your own rescue', 'nobody approves a rescue of their own account');
select testing.one(:OWNER, $$select public.set_role('$$ || :'crew' || $$', '$$ || :'rahul_acc' || $$', 'admin')$$);
select testing.one(:RAHUL, $$select public.decide_rescue('$$ || :'req2' || $$', false)$$);
select is(testing.one(:THIEF, $$select count(*) from crews$$), '0', 'denied: the thief gets nothing');

-- table tickets
select testing.one(:RAHUL2, $$select public.table_ticket('QK7P')$$) as ticket \gset
select is(testing.one(null, $$select public.check_ticket('$$ || :'ticket' || $$', 'QK7P') ->> 'account'$$), :'rahul_acc', 'a table server (public key) learns which account a ticket is');
select is(testing.one(null, $$select public.check_ticket('$$ || :'ticket' || $$', 'QK7P') -> 'crews' ->> 0$$), :'crew', 'and its crews, for crew-only tables');
select is(testing.one(null, $$select public.check_ticket('$$ || :'ticket' || $$', 'ZZZZ')$$), null::text, 'a ticket only works for its own table');
select is(testing.one(null, $$select public.check_ticket('0000', 'QK7P')$$), null::text, 'a made-up ticket is nothing');
select testing.one(:RAHUL, $$select public.logout_other_phones()$$);
select is(testing.one(null, $$select public.check_ticket('$$ || :'ticket' || $$', 'QK7P')$$), null::text, 'a logged-out phone''s ticket stops working');
select testing.one(:RAHUL, $$select public.table_ticket('QK7P')$$) as ticket2 \gset
update private.table_tickets set expires_at = now() - interval '1 second';
select is(testing.one(null, $$select public.check_ticket('$$ || :'ticket2' || $$', 'QK7P')$$), null::text, 'tickets expire');

select * from finish();
rollback;
