import { EmptyState } from "@/components/ui/primitives";
import { shortHash } from "@/lib/hash";
import { actorLabel, eventLabel } from "@/lib/labels";
import { timeAgo } from "@/lib/time";

export interface ActivityItem {
  id: number;
  seq: number;
  eventType: string;
  actorRole: string;
  createdAt: string;
  hash: string | null;
  room: string;
  property?: string;
}

const ROLE_DOT: Record<string, string> = { crew: "bg-ash", guest: "bg-sky", manager: "bg-white" };

export function ActivityList({
  items,
  showProperty = false,
  empty,
  now = new Date(),
}: {
  items: ActivityItem[];
  showProperty?: boolean;
  empty: string;
  now?: Date;
}) {
  if (items.length === 0) {
    return <EmptyState title="Nothing recorded yet">{empty}</EmptyState>;
  }
  return (
    <ul className="divide-y divide-edge overflow-hidden rounded-[14px] border border-edge bg-graphite">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 px-4 py-3">
          <span aria-hidden="true" className={`mt-2 size-2 shrink-0 rounded-full ${ROLE_DOT[item.actorRole] ?? "bg-mute"}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white">
              {eventLabel(item.eventType)}
              <span className="text-mute">
                {" "}
                in {item.room}
                {showProperty && item.property ? `, ${item.property}` : ""}
              </span>
            </p>
            <p className="text-xs text-mute">
              {actorLabel(item.actorRole)}, {timeAgo(item.createdAt, now)}
            </p>
          </div>
          <div className="shrink-0 text-right font-mono text-xs text-mute">
            <div className="tabular-nums">#{item.seq}</div>
            {item.hash && <div>{shortHash(item.hash)}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}
