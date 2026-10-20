-- Row Level Security policies for managers (signed-in Supabase users).
-- Crew and guests never query the database directly: they act through the API with a
-- capability token, and the API uses the service role (which bypasses RLS) after authorizing.
--
-- (select auth.uid()) is wrapped in a subselect so Postgres evaluates it once per query.

-- A manager owns a property when properties.owner_id matches their user id.
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

-- Ledger: owners may READ their rooms' entries. There is deliberately no insert, update, or
-- delete policy: writes happen only through the API (service role), which hashes and chains.
create policy ledger_owner_select on room_state_ledger
  for select to authenticated
  using (exists (
    select 1 from rooms r join properties p on p.id = r.property_id
    where r.id = room_state_ledger.room_id and p.owner_id = (select auth.uid())
  ));

-- verify_room_chain reads the ledger, so it must run as the caller (RLS applies) rather than
-- as the function owner. Owners can therefore only verify their own rooms.
alter function verify_room_chain(uuid) security invoker;
