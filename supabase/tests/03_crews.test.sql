-- Crews: invites, approval, roles, removal, leaving, limits, and who sees what.
begin;
set search_path = public, extensions;
select plan(31);

\set OWNER '''00000000-0000-0000-0000-0000000000c1'''
\set ADMIN '''00000000-0000-0000-0000-0000000000c2'''
\set MEM '''00000000-0000-0000-0000-0000000000c3'''
\set OUT '''00000000-0000-0000-0000-0000000000c4'''
\set LATE '''00000000-0000-0000-0000-0000000000c5'''

select testing.one(:OWNER, $$select (public.ensure_account('Owner')).id$$) as owner_acc \gset
select testing.one(:ADMIN, $$select (public.ensure_account('Admin')).id$$) as admin_acc \gset
select testing.one(:MEM, $$select (public.ensure_account('Member')).id$$) as mem_acc \gset
select testing.one(:OUT, $$select (public.ensure_account('Outsider')).id$$) as out_acc \gset
select testing.one(:LATE, $$select (public.ensure_account('Late')).id$$) as late_acc \gset

select testing.one(:OWNER, $$select (public.create_crew('Train crew', '#336699', '{"startStack": 2000}')).id$$) as crew \gset
select is(testing.one(:OWNER, $$select role from crew_members$$), 'owner', 'the creator owns the crew');
select is(testing.one(:OWNER, $$select house_rules ->> 'startStack' from crews$$), '2000', 'house rules are kept');
select is(testing.one(:OWNER, $$select (public.create_crew('Bad', 'red')).id$$), 'new row for relation "crews" violates check constraint "crews_color_check"', 'colours must be #rrggbb');

select testing.one(:OWNER, $$select public.create_invite('$$ || :'crew' || $$')$$) as inv \gset
select ok(:'inv' ~ '^[A-HJ-NP-Z2-9]{10}$', 'invite codes are 10 characters with no look-alikes');
select is(testing.one(:OUT, $$select public.invite_info('$$ || :'inv' || $$') ->> 'name'$$), 'Train crew', 'an invite link shows the crew name before joining');
select is(testing.one(:ADMIN, $$select public.join_crew('$$ || lower(:'inv') || $$')$$), 'active', 'joining by link (any case)');
select is(testing.one(:MEM, $$select public.join_crew('$$ || :'inv' || $$')$$), 'active', 'a second member joins');
select is(testing.one(:MEM, $$select public.join_crew('$$ || :'inv' || $$')$$), 'active', 'joining twice changes nothing');
select is(testing.one(:MEM, $$select public.create_invite('$$ || :'crew' || $$')$$), 'Only a crew admin can do that', 'members cannot invite');

-- what people can see
select is(testing.one(:MEM, $$select count(*) from crew_members$$), '3', 'a member sees the members');
select is(testing.as_phone(:MEM, $$select name from accounts order by name$$), '[{"name": "Admin"}, {"name": "Member"}, {"name": "Owner"}]', 'and their names');
select is(testing.one(:OUT, $$select count(*) from crews$$), '0', 'an outsider sees no crew');
select is(testing.one(:OUT, $$select count(*) from crew_members$$), '0', 'and no members');
select is(testing.as_phone(:OUT, $$select name from accounts$$), '[{"name": "Outsider"}]', 'and no names');
select is(testing.one(:MEM, $$select count(*) from crew_invites$$), '0', 'members do not see invite codes');

-- roles
select is(testing.one(:ADMIN, $$select public.set_role('$$ || :'crew' || $$', '$$ || :'mem_acc' || $$', 'admin')$$), 'Only the owner can change roles', 'only the owner changes roles');
select testing.one(:OWNER, $$select public.set_role('$$ || :'crew' || $$', '$$ || :'admin_acc' || $$', 'admin')$$);
select is(testing.one(:ADMIN, $$select role from crew_members where account_id = '$$ || :'admin_acc' || $$'$$), 'admin', 'the owner makes an admin');
select testing.one(:ADMIN, $$select public.create_invite('$$ || :'crew' || $$', true, 1)$$) as single \gset
select is(testing.one(:OUT, $$select public.join_crew('$$ || :'single' || $$')$$), 'active', 'admins can invite; a single-use link works once');
select is(testing.one(:LATE, $$select public.join_crew('$$ || :'single' || $$')$$), 'This invite has expired', 'and not twice');
update crew_invites set expires_at = now() - interval '1 second' where code = :'inv';
select is(testing.one(:LATE, $$select public.join_crew('$$ || :'inv' || $$')$$), 'This invite has expired', 'an expired link does not work');

