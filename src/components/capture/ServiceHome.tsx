"use client";

import { AlertTriangle, ArrowLeft, Camera, Check, ChevronRight, Flag, Loader2 } from "lucide-react";
import { button } from "@/components/ui/styles";
import { canFinish, type RoomProgress } from "@/lib/capture";
import type { ChecklistItem } from "@/lib/guide";
import type { RoomInfo } from "./RoomList";

/**
 * VeriService: the crew's flow. One thing on screen at a time, in order: start the room, do each task the owner
 * set (photo where needed), take the closing photo, finish, go to the next room. It is a to-do list with proof,
 * not a menu.
 */
export function ServiceHome({
  propertyName,
  rooms,
  room,
  progressOf,
  done,
  busy,
  busyTask,
  error,
  onOpen,
  onStart,
  onFinish,
  onTask,
  onPhoto,
  onDamage,
  onIssue,
}: {
  propertyName: string;
  rooms: RoomInfo[];
  room: RoomInfo | null;
  progressOf: (id: string) => RoomProgress;
  done: ReadonlySet<string>;
  busy: boolean;
  busyTask: string | null;
  error: string;
  onOpen: (r: RoomInfo | null) => void;
  onStart: () => void;
  onFinish: () => void;
  onTask: (item: ChecklistItem) => void;
  onPhoto: () => void;
  onDamage: () => void;
  onIssue: () => void;
}) {
  const finished = rooms.filter((r) => progressOf(r.id).finished).length;
  const nextIndex = rooms.findIndex((r) => !progressOf(r.id).finished);

  const errorBox = error && (
    <p role="alert" className="mt-4 rounded-lg border border-flag/40 bg-flag/10 px-3 py-2 text-sm text-flag">
      {error}
    </p>
  );

  if (!room) {
    const allDone = rooms.length > 0 && finished === rooms.length;
    return (
      <div>
        <p className="text-[13px] font-medium uppercase tracking-wide text-mute">Turnover</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight">{propertyName}</h1>
        <div className="mt-5" aria-live="polite">
          <p className="text-[15px] text-ash">{allDone ? "All rooms are done. Thank you." : `${finished} of ${rooms.length} rooms done`}</p>
          <div className="mt-2 flex gap-1.5" role="presentation">
            {rooms.map((r) => (
              <span key={r.id} className={`h-1.5 flex-1 rounded-full ${progressOf(r.id).finished ? "bg-mint" : progressOf(r.id).started ? "bg-amber" : "bg-edge"}`} />
            ))}
          </div>
        </div>

        {!allDone && nextIndex >= 0 && (
          <button type="button" onClick={() => onOpen(rooms[nextIndex])} className={`${button("primary", "lg")} mt-6 w-full justify-between`}>
            <span>
              {progressOf(rooms[nextIndex].id).started ? "Continue" : "Start"}: {rooms[nextIndex].name}
            </span>
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        )}

        <ol className="mt-6 border-t border-edge">
          {rooms.map((r, i) => {
            const p = progressOf(r.id);
            const t = r.checklist.filter((c) => done.has(c.id)).length;
            return (
              <li key={r.id} className="border-b border-edge">
                <button type="button" onClick={() => onOpen(r)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
                  <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-[13px] ${p.finished ? "border-mint bg-mint/15 text-mint" : "border-edge text-mute"}`}>
                    {p.finished ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[16px] font-medium">{r.name}</span>
                    <span className="block text-[13px] text-mute">{p.finished ? "Done" : r.checklist.length ? `${t} of ${r.checklist.length} tasks` : "No tasks set"}</span>
                  </span>
                  <ChevronRight className="size-4 text-mute" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // One room, one step at a time.
  const p = progressOf(room.id);
  const index = rooms.findIndex((r) => r.id === room.id);
  const tasks = room.checklist;
  const nextTask = tasks.find((t) => !done.has(t.id));
  const tasksLeft = tasks.filter((t) => !done.has(t.id)).length;
  const needsClosingPhoto = tasksLeft === 0 && p.photos === 0;
  const ready = canFinish(p, tasksLeft);
  const doneTasks = tasks.length - tasksLeft;
  const stepTotal = tasks.length + 1;
  const stepNow = Math.min(doneTasks + (p.photos > 0 ? 1 : 0), stepTotal);

  return (
    <div>
      <button type="button" onClick={() => onOpen(null)} className="-ml-2 mb-3 inline-flex h-11 items-center gap-2 rounded-lg px-2 text-sm text-ash hover:text-white">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All rooms
      </button>
      <p className="text-[13px] font-medium uppercase tracking-wide text-mute">
        Room {index + 1} of {rooms.length}
      </p>
      <h1 className="mt-1 text-[28px] font-semibold leading-tight">{room.name}</h1>
      {errorBox}

      {p.finished ? (
        <div className="mt-6 rounded-xl border border-mint/40 bg-graphite p-5">
          <p className="flex items-center gap-2 text-[17px] font-semibold">
            <Check className="size-5 text-mint" aria-hidden="true" />
            This room is done
          </p>
          <button type="button" onClick={() => onOpen(null)} className={`${button("primary", "lg")} mt-4 w-full`}>
            Next room
          </button>
        </div>
      ) : !p.started ? (
        <div className="mt-6 rounded-xl border border-edge bg-graphite p-5">
          <p className="text-[16px] text-ash">
            {tasks.length > 0 ? `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}, then a closing photo.` : "Take a closing photo when you finish."}
          </p>
          <button type="button" onClick={onStart} disabled={busy} className={`${button("primary", "lg")} mt-4 w-full`}>
            {busy && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
            Start this room
          </button>
        </div>
      ) : (
        <div className="mt-6">
          <div className="flex gap-1.5" role="presentation">
            {Array.from({ length: stepTotal }, (_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < stepNow ? "bg-mint" : "bg-edge"}`} />
            ))}
          </div>
          <p className="mt-2 text-[13px] text-mute" aria-live="polite">
            Step {Math.min(stepNow + 1, stepTotal)} of {stepTotal}
          </p>

          {nextTask ? (
            <div className="mt-3 rounded-xl border border-edge bg-graphite p-5">
              <p className="text-[20px] font-semibold leading-snug">{nextTask.label}</p>
              {nextTask.requiresPhoto && <p className="mt-2 text-[14px] text-mint">Take a photo to finish this step.</p>}
              <button type="button" onClick={() => onTask(nextTask)} disabled={busyTask !== null} className={`${button("primary", "lg")} mt-5 w-full`}>
                {busyTask === nextTask.id ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : nextTask.requiresPhoto ? <Camera className="size-5" aria-hidden="true" /> : <Check className="size-5" aria-hidden="true" />}
                {nextTask.requiresPhoto ? "Take photo" : "Done"}
              </button>
            </div>
          ) : needsClosingPhoto ? (
            <div className="mt-3 rounded-xl border border-edge bg-graphite p-5">
              <p className="text-[20px] font-semibold leading-snug">Take a photo of the room as you leave it</p>
              <button type="button" onClick={onPhoto} className={`${button("primary", "lg")} mt-5 w-full`}>
                <Camera className="size-5" aria-hidden="true" />
                Take photo
              </button>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-mint/40 bg-graphite p-5">
              <p className="text-[20px] font-semibold leading-snug">Everything is recorded</p>
              <button type="button" onClick={onFinish} disabled={!ready || busy} className={`${button("primary", "lg")} mt-5 w-full`}>
                {busy && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
                Finish this room
              </button>
            </div>
          )}

          {doneTasks > 0 && (
            <ul className="mt-5 space-y-1.5 text-[14px] text-mute" aria-label="Done in this room">
              {tasks.filter((t) => done.has(t.id)).map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-mint" aria-hidden="true" />
                  {t.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!p.finished && (
        <div className="mt-8 grid grid-cols-2 gap-3 border-t border-edge pt-5">
          <button type="button" onClick={onIssue} className={button("secondary", "md")}>
            <Flag className="size-4" aria-hidden="true" />
            Problem
          </button>
          <button type="button" onClick={onDamage} className={button("secondary", "md")}>
            <AlertTriangle className="size-4" aria-hidden="true" />
            Damage
          </button>
        </div>
      )}
    </div>
  );
}
