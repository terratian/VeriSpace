"use client";

import { Crosshair, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { removePin, savePin } from "@/app/dashboard/pin-actions";
import { button } from "@/components/ui/styles";
import type { Look, Pin } from "@/lib/scan";
import { ScanViewerLoader } from "./ScanViewerLoader";
import type { ViewerFrame } from "./ScanViewer";

export interface StudioAsset {
  id: string;
  name: string;
  status: "working" | "degraded" | "out_of_service";
}

/** The owner's view of a scan: look around, and pin each asset where it sits in the room. */
export default function ScanStudio({ scanId, frames, assets, pins: initial }: { scanId: string; frames: ViewerFrame[]; assets: StudioAsset[]; pins: Pin[] }) {
  const [pins, setPins] = useState<Pin[]>(initial);
  const [placing, setPlacing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, start] = useTransition();
  const byAsset = new Map(pins.map((p) => [p.featureId, p]));
  const placingAsset = assets.find((a) => a.id === placing);

  function place(look: Look) {
    const asset = placingAsset;
    if (!asset) return;
    const yaw = Math.round(look.yaw * 10) / 10;
    const pitch = Math.round(look.pitch * 10) / 10;
    setPins((all) => [...all.filter((p) => p.featureId !== asset.id), { id: `pin-${asset.id}`, featureId: asset.id, label: asset.name, yaw, pitch, status: asset.status }]);
    setPlacing(null);
    setError("");
    start(async () => {
      const res = await savePin({ featureId: asset.id, scanId, yaw, pitch });
      if (res && !res.ok) {
        setError(res.error ?? "The pin couldn't be saved.");
        setPins((all) => all.filter((p) => p.featureId !== asset.id));
      }
    });
  }

  function remove(assetId: string) {
    const before = pins;
    setPins((all) => all.filter((p) => p.featureId !== assetId));
    start(async () => {
      const res = await removePin({ featureId: assetId, scanId });
      if (res && !res.ok) {
        setError(res.error ?? "The pin couldn't be removed.");
        setPins(before);
      }
    });
  }

  return (
    <div>
      <ScanViewerLoader frames={frames} pins={pins} placingLabel={placingAsset?.name ?? null} onPlace={place} />
      <div className="mt-5">
        <h3 className="text-[15px] font-semibold">Pin assets in this room</h3>
        {assets.length === 0 ? (
          <p className="mt-2 text-sm text-mute">Add assets to this room in Setup, then pin them here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-edge border-y border-edge">
            {assets.map((a) => {
              const pinned = byAsset.has(a.id);
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-white">
                    {a.name}
                    <span className="ml-2 text-[13px] text-mute">{pinned ? "Pinned" : "Not pinned"}</span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => setPlacing(placing === a.id ? null : a.id)} className={button(placing === a.id ? "primary" : "secondary", "sm")}>
                      <Crosshair className="size-4" aria-hidden="true" />
                      {placing === a.id ? "Cancel" : pinned ? "Move" : "Place"}
                    </button>
                    {pinned && (
                      <button type="button" onClick={() => remove(a.id)} className={button("ghost", "sm")}>
                        <Trash2 className="size-4" aria-hidden="true" />
                        <span className="sr-only">Remove pin for {a.name}</span>
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-flag">{error}</p>}
      </div>
    </div>
  );
}
