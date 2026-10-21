"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { describeDbError } from "@/lib/db-errors";
import { checklistSchema, contentSchema, proceduresSchema } from "@/lib/guide";
import { signedInClient } from "@/lib/session";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");
const fail = (error: string): ActionState => ({ ok: false, error });
const firstIssue = (err: z.ZodError) => err.issues[0]?.message ?? "Check the form and try again.";
const refresh = () => revalidatePath("/dashboard", "layout");

// Row Level Security enforces ownership on every statement here: a row that isn't the signed-in
// manager's is invisible to them, so a foreign id behaves like a missing one.

export async function saveProcedures(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = proceduresSchema.safeParse({
    propertyId: text(fd, "propertyId"),
    checkin: text(fd, "checkin"),
    checkout: text(fd, "checkout"),
    rules: text(fd, "rules"),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const p = parsed.data;

  const { supabase } = await signedInClient();
  const { data, error } = await supabase
    .from("properties")
    .update({ checkin_instructions: p.checkin || null, checkout_instructions: p.checkout || null, house_rules: p.rules || null })
    .eq("id", p.propertyId)
    .select("id");
  if (error) return fail(describeDbError(error));
  if (!data?.length) return fail("Property not found.");

  refresh();
  return { ok: true, message: "Saved" };
}

export async function addRoomContent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = contentSchema.safeParse({
    roomId: text(fd, "roomId"),
    kind: text(fd, "kind"),
    title: text(fd, "title"),
    body: text(fd, "body"),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const c = parsed.data;

  const { supabase } = await signedInClient();
  const { error } = await supabase.from("room_content").insert({ room_id: c.roomId, kind: c.kind, title: c.title, body: c.body });
  if (error) return fail(describeDbError(error));

  refresh();
  return { ok: true, message: `Added ${c.title}` };
}

export async function deleteRoomContent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.guid().safeParse(text(fd, "id"));
  if (!id.success) return fail("Entry not found.");

  const { supabase } = await signedInClient();
  const { data, error } = await supabase.from("room_content").delete().eq("id", id.data).select("id");
  if (error) return fail(describeDbError(error));
  if (!data?.length) return fail("Entry not found.");

  refresh();
  return { ok: true };
}

export async function addChecklistItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = checklistSchema.safeParse({
    roomId: text(fd, "roomId"),
    label: text(fd, "label"),
    requiresPhoto: fd.get("requiresPhoto") === "on",
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const t = parsed.data;

  const { supabase } = await signedInClient();
  const { error } = await supabase
    .from("room_checklist_items")
    .insert({ room_id: t.roomId, label: t.label, requires_photo: t.requiresPhoto });
  if (error) return fail(describeDbError(error));

  refresh();
  return { ok: true, message: `Added ${t.label}` };
}

export async function deleteChecklistItem(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.guid().safeParse(text(fd, "id"));
  if (!id.success) return fail("Task not found.");

  const { supabase } = await signedInClient();
  const { data, error } = await supabase.from("room_checklist_items").delete().eq("id", id.data).select("id");
  if (error) return fail(describeDbError(error));
  if (!data?.length) return fail("Task not found.");

  refresh();
  return { ok: true };
}
