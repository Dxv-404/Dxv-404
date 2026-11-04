-- Research data capture (the crew's agreed research project; see docs/research-data.md).
--
-- Every research event (from the table servers and, through them, from the apps) lands in one table,
-- research.events, partitioned by day. Nothing here is readable or writable by phones: the research schema
-- has no grants for anon or authenticated, every table has row level security on with no policies, and the
-- only ways in are the functions below, each of which needs a table server's signature (the recorder key,
-- see private.recorder_ok). Additive only: nothing existing is changed.
--
--   research.events     one row per event (envelope columns + the payload as compact JSON), partitioned by day
--   research.subjects   a stable random research id for every account, guest and device seen
--   research.archive_log  every archived slice: which rows, how many, their checksum, where the file went
--
-- Old days are archived by the table worker's daily job to the R2 bucket as gzipped NDJSON and only then
-- deleted here (research_archive_* below): the database keeps about two weeks, the archive keeps everything.

create schema if not exists research;
revoke all on schema research from public, anon, authenticated;

create table research.events (
  day date not null,                -- UTC day of the event (its own clock; see research_ingest)
  id uuid not null,                 -- event id: the same on every resend, so a resend is kept once
  type text not null,
  v smallint not null,              -- payload version
  sv smallint not null,             -- envelope schema version
  src "char" not null,              -- c app, s table server, w service worker
  ts timestamptz not null,          -- server clock: received by the ingestion layer, or when a server event happened
  tc double precision not null,     -- recorder wall clock, ms since 1970
  tm double precision not null,     -- recorder monotonic clock, ms
  session text not null,
  seq integer not null,
  device text,
  account uuid,
  guest text,
  table_code text,
  game_id uuid,
  hand_no integer,
  street text,
  app text,
  payload json not null,            -- json (not jsonb): kept exactly as sent, and smaller for sample arrays
  received_at timestamptz not null default now(),
  primary key (day, id)
) partition by range (day);
-- days with no partition of their own (yet) land here, so nothing is ever refused for want of a partition
create table research.events_default partition of research.events default;

create table research.subjects (
  key text primary key,             -- 'a:<account uuid>', 'g:<guest id>' or 'd:<device id>'
  kind text not null check (kind in ('account', 'guest', 'device')),
  research_id uuid not null unique default gen_random_uuid(),
  first_seen timestamptz not null default now()
);

create table research.archive_log (
  id bigint generated always as identity primary key,
  day date not null,
  cutoff timestamptz not null,
  first_id uuid not null,
  last_id uuid not null,
  rows integer not null,
  ids_sha256 text not null,
  object_key text not null,
  deleted integer not null,
  at timestamptz not null default now()
);

alter table research.events enable row level security;
alter table research.events_default enable row level security;
alter table research.subjects enable row level security;
alter table research.archive_log enable row level security;
revoke all on all tables in schema research from public, anon, authenticated;

-- A partition per day, made ahead of time (a day that already has rows in the default partition is left
-- there: they are archived from there just the same).
create function research.ensure_partitions(p_from date, p_days int) returns int
language plpgsql security definer set search_path = '' as $$
declare d date; n int := 0; name text;
begin
  for i in 0 .. greatest(p_days, 1) - 1 loop
    d := p_from + i;
    name := 'events_' || to_char(d, 'YYYYMMDD');
    if to_regclass('research.' || name) is null and not exists (select 1 from research.events_default where day = d) then
      execute format('create table research.%I partition of research.events for values from (%L) to (%L)', name, d, d + 1);
      execute format('alter table research.%I enable row level security', name);
      execute format('revoke all on research.%I from public, anon, authenticated', name);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function research.ensure_partitions(date, int) from public, anon, authenticated;
select research.ensure_partitions((now() at time zone 'utc')::date - 1, 9);

-- The day an event belongs to: its own clock when that is believable (within 30 days back, 1 day ahead),
-- else the day it arrived. A resend carries the same clock, so it lands on the same day and is dropped.
create function research.day_of(tc double precision) returns date
language sql stable set search_path = '' as $$
  select case when tc between extract(epoch from now() - interval '30 days') * 1000 and extract(epoch from now() + interval '1 day') * 1000
    then (to_timestamp(tc / 1000) at time zone 'utc')::date else (now() at time zone 'utc')::date end
$$;

