-- Only for the local test database: the pieces of a Supabase project the migrations rely on.
-- (A real Supabase project already has all of this.)
create schema if not exists extensions;
create schema if not exists auth;
do $$ begin
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
create extension if not exists pgtap;
create extension if not exists pgcrypto with schema extensions;

-- Test helper: run a query as a signed-in phone (auth user u) and return its rows as JSON, or
-- {"error": message, "code": sqlstate} if it fails. Runs with the phone's rights (role authenticated).
create schema if not exists testing;
create or replace function testing.as_phone(u uuid, q text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
  execute 'set local role ' || case when u is null then 'anon' else 'authenticated' end;
  begin
    execute 'with x as (' || q || ') select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from x' into r;
  exception when others then
    r := jsonb_build_object('error', sqlerrm, 'code', sqlstate);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return r;
end $$;
-- a recorder call's signature, as the table servers make it (see private.recorder_ok)
create or replace function testing.sign(token text, body text) returns text language sql as $$
  select 'v1.' || t || '.' || encode(extensions.hmac(t || '.' || body, encode(extensions.digest(token, 'sha256'), 'hex'), 'sha256'), 'hex')
  from (select ((extract(epoch from now()) * 1000)::bigint)::text t) x
$$;
-- first value of the first row, as text
create or replace function testing.one(u uuid, q text) returns text language sql as $$
  select coalesce(r -> 0 ->> (select k from jsonb_object_keys(r -> 0) k limit 1), r ->> 'error')
  from (select testing.as_phone(u, q) r) s
$$;
