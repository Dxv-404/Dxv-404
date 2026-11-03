-- Games a phone played as a guest join its profile when it claims them.
begin;
set search_path = public, extensions;
select plan(9);

\set U1 '''00000000-0000-0000-0000-00000000f001'''
\set U2 '''00000000-0000-0000-0000-00000000f002'''
\set G1 '''00000000-0000-0000-0000-00000000f101'''
\set G2 '''00000000-0000-0000-0000-00000000f102'''

select testing.one(:U1, $$select (public.ensure_account('Dev')).id$$) as dev \gset
select testing.one(:U2, $$select (public.ensure_account('Riya')).id$$) as riya \gset
insert into public.games (id, table_code, server, start_stack, big_blind, started_at, status) values
  (:G1, 'ABCD', 'test', 1000, 20, now() - interval '2 days', 'ended'),
  (:G2, 'EFGH', 'test', 1000, 20, now() - interval '1 day', 'ended');
insert into public.game_players (game_id, player_key, account_id, name) values
  (:G1, 'gGuestSeat01', null, 'Dev'), (:G1, 'gOtherGuest9', null, 'Kabir'),
  (:G2, 'gGuestSeat01', null, 'Dev'), (:G2, :'dev', :'dev', 'Dev');
insert into public.hands (game_id, hand_no, played_at, deck_commit, pot, record) values (:G1, 1, now() - interval '2 days', 'x', 80, '{}');
insert into public.hand_players (game_id, hand_no, player_key, account_id, net) values (:G1, 1, 'gGuestSeat01', null, 40), (:G1, 1, 'gOtherGuest9', null, -40);

select is(testing.one(null, $$select public.claim_guest_games('gGuestSeat01')$$), 'permission denied for function claim_guest_games', 'not without signing in');
select is(testing.one(:U1, $$select public.claim_guest_games('not-a-guest')$$), 'Not a guest seat', 'only guest seats');
select is(testing.one(:U1, $$select public.claim_guest_games('gGuestSeat01') ->> 'games'$$), '1', 'the phone claims its guest games');
select is((select account_id from public.game_players where game_id = :G1 and player_key = 'gGuestSeat01'), :'dev'::uuid, 'the game is Dev''s now');
select is((select account_id from public.hand_players where game_id = :G1 and player_key = 'gGuestSeat01'), :'dev'::uuid, 'and its hands');
select is((select account_id from public.game_players where game_id = :G2 and player_key = 'gGuestSeat01'), null, 'not a game where Dev already had a seat');
select is((select account_id from public.game_players where player_key = 'gOtherGuest9'), null, 'other guests stay theirs');
select is(testing.one(:U2, $$select public.claim_guest_games('gGuestSeat01') ->> 'taken'$$), 'true', 'a guest seat is claimed once');
select is(testing.one(:U1, $$select public.claim_guest_games('gGuestSeat01') ->> 'games'$$), '0', 'claiming again is harmless');

select * from finish();
rollback;
