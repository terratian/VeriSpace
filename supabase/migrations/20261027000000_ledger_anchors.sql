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
