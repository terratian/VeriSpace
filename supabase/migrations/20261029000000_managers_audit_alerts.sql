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
