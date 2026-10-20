import { SignJWT, jwtVerify } from "jose";

/**
 * Capability magic links for crew and guests (no accounts, no passwords).
 * A token is a signed JWT scoped to one property, optionally to specific rooms, and valid
 * only inside a time window (for guests: the reservation window).
 */

export type CapabilityRole = "crew" | "guest";

export interface CapabilityClaims {
  role: CapabilityRole;
  propertyId: string;
  reservationId?: string;
  /** If present, the token may only act on these rooms. */
  roomIds?: string[];
}

export interface CapabilityWindow {
  notBefore: Date;
  expiresAt: Date;
}

const ISSUER = "veri-space";
const MIN_SECRET_LENGTH = 32;

function key(secret: string): Uint8Array {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`CAPABILITY_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return new TextEncoder().encode(secret);
}

export async function signCapability(
  secret: string,
  claims: CapabilityClaims,
  window: CapabilityWindow,
): Promise<string> {
  if (window.expiresAt <= window.notBefore) {
    throw new Error("expiresAt must be after notBefore");
  }
  return new SignJWT({
    role: claims.role,
    propertyId: claims.propertyId,
    reservationId: claims.reservationId,
    roomIds: claims.roomIds,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setNotBefore(Math.floor(window.notBefore.getTime() / 1000))
    .setExpirationTime(Math.floor(window.expiresAt.getTime() / 1000))
    .sign(key(secret));
}

export type VerifyResult =
  | { ok: true; claims: CapabilityClaims; expiresAt: Date }
  | { ok: false; reason: "expired" | "not_yet_valid" | "invalid" };

export async function verifyCapability(
  secret: string,
  token: string,
  now: Date = new Date(),
): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      currentDate: now,
    });
    const role = payload.role;
    const propertyId = payload.propertyId;
    if ((role !== "crew" && role !== "guest") || typeof propertyId !== "string") {
      return { ok: false, reason: "invalid" };
    }
    const roomIds = Array.isArray(payload.roomIds)
      ? payload.roomIds.filter((r): r is string => typeof r === "string")
      : undefined;
    return {
      ok: true,
      claims: {
        role,
        propertyId,
        reservationId: typeof payload.reservationId === "string" ? payload.reservationId : undefined,
        roomIds,
      },
      expiresAt: new Date((payload.exp ?? 0) * 1000),
    };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ERR_JWT_EXPIRED") return { ok: false, reason: "expired" };
    if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && (err as { claim?: string }).claim === "nbf") {
      return { ok: false, reason: "not_yet_valid" };
    }
    return { ok: false, reason: "invalid" };
  }
}
