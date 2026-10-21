import { z } from "zod";

/** The property model: room geometry, the features in each room, and each feature's status from the ledger. */

export const FEATURE_KINDS = [
  "hot_tub",
  "pool",
  "fireplace",
  "smart_lock",
  "thermostat",
  "wifi",
  "noise_sensor",
  "tv",
  "kitchen_appliance",
  "laundry",
  "workspace",
  "bed",
  "coffee_bar",
  "grill",
  "ev_charger",
  "parking",
  "other",
] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

export const FEATURE_LABELS: Record<FeatureKind, string> = {
  hot_tub: "Hot tub",
  pool: "Pool",
  fireplace: "Fireplace",
  smart_lock: "Smart lock",
  thermostat: "Thermostat",
  wifi: "Wi-Fi",
  noise_sensor: "Noise sensor",
  tv: "TV",
  kitchen_appliance: "Kitchen appliance",
  laundry: "Laundry",
  workspace: "Workspace",
  bed: "Bed",
  coffee_bar: "Coffee bar",
  grill: "Grill",
  ev_charger: "EV charger",
  parking: "Parking",
  other: "Other",
};

export const FEATURE_STATUSES = ["working", "degraded", "out_of_service"] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export const STATUS_LABELS: Record<FeatureStatus, string> = {
  working: "Working",
  degraded: "Needs attention",
  out_of_service: "Out of service",
};

/** Ledger event types the model writes. Both are manager-only. */
export const FEATURE_STATUS_EVENT = "feature_status";
export const BASELINE_EVENT = "baseline_photo";

export const FT = 0.3048;
export const toFeet = (m: number | null): number | null => (m === null ? null : Math.round((m / FT) * 10) / 10);

export interface Feature {
  id: string;
  roomId: string;
  kind: FeatureKind;
  name: string;
  /** Position in the room as a fraction (0 to 1) of its width and length. */
  x: number;
  y: number;
  advertised: boolean;
  details: string;
}

export function toFeature(row: {
  id: string;
  room_id: string;
  kind: string;
  name: string;
  pos_x: number | string;
  pos_y: number | string;
  advertised: boolean | null;
  details: string | null;
}): Feature {
  const kind = (FEATURE_KINDS as readonly string[]).includes(row.kind) ? (row.kind as FeatureKind) : "other";
  return {
    id: row.id,
    roomId: row.room_id,
    kind,
    name: row.name,
    x: Number(row.pos_x),
    y: Number(row.pos_y),
    advertised: row.advertised !== false,
    details: row.details ?? "",
  };
}

/** Empty form fields mean "not set". */
const optionalNumber = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().min(min).max(max).nullable());

/** Room size and position as typed in feet; the action converts to meters. */
export const layoutSchema = z.object({
  roomId: z.guid(),
  width: optionalNumber(1, 250),
  length: optionalNumber(1, 250),
  height: optionalNumber(5, 40),
  floor: z.preprocess((v) => (v === "" || v === null || v === undefined ? 0 : Number(v)), z.number().int("Floor must be a whole number.").min(-3).max(30)),
  planX: optionalNumber(-3000, 3000),
  planY: optionalNumber(-3000, 3000),
});

export const featureSchema = z.object({
  roomId: z.guid(),
  kind: z.enum(FEATURE_KINDS),
  name: z.string().trim().min(1, "Give the feature a name.").max(80, "Keep the name under 80 characters."),
  x: z.coerce.number().min(0).max(1),
  y: z.coerce.number().min(0).max(1),
  advertised: z.boolean(),
  details: z.string().trim().max(500, "Keep details under 500 characters."),
});

export const statusSchema = z.object({
  featureId: z.guid(),
  status: z.enum(FEATURE_STATUSES),
  note: z.string().trim().max(300, "Keep the note under 300 characters."),
});

export interface StatusEvent {
  event_type: string;
  payload: unknown;
}
export interface FeatureState {
  status: FeatureStatus;
  note: string;
}

/** Each feature's current state: its latest feature_status entry. `events` must be oldest first. */
export function featureStatuses(events: StatusEvent[]): Map<string, FeatureState> {
  const out = new Map<string, FeatureState>();
  for (const e of events) {
    if (e.event_type !== FEATURE_STATUS_EVENT || !e.payload || typeof e.payload !== "object") continue;
    const p = e.payload as { featureId?: unknown; status?: unknown; note?: unknown };
    if (typeof p.featureId !== "string") continue;
    if (!(FEATURE_STATUSES as readonly unknown[]).includes(p.status)) continue;
    out.set(p.featureId, { status: p.status as FeatureStatus, note: typeof p.note === "string" ? p.note : "" });
  }
  return out;
}

export const stateOf = (statuses: Map<string, FeatureState>, featureId: string): FeatureState =>
  statuses.get(featureId) ?? { status: "working", note: "" };

export interface LayoutRoom {
  id: string;
  name: string;
  width: number | null;
  length: number | null;
  height: number | null;
  floor: number;
  planX: number | null;
  planY: number | null;
}
export interface PlacedRoom {
  id: string;
  name: string;
  /** Meters. */
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  floor: number;
}

export const DEFAULT_ROOM = { w: 4, d: 4, h: 2.7 } as const;

/**
 * Rooms with a saved position stay where they are. The rest are packed left to right in rows, floor by
 * floor, so a property with no layout still draws as something sensible.
 */
export function placeRooms(rooms: LayoutRoom[]): PlacedRoom[] {
  const GAP = 0.4;
  const ROW_WIDTH = 14;
  const cursors = new Map<number, { x: number; y: number; rowD: number }>();
  return rooms.map((r) => {
    const w = r.width ?? DEFAULT_ROOM.w;
    const d = r.length ?? DEFAULT_ROOM.d;
    const h = r.height ?? DEFAULT_ROOM.h;
    if (r.planX !== null && r.planY !== null) return { id: r.id, name: r.name, x: r.planX, y: r.planY, w, d, h, floor: r.floor };
    const c = cursors.get(r.floor) ?? { x: 0, y: 0, rowD: 0 };
    if (c.x > 0 && c.x + w > ROW_WIDTH) {
      c.x = 0;
      c.y += c.rowD + GAP;
      c.rowD = 0;
    }
    const placed = { id: r.id, name: r.name, x: c.x, y: c.y, w, d, h, floor: r.floor };
    c.x += w + GAP;
    c.rowD = Math.max(c.rowD, d);
    cursors.set(r.floor, c);
    return placed;
  });
}

export interface ListingFeature {
  id: string;
  name: string;
  kind: FeatureKind;
  room: string;
  advertised: boolean;
}

/** The listing as it stands today: what's advertised, split by whether guests can use it right now. */
export function listingSummary(features: ListingFeature[], statuses: Map<string, FeatureState>) {
  const available: { feature: ListingFeature; note: string }[] = [];
  const limited: { feature: ListingFeature; note: string }[] = [];
  const unavailable: { feature: ListingFeature; note: string }[] = [];
  for (const f of features) {
    if (!f.advertised) continue;
    const s = stateOf(statuses, f.id);
    (s.status === "working" ? available : s.status === "degraded" ? limited : unavailable).push({ feature: f, note: s.note });
  }
  return { available, limited, unavailable };
}
