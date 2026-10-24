import { z } from "zod";
import type { CapabilityClaims } from "./capability";
import { ISSUE_CATEGORIES, ISSUE_REPORTED, ISSUE_RESOLVED, MAINTENANCE_DONE, INSPECTION } from "./issues";
import { validateScanPayload } from "./scan";
import { BASELINE_EVENT, FEATURE_STATUSES, FEATURE_STATUS_EVENT } from "./model";

/** Who is making a request. Managers come from Supabase auth; crew/guests from capability links. */
export type Principal =
  | { kind: "manager"; userId: string }
  | { kind: "capability"; claims: CapabilityClaims };

/** Event payloads are small notes and measurements; anything bigger is a mistake or abuse. */
export const MAX_PAYLOAD_CHARS = 2000;

export const EVENT_TYPE = /^[a-z0-9_.-]{1,64}$/;

export const eventInputSchema = z.object({
  roomId: z.guid(),
  eventType: z.string().regex(EVENT_TYPE),
  payload: z
    .record(z.string(), z.unknown())
    .refine((p) => JSON.stringify(p).length <= MAX_PAYLOAD_CHARS, "payload is too large")
    .default({}),
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
    "issue_reported",
    "issue_resolved",
    "maintenance_done",
    "inspection",
  ],
  guest: ["guest_arrival_scan", "guest_checkout_scan", "issue_reported"],
};

export interface RoomRecord {
  id: string;
  propertyId: string;
  ownerId: string;
  /** Owner plus co-managers. When absent, only the owner may manage. */
  managerIds?: string[];
}

/** Whether this user may manage the room's property: the owner, or a co-manager the owner added. */
export function canManageRoom(room: RoomRecord, userId: string): boolean {
  return userId === room.ownerId || Boolean(room.managerIds?.includes(userId));
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
  /** Whether a feature belongs to the room. Optional so a store without features still works. */
  featureInRoom?(roomId: string, featureId: string): Promise<boolean>;
  /** Whether an issue or damage report with this ledger id exists in the room. */
  issueInRoom?(roomId: string, issueId: number): Promise<boolean>;
}

/** An error that maps to an HTTP status (auth failures, missing rows, rejected input). */
export class LedgerAuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404 | 409 | 411 | 413 | 415 | 422 | 501,
  ) {
    super(message);
  }
}

/** Answers whether a photo with this SHA-256 is already stored for the property. */
export interface PhotoIndex {
  exists(propertyId: string, sha256: string): Promise<boolean>;
}

