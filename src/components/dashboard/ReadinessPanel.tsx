import { Check } from "lucide-react";
import { Badge, Panel } from "@/components/ui/primitives";
import type { Tone } from "@/components/ui/styles";
import type { Readiness, RoomReadiness } from "@/lib/readiness";

const HEADLINE: Record<Readiness["state"], { label: string; tone: Tone }> = {
  ready: { label: "Ready to rent", tone: "mint" },
  in_progress: { label: "Turnover in progress", tone: "amber" },
  not_started: { label: "Turnover not started", tone: "neutral" },
  no_rooms: { label: "No rooms yet", tone: "neutral" },
};

function statusText(r: RoomReadiness): string {
  if (r.ready) return "Done";
  if (r.finished) return "Checklist incomplete";
  if (!r.started) return "Not started";
  return r.itemsTotal > 0 ? `${r.itemsDone} of ${r.itemsTotal} tasks` : "In progress";
}

/** Readiness for the most recent stay, worked out from the ledger entries crew recorded for it. */
export function ReadinessPanel({ readiness, stayLabel }: { readiness: Readiness; stayLabel: string }) {
  const head = HEADLINE[readiness.state];
  const done = readiness.rooms.filter((r) => r.ready).length;
  return (
    <Panel className="mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={head.tone}>{head.label}</Badge>
            {readiness.damage > 0 && (
              <Badge tone="red">
                {readiness.damage} damage {readiness.damage === 1 ? "report" : "reports"}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-mute">{stayLabel}</p>
        </div>
        <p className="text-sm tabular-nums text-ash">
          {done} of {readiness.rooms.length} {readiness.rooms.length === 1 ? "room" : "rooms"} ready
        </p>
      </div>

      {readiness.rooms.length > 0 && (
        <ul className="mt-4 divide-y divide-edge border-t border-edge">
          {readiness.rooms.map((r) => (
            <li key={r.roomId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex items-center gap-2 text-white">
                {r.ready ? <Check className="size-4 text-mint" aria-hidden="true" /> : <span className="size-4" aria-hidden="true" />}
                {r.name}
              </span>
              <span className="text-mute">{statusText(r)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
