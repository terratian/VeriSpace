/** Pure logic for the crew and guest capture screens. */

export interface Shot {
  blob: Blob;
  /** SHA-256 (hex) of exactly the bytes in `blob`. */
  sha256: string;
  width: number | null;
  height: number | null;
  /** Object URL for previews. The owner must revoke it. */
  url: string;
  /** "camera" = grabbed from the live preview; "file" = handed over by the phone's camera app. */
  source: "camera" | "file";
}

export const MAX_EDGE = 2048;
export const JPEG_QUALITY = 0.9;
/** Largest photo the server accepts. Kept under common 4.5 MB request limits. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

/** Shrink to fit `maxEdge` on the long side, keeping the aspect ratio. Never enlarges. */
export function scaleToFit(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const k = maxEdge / longest;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface RoomProgress {
  started: boolean;
  finished: boolean;
  photos: number;
  damage: number;
}
export type ProgressMap = Record<string, RoomProgress>;
export const EMPTY_PROGRESS: RoomProgress = { started: false, finished: false, photos: 0, damage: 0 };

export type CaptureAction = "start" | "photo" | "damage" | "finish";

/** Crew progress is per room; guest progress is per room and per mode (arrival or departure). */
export function progressKey(role: "crew" | "guest" | "manager", roomId: string, mode?: "arrival" | "departure"): string {
  return role === "guest" ? `${roomId}:${mode ?? "arrival"}` : roomId;
}

export function applyAction(map: ProgressMap, key: string, action: CaptureAction): ProgressMap {
  const current = map[key] ?? EMPTY_PROGRESS;
  const next: RoomProgress = { ...current };
  if (action === "start") next.started = true;
  if (action === "photo") next.photos += 1;
  if (action === "damage") next.damage += 1;
  if (action === "finish") next.finished = true;
  return { ...map, [key]: next };
}

/** A room can be finished once it has been started, has a photo, has every task recorded, and isn't already finished. */
export function canFinish(p: RoomProgress, tasksLeft = 0): boolean {
  return p.started && p.photos > 0 && !p.finished && tasksLeft === 0;
}

export function crewStatus(p: RoomProgress, tasks?: { done: number; total: number }): { label: string; tone: "neutral" | "amber" | "mint" } {
  if (p.finished) return { label: "Done", tone: "mint" };
  if (p.started || p.photos > 0 || (tasks && tasks.done > 0)) {
    return { label: tasks && tasks.total > 0 ? `${tasks.done} of ${tasks.total} tasks` : "In progress", tone: "amber" };
  }
  return { label: "Not started", tone: "neutral" };
}

export function guestStatus(p: RoomProgress): { label: string; tone: "neutral" | "mint" } {
  return p.photos > 0
    ? { label: `${p.photos} ${p.photos === 1 ? "photo" : "photos"}`, tone: "mint" }
    : { label: "No photos yet", tone: "neutral" };
}

/** Read saved progress defensively: anything malformed is dropped rather than trusted. */
export function parseProgress(raw: string | null): ProgressMap {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: ProgressMap = {};
    for (const [key, value] of Object.entries(data)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      const count = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 10_000 ? n : 0);
      out[key] = { started: v.started === true, finished: v.finished === true, photos: count(v.photos), damage: count(v.damage) };
    }
    return out;
  } catch {
    return {};
  }
}

export interface Intent {
  eventType: string;
  title: string;
  noteLabel: string;
  noteRequired: boolean;
  saveLabel: string;
}

/** The camera and review screens for a task that needs a photo, titled with the task. */
export function taskIntent(label: string, eventType = "checklist_item", saveLabel = "Record task"): Intent {
  return {
    eventType,
    title: label.length > 60 ? `${label.slice(0, 57)}...` : label,
    noteLabel: "Note (optional)",
    noteRequired: false,
    saveLabel,
  };
}

/** Where a manager's baseline walk stands in a room: features photographed, or room photos taken. */
export function baselineStatus(p: RoomProgress, features?: { done: number; total: number }): { label: string; tone: "neutral" | "amber" | "mint" } {
  if (features && features.total > 0) {
    const label = `${features.done} of ${features.total} features`;
    if (features.done === features.total && p.photos > 0) return { label: "Baselined", tone: "mint" };
    return { label, tone: features.done > 0 || p.photos > 0 ? "amber" : "neutral" };
  }
  return p.photos > 0 ? { label: "Baselined", tone: "mint" } : { label: "No photos yet", tone: "neutral" };
}

export const INTENTS = {
  baselineRoom: { eventType: "baseline_photo", title: "Baseline photo", noteLabel: "What does this show? (optional)", noteRequired: false, saveLabel: "Record baseline" },
  crewPhoto: { eventType: "photo_verified", title: "Verification photo", noteLabel: "Note (optional)", noteRequired: false, saveLabel: "Record photo" },
  crewDamage: { eventType: "damage_report", title: "Report damage", noteLabel: "What is damaged?", noteRequired: true, saveLabel: "Record damage" },
  guestArrival: {
    eventType: "guest_arrival_scan",
    title: "Arrival photo",
    noteLabel: "Note (optional), for example a mark that was already there",
    noteRequired: false,
    saveLabel: "Record photo",
  },
  guestDeparture: {
    eventType: "guest_checkout_scan",
    title: "Departure photo",
    noteLabel: "Note (optional)",
    noteRequired: false,
    saveLabel: "Record photo",
  },
} satisfies Record<string, Intent>;
