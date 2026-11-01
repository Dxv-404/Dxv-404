-- Phase 7: push notifications, Report a problem and error reports, cleaning up empty accounts, usage warnings.

-- ---------------------------------------------------------------- push subscriptions
-- One row per phone that allowed notifications. prefs: which kinds it wants (missing = yes):
--   turn (your turn while the app is in the background), crewTable (a crew table started),
--   crew (you were approved into a crew), trophies (a trophy, a season's end).
create table public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) <= 600),
  account_id uuid not null references public.accounts(id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 80 and 100),
  auth text not null check (char_length(auth) between 16 and 40),
  prefs jsonb not null default '{}'::jsonb check (pg_column_size(prefs) < 500),
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (account_id);
alter table public.push_subscriptions enable row level security; -- no policies: only the functions below
revoke all on public.push_subscriptions from anon, authenticated;

create function public.save_push(p_endpoint text, p_p256dh text, p_auth text, p_prefs jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := private.need_me(); p jsonb := '{}'::jsonb; k text;
begin
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)/'
     or char_length(p_endpoint) > 600 or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}$' or p_auth !~ '^[A-Za-z0-9_-]{16,40}$' then
    raise exception 'That is not a push subscription' using errcode = '22023';
  end if;
  foreach k in array array['turn', 'crewTable', 'crew', 'trophies'] loop
    if jsonb_typeof(p_prefs -> k) = 'boolean' then p := p || jsonb_build_object(k, p_prefs -> k); end if;
  end loop;
  -- a phone that switched accounts takes its subscription with it
  insert into public.push_subscriptions (endpoint, account_id, p256dh, auth, prefs) values (p_endpoint, me, p_p256dh, p_auth, p)
    on conflict (endpoint) do update set account_id = me, p256dh = excluded.p256dh, auth = excluded.auth, prefs = excluded.prefs;
  -- at most 5 phones an account
  delete from public.push_subscriptions s where s.account_id = me and s.endpoint in
    (select x.endpoint from public.push_subscriptions x where x.account_id = me order by x.created_at desc offset 5);
end $$;

create function public.remove_push(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and account_id = private.me();
$$;

create function public.my_push(p_endpoint text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select prefs from public.push_subscriptions where endpoint = p_endpoint and account_id = private.me();
$$;

-- Table servers: who to push for a turn or a crew table (only table servers can sign the call)
create function public.push_targets(p_body text, p_sig text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b jsonb; k text; c uuid;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  b := p_body::jsonb; k := b ->> 'kind';
  if k not in ('turn', 'crewTable') then raise exception 'Unknown push' using errcode = '22023'; end if;
  c := nullif(b ->> 'crew', '')::uuid;
  return coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) from (
    select s.* from public.push_subscriptions s
    where coalesce((s.prefs ->> k)::boolean, true)
      and (case when k = 'turn' then s.account_id::text in (select jsonb_array_elements_text(b -> 'accounts'))
                else c is not null and exists (select 1 from public.crew_members m where m.crew_id = c and m.account_id = s.account_id and m.status = 'active') end)
      and s.account_id::text not in (select jsonb_array_elements_text(coalesce(b -> 'except', '[]'::jsonb)))
    limit 200) s), '[]'::jsonb);
end $$;

