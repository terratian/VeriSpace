/**
 * Issues and upkeep, read from the ledger. There is no ticket table: a report is a ledger entry, a
 * resolution is a later entry that points back at it, and "open" means no resolution points at it yet.
 * That keeps the full history in the room's chain of custody.
 */

export const ISSUE_CATEGORIES = ["supply", "appliance", "safety", "damage", "other"] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  supply: "Supplies",
  appliance: "Appliance or service",
  safety: "Safety",
  damage: "Damage",
  other: "Other",
};

export const ISSUE_REPORTED = "issue_reported";
export const ISSUE_RESOLVED = "issue_resolved";
export const MAINTENANCE_DONE = "maintenance_done";
export const INSPECTION = "inspection";
/** Entries a manager can add by hand from the dashboard. */
export const MANUAL_ENTRY_TYPES = [ISSUE_REPORTED, MAINTENANCE_DONE, INSPECTION] as const;
export const MANUAL_ENTRY_LABELS: Record<(typeof MANUAL_ENTRY_TYPES)[number], string> = {
  issue_reported: "Problem to fix",
  maintenance_done: "Maintenance done",
  inspection: "Inspection note",
};

export interface LedgerEntry {
  id: number;
  seq: number;
  room_id: string;
  event_type: string;
  actor_role: string;
  created_at: string;
  payload: unknown;
  frame_sha256: string | null;
}

export interface OpenIssue {
  id: number;
  seq: number;
  roomId: string;
  /** A report from the issue flow, or a damage report from crew. */
  kind: "issue" | "damage";
  category: IssueCategory | null;
  note: string;
  featureId: string | null;
  actorRole: string;
  /** Who a crew or guest link was issued to, when the manager named them. */
  issuedTo: string | null;
  createdAt: string;
  frameSha256: string | null;
  urgent: boolean;
}

const obj = (p: unknown): Record<string, unknown> => (p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Entries must be oldest first. Returns open issues oldest first, so the longest-waiting is on top. */
export function openIssues(entries: LedgerEntry[]): OpenIssue[] {
  const resolved = new Set<number>();
  for (const e of entries) {
    if (e.event_type !== ISSUE_RESOLVED) continue;
    const id = obj(e.payload).issueId;
    if (typeof id === "number") resolved.add(id);
  }
  const out: OpenIssue[] = [];
  for (const e of entries) {
    if (e.event_type !== ISSUE_REPORTED && e.event_type !== "damage_report") continue;
    if (resolved.has(Number(e.id))) continue;
    const p = obj(e.payload);
    const category = (ISSUE_CATEGORIES as readonly unknown[]).includes(p.category) ? (p.category as IssueCategory) : null;
    const kind = e.event_type === "damage_report" ? "damage" : "issue";
    out.push({
      id: Number(e.id),
      seq: Number(e.seq),
      roomId: e.room_id,
      kind,
      category: kind === "damage" ? "damage" : category,
      note: str(p.note) ?? "No description",
      featureId: str(p.featureId),
      actorRole: e.actor_role,
      issuedTo: str(p.issuedTo),
      createdAt: e.created_at,
      frameSha256: e.frame_sha256,
      urgent: category === "safety",
    });
  }
  return out;
}

/** Who made an entry, for display: the role, and the person's name when a manager named the link. */
export function byline(actorRole: string, payload: unknown): string {
  const role = actorRole === "manager" ? "Owner" : actorRole === "crew" ? "Crew" : actorRole === "guest" ? "Guest" : actorRole;
  const name = str(obj(payload).issuedTo);
  return name ? `${role}, ${name}` : role;
}
