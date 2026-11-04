-- Research capture: the research store is closed to phones (no grants, row level security with no policies),
-- only a table server's signed call writes to it, repeats are dropped, bad rows skipped, research ids are made
-- for accounts, guests and devices, and the archive deletes a slice only when it matches what was archived.
begin;
set search_path = public, extensions;
select plan(41);

insert into private.settings values ('recorder_token_hash', encode(extensions.digest('test-recorder-token', 'sha256'), 'hex'))
  on conflict (key) do update set value = excluded.value;
select testing.one('00000000-0000-0000-0000-00000000e001', $$select (public.ensure_account('Dev')).id$$) as dev \gset

-- ---------------------------------------------------------------- the store
select has_schema('research');
select has_table('research', 'events', 'events table');
select has_table('research', 'subjects', 'subjects table');
select has_table('research', 'archive_log', 'archive log');
select ok((select relrowsecurity from pg_class where oid = 'research.events'::regclass), 'events: row level security on');
select ok((select relrowsecurity from pg_class where oid = 'research.subjects'::regclass), 'subjects: row level security on');
select ok((select bool_and(c.relrowsecurity) from pg_inherits i join pg_class c on c.oid = i.inhrelid where i.inhparent = 'research.events'::regclass), 'every partition: row level security on');
select is((select count(*)::int from pg_policies where schemaname = 'research'), 0, 'no policies: nobody but the functions gets in');
select ok((select count(*) from pg_inherits where inhparent = 'research.events'::regclass) >= 9, 'daily partitions made ahead (plus the default one)');
select is((select count(*)::int from pg_indexes where schemaname = 'research' and tablename = 'events'), 1, 'lean: only the primary key (day, id) on events');

-- ---------------------------------------------------------------- phones cannot read or write
select is(testing.one('00000000-0000-0000-0000-00000000e001', $$select count(*) from research.events$$), 'permission denied for schema research', 'a signed-in phone cannot read events');
select is(testing.one(null, $$select count(*) from research.subjects$$), 'permission denied for schema research', 'a phone that is not signed in cannot read research ids');
select is(testing.one('00000000-0000-0000-0000-00000000e001', $$insert into research.events (day, id, type, v, sv, src, ts, tc, tm, session, seq, payload) values (current_date, gen_random_uuid(), 'x.y', 1, 1, 'c', now(), 1, 1, 's', 1, '{}') returning 1$$), 'permission denied for schema research', 'a phone cannot write events');
select is(testing.one('00000000-0000-0000-0000-00000000e001', $$select public.research_ingest('{"events":[]}', 'v1.1.x')$$), 'permission denied for function research_ingest', 'a signed-in phone cannot call the ingest function');
select is(testing.one(null, $$select public.research_ingest('{"events":[]}', 'v1.1.x')$$), 'Not a table server', 'without the recorder signature, refused');
select is(testing.one(null, $$select public.research_export_page('{"from":"2026-01-01","to":"2030-01-01"}', 'v1.1.x')$$), 'Not a table server', 'export needs the signature too');
select is(testing.one(null, $$select public.research_name_map('{}', 'v1.1.x')$$), 'Not a table server', 'so does the name map');
select is(testing.one('00000000-0000-0000-0000-00000000e001', $$select public.research_subjects('{}', 'x')$$), 'permission denied for function research_subjects', 'research ids are not for phones');

-- ---------------------------------------------------------------- ingesting
create temp table b(body text);
insert into b select json_build_object('events', json_agg(json_build_object(
  'id', format('11111111-1111-4111-8111-%s', lpad(n::text, 12, '0')), 'sv', 1, 't', case when n = 1 then 'seat.join' else 'hand.action' end, 'v', 1, 'src', 's',
  'tc', extract(epoch from now()) * 1000, 'tm', n * 10.5, 's', 'srv-session-1', 'q', n, 'd', 'dev-1', 'a', case when n % 2 = 0 then :'dev' end,
  'g', case when n % 2 = 1 then 'gguest123' end, 'tb', 'ABCD', 'gm', '22222222-2222-4222-8222-000000000001', 'h', 3, 'st', 'flop', 'app', 'server:test',
  'ts', extract(epoch from now()) * 1000, 'p', case when n = 1 then json_build_object('pid', 'gguest123', 'name', 'Riya') else json_build_object('a', 'call', 'amount', n * 10, 'samples', json_build_array(1, -2, 3)) end)))::text
  from generate_series(1, 6) n;
