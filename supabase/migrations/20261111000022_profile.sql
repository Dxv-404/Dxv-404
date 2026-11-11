-- The Profile page: achievements, the collectible card's choices, milestone bars, and one function that
-- returns everything the page shows.
--
--   achievements          one row per player per achievement (per tier for the counted ones): when, in which
--                         game and hand, and whether it was told at once ('now') or held for the night
--                         summary ('night': it rests on cards nobody showed, or is only known at the end)
--   achievement_counters  running counts the tiers and milestone bars need and the hand tables do not hold
--                         (today only 'bluffs': Stone Cold Bluffs that worked)
--   card_config           the player's chosen frame, backdrop, pose, finish, title, three stats, emblem,
--                         tagline and card back
--   milestone_seen        how far each milestone bar was when the player last looked, so it can fill from there
--
-- Who earned what is decided by the achievement checker (packages/achievements), which only table servers
-- run: they send the result signed, like a hand (record_achievements). Phones cannot write an achievement.
-- No phone reads these tables directly either (row level security with no policies): everything goes through
-- the functions below. profile_page gives your own page in full; someone else's only to a crew mate, only
-- for the crew you share, and only the achievements they have not hidden.
-- Additive only: nothing existing is dropped. Two existing functions get one more step each (merging two
-- accounts carries these rows over; the backup includes the new tables).

-- ---------------------------------------------------------------- tables
create table public.achievements (
  account_id uuid not null references public.accounts(id) on delete cascade,
  achievement text not null check (achievement ~ '^[a-z][a-z_]{2,23}$'),
  -- 0 for most; 1, 2, 3... for the tiers of a counted one (Stone Cold Bluff, Regular)
  tier int not null default 0 check (tier between 0 and 9),
  earned_at timestamptz not null,
  game_id uuid references public.games(id) on delete set null,
  hand_no int check (hand_no is null or hand_no > 0),
  reveal text not null default 'now' check (reveal in ('now', 'night')),
  -- when the player first saw it on their profile (null: new, the tab shows a dot)
  seen_at timestamptz,
  -- the player may hide one from other people's view of their profile
  shown boolean not null default true,
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) < 1000),
  primary key (account_id, achievement, tier)
);
create index on public.achievements (game_id);

create table public.achievement_counters (
  account_id uuid not null references public.accounts(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z_]{1,23}$'),
  n int not null default 0 check (n >= 0),
  primary key (account_id, key)
);

-- every signed call is taken once: a resend (the servers retry until they hear "ok") changes nothing
create table private.achievement_calls (
  ref text primary key check (ref ~ '^[A-Za-z0-9:_-]{1,80}$'),
  at timestamptz not null default now()
);