create function public.drop_push(p_body text, p_sig text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  delete from public.push_subscriptions where endpoint in (select jsonb_array_elements_text(p_body::jsonb -> 'endpoints'));
end $$;

-- ---------------------------------------------------------------- pushes the database queues
create table private.push_outbox (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null check (kind in ('crew', 'trophies')),
  title text not null, body text not null, url text not null default '/', tag text not null,
  dedupe text not null,
  at timestamptz not null default now(),
  sent_at timestamptz,
  unique (account_id, dedupe)
);
create index on private.push_outbox (at) where sent_at is null;

create function private.queue_push(a uuid, k text, t text, b text, tag text, d text) returns void
language sql security definer set search_path = '' as $$
  insert into private.push_outbox (account_id, kind, title, body, tag, dedupe) values (a, k, t, b, tag, d) on conflict do nothing;
$$;

create function private.on_member_approved() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'active' then
    perform private.queue_push(new.account_id, 'crew', 'You’re in', format('You joined %s. Your games there count for its league.', (select name from public.crews where id = new.crew_id)), 'crew-' || new.crew_id, 'joined:' || new.crew_id);
  end if;
  return new;
end $$;
create trigger push_member_approved after update of status on public.crew_members for each row execute function private.on_member_approved();

create function private.on_trophy() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.account_id is not null and new.at > now() - interval '1 hour' then -- (not for trophies a backup restore puts back)
    perform private.queue_push(new.account_id, 'trophies', 'Trophy won',
      case new.kind when 'season_winner' then 'You won the season.' when 'iron_chair' then 'The iron chair: you played the most hands this season.'
        when 'royal_flush' then 'A royal flush!' when 'straight_flush' then 'A straight flush!' when 'four_of_a_kind' then 'Four of a kind!'
        else 'The comeback: you won from almost nothing.' end,
      'trophy', 'trophy:' || new.kind || ':' || coalesce(new.season_id::text, new.game_id::text, '') || ':' || coalesce(new.hand_no, 0));
  end if;
  return new;
end $$;
create trigger push_trophy after insert on public.trophies for each row execute function private.on_trophy();

create function private.on_season_closed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m record; cname text := (select name from public.crews where id = new.crew_id);
begin
  if old.closed_at is null and new.closed_at is not null then
    for m in select account_id from public.crew_members where crew_id = new.crew_id and status = 'active' loop
      perform private.queue_push(m.account_id, 'trophies', 'Season over', format('%s in %s has ended. See the final standings.', new.name, cname), 'season-' || new.id, 'season:' || new.id);
    end loop;
  end if;
  return new;
end $$;
create trigger push_season_closed after update of closed_at on public.seasons for each row execute function private.on_season_closed();

-- Cloudflare's job (every few minutes) takes what is waiting and sends it
create function public.take_push_outbox(p_body text, p_sig text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare out jsonb;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  with due as (
    select id from private.push_outbox where sent_at is null and at > now() - interval '1 day' order by id limit 100 for update skip locked
  ), marked as (
    update private.push_outbox o set sent_at = now() from due where o.id = due.id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'title', m.title, 'body', m.body, 'url', m.url, 'tag', m.tag)), '[]'::jsonb)
    into out
  from marked m join public.push_subscriptions s on s.account_id = m.account_id and coalesce((s.prefs ->> m.kind)::boolean, true);
  return out;
end $$;

-- ---------------------------------------------------------------- Report a problem, and errors the app hits
create table private.problem_reports (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('report', 'error')),
  account_id uuid references public.accounts(id) on delete set null,
  auth_user uuid,
  message text not null check (char_length(message) <= 2000),
  context jsonb not null default '{}'::jsonb check (pg_column_size(context) < 8000),
  app_version text check (char_length(app_version) <= 40),
  fingerprint text,
  count int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  day date not null default current_date
);
create unique index problem_reports_error_once_a_day on private.problem_reports (fingerprint, day) where kind = 'error';
create index on private.problem_reports (first_at);

