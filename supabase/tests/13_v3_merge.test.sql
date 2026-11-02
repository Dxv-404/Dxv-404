-- v3: merging one account into another keeps what crews v3 and devices added (requests, invitations,
-- tables opened, notification sign-ups, history attribution) instead of losing it to the cascade.
begin;
set search_path = public, extensions;
select plan(14);

\set SRC '''00000000-0000-0000-0000-0000000e0001'''
\set DST '''00000000-0000-0000-0000-0000000e0002'''
\set C1 '''00000000-0000-0000-0000-0000000e0101'''
\set C2 '''00000000-0000-0000-0000-0000000e0102'''
\set C3 '''00000000-0000-0000-0000-0000000e0103'''

insert into public.accounts (id, name) values (:SRC, 'Phone me'), (:DST, 'Dev');
insert into public.crews (id, name) values (:C1, 'Fridays'), (:C2, 'Office'), (:C3, 'Cousins');
-- DST is in Fridays; SRC asked to join Fridays (pointless after the merge) and Office (kept),
-- and was invited to Cousins (kept) and to Fridays (pointless)
insert into public.crew_members (crew_id, account_id, role) values (:C1, :DST, 'owner');
insert into public.crew_requests (crew_id, account_id) values (:C1, :SRC), (:C2, :SRC);
insert into public.crew_invitations (crew_id, account_id, code) values (:C3, :SRC, 'ABCDEF'), (:C1, :SRC, 'ABCDEF');
insert into public.crew_tables (crew_id, mode, opened_by) values (:C1, 'online', :SRC);
insert into public.crew_audit (crew_id, actor, what) values (:C1, :SRC, 'table_opened');
insert into public.push_subscriptions (endpoint, account_id, p256dh, auth)
  values ('https://push.example/abc', :SRC, repeat('a', 87), repeat('b', 22));

select lives_ok(format('select private.merge_accounts(%L, %L)', :SRC, :DST), 'merging runs');
select is((select count(*)::int from public.accounts where id = :SRC), 0, 'the old account is gone');
select is((select count(*)::int from public.crew_requests where account_id = :DST and crew_id = :C2 and status = 'pending'), 1, 'a pending request to another crew moves over');
select is((select count(*)::int from public.crew_requests where crew_id = :C1), 0, 'a request to a crew the account is already in is dropped');
select is((select count(*)::int from public.crew_invitations where account_id = :DST and crew_id = :C3), 1, 'an invitation moves over');
select is((select count(*)::int from public.crew_invitations where crew_id = :C1), 0, 'an invitation to a crew the account is already in is dropped');
select is((select opened_by from public.crew_tables where crew_id = :C1), :DST::uuid, 'tables it opened stay its own');
select is((select actor from public.crew_audit where crew_id = :C1 and what = 'table_opened'), :DST::uuid, 'crew history keeps its name');
select is((select account_id from public.push_subscriptions where endpoint = 'https://push.example/abc'), :DST::uuid, 'this device still gets notifications');
select is((select role::text from public.crew_members where crew_id = :C1 and account_id = :DST), 'owner', 'its own crew is untouched');

-- both accounts asked the same crew: one request stays
insert into public.accounts (id, name) values (:SRC, 'Phone me again');
insert into public.crew_requests (crew_id, account_id) values (:C3, :SRC);
delete from public.crew_invitations where crew_id = :C3;
insert into public.crew_requests (crew_id, account_id) values (:C3, :DST);
select lives_ok(format('select private.merge_accounts(%L, %L)', :SRC, :DST), 'merging two pending requests to one crew runs');
select is((select count(*)::int from public.crew_requests where crew_id = :C3 and status = 'pending'), 1, 'one pending request is left');
select is((select account_id from public.crew_requests where crew_id = :C3 and status = 'pending'), :DST::uuid, 'and it is the account''s');
select lives_ok(format('select private.merge_accounts(%L, %L)', :DST, :DST), 'merging an account into itself does nothing');

select * from finish();
rollback;
