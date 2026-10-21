"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { describeDbError } from "@/lib/db-errors";
import { LedgerAuthError, appendLedgerEvent } from "@/lib/ledger";
import { FEATURE_STATUS_EVENT, FT, featureSchema, layoutSchema, statusSchema } from "@/lib/model";
import { signedInClient } from "@/lib/session";
import { supabaseLedgerDb } from "@/lib/supabase/server";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");
const fail = (error: string): ActionState => ({ ok: false, error });
const firstIssue = (err: z.ZodError) => err.issues[0]?.message ?? "Check the form and try again.";
const refresh = () => revalidatePath("/dashboard", "layout");
const meters = (ft: number | null) => (ft === null ? null : Math.round(ft * FT * 100) / 100);

// Row Level Security enforces ownership on these statements, so another manager's room or feature
// behaves like a missing one.

export async function saveRoomLayout(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = layoutSchema.safeParse({
    roomId: text(fd, "roomId"),
    width: text(fd, "width"),
    length: text(fd, "length"),
    height: text(fd, "height"),
    floor: text(fd, "floor"),
    planX: text(fd, "planX"),
    planY: text(fd, "planY"),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const p = parsed.data;
  // A position needs both coordinates; half a position would silently be ignored.
  if ((p.planX === null) !== (p.planY === null)) return fail("Set both position values, or leave both blank.");

  const { supabase } = await signedInClient();
  const { data, error } = await supabase
    .from("rooms")
    .update({
      width_m: meters(p.width),
      length_m: meters(p.length),
      height_m: meters(p.height),
      floor: p.floor,
      plan_x: meters(p.planX),
      plan_y: meters(p.planY),
    })
    .eq("id", p.roomId)
    .select("id");
  if (error) return fail(describeDbError(error));
  if (!data?.length) return fail("Room not found.");

  refresh();
  return { ok: true, message: "Saved" };
}

export async function addFeature(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = featureSchema.safeParse({
    roomId: text(fd, "roomId"),
    kind: text(fd, "kind"),
    name: text(fd, "name"),
    x: Number(text(fd, "xPct")) / 100,
    y: Number(text(fd, "yPct")) / 100,
    advertised: fd.get("advertised") === "on",
    details: text(fd, "details"),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const f = parsed.data;

  const { supabase } = await signedInClient();
  const { error } = await supabase
    .from("room_features")
    .insert({ room_id: f.roomId, kind: f.kind, name: f.name, pos_x: f.x, pos_y: f.y, advertised: f.advertised, details: f.details });
  if (error) return fail(describeDbError(error));

  refresh();
  return { ok: true, message: `Added ${f.name}` };
}

export async function deleteFeature(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.guid().safeParse(text(fd, "id"));
  if (!id.success) return fail("Feature not found.");
  const { supabase } = await signedInClient();
  const { error } = await supabase.from("room_features").delete().eq("id", id.data);
  if (error) return fail(describeDbError(error));
  refresh();
  return { ok: true, message: "Removed" };
}

/**
 * Change a feature's status. The change is a ledger entry, not an edit: the previous status stays
 * on record, and the current one is simply the latest entry.
 */
export async function setFeatureStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = statusSchema.safeParse({ featureId: text(fd, "featureId"), status: text(fd, "status"), note: text(fd, "note") });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const s = parsed.data;

  const { supabase, user } = await signedInClient();
  const { data: feature, error } = await supabase.from("room_features").select("id, room_id, name").eq("id", s.featureId).maybeSingle();
  if (error) return fail(describeDbError(error));
  if (!feature) return fail("Feature not found.");

  try {
    await appendLedgerEvent(
      supabaseLedgerDb(),
      { kind: "manager", userId: user.id },
      { roomId: feature.room_id, eventType: FEATURE_STATUS_EVENT, payload: { featureId: s.featureId, status: s.status, note: s.note, name: feature.name } },
    );
  } catch (err) {
    return fail(err instanceof LedgerAuthError ? err.message : "Couldn't record that. Try again.");
  }

  refresh();
  return { ok: true, message: "Recorded in the ledger" };
}
