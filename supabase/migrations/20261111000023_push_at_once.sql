-- Notifications go out at once.
--
-- What the database queues for phones (a crew table opened, a request to join, approved into a crew, a
-- trophy, a season's end, a new device, the bell's test) waits in private.push_outbox for the Cloudflare
-- worker, which looked every three minutes. Now the database tells the worker the moment something is
-- queued: an HTTP call (pg_net: sent after the transaction commits, never waited for) to the worker's
-- /push/drain, which takes the outbox and sends it. The timed job stays as the safety net (every minute).
-- Nothing here can stop or slow what queued the notification: a failed call is ignored.

do $$ begin
  -- (the local test database has no pg_net: there the trigger simply does nothing)
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net; end if;
end $$;

insert into private.settings values ('push_kick_url', 'https://train-poker-tables.apins-subdomain.workers.dev/push/drain') on conflict do nothing;

create function private.kick_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u text;
begin
  begin
    select value into u from private.settings where key = 'push_kick_url';
    if u is not null and u <> '' and exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
      execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := ''{"content-type":"application/json"}''::jsonb, timeout_milliseconds := 5000)' using u;
    end if;
  exception when others then null;
  end;
  return null;
end $$;

create trigger push_kick after insert on private.push_outbox for each statement execute function private.kick_push();
revoke all on function private.kick_push() from public, anon, authenticated;
