"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { describeDbError } from "@/lib/db-errors";
import { env } from "@/lib/env";
import { issueLink } from "@/lib/links";
import { requestOrigin } from "@/lib/origin";
import { OVERLAP_ERROR_CODE, resolveStay, stayFormSchema } from "@/lib/reservations";
import { createSessionClient } from "@/lib/supabase/ssr-server";
import { fmtDateTime, isValidTimeZone } from "@/lib/time";

async function signedInClient() {
  const supabase = createSessionClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");
const fail = (error: string): ActionState => ({ ok: false, error });
const firstIssue = (err: z.ZodError) => err.issues[0]?.message ?? "Check the form and try again.";
const refresh = () => revalidatePath("/dashboard", "layout");

const propertySchema = z.object({
  name: z.string().trim().min(1, "Enter a property name").max(120, "Property name is too long"),
  address: z.string().trim().max(240, "Address is too long"),
  timezone: z.string().refine(isValidTimeZone, "Choose a time zone"),
});

/** Row Level Security enforces ownership too; owner_id here just records who owns the new row. */
export async function addProperty(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = propertySchema.safeParse({ name: text(fd, "name"), address: text(fd, "address"), timezone: text(fd, "timezone") });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const { supabase, user } = await signedInClient();
  const { data, error } = await supabase
    .from("properties")
    .insert({ owner_id: user.id, name: parsed.data.name, address: parsed.data.address || null, timezone: parsed.data.timezone })
    .select("id")
    .single();
  if (error) return fail(describeDbError(error));

  refresh();
  // Straight into setup, which starts with the rooms.
  redirect(`/dashboard/properties/${data.id}/setup?step=rooms`);
}

/**
 * Remove a property. One that has never recorded anything is deleted outright. One with ledger
 * history can't be erased, so it is archived instead: hidden from the dashboard, links switched off,
 * record kept. Not allowed while a guest is in house.
 */
export async function deleteProperty(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.guid().safeParse(text(fd, "propertyId"));
  if (!id.success) return fail("Property not found.");
  const { supabase } = await signedInClient();

  const { data: property } = await supabase.from("properties").select("id").eq("id", id.data).maybeSingle();
  if (!property) return fail("Property not found.");

  const now = new Date().toISOString();
  const { data: stay } = await supabase.from("reservations").select("id").eq("property_id", id.data).lte("starts_at", now).gt("ends_at", now).limit(1).maybeSingle();
  if (stay) return fail("A guest is in house. Remove the property after checkout.");

  const { data: rooms } = await supabase.from("rooms").select("id").eq("property_id", id.data);
  const roomIds = (rooms ?? []).map((r) => r.id as string);
  let history = 0;
  if (roomIds.length > 0) {
    const { count, error } = await supabase.from("room_state_ledger").select("id", { count: "exact", head: true }).in("room_id", roomIds);
    if (error) return fail(describeDbError(error));
    history = count ?? 0;
  }

  if (history > 0) {
    const { error } = await supabase.from("properties").update({ archived_at: now }).eq("id", id.data);
    if (error) {
      return fail(error.code === "42703" ? "Archiving needs the latest database update (20261026000000_property_archive.sql). Run it in Supabase, then try again." : describeDbError(error));
    }
  } else {
    const steps = [
      supabase.from("reservations").delete().eq("property_id", id.data),
      supabase.from("rooms").delete().eq("property_id", id.data),
      supabase.from("properties").delete().eq("id", id.data),
    ];
    for (const step of steps) {
      const { error } = await step;
      if (error) return fail(describeDbError(error));
    }
  }
  refresh();
  redirect("/dashboard");
}

export async function updateProperty(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.guid().safeParse(text(fd, "propertyId"));
  const parsed = propertySchema.safeParse({ name: text(fd, "name"), address: text(fd, "address"), timezone: text(fd, "timezone") });
  if (!id.success || !parsed.success) return fail(parsed.success ? "Property not found." : firstIssue(parsed.error));

  const { supabase } = await signedInClient();
  const { data, error } = await supabase
    .from("properties")
    .update({ name: parsed.data.name, address: parsed.data.address || null, timezone: parsed.data.timezone })
    .eq("id", id.data)
    .select("id");
  if (error) return fail(describeDbError(error));
  if (!data?.length) return fail("Property not found.");

  refresh();
  return { ok: true, message: "Saved" };
}

export async function addRoom(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z
    .object({ propertyId: z.guid(), name: z.string().trim().min(1, "Enter a room name").max(120, "Room name is too long") })
    .safeParse({ propertyId: text(fd, "propertyId"), name: text(fd, "name") });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const { supabase } = await signedInClient();
  const { error } = await supabase.from("rooms").insert({ property_id: parsed.data.propertyId, name: parsed.data.name });
  if (error) return fail(describeDbError(error));

  refresh();
  return { ok: true, message: `Added ${parsed.data.name}` };
}

/** Add several rooms at once, from the common-room picks and a typed list. Skips names the property already has. */
export async function addRooms(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const propertyId = z.guid().safeParse(text(fd, "propertyId"));
  if (!propertyId.success) return fail("Property not found.");
  const typed = text(fd, "other").split(/[,\n]/);
  const picked = fd.getAll("names").map(String);
  const seen = new Set<string>();
  const names = [...picked, ...typed]
    .map((n) => n.trim().slice(0, 120))
    .filter((n) => {
      const k = n.toLowerCase();
      if (!n || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 30);
  if (names.length === 0) return fail("Pick or type at least one room.");

  const { supabase } = await signedInClient();
  const { data: existing, error: readError } = await supabase.from("rooms").select("name").eq("property_id", propertyId.data);
  if (readError) return fail(describeDbError(readError));
  const have = new Set((existing ?? []).map((r) => String(r.name).toLowerCase()));
  const fresh = names.filter((n) => !have.has(n.toLowerCase()));
  if (fresh.length === 0) return fail("Those rooms are already added.");

  const { error } = await supabase.from("rooms").insert(fresh.map((name) => ({ property_id: propertyId.data, name })));
  if (error) return fail(describeDbError(error));

  refresh();
  return { ok: true, message: `Added ${fresh.length} ${fresh.length === 1 ? "room" : "rooms"}` };
}

export async function addReservation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = stayFormSchema.safeParse({
    propertyId: text(fd, "propertyId"),
    guestName: text(fd, "guestName"),
    source: text(fd, "source"),
    checkInDate: text(fd, "checkInDate"),
    checkInTime: text(fd, "checkInTime"),
    checkOutDate: text(fd, "checkOutDate"),
    checkOutTime: text(fd, "checkOutTime"),
  });
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const form = parsed.data;

  const { supabase } = await signedInClient();
  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id, timezone")
    .eq("id", form.propertyId)
    .maybeSingle();
  if (propertyError) return fail(describeDbError(propertyError));
  if (!property) return fail("Property not found.");

  const stay = resolveStay(form, property.timezone);
  if (!stay.ok) return fail(stay.error);

  const { error } = await supabase.from("reservations").insert({
    property_id: property.id,
    starts_at: stay.startsAt.toISOString(),
    ends_at: stay.endsAt.toISOString(),
    guest_name: form.guestName || null,
    source: form.source,
  });
  if (error) {
    return fail(
      error.code === OVERLAP_ERROR_CODE
        ? "These dates overlap another stay at this property. Change the check-in or check-out."
        : describeDbError(error),
    );
  }

  refresh();
  return { ok: true, message: `Added ${fmtDateTime(stay.startsAt, property.timezone)} to ${fmtDateTime(stay.endsAt, property.timezone)}` };
}

export async function cancelReservation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = z.guid().safeParse(text(fd, "reservationId"));
  if (!id.success) return fail("Stay not found.");

  const { supabase } = await signedInClient();
  const { data, error } = await supabase.from("reservations").delete().eq("id", id.data).select("id");
  if (error) return fail(describeDbError(error));
  if (!data?.length) return fail("Stay not found.");

  refresh();
  return { ok: true, message: "Stay removed" };
}

/** Create a crew or guest link for a stay. The caller must own the property (RLS hides other rows). */
export async function createLink(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z
    .object({ reservationId: z.guid(), role: z.enum(["guest", "crew"]), label: z.string().trim().max(60, "Keep the name under 60 characters.") })
    .safeParse({ reservationId: text(fd, "reservationId"), role: text(fd, "role"), label: text(fd, "label") });
  if (!parsed.success) return fail("Choose guest or crew link.");

  const { supabase } = await signedInClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("id, property_id, starts_at, ends_at, properties(timezone)")
    .eq("id", parsed.data.reservationId)
    .maybeSingle();
  if (error) return fail(describeDbError(error));
  if (!data) return fail("Stay not found.");

  let secret: string;
  try {
    secret = env.capabilitySecret;
  } catch {
    return fail("This server has no CAPABILITY_SECRET set, so it can't sign links. Add one (at least 32 characters) to the environment and restart.");
  }

  try {
    const zone = (data.properties as unknown as { timezone: string } | null)?.timezone ?? "UTC";
    const link = await issueLink({
      secret,
      origin: requestOrigin(await headers()),
      role: parsed.data.role,
      label: parsed.data.label,
      stay: { id: data.id, propertyId: data.property_id, startsAt: new Date(data.starts_at), endsAt: new Date(data.ends_at) },
    });
    return {
      ok: true,
      link: { url: link.url, role: link.role, notBefore: link.notBefore.toISOString(), expiresAt: link.expiresAt.toISOString(), zone },
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Couldn't create the link.");
  }
}

/** Re-computes a room's hash chain in the database (as the signed-in owner, so RLS applies). */
export async function verifyRoom(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const roomId = z.guid().safeParse(text(fd, "roomId"));
  if (!roomId.success) return fail("Room not found.");

  const { supabase } = await signedInClient();
  const { data, error } = await supabase.rpc("verify_room_chain", { p_room_id: roomId.data });
  if (error) return fail(describeDbError(error));

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; checked: number | string; reason: string | null }
    | undefined;
  if (!row) return fail("The database returned no result.");
  const checked = Number(row.checked);
  return {
    ok: true,
    // On failure `checked` is the position of the first bad entry, which equals its seq.
    chain: { intact: row.ok, checked, brokenSeq: row.ok ? null : checked, reason: row.reason },
  };
}
