import type { SupabaseClient } from "@supabase/supabase-js";
import { anchorDigest, stampDigest, type RoomHead } from "@/lib/anchor";

export const DEFAULT_TSA = "https://freetsa.org/tsr";

export type AnchorResult = { propertyId: string; status: "stamped" | "unchanged" | "empty" | "failed"; message?: string };

/** The latest entry of every room in a property that has any. */
export async function currentHeads(db: SupabaseClient, propertyId: string): Promise<RoomHead[]> {
  const { data: rooms, error } = await db.from("rooms").select("id").eq("property_id", propertyId);
  if (error) throw new Error(error.message);
  const heads: RoomHead[] = [];
  for (const r of (rooms ?? []) as { id: string }[]) {
    const { data, error: e } = await db.from("room_state_ledger").select("seq, row_hash").eq("room_id", r.id).order("seq", { ascending: false }).limit(1);
    if (e) throw new Error(e.message);
    const row = (data ?? [])[0] as { seq: number | string; row_hash: string } | undefined;
    if (row) heads.push({ roomId: r.id, seq: Number(row.seq), rowHash: row.row_hash });
  }
  return heads;
}

/** Timestamp one property's records, unless nothing has changed since the last timestamp. */
export async function anchorProperty(db: SupabaseClient, propertyId: string, tsaUrl: string, fetchFn?: typeof fetch): Promise<AnchorResult> {
  try {
    const heads = await currentHeads(db, propertyId);
    if (heads.length === 0) return { propertyId, status: "empty" };
    const digest = anchorDigest(heads);
    const { data: last } = await db.from("ledger_anchors").select("digest").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(1);
    if (((last ?? [])[0] as { digest: string } | undefined)?.digest === digest) return { propertyId, status: "unchanged" };
    const { reply, genTime } = await stampDigest(tsaUrl, digest, fetchFn);
    const { error } = await db.from("ledger_anchors").insert({
      property_id: propertyId,
      digest,
      heads,
      tsa_url: tsaUrl,
      reply_b64: Buffer.from(reply).toString("base64"),
      gen_time: genTime?.toISOString() ?? null,
    });
    if (error) throw new Error(error.message);
    return { propertyId, status: "stamped" };
  } catch (e) {
    return { propertyId, status: "failed", message: e instanceof Error ? e.message : "Unknown error" };
  }
}
