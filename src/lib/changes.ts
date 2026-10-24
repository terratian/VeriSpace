/** Plain-language lines for the edit log (what changed in a property's setup, by whom, when). */

export interface ChangeRow {
  id: number | string;
  table_name: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
  actor_email: string | null;
  created_at: string;
}

const KIND: Record<string, string> = {
  properties: "property details",
  rooms: "room",
  room_content: "room guide",
  room_checklist_items: "check",
  room_features: "asset",
  room_resources: "file or link",
  room_feature_pins: "asset pin",
  property_members: "manager",
};
const NAME_KEYS = ["name", "title", "label", "text", "email", "url"];
const QUIET = new Set(["updated_at", "created_at", "id"]);

export function changedFields(c: Pick<ChangeRow, "old_row" | "new_row">): string[] {
  if (!c.old_row || !c.new_row) return [];
  return Object.keys(c.new_row).filter((k) => !QUIET.has(k) && JSON.stringify(c.old_row![k]) !== JSON.stringify(c.new_row![k]));
}

export function describeChange(c: ChangeRow): string {
  const row = c.new_row ?? c.old_row ?? {};
  const key = NAME_KEYS.find((k) => typeof row[k] === "string" && row[k]);
  const name = key ? ` "${String(row[key]).slice(0, 60)}"` : "";
  const kind = KIND[c.table_name] ?? c.table_name;
  if (c.op === "INSERT") return `Added ${kind}${name}`;
  if (c.op === "DELETE") return `Removed ${kind}${name}`;
  const f = changedFields(c);
  return `Changed ${kind}${name}${f.length ? `: ${f.slice(0, 6).join(", ").replace(/_/g, " ")}` : ""}`;
}
