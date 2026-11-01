-- Phase 4 review: gaps found by going through league, history and replays again.

-- 1 + 8 + 9. Privacy and size. A stored hand used to be the engine's full record: it carried the shuffle
-- seed (from which anyone can rebuild the whole deck, folded hands included) and the previous hand's full
-- state. Now:
--   hands.record            the public replay: what everyone at the table saw, step by step (no engine needed)
--   hand_cards_private      each player's own hole cards, readable only by that player
--   private.hand_records    the full record, for audits and backups only (no phone can read it)
-- Replays (public and private parts) are kept 90 days; the hand row and its stats stay for ever.
create table public.hand_cards_private (
  game_id uuid not null,
  hand_no int not null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  cards text[] not null,
  primary key (game_id, hand_no, account_id),
  foreign key (game_id, hand_no) references public.hands(game_id, hand_no) on delete cascade
);
create index on public.hand_cards_private (account_id);
alter table public.hand_cards_private enable row level security;
create policy own_cards on public.hand_cards_private for select to authenticated using (account_id = (select private.me()));
revoke all on public.hand_cards_private from anon, authenticated;
grant select on public.hand_cards_private to authenticated;

create table private.hand_records (
  game_id uuid not null,
  hand_no int not null,
  record jsonb not null,
  primary key (game_id, hand_no),
  foreign key (game_id, hand_no) references public.hands(game_id, hand_no) on delete cascade
);
alter table public.hands alter column record drop not null;

-- what is already stored: keep the full record privately, and blank the public copy (it was the full record)
insert into private.hand_records (game_id, hand_no, record) select game_id, hand_no, record from public.hands where record is not null on conflict do nothing;
update public.hands set record = null;

-- 3. A hand that reaches the database after the game's end (a recorder catching up) is still stored, and
-- the game's stats are worked out again. Only a void game refuses hands.
create or replace function public.record_hand(p_body text, p_sig text) returns text
language plpgsql security definer set search_path = '' as $$
declare b jsonb; g jsonb; h jsonb; gid uuid; hno int; st text; p jsonb; acc uuid; c uuid; inserted boolean; cd jsonb;
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
  if st = 'void' then return 'game over'; end if;
  insert into public.hands (game_id, hand_no, played_at, deck_commit, pot, record)
    values (gid, hno, (h ->> 'playedAt')::timestamptz, h ->> 'deckCommit', (h ->> 'pot')::int, h -> 'replay')
    on conflict do nothing returning true into inserted;
  if inserted is null then return 'duplicate'; end if;
  if h ? 'full' then insert into private.hand_records (game_id, hand_no, record) values (gid, hno, h -> 'full') on conflict do nothing; end if;
  for p in select * from jsonb_array_elements(h -> 'players') loop
    acc := nullif(p ->> 'account', '')::uuid;
    if acc is not null and not exists (select 1 from public.accounts where id = acc) then acc := null; end if;
    insert into public.game_players (game_id, player_key, account_id, name) values (gid, p ->> 'key', acc, p ->> 'name')
      on conflict (game_id, player_key) do nothing;
    insert into public.hand_players (game_id, hand_no, player_key, account_id, net, vpip, pfr, showdown, won, best_hand)
      values (gid, hno, p ->> 'key', acc, (p ->> 'net')::int, coalesce((p ->> 'vpip')::boolean, false), coalesce((p ->> 'pfr')::boolean, false),
              coalesce((p ->> 'showdown')::boolean, false), coalesce((p ->> 'won')::boolean, false), (p ->> 'bestHand')::int);
    cd := p -> 'cards';
    if acc is not null and jsonb_typeof(cd) = 'array' then
      insert into public.hand_cards_private (game_id, hand_no, account_id, cards)
        values (gid, hno, acc, array(select jsonb_array_elements_text(cd))) on conflict do nothing;
    end if;
    if acc is not null and coalesce((p ->> 'won')::boolean, false) and coalesce((p ->> 'showdown')::boolean, false) and (p ->> 'bestHand')::int >= 7 then
      insert into public.trophies (account_id, crew_id, game_id, hand_no, kind)
        values (acc, c, gid, hno, case (p ->> 'bestHand')::int when 9 then 'royal_flush' when 8 then 'straight_flush' else 'four_of_a_kind' end)
        on conflict do nothing;
    end if;
  end loop;
  update public.games set hands = hands + 1 where id = gid;
  if st = 'ended' then perform private.score_game(gid); end if; -- arrived late: stats again
  return 'ok';
end $$;