-- ---------------------------------------------------------------- writing
-- A batch of events from a table server: {"events": [<envelope>, ...]} (see packages/research/src/schema.ts).
-- Rows that do not have the shape are skipped (the server checked them already); repeats are dropped.
create function public.research_ingest(p_body text, p_sig text) returns json
language plpgsql security definer set search_path = '' as $$
declare n int; total int; evs json; uu text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  evs := p_body::json -> 'events';
  if evs is null or json_typeof(evs) <> 'array' then raise exception 'No events' using errcode = '22023'; end if;
  total := json_array_length(evs);
  insert into research.events (day, id, type, v, sv, src, ts, tc, tm, session, seq, device, account, guest, table_code, game_id, hand_no, street, app, payload)
  select research.day_of((e ->> 'tc')::double precision), (e ->> 'id')::uuid, e ->> 't', (e ->> 'v')::smallint, (e ->> 'sv')::smallint, (e ->> 'src')::"char",
    coalesce(to_timestamp((e ->> 'ts')::double precision / 1000), now()), (e ->> 'tc')::double precision, (e ->> 'tm')::double precision,
    e ->> 's', (e ->> 'q')::int, e ->> 'd', (e ->> 'a')::uuid, e ->> 'g', e ->> 'tb', (e ->> 'gm')::uuid, (e ->> 'h')::int, e ->> 'st', e ->> 'app', coalesce(e -> 'p', 'null'::json)
  from json_array_elements(evs) e
  where (e ->> 'id') ~* uu and coalesce(e ->> 'a', '00000000-0000-0000-0000-000000000000') ~* uu and coalesce(e ->> 'gm', '00000000-0000-0000-0000-000000000000') ~* uu
    and (e ->> 't') ~ '^[a-z][a-z0-9_.]{1,39}$' and (e ->> 's') is not null and (e ->> 'src') in ('c', 's', 'w')
    and (e ->> 'v') ~ '^[0-9]{1,4}$' and (e ->> 'sv') ~ '^[0-9]{1,4}$' and (e ->> 'q') ~ '^[0-9]{1,10}$' and coalesce(e ->> 'h', '0') ~ '^[0-9]{1,9}$'
    and (e ->> 'tc') ~ '^-?[0-9.eE+]+$' and (e ->> 'tm') ~ '^-?[0-9.eE+]+$' and coalesce(e ->> 'ts', '0') ~ '^-?[0-9.eE+]+$'
  on conflict do nothing;
  get diagnostics n = row_count;
  -- a research id for every account, guest and device seen (made once, never changed)
  insert into research.subjects (key, kind)
  select distinct k, kind from (
    select 'a:' || (e ->> 'a') k, 'account' kind from json_array_elements(evs) e where (e ->> 'a') ~* uu
    union select 'g:' || (e ->> 'g'), 'guest' from json_array_elements(evs) e where length(e ->> 'g') between 1 and 64
    union select 'd:' || (e ->> 'd'), 'device' from json_array_elements(evs) e where length(e ->> 'd') between 1 and 64
  ) s on conflict do nothing;
  return json_build_object('received', total, 'inserted', n);
end $$;