select is((select public.research_ingest(body, testing.sign('test-recorder-token', body)) ->> 'inserted' from b), '6', 'a signed batch is stored');
select is((select count(*)::int from research.events), 6, 'six rows');
select is((select public.research_ingest(body, testing.sign('test-recorder-token', body)) ->> 'inserted' from b), '0', 'the same batch again: every event already there, nothing doubled');
select is((select count(*)::int from research.events), 6, 'still six');
select is((select day from research.events limit 1), (now() at time zone 'utc')::date, 'each row is on its own day');
select is((select payload::text from research.events where seq = 2), '{"a" : "call", "amount" : 20, "samples" : [1, -2, 3]}', 'the payload is kept as sent');
select is((select count(*)::int from research.subjects), 3, 'research ids: one account, one guest, one device');
select ok((select bool_and(research_id is not null) from research.subjects), 'each with a random research id');
select is((select kind from research.subjects where key = 'a:' || :'dev'), 'account', 'the account is a subject');
-- bad rows are skipped, good ones in the same batch kept
create temp table bad(body text);
insert into bad values (json_build_object('events', json_build_array(
  json_build_object('id', 'not-a-uuid', 'sv', 1, 't', 'x.y', 'v', 1, 'src', 'c', 'tc', 1, 'tm', 1, 's', 's', 'q', 1, 'p', 1),
  json_build_object('id', '33333333-3333-4333-8333-000000000001', 'sv', 1, 't', 'x.y', 'v', 1, 'src', 'c', 'tc', 1.7e12, 'tm', 1, 's', 's', 'q', 1, 'a', 'nope', 'p', 1),
  json_build_object('id', '33333333-3333-4333-8333-000000000002', 'sv', 1, 't', 'ui.tap', 'v', 1, 'src', 'c', 'tc', 1.7e12, 'tm', 1, 's', 'sess-2', 'q', 1, 'd', 'dev-2', 'p', json_build_object('k', 'x'))))::text);
select is((select public.research_ingest(body, testing.sign('test-recorder-token', body))::text from bad), '{"received" : 3, "inserted" : 1}', 'malformed rows skipped, the good one kept');
select is((select day from research.events where id = '33333333-3333-4333-8333-000000000002'), (now() at time zone 'utc')::date, 'an unbelievable clock (2023) goes on the day it arrived');

-- ---------------------------------------------------------------- archiving
-- (pretend the six rows are 20 days old)
update research.events set day = (now() at time zone 'utc')::date - 20, received_at = now() - interval '20 days' where session = 'srv-session-1';
select is((select public.research_archive_days(x, testing.sign('test-recorder-token', x))::jsonb -> 0 ->> 'rows' from (select '{"keep_days":14}'::text x) s), '6', 'the old day is due for the archive');
select (select public.research_archive_page(x, testing.sign('test-recorder-token', x)) from (select json_build_object('day', (now() at time zone 'utc')::date - 20, 'cutoff', now() - interval '1 minute', 'limit', 4)::text x) s) as page \gset
select is(json_array_length(:'page'::json), 4, 'a page of rows, in id order');
select (select string_agg(r ->> 'id', ',' order by r ->> 'id') from json_array_elements(:'page'::json) r) as ids \gset
select is((select public.research_archive_commit(x, testing.sign('test-recorder-token', x)) ->> 'ok' from (select json_build_object('day', (now() at time zone 'utc')::date - 20, 'cutoff', now() - interval '1 minute',
  'first', split_part(:'ids', ',', 1), 'last', split_part(:'ids', ',', 4), 'rows', 4, 'ids_md5', md5('wrong'), 'key', 'k')::text x) s), 'false', 'a checksum that does not match: nothing deleted');
select is((select count(*)::int from research.events where session = 'srv-session-1'), 6, 'all six still there');
select is((select public.research_archive_commit(x, testing.sign('test-recorder-token', x)) ->> 'deleted' from (select json_build_object('day', (now() at time zone 'utc')::date - 20, 'cutoff', now() - interval '1 minute',
  'first', split_part(:'ids', ',', 1), 'last', split_part(:'ids', ',', 4), 'rows', 4, 'ids_md5', md5(:'ids'), 'key', 'research/day=x/part.ndjson.gz')::text x) s), '4', 'the matching slice is deleted');
select is((select count(*)::int from research.events where session = 'srv-session-1'), 2, 'the rest of the day stays until it is archived');
select is((select rows from research.archive_log), 4, 'and the archive log says what went where');
select is((select public.research_archive_commit(x, testing.sign('test-recorder-token', x)) ->> 'ok' from (select json_build_object('day', (now() at time zone 'utc')::date - 20, 'cutoff', now() - interval '1 minute',
  'first', split_part(:'ids', ',', 1), 'last', split_part(:'ids', ',', 4), 'rows', 4, 'ids_md5', md5(:'ids'), 'key', 'k')::text x) s), 'false', 'committing the same slice twice deletes nothing more');

-- ---------------------------------------------------------------- exporting and upkeep
select is((select json_array_length(public.research_export_page(x, testing.sign('test-recorder-token', x))) from (select json_build_object('from', '2020-01-01', 'to', '2100-01-01')::text x) s), 3, 'the export pages through what is left');
select is((select json_array_length(public.research_subjects(x, testing.sign('test-recorder-token', x))) from (select '{}'::text x) s), 4, 'the research ids, for the export');
select ok((select public.research_name_map(x, testing.sign('test-recorder-token', x))::text from (select '{}'::text x) s) like '%Dev%', 'the private name map has the account name (owner script only)');
select ok((select (public.research_upkeep(x, testing.sign('test-recorder-token', x)) ->> 'made') is not null from (select '{}'::text x) s), 'upkeep makes the coming days');

select * from finish();
rollback;
