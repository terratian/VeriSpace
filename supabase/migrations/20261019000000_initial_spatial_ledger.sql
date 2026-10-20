-- VeriSpace initial spatial ledger schema
-- NOTE: the original schema from the earlier design chat was not available when this
-- file was written. This follows MASTER_PROJECT_SPEC.md. Tested against PostgreSQL 16.

create extension if not exists pgcrypto;

create table properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  address text,
  created_at timestamptz not null default now()
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete restrict,
  name text not null,
  -- room bounding box in meters (x, y, z)
  size_x numeric, size_y numeric, size_z numeric,
  created_at timestamptz not null default now()
);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);

-- Append-only ledger. Each row chains to the previous row for the same room.
create table room_state_ledger (
  id bigint generated always as identity primary key,
  room_id uuid not null references rooms(id) on delete restrict,
  seq bigint not null,          -- per-room position in the chain, assigned under a lock
  actor_role text not null check (actor_role in ('manager', 'crew', 'guest')),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  frame_sha256 text check (frame_sha256 is null or frame_sha256 ~ '^[0-9a-f]{64}$'),
  coord_x numeric, coord_y numeric, coord_z numeric,
  prev_hash text,
  nonce text not null default encode(gen_random_bytes(16), 'hex'),
  row_hash text not null,
  created_at timestamptz not null default now()
);

-- identity ids are handed out before the chain lock is taken, so they can interleave
-- under concurrency; the chain is therefore ordered by seq, never by id.
create unique index room_state_ledger_room_seq_idx on room_state_ledger (room_id, seq);

-- Canonical hash input for one ledger row. Used by both the insert trigger and the verifier
-- so the two can never drift apart.
create or replace function ledger_row_digest(
  p_prev_hash text, p_nonce text, p_room_id uuid, p_seq bigint, p_actor_role text, p_event_type text,
  p_payload jsonb, p_frame_sha256 text, p_created_at timestamptz
) returns text as $$
  select encode(
    digest(
      coalesce(p_prev_hash, '') || '|' || p_nonce || '|' || p_room_id::text || '|' ||
      p_seq::text || '|' || p_actor_role || '|' || p_event_type || '|' || p_payload::text || '|' ||
      coalesce(p_frame_sha256, '') || '|' || p_created_at::text,
      'sha256'
    ),
    'hex'
  );
$$ language sql immutable;

-- Chain each new row to the previous row of the same room.
-- The advisory lock serializes concurrent inserts per room so the chain cannot fork.
create or replace function ledger_chain_hash() returns trigger as $$
declare
  last_hash text;
  last_seq bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.room_id::text, 0));

  select row_hash, seq into last_hash, last_seq
    from room_state_ledger
    where room_id = new.room_id
    order by seq desc
    limit 1;

  new.seq := coalesce(last_seq, 0) + 1;
  new.prev_hash := last_hash;
  new.row_hash := ledger_row_digest(
    new.prev_hash, new.nonce, new.room_id, new.seq, new.actor_role, new.event_type,
    new.payload, new.frame_sha256, new.created_at
  );
  return new;
end;
$$ language plpgsql;

create trigger room_state_ledger_chain
  before insert on room_state_ledger
  for each row execute function ledger_chain_hash();

-- Immutability: any update, delete, or truncate raises an error (visible to the caller).
create or replace function ledger_block_mutation() returns trigger as $$
begin
  raise exception 'room_state_ledger is append-only: % is not allowed', tg_op
    using errcode = 'restrict_violation';
end;
$$ language plpgsql;

create trigger room_state_ledger_no_mutation
  before update or delete on room_state_ledger
  for each row execute function ledger_block_mutation();

create trigger room_state_ledger_no_truncate
  before truncate on room_state_ledger
  for each statement execute function ledger_block_mutation();

-- Verify a room's chain. Returns one row: ok = true, or the first row id that fails.
create or replace function verify_room_chain(p_room_id uuid)
returns table (ok boolean, checked bigint, first_bad_id bigint, reason text) as $$
declare
  r record;
  expected_prev text := null;
  n bigint := 0;
begin
  for r in
    select * from room_state_ledger where room_id = p_room_id order by seq
  loop
    n := n + 1;
    if r.seq <> n then
      return query select false, n, r.id, 'sequence gap or duplicate';
      return;
    end if;
    if r.prev_hash is distinct from expected_prev then
      return query select false, n, r.id, 'prev_hash does not match preceding row';
      return;
    end if;
    if r.row_hash <> ledger_row_digest(
         r.prev_hash, r.nonce, r.room_id, r.seq, r.actor_role, r.event_type,
         r.payload, r.frame_sha256, r.created_at) then
      return query select false, n, r.id, 'row_hash does not match row contents';
      return;
    end if;
    expected_prev := r.row_hash;
  end loop;
  return query select true, n, null::bigint, null::text;
end;
$$ language plpgsql stable;

-- Row Level Security: enabled with no policies yet (deny by default).
-- Add role-based policies when auth flows are implemented.
alter table properties enable row level security;
alter table rooms enable row level security;
alter table reservations enable row level security;
alter table room_state_ledger enable row level security;
