"use client";

import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ScanViewerLoader } from "@/components/dashboard/ScanViewerLoader";
import type { ViewerFrame } from "@/components/dashboard/ScanViewer";
import { button } from "@/components/ui/styles";
import { Badge } from "@/components/ui/primitives";
import { STATUS_LABELS } from "@/lib/model";
import type { Pin } from "@/lib/scan";
import { ResourceLinks } from "./RoomGuide";
import type { RoomFeatureInfo, RoomInfo } from "./RoomList";

/** Look around a room and tap a pin for help with what is there. */
export function RoomLookAround({ token, room, onClose, onReport }: { token: string; room: RoomInfo; onClose: () => void; onReport: (featureId: string) => void }) {
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [frames, setFrames] = useState<ViewerFrame[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const [open, setOpen] = useState<RoomFeatureInfo | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/room-view?room=${room.id}`, { headers: { authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { frames: ViewerFrame[]; pins: Pin[] };
        if (!live) return;
        setFrames(body.frames);
        // Use the live status from the room's own feature list.
        setPins(body.pins.map((p) => ({ ...p, status: room.features.find((f) => f.id === p.featureId)?.status ?? "working" })));
        setState(body.frames.length ? "ready" : "empty");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [room, token]);

  const feature = open;
  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-obsidian" role="dialog" aria-modal="true" aria-label={`Look around the ${room.name}`}>
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div>
          <h2 className="text-[17px] font-semibold">{room.name}</h2>
          <p className="text-[13px] text-mute">Drag to look around. Tap a pin for help.</p>
        </div>
        <button type="button" onClick={onClose} className="inline-flex size-11 items-center justify-center rounded-lg text-ash hover:text-white" aria-label="Close">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1 px-2 pb-2">
        {state === "loading" && (
          <p className="flex h-full items-center justify-center gap-2 text-mute">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading the room
          </p>
        )}
        {(state === "empty" || state === "error") && <p className="flex h-full items-center justify-center px-6 text-center text-mute">{state === "empty" ? "There's no look-around for this room yet." : "Couldn't load the room. Try again in a moment."}</p>}
        {state === "ready" && (
          <div className="h-full">
            <ScanViewerLoader frames={frames} pins={pins} onPinClick={(p) => setOpen(room.features.find((f) => f.id === p.featureId) ?? null)} />
          </div>
        )}
      </div>
      {feature && (
        <div className="border-t border-edge bg-graphite px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          <div className="mx-auto max-w-[448px]">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[17px] font-semibold">{feature.name}</h3>
              {feature.status !== "working" && <Badge tone={feature.status === "degraded" ? "amber" : "red"}>{feature.status === "degraded" ? "Limited right now" : STATUS_LABELS.out_of_service}</Badge>}
            </div>
            {feature.note && <p className="mt-1 text-[14px] text-ash">{feature.note}</p>}
            {feature.resources && feature.resources.length > 0 ? <ResourceLinks items={feature.resources} /> : <p className="mt-1 text-[14px] text-mute">No guide has been added for this yet.</p>}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setOpen(null)} className={button("secondary", "md")}>
                Close
              </button>
              <button type="button" onClick={() => onReport(feature.id)} className={button("primary", "md")}>
                <AlertTriangle className="size-4" aria-hidden="true" />
                Report a problem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