-- ---------------------------------------------------------------- archiving (the worker's daily job)
-- Days with rows older than p_keep_days (and, for the job's own checks, how many rows each).
create function public.research_archive_days(p_body text, p_sig text) returns json
language plpgsql security definer set search_path = '' as $$
declare b json := p_body::json; keep int; out json;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  keep := greatest(coalesce((b ->> 'keep_days')::int, 14), 1);
  perform research.ensure_partitions((now() at time zone 'utc')::date - 1, 9);
  select coalesce(json_agg(json_build_object('day', day, 'rows', n) order by day), '[]'::json) into out
  from (select day, count(*) n from research.events where day < (now() at time zone 'utc')::date - keep group by day) s;
  return out;
end $$;

-- One page of a day's rows (received before the cutoff), in id order, after a given id.
create function public.research_archive_page(p_body text, p_sig text) returns json
language plpgsql security definer set search_path = '' as $$
declare b json := p_body::json; out json;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  select coalesce(json_agg(r order by r.id), '[]'::json) into out from (
    select e.id, e.day, e.type, e.v, e.sv, e.src, e.ts, e.tc, e.tm, e.session, e.seq, e.device, e.account, e.guest, e.table_code, e.game_id, e.hand_no, e.street, e.app, e.payload, e.received_at
    from research.events e
    where e.day = (b ->> 'day')::date and e.received_at <= (b ->> 'cutoff')::timestamptz
      and (b ->> 'after' is null or e.id > (b ->> 'after')::uuid)
    order by e.id limit least(greatest(coalesce((b ->> 'limit')::int, 2000), 1), 10000)
  ) r;
  return out;
end $$;

-- Delete a slice that is safely in the archive: only if the rows are exactly the ones archived (same count,
-- same sha256 over their ids in order, joined with commas); otherwise nothing is deleted and the job tries again another day.
create function public.research_archive_commit(p_body text, p_sig text) returns json
language plpgsql security definer set search_path = '' as $$
declare b json := p_body::json; d date; cut timestamptz; f uuid; l uuid; n int; h text; deleted int;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  d := (b ->> 'day')::date; cut := (b ->> 'cutoff')::timestamptz; f := (b ->> 'first')::uuid; l := (b ->> 'last')::uuid;
  select count(*), encode(sha256(convert_to(coalesce(string_agg(id::text, ',' order by id), ''), 'UTF8')), 'hex') into n, h
  from research.events where day = d and received_at <= cut and id between f and l;
  if n <> (b ->> 'rows')::int or h <> (b ->> 'ids_sha256') then
    return json_build_object('ok', false, 'rows', n, 'ids_sha256', h);
  end if;
  delete from research.events where day = d and received_at <= cut and id between f and l;
  get diagnostics deleted = row_count;
  insert into research.archive_log (day, cutoff, first_id, last_id, rows, ids_sha256, object_key, deleted)
  values (d, cut, f, l, n, h, coalesce(b ->> 'key', ''), deleted);
  return json_build_object('ok', true, 'deleted', deleted);
end $$;

-- Upkeep: partitions for the coming days, and empty partitions of archived days dropped (only empty ones).
create function public.research_upkeep(p_body text, p_sig text) returns json
language plpgsql security definer set search_path = '' as $$
declare made int; dropped int := 0; r record; empty boolean;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  made := research.ensure_partitions((now() at time zone 'utc')::date - 1, 9);
  for r in select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid join pg_class p on p.oid = i.inhparent
           join pg_namespace n on n.oid = p.relnamespace where n.nspname = 'research' and p.relname = 'events' and c.relname ~ '^events_[0-9]{8}$'
             and to_date(substr(c.relname, 8), 'YYYYMMDD') < (now() at time zone 'utc')::date - 7 loop
    execute format('select not exists (select 1 from research.%I)', r.relname) into empty;
    if empty then execute format('drop table research.%I', r.relname); dropped := dropped + 1; end if;
  end loop;
  return json_build_object('made', made, 'dropped', dropped);
end $$;

-- ---------------------------------------------------------------- exporting (the owner's script)
-- Rows for a date range, a page at a time (by day, then id).
create function public.research_export_page(p_body text, p_sig text) returns json
language plpgsql security definer set search_path = '' as $$
declare b json := p_body::json; out json;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  select coalesce(json_agg(r order by r.day, r.id), '[]'::json) into out from (
    select e.id, e.day, e.type, e.v, e.sv, e.src, e.ts, e.tc, e.tm, e.session, e.seq, e.device, e.account, e.guest, e.table_code, e.game_id, e.hand_no, e.street, e.app, e.payload, e.received_at
    from research.events e
    where e.day between (b ->> 'from')::date and (b ->> 'to')::date
      and (b ->> 'after_day' is null or (e.day, e.id) > ((b ->> 'after_day')::date, (b ->> 'after_id')::uuid))
    order by e.day, e.id limit least(greatest(coalesce((b ->> 'limit')::int, 2000), 1), 10000)
  ) r;
  return out;
end $$;

-- The research ids (no names): key -> research id.
create function public.research_subjects(p_body text, p_sig text) returns json
language plpgsql security definer set search_path = '' as $$
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  return (select coalesce(json_agg(json_build_object('key', key, 'kind', kind, 'rid', research_id, 'first_seen', first_seen) order by key), '[]'::json) from research.subjects);
end $$;

-- The private name map (only for the owner's script, written to a git-ignored local file): research id ->
-- the account's name today, and every name a seat was given at a table (from seat.join events still here).
create function public.research_name_map(p_body text, p_sig text) returns json
language plpgsql security definer set search_path = '' as $$
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  return (select coalesce(json_agg(x), '[]'::json) from (
    select s.research_id rid, s.kind, a.name account_name,
      (select coalesce(json_agg(distinct e.payload ->> 'name'), '[]'::json) from research.events e
        where e.type = 'seat.join' and ((s.kind = 'account' and e.account::text = substr(s.key, 3)) or (s.kind = 'guest' and e.guest = substr(s.key, 3)))) table_names
    from research.subjects s left join public.accounts a on s.kind = 'account' and a.id::text = substr(s.key, 3)
    where s.kind in ('account', 'guest')
  ) x);
end $$;

-- How full the research store is (bytes, rows), for the archive job's log.
create function public.research_size(p_body text, p_sig text) returns json
language plpgsql security definer set search_path = '' as $$
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  return json_build_object(
    'events_bytes', (select coalesce(sum(pg_total_relation_size(i.inhrelid)), 0) from pg_inherits i where i.inhparent = 'research.events'::regclass),
    'events_rows_estimate', (select coalesce(sum(c.reltuples), 0)::bigint from pg_inherits i join pg_class c on c.oid = i.inhrelid where i.inhparent = 'research.events'::regclass),
    'database_bytes', pg_database_size(current_database()));
end $$;

revoke all on function public.research_ingest(text, text), public.research_archive_days(text, text), public.research_archive_page(text, text),
  public.research_archive_commit(text, text), public.research_upkeep(text, text), public.research_export_page(text, text),
  public.research_subjects(text, text), public.research_name_map(text, text), public.research_size(text, text) from public, anon, authenticated;
-- the table servers call with the public key; the signature is what makes it a table server
grant execute on function public.research_ingest(text, text), public.research_archive_days(text, text), public.research_archive_page(text, text),
  public.research_archive_commit(text, text), public.research_upkeep(text, text), public.research_export_page(text, text),
  public.research_subjects(text, text), public.research_name_map(text, text), public.research_size(text, text) to anon;
revoke all on function research.day_of(double precision) from public, anon, authenticated;
