import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { env } from "@/lib/env";
import { errorResponse, readJson } from "@/lib/http";
import { LedgerAuthError } from "@/lib/ledger";
import { DEFAULT_CREW_HOURS, issueLink } from "@/lib/links";
import { requestOrigin } from "@/lib/origin";
import { serviceClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  reservationId: z.guid(),
  role: z.enum(["guest", "crew"]).default("guest"),
  /** How many hours a crew link stays valid after checkout. */
  crewHours: z.number().int().min(1).max(72).default(DEFAULT_CREW_HOURS),
});

/**
 * Create a magic link for a stay (guest) or its turnover (crew). Owning manager only.
 * The dashboard creates links through a server action; this endpoint is for scripts and integrations.
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

    const link = await issueLink({
      secret: env.capabilitySecret,
      origin: requestOrigin(request.headers),
      role: body.role,
      crewHours: body.crewHours,
      stay: { id: data.id, propertyId: data.property_id, startsAt: new Date(data.starts_at), endsAt: new Date(data.ends_at) },
    });
    return Response.json({ url: link.url, notBefore: link.notBefore, expiresAt: link.expiresAt }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
