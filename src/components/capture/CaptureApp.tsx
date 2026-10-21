"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState, Logo } from "@/components/ui/primitives";
import { EMPTY_PROGRESS, INTENTS, crewStatus, guestStatus, progressKey, taskIntent, type Intent, type Shot } from "@/lib/capture";
import type { ChecklistItem, Procedures } from "@/lib/guide";
import { GuestProcedures } from "./GuestProcedures";
import { CaptureError, sendEvent, type RecordedEvent } from "@/lib/captureClient";
import { CameraSheet } from "./CameraSheet";
import { ReviewSheet } from "./ReviewSheet";
import { RoomList, type RoomInfo } from "./RoomList";
import { RoomScreen, type SessionShot } from "./RoomScreen";
import { useProgress } from "./useProgress";

export interface CaptureAppProps {
  token: string;
  role: "crew" | "guest";
  propertyName: string;
  guestName: string | null;
  /** ISO time the stay ends, used to pick a sensible default photo type for guests. */
  endsAt: string | null;
  expiresAt: string;
  rooms: RoomInfo[];
  storageEnabled: boolean;
  /** Check-in, checkout and house-rule text, shown to guests. */
  guide: Procedures;
}

type Mode = "arrival" | "departure";
const SIX_HOURS = 6 * 3600_000;

