#!/usr/bin/env bash
# Tests the RLS migration against a scratch Postgres. Supabase's auth schema is stubbed:
# auth.uid() reads the request.jwt.claim.sub setting, as Supabase does.
# Usage: PGHOST=/tmp/pg PGPORT=54329 PGUSER=postgres ./supabase/tests/rls_test.sh
# Creates and drops a database named vs_rls_test. Never point this at real data.
set -u
DB=vs_rls_test
HERE="$(cd "$(dirname "$0")" && pwd)"
ADMIN="psql -d postgres -q -t -A -v ON_ERROR_STOP=1"
P="psql -d $DB -q -t -A"
fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (expected '$2', got '$3')"; fail=1; fi; }

$ADMIN -c "drop database if exists $DB" -c "create database $DB" || exit 1
# Roles are cluster-wide; create if missing.
$ADMIN -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end \$\$"

$P -v ON_ERROR_STOP=1 -c "
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;" >/dev/null || exit 1
for f in "$HERE"/../migrations/*.sql; do
  $P -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "FAIL  migration $(basename "$f")"; exit 1; }
done
# Supabase grants table access to its API roles by default; RLS is what restricts it.
$P -c "grant select, insert, update, delete, truncate on all tables in schema public to anon, authenticated;
       grant usage on all sequences in schema public to anon, authenticated;
       grant execute on all functions in schema public to anon, authenticated;" >/dev/null

A=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
B=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
PA=00000000-0000-0000-0000-00000000000a
PB=00000000-0000-0000-0000-00000000000b
RA=00000000-0000-0000-0000-0000000000a1
RB=00000000-0000-0000-0000-0000000000b1

# Seed as the table owner (bypasses RLS, like the service role).
$P -c "insert into properties(id,owner_id,name) values ('$PA','$A','A house'),('$PB','$B','B house');
       insert into rooms(id,property_id,name) values ('$RA','$PA','A room'),('$RB','$PB','B room');
       insert into reservations(property_id,starts_at,ends_at) values ('$PA',now(),now()+interval '1 day'),('$PB',now(),now()+interval '1 day');
       insert into room_state_ledger(room_id,actor_role,event_type) values ('$RA','crew','clean_start'),('$RB','crew','clean_start');"

# run SQL as an authenticated user (or anon when user is empty)
as_user() { # user_id, sql
  if [ -n "$1" ]; then
    $P -c "set role authenticated; select set_config('request.jwt.claim.sub','$1',false); $2" 2>&1 | tail -n +1
  else
    $P -c "set role anon; $2" 2>&1
  fi
}
last() { tail -n 1; }

check "A sees only own property" "A house" "$(as_user $A "select string_agg(name, ',') from properties;" | grep -v '^set_config' | grep -v '^$' | tail -1)"
check "A sees only own room" "A room" "$(as_user $A "select string_agg(name, ',') from rooms;" | grep -v '^$' | tail -1)"
check "A sees only own reservation (count)" "1" "$(as_user $A "select count(*) from reservations;" | grep -v '^$' | tail -1)"
check "A reads own ledger rows" "1" "$(as_user $A "select count(*) from room_state_ledger;" | grep -v '^$' | tail -1)"
check "B cannot see A's ledger" "B room" "$(as_user $B "select string_agg(r.name, ',') from room_state_ledger l join rooms r on r.id=l.room_id;" | grep -v '^$' | tail -1)"
check "anon sees nothing" "0" "$(as_user "" "select count(*) from properties;" | grep -v '^$' | tail -1)"

out="$(as_user $A "insert into properties(owner_id,name) values ('$B','stolen');")"
case "$out" in *"row-level security"*) echo "PASS  A cannot create a property owned by B";; *) echo "FAIL  A created property for B: $out"; fail=1;; esac

out="$(as_user $A "insert into rooms(property_id,name) values ('$PB','sneaky');")"
case "$out" in *"row-level security"*) echo "PASS  A cannot add a room to B's property";; *) echo "FAIL  A added room to B: $out"; fail=1;; esac

as_user $A "insert into properties(owner_id,name) values ('$A','second');" >/dev/null
check "A can create own property" "1" "$($P -c "select count(*) from properties where owner_id='$A' and name='second'")"

out="$(as_user $A "insert into room_state_ledger(room_id,actor_role,event_type) values ('$RA','manager','forged');")"
case "$out" in *"row-level security"*) echo "PASS  owner cannot write ledger directly";; *) echo "FAIL  owner wrote ledger: $out"; fail=1;; esac

as_user $A "update properties set name='x' where id='$PB';" >/dev/null
check "A cannot update B's property" "B house" "$($P -c "select name from properties where id='$PB'")"
as_user $A "delete from properties where id='$PB';" >/dev/null
check "A cannot delete B's property" "1" "$($P -c "select count(*) from properties where id='$PB'")"
as_user $A "update properties set name='A renamed' where id='$PA';" >/dev/null
check "A can update own property" "A renamed" "$($P -c "select name from properties where id='$PA'")"

check "A verifies own chain" "t" "$(as_user $A "select ok from verify_room_chain('$RA');" | grep -v '^$' | tail -1)"
check "A verifying B's room sees an empty chain (0 checked)" "0" "$(as_user $A "select checked from verify_room_chain('$RB');" | grep -v '^$' | tail -1)"

$ADMIN -c "drop database $DB" || { echo "FAIL  could not drop $DB"; fail=1; }
[ $fail -eq 0 ] && echo "ALL PASSED" || { echo "FAILURES"; exit 1; }
