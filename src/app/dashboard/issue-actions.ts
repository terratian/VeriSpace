"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { alertHook } from "@/lib/alertHook";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { ISSUE_CATEGORIES, ISSUE_RESOLVED, MANUAL_ENTRY_TYPES } from "@/lib/issues";
import { LedgerAuthError, appendLedgerEvent } from "@/lib/ledger";
import { signedInClient } from "@/lib/session";
import { supabaseLedgerDb } from "@/lib/supabase/server";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");
const fail = (error: string): ActionState => ({ ok: false, error });
const firstIssue = (err: z.ZodError) => err.issues[0]?.message ?? "Check the form and try again.";

/** Appends as the signed-in owner. The room must be theirs: RLS hides anyone else's. */
async function append(roomId: string, eventType: string, payload: Record<string, unknown>): Promise<ActionState> {
  const { supabase, user } = await signedInClient();
  const { data: room } = await supabase.from("rooms").select("id").eq("id", roomId).maybeSingle();
  if (!room) return fail("Room not found.");
  try {
    await appendLedgerEvent(supabaseLedgerDb(), { kind: "manager", userId: user.id }, { roomId, eventType, payload }, undefined, {
      afterAppend: async (info) => {
        const hook = alertHook(await headers());
        after(() => hook?.(info));
      },
    });
  } catch (err) {
    return fail(err instanceof LedgerAuthError ? err.message : "Couldn't record that. Try again.");
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Recorded in the ledger" };
}

/** Add an entry by hand: a problem to fix, maintenance that was done, or an inspection note. */
export async function logEntry(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      roomId: z.guid(),
      type: z.enum(MANUAL_ENTRY_TYPES),
      featureId: z.union([z.guid(), z.literal("")]),
      category: z.union([z.enum(ISSUE_CATEGORIES), z.literal("")]),
      note: z.string().trim().max(500, "Keep the note under 500 characters."),
    })
    .safeParse({
      roomId: text(fd, "roomId"),
      type: text(fd, "type"),
      featureId: text(fd, "featureId"),
      category: text(fd, "category"),
      note: text(fd, "note"),
    });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const p = parsed.data;
  if (p.type === "issue_reported" && !p.note) return fail("Describe the problem.");

  const payload: Record<string, unknown> = {};
  if (p.note) payload.note = p.note;
  if (p.featureId) payload.featureId = p.featureId;
  if (p.type === "issue_reported" && p.category) payload.category = p.category;
  return append(p.roomId, p.type, payload);
}

export async function resolveIssue(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z
    .object({ roomId: z.guid(), issueId: z.coerce.number().int().positive(), note: z.string().trim().max(500, "Keep the note under 500 characters.") })
    .safeParse({ roomId: text(fd, "roomId"), issueId: text(fd, "issueId"), note: text(fd, "note") });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const p = parsed.data;
  return append(p.roomId, ISSUE_RESOLVED, { issueId: p.issueId, ...(p.note ? { note: p.note } : {}) });
}
