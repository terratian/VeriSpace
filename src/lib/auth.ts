import { verifyCapability } from "./capability";
import { env } from "./env";
import type { Principal } from "./ledger";
import { serviceClient } from "./supabase/server";

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * Resolve the caller. A crew/guest capability token is tried first; otherwise the bearer
 * token is treated as a Supabase session JWT (property manager, signed in with OAuth).
 */
export async function authenticate(request: Request): Promise<Principal | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const capability = await verifyCapability(env.capabilitySecret, token);
  if (capability.ok) return { kind: "capability", claims: capability.claims };

  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data.user) return null;
  return { kind: "manager", userId: data.user.id };
}
