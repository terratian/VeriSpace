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
