-- Everything the achievements history run needs for one crew, as one JSON value. READ-ONLY: a single
-- SELECT, nothing is written. Run it as the database owner (it reads private.hand_records, which holds
-- every player's hole cards: keep the file to yourself and delete it afterwards), with the crew's id in
-- place of :crew, and save the one value it returns as a file:
--
--   psql "$DATABASE_URL" -At -v crew="'<crew uuid>'" -f tools/achievements/export.sql > crew-export.json
--   pnpm --filter @tp/achievements-tools build && node tools/achievements/dist/history.mjs crew-export.json
--
-- (In the Supabase SQL editor: replace :crew by hand and download the result.)
select jsonb_build_object(
  'v', 1,
  'crew', (select jsonb_build_object('id', c.id, 'name', c.name) from public.crews c where c.id = :crew),
  'members', (select coalesce(jsonb_agg(jsonb_build_object('account', m.account_id, 'name', a.name, 'joined', m.joined_at)), '[]'::jsonb)
    from public.crew_members m join public.accounts a on a.id = m.account_id where m.crew_id = :crew and m.status = 'active'),
  'seasons', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', coalesce(s.title, s.name), 'ends', s.ends_at, 'closed', s.closed_at,
      'ranks', (select coalesce(jsonb_agg(jsonb_build_object('account', l.account_id, 'rank', l.rank)), '[]'::jsonb) from private.league_standings(:crew, s.id, false) l)) order by s.starts_at), '[]'::jsonb)
    from public.seasons s where s.crew_id = :crew),
  'games', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'table', g.table_code, 'started', g.started_at, 'ended', g.ended_at,
      'start_stack', g.start_stack, 'big_blind', g.big_blind, 'casual', g.casual, 'season', g.season_id,
      'host', (select t.opened_by from public.crew_tables t where t.crew_id = g.crew_id and t.table_code = g.table_code and t.opened_at <= g.started_at order by t.opened_at desc limit 1),
      'players', (select jsonb_agg(jsonb_build_object('key', p.player_key, 'account', p.account_id, 'name', p.name, 'place', p.place, 'net', p.net, 'buyins', p.buyins, 'hands', p.hands))
        from public.game_players p where p.game_id = g.id)) order by g.started_at), '[]'::jsonb)
    from public.games g where g.crew_id = :crew and g.status = 'ended'),
  'hands', (select coalesce(jsonb_agg(jsonb_build_object('game', r.game_id, 'no', r.hand_no, 'record', r.record) order by g.started_at, r.hand_no), '[]'::jsonb)
    from private.hand_records r join public.games g on g.id = r.game_id where g.crew_id = :crew and g.status = 'ended')
) as export;