create function public.report_problem(p_kind text, p_message text, p_context jsonb default '{}'::jsonb, p_version text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare fp text; today int;
begin
  if p_kind not in ('report', 'error') or coalesce(trim(p_message), '') = '' then raise exception 'Say what happened' using errcode = '22023'; end if;
  if pg_column_size(coalesce(p_context, '{}'::jsonb)) >= 8000 then p_context := jsonb_build_object('note', 'context too large'); end if;
  if p_kind = 'error' then
    fp := md5(left(p_message, 300) || coalesce(p_version, ''));
    update private.problem_reports set count = count + 1, last_at = now() where kind = 'error' and fingerprint = fp and day = current_date;
    if found then return; end if;
    if (select count(*) from private.problem_reports where kind = 'error' and first_at > now() - interval '1 day') >= 500 then return; end if;
  else
    -- a person writes a few reports a day; the whole app takes a few hundred
    if auth.uid() is not null and (select count(*) from private.problem_reports where kind = 'report' and auth_user = auth.uid() and first_at > now() - interval '1 day') >= 10 then
      raise exception 'Thanks, that is plenty for today' using errcode = 'P0001';
    end if;
    if (select count(*) from private.problem_reports where kind = 'report' and first_at > now() - interval '1 day') >= 300 then
      raise exception 'Reports are full for today. Please try tomorrow.' using errcode = 'P0001';
    end if;
  end if;
  insert into private.problem_reports (kind, account_id, auth_user, message, context, app_version, fingerprint)
    values (p_kind, private.me(), auth.uid(), left(p_message, 2000), coalesce(p_context, '{}'::jsonb), left(p_version, 40), fp)
    on conflict do nothing;
end $$;

-- ---------------------------------------------------------------- usage and daily upkeep
-- The free database holds 500 MB. Daily upkeep keeps the size; past 80% the app tells crew owners and admins.
create function public.service_notice() returns text
language sql stable security definer set search_path = '' as $$
  select case when coalesce((select value::bigint from private.settings where key = 'db_bytes'), 0) > 400 * 1024 * 1024
    and exists (select 1 from public.crew_members where account_id = private.me() and role in ('owner', 'admin'))
    then 'The free database is over 80% full. Old replays are trimmed after 90 days; ask Dev to look at storage.' end
$$;

create or replace function public.daily_upkeep(p_body text, p_sig text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare closed int; pruned int; q record; finished int := 0; emptied int := 0; bytes bigint; logins uuid[];
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  closed := public.close_due_seasons(p_body, p_sig);
  update public.hands h set record = null
    where h.record is not null and h.played_at < now() - interval '90 days'
      and not exists (select 1 from public.trophies t where t.game_id = h.game_id and t.hand_no = h.hand_no);
  get diagnostics pruned = row_count;
  delete from public.hand_cards_private c using public.hands h
    where h.game_id = c.game_id and h.hand_no = c.hand_no and h.played_at < now() - interval '90 days'
      and not exists (select 1 from public.trophies t where t.game_id = h.game_id and t.hand_no = h.hand_no);
  delete from private.hand_records r using public.hands h
    where h.game_id = r.game_id and h.hand_no = r.hand_no and h.played_at < now() - interval '90 days'
      and not exists (select 1 from public.trophies t where t.game_id = h.game_id and t.hand_no = h.hand_no);
  for q in select id from public.rescue_requests where status = 'approved' loop
    if private.finish_rescue_if_due(q.id) = 'done' then finished := finished + 1; end if;
  end loop;
  delete from private.recovery_attempts where at < now() - interval '1 day';
  delete from private.push_outbox where at < now() - interval '7 days';
  delete from private.problem_reports where first_at < now() - interval '180 days';
  -- accounts nobody ever used (no games, no crews, no rescue) and not opened for 90 days are removed,
  -- with their anonymous logins
  for q in select a.id from public.accounts a
    where a.created_at < now() - interval '90 days'
      and not exists (select 1 from public.game_players g where g.account_id = a.id)
      and not exists (select 1 from public.crew_members m where m.account_id = a.id)
      and not exists (select 1 from public.rescue_requests r where r.target_account = a.id or r.requester_account = a.id)
      and not exists (select 1 from public.trophies t where t.account_id = a.id)
      and not exists (select 1 from public.account_logins l where l.account_id = a.id and l.last_seen > now() - interval '90 days')
    limit 500 loop
    begin
      logins := array(select auth_user from public.account_logins where account_id = q.id);
      delete from public.accounts where id = q.id;
      begin
        delete from auth.users u where u.id = any(logins) and coalesce(u.is_anonymous, false);
      exception when others then null; -- (no auth schema in local tests)
      end;
      emptied := emptied + 1;
    exception when others then null; -- something still points at it: keep it
    end;
  end loop;
  bytes := pg_database_size(current_database());
  insert into private.settings (key, value) values ('db_bytes', bytes::text) on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('seasons_closed', closed, 'replays_pruned', pruned, 'rescues_finished', finished, 'accounts_removed', emptied, 'db_bytes', bytes);
end $$;

-- ---------------------------------------------------------------- rights
revoke all on function private.queue_push(uuid, text, text, text, text, text), private.on_member_approved(), private.on_trophy(), private.on_season_closed()
  from public, anon, authenticated;
revoke all on function public.save_push(text, text, text, jsonb), public.remove_push(text), public.my_push(text), public.push_targets(text, text),
  public.drop_push(text, text), public.take_push_outbox(text, text), public.report_problem(text, text, jsonb, text), public.service_notice(),
  public.daily_upkeep(text, text) from public, anon, authenticated;
grant execute on function public.save_push(text, text, text, jsonb), public.remove_push(text), public.my_push(text), public.service_notice() to authenticated;
grant execute on function public.push_targets(text, text), public.drop_push(text, text), public.take_push_outbox(text, text), public.daily_upkeep(text, text) to anon;
grant execute on function public.report_problem(text, text, jsonb, text) to anon, authenticated;

create or replace function private.backup_tables() returns text[] language sql immutable set search_path = '' as $$
  select array['private.settings', 'public.accounts', 'public.account_logins', 'private.recovery_codes', 'public.crews', 'public.crew_members',
    'public.crew_invites', 'public.rescue_requests', 'public.crew_audit', 'public.seasons', 'public.games', 'public.game_players',
    'public.hands', 'public.hand_players', 'public.hand_cards_private', 'private.hand_records', 'public.trophies', 'public.result_changes',
    'public.offline_confirmations', 'public.push_subscriptions', 'private.problem_reports']
$$;
