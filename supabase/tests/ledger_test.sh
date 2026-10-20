#!/usr/bin/env bash
# Tests the append-only ledger migration against a scratch Postgres.
# Usage: PGHOST=/tmp/pg PGPORT=54329 PGUSER=postgres ./supabase/tests/ledger_test.sh
# Creates and drops a database named vs_ledger_test. Never point this at real data.
set -u
DB=vs_ledger_test
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../migrations/20261019000000_initial_spatial_ledger.sql"
ADMIN="psql -d postgres -q -t -A -v ON_ERROR_STOP=1"
P="psql -d $DB -q -t -A"
fail=0
check() { # name, expected, actual
  if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (expected '$2', got '$3')"; fail=1; fi
}

$ADMIN -c "drop database if exists $DB" -c "create database $DB" || exit 1
$P -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null || { echo "FAIL  migration did not apply"; exit 1; }

PROP=00000000-0000-0000-0000-000000000001
R1=00000000-0000-0000-0000-0000000000a1
R2=00000000-0000-0000-0000-0000000000b2
$P -c "insert into properties(id,owner_id,name) values ('$PROP', gen_random_uuid(), 'Test House')" \
   -c "insert into rooms(id,property_id,name) values ('$R1','$PROP','Living Room'),('$R2','$PROP','Kitchen')"

# 1. chain builds and verifies
$P -c "insert into room_state_ledger(room_id,actor_role,event_type,payload) values
  ('$R1','crew','clean_start','{\"a\":1}'),('$R1','crew','clean_end','{\"b\":2}'),('$R1','guest','checkin','{}')"
check "clean chain verifies" "t|3||" "$($P -c "select ok,checked,first_bad_id,reason from verify_room_chain('$R1')")"
check "seq is 1..3" "1,2,3" "$($P -c "select string_agg(seq::text, ',' order by seq) from room_state_ledger where room_id='$R1'")"

# 2. immutability raises errors
for stmt in "update room_state_ledger set event_type='x'" "delete from room_state_ledger" "truncate room_state_ledger"; do
  out="$($P -c "$stmt" 2>&1)"
  case "$out" in *"append-only"*) echo "PASS  blocked: $stmt";; *) echo "FAIL  not blocked: $stmt ($out)"; fail=1;; esac
done

# 3. frame hash format enforced
out="$($P -c "insert into room_state_ledger(room_id,actor_role,event_type,frame_sha256) values ('$R1','crew','photo','nothex')" 2>&1)"
case "$out" in *"check constraint"*) echo "PASS  bad frame hash rejected";; *) echo "FAIL  bad frame hash accepted"; fail=1;; esac

# 4. verifier detects tampering done with triggers disabled
$P -c "alter table room_state_ledger disable trigger room_state_ledger_no_mutation" \
   -c "update room_state_ledger set payload='{\"b\":999}' where room_id='$R1' and seq=2" \
   -c "alter table room_state_ledger enable trigger room_state_ledger_no_mutation"
check "tamper detected at seq 2" "f|2|row_hash does not match row contents" "$($P -c "select ok,checked,reason from verify_room_chain('$R1')")"

# 5. concurrent inserts do not fork the chain
seq 1 60 | xargs -P 20 -I{} $P -c "insert into room_state_ledger(room_id,actor_role,event_type,payload) values ('$R2','crew','evt', jsonb_build_object('i',{}))" >/dev/null 2>&1
check "60 concurrent inserts: chain verifies" "t|60" "$($P -c "select ok,checked from verify_room_chain('$R2')")"
check "60 concurrent inserts: no duplicate prev_hash" "60" "$($P -c "select count(distinct coalesce(prev_hash,'root')) from room_state_ledger where room_id='$R2'")"

$ADMIN -c "drop database $DB"
[ $fail -eq 0 ] && echo "ALL PASSED" || { echo "FAILURES"; exit 1; }
