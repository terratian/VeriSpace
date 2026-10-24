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
