import { z } from "zod";

/**
 * Guided room scan: the phone sweeps the room and takes a photo at each target direction. Every frame
 * is its own ledger entry (so each carries its photo's fingerprint) and one closing entry ties the
 * set together with the location and time.
 */
export const SCAN_FRAME_EVENT = "scan_frame";
export const SCAN_COMPLETE_EVENT = "scan_complete";

export const MAX_SCAN_FRAMES = 40;

export interface Look {
  /** Degrees clockwise from north (or from where the sweep began when the compass isn't available). */
  yaw: number;
  /** Degrees above the horizon, negative below. */
  pitch: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Wrap to 0 up to but not including 360. */
export const wrap360 = (d: number) => ((d % 360) + 360) % 360;

/** Signed shortest turn from a to b, in degrees. */
export function angleDiff(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/**
 * Where the back camera points, from the device orientation angles (W3C: rotate about z by alpha,
 * then x by beta, then y by gamma). A phone held upright facing north is alpha 0, beta 90, gamma 0.
 */
export function lookDirection(alpha: number, beta: number, gamma: number): Look {
  const a = rad(alpha);
  const b = rad(beta);
  const g = rad(gamma);
  // Start from the camera axis (0, 0, -1), then apply Ry(gamma), Rx(beta), Rz(alpha).
  const y1 = [-Math.sin(g), 0, -Math.cos(g)];
  const x1 = [y1[0], y1[1] * Math.cos(b) - y1[2] * Math.sin(b), y1[1] * Math.sin(b) + y1[2] * Math.cos(b)];
  const east = x1[0] * Math.cos(a) - x1[1] * Math.sin(a);
  const north = x1[0] * Math.sin(a) + x1[1] * Math.cos(a);
  const up = x1[2];
  return { yaw: wrap360(deg(Math.atan2(east, north))), pitch: deg(Math.asin(Math.max(-1, Math.min(1, up)))) };
}

/** Rings of shots around the room: the horizon, then up and down to catch ceiling and floor. */
export function scanTargets(opts: { horizon?: number; up?: number; down?: number } = {}): Look[] {
  const { horizon = 12, up = 6, down = 6 } = opts;
  const ring = (count: number, pitch: number): Look[] =>
    Array.from({ length: count }, (_, i) => ({ yaw: (360 / count) * i, pitch }));
  return [...ring(horizon, 0), ...ring(up, 55), ...ring(down, -55)];
}

/** Degrees between two looks, treating yaw and pitch as a direction on a sphere. */
export function lookDistance(a: Look, b: Look): number {
  const v = (l: Look) => [Math.sin(rad(l.yaw)) * Math.cos(rad(l.pitch)), Math.sin(rad(l.pitch)), -Math.cos(rad(l.yaw)) * Math.cos(rad(l.pitch))];
  const [p, q] = [v(a), v(b)];
  const dot = Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]));
  return deg(Math.acos(dot));
}