-- approval
select testing.one(:OWNER, $$select public.update_crew('$$ || :'crew' || $$', p_require_approval => true)$$);
select testing.one(:OWNER, $$select public.create_invite('$$ || :'crew' || $$')$$) as inv2 \gset
select is(testing.one(:LATE, $$select public.join_crew('$$ || :'inv2' || $$')$$), 'pending', 'with approval on, a new member waits');
select is(testing.one(:LATE, $$select count(*) from crew_members where account_id <> '$$ || :'late_acc' || $$'$$), '0', 'and sees none of its members yet');
select testing.one(:ADMIN, $$select public.approve_member('$$ || :'crew' || $$', '$$ || :'late_acc' || $$')$$);
select is(testing.one(:LATE, $$select count(*) > 1 from crew_members$$), 'true', 'until an admin approves');

-- removing
select is(testing.one(:ADMIN, $$select public.remove_member('$$ || :'crew' || $$', '$$ || :'owner_acc' || $$')$$), 'The owner cannot be removed', 'the owner cannot be removed');
select testing.one(:OWNER, $$select public.set_role('$$ || :'crew' || $$', '$$ || :'mem_acc' || $$', 'admin')$$);
select is(testing.one(:ADMIN, $$select public.remove_member('$$ || :'crew' || $$', '$$ || :'mem_acc' || $$')$$), 'Only the owner can remove an admin', 'an admin cannot remove another admin');
select testing.one(:ADMIN, $$select public.remove_member('$$ || :'crew' || $$', '$$ || :'out_acc' || $$')$$);
select is(testing.one(:OUT, $$select count(*) from crews$$), '0', 'a removed member loses access');
select is(testing.one(:MEM, $$select count(*) from crew_audit where what = 'member_removed'$$), '1', 'members can see the removal in the crew log');

-- ownership passes when the owner leaves; the last one out closes the crew
select testing.one(:OWNER, $$select public.leave_crew('$$ || :'crew' || $$')$$);
select is(testing.one(:ADMIN, $$select a.name from crew_members m join accounts a on a.id = m.account_id where m.role = 'owner'$$), 'Admin', 'the owner leaves: the longest-serving admin owns it');
select testing.one(:MEM, $$select public.leave_crew('$$ || :'crew' || $$')$$);
select testing.one(:LATE, $$select public.leave_crew('$$ || :'crew' || $$')$$);
select testing.one(:ADMIN, $$select public.leave_crew('$$ || :'crew' || $$')$$);
select is((select count(*)::int from crews where id = :'crew'), 0, 'when the last member leaves, the crew is gone');

-- deleting an account keeps it in results as "Former player" and hands the crew on
select testing.one(:OWNER, $$select (public.create_crew('Second')).id$$) as crew2 \gset
select testing.one(:OWNER, $$select public.create_invite('$$ || :'crew2' || $$')$$) as inv3 \gset
select testing.one(:MEM, $$select public.join_crew('$$ || :'inv3' || $$')$$);
select testing.one(:OWNER, $$select public.delete_my_account()$$);
select is(testing.as_phone(:MEM, $$select a.name, m.role from crew_members m join accounts a on a.id = m.account_id order by a.name$$), '[{"name": "Former player", "role": "member"}, {"name": "Member", "role": "owner"}]', 'a deleted account shows as Former player; ownership passed on');

-- limits: 10 crews per person
select testing.as_phone(:LATE, $$select public.create_crew('Crew ' || n) from generate_series(1, 10) n$$);
select is(testing.one(:LATE, $$select (public.create_crew('Eleventh')).id$$), 'You can be in at most 10 crews', 'at most 10 crews per person');

select * from finish();
rollback;
