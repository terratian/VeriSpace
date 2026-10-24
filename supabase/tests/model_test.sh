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


$ADMIN -c "drop database if exists $DB" -c "create database $DB" || exit 1
$ADMIN -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end \$\$"
$P -v ON_ERROR_STOP=1 -c "
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
  create table auth.users (id uuid primary key, email text);
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
  if [ -n "$1" ]; then $P -c "set role authenticated; select set_config('request.jwt.claim.sub','$1',false), set_config('request.jwt.claims','{\"sub\":\"$1\",\"email\":\"$1@test.dev\"}',false); $2" 2>&1
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
# Guest resources: owner-only, web links or PDFs only.
as_user $A "insert into room_resources(room_id,kind,title,url) values ('$RA','link','Hot tub guide','https://example.com/tub');" >/dev/null
check "owner can attach a link" "1" "$($P -c "select count(*) from room_resources where room_id='$RA'")"
check "other owner cannot see it" "0" "$(as_user $B "select count(*) from room_resources;" | last)"
expect_error "non-web link is rejected" "check" "$(as_user $A "insert into room_resources(room_id,kind,title,url) values ('$RA','link','x','javascript:alert(1)');")"
expect_error "a pdf needs a stored file" "check" "$(as_user $A "insert into room_resources(room_id,kind,title) values ('$RA','pdf','x');")"
as_user $B "insert into room_resources(room_id,kind,title,url) values ('$RA','link','sneaky','https://example.com');" >/dev/null 2>&1
check "other owner cannot attach to my room" "1" "$($P -c "select count(*) from room_resources where room_id='$RA'")"

# Pins: where an asset sits in a room scan.
SCAN=11111111-1111-4111-8111-111111111111
as_user $A "insert into room_feature_pins(feature_id,room_id,scan_id,yaw,pitch) values ('$F','$RA','$SCAN',120,10);" >/dev/null
check "owner can pin an asset on a scan" "1" "$($P -c "select count(*) from room_feature_pins where room_id='$RA'")"
check "other owner cannot see the pin" "0" "$(as_user $B "select count(*) from room_feature_pins;" | last)"
as_user $B "insert into room_feature_pins(feature_id,room_id,scan_id,yaw,pitch) values ('$F','$RA','$SCAN',5,5) on conflict do nothing;" >/dev/null 2>&1
check "other owner cannot pin in my room" "1" "$($P -c "select count(*) from room_feature_pins where room_id='$RA'")"
expect_error "one pin per asset per scan" "duplicate" "$(as_user $A "insert into room_feature_pins(feature_id,room_id,scan_id,yaw,pitch) values ('$F','$RA','$SCAN',1,1);")"
expect_error "pitch beyond straight up is rejected" "check" "$(as_user $A "insert into room_feature_pins(feature_id,room_id,scan_id,yaw,pitch) values ('$F','$RA','22222222-2222-4222-8222-222222222222',1,95);")"
FB=$($P -c "select id from room_features where room_id='$RB' limit 1")
expect_error "a pin must use an asset from the same room" "row-level security" "$(as_user $A "insert into room_feature_pins(feature_id,room_id,scan_id,yaw,pitch) values ('$FB','$RA','33333333-3333-4333-8333-333333333333',1,1);")"
check "feature status entry is recorded and chains" "t" "$($P -c "select ok from verify_room_chain('$RA')")"

$P -c "delete from rooms where id='$RB'" >/dev/null 2>&1
check "deleting a room removes its features" "0" "$($P -c "select count(*) from room_features where room_id='$RB'")"

# Removing a property: one with no history can be deleted by its owner; archiving needs the archived_at column.
PC=00000000-0000-0000-0000-00000000000c
RC=00000000-0000-0000-0000-0000000000c1
$P -c "insert into properties(id,owner_id,name) values ('$PC','$A','Empty'); insert into rooms(id,property_id,name) values ('$RC','$PC','Den');" >/dev/null
as_user $A "delete from rooms where property_id='$PC'; delete from properties where id='$PC';" >/dev/null
check "owner can delete a property that never recorded anything" "0" "$($P -c "select count(*) from properties where id='$PC'")"
as_user $A "update properties set archived_at = now() where id='$PA';" >/dev/null
check "owner can archive a property" "t" "$($P -c "select archived_at is not null from properties where id='$PA'")"
as_user $B "update properties set archived_at = null where id='$PA';" >/dev/null
check "other owner cannot un-archive it" "t" "$($P -c "select archived_at is not null from properties where id='$PA'")"
as_user $A "delete from rooms where id='$RA';" >/dev/null 2>&1
check "a room with history cannot be deleted" "1" "$($P -c "select count(*) from rooms where id='$RA'")"

