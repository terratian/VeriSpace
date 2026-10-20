import CaptureForm, { type EventOption } from "@/components/CaptureForm";
import { verifyCapability, type CapabilityRole } from "@/lib/capability";
import { env } from "@/lib/env";
import { serviceClient } from "@/lib/supabase/server";

const MESSAGES = {
  expired: "This link has expired. Ask the property manager for a new one.",
  not_yet_valid: "This link isn't active yet. It opens when the reservation starts.",
  invalid: "This link isn't valid.",
} as const;

/** Verifies a magic link on the server and renders the capture form for its property. */
export default async function LinkGate(props: {
  token: string;
  role: CapabilityRole;
  title: string;
  events: EventOption[];
}) {
  const result = await verifyCapability(env.capabilitySecret, props.token);
  if (!result.ok || result.claims.role !== props.role) {
    const reason = result.ok ? "invalid" : result.reason;
    return (
      <main className="mx-auto max-w-md px-6 py-20">
        <p role="alert" className="text-white">{MESSAGES[reason]}</p>
      </main>
    );
  }

  const { claims } = result;
  let query = serviceClient().from("rooms").select("id, name").eq("property_id", claims.propertyId).order("name");
  if (claims.roomIds) query = query.in("id", claims.roomIds);
  const { data: rooms, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <p className="font-mono text-xs uppercase tracking-widest text-mint">VeriSpace</p>
      <h1 className="mb-6 mt-2 text-2xl font-black text-white">{props.title}</h1>
      <CaptureForm token={props.token} rooms={rooms ?? []} events={props.events} />
      <p className="mt-8 text-xs text-ash/60">Link valid until {result.expiresAt.toLocaleString()}.</p>
    </main>
  );
}
