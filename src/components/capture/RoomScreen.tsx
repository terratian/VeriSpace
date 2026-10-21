"use client";

import { ArrowLeft, Camera, Check, Flag, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { button } from "@/components/ui/styles";
import { canFinish, crewStatus, guestStatus, type RoomProgress } from "@/lib/capture";
import type { ChecklistItem } from "@/lib/guide";
import { Checklist } from "./Checklist";
import type { RoomInfo } from "./RoomList";
import { RoomGuide } from "./RoomGuide";

export interface SessionShot {
  key: string;
  url: string;
  seq: number;
}

function ShotGrid({ shots }: { shots: SessionShot[] }) {
  if (shots.length === 0) return null;
  return (
    <section className="mt-8" aria-label="Photos recorded in this visit">
      <h2 className="mb-3 text-[15px] font-semibold">Recorded this visit</h2>
      <ul className="grid grid-cols-3 gap-2">
        {shots.map((s) => (
          <li key={s.key}>
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt={`Photo recorded as entry ${s.seq}`} className="aspect-[4/3] w-full rounded-lg border border-edge object-cover" />
              <figcaption className="mt-1 flex items-center gap-1 font-mono text-[11px] text-mint">
                <Check className="size-3" aria-hidden="true" />
                Entry {s.seq}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RoomScreen({
  role,
  room,
  progress,
  mode,
  busy,
  error,
  shots,
  onBack,
  onStart,
  onFinish,
  onPhoto,
  onDamage,
  done,
  busyTask,
  onTask,
}: {
  role: "crew" | "guest";
  room: RoomInfo;
  progress: RoomProgress;
  mode: "arrival" | "departure";
  busy: boolean;
  error: string;
  shots: SessionShot[];
  onBack: () => void;
  onStart: () => void;
  onFinish: () => void;
  onPhoto: () => void;
  onDamage: () => void;
  /** Task ids recorded for this stay. */
  done: ReadonlySet<string>;
  busyTask: string | null;
  onTask: (item: ChecklistItem) => void;
}) {
  const back = (
    <button type="button" onClick={onBack} className="-ml-2 mb-4 inline-flex h-11 items-center gap-2 rounded-lg px-2 text-sm text-ash hover:text-white">
      <ArrowLeft className="size-4" aria-hidden="true" />
      All rooms
    </button>
  );

  if (role === "guest") {
    const status = guestStatus(progress);
    const label = mode === "arrival" ? "arrival" : "departure";
    return (
      <div>
        {back}
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[26px] font-semibold leading-tight">{room.name}</h1>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="mt-2 max-w-[44ch] text-ash">
          {mode === "arrival"
            ? "Photograph the room as you find it, including anything already worn or marked, so its condition when you arrived is on record."
            : "Photograph the room as you leave it, so its condition at departure is on record."}
        </p>
        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-flag/40 bg-flag/10 px-3 py-2 text-sm text-flag">
            {error}
          </p>
        )}
        <RoomGuide content={room.content} />
        <button type="button" onClick={onPhoto} className={`${button("primary", "lg")} mt-6 w-full`}>
          <Camera className="size-5" aria-hidden="true" />
          {progress.photos > 0 ? `Add another ${label} photo` : `Take ${label} photo`}
        </button>
        <ShotGrid shots={shots} />
      </div>
    );
  }

  const tasksDone = room.checklist.filter((i) => done.has(i.id)).length;
  const tasksLeft = room.checklist.length - tasksDone;
  const status = crewStatus(progress, { done: tasksDone, total: room.checklist.length });
  const finishable = canFinish(progress, tasksLeft);
  // One primary action at a time: whatever the next step is.
  const next: "start" | "photo" | "finish" | null = !progress.started ? "start" : tasksLeft > 0 ? null : progress.photos === 0 ? "photo" : finishable ? "finish" : null;
  const variant = (step: "start" | "photo" | "finish") => (next === step ? "primary" : "secondary");

  return (
    <div>
      {back}
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-[26px] font-semibold leading-tight">{room.name}</h1>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {progress.finished && <p className="mt-2 text-ash">This room is done. You can still add photos or report damage.</p>}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-flag/40 bg-flag/10 px-3 py-2 text-sm text-flag">
          {error}
        </p>
      )}

      {!progress.started && (
        <button type="button" onClick={onStart} disabled={busy} className={`${button(variant("start"), "lg")} mt-6 w-full`}>
          {busy && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          Start cleaning
        </button>
      )}

      <Checklist items={room.checklist} done={done} busyId={busyTask} onTick={onTask} />

      <div className="mt-6 flex flex-col gap-3">
        <button type="button" onClick={onPhoto} className={`${button(variant("photo"), "lg")} w-full`}>
          <Camera className="size-5" aria-hidden="true" />
          Take verification photo
          {progress.photos > 0 && <span className="text-mute">({progress.photos})</span>}
        </button>
        <button type="button" onClick={onDamage} className={`${button("danger", "lg")} w-full`}>
          <Flag className="size-5" aria-hidden="true" />
          Report damage
          {progress.damage > 0 && <span>({progress.damage})</span>}
        </button>
        {!progress.finished && (
          <>
            <button type="button" onClick={onFinish} disabled={busy || !finishable} className={`${button(variant("finish"), "lg")} w-full`}>
              {busy && finishable && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
              Finish room
            </button>
            {!finishable && (
              <p className="-mt-1 text-[13px] text-mute">
                {!progress.started
                  ? "Start cleaning first."
                  : tasksLeft > 0
                    ? `${tasksLeft} ${tasksLeft === 1 ? "task" : "tasks"} left.`
                    : "Take a verification photo to finish this room."}
              </p>
            )}
          </>
        )}
      </div>

      <ShotGrid shots={shots} />
    </div>
  );
}
