-- A property with recorded history can't be deleted (the ledger can't be erased), so it is archived:
-- hidden from the dashboard and its links stop working, while the record stays. Additive and idempotent.
alter table properties add column if not exists archived_at timestamptz;