create table public.card_config (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  frame text check (frame ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  backdrop text check (backdrop ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  pose text check (pose ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  finish text check (finish ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  title text check (title ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  stats text[] not null default '{}' check (coalesce(array_length(stats, 1), 0) <= 3 and array_to_string(stats, ',') ~ '^[a-z0-9_,-]{0,100}$'),
  emblem text check (emblem ~ '^[a-z][a-z_]{2,23}$'),
  tagline text check (char_length(tagline) between 1 and 24),
  back text check (back ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  updated_at timestamptz not null default now()
);

create table public.milestone_seen (
  account_id uuid not null references public.accounts(id) on delete cascade,
  track text not null check (track ~ '^[a-z][a-z_]{1,23}$'),
  value numeric not null check (value >= 0),
  seen_at timestamptz not null default now(),
  primary key (account_id, track)
);

alter table public.achievements enable row level security;
alter table public.achievement_counters enable row level security;
alter table public.card_config enable row level security;
alter table public.milestone_seen enable row level security;
revoke all on public.achievements, public.achievement_counters, public.card_config, public.milestone_seen from anon, authenticated;

-- ---------------------------------------------------------------- the table server records what was earned
-- {"ref":"<game id>:<hand no>" | "<game id>:end" | "history:...",   one call, taken once
--  "game":"<uuid>",                                                  optional: the game these came from
--  "earned":[{"account":"<uuid>","id":"quads","tier":0,"reveal":"now","at":"<time>","hand":17,"detail":{},"game":"<uuid>"}],
--  "counts":[{"account":"<uuid>","key":"bluffs","add":1}]}
-- A seat without an account (a guest) is left out by the server; an account that no longer exists is skipped.
-- An achievement a player already has is kept as it was (first time earned).
create function public.record_achievements(p_body text, p_sig text) returns text
language plpgsql security definer set search_path = '' as $$
declare b jsonb; r text; gid uuid; g uuid; e jsonb; acc uuid;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  begin
    b := p_body::jsonb; r := b ->> 'ref'; gid := nullif(b ->> 'game', '')::uuid;
    if r is null or r !~ '^[A-Za-z0-9:_-]{1,80}$' or jsonb_typeof(coalesce(b -> 'earned', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(b -> 'counts', '[]'::jsonb)) <> 'array' then
      raise exception 'incomplete';
    end if;
    if exists (select 1 from jsonb_array_elements(coalesce(b -> 'earned', '[]'::jsonb)) x
        where (x ->> 'account')::uuid is null or coalesce(x ->> 'id', '') !~ '^[a-z][a-z_]{2,23}$' or coalesce((x ->> 'tier')::int, 0) not between 0 and 9
          or coalesce(x ->> 'reveal', 'now') not in ('now', 'night') or coalesce((x ->> 'hand')::int, 1) < 1 or (x ->> 'at')::timestamptz is null
          or pg_column_size(coalesce(x -> 'detail', '{}'::jsonb)) >= 1000 or (x ->> 'game')::uuid is distinct from (x ->> 'game')::uuid) then
      raise exception 'incomplete';
    end if;
    if exists (select 1 from jsonb_array_elements(coalesce(b -> 'counts', '[]'::jsonb)) x
        where (x ->> 'account')::uuid is null or coalesce(x ->> 'key', '') !~ '^[a-z][a-z_]{1,23}$'
          or coalesce((x ->> 'add')::int, (x ->> 'set')::int, 0) not between 1 and 100000 or ((x ? 'add') and (x ? 'set'))) then
      raise exception 'incomplete';
    end if;
  exception when others then
    raise exception 'That is not a list of achievements' using errcode = '22023';
  end;
  insert into private.achievement_calls (ref) values (r) on conflict do nothing;
  if not found then return 'duplicate'; end if;
  for e in select * from jsonb_array_elements(coalesce(b -> 'earned', '[]'::jsonb)) loop
    acc := (e ->> 'account')::uuid;
    g := coalesce((e ->> 'game')::uuid, gid);
    insert into public.achievements (account_id, achievement, tier, earned_at, game_id, hand_no, reveal, detail)
      select acc, e ->> 'id', coalesce((e ->> 'tier')::int, 0), (e ->> 'at')::timestamptz, (select x.id from public.games x where x.id = g),
        (e ->> 'hand')::int, coalesce(e ->> 'reveal', 'now'), coalesce(e -> 'detail', '{}'::jsonb)
      where exists (select 1 from public.accounts a where a.id = acc and a.deleted_at is null)
      on conflict do nothing;
  end loop;
  for e in select * from jsonb_array_elements(coalesce(b -> 'counts', '[]'::jsonb)) loop
    acc := (e ->> 'account')::uuid;
    -- "add": so many more; "set": the total after a run over the whole history (never lowers a count)
    insert into public.achievement_counters (account_id, key, n)
      select acc, e ->> 'key', coalesce((e ->> 'add')::int, (e ->> 'set')::int) where exists (select 1 from public.accounts a where a.id = acc and a.deleted_at is null)
      on conflict (account_id, key) do update set n = case when e ? 'set' then greatest(public.achievement_counters.n, excluded.n) else public.achievement_counters.n + excluded.n end;
  end loop;
  return 'ok';
end $$;

-- ---------------------------------------------------------------- what a table server reads to check a crew's achievements
-- After a crew's night ends its table server asks for everything the checker needs (every hand record of the
-- crew, with all hole cards: only a signed table server may ask), runs the checker over the whole history
-- and sends the result to record_achievements. {"crew":"<uuid>"}
create function public.achievements_feed(p_body text, p_sig text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c uuid;
begin
  if not private.recorder_ok(p_body, p_sig) then raise exception 'Not a table server' using errcode = '42501'; end if;
  begin c := (p_body::jsonb ->> 'crew')::uuid; exception when others then c := null; end;
  if c is null then raise exception 'Which crew?' using errcode = '22023'; end if;
  return (
select jsonb_build_object(
  'v', 1,
  'crew', (select jsonb_build_object('id', c.id, 'name', c.name) from public.crews c where c.id = c),
  'members', (select coalesce(jsonb_agg(jsonb_build_object('account', m.account_id, 'name', a.name, 'joined', m.joined_at)), '[]'::jsonb)
    from public.crew_members m join public.accounts a on a.id = m.account_id where m.crew_id = c and m.status = 'active'),
  'seasons', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', coalesce(s.title, s.name), 'ends', s.ends_at, 'closed', s.closed_at,
      'ranks', (select coalesce(jsonb_agg(jsonb_build_object('account', l.account_id, 'rank', l.rank)), '[]'::jsonb) from private.league_standings(c, s.id, false) l)) order by s.starts_at), '[]'::jsonb)
    from public.seasons s where s.crew_id = c),
  'games', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'table', g.table_code, 'started', g.started_at, 'ended', g.ended_at,
      'start_stack', g.start_stack, 'big_blind', g.big_blind, 'casual', g.casual, 'season', g.season_id,
      'host', (select t.opened_by from public.crew_tables t where t.crew_id = g.crew_id and t.table_code = g.table_code and t.opened_at <= g.started_at order by t.opened_at desc limit 1),
      'players', (select jsonb_agg(jsonb_build_object('key', p.player_key, 'account', p.account_id, 'name', p.name, 'place', p.place, 'net', p.net, 'buyins', p.buyins, 'hands', p.hands))
        from public.game_players p where p.game_id = g.id)) order by g.started_at), '[]'::jsonb)
    from public.games g where g.crew_id = c and g.status = 'ended'),
  'hands', (select coalesce(jsonb_agg(jsonb_build_object('game', r.game_id, 'no', r.hand_no, 'record', r.record) order by g.started_at, r.hand_no), '[]'::jsonb)
    from private.hand_records r join public.games g on g.id = r.game_id where g.crew_id = c and g.status = 'ended')
)
  );
