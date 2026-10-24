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


-- ===== 20261027000000_ledger_anchors =====
-- Independent timestamps. Periodically the latest fingerprint of every room in a property is combined
-- into one digest and signed with the time by an outside timestamp authority (RFC 3161). The signed
-- reply is kept here, whole, so anyone can verify it without trusting this database or its clock.
-- Append-only like the ledger. Additive and idempotent.

create table if not exists ledger_anchors (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete restrict,
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  heads jsonb not null,                 -- [{roomId, seq, rowHash}] the digest was computed from
  tsa_url text not null,
  reply_b64 text not null,              -- the authority's full reply (.tsr)
  gen_time timestamptz,                 -- the time the authority put in its signed proof
  created_at timestamptz not null default now()
);
create index if not exists ledger_anchors_property_idx on ledger_anchors (property_id, created_at desc);

create or replace function ledger_anchors_immutable() returns trigger as $$
begin
  raise exception 'ledger_anchors is append-only: % is not allowed', tg_op using errcode = 'restrict_violation';
end;
$$ language plpgsql;

drop trigger if exists ledger_anchors_no_change on ledger_anchors;
create trigger ledger_anchors_no_change before update or delete on ledger_anchors
  for each row execute function ledger_anchors_immutable();
drop trigger if exists ledger_anchors_no_truncate on ledger_anchors;
create trigger ledger_anchors_no_truncate before truncate on ledger_anchors
  for each statement execute function ledger_anchors_immutable();

alter table ledger_anchors enable row level security;
grant select on ledger_anchors to authenticated;
drop policy if exists ledger_anchors_owner_select on ledger_anchors;
create policy ledger_anchors_owner_select on ledger_anchors
  for select to authenticated
  using (exists (select 1 from properties p where p.id = ledger_anchors.property_id and p.owner_id = (select auth.uid())));

-- ===== 20261028000000_ledger_export =====
-- Export of a room's chain in the exact text forms that were hashed, so a dispute packet can be
-- re-verified outside the database. Runs as the caller, so row-level security still limits it to
-- the owner. Additive and idempotent.
create or replace function ledger_export_rows(p_room_id uuid, p_limit int default 5000)
returns table (
  id bigint, seq bigint, actor_role text, event_type text, payload_text text, frame_sha256 text,
  created_at_text text, nonce text, prev_hash text, row_hash text
) language sql stable security invoker as $$
  select l.id, l.seq, l.actor_role, l.event_type, l.payload::text, l.frame_sha256,
         l.created_at::text, l.nonce, l.prev_hash, l.row_hash
  from room_state_ledger l
  where l.room_id = p_room_id
  order by l.seq
  limit greatest(1, least(p_limit, 20000));
$$;
grant execute on function ledger_export_rows(uuid, int) to authenticated;

-- ===== 20261029000000_managers_audit_alerts =====
-- Co-managers, a log of owner edits, and alert contacts. Additive and idempotent.
--
-- Co-managers: an owner adds someone by email. When that person signs in with that email they can
-- manage the property (everything except deleting it or changing who manages it).
-- Edit log: database triggers record every change to a property's rooms, assets, checks, files and
-- pins (before and after, who, when) in an append-only table, so it can't be skipped or rewritten.

create table if not exists property_members (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  invited_by uuid,
  created_at timestamptz not null default now(),
  unique (property_id, email)
);
create index if not exists property_members_email_idx on property_members (email);

alter table properties add column if not exists alert_email text;
alter table properties add column if not exists alert_phone text;

-- Is the signed-in user the owner, or a co-manager invited by email? Definer so policies on
-- properties can call it without recursing into themselves.
create or replace function can_manage_property(p_property uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from properties p where p.id = p_property and p.owner_id = (select auth.uid()))
      or exists (
        select 1 from property_members m
        where m.property_id = p_property
          and m.email = lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email', ''))
      );
$$;
grant execute on function can_manage_property(uuid) to authenticated;

