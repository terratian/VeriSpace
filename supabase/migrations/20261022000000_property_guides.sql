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