end $$;
revoke all on function public.achievements_feed(text, text) from public, anon, authenticated;
grant execute on function public.achievements_feed(text, text) to anon;

-- ---------------------------------------------------------------- what a phone may change: its own card, what it has seen, what it shows
-- {"frame":"four-corners","backdrop":null,"pose":"smirk","finish":"matte","title":"the-closer","stats":["wins","best_night","hands"],
--  "emblem":"quads","tagline":"never folds","back":"timetable"}: the whole card each time (a part left out is cleared).
-- The emblem must be an achievement the player has. Which frames and finishes a player has unlocked is
-- worked out by the app from their achievements (the art list is not in the database).
create function public.save_card(p_card jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); c public.card_config; st text[]; tag text := nullif(btrim(coalesce(p_card ->> 'tagline', '')), '');
begin
  if p_card is null or jsonb_typeof(p_card) <> 'object' or jsonb_typeof(coalesce(p_card -> 'stats', '[]'::jsonb)) <> 'array' then
    raise exception 'That is not a card' using errcode = '22023';
  end if;
  st := array(select jsonb_array_elements_text(coalesce(p_card -> 'stats', '[]'::jsonb)));
  if char_length(tag) > 24 then raise exception 'A tagline is up to 24 letters' using errcode = '22023'; end if;
  if (p_card ->> 'emblem') is not null and not exists (select 1 from public.achievements x where x.account_id = a and x.achievement = p_card ->> 'emblem') then
    raise exception 'That emblem is not earned yet' using errcode = '22023';
  end if;
  begin
    insert into public.card_config (account_id, frame, backdrop, pose, finish, title, stats, emblem, tagline, back)
      values (a, p_card ->> 'frame', p_card ->> 'backdrop', p_card ->> 'pose', p_card ->> 'finish', p_card ->> 'title', st, p_card ->> 'emblem', tag, p_card ->> 'back')
      on conflict (account_id) do update set frame = excluded.frame, backdrop = excluded.backdrop, pose = excluded.pose, finish = excluded.finish,
        title = excluded.title, stats = excluded.stats, emblem = excluded.emblem, tagline = excluded.tagline, back = excluded.back, updated_at = now()
      returning * into c;
  exception when check_violation then
    raise exception 'That is not a card' using errcode = '22023';
  end;
  return private.card_json(a);
end $$;

