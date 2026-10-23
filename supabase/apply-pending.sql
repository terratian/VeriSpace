-- ===== 20261022000000_property_guides =====
-- Property guides: procedures on the property, plus per-room guest information and crew checklists.
-- Additive and idempotent: safe to re-run, and safe on a database that already has rows.
--
-- Guests and crew never read these tables directly. They open a signed link, and the server reads
-- the content for them with the service role. Only the property owner can read or change it here.

alter table properties
  add column if not exists checkin_instructions text,
  add column if not exists checkout_instructions text,
  add column if not exists house_rules text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_guide_length') then
    alter table properties add constraint properties_guide_length check (
      coalesce(length(checkin_instructions), 0) <= 4000
      and coalesce(length(checkout_instructions), 0) <= 4000
      and coalesce(length(house_rules), 0) <= 4000
    );
  end if;
end $$;

-- Information shown to guests and crew when they open a room: how things work, allergen and
-- health notes, and anything else worth knowing.
create table if not exists room_content (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  kind text not null check (kind in ('tutorial', 'allergen', 'note')),
  title text not null check (length(title) between 1 and 120),
  body text not null default '' check (length(body) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists room_content_room_idx on room_content (room_id, created_at);

-- Tasks crew tick off in a room. A task can require a photo, whose fingerprint goes in the ledger.
create table if not exists room_checklist_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  label text not null check (length(label) between 1 and 160),
  requires_photo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists room_checklist_items_room_idx on room_checklist_items (room_id, created_at);

alter table room_content enable row level security;
alter table room_checklist_items enable row level security;

grant select, insert, update, delete on room_content, room_checklist_items to authenticated;

drop policy if exists room_content_owner_all on room_content;
create policy room_content_owner_all on room_content
  for all to authenticated
  using (exists (
    select 1 from rooms r join properties p on p.id = r.property_id
    where r.id = room_content.room_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from rooms r join properties p on p.id = r.property_id
    where r.id = room_content.room_id and p.owner_id = (select auth.uid())
  ));

drop policy if exists room_checklist_items_owner_all on room_checklist_items;
create policy room_checklist_items_owner_all on room_checklist_items
  for all to authenticated
  using (exists (
    select 1 from rooms r join properties p on p.id = r.property_id
    where r.id = room_checklist_items.room_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from rooms r join properties p on p.id = r.property_id
    where r.id = room_checklist_items.room_id and p.owner_id = (select auth.uid())
  ));

-- ===== 20261023000000_property_model =====
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

-- ===== 20261024000000_room_resources =====
-- Guest-facing resources attached to a room or to one feature in it: a product page, a manual,
-- a PDF. A PDF lives in the private `property-files` storage bucket (path: <property_id>/<file>);
-- guests get a short-lived signed address, never the bucket itself. Additive and idempotent.

create table if not exists room_resources (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  feature_id uuid references room_features(id) on delete cascade,
  kind text not null check (kind in ('link', 'pdf')),
  title text not null check (length(title) between 1 and 80),
  url text check (url is null or (length(url) <= 500 and url ~* '^https?://')),
  storage_path text check (storage_path is null or length(storage_path) <= 300),
  created_at timestamptz not null default now(),
  check ((kind = 'link' and url is not null) or (kind = 'pdf' and storage_path is not null))
);
create index if not exists room_resources_room_idx on room_resources (room_id, created_at);

alter table room_resources enable row level security;
grant select, insert, update, delete on room_resources to authenticated;

drop policy if exists room_resources_owner_all on room_resources;
create policy room_resources_owner_all on room_resources
  for all to authenticated
  using (exists (
    select 1 from rooms r join properties p on p.id = r.property_id
    where r.id = room_resources.room_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from rooms r join properties p on p.id = r.property_id
    where r.id = room_resources.room_id and p.owner_id = (select auth.uid())
  ));

-- Private bucket for the PDFs. Skipped where Supabase Storage isn't present (a scratch Postgres).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('property-files', 'property-files', false, 15728640, array['application/pdf'])
    on conflict (id) do nothing;

    drop policy if exists property_files_owner_all on storage.objects;
    create policy property_files_owner_all on storage.objects
      for all to authenticated
      using (bucket_id = 'property-files' and exists (
        select 1 from public.properties p
        where p.id::text = (storage.foldername(name))[1] and p.owner_id = (select auth.uid())))
      with check (bucket_id = 'property-files' and exists (
        select 1 from public.properties p
        where p.id::text = (storage.foldername(name))[1] and p.owner_id = (select auth.uid())));
  end if;
end $$;

-- ===== 20261025000000_feature_pins =====
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

-- ===== 20261026000000_property_archive =====
-- A property with recorded history can't be deleted (the ledger can't be erased), so it is archived:
-- hidden from the dashboard and its links stop working, while the record stays. Additive and idempotent.
alter table properties add column if not exists archived_at timestamptz;

