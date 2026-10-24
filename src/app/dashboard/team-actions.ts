"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { E164 } from "@/lib/alerts";
import { describeDbError } from "@/lib/db-errors";
import { signedInClient } from "@/lib/session";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");
const fail = (error: string): ActionState => ({ ok: false, error });
const done = (message: string): ActionState => {
  revalidatePath("/dashboard", "layout");
  return { ok: true, message };
};

/** Owner only: row-level security allows no one else to add or remove managers. */
export async function addManager(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({ propertyId: z.guid(), email: z.email("Enter a valid email address") }).safeParse({ propertyId: text(fd, "propertyId"), email: text(fd, "email").trim() });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the email address.");
  const { supabase, user } = await signedInClient();
  const email = parsed.data.email.toLowerCase();
  if (email === user.email?.toLowerCase()) return fail("That's your own email.");
  const { error } = await supabase.from("property_members").insert({ property_id: parsed.data.propertyId, email, invited_by: user.id });
  if (error) return fail(error.code === "23505" ? "They're already a manager here." : error.code === "42P01" ? "Run the newest database migration first." : describeDbError(error));
  return done("Added. They can sign in with that email and will see this property.");
}

export async function removeManager(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.guid().safeParse(text(fd, "memberId"));
  if (!id.success) return fail("Not found.");
  const { supabase } = await signedInClient();
  const { error } = await supabase.from("property_members").delete().eq("id", id.data);
  return error ? fail(describeDbError(error)) : done("Removed.");
}

export async function saveAlertContacts(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      propertyId: z.guid(),
      email: z.union([z.email("Enter a valid email address"), z.literal("")]),
      phone: z.union([z.string().regex(E164, "Use international format, like +15551234567"), z.literal("")]),
    })
    .safeParse({ propertyId: text(fd, "propertyId"), email: text(fd, "email").trim(), phone: text(fd, "phone").trim().replace(/[\s()-]/g, "") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const { supabase } = await signedInClient();
  const { data, error } = await supabase
    .from("properties")
    .update({ alert_email: parsed.data.email || null, alert_phone: parsed.data.phone || null })
    .eq("id", parsed.data.propertyId)
    .select("id");
  if (error) return fail(error.code === "42703" ? "Run the newest database migration first." : describeDbError(error));
  if (!data?.length) return fail("Property not found.");
  return done("Saved");
}