/** Index of the nearest target not yet captured, if the camera is within `tolerance` degrees of it. */
export function matchTarget(look: Look, targets: Look[], done: ReadonlySet<number>, tolerance = 8): number | null {
  let best: number | null = null;
  let bestDist = tolerance;
  targets.forEach((t, i) => {
    if (done.has(i)) return;
    const d = lookDistance(look, t);
    if (d <= bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/** The unit direction of a look in viewer space: x east, y up, and north is -z (the default camera heading). */
export function lookVector(look: Look): [number, number, number] {
  const y = rad(look.yaw);
  const p = rad(look.pitch);
  return [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
export const roundLook = (l: Look): Look => ({ yaw: round1(wrap360(l.yaw)), pitch: round1(l.pitch) });

export const scanFrameSchema = z.object({
  scanId: z.guid(),
  index: z.number().int().min(0).max(MAX_SCAN_FRAMES - 1),
  yaw: z.number().min(0).max(360),
  pitch: z.number().min(-90).max(90),
  roll: z.number().min(-180).max(180).optional(),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional(),
});

export const scanCompleteSchema = z.object({
  scanId: z.guid(),
  frames: z.number().int().min(1).max(MAX_SCAN_FRAMES),
  /** "sensor": frames placed by the phone's orientation sensors. "manual": placed in order, no sensors. */
  mode: z.enum(["sensor", "manual"]),
  /** True when the yaw is a real compass bearing rather than relative to where the sweep began. */
  compass: z.boolean().optional(),
  startedAt: z.iso.datetime().optional(),
  endedAt: z.iso.datetime().optional(),
  geo: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100000).optional() })
    .optional(),
});

/** Throws a message for a scan entry that doesn't describe a scan. */
export function validateScanPayload(eventType: string, payload: Record<string, unknown>, hasFrame: boolean): string | null {
  if (eventType === SCAN_FRAME_EVENT) {
    if (!hasFrame) return "a scan frame needs its photo";
    return scanFrameSchema.safeParse(payload).success ? null : "that scan frame is not valid";
  }
  if (eventType === SCAN_COMPLETE_EVENT) {
    return scanCompleteSchema.safeParse(payload).success ? null : "that scan summary is not valid";
  }
  return null;
}

export interface ScanFrame {
  index: number;
  yaw: number;
  pitch: number;
  roll: number;
  width: number | null;
  height: number | null;
  sha256: string;
}

export interface ScanSet {
  scanId: string;
  frames: ScanFrame[];
  complete: boolean;
  at: string;
  mode: "sensor" | "manual" | null;
  geo: { lat: number; lng: number; accuracy?: number } | null;
}

interface ScanEvent {
  event_type: string;
  payload: unknown;
  frame_sha256: string | null;
  created_at: string;
}

/** The most recent scan in a room: its frames (one per direction) and whether it was finished. */
export function latestScan(events: ScanEvent[]): ScanSet | null {
  const sets = new Map<string, ScanSet>();
  const order: string[] = [];
  for (const e of events) {
    if (e.event_type !== SCAN_FRAME_EVENT && e.event_type !== SCAN_COMPLETE_EVENT) continue;
    const parsed = (e.event_type === SCAN_FRAME_EVENT ? scanFrameSchema : scanCompleteSchema).safeParse(e.payload);
    if (!parsed.success) continue;
    const p = parsed.data as z.infer<typeof scanFrameSchema> & z.infer<typeof scanCompleteSchema>;
    let set = sets.get(p.scanId);
    if (!set) {
      set = { scanId: p.scanId, frames: [], complete: false, at: e.created_at, mode: null, geo: null };
      sets.set(p.scanId, set);
      order.push(p.scanId);
    }
    set.at = e.created_at;
    if (e.event_type === SCAN_FRAME_EVENT && e.frame_sha256) {
      set.frames = set.frames.filter((f) => f.index !== p.index);
      set.frames.push({ index: p.index, yaw: p.yaw, pitch: p.pitch, roll: p.roll ?? 0, width: p.width ?? null, height: p.height ?? null, sha256: e.frame_sha256 });
    } else if (e.event_type === SCAN_COMPLETE_EVENT) {
      set.complete = true;
      set.mode = p.mode;
      set.geo = p.geo ?? null;
    }
  }
  // Prefer the newest finished scan; otherwise the newest partial one.
  const all = order.map((id) => sets.get(id)!);
  const finished = all.filter((s) => s.complete);
  const pick = (finished.length ? finished : all).at(-1);
  return pick ? { ...pick, frames: [...pick.frames].sort((a, b) => a.index - b.index) } : null;
}

/**
 * The direction in the room under a point on the screen. `dx` and `dy` are pixels from the middle of
 * the view (right and down are positive), `perspective` is the viewer's focal distance in pixels, and
 * `view` is where the view is pointing.
 */
export function screenToLook(dx: number, dy: number, perspective: number, view: Look): Look {
  const c = [dx, -dy, -perspective];
  const p = rad(view.pitch);
  // Tilt by the view's pitch about the x axis, then turn by its yaw about the vertical axis.
  const tilted = [c[0], c[1] * Math.cos(p) - c[2] * Math.sin(p), c[1] * Math.sin(p) + c[2] * Math.cos(p)];
  const yw = rad(view.yaw);
  const x = tilted[0] * Math.cos(yw) - tilted[2] * Math.sin(yw);
  const z = tilted[0] * Math.sin(yw) + tilted[2] * Math.cos(yw);
  const y = tilted[1];
  const len = Math.hypot(x, y, z);
  return { yaw: wrap360(deg(Math.atan2(x, -z))), pitch: deg(Math.asin(y / len)) };
}

export const pinSchema = z.object({
  featureId: z.guid(),
  scanId: z.guid(),
  yaw: z.number().min(0).max(360),
  pitch: z.number().min(-90).max(90),
});

export interface Pin {
  id: string;
  featureId: string;
  label: string;
  yaw: number;
  pitch: number;
  /** Shown on the pin: the asset's current state. */
  status?: "working" | "degraded" | "out_of_service";
}
