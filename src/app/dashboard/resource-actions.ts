"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { describeDbError } from "@/lib/db-errors";
import { FEATURE_KINDS } from "@/lib/model";
import { BUCKET, featureEditSchema, pdfPathOk, resourceSchema, safeUrl } from "@/lib/resources";
import { signedInClient } from "@/lib/session";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");
const fail = (error: string): ActionState => ({ ok: false, error });
const refresh = () => revalidatePath("/dashboard", "layout");

/** Attach a product page, manual link or uploaded PDF to a room or one feature. Allowed even with a guest in house: it only adds help. */
export async function addResource(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const featureId = text(fd, "featureId");
  const parsed = resourceSchema.safeParse({ roomId: text(fd, "roomId"), featureId: featureId || null, title: text(fd, "title") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const r = parsed.data;

  const { supabase } = await signedInClient();
  const { data: room } = await supabase.from("rooms").select("property_id").eq("id", r.roomId).maybeSingle();
  if (!room) return fail("Room not found.");

  const storagePath = text(fd, "storagePath");
  let row: Record<string, unknown>;
  if (storagePath) {
    if (!pdfPathOk(room.property_id, storagePath)) return fail("That file isn't valid for this property.");
    row = { room_id: r.roomId, feature_id: r.featureId, kind: "pdf", title: r.title, storage_path: storagePath };
  } else {
    const url = safeUrl(text(fd, "url"));
    if (!url) return fail("Enter a web address that starts with https://");
    row = { room_id: r.roomId, feature_id: r.featureId, kind: "link", title: r.title, url };
  }
  const { error } = await supabase.from("room_resources").insert(row);
  if (error) return fail(describeDbError(error));
  refresh();
  return { ok: true, message: `Added ${r.title}` };
}

export async function deleteResource(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.guid().safeParse(text(fd, "id"));
  if (!id.success) return fail("Not found.");
  const { supabase } = await signedInClient();
  const { data: row } = await supabase.from("room_resources").select("storage_path").eq("id", id.data).maybeSingle();
  if (!row) return fail("Not found.");
  const { error } = await supabase.from("room_resources").delete().eq("id", id.data);
  if (error) return fail(describeDbError(error));
  if (row.storage_path) await supabase.storage.from(BUCKET).remove([row.storage_path]);
  refresh();
  return { ok: true, message: "Removed" };
}

/** Edit a feature's name, type, details and whether guests see it. Position is set when placing it. */
export async function updateFeature(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = featureEditSchema.safeParse({
    id: text(fd, "id"),
    name: text(fd, "name"),
    kind: text(fd, "kind"),
    advertised: fd.get("advertised") === "on",
    details: text(fd, "details"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const f = parsed.data;
  if (!(FEATURE_KINDS as readonly string[]).includes(f.kind)) return fail("Choose a type.");

  const { supabase } = await signedInClient();
  const { data: cur } = await supabase.from("room_features").select("room_id").eq("id", f.id).maybeSingle();
  if (!cur) return fail("Feature not found.");
  const { data: room } = await supabase.from("rooms").select("property_id").eq("id", cur.room_id).maybeSingle();
  if (room) {
    const now = new Date().toISOString();
    const { data: stay } = await supabase.from("reservations").select("id").eq("property_id", room.property_id).lte("starts_at", now).gt("ends_at", now).limit(1).maybeSingle();
    if (stay) return fail("A guest is in house. Changes to the unit wait until checkout.");
  }
  const { error } = await supabase.from("room_features").update({ name: f.name, kind: f.kind, advertised: f.advertised, details: f.details }).eq("id", f.id);
  if (error) return fail(describeDbError(error));
  refresh();
  return { ok: true, message: "Saved" };
}

export async function renameRoom(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const p = z.object({ id: z.guid(), name: z.string().trim().min(1, "Enter a room name").max(120) }).safeParse({ id: text(fd, "id"), name: text(fd, "name") });
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Check the form.");
  const { supabase } = await signedInClient();
  const { data, error } = await supabase.from("rooms").update({ name: p.data.name }).eq("id", p.data.id).select("id");
  if (error) return fail(describeDbError(error));
  if (!data?.length) return fail("Room not found.");
  refresh();
  return { ok: true, message: "Saved" };
}

/** Remove a room. A room with recorded history can't be removed, because the ledger can't be edited. */
export async function deleteRoom(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.guid().safeParse(text(fd, "id"));
  if (!id.success) return fail("Room not found.");
  const { supabase } = await signedInClient();
  const { count } = await supabase.from("room_state_ledger").select("id", { count: "exact", head: true }).eq("room_id", id.data);
  if ((count ?? 0) > 0) return fail("This room has recorded history, which can't be erased. Rename it instead.");
  const { error } = await supabase.from("rooms").delete().eq("id", id.data);
  if (error) return fail(describeDbError(error));
  refresh();
  return { ok: true, message: "Removed" };
}
