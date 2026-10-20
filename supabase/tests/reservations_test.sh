#!/usr/bin/env bash
# Tests the reservation-details migration against a scratch Postgres (Supabase's auth schema is
# stubbed so the RLS migration applies). Creates and drops a database named vs_reservations_test.
# Usage: PGHOST=/tmp/pg PGPORT=54329 PGUSER=postgres ./supabase/tests/reservations_test.sh
set -u
DB=vs_reservations_test
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG_DIR="$HERE/../migrations"
ADMIN="psql -d postgres -q -t -A -v ON_ERROR_STOP=1"
P="psql -d $DB -q -t -A"
fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (expected '$2', got '$3')"; fail=1; fi; }
rejects() { # name, expected-text, sql
  out="$($P -c "$3" 2>&1)"
  case "$out" in *"$2"*) echo "PASS  $1";; *) echo "FAIL  $1 (got: $out)"; fail=1;; esac
}

$ADMIN -c "drop database if exists $DB" -c "create database $DB" || exit 1
$ADMIN -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end \$\$"
$P -v ON_ERROR_STOP=1 -c "
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;" >/dev/null || exit 1
for f in "$MIG_DIR"/*.sql; do
  $P -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "FAIL  migration $(basename "$f")"; exit 1; }
done

P1=00000000-0000-0000-0000-00000000000a
P2=00000000-0000-0000-0000-00000000000b
$P -c "insert into properties(id,owner_id,name) values ('$P1', gen_random_uuid(), 'One'), ('$P2', gen_random_uuid(), 'Two')"

check "property timezone defaults to America/New_York" "America/New_York" "$($P -c "select timezone from properties where id='$P1'")"

$P -c "insert into reservations(property_id,starts_at,ends_at) values ('$P1','2026-11-01 16:00+00','2026-11-04 11:00+00')"
check "source defaults to direct" "direct" "$($P -c "select source from reservations where property_id='$P1'")"

rejects "overlapping stay is rejected" "reservations_no_overlap" \
  "insert into reservations(property_id,starts_at,ends_at) values ('$P1','2026-11-03 12:00+00','2026-11-06 11:00+00')"
rejects "stay fully inside another is rejected" "reservations_no_overlap" \
  "insert into reservations(property_id,starts_at,ends_at) values ('$P1','2026-11-02 12:00+00','2026-11-03 11:00+00')"

$P -c "insert into reservations(property_id,starts_at,ends_at) values ('$P1','2026-11-04 11:00+00','2026-11-07 11:00+00')" 2>&1 | grep -q ERROR \
  && { echo "FAIL  same-day turnover rejected"; fail=1; } || echo "PASS  same-day turnover (checkout time = next check-in) allowed"

$P -c "insert into reservations(property_id,starts_at,ends_at) values ('$P2','2026-11-01 16:00+00','2026-11-04 11:00+00')" 2>&1 | grep -q ERROR \
  && { echo "FAIL  same dates on another property rejected"; fail=1; } || echo "PASS  same dates on a different property allowed"

rejects "unknown source is rejected" "reservations_source_check" \
  "insert into reservations(property_id,starts_at,ends_at,source) values ('$P2','2026-12-01 16:00+00','2026-12-02 11:00+00','craigslist')"
rejects "checkout before check-in is still rejected" "check constraint" \
  "insert into reservations(property_id,starts_at,ends_at) values ('$P2','2026-12-05 16:00+00','2026-12-04 11:00+00')"

$P -v ON_ERROR_STOP=1 -f "$MIG_DIR/20261020000000_reservation_details.sql" >/dev/null 2>&1 \
  && echo "PASS  migration can be re-applied (idempotent)" || { echo "FAIL  migration is not idempotent"; fail=1; }

$ADMIN -c "drop database $DB" || { echo "FAIL  could not drop $DB"; fail=1; }
[ $fail -eq 0 ] && echo "ALL PASSED" || { echo "FAILURES"; exit 1; }
