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
