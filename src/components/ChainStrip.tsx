import { Fragment } from "react";

export interface ChainEntry {
  seq: number;
  label: string;
  role: string;
}

export type ChainState = "unchecked" | "intact" | "broken";

/**
 * A room's ledger drawn as linked squares, oldest on the left.
 * Dashed grey until verified, solid mint when the chain checks out, red from the first broken entry.
 */
export function ChainStrip({
  entries,
  state = "unchecked",
  brokenSeq,
  total,
  max = 16,
}: {
  entries: ChainEntry[];
  state?: ChainState;
  brokenSeq?: number | null;
  /** True number of entries in the room, when `entries` holds only the most recent ones. */
  total?: number;
  max?: number;
}) {
  if (entries.length === 0) {
    return <p className="text-xs text-mute">No entries yet</p>;
  }
  const shown = entries.slice(-max);
  const count = Math.max(total ?? entries.length, entries.length);
  const hidden = count - shown.length;
  const summary =
    state === "intact"
      ? `${count} entries, chain verified`
      : state === "broken"
        ? `${count} entries, chain broken at entry ${brokenSeq ?? "unknown"}`
        : `${count} entries, not yet verified`;

  return (
    <div role="img" aria-label={summary} className="flex items-center">
      {hidden > 0 && <span className="mr-2 text-[11px] tabular-nums text-mute">+{hidden}</span>}
      {shown.map((entry, i) => {
        const broken = state === "broken" && brokenSeq != null && entry.seq >= brokenSeq;
        const verified = state === "intact" || (state === "broken" && !broken);
        const node = broken
          ? "border-flag bg-flag"
          : verified
            ? "border-mint bg-mint"
            : "border-mute/70 bg-transparent";
        const link = broken ? "bg-flag" : verified ? "bg-mint" : "border-t border-dashed border-mute/60";
        return (
          <Fragment key={entry.seq}>
            {i > 0 && <span aria-hidden="true" className={`h-px w-3 shrink-0 sm:w-4 ${link}`} />}
            <span
              title={`#${entry.seq} ${entry.label}`}
              className={`size-2.5 shrink-0 rounded-[3px] border ${node}`}
            />
          </Fragment>
        );
      })}
    </div>
  );
}
