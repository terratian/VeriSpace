import CaptureApp from "@/components/capture/CaptureApp";
import { Logo } from "@/components/ui/primitives";
import { verifyCapability, type CapabilityRole } from "@/lib/capability";
import { env } from "@/lib/env";
import { storageConfigFromEnv } from "@/lib/storage";
import { serviceClient } from "@/lib/supabase/server";

const PROBLEMS = {
  expired: {
    title: "This link has expired",
    body: "Ask the property manager for a new one.",
  },
  not_yet_valid: {
    title: "This link isn't active yet",
    body: "It opens at the start of its time window. Try again then, or ask the property manager.",
  },
  invalid: {
    title: "This link isn't valid",
    body: "Check that you opened the whole link, or ask the property manager to send it again.",
  },
} as const;

function LinkProblem({ reason }: { reason: keyof typeof PROBLEMS }) {
  const { title, body } = PROBLEMS[reason];
  return (
    <main className="mx-auto max-w-[480px] px-5 py-16">
      <Logo className="text-[15px]" />
      <div role="alert" className="mt-12">
        <h1 className="text-[26px] font-semibold leading-tight">{title}</h1>
        <p className="mt-2 max-w-[40ch] text-ash">{body}</p>
      </div>
    </main>
  );
}

/** Verifies a magic link on the server, then hands the capture screens what they need. */
export default async function LinkGate({ token, role }: { token: string; role: CapabilityRole }) {
  const result = await verifyCapability(env.capabilitySecret, token);
  if (!result.ok || result.claims.role !== role) {
    return <LinkProblem reason={result.ok ? "invalid" : result.reason} />;
  }

  const { claims } = result;
  const db = serviceClient();

  let roomQuery = db.from("rooms").select("id, name").eq("property_id", claims.propertyId).order("name");
  if (claims.roomIds) roomQuery = roomQuery.in("id", claims.roomIds);

  const [roomsRes, propertyRes, stayRes] = await Promise.all([
    roomQuery,
    db.from("properties").select("name").eq("id", claims.propertyId).maybeSingle(),
    claims.reservationId
      ? db.from("reservations").select("guest_name, ends_at").eq("id", claims.reservationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (roomsRes.error) throw new Error(roomsRes.error.message);

  // The stay only adds a greeting and a default photo type, so a failed lookup isn't fatal.
  const stay = stayRes.error ? null : (stayRes.data as { guest_name: string | null; ends_at: string } | null);

  return (
    <CaptureApp
      token={token}
      role={role}
      propertyName={(propertyRes.data as { name: string } | null)?.name ?? "Your property"}
      guestName={stay?.guest_name ?? null}
      endsAt={stay?.ends_at ?? null}
      expiresAt={result.expiresAt.toISOString()}
      rooms={(roomsRes.data ?? []) as { id: string; name: string }[]}
      storageEnabled={storageConfigFromEnv() !== null}
    />
  );
}