/** Throws LedgerAuthError unless `principal` may act on anything in `room`. */
export function authorizeRoomAccess(principal: Principal, room: RoomRecord): void {
  if (principal.kind === "manager") {
    if (!canManageRoom(room, principal.userId)) {
      throw new LedgerAuthError("not a manager of this property", 403);
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
}

/** Shape checks for the model's event types, so a status entry always names a real status and feature. */
export function validateModelPayload(eventType: string, payload: Record<string, unknown>, hasFrame = true): void {
  const bad = (m: string) => {
    throw new LedgerAuthError(m, 422);
  };
  const scanProblem = validateScanPayload(eventType, payload, hasFrame);
  if (scanProblem) bad(scanProblem);
  if (eventType === FEATURE_STATUS_EVENT) {
    if (!z.guid().safeParse(payload.featureId).success) bad("feature_status needs a featureId");
    if (!(FEATURE_STATUSES as readonly unknown[]).includes(payload.status)) bad("feature_status needs a valid status");
    if (payload.note !== undefined && typeof payload.note !== "string") bad("note must be text");
  }
  if (eventType === ISSUE_REPORTED) {
    if (typeof payload.note !== "string" || !payload.note.trim()) bad("describe the problem in a note");
    if ((payload.note as string).length > 500) bad("note is too long");
    if (payload.category !== undefined && !(ISSUE_CATEGORIES as readonly unknown[]).includes(payload.category)) bad("unknown category");
  }
  if (eventType === ISSUE_RESOLVED && !(typeof payload.issueId === "number" && Number.isInteger(payload.issueId) && payload.issueId > 0)) {
    bad("issue_resolved needs the issueId it resolves");
  }
  if ((eventType === ISSUE_REPORTED || eventType === MAINTENANCE_DONE || eventType === INSPECTION) && payload.featureId !== undefined && !z.guid().safeParse(payload.featureId).success) {
    bad("featureId must be a feature id");
  }
  if (eventType === BASELINE_EVENT && payload.itemId !== undefined && !z.guid().safeParse(payload.itemId).success) {
    bad("itemId must be a feature id");
  }
}

/** Throws LedgerAuthError unless `principal` may act on `room` with this event type. */
export function authorizeEvent(principal: Principal, room: RoomRecord, eventType: string): void {
  authorizeRoomAccess(principal, room);
  if (principal.kind === "capability" && !ROLE_EVENTS[principal.claims.role].includes(eventType)) {
    throw new LedgerAuthError(`${principal.claims.role} links cannot record ${eventType}`, 403);
  }
}

/**
 * Append one event. For crew and guest links the reservation comes from the signed link, never from
 * the request, so an event can't be filed under a stay the link wasn't issued for. When `photos` is
 * given, a photo fingerprint is only accepted once that photo is actually stored.
 */
export interface AppendHooks {
  /** Called once the entry is safely in the ledger. Must not throw into the caller. */
  afterAppend?(info: { room: RoomRecord; eventType: string; payload: Record<string, unknown>; actorRole: "manager" | "crew" | "guest"; event: AppendedEvent }): void | Promise<void>;
}

export async function appendLedgerEvent(
  db: LedgerDb,
  principal: Principal,
  rawInput: unknown,
  photos?: PhotoIndex,
  hooks?: AppendHooks,
): Promise<AppendedEvent> {
  const input = eventInputSchema.parse(rawInput);
  const room = await db.getRoom(input.roomId);
  if (!room) throw new LedgerAuthError("room not found", 404);
  authorizeEvent(principal, room, input.eventType);
  validateModelPayload(input.eventType, input.payload, Boolean(input.frameSha256));
  const featureId = input.eventType === BASELINE_EVENT ? input.payload.itemId : input.payload.featureId;
  if (typeof featureId === "string" && db.featureInRoom && !(await db.featureInRoom(room.id, featureId))) {
    throw new LedgerAuthError("that feature is not in this room", 422);
  }
  if (input.eventType === ISSUE_RESOLVED && db.issueInRoom && !(await db.issueInRoom(room.id, input.payload.issueId as number))) {
    throw new LedgerAuthError("that issue is not in this room", 422);
  }

  if (input.frameSha256 && photos && !(await photos.exists(room.propertyId, input.frameSha256))) {
    throw new LedgerAuthError("photo has not been uploaded", 409);
  }

  // Who acted is stamped by the server, never taken from the request: it is part of the chain of custody.
  const payload: Record<string, unknown> = { ...input.payload };
  delete payload.actorId;
  delete payload.issuedTo;
  if (principal.kind === "capability") {
    delete payload.reservationId;
    if (principal.claims.reservationId) payload.reservationId = principal.claims.reservationId;
    if (principal.claims.label) payload.issuedTo = principal.claims.label;
  } else {
    payload.actorId = principal.userId;
  }

  const actorRole = principal.kind === "manager" ? "manager" : principal.claims.role;
  const event = await db.insertEvent({
    roomId: room.id,
    actorRole,
    eventType: input.eventType,
    payload,
    frameSha256: input.frameSha256,
    coords: input.coords,
  });
  try {
    await hooks?.afterAppend?.({ room, eventType: input.eventType, payload, actorRole, event });
  } catch (err) {
    console.error("after-append hook failed", err);
  }
  return event;
}

export async function verifyRoomChain(
  db: LedgerDb,
  principal: Principal,
  roomId: string,
): Promise<ChainStatus> {
  const room = await db.getRoom(roomId);
  if (!room) throw new LedgerAuthError("room not found", 404);
  if (principal.kind !== "manager" || !canManageRoom(room, principal.userId)) {
    throw new LedgerAuthError("only the property's managers can verify the chain", 403);
  }
  return db.verifyChain(roomId);
}
