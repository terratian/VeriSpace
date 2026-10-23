"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { describeDbError } from "@/lib/db-errors";
import { LedgerAuthError, appendLedgerEvent } from "@/lib/ledger";
import { FEATURE_STATUS_EVENT, FT, featureSchema, layoutSchema, statusSchema } from "@/lib/model";
import { signedInClient } from "@/lib/session";
import { fmtDateTime } from "@/lib/time";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseLedgerDb } from "@/lib/supabase/server";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");
const fail = (error: string): ActionState => ({ ok: false, error });
const firstIssue = (err: z.ZodError) => err.issues[0]?.message ?? "Check the form and try again.";
const refresh = () => revalidatePath("/dashboard", "layout");
const meters = (ft: number | null) => (ft === null ? null : Math.round(ft * FT * 100) / 100);

/**
 * Changes to the unit itself (layout, adding or removing features) wait until no guest is in house.
 * Status changes don't: a hot tub can break mid-stay, and the record should say so. Returns the
 * message to show, or null when the unit is empty.
 */
async function occupiedMessage(supabase: SupabaseClient, roomId: string): Promise<string | null> {
  const { data: room } = await supabase.from("rooms").select("property_id, properties(timezone)").eq("id", roomId).maybeSingle();
  if (!room) return null;
  const now = new Date().toISOString();
  const { data: stay } = await supabase
    .from("reservations")
    .select("ends_at")
    .eq("property_id", room.property_id)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!stay) return null;
  const tz = (room.properties as unknown as { timezone: string } | null)?.timezone ?? "UTC";
  return `A guest is in house until ${fmtDateTime(stay.ends_at, tz)}. Changes to the unit wait until checkout.`;
}

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
  const busy = await occupiedMessage(supabase, p.roomId);
  if (busy) return fail(busy);
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

const batchSchema = z
  .array(z.object({ roomId: z.guid(), x: z.number().min(-3000).max(3000), y: z.number().min(-3000).max(3000), w: z.number().min(1).max(250), d: z.number().min(1).max(250) }))
  .min(1)
  .max(200);

/** Save every room's position and size at once, from the drag-and-drop layout (values in feet). */
export async function saveLayoutBatch(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let raw: unknown;
  try {
    raw = JSON.parse(text(fd, "rooms"));
  } catch {
    return fail("Couldn't read the layout.");
  }
  const parsed = batchSchema.safeParse(raw);
  if (!parsed.success) return fail("That layout has a room outside the allowed size or position.");

  const { supabase } = await signedInClient();
  const busy = await occupiedMessage(supabase, parsed.data[0].roomId);
  if (busy) return fail(busy);

  const results = await Promise.all(
    parsed.data.map((r) =>
      supabase
        .from("rooms")
        .update({ width_m: meters(r.w), length_m: meters(r.d), plan_x: meters(r.x), plan_y: meters(r.y) })
        .eq("id", r.roomId)
        .select("id"),
    ),
  );
  const bad = results.find((r) => r.error);
  if (bad?.error) return fail(describeDbError(bad.error));
  if (results.some((r) => !r.data?.length)) return fail("A room wasn't found.");

  // No revalidation: the studio already shows this layout, and refreshing would reset it mid-drag.
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
  const busy = await occupiedMessage(supabase, f.roomId);
  if (busy) return fail(busy);
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
  const { data: feature } = await supabase.from("room_features").select("room_id").eq("id", id.data).maybeSingle();
  if (!feature) return fail("Feature not found.");
  const busy = await occupiedMessage(supabase, feature.room_id);
  if (busy) return fail(busy);
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

const measuredSchema = z.object({
  roomId: z.guid(),
  widthFt: z.number().min(1, "That room is too small to be right.").max(250, "That room is too large to be right."),
  lengthFt: z.number().min(1, "That room is too small to be right.").max(250, "That room is too large to be right."),
  heightFt: z.number().min(5, "The ceiling looks too low to be right.").max(40, "The ceiling looks too high to be right.").nullable(),
});

/** Save the size worked out from corners marked in a scan. Floor and plan position stay as they are. */
export async function saveMeasuredSize(input: unknown): Promise<ActionState> {
  const parsed = measuredSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const p = parsed.data;
  const { supabase } = await signedInClient();
  const busy = await occupiedMessage(supabase, p.roomId);
  if (busy) return fail(busy);
  const update: Record<string, number> = { width_m: meters(p.widthFt) as number, length_m: meters(p.lengthFt) as number };
  if (p.heightFt !== null) update.height_m = meters(p.heightFt) as number;
  const { data, error } = await supabase.from("rooms").update(update).eq("id", p.roomId).select("id");
  if (error) return fail(describeDbError(error));
  if (!data?.length) return fail("Room not found.");
  refresh();
  return { ok: true, message: "Room size saved" };
}
