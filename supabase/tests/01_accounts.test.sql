-- Accounts without sign-up, and what a phone may and may not touch directly.
begin;
set search_path = public, extensions;
select plan(14);

\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''

select is(testing.one(:A, $$select (public.ensure_account('Riya')).name$$), 'Riya', 'first open makes an account');
select is(testing.one(:A, $$select (public.ensure_account('Other')).name$$), 'Riya', 'opening again returns the same account');
select is((select count(*)::int from accounts), 1, 'one account, not two');
select is(testing.one(:B, $$select (public.ensure_account('')).name$$), 'new row for relation "accounts" violates check constraint "accounts_name_check"', 'an empty name is refused');
select is(testing.one(:B, $$select (public.ensure_account('ABCDEFGHIJKLMNOPQRSTU')).name$$), 'new row for relation "accounts" violates check constraint "accounts_name_check"', 'a 21-character name is refused');
select is(testing.one(:B, $$select (public.ensure_account('Arjun 🔥')).name$$), 'Arjun 🔥', 'emoji are fine');
select is(testing.one(null, $$select (public.ensure_account('Ghost')).name$$), 'permission denied for function ensure_account', 'not signed in: refused');

-- direct writes
select is(testing.as_phone(:A, $$update accounts set name = 'Riya K' where true returning name$$), '[{"name": "Riya K"}]', 'you can rename yourself');
select is(testing.as_phone(:A, $$update accounts set name = 'Hacked' where name like 'Arjun%' returning name$$), '[]', 'you cannot rename someone else');
select is(testing.one(:A, $$update accounts set deleted_at = now() returning 1$$), 'permission denied for table accounts', 'you cannot write other columns');
select is(testing.one(:A, $$insert into accounts (name) values ('Sneaky') returning 1$$), 'permission denied for table accounts', 'accounts are not inserted directly');
select is(testing.one(:A, $$select count(*) from private.recovery_codes$$), 'permission denied for table recovery_codes', 'the private schema is closed');
select is(testing.as_phone(:A, $$select name from accounts$$), '[{"name": "Riya K"}]', 'strangers do not see each other');
select is(testing.one(:A, $$select count(*) from account_logins$$), '1', 'you see your own logins only');

select * from finish();
rollback;
