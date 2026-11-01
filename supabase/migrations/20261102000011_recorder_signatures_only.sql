-- The table servers now sign every call (see migration 10, part 8): the old form, the token itself, is
-- no longer accepted.
create or replace function private.recorder_ok(body text, sig text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare k text := (select value from private.settings where key = 'recorder_token_hash'); parts text[]; ts bigint;
begin
  if k is null or sig is null or body is null then return false; end if;
  parts := string_to_array(sig, '.');
  if array_length(parts, 1) <> 3 or parts[1] <> 'v1' or parts[2] !~ '^[0-9]{10,16}$' then return false; end if;
  ts := parts[2]::bigint;
  if abs(extract(epoch from now()) * 1000 - ts) > 600000 then return false; end if;
  return encode(extensions.hmac(parts[2] || '.' || body, k, 'sha256'), 'hex') = lower(parts[3]);
end $$;
revoke all on function private.recorder_ok(text, text) from public, anon, authenticated;
alter function private.backup_tables() set search_path = ''; -- (database linter: every function pins its search path)
