-- Property model: room geometry and the features inside each room (hot tub, fireplace, smart lock...).
-- Additive and idempotent. A feature's working status is NOT stored here: it is read from the
-- ledger (the latest feature_status entry), so the owner's record and the guest's view can't drift.

alter table rooms
  add column if not exists width_m numeric(6,2),
  add column if not exists length_m numeric(6,2),
  add column if not exists height_m numeric(4,2),
  add column if not exists floor smallint not null default 0,
  add column if not exists plan_x numeric(7,2),
  add column if not exists plan_y numeric(7,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_layout_range') then
    alter table rooms add constraint rooms_layout_range check (
      (width_m is null or width_m between 0.3 and 80)
      and (length_m is null or length_m between 0.3 and 80)
      and (height_m is null or height_m between 1.5 and 12)
      and floor between -3 and 30
      and (plan_x is null or plan_x between -1000 and 1000)
      and (plan_y is null or plan_y between -1000 and 1000)
    );
  end if;
end $$;

create table if not exists room_features (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  kind text not null check (kind in (
    'hot_tub', 'pool', 'fireplace', 'smart_lock', 'thermostat', 'wifi', 'noise_sensor', 'tv',
    'kitchen_appliance', 'laundry', 'workspace', 'bed', 'coffee_bar', 'grill', 'ev_charger',
    'parking', 'other'
  )),
  name text not null check (length(name) between 1 and 80),
  -- Where it sits in the room, as a fraction of the room's width and length.
  pos_x numeric(4,3) not null default 0.5 check (pos_x between 0 and 1),
  pos_y numeric(4,3) not null default 0.5 check (pos_y between 0 and 1),
  -- Shown to guests as part of the listing. Internal equipment (sensors, spares) can be hidden.
  advertised boolean not null default true,
  details text not null default '' check (length(details) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists room_features_room_idx on room_features (room_id, created_at);

alter table room_features enable row level security;
grant select, insert, update, delete on room_features to authenticated;

drop policy if exists room_features_owner_all on room_features;
create policy room_features_owner_all on room_features
  for all to authenticated
  using (exists (
    select 1 from rooms r join properties p on p.id = r.property_id
    where r.id = room_features.room_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from rooms r join properties p on p.id = r.property_id
    where r.id = room_features.room_id and p.owner_id = (select auth.uid())
  ));
