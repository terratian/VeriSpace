import { wrap360, type Look } from "./scan";

/** Chest height, in feet: where a phone is usually held for a scan. */
export const DEFAULT_CAMERA_FT = 4.5;

const rad = (d: number) => (d * Math.PI) / 180;

export interface Point {
  east: number;
  north: number;
}

/** A floor corner is only measurable when the phone looks clearly down at it. */
export const MIN_FLOOR_PITCH = -3;

/** Where a floor corner is, from the camera: how far out follows from how steeply the view points down. */
export function floorPoint(look: Look, cameraHeight: number): Point | null {
  if (look.pitch > MIN_FLOOR_PITCH) return null;
  const d = cameraHeight / Math.tan(rad(-look.pitch));
  return { east: d * Math.sin(rad(look.yaw)), north: d * Math.cos(rad(look.yaw)) };
}

const dist = (p: Point) => Math.hypot(p.east, p.north);
const yawGap = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

/**
 * If the ceiling height is known, a floor corner and the ceiling right above it fix the camera's own
 * height: the same wall corner is seen `a` degrees below and `b` degrees above the horizon.
 */
export function cameraHeightFromCeiling(ceilingHeight: number, floorLook: Look, ceilingLook: Look): number | null {
  if (yawGap(floorLook.yaw, ceilingLook.yaw) > 12) return null;
  if (floorLook.pitch > MIN_FLOOR_PITCH || ceilingLook.pitch < 3) return null;
  const down = Math.tan(rad(-floorLook.pitch));
  const up = Math.tan(rad(ceilingLook.pitch));
  return ceilingHeight / (1 + up / down);
}

export interface RoomEstimate {
  /** The shorter and longer sides of the room's smallest bounding rectangle. */
  width: number;
  length: number;
  area: number;
  /** Ceiling height, when a ceiling corner was marked or the ceiling height was given. */
  height: number | null;
  corners: number;
  cameraHeight: number;
}

export interface EstimateInput {
  floor: Look[];
  ceiling?: Look | null;
  cameraHeight: number;
  /** A ceiling height the owner already knows. With a ceiling corner it also corrects the camera height. */
  ceilingHeight?: number | null;
}

/** Room size from corners marked in the scan. The result is in the same unit as the camera height. */
export function estimateRoom(input: EstimateInput): RoomEstimate | null {
  let cameraHeight = input.cameraHeight;
  const usable = input.floor.filter((l) => l.pitch <= MIN_FLOOR_PITCH);
  if (input.ceiling && input.ceilingHeight) {
    const near = [...usable].sort((a, b) => yawGap(a.yaw, input.ceiling!.yaw) - yawGap(b.yaw, input.ceiling!.yaw))[0];
    const fixed = near ? cameraHeightFromCeiling(input.ceilingHeight, near, input.ceiling) : null;
    if (fixed && fixed > 0) cameraHeight = fixed;
  }
  const corners = usable
    .map((l) => ({ look: l, p: floorPoint(l, cameraHeight)! }))
    .sort((a, b) => wrap360(a.look.yaw) - wrap360(b.look.yaw));
  if (corners.length < 3) return null;
  const pts = corners.map((c) => c.p);

  // Smallest rectangle that fits the outline, trying each wall's direction.
  let best: { w: number; l: number } | null = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const th = Math.atan2(b.north - a.north, b.east - a.east);
    const c = Math.cos(th);
    const s = Math.sin(th);
    const xs = pts.map((p) => p.east * c + p.north * s);
    const ys = pts.map((p) => -p.east * s + p.north * c);
    const w = Math.max(...xs) - Math.min(...xs);
    const l = Math.max(...ys) - Math.min(...ys);
    if (!best || w * l < best.w * best.l) best = { w, l };
  }
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.east * b.north - b.east * a.north;
  }

  let height: number | null = input.ceilingHeight ?? null;
  if (input.ceiling && input.ceiling.pitch >= 3) {
    const nearest = [...corners].sort((a, b) => yawGap(a.look.yaw, input.ceiling!.yaw) - yawGap(b.look.yaw, input.ceiling!.yaw))[0];
    if (yawGap(nearest.look.yaw, input.ceiling.yaw) <= 12) height = cameraHeight + dist(nearest.p) * Math.tan(rad(input.ceiling.pitch));
  }
  const [w, l] = best ? [Math.min(best.w, best.l), Math.max(best.w, best.l)] : [0, 0];
  return { width: w, length: l, area: Math.abs(area) / 2, height, corners: corners.length, cameraHeight };
}