-- Server side (service role only): the user ids allowed to manage a property.
do $$
begin
  if to_regclass('auth.users') is not null then
    execute $f$
      create or replace function property_manager_ids(p_property uuid) returns uuid[]
      language sql stable security definer set search_path = public as $b$
        select coalesce(array_agg(distinct uid), '{}') from (
          select owner_id as uid from properties where id = p_property
          union
          select u.id from property_members m join auth.users u on lower(u.email) = m.email where m.property_id = p_property
        ) s
      $b$ $f$;
    revoke all on function property_manager_ids(uuid) from public, anon, authenticated;
    grant execute on function property_manager_ids(uuid) to service_role;
  end if;
exception when undefined_object then
  null; -- no service_role in a scratch database
end $$;

alter table property_members enable row level security;
grant select, insert, update, delete on property_members to authenticated;
drop policy if exists property_members_owner_all on property_members;
create policy property_members_owner_all on property_members for all to authenticated
  using (exists (select 1 from properties p where p.id = property_members.property_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from properties p where p.id = property_members.property_id and p.owner_id = (select auth.uid())));
drop policy if exists property_members_self_select on property_members;
create policy property_members_self_select on property_members for select to authenticated
  using (email = lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email', '')));

-- Property: owner creates and deletes; owner and co-managers read and edit.
drop policy if exists properties_owner_all on properties;
drop policy if exists properties_owner_insert on properties;
drop policy if exists properties_owner_delete on properties;
drop policy if exists properties_manage_select on properties;
drop policy if exists properties_manage_update on properties;
create policy properties_owner_insert on properties for insert to authenticated with check (owner_id = (select auth.uid()));
create policy properties_owner_delete on properties for delete to authenticated using (owner_id = (select auth.uid()));
create policy properties_manage_select on properties for select to authenticated using (can_manage_property(id));
create policy properties_manage_update on properties for update to authenticated
  using (can_manage_property(id)) with check (can_manage_property(id) and owner_id = (select p.owner_id from properties p where p.id = properties.id));

-- Everything under a property: owner and co-managers.
drop policy if exists rooms_owner_all on rooms;
drop policy if exists rooms_manage_all on rooms;
create policy rooms_manage_all on rooms for all to authenticated using (can_manage_property(property_id)) with check (can_manage_property(property_id));

drop policy if exists reservations_owner_all on reservations;
drop policy if exists reservations_manage_all on reservations;
create policy reservations_manage_all on reservations for all to authenticated using (can_manage_property(property_id)) with check (can_manage_property(property_id));

drop policy if exists ledger_owner_select on room_state_ledger;
drop policy if exists ledger_manage_select on room_state_ledger;
create policy ledger_manage_select on room_state_ledger for select to authenticated
  using (exists (select 1 from rooms r where r.id = room_state_ledger.room_id and can_manage_property(r.property_id)));

drop policy if exists room_content_owner_all on room_content;
drop policy if exists room_content_manage_all on room_content;
create policy room_content_manage_all on room_content for all to authenticated
  using (exists (select 1 from rooms r where r.id = room_content.room_id and can_manage_property(r.property_id)))
  with check (exists (select 1 from rooms r where r.id = room_content.room_id and can_manage_property(r.property_id)));

drop policy if exists room_checklist_items_owner_all on room_checklist_items;
drop policy if exists room_checklist_items_manage_all on room_checklist_items;
create policy room_checklist_items_manage_all on room_checklist_items for all to authenticated
  using (exists (select 1 from rooms r where r.id = room_checklist_items.room_id and can_manage_property(r.property_id)))
  with check (exists (select 1 from rooms r where r.id = room_checklist_items.room_id and can_manage_property(r.property_id)));

drop policy if exists room_features_owner_all on room_features;
drop policy if exists room_features_manage_all on room_features;
create policy room_features_manage_all on room_features for all to authenticated
  using (exists (select 1 from rooms r where r.id = room_features.room_id and can_manage_property(r.property_id)))
  with check (exists (select 1 from rooms r where r.id = room_features.room_id and can_manage_property(r.property_id)));

drop policy if exists room_resources_owner_all on room_resources;
drop policy if exists room_resources_manage_all on room_resources;
create policy room_resources_manage_all on room_resources for all to authenticated
  using (exists (select 1 from rooms r where r.id = room_resources.room_id and can_manage_property(r.property_id)))
  with check (exists (select 1 from rooms r where r.id = room_resources.room_id and can_manage_property(r.property_id)));

drop policy if exists room_feature_pins_owner_all on room_feature_pins;
drop policy if exists room_feature_pins_manage_all on room_feature_pins;
create policy room_feature_pins_manage_all on room_feature_pins for all to authenticated
  using (exists (select 1 from rooms r where r.id = room_feature_pins.room_id and can_manage_property(r.property_id)))
  with check (
    exists (select 1 from rooms r where r.id = room_feature_pins.room_id and can_manage_property(r.property_id))
    and exists (select 1 from room_features f where f.id = room_feature_pins.feature_id and f.room_id = room_feature_pins.room_id)
  );

drop policy if exists ledger_anchors_owner_select on ledger_anchors;
drop policy if exists ledger_anchors_manage_select on ledger_anchors;
create policy ledger_anchors_manage_select on ledger_anchors for select to authenticated using (can_manage_property(property_id));

do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists property_files_owner_all on storage.objects;
    drop policy if exists property_files_manage_all on storage.objects;
    create policy property_files_manage_all on storage.objects for all to authenticated
      using (bucket_id = 'property-files' and public.can_manage_property(((storage.foldername(name))[1])::uuid))
      with check (bucket_id = 'property-files' and public.can_manage_property(((storage.foldername(name))[1])::uuid));
  end if;
end $$;

-- The edit log.
create table if not exists config_audit (
  id bigint generated always as identity primary key,
  property_id uuid not null,            -- no foreign key: the record outlives a deleted property
  table_name text not null,
  row_id text,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  old_row jsonb,
  new_row jsonb,
  actor_id uuid,
  actor_email text,
  created_at timestamptz not null default now()
);
create index if not exists config_audit_property_idx on config_audit (property_id, created_at desc);

create or replace function config_audit_block() returns trigger as $$
begin
  raise exception 'config_audit is append-only: % is not allowed', tg_op using errcode = 'restrict_violation';
end;
$$ language plpgsql;
drop trigger if exists config_audit_no_change on config_audit;
create trigger config_audit_no_change before update or delete on config_audit for each row execute function config_audit_block();
drop trigger if exists config_audit_no_truncate on config_audit;
create trigger config_audit_no_truncate before truncate on config_audit for each statement execute function config_audit_block();

alter table config_audit enable row level security;
grant select on config_audit to authenticated;
drop policy if exists config_audit_manage_select on config_audit;
create policy config_audit_manage_select on config_audit for select to authenticated using (can_manage_property(property_id));

create or replace function config_audit_fn() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  pid uuid;
  claims json := nullif(current_setting('request.jwt.claims', true), '')::json;
begin
  if tg_table_name = 'properties' then pid := (r ->> 'id')::uuid;
  elsif tg_table_name in ('rooms', 'property_members') then pid := (r ->> 'property_id')::uuid;
  else select rm.property_id into pid from rooms rm where rm.id = (r ->> 'room_id')::uuid;
  end if;
  -- A row removed by a cascade has lost its room by now; the parent's own delete is already logged.
  if pid is null then return null; end if;
  insert into config_audit (property_id, table_name, row_id, op, old_row, new_row, actor_id, actor_email)
  values (pid, tg_table_name, r ->> 'id', tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid(), claims ->> 'email');
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['properties', 'rooms', 'room_content', 'room_checklist_items', 'room_features', 'room_resources', 'room_feature_pins', 'property_members'] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function config_audit_fn()', t || '_audit', t);
  end loop;
end $$;

-- ===== 20261030000000_link_delivery =====
-- Links reach people by text message to the phone on the booking (or the crew member's phone), or by
-- email of record as the fallback. This adds those contacts, a record of what was sent where, and
-- crew contacts per property. Additive and idempotent.

alter table reservations add column if not exists guest_phone text check (guest_phone is null or guest_phone ~ '^\+[1-9][0-9]{7,14}$');
alter table reservations add column if not exists guest_email text check (guest_email is null or (guest_email = lower(guest_email) and position('@' in guest_email) > 1));

create table if not exists crew_contacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (email is null or (email = lower(email) and position('@' in email) > 1)),
  created_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);
create index if not exists crew_contacts_property_idx on crew_contacts (property_id);
alter table crew_contacts enable row level security;
grant select, insert, update, delete on crew_contacts to authenticated;
drop policy if exists crew_contacts_manage_all on crew_contacts;
create policy crew_contacts_manage_all on crew_contacts for all to authenticated
  using (can_manage_property(property_id)) with check (can_manage_property(property_id));

-- What was sent, to which (masked) address, by whom. Append-only.
create table if not exists link_deliveries (
  id bigint generated always as identity primary key,
  property_id uuid not null,
  reservation_id uuid not null,         -- no foreign key: the log outlives a removed stay
  role text not null check (role in ('guest', 'crew')),
  channel text not null check (channel in ('sms', 'email')),
  to_masked text not null,
  recipient text,                       -- guest or crew name, for reading the log
  status text not null check (status in ('sent', 'failed')),
  error text,
  sent_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists link_deliveries_property_idx on link_deliveries (property_id, created_at desc);
alter table link_deliveries enable row level security;
grant select, insert on link_deliveries to authenticated;
drop policy if exists link_deliveries_manage_select on link_deliveries;
create policy link_deliveries_manage_select on link_deliveries for select to authenticated using (can_manage_property(property_id));
drop policy if exists link_deliveries_manage_insert on link_deliveries;
create policy link_deliveries_manage_insert on link_deliveries for insert to authenticated
  with check (can_manage_property(property_id) and sent_by = (select auth.uid()));

create or replace function link_deliveries_immutable() returns trigger as $$
begin
  raise exception 'link_deliveries is append-only: % is not allowed', tg_op using errcode = 'restrict_violation';
end;
$$ language plpgsql;
drop trigger if exists link_deliveries_no_change on link_deliveries;
create trigger link_deliveries_no_change before update or delete on link_deliveries for each row execute function link_deliveries_immutable();
drop trigger if exists link_deliveries_no_truncate on link_deliveries;
create trigger link_deliveries_no_truncate before truncate on link_deliveries for each statement execute function link_deliveries_immutable();

-- The edit log also covers stays (phone and email changes) and crew contacts.
create or replace function config_audit_fn() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  pid uuid;
  claims json := nullif(current_setting('request.jwt.claims', true), '')::json;
begin
  if tg_table_name = 'properties' then pid := (r ->> 'id')::uuid;
  elsif tg_table_name in ('rooms', 'property_members', 'crew_contacts', 'reservations') then pid := (r ->> 'property_id')::uuid;
  else select rm.property_id into pid from rooms rm where rm.id = (r ->> 'room_id')::uuid;
  end if;
  if pid is null then return null; end if;
  insert into config_audit (property_id, table_name, row_id, op, old_row, new_row, actor_id, actor_email)
  values (pid, tg_table_name, r ->> 'id', tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid(), claims ->> 'email');
  return null;
end;
$$;
drop trigger if exists crew_contacts_audit on crew_contacts;
create trigger crew_contacts_audit after insert or update or delete on crew_contacts for each row execute function config_audit_fn();
drop trigger if exists reservations_audit on reservations;
create trigger reservations_audit after insert or update or delete on reservations for each row execute function config_audit_fn();
