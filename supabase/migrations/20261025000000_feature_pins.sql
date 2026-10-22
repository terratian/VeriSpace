-- Where an asset appears in a room scan: a direction (yaw and pitch, degrees) as seen from where the
-- scan was taken. A pin belongs to one scan, because a new scan may start facing a different way.
-- Additive and idempotent.

create table if not exists room_feature_pins (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references room_features(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  scan_id uuid not null,
  yaw numeric not null check (yaw >= 0 and yaw <= 360),
  pitch numeric not null check (pitch >= -90 and pitch <= 90),
  created_at timestamptz not null default now(),
  unique (feature_id, scan_id)
);
create index if not exists room_feature_pins_room_idx on room_feature_pins (room_id, scan_id);

alter table room_feature_pins enable row level security;
grant select, insert, update, delete on room_feature_pins to authenticated;

drop policy if exists room_feature_pins_owner_all on room_feature_pins;
create policy room_feature_pins_owner_all on room_feature_pins
  for all to authenticated
  using (exists (
    select 1 from rooms r join properties p on p.id = r.property_id
    where r.id = room_feature_pins.room_id and p.owner_id = (select auth.uid())
  ))
  with check (
    exists (
      select 1 from rooms r join properties p on p.id = r.property_id
      where r.id = room_feature_pins.room_id and p.owner_id = (select auth.uid())
    )
    and exists (select 1 from room_features f where f.id = room_feature_pins.feature_id and f.room_id = room_feature_pins.room_id)
  );