# Independent timestamps: owner can read their own, nobody can change them.
$P -c "insert into ledger_anchors(property_id,digest,heads,tsa_url,reply_b64) values ('$PA', repeat('a',64), '[]', 'https://tsa.test', 'AAAA');" >/dev/null
check "owner sees their property's timestamps" "1" "$(as_user $A "select count(*) from ledger_anchors;" | last)"
check "other owner sees none" "0" "$(as_user $B "select count(*) from ledger_anchors;" | last)"
expect_error "a timestamp cannot be changed" "append-only" "$($P -c "update ledger_anchors set digest = repeat('b',64);" 2>&1)"
expect_error "a timestamp cannot be deleted" "append-only" "$($P -c "delete from ledger_anchors;" 2>&1)"
expect_error "timestamps cannot be truncated" "append-only" "$($P -c "truncate ledger_anchors;" 2>&1)"


# Dispute packet export: the exported text forms re-hash to the stored fingerprints.
check "export rows re-hash to the stored fingerprints" "0" "$($P -c "select count(*) from ledger_export_rows('$RA') e where encode(digest(coalesce(e.prev_hash,'') || '|' || e.nonce || '|' || '$RA' || '|' || e.seq::text || '|' || e.actor_role || '|' || e.event_type || '|' || e.payload_text || '|' || coalesce(e.frame_sha256,'') || '|' || e.created_at_text, 'sha256'), 'hex') <> e.row_hash")"
check "owner can export their room" "t" "$(as_user $A "select count(*) > 0 from ledger_export_rows('$RA');" | last)"
check "other owner exports nothing" "0" "$(as_user $B "select count(*) from ledger_export_rows('$RA');" | last)"


# Co-managers and the edit log.
C=cccccccc-cccc-cccc-cccc-cccccccccccc
$P -c "insert into auth.users(id,email) values ('$A','$A@test.dev'),('$B','$B@test.dev'),('$C','$C@test.dev')" >/dev/null
check "a stranger cannot see someone else's property" "0" "$(as_user $C "select count(*) from properties where id='$PA';" | last)"
as_user $B "insert into property_members(property_id,email) values ('$PA','$B@test.dev');" >/dev/null 2>&1
check "a stranger cannot add themselves as co-manager" "0" "$($P -c "select count(*) from property_members")"
as_user $A "insert into property_members(property_id,email,invited_by) values ('$PA','$B@test.dev','$A');" >/dev/null
check "owner can add a co-manager by email" "1" "$($P -c "select count(*) from property_members where property_id='$PA'")"
check "co-manager sees the property" "1" "$(as_user $B "select count(*) from properties where id='$PA';" | last)"
check "co-manager sees its ledger" "t" "$(as_user $B "select count(*) > 0 from room_state_ledger where room_id='$RA';" | last)"
as_user $B "update rooms set name='Renamed by co-manager' where id='$RA';" >/dev/null
check "co-manager can edit a room" "Renamed by co-manager" "$($P -c "select name from rooms where id='$RA'")"
as_user $B "delete from properties where id='$PA';" >/dev/null 2>&1
check "co-manager cannot delete the property" "1" "$($P -c "select count(*) from properties where id='$PA'")"
as_user $B "update properties set owner_id='$B' where id='$PA';" >/dev/null 2>&1
check "co-manager cannot take ownership" "$A" "$($P -c "select owner_id from properties where id='$PA'")"
as_user $B "insert into property_members(property_id,email) values ('$PA','$C@test.dev');" >/dev/null 2>&1
check "co-manager cannot add managers" "1" "$($P -c "select count(*) from property_members where property_id='$PA'")"
check "stranger still sees nothing" "0" "$(as_user $C "select count(*) from properties where id='$PA';" | last)"
check "manager ids include owner and co-manager" "2" "$($P -c "select array_length(property_manager_ids('$PA'),1)")"
check "edit by co-manager is logged with who" "$B@test.dev" "$($P -c "select actor_email from config_audit where table_name='rooms' and op='UPDATE' and new_row->>'name'='Renamed by co-manager'")"
check "adding a co-manager is logged" "1" "$($P -c "select count(*) from config_audit where table_name='property_members' and op='INSERT' and property_id='$PA'")"
check "audit keeps before and after" "t" "$($P -c "select old_row->>'name' is distinct from new_row->>'name' from config_audit where table_name='rooms' and new_row->>'name'='Renamed by co-manager'")"
check "co-manager can read the edit log" "t" "$(as_user $B "select count(*) > 0 from config_audit where property_id='$PA';" | last)"
check "stranger cannot read the edit log" "0" "$(as_user $C "select count(*) from config_audit;" | last)"
expect_error "the edit log cannot be changed" "append-only" "$($P -c "update config_audit set op='DELETE';" 2>&1)"
expect_error "the edit log cannot be deleted from" "append-only" "$($P -c "delete from config_audit;" 2>&1)"