function formatValidUntil(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export default function CaptureApp(props: CaptureAppProps) {
  const { token, role, rooms } = props;
  const { progress, bump } = useProgress(token);

  const [mode, setMode] = useState<Mode>("arrival");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [camera, setCamera] = useState<Intent | null>(null);
  const [review, setReview] = useState<{ intent: Intent; shot: Shot } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [shots, setShots] = useState<Record<string, SessionShot[]>>({});
  const [validUntil, setValidUntil] = useState("");
  const [checked, setChecked] = useState<Set<string>>(() => new Set(rooms.flatMap((r) => r.doneItems)));
  const [pendingTask, setPendingTask] = useState<ChecklistItem | null>(null);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const keptUrls = useRef<string[]>([]);

  useEffect(() => {
    setValidUntil(formatValidUntil(props.expiresAt));
    // Near the end of a stay the useful guest photo is the departure one.
    if (props.endsAt && Date.now() > new Date(props.endsAt).getTime() - SIX_HOURS) setMode("departure");
    const urls = keptUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [props.expiresAt, props.endsAt]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const keyFor = (id: string) => progressKey(role, id, role === "guest" ? mode : undefined);
  const room = rooms.find((r) => r.id === roomId) ?? null;
  const progressOf = (id: string) => progress[keyFor(id)] ?? EMPTY_PROGRESS;

  const doneCount = rooms.filter((r) => (role === "crew" ? progressOf(r.id).finished : progressOf(r.id).photos > 0)).length;
  const percent = rooms.length ? Math.round((doneCount / rooms.length) * 100) : 0;

  const photoIntent: Intent = role === "crew" ? INTENTS.crewPhoto : mode === "arrival" ? INTENTS.guestArrival : INTENTS.guestDeparture;

  function open(r: RoomInfo | null) {
    setError("");
    setRoomId(r?.id ?? null);
  }

  const tasksOf = (r: RoomInfo) => ({ done: r.checklist.filter((i) => checked.has(i.id)).length, total: r.checklist.length });

  async function tick(item: ChecklistItem) {
    if (!room || checked.has(item.id)) return;
    if (item.requiresPhoto) {
      setPendingTask(item);
      setCamera(taskIntent(item.label));
      return;
    }
    setBusyTask(item.id);
    setError("");
    try {
      const event = await sendEvent(token, { roomId: room.id, eventType: "checklist_item", itemId: item.id, itemLabel: item.label });
      setChecked((prev) => new Set(prev).add(item.id));
      setToast(`Recorded as entry ${event.seq} in ${room.name}`);
    } catch (err) {
      setError(err instanceof CaptureError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusyTask(null);
    }
  }

  function discard(shot: Shot) {
    URL.revokeObjectURL(shot.url);
    setReview(null);
  }

  function recorded(event: RecordedEvent, shot: Shot, intent: Intent) {
    if (!room) return;
    const key = keyFor(room.id);
    bump(key, intent.eventType === "damage_report" ? "damage" : "photo");
    if (pendingTask && intent.eventType === "checklist_item") setChecked((prev) => new Set(prev).add(pendingTask.id));
    setPendingTask(null);
    keptUrls.current.push(shot.url);
    setShots((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), { key: `${event.id}`, url: shot.url, seq: event.seq }] }));
    setReview(null);
    setToast(`Recorded as entry ${event.seq} in ${room.name}`);
  }

  async function runEvent(eventType: string, then: () => void) {
    if (!room) return;
    setBusy(true);
    setError("");
    try {
      const event = await sendEvent(token, { roomId: room.id, eventType });
      then();
      setToast(`Recorded as entry ${event.seq} in ${room.name}`);
    } catch (err) {
      setError(err instanceof CaptureError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const firstName = props.guestName?.trim().split(/\s+/)[0];

  return (
    <main className="mx-auto min-h-dvh max-w-[480px] px-5 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="mb-8">
        <Logo className="text-[15px]" />
      </header>

      {room ? (
        <RoomScreen
          role={role}
          room={room}
          progress={progressOf(room.id)}
          mode={mode}
          busy={busy}
          error={error}
          shots={shots[keyFor(room.id)] ?? []}
          onBack={() => open(null)}
          onStart={() => runEvent("clean_start", () => bump(keyFor(room.id), "start"))}
          onFinish={() =>
            runEvent("clean_end", () => {
              bump(keyFor(room.id), "finish");
              setRoomId(null);
            })
          }
          onPhoto={() => {
            setPendingTask(null);
            setCamera(photoIntent);
          }}
          onDamage={() => {
            setPendingTask(null);
            setCamera(INTENTS.crewDamage);
          }}
          done={checked}
          busyTask={busyTask}
          onTask={tick}
        />
      ) : (
        <>
          <h1 className="text-[28px] font-semibold leading-tight">
            {role === "crew" ? props.propertyName : firstName ? `Welcome, ${firstName}` : "Welcome"}
          </h1>
          <p className="mt-1 text-mute">{role === "crew" ? "Turnover checklist" : props.propertyName}</p>

          {role === "guest" && (
            <div className="mt-6">
              <div role="radiogroup" aria-label="Photo type" className="grid grid-cols-2 gap-1 rounded-xl border border-edge bg-graphite p-1">
                {(["arrival", "departure"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={`h-11 rounded-lg text-sm font-medium transition-colors ${mode === m ? "bg-slate-brand text-white" : "text-mute hover:text-white"}`}
                  >
                    {m === "arrival" ? "Arrival" : "Departure"}
                  </button>
                ))}
              </div>
              <p className="mt-3 max-w-[44ch] text-[13px] text-mute">
                {mode === "arrival"
                  ? "Photograph each room as you find it. This records the condition it was in when you arrived."
                  : "Photograph each room as you leave it. This records the condition it was in at departure."}
              </p>
            </div>
          )}

          {rooms.length === 0 ? (
            <div className="mt-8">
              <EmptyState title="No rooms to show">Ask the property manager to add rooms to this property.</EmptyState>
            </div>
          ) : (
            <>
              <div className="mt-6" aria-live="polite">
                <p className="text-[13px] text-ash">
                  {doneCount} of {rooms.length} {rooms.length === 1 ? "room" : "rooms"} {role === "crew" ? "done" : "photographed"}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-edge" role="presentation">
                  <div className="h-full rounded-full bg-mint transition-[width] duration-300" style={{ width: `${percent}%` }} />
                </div>
              </div>
              <div className="mt-4">
                <RoomList
                  rooms={rooms}
                  statusFor={(r) => (role === "crew" ? crewStatus(progressOf(r.id), tasksOf(r)) : guestStatus(progressOf(r.id)))}
                  onOpen={open}
                />
              </div>
            </>
          )}

          {role === "guest" && <GuestProcedures guide={props.guide} />}

          {validUntil && <p className="mt-8 text-[13px] text-mute">This link works until {validUntil}.</p>}
        </>
      )}

      {camera && room && (
        <CameraSheet
          title={`${camera.title}, ${room.name}`}
          onClose={() => {
            setCamera(null);
            setPendingTask(null);
          }}
          onShot={(shot) => {
            setReview({ intent: camera, shot });
            setCamera(null);
          }}
        />
      )}

      {review && room && (
        <ReviewSheet
          token={token}
          roomId={room.id}
          roomName={room.name}
          intent={review.intent}
          shot={review.shot}
          storageEnabled={props.storageEnabled}
          onRetake={() => {
            discard(review.shot);
            setCamera(review.intent);
          }}
          onCancel={() => {
            discard(review.shot);
            setPendingTask(null);
          }}
          task={pendingTask && review.intent.eventType === "checklist_item" ? { id: pendingTask.id, label: pendingTask.label } : undefined}
          onRecorded={(event, shot) => recorded(event, shot, review.intent)}
        />
      )}

      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-[440px] transition-opacity duration-200 ${toast ? "opacity-100" : "opacity-0"}`}
      >
        {toast && (
          <p className="flex items-center gap-2 rounded-xl border border-mint/40 bg-graphite px-4 py-3 text-sm text-white shadow-lg shadow-black/50">
            <Check className="size-4 shrink-0 text-mint" aria-hidden="true" />
            {toast}
          </p>
        )}
      </div>
    </main>
  );
}
