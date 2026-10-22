#!/usr/bin/env bash
# Tests room geometry columns and the room_features table
# against a scratch Postgres. Supabase's auth schema is stubbed (auth.uid() reads request.jwt.claim.sub).
# Usage: PGHOST=/tmp/pg PGPORT=54329 PGUSER=postgres ./supabase/tests/model_test.sh
# Creates and drops a database named vs_model_test. Never point this at real data.
set -u
DB=vs_model_test
HERE="$(cd "$(dirname "$0")" && pwd)"
ADMIN="psql -d postgres -q -t -A -v ON_ERROR_STOP=1"
P="psql -d $DB -q -t -A"
fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (expected '$2', got '$3')"; fail=1; fi; }
expect_error() { case "$3" in *"$2"*) echo "PASS  $1";; *) echo "FAIL  $1 (got: $3)"; fail=1;; esac; }
last() { grep -v '^$' | tail -1; }

# Guest resources: owner-only, web links or PDFs only.
as_user $A "insert into room_resources(room_id,kind,title,url) values ('$RA','link','Hot tub guide','https://example.com/tub');" >/dev/null
check "owner can attach a link" "1" "$($P -c "select count(*) from room_resources where room_id='$RA'")"
check "other owner cannot see it" "0" "$(as_user $B "select count(*) from room_resources;" | last)"
expect_error "non-web link is rejected" "check" "$(as_user $A "insert into room_resources(room_id,kind,title,url) values ('$RA','link','x','javascript:alert(1)');")"
expect_error "a pdf needs a stored file" "check" "$(as_user $A "insert into room_resources(room_id,kind,title) values ('$RA','pdf','x');")"
as_user $B "insert into room_resources(room_id,kind,title,url) values ('$RA','link','sneaky','https://example.com');" >/dev/null 2>&1
check "other owner cannot attach to my room" "1" "$($P -c "select count(*) from room_resources where room_id='$RA'")"

$ADMIN -c "drop database if exists $DB" -c "create database $DB" || exit 1
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
$P -c "grant usage on schema public to anon, authenticated;
       grant select, insert, update, delete on all tables in schema public to anon, authenticated;" >/dev/null

if $P -v ON_ERROR_STOP=1 -f "$HERE/../migrations/20261023000000_property_model.sql" >/dev/null 2>&1; then
  echo "PASS  model migration is idempotent"; else echo "FAIL  model migration is not idempotent"; fail=1; fi

A=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
B=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
PA=00000000-0000-0000-0000-00000000000a
PB=00000000-0000-0000-0000-00000000000b
RA=00000000-0000-0000-0000-0000000000a1
RB=00000000-0000-0000-0000-0000000000b1
$P -c "insert into properties(id,owner_id,name) values ('$PA','$A','A house'),('$PB','$B','B house');
       insert into rooms(id,property_id,name) values ('$RA','$PA','A room'),('$RB','$PB','B room');" >/dev/null

as_user() { # user id (empty for anon), sql
  if [ -n "$1" ]; then $P -c "set role authenticated; select set_config('request.jwt.claim.sub','$1',false); $2" 2>&1
  else $P -c "set role anon; $2" 2>&1; fi
}

as_user $A "update rooms set width_m=4.5, length_m=3.2, height_m=2.7, floor=1, plan_x=0, plan_y=0 where id='$RA';" >/dev/null
check "owner can set room geometry" "4.50|3.20|1" "$($P -c "select width_m, length_m, floor from rooms where id='$RA'")"
as_user $A "update rooms set width_m=9 where id='$RB';" >/dev/null
check "owner cannot size another owner's room" "" "$($P -c "select width_m from rooms where id='$RB'")"
expect_error "absurd room size is rejected" "rooms_layout_range" "$(as_user $A "update rooms set width_m=500 where id='$RA';")"
expect_error "absurd floor is rejected" "rooms_layout_range" "$(as_user $A "update rooms set floor=99 where id='$RA';")"

as_user $A "insert into room_features(room_id,kind,name,pos_x,pos_y) values ('$RA','hot_tub','Hot tub',0.25,0.75),('$RA','fireplace','Gas fireplace',0.5,0.1);" >/dev/null
check "owner can add features to own room" "2" "$($P -c "select count(*) from room_features where room_id='$RA'")"
expect_error "owner cannot add a feature to another owner's room" "row-level security" "$(as_user $A "insert into room_features(room_id,kind,name) values ('$RB','tv','sneaky');")"
as_user $B "insert into room_features(room_id,kind,name) values ('$RB','tv','TV');" >/dev/null
check "A sees only own features" "2" "$(as_user $A "select count(*) from room_features;" | last)"
check "B sees only own features" "1" "$(as_user $B "select count(*) from room_features;" | last)"
check "anon sees no features" "0" "$(as_user "" "select count(*) from room_features;" | last)"
as_user $A "update room_features set name='hacked' where room_id='$RB';" >/dev/null
check "A cannot edit B's features" "TV" "$($P -c "select name from room_features where room_id='$RB'")"
as_user $A "delete from room_features where room_id='$RB';" >/dev/null
check "A cannot delete B's features" "1" "$($P -c "select count(*) from room_features where room_id='$RB'")"

expect_error "unknown feature kind is rejected" "check" "$(as_user $A "insert into room_features(room_id,kind,name) values ('$RA','rocket','x');")"
expect_error "empty feature name is rejected" "check" "$(as_user $A "insert into room_features(room_id,kind,name) values ('$RA','tv','');")"
expect_error "position outside the room is rejected" "check" "$(as_user $A "insert into room_features(room_id,kind,name,pos_x) values ('$RA','tv','TV',1.5);")"

# Status is read from the ledger, never stored on the feature: a status entry chains like any other.
F=$($P -c "select id from room_features where room_id='$RA' and kind='hot_tub'")
$P -c "insert into room_state_ledger(room_id, actor_role, event_type, payload)
       values ('$RA','manager','feature_status', jsonb_build_object('featureId','$F','status','out_of_service','note','pump'));" >/dev/null
check "feature status entry is recorded and chains" "t" "$($P -c "select ok from verify_room_chain('$RA')")"

$P -c "delete from rooms where id='$RB'" >/dev/null 2>&1
check "deleting a room removes its features" "0" "$($P -c "select count(*) from room_features where room_id='$RB'")"

$ADMIN -c "drop database if exists $DB" >/dev/null 2>&1 || { echo "FAIL  could not drop $DB"; fail=1; }
[ $fail -eq 0 ] && echo "ALL PASSED"
exit $fail
