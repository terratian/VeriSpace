export const EVENT_LABELS: Record<string, string> = {
  clean_start: "Started cleaning",
  clean_end: "Finished cleaning",
  checklist_item: "Checked an item",
  photo_verified: "Verified photo",
  restock: "Restocked",
  damage_report: "Reported damage",
  guest_arrival_scan: "Arrival photo",
  guest_checkout_scan: "Departure photo",
  inspection: "Inspection",
  baseline_photo: "Baseline photo",
  feature_status: "Feature status changed",
  issue_reported: "Reported a problem",
  issue_resolved: "Resolved a problem",
  maintenance_done: "Maintenance done",
  tutorial_sent: "Tutorial sent",
};

export const ACTOR_LABELS = { manager: "Manager", crew: "Crew", guest: "Guest" } as const;

export function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replace(/[_.-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function actorLabel(role: string): string {
  return ACTOR_LABELS[role as keyof typeof ACTOR_LABELS] ?? role;
}
