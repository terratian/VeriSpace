-- Reservation details, property time zones, and double-booking protection.
--
-- Additive and idempotent: safe to re-run, and safe on a database that already has rows.
-- If the Supabase GitHub integration deploys migrations to production, this runs there
-- inside a single transaction (so nothing here uses CREATE INDEX CONCURRENTLY).

-- Check-in and check-out are wall-clock times at the property, so each property needs a zone.
alter table properties
  add column if not exists timezone text not null default 'America/New_York';

alter table reservations
  add column if not exists guest_name text,
  add column if not exists source text not null default 'direct';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_source_check') then
    alter table reservations
      add constraint reservations_source_check
      check (source in ('airbnb', 'vrbo', 'direct', 'other'));
  end if;
end $$;

-- A property cannot have two stays at the same time. Half-open ranges ([start, end)) let a
-- same-day turnover through: one stay ending at 11:00 and the next starting at 11:00.
create extension if not exists btree_gist;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_no_overlap') then
    alter table reservations
      add constraint reservations_no_overlap
      exclude using gist (property_id with =, tstzrange(starts_at, ends_at, '[)') with &&);
  end if;
end $$;
