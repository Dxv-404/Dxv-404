-- Advisor follow-up: index the remaining foreign keys of the Phase 4 tables.
create index if not exists result_changes_actor_idx on public.result_changes (actor);
create index if not exists trophies_game_idx on public.trophies (game_id);
create index if not exists trophies_season_idx on public.trophies (season_id);
