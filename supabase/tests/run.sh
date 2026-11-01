#!/bin/bash
# Runs the database tests on a fresh local database: Supabase stand-in, every migration, then every
# tests/*.test.sql file. Fails if any test fails or a file does not finish its plan.
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL="psql -h ${PGHOST:-/tmp} -p ${PGPORT:-54329} -U postgres -v ON_ERROR_STOP=1 -q -X"
DB=tp_test_$$
$PSQL -d postgres -c "create database $DB" >/dev/null
trap '$PSQL -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
$PSQL -d $DB -f tests/local-shim.sql >/dev/null
for m in migrations/*.sql; do $PSQL -d $DB -f "$m" >/dev/null; done
fail=0; total=0
for t in tests/*.test.sql; do
  out=$($PSQL -d $DB -tA -f "$t" 2>&1) || { echo "$out"; echo "FAILED (error) $t"; fail=1; continue; }
  n=$(grep -cE '^ok ' <<<"$out" || true); bad=$(grep -E '^not ok' <<<"$out" || true)
  total=$((total + n))
  if [ -n "$bad" ] || grep -qE '^# Looks like' <<<"$out"; then echo "$out" | grep -vE '^ok '; echo "FAILED $t"; fail=1; else echo "ok   $t ($n tests)"; fi
done
echo "database tests: $total passed"
bash tests/restore.sh || fail=1
exit $fail
