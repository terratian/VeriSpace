-- VeriSpace initial spatial ledger schema
-- DRAFT: the original schema from the earlier design chat was not available when this
-- file was created. This is a fresh draft that follows MASTER_PROJECT_SPEC.md.
-- Replace or reconcile with the original before applying to a real database.

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
  actor_role text not null check (actor_role in ('manager', 'crew', 'guest')),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  frame_sha256 text,            -- hash of the unedited raw frame, computed client-side
  coord_x numeric, coord_y numeric, coord_z numeric,
  prev_hash text,               -- hash of the previous ledger row for this room
  nonce text not null default encode(gen_random_bytes(16), 'hex'),
  row_hash text not null,       -- sha256 over prev_hash, nonce, and row contents
  created_at timestamptz not null default now()
);

create index room_state_ledger_room_idx on room_state_ledger (room_id, id);

-- Compute the chain hash on insert.
create or replace function ledger_chain_hash() returns trigger as $$
declare
  last_hash text;
begin
  select row_hash into last_hash
    from room_state_ledger
    where room_id = new.room_id
    order by id desc
    limit 1;

  new.prev_hash := last_hash;
  new.row_hash := encode(
    digest(
      coalesce(new.prev_hash, '') || new.nonce || new.room_id::text || new.actor_role ||
      new.event_type || new.payload::text || coalesce(new.frame_sha256, '') ||
      new.created_at::text,
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$ language plpgsql;

create trigger room_state_ledger_chain
  before insert on room_state_ledger
  for each row execute function ledger_chain_hash();

-- Immutability: block all updates and deletes.
create rule room_state_ledger_no_update as
  on update to room_state_ledger do instead nothing;
create rule room_state_ledger_no_delete as
  on delete to room_state_ledger do instead nothing;

-- Row Level Security: enabled with no policies yet (deny by default).
-- Add role-based policies when auth flows are implemented.
alter table properties enable row level security;
alter table rooms enable row level security;
alter table reservations enable row level security;
alter table room_state_ledger enable row level security;
