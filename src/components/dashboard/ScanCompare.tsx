"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { button } from "@/components/ui/styles";
import { GRID } from "@/lib/imgdiff";

interface Result {
  index: number;
  yaw: number;
  pitch: number;
  changed: boolean;
  share: number;
  cells: { x: number; y: number }[];
  beforeUrl: string | null;
  nowUrl: string | null;
}
interface Report {
  current: { at: string };
  previous: { at: string };
  compared: number;
  unpaired: number;
  results: Result[];
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Compare this room's newest scan with the one before, direction by direction. */
export function ScanCompare({ roomId }: { roomId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);

  async function run() {
    setState("busy");
    setError("");
    try {
      const res = await fetch(`/api/scan-compare?room=${roomId}`);
      const body = (await res.json()) as Report & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't compare the scans.");
      setReport(body);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't compare the scans.");
      setState("error");
    }
  }

  const changed = report?.results.filter((r) => r.changed) ?? [];
  return (
    <div className="mt-8">
      <h3 className="text-base font-semibold">Before and after</h3>
      <p className="mb-3 mt-1 max-w-[62ch] text-[13px] text-mute">Compares the newest scan with the one before it, direction by direction, and points out places that look different. It can&apos;t tell damage from moved furniture or different light, so treat it as a list of places to look.</p>
      <button type="button" onClick={run} disabled={state === "busy"} className={button("secondary", "sm")}>
        {state === "busy" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {state === "busy" ? "Comparing…" : report ? "Compare again" : "Compare with the earlier scan"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-flag">
          {error}
        </p>
      )}
      {report && (
        <div className="mt-4">
          <p className="text-sm text-ash" data-testid="compare-summary">
            {changed.length === 0 ? "Nothing stands out" : `${changed.length} of ${report.compared} directions look different`} · {when(report.previous.at)} against {when(report.current.at)}
            {report.unpaired > 0 ? ` · ${report.unpaired} photos had no match facing the same way` : ""}
          </p>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {changed.map((r) => (
              <li key={r.index} className="rounded-lg border border-edge p-3">
                <p className="mb-2 text-[13px] text-mute">
                  Facing {Math.round(r.yaw)}°, {r.pitch > 20 ? "up" : r.pitch < -20 ? "down" : "level"} · {Math.round(r.share * 100)}% differs
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {([["Before", r.beforeUrl], ["Now", r.nowUrl]] as const).map(([label, url]) => (
                    <figure key={label} className="relative m-0 overflow-hidden rounded bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {url && <img src={url} alt={`${label}, facing ${Math.round(r.yaw)} degrees`} className="aspect-[4/3] w-full object-cover" />}
                      {label === "Now" &&
                        r.cells.map((c) => (
                          <span key={`${c.x}-${c.y}`} aria-hidden="true" className="absolute border border-amber/80 bg-amber/25" style={{ left: `${(c.x / GRID) * 100}%`, top: `${(c.y / GRID) * 100}%`, width: `${100 / GRID}%`, height: `${100 / GRID}%` }} />
                        ))}
                      <figcaption className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[11px]">{label}</figcaption>
                    </figure>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
