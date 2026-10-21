"use client";

import { Camera, Check, Loader2 } from "lucide-react";
import type { ChecklistItem } from "@/lib/guide";

/**
 * A room's tasks for the crew. Ticking one records it to the ledger, so a recorded task stays
 * recorded: the ledger can't be edited, and neither can the tick.
 */
export function Checklist({
  items,
  done,
  busyId,
  onTick,
  title = "Tasks",
}: {
  items: ChecklistItem[];
  done: ReadonlySet<string>;
  busyId: string | null;
  onTick: (item: ChecklistItem) => void;
  title?: string;
}) {
  if (items.length === 0) return null;
  const recorded = items.filter((i) => done.has(i.id)).length;

  return (
    <section aria-label="Room tasks" className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p className="text-[13px] text-mute">
          {recorded === items.length ? "All recorded" : `${recorded} of ${items.length} recorded`}
        </p>
      </div>
      <ul className="border-t border-edge">
        {items.map((item) => {
          const isDone = done.has(item.id);
          const isBusy = busyId === item.id;
          return (
            <li key={item.id} className="border-b border-edge">
              <button
                type="button"
                onClick={() => onTick(item)}
                disabled={isDone || isBusy}
                className="flex min-h-14 w-full items-center gap-3 py-3 text-left disabled:cursor-default"
              >
                <span
                  aria-hidden="true"
                  className={`grid size-7 shrink-0 place-items-center rounded-md border ${
                    isDone ? "border-mint bg-mint text-obsidian" : "border-edge text-transparent"
                  }`}
                >
                  {isBusy ? <Loader2 className="size-4 animate-spin text-mute" /> : <Check className="size-4" />}
                </span>
                <span className={`flex-1 text-[16px] ${isDone ? "text-mute" : "text-white"}`}>{item.label}</span>
                {isDone && <span className="sr-only">Recorded</span>}
                {item.requiresPhoto && !isDone && (
                  <span className="flex shrink-0 items-center gap-1 text-[13px] text-mute">
                    <Camera className="size-4" aria-hidden="true" />
                    Photo
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
