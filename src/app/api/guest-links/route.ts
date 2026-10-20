import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { signCapability } from "@/lib/capability";
import { env } from "@/lib/env";
import { errorResponse, readJson } from "@/lib/http";
import { LedgerAuthError } from "@/lib/ledger";
import { serviceClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  reservationId: z.guid(),
  role: z.enum(["guest", "crew"]).default("guest"),
  /** Crew links have no reservation window; this is how many hours they stay valid. */
  crewHours: z.number().int().min(1).max(72).default(12),
});

/**
 * Create a magic link for a reservation (guest) or a turnover (crew). Owning manager only.
 * Delivery (SMS/email) is not wired yet: the link is returned to the manager.
 */
export async function POST(request: Request) {
  try {
    const principal = await authenticate(request);
    if (!principal) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (principal.kind !== "manager") throw new LedgerAuthError("managers only", 403);

    const body = bodySchema.parse(await readJson(request));
    const { data, error } = await serviceClient()
      .from("reservations")
      .select("id, property_id, starts_at, ends_at, properties(owner_id)")
      .eq("id", body.reservationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const owner = (data?.properties as unknown as { owner_id: string } | null)?.owner_id;
    if (!data || owner !== principal.userId) throw new LedgerAuthError("reservation not found", 404);

    const starts = new Date(data.starts_at);
    const ends = new Date(data.ends_at);
    const window =
      body.role === "guest"
        ? { notBefore: starts, expiresAt: ends }
        : { notBefore: new Date(ends.getTime() - 60 * 60 * 1000), expiresAt: new Date(ends.getTime() + body.crewHours * 3600 * 1000) };

    const token = await signCapability(
      env.capabilitySecret,
      { role: body.role, propertyId: data.property_id, reservationId: data.id },
      window,
    );
    return Response.json(
      { url: `${env.appOrigin}/${body.role}/${token}`, notBefore: window.notBefore, expiresAt: window.expiresAt },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
