-- Phase 4: games, hands, history, league (three views), seasons in India time, trophies, admin fixes.
--
-- Results come only from table servers, never typed in by phones. A table server signs each call with a
-- shared key (private.settings 'recorder_key'); phones cannot produce that signature. Every call is
-- idempotent: the same hand or the same game end recorded twice is stored once.

insert into private.settings values ('recorder_key', encode(extensions.gen_random_bytes(32), 'hex')) on conflict do nothing;

-- ---------------------------------------------------------------- tables
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews(id) on delete cascade,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  closed_at timestamptz,
  unique (crew_id, starts_at)
);

create table public.games (
  id uuid primary key,
  crew_id uuid references public.crews(id) on delete set null,
  season_id uuid references public.seasons(id) on delete set null,
  table_code text not null,
  server text not null check (server in ('oracle', 'cloudflare', 'host', 'test')),
  casual boolean not null default false,
  start_stack int not null check (start_stack > 0),
  big_blind int not null check (big_blind > 0),
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null default 'live' check (status in ('live', 'ended', 'void')),
  void_reason text,
  hands int not null default 0
);
create index on public.games (crew_id, ended_at desc);
create index on public.games (season_id);

-- One row per player per game. player_key is the seat id at the table: an account id for signed-in
-- players, or a guest id (guests have no history or league).
create table public.game_players (
  game_id uuid not null references public.games(id) on delete cascade,
  player_key text not null,
  account_id uuid references public.accounts(id) on delete set null,
  name text not null,
  buyins int not null default 0,
  final_chips int,
  net int,
  bb_won numeric(12, 2),
  place int,
  points int,
  min_stack int,
  hands int not null default 0,
  vpip int not null default 0,
  pfr int not null default 0,
  showdowns int not null default 0,
  showdowns_won int not null default 0,
  biggest_pot int not null default 0,
  best_hand int,
  primary key (game_id, player_key)
);
create index on public.game_players (account_id);

create table public.hands (
  game_id uuid not null references public.games(id) on delete cascade,
  hand_no int not null check (hand_no > 0),
  played_at timestamptz not null,
  deck_commit text not null,
  pot int not null check (pot >= 0),
  record jsonb not null,
  primary key (game_id, hand_no)
);

create table public.hand_players (
  game_id uuid not null,
  hand_no int not null,
  player_key text not null,
  account_id uuid references public.accounts(id) on delete set null,
  net int not null,
  vpip boolean not null default false,
  pfr boolean not null default false,
  showdown boolean not null default false,
  won boolean not null default false,
  best_hand int,
  primary key (game_id, hand_no, player_key),
  foreign key (game_id, hand_no) references public.hands(game_id, hand_no) on delete cascade
);
create index on public.hand_players (account_id);

