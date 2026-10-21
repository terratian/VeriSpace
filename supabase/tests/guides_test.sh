#!/usr/bin/env bash
# Tests the guide tables (room_content, room_checklist_items) and the property procedure fields
# against a scratch Postgres. Supabase's auth schema is stubbed (auth.uid() reads request.jwt.claim.sub).
# Usage: PGHOST=/tmp/pg PGPORT=54329 PGUSER=postgres ./supabase/tests/guides_test.sh
# Creates and drops a database named vs_guides_test. Never point this at real data.
set -u
DB=vs_guides_test
HERE="$(cd "$(dirname "$0")" && pwd)"
ADMIN="psql -d postgres -q -t -A -v ON_ERROR_STOP=1"
P="psql -d $DB -q -t -A"
fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (expected '$2', got '$3')"; fail=1; fi; }
expect_error() { case "$3" in *"$2"*) echo "PASS  $1";; *) echo "FAIL  $1 (got: $3)"; fail=1;; esac; }
last() { grep -v '^$' | tail -1; }

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

if $P -v ON_ERROR_STOP=1 -f "$HERE/../migrations/20261022000000_property_guides.sql" >/dev/null 2>&1; then
  echo "PASS  guides migration is idempotent"; else echo "FAIL  guides migration is not idempotent"; fail=1; fi

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

as_user $A "insert into room_content(room_id,kind,title,body) values ('$RA','allergen','Feather pillows','Two sofa pillows');" >/dev/null
as_user $A "insert into room_checklist_items(room_id,label,requires_photo) values ('$RA','Empty bins',false),('$RA','Photograph sofa',true);" >/dev/null
check "owner can add content and tasks to own room" "1|2" "$($P -c "select (select count(*) from room_content where room_id='$RA'), (select count(*) from room_checklist_items where room_id='$RA')")"

expect_error "owner cannot add content to another owner's room" "row-level security" "$(as_user $A "insert into room_content(room_id,kind,title) values ('$RB','note','sneaky');")"
expect_error "owner cannot add tasks to another owner's room" "row-level security" "$(as_user $A "insert into room_checklist_items(room_id,label) values ('$RB','sneaky');")"

as_user $B "insert into room_content(room_id,kind,title) values ('$RB','tutorial','Thermostat');" >/dev/null
as_user $B "insert into room_checklist_items(room_id,label) values ('$RB','Wipe counters');" >/dev/null
check "A sees only own content" "1" "$(as_user $A "select count(*) from room_content;" | last)"
check "B sees only own tasks" "1" "$(as_user $B "select count(*) from room_checklist_items;" | last)"
check "anon sees no content" "0" "$(as_user "" "select count(*) from room_content;" | last)"

as_user $A "update room_content set title='hacked' where room_id='$RB';" >/dev/null
check "A cannot edit B's content" "Thermostat" "$($P -c "select title from room_content where room_id='$RB'")"
as_user $A "delete from room_checklist_items where room_id='$RB';" >/dev/null
check "A cannot delete B's tasks" "1" "$($P -c "select count(*) from room_checklist_items where room_id='$RB'")"

as_user $A "update properties set checkin_instructions='Door code 4821', house_rules='No parties' where id='$PA';" >/dev/null
check "owner can save procedures" "Door code 4821|No parties" "$($P -c "select checkin_instructions, house_rules from properties where id='$PA'")"
as_user $A "update properties set house_rules='hacked' where id='$PB';" >/dev/null
check "A cannot change B's procedures" "none" "$($P -c "select coalesce(house_rules,'none') from properties where id='$PB'")"

expect_error "unknown content kind is rejected" "check constraint" "$($P -c "insert into room_content(room_id,kind,title) values ('$RA','bogus','x')" 2>&1)"
expect_error "empty title is rejected" "check constraint" "$($P -c "insert into room_content(room_id,kind,title) values ('$RA','note','')" 2>&1)"
expect_error "oversized details are rejected" "check constraint" "$($P -c "insert into room_content(room_id,kind,title,body) values ('$RA','note','x',repeat('x',2001))" 2>&1)"
expect_error "empty task is rejected" "check constraint" "$($P -c "insert into room_checklist_items(room_id,label) values ('$RA','')" 2>&1)"
expect_error "oversized house rules are rejected" "check constraint" "$($P -c "update properties set house_rules = repeat('x',4001) where id='$PA'" 2>&1)"

$P -c "delete from rooms where id='$RB'" >/dev/null
check "deleting a room without history removes its guide" "0|0" "$($P -c "select (select count(*) from room_content where room_id='$RB'), (select count(*) from room_checklist_items where room_id='$RB')")"
$P -c "insert into room_state_ledger(room_id,actor_role,event_type) values ('$RA','crew','clean_start')" >/dev/null
expect_error "a room with ledger history cannot be deleted" "foreign key" "$($P -c "delete from rooms where id='$RA'" 2>&1)"

$ADMIN -c "drop database $DB" || { echo "FAIL  could not drop $DB"; fail=1; }
[ $fail -eq 0 ] && echo "ALL PASSED" || { echo "FAILURES"; exit 1; }
