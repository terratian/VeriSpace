import { z } from "zod";
import type { CapabilityClaims } from "./capability";

/** Who is making a request. Managers come from Supabase auth; crew/guests from capability links. */
export type Principal =
  | { kind: "manager"; userId: string }
  | { kind: "capability"; claims: CapabilityClaims };

export const EVENT_TYPE = /^[a-z0-9_.-]{1,64}$/;

export const eventInputSchema = z.object({
  roomId: z.guid(),
  eventType: z.string().regex(EVENT_TYPE),
  payload: z.record(z.string(), z.unknown()).default({}),
  /** SHA-256 (hex) of the unedited raw frame, computed on the device. */
  frameSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  coords: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
});
export type EventInput = z.infer<typeof eventInputSchema>;

/** Event types each non-manager role may write. Managers may write any valid type. */
export const ROLE_EVENTS: Record<"crew" | "guest", readonly string[]> = {
  crew: [
    "clean_start",
    "clean_end",
    "checklist_item",
    "photo_verified",
    "restock",
    "damage_report",
  ],
  guest: ["guest_arrival_scan", "guest_checkout_scan"],
};

export interface RoomRecord {
  id: string;
  propertyId: string;
  ownerId: string;
}

export interface LedgerRow {
  roomId: string;
  actorRole: "manager" | "crew" | "guest";
  eventType: string;
  payload: Record<string, unknown>;
  frameSha256?: string;
  coords?: { x: number; y: number; z: number };
}

export interface AppendedEvent {
  id: number;
  seq: number;
  rowHash: string;
}

export interface ChainStatus {
  ok: boolean;
  checked: number;
  firstBadId: number | null;
  reason: string | null;
}

/** Storage boundary, so authorization logic can be tested without a database. */
export interface LedgerDb {
  getRoom(roomId: string): Promise<RoomRecord | null>;
  insertEvent(row: LedgerRow): Promise<AppendedEvent>;
  verifyChain(roomId: string): Promise<ChainStatus>;
}

export class LedgerAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404,
  ) {
    super(message);
  }
}

/** Throws LedgerAuthError unless `principal` may act on `room` with this event type. */
export function authorizeEvent(principal: Principal, room: RoomRecord, eventType: string): void {
  if (principal.kind === "manager") {
    if (principal.userId !== room.ownerId) {
      throw new LedgerAuthError("not the owner of this property", 403);
    }
    return;
  }
  const { claims } = principal;
  if (claims.propertyId !== room.propertyId) {
    throw new LedgerAuthError("link is for a different property", 403);
  }
  if (claims.roomIds && !claims.roomIds.includes(room.id)) {
    throw new LedgerAuthError("link does not cover this room", 403);
  }
  if (!ROLE_EVENTS[claims.role].includes(eventType)) {
    throw new LedgerAuthError(`${claims.role} links cannot record ${eventType}`, 403);
  }
}

export async function appendLedgerEvent(
  db: LedgerDb,
  principal: Principal,
  rawInput: unknown,
): Promise<AppendedEvent> {
  const input = eventInputSchema.parse(rawInput);
  const room = await db.getRoom(input.roomId);
  if (!room) throw new LedgerAuthError("room not found", 404);
  authorizeEvent(principal, room, input.eventType);
  return db.insertEvent({
    roomId: room.id,
    actorRole: principal.kind === "manager" ? "manager" : principal.claims.role,
    eventType: input.eventType,
    payload: input.payload,
    frameSha256: input.frameSha256,
    coords: input.coords,
  });
}

export async function verifyRoomChain(
  db: LedgerDb,
  principal: Principal,
  roomId: string,
): Promise<ChainStatus> {
  const room = await db.getRoom(roomId);
  if (!room) throw new LedgerAuthError("room not found", 404);
  if (principal.kind !== "manager" || principal.userId !== room.ownerId) {
    throw new LedgerAuthError("only the property owner can verify the chain", 403);
  }
  return db.verifyChain(roomId);
}
