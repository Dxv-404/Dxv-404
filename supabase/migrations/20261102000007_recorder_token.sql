-- Table servers prove who they are with a recorder token. The database keeps only its SHA-256 hash, so
-- neither the database, a backup of it, nor anyone reading this project can produce results. The token
-- itself lives only in the table servers' secret settings.
-- The hash is set once per project (outside this file):
--   insert into private.settings values ('recorder_token_hash', '<sha256 hex>') on conflict (key) do update set value = excluded.value;
delete from private.settings where key = 'recorder_key';
create or replace function private.recorder_ok(body text, sig text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(encode(extensions.digest(coalesce(sig, ''), 'sha256'), 'hex') = (select value from private.settings where key = 'recorder_token_hash'), false)
$$;
revoke all on function private.recorder_ok(text, text) from public, anon, authenticated;
