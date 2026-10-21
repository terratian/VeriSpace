import { signCapability, type CapabilityRole, type CapabilityWindow } from "./capability";

/** Guests may open their link a little before check-in and after checkout (late departure scans). */
export const GUEST_EARLY_MS = 2 * 3600_000;
export const GUEST_GRACE_MS = 2 * 3600_000;
/** Crew links open an hour before checkout so cleaners can arrive early. */
export const CREW_LEAD_MS = 1 * 3600_000;
export const DEFAULT_CREW_HOURS = 12;

export interface Stay {
  id: string;
  propertyId: string;
  startsAt: Date;
  endsAt: Date;
}

export function linkWindow(role: CapabilityRole, stay: Stay, crewHours = DEFAULT_CREW_HOURS): CapabilityWindow {
  if (role === "guest") {
    return {
      notBefore: new Date(stay.startsAt.getTime() - GUEST_EARLY_MS),
      expiresAt: new Date(stay.endsAt.getTime() + GUEST_GRACE_MS),
    };
  }
  return {
    notBefore: new Date(stay.endsAt.getTime() - CREW_LEAD_MS),
    expiresAt: new Date(stay.endsAt.getTime() + crewHours * 3600_000),
  };
}

export interface IssuedLink {
  url: string;
  role: CapabilityRole;
  notBefore: Date;
  expiresAt: Date;
}

export async function issueLink(args: {
  secret: string;
  origin: string;
  role: CapabilityRole;
  stay: Stay;
  crewHours?: number;
  /** Who the link is for, such as "Maria, Sparkle Cleaning". Recorded on every entry made with it. */
  label?: string;
}): Promise<IssuedLink> {
  const window = linkWindow(args.role, args.stay, args.crewHours);
  const token = await signCapability(
    args.secret,
    { role: args.role, propertyId: args.stay.propertyId, reservationId: args.stay.id, label: args.label?.trim() || undefined },
    window,
  );
  return { url: `${args.origin}/${args.role}/${token}`, role: args.role, ...window };
}
