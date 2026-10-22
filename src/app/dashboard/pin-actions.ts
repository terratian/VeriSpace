"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { describeDbError } from "@/lib/db-errors";
import { pinSchema } from "@/lib/scan";
import { signedInClient } from "@/lib/session";

const fail = (error: string): ActionState => ({ ok: false, error });

/** Put an asset at a direction in a room scan, or move it. */
export async function savePin(input: unknown): Promise<ActionState> {
  const parsed = pinSchema.safeParse(input);
  if (!parsed.success) return fail("That position isn't valid.");
  const p = parsed.data;
  const { supabase } = await signedInClient();
  const { data: feature } = await supabase.from("room_features").select("room_id").eq("id", p.featureId).maybeSingle();
  if (!feature) return fail("Asset not found.");
  const { error } = await supabase.from("room_feature_pins").upsert(
    { feature_id: p.featureId, room_id: feature.room_id, scan_id: p.scanId, yaw: Math.round(p.yaw * 10) / 10, pitch: Math.round(p.pitch * 10) / 10 },
    { onConflict: "feature_id,scan_id" },
  );
  if (error) return fail(describeDbError(error));
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Pinned" };
}

export async function removePin(input: unknown): Promise<ActionState> {
  const parsed = z.object({ featureId: z.guid(), scanId: z.guid() }).safeParse(input);
  if (!parsed.success) return fail("Not found.");
  const { supabase } = await signedInClient();
  const { error } = await supabase.from("room_feature_pins").delete().eq("feature_id", parsed.data.featureId).eq("scan_id", parsed.data.scanId);
  if (error) return fail(describeDbError(error));
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Removed" };
}