# Link delivery: crew contacts, stay contacts, and the send log.
as_user $A "insert into crew_contacts(property_id,name,phone) values ('$PA','Rosa','+15551234567');" >/dev/null
check "manager can add a crew contact" "1" "$($P -c "select count(*) from crew_contacts where property_id='$PA'")"
as_user $C "insert into crew_contacts(property_id,name,phone) values ('$PA','Intruder','+15550000000');" >/dev/null 2>&1
check "a stranger cannot add crew to someone else's property" "1" "$($P -c "select count(*) from crew_contacts where property_id='$PA'")"
check "a stranger cannot see the crew list" "0" "$(as_user $C "select count(*) from crew_contacts;" | last)"
expect_error "a crew contact needs a phone or an email" "check" "$(as_user $A "insert into crew_contacts(property_id,name) values ('$PA','Nobody');")"
expect_error "a malformed phone is rejected" "check" "$(as_user $A "insert into crew_contacts(property_id,name,phone) values ('$PA','Bad','555-1234');")"
RES=00000000-0000-0000-0000-0000000000e1
$P -c "insert into reservations(id,property_id,starts_at,ends_at) values ('$RES','$PA','2030-01-01 15:00+00','2030-01-04 11:00+00') on conflict do nothing" >/dev/null
if [ -n "$RES" ]; then
  as_user $A "update reservations set guest_phone='+15559876543', guest_email='guest@example.com' where id='$RES';" >/dev/null
  check "owner can store the guest's phone and email on a stay" "+15559876543" "$($P -c "select guest_phone from reservations where id='$RES'")"
  expect_error "a stay's phone must be international digits" "check" "$(as_user $A "update reservations set guest_phone='12345' where id='$RES';")"
fi
as_user $A "insert into link_deliveries(property_id,reservation_id,role,channel,to_masked,status,sent_by) values ('$PA','${RES:-$PA}','guest','sms','•••• 6543','sent','$A');" >/dev/null
check "a send is logged" "1" "$($P -c "select count(*) from link_deliveries where property_id='$PA'")"
as_user $C "insert into link_deliveries(property_id,reservation_id,role,channel,to_masked,status,sent_by) values ('$PA','$PA','guest','sms','x','sent','$C');" >/dev/null 2>&1
check "a stranger cannot write to the send log" "1" "$($P -c "select count(*) from link_deliveries where property_id='$PA'")"
expect_error "the send log cannot be changed" "append-only" "$($P -c "update link_deliveries set status='failed';" 2>&1)"
expect_error "the send log cannot be deleted from" "append-only" "$($P -c "delete from link_deliveries;" 2>&1)"
check "crew list changes are in the edit log" "t" "$($P -c "select count(*) > 0 from config_audit where table_name='crew_contacts' and op='INSERT'")"


$ADMIN -c "drop database if exists $DB" >/dev/null 2>&1 || { echo "FAIL  could not drop $DB"; fail=1; }
[ $fail -eq 0 ] && echo "ALL PASSED"
exit $fail
