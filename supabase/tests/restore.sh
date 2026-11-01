#!/bin/bash
# A backup restores into a fresh project: fill database A, export, restore into a brand-new database B
# (same migrations, nothing else), then every table must match row for row, and an old recovery code
# must still work on B.
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL="psql -h ${PGHOST:-/tmp} -p ${PGPORT:-54329} -U postgres -v ON_ERROR_STOP=1 -q -X"
A=tp_bak_a_$$; B=tp_bak_b_$$; F=$(mktemp)
trap '$PSQL -d postgres -c "drop database if exists $A" -c "drop database if exists $B" >/dev/null; rm -f $F' EXIT
for d in $A $B; do
  $PSQL -d postgres -c "create database $d" >/dev/null
  $PSQL -d $d -f tests/local-shim.sql >/dev/null
  for m in migrations/*.sql; do $PSQL -d $d -f "$m" >/dev/null; done
done
# some of everything in A
$PSQL -d $A -tA >/dev/null <<'SQL'
select testing.one('00000000-0000-0000-0000-00000000b001', $$select (public.ensure_account('Rahul')).id$$);
select testing.one('00000000-0000-0000-0000-00000000b002', $$select (public.ensure_account('Riya')).id$$);
select testing.one('00000000-0000-0000-0000-00000000b001', $$select (public.create_crew('Backup crew')).id$$) as crew \gset
select testing.one('00000000-0000-0000-0000-00000000b001', $$select public.create_invite('$$ || :'crew' || $$')$$) as inv \gset
select testing.one('00000000-0000-0000-0000-00000000b002', $$select public.join_crew('$$ || :'inv' || $$')$$);
select testing.one('00000000-0000-0000-0000-00000000b001', $$select public.new_recovery_code()$$) as code \gset
insert into private.settings values ('restore_test_code', :'code');
select (select id from accounts where name = 'Rahul') as rahul, (select id from accounts where name = 'Riya') as riya \gset
create temp table b(body text);
insert into b select format('{"game":{"id":"22222222-2222-4222-8222-000000000001","crew":"%s","table":"BK01","server":"test","startStack":1000,"bigBlind":20,"startedAt":"2026-11-02T10:00:00Z"},"hand":{"no":%s,"playedAt":"2026-11-02T10:0%s:00Z","deckCommit":"c","pot":40,"replay":{"v":1,"frames":[]},"full":{"inputs":[{"t":"start"}]},"players":[{"key":"%s","account":"%s","name":"Rahul","net":20,"won":true,"cards":["As","Kd"]},{"key":"%s","account":"%s","name":"Riya","net":-20,"cards":["2c","2d"]}]}}', :'crew', n, n, :'rahul', :'rahul', :'riya', :'riya') from generate_series(1, 5) n;
insert into private.settings values ('recorder_token_hash', encode(extensions.digest('test-recorder-token', 'sha256'), 'hex')) on conflict (key) do update set value = excluded.value;
select public.record_hand(body, testing.sign('test-recorder-token', body)) from b;
select public.record_game_end(x, testing.sign('test-recorder-token', x))
  from (select format('{"game":{"id":"22222222-2222-4222-8222-000000000001","crew":"%s","table":"BK01","server":"test","startStack":1000,"bigBlind":20,"startedAt":"2026-11-02T10:00:00Z"},"endedAt":"2026-11-02T11:00:00Z","players":[{"key":"%s","account":"%s","name":"Rahul","buyins":1000,"final":1100},{"key":"%s","account":"%s","name":"Riya","buyins":1000,"final":900}]}', :'crew', :'rahul', :'rahul', :'riya', :'riya') x) s;
SQL
# export (as the table server would ask for it) and restore into B
$PSQL -d $A -tA -c "select public.export_backup('nightly', testing.sign('test-recorder-token', 'nightly'))" > $F
# the new project has its own recorder key (a backup never carries one)
$PSQL -d $B -c "insert into private.settings values ('recorder_token_hash', encode(extensions.digest('test-recorder-token', 'sha256'), 'hex'))" >/dev/null
echo "backup: $(wc -c < $F) bytes"
echo "select private.import_backup(:'backup'::jsonb)" | $PSQL -d $B -tA -v backup="$(cat $F)" >/dev/null
# every table identical
sum() { $PSQL -d $1 -tA -c "select string_agg(t || '=' || n || ':' || h, ' ' order by t) from (select t, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %s', t), false, true, '')))[1]::text n, (xpath('/row/h/text()', query_to_xml(format('select md5(coalesce(string_agg(to_jsonb(x)::text, ''|'' order by to_jsonb(x)::text), '''')) as h from %s x', t), false, true, '')))[1]::text h from unnest(private.backup_tables()) t) s"; }
SA=$(sum $A); SB=$(sum $B)
if [ "$SA" != "$SB" ]; then echo "MISMATCH"; diff <(tr ' ' '\n' <<<"$SA") <(tr ' ' '\n' <<<"$SB"); exit 1; fi
echo "restore: all $(tr ' ' '\n' <<<"$SA" | wc -l) tables identical ($(tr ' ' '\n' <<<"$SA" | grep -o '=[0-9]*' | tr -d = | paste -sd+ | bc) rows)"
# the old recovery code works on the restored copy (a phone there has never signed in before)
CODE=$($PSQL -d $B -tA -c "select value from private.settings where key = 'restore_test_code'")
NAME=$($PSQL -d $B -tA -c "select testing.one('00000000-0000-0000-0000-00000000b0ff', \$\$select (public.recover_account('$CODE')).name\$\$)")
[ "$NAME" = "Rahul" ] && echo "restore: recovery code works on the restored copy" || { echo "recovery on restored copy failed: $NAME"; exit 1; }
# identity counters continue (new rows do not collide with restored ones)
$PSQL -d $B -tA -c "insert into public.crew_audit (crew_id, what) select id, 'after_restore' from public.crews limit 1" >/dev/null && echo "restore: new rows after restore are fine"
