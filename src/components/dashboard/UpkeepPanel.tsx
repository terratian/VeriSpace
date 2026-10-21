import { AlertTriangle, Check } from "lucide-react";
import { LogEntryForm, ResolveForm, type RoomOption } from "@/components/dashboard/UpkeepForms";
import { Badge, Panel } from "@/components/ui/primitives";
import { CATEGORY_LABELS, byline, type OpenIssue } from "@/lib/issues";
import { fmtDateTime, timeAgo } from "@/lib/time";

export interface IssueView extends OpenIssue {
  roomName: string;
  featureName: string | null;
  payload: unknown;
  photoUrl: string | null;
}

/** Open problems and a form to log upkeep. Every entry goes into the room's chain of custody. */
export function UpkeepPanel({ issues, rooms, tz, now }: { issues: IssueView[]; rooms: RoomOption[]; tz: string; now: Date }) {
  return (
    <div className="space-y-4">
      {issues.length === 0 ? (
        <Panel className="flex items-center gap-2 p-4 text-sm text-mint">
          <Check className="size-4" aria-hidden="true" />
          Nothing needs attention.
        </Panel>
      ) : (
        <ul className="divide-y divide-edge overflow-hidden rounded-[14px] border border-edge bg-graphite">
          {issues.map((i) => (
            <li key={i.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                {i.urgent && (
                  <Badge tone="red">
                    <AlertTriangle className="size-3" aria-hidden="true" />
                    Safety
                  </Badge>
                )}
                {i.category && !i.urgent && <Badge tone={i.kind === "damage" ? "red" : "amber"}>{CATEGORY_LABELS[i.category]}</Badge>}
                <span className="font-medium text-white">{i.roomName}</span>
                {i.featureName && <span className="text-mute">{i.featureName}</span>}
              </div>
              <p className="mt-1.5 text-ash">{i.note}</p>
              <p className="mt-1 text-[13px] text-mute">
                {byline(i.actorRole, i.payload)}, {fmtDateTime(i.createdAt, tz)} ({timeAgo(i.createdAt, now)}), entry {i.seq}
              </p>
              {i.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.photoUrl} alt={`Photo for entry ${i.seq}`} className="mt-2 h-24 rounded-lg border border-edge object-cover" />
              )}
              <div className="mt-3">
                <ResolveForm roomId={i.roomId} issueId={i.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {rooms.length > 0 && (
        <details>
          <summary className="inline cursor-pointer text-sm text-mute hover:text-white">Log a problem, maintenance or inspection note</summary>
          <Panel className="mt-3 p-5">
            <LogEntryForm rooms={rooms} />
          </Panel>
        </details>
      )}
    </div>
  );
}
