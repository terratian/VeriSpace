-- Reset Row Level Security to the intended state. Idempotent: safe to run more than once.
--
-- Drops every policy on the four app tables and recreates the owner-scoped ones, then restores
-- the table grants the API role needs. Use it when a manual edit in the dashboard left policies
-- or grants out of line with 20261019000100_rls_policies.sql (symptom: "You don't have
-- permission to do that" when adding a property).

do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('properties', 'rooms', 'reservations', 'room_state_ledger')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

alter table properties enable row level security;
alter table rooms enable row level security;
alter table reservations enable row level security;
alter table room_state_ledger enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on properties, rooms, reservations to authenticated;
grant select on room_state_ledger to authenticated;

create policy properties_owner_all on properties
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy rooms_owner_all on rooms
  for all to authenticated
  using (exists (select 1 from properties p where p.id = rooms.property_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from properties p where p.id = rooms.property_id and p.owner_id = (select auth.uid())));

create policy reservations_owner_all on reservations
  for all to authenticated
  using (exists (select 1 from properties p where p.id = reservations.property_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from properties p where p.id = reservations.property_id and p.owner_id = (select auth.uid())));

-- Owners can read their rooms' ledger entries. There is deliberately no insert, update, or delete
-- policy: writes happen only through the API (service role), which hashes and chains.
create policy ledger_owner_select on room_state_ledger
  for select to authenticated
  using (exists (
    select 1 from rooms r join properties p on p.id = r.property_id
    where r.id = room_state_ledger.room_id and p.owner_id = (select auth.uid())
  ));

alter function verify_room_chain(uuid) security invoker;
grant execute on function verify_room_chain(uuid) to authenticated;
