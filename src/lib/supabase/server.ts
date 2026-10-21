import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import type { AppendedEvent, ChainStatus, LedgerDb, LedgerRow, RoomRecord } from "../ledger";

let cached: SupabaseClient | null = null;

/** Service-role client. Server only: it bypasses Row Level Security. */
export function serviceClient(): SupabaseClient {
  cached ??= createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function supabaseLedgerDb(client: SupabaseClient = serviceClient()): LedgerDb {
  return {
    async getRoom(roomId): Promise<RoomRecord | null> {
      const { data, error } = await client
        .from("rooms")
        .select("id, property_id, properties(owner_id)")
        .eq("id", roomId)
        .maybeSingle();
      if (error) throw new Error(`room lookup failed: ${error.message}`);
      if (!data) return null;
      const property = data.properties as unknown as { owner_id: string } | null;
      if (!property) return null;
      return { id: data.id, propertyId: data.property_id, ownerId: property.owner_id };
    },

    async insertEvent(row: LedgerRow): Promise<AppendedEvent> {
      const { data, error } = await client
        .from("room_state_ledger")
        .insert({
          room_id: row.roomId,
          actor_role: row.actorRole,
          event_type: row.eventType,
          payload: row.payload,
          frame_sha256: row.frameSha256 ?? null,
          coord_x: row.coords?.x ?? null,
          coord_y: row.coords?.y ?? null,
          coord_z: row.coords?.z ?? null,
        })
        .select("id, seq, row_hash")
        .single();
      if (error) throw new Error(`ledger insert failed: ${error.message}`);
      return { id: Number(data.id), seq: Number(data.seq), rowHash: data.row_hash };
    },

    async featureInRoom(roomId, featureId): Promise<boolean> {
      const { data, error } = await client.from("room_features").select("id").eq("id", featureId).eq("room_id", roomId).maybeSingle();
      if (error) throw new Error(`feature lookup failed: ${error.message}`);
      return !!data;
    },

    async verifyChain(roomId): Promise<ChainStatus> {
      const { data, error } = await client.rpc("verify_room_chain", { p_room_id: roomId });
      if (error) throw new Error(`chain verification failed: ${error.message}`);
      const r = Array.isArray(data) ? data[0] : data;
      return {
        ok: Boolean(r?.ok),
        checked: Number(r?.checked ?? 0),
        firstBadId: r?.first_bad_id == null ? null : Number(r.first_bad_id),
        reason: r?.reason ?? null,
      };
    },
  };
}
