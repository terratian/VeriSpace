/** VeriStay concierge: which stage of the stay a guest is in, and finding help for what is in the house. */

export type Stage = "checkin" | "during" | "checkout";
export const STAGES: { key: Stage; label: string }[] = [
  { key: "checkin", label: "Check in" },
  { key: "during", label: "During your stay" },
  { key: "checkout", label: "Check out" },
];

const HOUR = 3_600_000;

/** Check in until three hours after the stay starts, checkout in the last twelve hours, the stay in between. */
export function stageFor(now: Date, startsAt: Date | null, endsAt: Date | null): Stage {
  const t = now.getTime();
  if (endsAt && t > endsAt.getTime() - 12 * HOUR) return "checkout";
  if (!startsAt || t < startsAt.getTime() + 3 * HOUR) return startsAt ? "checkin" : endsAt ? "during" : "checkin";
  return "during";
}

export interface HelpAsset {
  id: string;
  name: string;
  roomId: string;
  roomName: string;
  kind: string;
}

/** Assets whose name, kind or room contains every word typed. An empty query returns all of them. */
export function searchAssets<T extends HelpAsset>(assets: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return assets;
  return assets.filter((a) => {
    const hay = `${a.name} ${a.kind.replace(/_/g, " ")} ${a.roomName}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