create function private.card_json(a uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('frame', c.frame, 'backdrop', c.backdrop, 'pose', c.pose, 'finish', c.finish, 'title', c.title, 'stats', to_jsonb(c.stats),
    'emblem', c.emblem, 'tagline', c.tagline, 'back', c.back)
  from public.card_config c where c.account_id = a
$$;

-- The profile was opened: what is on it now counts as seen (the tab's dot goes), and the bars remember
-- where they were ({"hands": 86, "wins": 3}: track -> value).
create function public.mark_profile_seen(p_milestones jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  update public.achievements set seen_at = now() where account_id = a and seen_at is null;
  if p_milestones is not null and jsonb_typeof(p_milestones) = 'object' then
    insert into public.milestone_seen (account_id, track, value)
      select a, k, greatest(v::numeric, 0) from jsonb_each_text(p_milestones) x(k, v)
      where k ~ '^[a-z][a-z_]{1,23}$' and v ~ '^-?[0-9]{1,9}(\.[0-9]{1,3})?$' limit 20
      on conflict (account_id, track) do update set value = excluded.value, seen_at = now();
  end if;
end $$;

-- Show or hide one of my achievements on the profile other people see.
create function public.show_achievement(p_achievement text, p_shown boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me();
begin
  update public.achievements set shown = coalesce(p_shown, true) where account_id = a and achievement = p_achievement;
  if not found then raise exception 'You do not have that achievement' using errcode = 'P0002'; end if;
end $$;

-- How many achievements are new since I last opened my profile (the dot on the Profile tab).
create function public.profile_news() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.achievements x where x.account_id = private.need_me() and x.seen_at is null
    and (x.reveal = 'now' or x.game_id is null or not exists (select 1 from public.games g where g.id = x.game_id and g.status = 'live'))
$$;

-- ---------------------------------------------------------------- pieces of the page
-- Every finished night of one player (every crew, or one), with its place, rebuys and game score worked out
-- exactly as the league does (private.nights); 'league' says whether the league counts it (a crew game of 3+).
create function private.profile_nights(a uuid, c uuid)
returns table (game_id uuid, crew_id uuid, season_id uuid, table_code text, started_at timestamptz, ended_at timestamptz, start_stack int, big_blind int,
  player_key text, players int, place int, rebuys int, net int, bb numeric, pts numeric, buyins int, min_stack int, hands int, showdowns int, showdowns_won int, league boolean)
language sql stable security definer set search_path = '' as $$
  with p as (
    select gp.account_id, gp.game_id, gp.player_key, gp.net, gp.bb_won, gp.buyins, gp.min_stack, gp.hands, gp.showdowns, gp.showdowns_won,
      g.crew_id, g.season_id, g.table_code, g.started_at, g.ended_at, g.start_stack, g.big_blind,
      count(*) over (partition by gp.game_id)::int n,
      coalesce(gp.place, (rank() over (partition by gp.game_id order by gp.net desc))::int) pl,
      greatest(round(gp.buyins::numeric / nullif(g.start_stack, 0))::int - 1, 0) rb
    from public.games g join public.game_players gp on gp.game_id = g.id
    where g.status = 'ended' and not g.casual and gp.net is not null and (c is null or g.crew_id = c)
      and g.id in (select x.game_id from public.game_players x where x.account_id = a)
  )
  select p.game_id, p.crew_id, p.season_id, p.table_code, p.started_at, p.ended_at, p.start_stack, p.big_blind, p.player_key, p.n, least(p.pl, p.n), p.rb,
    p.net, p.bb_won, private.game_score(p.n, p.pl, p.net, p.start_stack, p.rb), p.buyins, p.min_stack, p.hands, p.showdowns, p.showdowns_won,
    p.crew_id is not null and p.n >= 3
  from p where p.account_id = a
$$;

-- Runs of "yes" in a list ordered by time: the run still going at the end, the longest, and when the longest ended.
create function private.streak_of(flags boolean[], times timestamptz[]) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare run int := 0; best int := 0; best_at timestamptz; i int;
begin
  for i in 1 .. coalesce(array_length(flags, 1), 0) loop
    if flags[i] then run := run + 1; if run > best then best := run; best_at := times[i]; end if; else run := 0; end if;
  end loop;
  return jsonb_build_object('current', run, 'longest', best, 'longest_at', best_at);
end $$;

-- Weeks in a row with a night. Weeks run Monday to Sunday in India time; the run "still going" may have
-- last week as its latest week (this week is not over yet).
create function private.week_streak(days date[], today date) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare w int; prev int; run int := 0; best int := 0; last int;
begin
  for w in select distinct (d - date '1970-01-05') / 7 from unnest(days) d order by 1 loop
    run := case when prev is not null and w = prev + 1 then run + 1 else 1 end;
    best := greatest(best, run); prev := w; last := w;
  end loop;
  return jsonb_build_object('current', case when last is not null and (today - date '1970-01-05') / 7 - last <= 1 then run else 0 end, 'longest', best);
end $$;

-- One hand as a tile: when, what it won or lost, the board, and the player's cards (their own always; someone
-- else's only if they were turned face up at the table).
create function private.hand_tile(g uuid, h int, a uuid, own boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('game', hp.game_id, 'hand', hp.hand_no, 'at', hd.played_at, 'chips', hp.net,
    'bb', round(hp.net::numeric / nullif(gm.big_blind, 0), 1), 'pot', hd.pot, 'best_hand', hp.best_hand, 'showdown', hp.showdown,
    'cards', case when own then (select to_jsonb(c.cards) from public.hand_cards_private c where c.game_id = g and c.hand_no = h and c.account_id = a)
      else (select case when jsonb_typeof(x) = 'array' then x end from (select hd.record -> 'frames' -> -1 -> 'cards' -> ((
        select (ord - 1)::int from jsonb_array_elements_text(hd.record -> 'keys') with ordinality t(v, ord) where v = hp.player_key limit 1))::text) q(x)) end,
    'board', (select f -> 'board' from jsonb_array_elements(hd.record -> 'frames') with ordinality fr(f, o) where f ? 'board' order by o desc limit 1))
  from public.hand_players hp join public.hands hd on hd.game_id = hp.game_id and hd.hand_no = hp.hand_no join public.games gm on gm.id = hp.game_id
  where hp.game_id = g and hp.hand_no = h and hp.account_id = a
$$;

-- One night as a chip graph: the stack after every hand (from the public replay everyone at the table saw),
-- rebuys where chips were added between hands, the biggest pot won and lost, and everyone else's lines.
create function private.night_graph(g uuid, k text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with s as (
    select h.hand_no, t.v pk,
      (h.record -> 'frames' -> -1 -> 'stacks' ->> (t.ord - 1)::int)::int after,
      (h.record -> 'frames' -> 0 -> 'stacks' ->> (t.ord - 1)::int)::int + (h.record -> 'frames' -> 0 -> 'bets' ->> (t.ord - 1)::int)::int before
    from public.hands h cross join lateral jsonb_array_elements_text(h.record -> 'keys') with ordinality t(v, ord)
    where h.game_id = g and jsonb_typeof(h.record -> 'keys') = 'array' and jsonb_array_length(h.record -> 'frames') > 0
  ), m as (
    select s.*, lag(s.after) over (partition by s.pk order by s.hand_no) prev from s where s.after is not null
  )
  select jsonb_build_object(
    'hands', coalesce((select jsonb_agg(m.hand_no order by m.hand_no) from m where m.pk = k), '[]'::jsonb),
    'stacks', coalesce((select jsonb_agg(m.after order by m.hand_no) from m where m.pk = k), '[]'::jsonb),
    'rebuys', coalesce((select jsonb_agg(jsonb_build_object('before', m.hand_no, 'chips', m.before - m.prev) order by m.hand_no) from m
      where m.pk = k and m.prev is not null and m.before > m.prev), '[]'::jsonb),
    'best', (select jsonb_build_object('hand', hp.hand_no, 'chips', hp.net) from public.hand_players hp where hp.game_id = g and hp.player_key = k and hp.net > 0 order by hp.net desc, hp.hand_no limit 1),
    'worst', (select jsonb_build_object('hand', hp.hand_no, 'chips', hp.net) from public.hand_players hp where hp.game_id = g and hp.player_key = k and hp.net < 0 order by hp.net, hp.hand_no limit 1),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('name', case when gp.account_id is not null and (select deleted_at from public.accounts where id = gp.account_id) is null
          then (select name from public.accounts where id = gp.account_id) else gp.name end,
        'hands', (select jsonb_agg(m.hand_no order by m.hand_no) from m where m.pk = gp.player_key),
        'stacks', (select jsonb_agg(m.after order by m.hand_no) from m where m.pk = gp.player_key)) order by gp.net desc nulls last)
      from public.game_players gp where gp.game_id = g and gp.player_key <> k and exists (select 1 from m where m.pk = gp.player_key)), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------- the page
-- Everything the Profile page shows, in one answer. p_account null: my own. p_crew picks whose league
-- numbers the season strip shows (null: the crew of the latest night, or the first crew).
--   my own page      every game I played (career, heatmap, graphs), all my achievements, what I have seen
--   someone else's   only for a crew mate, only that crew's games, only achievements they show; no "seen"
-- An achievement held for the night summary is not on anyone's page while its game is still being played.
create function public.profile_page(p_account uuid default null, p_crew uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := private.need_me(); a uuid := coalesce(p_account, me); own boolean; acct public.accounts; c uuid := p_crew; scope uuid;
  s public.seasons; st record; mode text; need int; today date := (now() at time zone 'Asia/Kolkata')::date;
  car record; wk jsonb; wins jsonb; top3 jsonb; ach jsonb; n_ach int; bluffs int; season jsonb; moments jsonb; hist jsonb;
begin
  own := a = me;
  select * into acct from public.accounts where id = a;
  if acct.id is null then raise exception 'No such player' using errcode = 'P0002'; end if;
  if not own then
    -- a crew mate: a crew both are in (the one asked for, or any)
    select m1.crew_id into c from public.crew_members m1 join public.crew_members m2 on m2.crew_id = m1.crew_id
      where m1.account_id = me and m1.status = 'active' and m2.account_id = a and m2.status = 'active' and (p_crew is null or m1.crew_id = p_crew)
      order by m2.joined_at limit 1;
    if c is null then raise exception 'Only crew mates can see a profile' using errcode = '42501'; end if;
    scope := c;
  else
    if c is not null and not private.is_member(c) then raise exception 'Only crew members can open the crew' using errcode = '42501'; end if;
    if c is null then
      select x.crew_id into c from private.profile_nights(a, null) x where x.crew_id is not null and private.is_member(x.crew_id) order by x.ended_at desc limit 1;
    end if;
    if c is null then select m.crew_id into c from public.crew_members m where m.account_id = a and m.status = 'active' order by m.joined_at limit 1; end if;
  end if;

  -- the season strip and the season's history, for the chosen crew
  if c is not null then
    select * into s from public.seasons where id = public.current_season(c);
    select scoring into mode from public.crews where id = c;
    need := case mode when 'points' then 4 when 'average' then 3 else 0 end;
    select * into st from private.league_standings(c, s.id, false) x where x.account_id = a;
    season := jsonb_build_object('id', s.id, 'number', s.number, 'title', s.title, 'name', s.name, 'ends_at', s.ends_at, 'scoring', mode, 'min_games', need,
      'rank', st.rank, 'ranked', coalesce(st.ranked, false), 'avg', st.avg, 'points', st.points, 'bb', st.bb, 'games', coalesce(st.games, 0),
      'wins', coalesce(st.wins, 0), 'top3', coalesce(st.top3, 0), 'trend', st.trend,
      'of', (select count(*) from private.league_standings(c, s.id, false) x where x.ranked),
      'streak', (select private.streak_of(array_agg(x.place = 1 order by x.ended_at), array_agg(x.ended_at order by x.ended_at)) -> 'current'
        from private.nights(c, s.id, false) x where x.account_id = a));
    hist := jsonb_build_object(
      -- my rank after each of the season's games (null until I have played enough to be ranked)
      'rank_after', (select coalesce(jsonb_agg(jsonb_build_object('game', r.game_id, 'at', r.t, 'rank', r.rk, 'played', r.played) order by r.t), '[]'::jsonb) from (
        select z.t, z.game_id, z.account_id, z.played, case when z.ok then (rank() over (partition by z.t, z.ok order by z.k desc))::int end rk from (
          select t.t, t.game_id, y.account_id, bool_or(y.game_id = t.game_id) played, count(*) >= need ok,
            case mode when 'points' then avg(y.pts) when 'bb' then sum(y.bb) else avg(y.bb) end k
          from (select distinct x.game_id, x.ended_at t from private.nights(c, s.id, false) x) t
          join private.nights(c, s.id, false) y on y.ended_at <= t.t group by t.t, t.game_id, y.account_id) z) r
        where r.account_id = a),
      'seasons', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'number', x.number, 'title', x.title, 'name', x.name, 'closed', x.closed_at is not null,
          'current', x.id = s.id, 'rank', l.rank, 'avg', l.avg, 'points', l.points, 'bb', l.bb, 'games', l.games, 'wins', l.wins,
          'best_hand', (select max(hp.best_hand) from public.hand_players hp join public.games g on g.id = hp.game_id
            where hp.account_id = a and g.crew_id = c and g.season_id = x.id and hp.showdown and hp.won)) order by x.starts_at desc), '[]'::jsonb)
        from public.seasons x join lateral (select * from private.league_standings(c, x.id, false) y where y.account_id = a) l on true where x.crew_id = c));
  end if;

  -- career numbers, streaks and achievements (someone else's: the shared crew's games only)
  select count(*)::int nights, coalesce(sum(x.hands), 0)::int hands, coalesce(sum(x.showdowns), 0)::int sd, coalesce(sum(x.showdowns_won), 0)::int sdw,
    coalesce(sum(x.bb), 0) bb, (count(*) filter (where x.league and x.place = 1))::int wins, (count(*) filter (where x.league and x.place <= 3))::int top3,
    round((coalesce(sum(extract(epoch from x.ended_at - x.started_at)), 0) / 3600)::numeric, 1) hours,
    array_agg((x.ended_at at time zone 'Asia/Kolkata')::date) days
    into car from private.profile_nights(a, scope) x;
  wk := private.week_streak(car.days, today);
  select private.streak_of(array_agg(x.place = 1 order by x.ended_at), array_agg(x.ended_at order by x.ended_at)),
    private.streak_of(array_agg(x.place <= 3 order by x.ended_at), array_agg(x.ended_at order by x.ended_at))
    into wins, top3 from private.profile_nights(a, scope) x where x.league;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.achievement, 'tier', x.tier, 'at', x.earned_at, 'game', x.game_id, 'hand', x.hand_no, 'reveal', x.reveal,
      'shown', x.shown, 'new', own and x.seen_at is null, 'detail', x.detail) order by x.earned_at desc, x.achievement, x.tier), '[]'::jsonb),
    count(distinct x.achievement)::int
    into ach, n_ach from public.achievements x
    where x.account_id = a and (own or x.shown)
      and (x.reveal = 'now' or x.game_id is null or not exists (select 1 from public.games g where g.id = x.game_id and g.status = 'live'));
  bluffs := coalesce((select n from public.achievement_counters where account_id = a and key = 'bluffs'), 0);

  moments := jsonb_build_object(
    'biggest_won', (select private.hand_tile(hp.game_id, hp.hand_no, a, own) from public.hand_players hp join public.games g on g.id = hp.game_id
      where hp.account_id = a and g.status = 'ended' and not g.casual and (scope is null or g.crew_id = scope) and hp.net > 0 order by hp.net desc, hp.game_id, hp.hand_no limit 1),
    'biggest_lost', (select private.hand_tile(hp.game_id, hp.hand_no, a, own) from public.hand_players hp join public.games g on g.id = hp.game_id
      where hp.account_id = a and g.status = 'ended' and not g.casual and (scope is null or g.crew_id = scope) and hp.net < 0 order by hp.net, hp.game_id, hp.hand_no limit 1),
    -- the hand that moved this season's score most: the biggest win measured in starting stacks
    'hand_of_season', case when c is null then null else (select private.hand_tile(hp.game_id, hp.hand_no, a, own) from public.hand_players hp join public.games g on g.id = hp.game_id
      where hp.account_id = a and g.status = 'ended' and not g.casual and g.crew_id = c and g.season_id = s.id and hp.net > 0
      order by hp.net::numeric / g.start_stack desc, hp.game_id, hp.hand_no limit 1) end,
    'winning_hands', (select coalesce(jsonb_agg(jsonb_build_object('hand', w.best_hand, 'n', w.n) order by w.n desc, w.best_hand desc), '[]'::jsonb) from (
      select hp.best_hand, count(*)::int n from public.hand_players hp join public.games g on g.id = hp.game_id
      where hp.account_id = a and g.status = 'ended' and not g.casual and (scope is null or g.crew_id = scope) and hp.won and hp.showdown and hp.best_hand is not null
      group by hp.best_hand) w),
    'comebacks', (select coalesce(jsonb_agg(jsonb_build_object('game', x.game_id, 'at', x.ended_at, 'low', x.min_stack, 'start_stack', x.start_stack) order by x.ended_at desc), '[]'::jsonb)
      from private.profile_nights(a, scope) x where x.league and x.place = 1 and x.min_stack < 0.2 * x.start_stack));

  return jsonb_build_object(
    'v', 1, 'own', own,
    'account', jsonb_build_object('id', a, 'name', case when acct.deleted_at is null then acct.name else 'Former player' end, 'avatar', private.avatar_of(a), 'since', acct.created_at),
    'crews', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'badge', x.badge, 'color', x.color) order by x.name), '[]'::jsonb)
      from public.crews x where exists (select 1 from public.crew_members m where m.crew_id = x.id and m.account_id = a and m.status = 'active')
        and (own or (x.id = c))),
    'crew', case when c is null then null else (select jsonb_build_object('id', x.id, 'name', x.name, 'badge', x.badge, 'color', x.color,
      'members', (select count(*) from public.crew_members m where m.crew_id = c and m.status = 'active'),
      -- the card's serial: the order they joined the crew
      'serial', (select count(*) from public.crew_members m, public.crew_members mine where m.crew_id = c and m.status = 'active'
        and mine.crew_id = c and mine.account_id = a and m.joined_at <= mine.joined_at)) from public.crews x where x.id = c) end,
    'season', season,
    'career', jsonb_build_object('hands', car.hands, 'nights', car.nights, 'wins', car.wins, 'top3', car.top3, 'showdowns', car.sd, 'showdowns_won', car.sdw,
      'bb', car.bb, 'hours', car.hours, 'bluffs', bluffs, 'achievements', n_ach),
    'milestones', jsonb_build_object(
      'values', jsonb_build_object('hands', car.hands, 'nights', car.nights, 'wins', car.wins, 'showdowns', car.sdw, 'bluffs', bluffs,
        'bb', greatest(floor(car.bb), 0), 'weeks', wk -> 'longest', 'achievements', n_ach),
      'seen', case when own then (select coalesce(jsonb_object_agg(x.track, x.value), '{}'::jsonb) from public.milestone_seen x where x.account_id = a) else '{}'::jsonb end),
    'nights', (select coalesce(jsonb_agg(jsonb_build_object('game', x.game_id, 'crew', x.crew_id, 'table', x.table_code, 'at', x.ended_at, 'started_at', x.started_at,
        'start_stack', x.start_stack, 'big_blind', x.big_blind, 'players', x.players, 'place', x.place, 'score', x.pts, 'league', x.league,
        'net', x.net, 'bb', x.bb, 'buyins', x.buyins,
        'achievements', (select coalesce(jsonb_agg(jsonb_build_object('id', y.achievement, 'tier', y.tier, 'hand', y.hand_no) order by y.hand_no nulls last), '[]'::jsonb)
          from public.achievements y where y.account_id = a and y.game_id = x.game_id and (own or y.shown))) || private.night_graph(x.game_id, x.player_key)
        order by x.ended_at desc), '[]'::jsonb)
      from (select * from private.profile_nights(a, scope) y order by y.ended_at desc limit 8) x),
    'heatmap', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'games', d.games, 'score', d.score, 'bb', d.bb, 'won', d.won,
        'achievements', (select count(*) from public.achievements y where y.account_id = a and (own or y.shown) and (y.earned_at at time zone 'Asia/Kolkata')::date = d.day
          and (y.reveal = 'now' or y.game_id is null or not exists (select 1 from public.games g where g.id = y.game_id and g.status = 'live'))),
        'list', d.list) order by d.day), '[]'::jsonb)
      from (select (x.ended_at at time zone 'Asia/Kolkata')::date as day, count(*)::int games, sum(x.pts) score, sum(x.bb) bb, bool_or(x.league and x.place = 1) won,
          jsonb_agg(jsonb_build_object('game', x.game_id, 'at', x.ended_at, 'place', x.place, 'players', x.players, 'score', x.pts, 'bb', x.bb, 'league', x.league) order by x.ended_at) list
        from private.profile_nights(a, scope) x where x.ended_at > now() - interval '371 days' group by 1) d),
    'moments', moments,
    'streaks', jsonb_build_object('wins', wins, 'top3', top3, 'weeks', wk),
    'history', hist,
    'achievements', ach,
    -- how many of the crew have each achievement ("2 of 7 in your crew have this"); never who
    'crew_has', case when c is null then '{}'::jsonb else (select coalesce(jsonb_object_agg(q.achievement, q.n), '{}'::jsonb) from (
      select x.achievement, count(distinct x.account_id)::int n from public.achievements x
      join public.crew_members m on m.account_id = x.account_id and m.crew_id = c and m.status = 'active'
      where x.reveal = 'now' or x.game_id is null or not exists (select 1 from public.games g where g.id = x.game_id and g.status = 'live')
      group by x.achievement) q) end,
    'card', private.card_json(a));
