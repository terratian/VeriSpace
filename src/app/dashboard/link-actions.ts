"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { describeDbError } from "@/lib/db-errors";
import { emailConfigured, sendEmail, sendSms, smsConfigured } from "@/lib/deliver";
import { env } from "@/lib/env";
import { issueLink } from "@/lib/links";
import { linkEmail, linkSms } from "@/lib/linkMessages";
import { requestOrigin } from "@/lib/origin";
import { maskEmail, maskPhone, normalizePhone } from "@/lib/phone";
import { signedInClient } from "@/lib/session";
import { fmtDateTime } from "@/lib/time";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");
const fail = (error: string): ActionState => ({ ok: false, error });
const done = (message: string): ActionState => {
  revalidatePath("/dashboard", "layout");
  return { ok: true, message };
};
const emailSchema = z.email("Enter a valid email address");

/**
 * Send a guest or crew link by text to the phone on file, or by email of record when asked. The link is
 * never shown to the owner or returned to the browser: it goes only to the person it is for.
 */
export async function sendLink(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z
    .object({ reservationId: z.guid(), role: z.enum(["guest", "crew"]), channel: z.enum(["sms", "email"]), crewId: z.union([z.guid(), z.literal("")]) })
    .safeParse({ reservationId: text(fd, "reservationId"), role: text(fd, "role"), channel: text(fd, "channel"), crewId: text(fd, "crewId") });
  if (!parsed.success) return fail("Choose who to send it to.");
  const { reservationId, role, channel, crewId } = parsed.data;

  const { supabase, user } = await signedInClient();
  const { data: stay, error } = await supabase
    .from("reservations")
    .select("id, property_id, starts_at, ends_at, guest_name, guest_phone, guest_email, properties(name, timezone)")
    .eq("id", reservationId)
    .maybeSingle();
  if (error) return fail(error.code === "42703" ? "Run the newest database update first (supabase/apply-pending.sql)." : describeDbError(error));
  if (!stay) return fail("Stay not found.");
  const prop = stay.properties as unknown as { name: string; timezone: string } | null;
  const stayRow = stay as unknown as { id: string; property_id: string; starts_at: string; ends_at: string; guest_name: string | null; guest_phone: string | null; guest_email: string | null };

  let name: string | null;
  let phone: string | null;
  let email: string | null;
  if (role === "guest") {
    ({ guest_name: name, guest_phone: phone, guest_email: email } = stayRow);
  } else {
    if (!crewId) return fail("Choose who on your crew this is for.");
    const { data: c, error: cErr } = await supabase.from("crew_contacts").select("name, phone, email").eq("id", crewId).eq("property_id", stayRow.property_id).maybeSingle();
    if (cErr) return fail(describeDbError(cErr));
    if (!c) return fail("Crew member not found.");
    ({ name, phone, email } = c as { name: string; phone: string | null; email: string | null });
  }

  const to = channel === "sms" ? phone : email;
  if (!to) {
    return fail(
      channel === "sms"
        ? `There is no phone number on file${email ? `, but there is an email (${maskEmail(email)}). You can send it there instead` : ". Add one first"}.`
        : "There is no email on file. Add one first.",
    );
  }
  if (channel === "sms" ? !smsConfigured() : !emailConfigured()) {
    return fail(channel === "sms" ? "Text messages aren't set up yet. Add the Plivo keys in the hosting settings and redeploy." : "Email isn't set up yet. Add the Resend keys in the hosting settings and redeploy.");
  }

  let secret: string;
  try {
    secret = env.capabilitySecret;
  } catch {
    return fail("This server has no CAPABILITY_SECRET set, so it can't sign links.");
  }

  const zone = prop?.timezone ?? "UTC";
  const link = await issueLink({
    secret,
    origin: requestOrigin(await headers()),
    role,
    label: name ?? undefined,
    stay: { id: stayRow.id, propertyId: stayRow.property_id, startsAt: new Date(stayRow.starts_at), endsAt: new Date(stayRow.ends_at) },
  });
  const args = { role, name, propertyName: prop?.name ?? "the property", url: link.url, until: fmtDateTime(link.expiresAt, zone) };
  const result = channel === "sms" ? await sendSms(to, linkSms(args)) : await (async () => {
    const m = linkEmail(args);
    return sendEmail(to, m.subject, m.text);
  })();

  const masked = channel === "sms" ? maskPhone(to) : maskEmail(to);
  await supabase.from("link_deliveries").insert({
    property_id: stayRow.property_id,
    reservation_id: stayRow.id,
    role,
    channel,
    to_masked: masked,
    recipient: name,
    status: result === "sent" ? "sent" : "failed",
    error: result === "sent" ? null : result,
    sent_by: user.id,
  });

  if (result === "sent") return done(`${role === "guest" ? "Guest guide" : "Crew steps"} ${channel === "sms" ? "texted" : "emailed"} to ${masked}.`);
  const other = channel === "sms" ? (email ? ` You can email it to ${maskEmail(email)} instead.` : "") : "";
  return fail(`${channel === "sms" ? "The text" : "The email"} didn't go through${result === "skipped" ? " (that address isn't valid)" : ""}.${other}`);
}

/** Phone and email for the guest on a stay. Blank clears it. */
export async function saveStayContact(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.guid().safeParse(text(fd, "reservationId"));
  if (!id.success) return fail("Stay not found.");
  const phone = normalizePhone(text(fd, "phone"));
  if (!phone.ok) return fail(phone.error);
  const emailRaw = text(fd, "email").trim().toLowerCase();
  if (emailRaw && !emailSchema.safeParse(emailRaw).success) return fail("Enter a valid email address.");
  const { supabase } = await signedInClient();
  const { data, error } = await supabase.from("reservations").update({ guest_phone: phone.value, guest_email: emailRaw || null }).eq("id", id.data).select("id");
  if (error) return fail(error.code === "42703" ? "Run the newest database update first (supabase/apply-pending.sql)." : describeDbError(error));
  if (!data?.length) return fail("Stay not found.");
  return done("Saved");
}

export async function addCrewContact(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const base = z.object({ propertyId: z.guid(), name: z.string().trim().min(1, "Enter a name").max(80) }).safeParse({ propertyId: text(fd, "propertyId"), name: text(fd, "name") });
  if (!base.success) return fail(base.error.issues[0]?.message ?? "Check the form.");
  const phone = normalizePhone(text(fd, "phone"));
  if (!phone.ok) return fail(phone.error);
  const emailRaw = text(fd, "email").trim().toLowerCase();
  if (emailRaw && !emailSchema.safeParse(emailRaw).success) return fail("Enter a valid email address.");
  if (!phone.value && !emailRaw) return fail("Add a phone number or an email so we can send them links.");
  const { supabase } = await signedInClient();
  const { error } = await supabase.from("crew_contacts").insert({ property_id: base.data.propertyId, name: base.data.name, phone: phone.value, email: emailRaw || null });
  if (error) return fail(error.code === "42P01" ? "Run the newest database update first (supabase/apply-pending.sql)." : describeDbError(error));
  return done(`${base.data.name} added`);
}

export async function removeCrewContact(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.guid().safeParse(text(fd, "crewId"));
  if (!id.success) return fail("Not found.");
  const { supabase } = await signedInClient();
  const { error } = await supabase.from("crew_contacts").delete().eq("id", id.data);
  return error ? fail(describeDbError(error)) : done("Removed");
}
