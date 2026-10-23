"use client";

import { Crosshair, Ruler, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { saveMeasuredSize } from "@/app/dashboard/model-actions";
import { removePin, savePin } from "@/app/dashboard/pin-actions";
import { button, field, fieldLabel } from "@/components/ui/styles";
import { DEFAULT_CAMERA_FT, estimateRoom } from "@/lib/roomshape";
import type { Look, Pin } from "@/lib/scan";
import { ScanViewerLoader } from "./ScanViewerLoader";
import type { ViewerFrame } from "./ScanViewer";

export interface StudioAsset {
  id: string;
  name: string;
  status: "working" | "degraded" | "out_of_service";
}

/** The owner's view of a scan: look around, and pin each asset where it sits in the room. */
export default function ScanStudio({ roomId, scanId, frames, assets, pins: initial }: { roomId: string; scanId: string; frames: ViewerFrame[]; assets: StudioAsset[]; pins: Pin[] }) {
  const [pins, setPins] = useState<Pin[]>(initial);
  const [placing, setPlacing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [measure, setMeasure] = useState<"floor" | "ceiling" | null>(null);
  const [floor, setFloor] = useState<Look[]>([]);
  const [ceiling, setCeiling] = useState<Look | null>(null);
  const [cameraFt, setCameraFt] = useState(String(DEFAULT_CAMERA_FT));
  const [ceilingFt, setCeilingFt] = useState("");
  const [saved, setSaved] = useState("");
  const estimate = useMemo(
    () => estimateRoom({ floor, ceiling, cameraHeight: Number(cameraFt) > 0 ? Number(cameraFt) : DEFAULT_CAMERA_FT, ceilingHeight: Number(ceilingFt) > 0 ? Number(ceilingFt) : null }),
    [floor, ceiling, cameraFt, ceilingFt],
  );
  const [, start] = useTransition();
  const byAsset = new Map(pins.map((p) => [p.featureId, p]));
  const placingAsset = assets.find((a) => a.id === placing);

  function place(look: Look) {
    if (measure === "floor") {
      if (look.pitch > -3) return setError("Tap the spot where the wall meets the floor, so the phone is looking down at it.");
      setError("");
      return setFloor((all) => [...all, look]);
    }
    if (measure === "ceiling") {
      if (look.pitch < 3) return setError("Tap a ceiling corner, above the horizon.");
      setError("");
      setCeiling(look);
      return setMeasure(null);
    }
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

  const cornerPins: Pin[] = [
    ...floor.map((l, i) => ({ id: `corner-${i}`, featureId: `corner-${i}`, label: String(i + 1), yaw: l.yaw, pitch: l.pitch })),
    ...(ceiling ? [{ id: "corner-top", featureId: "corner-top", label: "Top", yaw: ceiling.yaw, pitch: ceiling.pitch }] : []),
  ];
  const placingLabel = measure === "floor" ? "next floor corner" : measure === "ceiling" ? "ceiling corner, above a floor corner you marked" : (placingAsset?.name ?? null);

  function saveSize() {
    if (!estimate) return;
    setSaved("");
    start(async () => {
      const res = await saveMeasuredSize({ roomId, widthFt: Math.round(estimate.width * 10) / 10, lengthFt: Math.round(estimate.length * 10) / 10, heightFt: estimate.height ? Math.round(estimate.height * 10) / 10 : null });
      if (res && !res.ok) setError(res.error ?? "The size couldn't be saved.");
      else {
        setError("");
        setSaved("Saved to this room.");
      }
    });
  }

  return (
    <div>
      <ScanViewerLoader frames={frames} pins={[...pins, ...cornerPins]} placingLabel={placingLabel} onPlace={place} />
      <div className="mt-5 border-b border-edge pb-5">
        <h3 className="text-[15px] font-semibold">Measure this room</h3>
        <p className="mt-1 max-w-[62ch] text-sm text-mute">Tap each place where a wall meets the floor, all the way round. Then tap one ceiling corner above a floor corner if you want the ceiling height. The size comes from the angles in the scan.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <button type="button" onClick={() => { setPlacing(null); setMeasure(measure === "floor" ? null : "floor"); }} className={button(measure === "floor" ? "primary" : "secondary", "sm")}>
            <Ruler className="size-4" aria-hidden="true" />
            {measure === "floor" ? "Done marking floor corners" : floor.length ? "Mark more floor corners" : "Mark floor corners"}
          </button>
          <button type="button" onClick={() => { setPlacing(null); setMeasure(measure === "ceiling" ? null : "ceiling"); }} disabled={floor.length === 0} className={button(measure === "ceiling" ? "primary" : "secondary", "sm")}>
            Mark a ceiling corner
          </button>
          {(floor.length > 0 || ceiling) && (
            <button type="button" onClick={() => { setFloor([]); setCeiling(null); setMeasure(null); setSaved(""); }} className={button("ghost", "sm")}>
              Clear
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <div>
            <label htmlFor="cam-ft" className={fieldLabel}>Phone height when scanning (ft)</label>
            <input id="cam-ft" className={`${field} w-32`} inputMode="decimal" value={cameraFt} onChange={(e) => setCameraFt(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ceil-ft" className={fieldLabel}>Ceiling height, if you know it (ft)</label>
            <input id="ceil-ft" className={`${field} w-32`} inputMode="decimal" value={ceilingFt} onChange={(e) => setCeilingFt(e.target.value)} placeholder="optional" />
          </div>
        </div>
        {floor.length > 0 && !estimate && <p className="mt-3 text-sm text-mute">{floor.length} of at least 3 corners marked.</p>}
        {estimate && (
          <div className="mt-3 rounded-lg border border-edge p-4">
            <p className="text-white" data-testid="estimate">
              About {estimate.width.toFixed(1)} × {estimate.length.toFixed(1)} ft ({Math.round(estimate.area)} sq ft)
              {estimate.height ? `, ceiling ${estimate.height.toFixed(1)} ft` : ""}
            </p>
            <p className="mt-1 text-[13px] text-mute">From {estimate.corners} corners, with the phone at {estimate.cameraHeight.toFixed(1)} ft. Accurate to a few percent if the corners were tapped carefully.</p>
            <button type="button" onClick={saveSize} className={`${button("primary", "sm")} mt-3`}>Use these sizes for the room</button>
            {saved && <p role="status" className="mt-2 text-sm text-mint">{saved}</p>}
          </div>
        )}
      </div>
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
