-- Games played on a phone before it had a profile were recorded under the phone's guest seat (player_key
-- 'g…', no account), so they never reached anyone's history or replays. When the phone makes (or already has)
-- a profile, it claims them: the guest seat's game and hand rows become the account's.
--   * the guest id is the phone's own (kept on the phone); a guest id can be claimed once, by one account;
--   * only rows nobody owns yet, and never a game where the account already has a seat of its own.
create table private.claimed_guests (
  guest text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  at timestamptz not null default now()
);

create or replace function public.claim_guest_games(p_guest text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a uuid := private.need_me(); owner uuid; n int := 0;
begin
  if p_guest is null or p_guest !~ '^g[A-Za-z0-9_-]{8,40}$' then raise exception 'Not a guest seat' using errcode = '22023'; end if;
  select account_id into owner from private.claimed_guests where guest = p_guest;
  if owner is not null and owner <> a then return jsonb_build_object('games', 0, 'taken', true); end if;
  insert into private.claimed_guests (guest, account_id) values (p_guest, a) on conflict (guest) do nothing;
  update public.game_players gp set account_id = a
    where gp.player_key = p_guest and gp.account_id is null
      and not exists (select 1 from public.game_players x where x.game_id = gp.game_id and x.account_id = a);
  get diagnostics n = row_count;
  update public.hand_players hp set account_id = a
    where hp.player_key = p_guest and hp.account_id is null
      and exists (select 1 from public.game_players gp where gp.game_id = hp.game_id and gp.player_key = p_guest and gp.account_id = a);
  return jsonb_build_object('games', n, 'taken', false);
end $$;

revoke all on table private.claimed_guests from public, anon, authenticated;
revoke all on function public.claim_guest_games(text) from public, anon, authenticated;
grant execute on function public.claim_guest_games(text) to authenticated;