create table public.trophies (
  id bigint generated always as identity primary key,
  account_id uuid references public.accounts(id) on delete cascade,
  crew_id uuid references public.crews(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete cascade,
  game_id uuid references public.games(id) on delete cascade,
  hand_no int,
  kind text not null check (kind in ('season_winner', 'iron_chair', 'royal_flush', 'straight_flush', 'four_of_a_kind', 'comeback')),
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create unique index trophies_once on public.trophies (kind, coalesce(game_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(hand_no, 0), coalesce(season_id, '00000000-0000-0000-0000-000000000000'::uuid), account_id);
create index on public.trophies (account_id);
create index on public.trophies (crew_id);

-- Every admin change to a result, with who and why, visible to the crew.
create table public.result_changes (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  actor uuid references public.accounts(id) on delete set null,
  what text not null,
  reason text not null check (char_length(reason) between 3 and 300),
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index on public.result_changes (game_id);

-- ---------------------------------------------------------------- helpers
create function private.recorder_ok(body text, sig text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(encode(extensions.hmac(body, (select value from private.settings where key = 'recorder_key'), 'sha256'), 'hex') = lower(sig), false)
$$;

create function private.can_see_game(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.game_players gp where gp.game_id = g and gp.account_id = private.me())
      or exists (select 1 from public.games x where x.id = g and x.crew_id is not null and private.is_member(x.crew_id))
$$;

-- The season (a calendar quarter in India time) that contains a moment; made on first use.
create function private.season_for(c uuid, at timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s timestamptz; e timestamptz; id uuid;
begin
  s := (date_trunc('quarter', at at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata';
  e := (date_trunc('quarter', at at time zone 'Asia/Kolkata') + interval '3 months') at time zone 'Asia/Kolkata';
  select seasons.id into id from public.seasons where crew_id = c and starts_at = s;
  if id is null then
    insert into public.seasons (crew_id, name, starts_at, ends_at)
      values (c, to_char(s at time zone 'Asia/Kolkata', 'Mon') || '–' || to_char((e - interval '1 day') at time zone 'Asia/Kolkata', 'Mon YYYY'), s, e)
      on conflict (crew_id, starts_at) do nothing returning seasons.id into id;
    if id is null then select seasons.id into id from public.seasons where crew_id = c and starts_at = s; end if;
  end if;
  return id;
end $$;

-- Places (1 = most won; equal nets share a place), big blinds won, points 10/7/5/3/1 and 1 for playing.
create function private.score_game(g uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare bb int := (select big_blind from public.games where id = g);
begin
  update public.game_players p set
    net = p.final_chips - p.buyins,
    bb_won = round((p.final_chips - p.buyins)::numeric / bb, 2)
  where p.game_id = g and p.final_chips is not null;
  update public.game_players p set place = r.place, points = case r.place when 1 then 10 when 2 then 7 when 3 then 5 when 4 then 3 when 5 then 1 else 1 end
  from (select player_key, rank() over (order by net desc) as place from public.game_players where game_id = g and net is not null) r
  where p.game_id = g and p.player_key = r.player_key;
  -- the per-game stats come from the hands themselves
  update public.game_players p set
    hands = s.hands, vpip = s.vpip, pfr = s.pfr, showdowns = s.showdowns, showdowns_won = s.sd_won,
    biggest_pot = s.biggest, best_hand = s.best
  from (
    select hp.player_key, count(*)::int hands, count(*) filter (where hp.vpip)::int vpip, count(*) filter (where hp.pfr)::int pfr,
      count(*) filter (where hp.showdown)::int showdowns, count(*) filter (where hp.showdown and hp.won)::int sd_won,
      coalesce(max(h.pot) filter (where hp.won), 0)::int biggest, max(hp.best_hand) best
    from public.hand_players hp join public.hands h using (game_id, hand_no)
    where hp.game_id = g group by hp.player_key
  ) s
  where p.game_id = g and p.player_key = s.player_key;
end $$;

-- ---------------------------------------------------------------- recording (table servers only)
-- body is the exact JSON text the server signed:
-- {game:{id,crew,table,server,casual,startStack,bigBlind,startedAt}, hand:{no,playedAt,deckCommit,pot,record,
--  players:[{key,account,name,net,vpip,pfr,showdown,won,bestHand}]}}
create function public.record_hand(p_body text, p_sig text) returns text
language plpgsql security definer set search_path = '' as $$
declare b jsonb; g jsonb; h jsonb; gid uuid; hno int; st text; p jsonb; acc uuid; c uuid; inserted boolean;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  b := p_body::jsonb; g := b -> 'game'; h := b -> 'hand';
  gid := (g ->> 'id')::uuid; hno := (h ->> 'no')::int;
  if (select coalesce(sum((x ->> 'net')::int), 1) from jsonb_array_elements(h -> 'players') x) <> 0 then
    raise exception 'Chips do not add up in hand %', hno using errcode = '22023';
  end if;
  c := nullif(g ->> 'crew', '')::uuid;
  if c is not null and not exists (select 1 from public.crews where id = c) then c := null; end if;
  insert into public.games (id, crew_id, table_code, server, casual, start_stack, big_blind, started_at)
    values (gid, c, g ->> 'table', g ->> 'server', coalesce((g ->> 'casual')::boolean, false), (g ->> 'startStack')::int, (g ->> 'bigBlind')::int, (g ->> 'startedAt')::timestamptz)
    on conflict (id) do nothing;
  select status into st from public.games where id = gid for update;
  if st <> 'live' then return 'game over'; end if;
  insert into public.hands (game_id, hand_no, played_at, deck_commit, pot, record)
    values (gid, hno, (h ->> 'playedAt')::timestamptz, h ->> 'deckCommit', (h ->> 'pot')::int, h -> 'record')
    on conflict do nothing returning true into inserted;
  if inserted is null then return 'duplicate'; end if;
  for p in select * from jsonb_array_elements(h -> 'players') loop
    acc := nullif(p ->> 'account', '')::uuid;
    if acc is not null and not exists (select 1 from public.accounts where id = acc) then acc := null; end if;
    insert into public.game_players (game_id, player_key, account_id, name) values (gid, p ->> 'key', acc, p ->> 'name')
      on conflict (game_id, player_key) do update set name = excluded.name;
    insert into public.hand_players (game_id, hand_no, player_key, account_id, net, vpip, pfr, showdown, won, best_hand)
      values (gid, hno, p ->> 'key', acc, (p ->> 'net')::int, coalesce((p ->> 'vpip')::boolean, false), coalesce((p ->> 'pfr')::boolean, false),
              coalesce((p ->> 'showdown')::boolean, false), coalesce((p ->> 'won')::boolean, false), (p ->> 'bestHand')::int);
    -- legendary hands, won at a showdown
    if acc is not null and coalesce((p ->> 'won')::boolean, false) and coalesce((p ->> 'showdown')::boolean, false) and (p ->> 'bestHand')::int >= 7 then
      insert into public.trophies (account_id, crew_id, game_id, hand_no, kind)
        values (acc, c, gid, hno, case (p ->> 'bestHand')::int when 9 then 'royal_flush' when 8 then 'straight_flush' else 'four_of_a_kind' end)
        on conflict do nothing;
    end if;
  end loop;
  update public.games set hands = hands + 1 where id = gid;
  return 'ok';
end $$;

-- {game:{id,...same as record_hand}, endedAt, players:[{key,account,name,buyins,final,minStack}]}
create function public.record_game_end(p_body text, p_sig text) returns text
language plpgsql security definer set search_path = '' as $$
declare b jsonb; g jsonb; gid uuid; st text; p jsonb; acc uuid; c uuid; ss int; v_casual boolean;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  b := p_body::jsonb; g := b -> 'game'; gid := (g ->> 'id')::uuid;
  if (select coalesce(sum((x ->> 'final')::int - (x ->> 'buyins')::int), 1) from jsonb_array_elements(b -> 'players') x) <> 0 then
    raise exception 'Final chips do not add up to what was bought in' using errcode = '22023';
  end if;
  c := nullif(g ->> 'crew', '')::uuid;
  if c is not null and not exists (select 1 from public.crews where id = c) then c := null; end if;
  insert into public.games (id, crew_id, table_code, server, casual, start_stack, big_blind, started_at)
    values (gid, c, g ->> 'table', g ->> 'server', coalesce((g ->> 'casual')::boolean, false), (g ->> 'startStack')::int, (g ->> 'bigBlind')::int, (g ->> 'startedAt')::timestamptz)
    on conflict (id) do nothing;
  select x.status, x.start_stack, x.casual, x.crew_id into st, ss, v_casual, c from public.games x where x.id = gid for update;
  if st <> 'live' then return 'duplicate'; end if;
  for p in select * from jsonb_array_elements(b -> 'players') loop
    acc := nullif(p ->> 'account', '')::uuid;
    if acc is not null and not exists (select 1 from public.accounts where id = acc) then acc := null; end if;
    insert into public.game_players (game_id, player_key, account_id, name, buyins, final_chips, min_stack)
      values (gid, p ->> 'key', acc, p ->> 'name', (p ->> 'buyins')::int, (p ->> 'final')::int, (p ->> 'minStack')::int)
      on conflict (game_id, player_key) do update set name = excluded.name, buyins = excluded.buyins, final_chips = excluded.final_chips, min_stack = excluded.min_stack;
  end loop;
  update public.games set status = 'ended', ended_at = (b ->> 'endedAt')::timestamptz,
    season_id = case when c is not null and not v_casual then private.season_for(c, (b ->> 'endedAt')::timestamptz) end
  where id = gid;
  perform private.score_game(gid);
  -- comeback: finished up after being under 10% of the starting stack
  insert into public.trophies (account_id, crew_id, game_id, kind, detail)
    select account_id, c, gid, 'comeback', jsonb_build_object('low', min_stack)
    from public.game_players where game_id = gid and account_id is not null and net > 0 and min_stack is not null and min_stack < ss * 0.1
    on conflict do nothing;
  return 'ok';
end $$;

-- ---------------------------------------------------------------- league
create function public.current_season(p_crew uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.seasons where crew_id = p_crew and starts_at <= now() and ends_at > now()
$$;

-- Standings for a season (default: the one running now). All three views come back; the screen sorts.
-- Average needs at least 5 games. Guests and former members without an account are left out.
create function public.league(p_crew uuid, p_season uuid default null) returns table (
  account_id uuid, name text, games int, total_bb numeric, avg_bb numeric, points int, wins int,
  hands int, vpip_pct int, pfr_pct int, showdowns_won int, biggest_pot int, best_hand int)
language plpgsql stable security definer set search_path = '' as $$
declare s uuid := coalesce(p_season, public.current_season(p_crew));
begin
  if not private.is_member(p_crew) then raise exception 'Only crew members can see the league' using errcode = '42501'; end if;
  return query
    select gp.account_id, max(a.name), count(*)::int, sum(gp.bb_won), case when count(*) >= 5 then round(sum(gp.bb_won) / count(*), 2) end,
      sum(gp.points)::int, count(*) filter (where gp.place = 1)::int, sum(gp.hands)::int,
      case when sum(gp.hands) > 0 then round(100.0 * sum(gp.vpip) / sum(gp.hands))::int end,
      case when sum(gp.hands) > 0 then round(100.0 * sum(gp.pfr) / sum(gp.hands))::int end,
      sum(gp.showdowns_won)::int, max(gp.biggest_pot), max(gp.best_hand)
    from public.games g join public.game_players gp on gp.game_id = g.id join public.accounts a on a.id = gp.account_id
    where g.crew_id = p_crew and g.season_id = s and g.status = 'ended' and not g.casual
    group by gp.account_id
    order by sum(gp.bb_won) desc;
end $$;

-- My games, newest first (history works without a crew too).
create function public.my_games(p_limit int default 50, p_before timestamptz default null) returns table (
  game_id uuid, ended_at timestamptz, crew_id uuid, crew_name text, table_code text, players int, hands int,
  net int, bb_won numeric, place int, casual boolean, status text)
language sql stable security definer set search_path = '' as $$
  select g.id, coalesce(g.ended_at, g.started_at), g.crew_id, c.name, g.table_code,
    (select count(*)::int from public.game_players x where x.game_id = g.id), g.hands,
    gp.net, gp.bb_won, gp.place, g.casual, g.status
  from public.game_players gp join public.games g on g.id = gp.game_id left join public.crews c on c.id = g.crew_id
  where gp.account_id = private.me() and (p_before is null or coalesce(g.ended_at, g.started_at) < p_before)
  order by coalesce(g.ended_at, g.started_at) desc limit least(greatest(p_limit, 1), 200)
$$;

-- ---------------------------------------------------------------- admin fixes (logged)
create function public.void_game(p_game uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.games; a uuid;
begin
  select * into g from public.games where id = p_game for update;
  if g is null or g.crew_id is null then raise exception 'Only crew games can be voided' using errcode = 'P0002'; end if;
  a := private.need_admin(g.crew_id);
  if g.status = 'void' then raise exception 'Already void' using errcode = '22023'; end if;
  update public.games set status = 'void', void_reason = p_reason where id = p_game;
  insert into public.result_changes (game_id, actor, what, reason) values (p_game, a, 'void', p_reason);
end $$;

-- Correct a disputed result by moving chips from one player to another (totals stay equal to buy-ins).
create function public.adjust_result(p_game uuid, p_from text, p_to text, p_chips int, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.games; a uuid;
begin
  select * into g from public.games where id = p_game for update;
  if g is null or g.crew_id is null then raise exception 'Only crew games can be corrected' using errcode = 'P0002'; end if;
  a := private.need_admin(g.crew_id);
  if g.status <> 'ended' then raise exception 'Only a finished game can be corrected' using errcode = '22023'; end if;
  if p_chips <= 0 or p_from = p_to then raise exception 'Move a positive number of chips between two players' using errcode = '22023'; end if;
  if (select final_chips from public.game_players where game_id = p_game and player_key = p_from) < p_chips then
    raise exception 'That player does not have that many chips' using errcode = '22023';
  end if;
  update public.game_players set final_chips = final_chips - p_chips where game_id = p_game and player_key = p_from;
  if not found then raise exception 'Unknown player' using errcode = 'P0002'; end if;
  update public.game_players set final_chips = final_chips + p_chips where game_id = p_game and player_key = p_to;
  if not found then raise exception 'Unknown player' using errcode = 'P0002'; end if;
  perform private.score_game(p_game);
  insert into public.result_changes (game_id, actor, what, reason, detail)
    values (p_game, a, 'adjust', p_reason, jsonb_build_object('from', p_from, 'to', p_to, 'chips', p_chips));
end $$;

-- ---------------------------------------------------------------- seasons end
-- Called daily: seasons whose end has passed are closed; the winner (most big blinds) and the iron chair
-- (most games) get trophies. Standings simply stop changing because new games go to the next season.
create function public.close_due_seasons(p_body text, p_sig text) returns int
language plpgsql security definer set search_path = '' as $$
declare s record; n int := 0;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  for s in select * from public.seasons where closed_at is null and ends_at <= now() for update loop
    insert into public.trophies (account_id, crew_id, season_id, kind, detail)
      select gp.account_id, s.crew_id, s.id, 'season_winner', jsonb_build_object('bb', sum(gp.bb_won))
      from public.games g join public.game_players gp on gp.game_id = g.id
      where g.season_id = s.id and g.status = 'ended' and not g.casual and gp.account_id is not null
      group by gp.account_id
      having sum(gp.bb_won) = (select max(t) from (select sum(gp2.bb_won) t from public.games g2 join public.game_players gp2 on gp2.game_id = g2.id
                                where g2.season_id = s.id and g2.status = 'ended' and not g2.casual and gp2.account_id is not null group by gp2.account_id) m)
      on conflict do nothing;
    insert into public.trophies (account_id, crew_id, season_id, kind, detail)
      select gp.account_id, s.crew_id, s.id, 'iron_chair', jsonb_build_object('games', count(*))
      from public.games g join public.game_players gp on gp.game_id = g.id
      where g.season_id = s.id and g.status = 'ended' and not g.casual and gp.account_id is not null
      group by gp.account_id
      having count(*) = (select max(t) from (select count(*) t from public.games g2 join public.game_players gp2 on gp2.game_id = g2.id
                          where g2.season_id = s.id and g2.status = 'ended' and not g2.casual and gp2.account_id is not null group by gp2.account_id) m)
      on conflict do nothing;
    update public.seasons set closed_at = now() where id = s.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- backups
-- Tables in the order a restore must load them (parents before children).
create function private.backup_tables() returns text[] language sql immutable as $$
  select array['private.settings', 'public.accounts', 'public.account_logins', 'private.recovery_codes', 'public.crews', 'public.crew_members',
    'public.crew_invites', 'public.rescue_requests', 'public.crew_audit', 'public.seasons', 'public.games', 'public.game_players',
    'public.hands', 'public.hand_players', 'public.trophies', 'public.result_changes']
$$;

-- The whole database as one JSON document. It holds secrets (the code pepper, the recorder key, code
-- hashes), so only a table server may ask for it, and it is kept privately on the Oracle server.
create function public.export_backup(p_body text, p_sig text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb := jsonb_build_object('version', 1, 'at', now()); t text; rows jsonb;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  foreach t in array private.backup_tables() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %s x', t) into rows;
    out := out || jsonb_build_object(t, rows);
  end loop;
  return out;
end $$;

-- Restore into a fresh project (run by the project owner in the SQL editor, never by phones):
--   select private.import_backup('<backup json>'::jsonb);
-- Phones then come back with their recovery codes (the old project's logins do not carry over).
create function private.import_backup(b jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t text; n int; counts jsonb := '{}'::jsonb; seq text;
begin
  if (b ->> 'version')::int is distinct from 1 then raise exception 'Unknown backup version'; end if;
  delete from private.settings;
  foreach t in array private.backup_tables() loop
    execute format('insert into %s overriding system value select * from jsonb_populate_recordset(null::%s, $1) on conflict do nothing', t, t) using coalesce(b -> t, '[]'::jsonb);
    get diagnostics n = row_count;
    counts := counts || jsonb_build_object(t, n);
  end loop;
  -- identity counters continue after the restored rows
  for t, seq in select c.relnamespace::regnamespace || '.' || c.relname, pg_get_serial_sequence(c.relnamespace::regnamespace || '.' || c.relname, a.attname)
    from pg_attribute a join pg_class c on c.oid = a.attrelid
    where a.attidentity <> '' and c.relnamespace::regnamespace::text in ('public', 'private') loop
    execute format('select setval(%L, greatest((select coalesce(max(id), 0) from %s), 1))', seq, t);
  end loop;
  return counts;
end $$;

-- ---------------------------------------------------------------- row-level security and rights
alter table public.seasons enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.hands enable row level security;
alter table public.hand_players enable row level security;
alter table public.trophies enable row level security;
alter table public.result_changes enable row level security;

create policy seasons_read on public.seasons for select to authenticated using (private.is_member(crew_id));
create policy games_read on public.games for select to authenticated using (private.can_see_game(id));
create policy game_players_read on public.game_players for select to authenticated using (private.can_see_game(game_id));
create policy hands_read on public.hands for select to authenticated using (private.can_see_game(game_id));
create policy hand_players_read on public.hand_players for select to authenticated using (private.can_see_game(game_id));
create policy trophies_read on public.trophies for select to authenticated using (account_id = (select private.me()) or (crew_id is not null and private.is_member(crew_id)));
create policy changes_read on public.result_changes for select to authenticated using (private.can_see_game(game_id));

revoke all on public.seasons, public.games, public.game_players, public.hands, public.hand_players, public.trophies, public.result_changes from anon, authenticated;
grant select on public.seasons, public.games, public.game_players, public.hands, public.hand_players, public.trophies, public.result_changes to authenticated;

revoke all on function private.recorder_ok(text, text), private.can_see_game(uuid), private.season_for(uuid, timestamptz), private.score_game(uuid),
  private.backup_tables(), private.import_backup(jsonb) from public, anon, authenticated;
grant execute on function private.can_see_game(uuid) to authenticated;
revoke all on function public.record_hand(text, text), public.record_game_end(text, text), public.current_season(uuid), public.league(uuid, uuid),
  public.my_games(int, timestamptz), public.void_game(uuid, text), public.adjust_result(uuid, text, text, int, text),
  public.close_due_seasons(text, text), public.export_backup(text, text) from public, anon, authenticated;
-- table servers call these with the public key; the signature is what lets them through
grant execute on function public.record_hand(text, text), public.record_game_end(text, text), public.close_due_seasons(text, text), public.export_backup(text, text) to anon;
grant execute on function public.current_season(uuid), public.league(uuid, uuid), public.my_games(int, timestamptz), public.void_game(uuid, text),
  public.adjust_result(uuid, text, text, int, text) to authenticated;