end $$;

-- ---------------------------------------------------------------- merging two accounts carries these over
-- (the same function as it is now, with one more step before the logins move: the earlier date of the two
-- is kept for an achievement both have, counters are added up, the card and the bars stay the newer account's
-- unless it has none)
do $$
declare d text; mark text := '  update public.account_logins set account_id = dst where account_id = src;';
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'merge_accounts';
  if d is null or position(mark in d) = 0 then raise exception 'merge_accounts is not as expected: the logins line was not found'; end if;
  execute replace(d, mark, '  perform private.merge_profile(src, dst);' || chr(10) || mark);
end $$;

create function private.merge_profile(src uuid, dst uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.achievements d set earned_at = s.earned_at, game_id = s.game_id, hand_no = s.hand_no, reveal = s.reveal, detail = s.detail
    from public.achievements s where s.account_id = src and d.account_id = dst and d.achievement = s.achievement and d.tier = s.tier and s.earned_at < d.earned_at;
  update public.achievements s set account_id = dst where s.account_id = src
    and not exists (select 1 from public.achievements d where d.account_id = dst and d.achievement = s.achievement and d.tier = s.tier);
  insert into public.achievement_counters (account_id, key, n) select dst, key, n from public.achievement_counters where account_id = src
    on conflict (account_id, key) do update set n = public.achievement_counters.n + excluded.n;
  update public.card_config set account_id = dst where account_id = src and not exists (select 1 from public.card_config where account_id = dst);
  update public.milestone_seen s set account_id = dst where s.account_id = src
    and not exists (select 1 from public.milestone_seen d where d.account_id = dst and d.track = s.track);
end $$;

-- ---------------------------------------------------------------- backups carry the new tables
create or replace function private.backup_tables() returns text[] language sql immutable set search_path = '' as $$
  select array['private.settings', 'public.accounts', 'public.account_logins', 'private.recovery_codes', 'public.crews', 'public.crew_members',
    'public.crew_invites', 'public.rescue_requests', 'public.crew_audit', 'public.seasons', 'public.games', 'public.game_players',
    'public.hands', 'public.hand_players', 'public.hand_cards_private', 'private.hand_records', 'public.trophies', 'public.result_changes',
    'public.offline_confirmations', 'public.push_subscriptions', 'private.problem_reports',
    'public.crew_codes', 'public.crew_requests', 'public.crew_invitations', 'public.crew_tables',
    'public.achievements', 'public.achievement_counters', 'private.achievement_calls', 'public.card_config', 'public.milestone_seen']
$$;

-- ---------------------------------------------------------------- who may call what
revoke all on function private.card_json(uuid), private.profile_nights(uuid, uuid), private.streak_of(boolean[], timestamptz[]), private.week_streak(date[], date),
  private.hand_tile(uuid, int, uuid, boolean), private.night_graph(uuid, text), private.merge_profile(uuid, uuid), private.backup_tables() from public, anon, authenticated;
revoke all on function public.record_achievements(text, text), public.save_card(jsonb), public.mark_profile_seen(jsonb), public.show_achievement(text, boolean),
  public.profile_news(), public.profile_page(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_achievements(text, text) to anon;
grant execute on function public.save_card(jsonb), public.mark_profile_seen(jsonb), public.show_achievement(text, boolean),
  public.profile_news(), public.profile_page(uuid, uuid) to authenticated;