-- 2. Recovering an old account with "add this phone's games" moved crews but not games, so the phone's
-- games dropped out of history. Merge now moves games, hands, own cards and trophies too.
create or replace function private.merge_accounts(src uuid, dst uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m record; d record;
begin
  if src = dst then return; end if;
  for m in select * from public.crew_members where account_id = src loop
    select * into d from public.crew_members where crew_id = m.crew_id and account_id = dst;
    if found then
      delete from public.crew_members where crew_id = m.crew_id and account_id = src;
      update public.crew_members set
        joined_at = least(d.joined_at, m.joined_at),
        status = case when d.status = 'active' or m.status = 'active' then 'active' else 'pending' end,
        role = case when 'owner' in (d.role, m.role) then 'owner'::public.crew_role
                    when 'admin' in (d.role, m.role) then 'admin'::public.crew_role else 'member'::public.crew_role end
      where crew_id = m.crew_id and account_id = dst;
    else
      update public.crew_members set account_id = dst where crew_id = m.crew_id and account_id = src;
    end if;
  end loop;
  update public.game_players set account_id = dst where account_id = src;
  update public.hand_players set account_id = dst where account_id = src;
  update public.hand_cards_private set account_id = dst where account_id = src
    and not exists (select 1 from public.hand_cards_private x where x.account_id = dst and x.game_id = hand_cards_private.game_id and x.hand_no = hand_cards_private.hand_no);
  update public.trophies set account_id = dst where account_id = src;
  update public.account_logins set account_id = dst where account_id = src;
  delete from public.accounts where id = src;
end $$;

-- 5. A void game takes its trophies with it.
create or replace function public.void_game(p_game uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.games; a uuid;
begin
  select * into g from public.games where id = p_game for update;
  if g is null or g.crew_id is null then raise exception 'Only crew games can be voided' using errcode = 'P0002'; end if;
  a := private.need_admin(g.crew_id);
  if g.status = 'void' then raise exception 'Already void' using errcode = '22023'; end if;
  update public.games set status = 'void', void_reason = p_reason where id = p_game;
  delete from public.trophies where game_id = p_game;
  insert into public.result_changes (game_id, actor, what, reason) values (p_game, a, 'void', p_reason);
end $$;

-- 7. Deleting an account: past results stay, but as "Former player" (they used to keep the real name).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); m record; heir uuid;
begin
  for m in select crew_id from public.crew_members where account_id = a and role = 'owner' loop
    select account_id into heir from public.crew_members
      where crew_id = m.crew_id and account_id <> a and status = 'active'
      order by (role = 'admin') desc, joined_at asc limit 1;
    if heir is null then delete from public.crews where id = m.crew_id;
    else
      update public.crew_members set role = 'member' where crew_id = m.crew_id and account_id = a;
      update public.crew_members set role = 'owner' where crew_id = m.crew_id and account_id = heir;
      insert into public.crew_audit (crew_id, actor, what, detail) values (m.crew_id, a, 'ownership_passed', jsonb_build_object('to', heir));
    end if;
  end loop;
  update public.accounts set name = 'Former player', avatar_url = null, settings = '{}'::jsonb, deleted_at = now() where id = a;
  update public.game_players set name = 'Former player' where account_id = a;
  delete from public.hand_cards_private where account_id = a;
  delete from public.account_logins where account_id = a;
  delete from private.recovery_codes where account_id = a;
end $$;

-- 8. Daily upkeep (called by the table server's daily job): close due seasons, and drop replays older than
-- 90 days (the hand rows and their stats stay; so does the full record of any hand that won a trophy).
create or replace function public.daily_upkeep(p_body text, p_sig text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare closed int; pruned int;
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
  return jsonb_build_object('seasons_closed', closed, 'replays_pruned', pruned);
end $$;

-- backups include the new tables
create or replace function private.backup_tables() returns text[] language sql immutable as $$
  select array['private.settings', 'public.accounts', 'public.account_logins', 'private.recovery_codes', 'public.crews', 'public.crew_members',
    'public.crew_invites', 'public.rescue_requests', 'public.crew_audit', 'public.seasons', 'public.games', 'public.game_players',
    'public.hands', 'public.hand_players', 'public.hand_cards_private', 'private.hand_records', 'public.trophies', 'public.result_changes']
$$;

revoke all on function public.daily_upkeep(text, text), private.merge_accounts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.daily_upkeep(text, text) to anon;
revoke all on function public.record_hand(text, text), public.void_game(uuid, text), public.delete_my_account() from public, anon, authenticated;
grant execute on function public.record_hand(text, text) to anon;
grant execute on function public.void_game(uuid, text), public.delete_my_account() to authenticated;
