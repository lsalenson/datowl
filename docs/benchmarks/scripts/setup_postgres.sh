#!/usr/bin/env bash
# Throwaway PostgreSQL 16 cluster on port 55432, trust auth for role "datowl",
# with the Datowl test fixture plus a 200 000 x 3 benchmark table.
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDATA=${PGDATA:-/tmp/datowl-bench-pg}
PORT=${PORT:-55432}
REPO=$(cd "$(dirname "$0")/../../.." && pwd)

if [ "$(id -u)" = 0 ]; then RUN="runuser -u postgres --"; else RUN=""; fi
if [ ! -d "$PGDATA" ]; then
  mkdir -p "$PGDATA"; [ -n "$RUN" ] && chown postgres "$PGDATA"
  $RUN "$PGBIN/initdb" -D "$PGDATA" -U datowl --auth=trust >/dev/null
fi
$RUN "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1 || $RUN "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PORT -k /tmp" -l "$PGDATA/log" -w start

if ! psql -h localhost -p "$PORT" -U datowl -d postgres -tAc "select to_regclass('public.users')" | grep -q users; then
  psql -h localhost -p "$PORT" -U datowl -d postgres -q -f "$REPO/crates/infrastructure/postgres/tests/fixture.sql"
fi
psql -h localhost -p "$PORT" -U datowl -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
drop table if exists bench_rows;
create table bench_rows as
  select g::bigint as id, md5(g::text) as label, timestamptz '2026-01-01' + g * interval '1 second' as created_at
  from generate_series(1, 200000) g;
vacuum analyze bench_rows;
SQL
psql -h localhost -p "$PORT" -U datowl -d postgres -tAc "select version(); select count(*) from bench_rows; select pg_size_pretty(pg_total_relation_size('bench_rows'))"
