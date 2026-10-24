"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { moduleForRole } from "@/lib/brand";
import { EmptyState, Logo } from "@/components/ui/primitives";
import { EMPTY_PROGRESS, INTENTS, baselineStatus, crewStatus, guestStatus, progressKey, taskIntent, type Intent, type Shot } from "@/lib/capture";
import type { ChecklistItem, Procedures } from "@/lib/guide";
import { GuestProcedures } from "./GuestProcedures";
import { CaptureError, demoEvent, sendEvent, type EventInput, type RecordedEvent } from "@/lib/captureClient";
import { CameraSheet } from "./CameraSheet";
import { ReviewSheet } from "./ReviewSheet";
import { RoomList, type RoomInfo } from "./RoomList";
import { RoomScreen, type SessionShot } from "./RoomScreen";
import { AckCard } from "./AckCard";
import { ConciergeHome } from "./ConciergeHome";
import { RoomLookAround } from "./RoomLookAround";
import { stageFor, type Stage } from "@/lib/concierge";
import { useOfflineQueue } from "./useOfflineQueue";
import { useProgress } from "./useProgress";

export interface CaptureAppProps {
  token: string;
  role: "crew" | "guest" | "manager";
  propertyName: string;
  guestName: string | null;
  /** ISO time the stay starts and ends, used to open the concierge at the right stage. */
  startsAt?: string | null;
  endsAt: string | null;
  expiresAt: string;
  rooms: RoomInfo[];
  storageEnabled: boolean;
  /** Check-in, checkout and house-rule text, shown to guests. */
  guide: Procedures;
  /** Key for remembering progress on this device when the token changes between visits. */
  storageId?: string;
  /** Rendered inside a page that already has a header and main region. */
  embedded?: boolean;
  /** Public demo: nothing is sent to the server. */
  demo?: boolean;
}

type Mode = "arrival" | "departure";

function formatValidUntil(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export default function CaptureApp(props: CaptureAppProps) {
  const { token, role, rooms } = props;
  const [toast, setToast] = useState("");
  const queue = useOfflineQueue(!props.demo, (n) => setToast(`Sent ${n} saved ${n === 1 ? "entry" : "entries"}.`));
  // Entries without a photo are kept on the phone when there is no signal, and sent later (entry number 0 means "saved, not sent yet").
  const record = async (input: EventInput): Promise<RecordedEvent> => {
    if (props.demo) return demoEvent();
    try {
      return await sendEvent(token, input);
    } catch (err) {
      if (err instanceof CaptureError && err.status === 0 && !input.shot && (await queue.add(token, input))) return { id: 0, seq: 0, rowHash: "" };
      throw err;
    }
  };
  const said = (event: RecordedEvent, where: string) => (event.seq ? `Recorded as entry ${event.seq} in ${where}` : "No signal: saved on this phone, and it will send when you're back online.");
  const { progress, bump } = useProgress(props.storageId ?? token);
  const [acked, setAcked] = useState(false);
  const ackKey = `vs:ack:${(props.storageId ?? token).slice(-20)}`;
  useEffect(() => {
    try {
      setAcked(window.localStorage.getItem(ackKey) === "1");
    } catch {
      /* not remembered */
    }
  }, [ackKey]);

  const [stage, setStage] = useState<Stage>("checkin");
  const mode: Mode = stage === "checkout" ? "departure" : "arrival";
  const [look, setLook] = useState<RoomInfo | null>(null);
  const [issueFeature, setIssueFeature] = useState<string | null>(null);
  const [checkedOut, setCheckedOut] = useState(false);
  const coKey = `vs:checkout:${(props.storageId ?? token).slice(-20)}`;
  const [roomId, setRoomId] = useState<string | null>(null);
  const [camera, setCamera] = useState<Intent | null>(null);
  const [review, setReview] = useState<{ intent: Intent; shot: Shot } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shots, setShots] = useState<Record<string, SessionShot[]>>({});
  const [validUntil, setValidUntil] = useState("");
  const [checked, setChecked] = useState<Set<string>>(() => new Set(rooms.flatMap((r) => r.doneItems)));
  const [pendingTask, setPendingTask] = useState<ChecklistItem | null>(null);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const keptUrls = useRef<string[]>([]);

  useEffect(() => {
    setValidUntil(formatValidUntil(props.expiresAt));
    // Open the concierge at the stage the stay is in.
    setStage(stageFor(new Date(), props.startsAt ? new Date(props.startsAt) : null, props.endsAt ? new Date(props.endsAt) : null));
    try {
      setCheckedOut(window.localStorage.getItem(coKey) === "1");
    } catch {
      /* not remembered */
    }
    const urls = keptUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [props.expiresAt, props.startsAt, props.endsAt, coKey]);

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

  const photoIntent: Intent = role === "manager" ? INTENTS.baselineRoom : role === "crew" ? INTENTS.crewPhoto : mode === "arrival" ? INTENTS.guestArrival : INTENTS.guestDeparture;

  function open(r: RoomInfo | null) {
    setError("");
    setRoomId(r?.id ?? null);
  }

  const tasksOf = (r: RoomInfo) => ({ done: r.checklist.filter((i) => checked.has(i.id)).length, total: r.checklist.length });

  async function tick(item: ChecklistItem) {
    if (!room || checked.has(item.id)) return;
    if (item.requiresPhoto) {
      setPendingTask(item);
      setCamera(role === "manager" ? taskIntent(item.label, "baseline_photo", "Record baseline") : taskIntent(item.label));
      return;
    }
    setBusyTask(item.id);
    setError("");
    try {
      const event = await record({ roomId: room.id, eventType: "checklist_item", itemId: item.id, itemLabel: item.label });
      setChecked((prev) => new Set(prev).add(item.id));
      setToast(said(event, room.name));
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
    // A problem report is evidence, not a room photo: it doesn't count toward arrival or verification photos.
    if (intent.eventType === "damage_report") bump(key, "damage");
    else if (intent.eventType !== "issue_reported") bump(key, "photo");
    if (pendingTask) setChecked((prev) => new Set(prev).add(pendingTask.id));
    setPendingTask(null);
    keptUrls.current.push(shot.url);
    setShots((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), { key: `${event.id}`, url: shot.url, seq: event.seq }] }));
    setReview(null);
    setToast(said(event, room.name));
  }

  async function queuePhoto(input: EventInput) {
    if (!room || !review) return;
    if (!(await queue.add(token, input))) {
      setError("This phone can't save it for later. Try again when you have signal.");
      return;
    }
    recorded({ id: 0, seq: 0, rowHash: "" }, review.shot, review.intent);
  }

  async function acknowledge(agrees: boolean, roomIds: string[], note?: string) {
    for (const id of roomIds) await record({ roomId: id, eventType: "condition_ack", note, extra: { agrees } });
    if (agrees) {
      setAcked(true);
      try {
        window.localStorage.setItem(ackKey, "1");
      } catch {
        /* not remembered */
      }
    }
    setToast(agrees ? "Thanks, recorded." : "Thanks, the owner has been told.");
  }

  async function checkout() {
    const first = rooms[0];
    if (!first) return;
    setBusy(true);
    setError("");
    try {
      const event = await record({ roomId: first.id, eventType: "checkout_confirm", extra: { photoRooms: doneCount, rooms: rooms.length } });
      setCheckedOut(true);
      try {
        window.localStorage.setItem(coKey, "1");
      } catch {
        /* not remembered */
      }
      setToast(said(event, first.name));
    } catch (err) {
      setError(err instanceof CaptureError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function runEvent(eventType: string, then: () => void) {
    if (!room) return;
    setBusy(true);
    setError("");
    try {
      const event = await record({ roomId: room.id, eventType });
      then();
      setToast(said(event, room.name));
    } catch (err) {
      setError(err instanceof CaptureError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const Wrapper = props.embedded ? "div" : "main";
  const firstName = props.guestName?.trim().split(/\s+/)[0];

  return (
    <Wrapper className={`mx-auto max-w-[480px] px-5 ${props.embedded ? "pb-24 pt-6" : "min-h-dvh pb-28 pt-[max(1.25rem,env(safe-area-inset-top))]"}`}>
      {!props.embedded && (
        <header className="mb-8">
          <Logo className="text-[15px]" module={moduleForRole(role)} />
        </header>
      )}

      {(queue.waiting > 0 || queue.failed.length > 0) && (
        <div role="status" className="mb-4 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-[13px] text-amber">
          {queue.waiting > 0 && (
            <p>
              {queue.waiting} {queue.waiting === 1 ? "entry is" : "entries are"} saved on this phone and will send when you have signal.{" "}
              <button type="button" onClick={() => void queue.flush()} disabled={queue.sending} className="underline">
                {queue.sending ? "Sending…" : "Send now"}
              </button>
            </p>
          )}
          {queue.failed.map((f) => (
            <p key={f.id}>
              One saved entry couldn&apos;t be sent: {f.error}{" "}
              <button type="button" onClick={() => void queue.discard(f.id)} className="underline">
                Discard
              </button>
            </p>
          ))}
        </div>
      )}

      {props.demo && <p className="mb-4 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-[13px] text-amber">Demo: sample data. Nothing is saved.</p>}

      {room ? (
        <RoomScreen
          role={role}
          room={room}
          progress={progressOf(room.id)}
          mode={mode}
          busy={busy}
          error={error}
          shots={shots[keyFor(room.id)] ?? []}
          stage={stage}
          onLookAround={room.hasScan && !props.demo ? () => setLook(room) : undefined}
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
          onIssue={() => {
            setPendingTask(null);
            setIssueFeature(null);
            setCamera(INTENTS.issue);
          }}
          done={checked}
          busyTask={busyTask}
          onTask={tick}
        />
      ) : role === "guest" ? (
        <ConciergeHome
          firstName={firstName}
          propertyName={props.propertyName}
          stage={stage}
          onStage={setStage}
          rooms={rooms}
          guide={props.guide}
          statusFor={(r) => guestStatus(progressOf(r.id))}
          roomsDone={doneCount}
          onOpenRoom={open}
          onReport={(r) => {
            open(r);
            setPendingTask(null);
            setIssueFeature(null);
            setCamera(INTENTS.issue);
          }}
          ack={
            <AckCard
              rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
              done={acked}
              onConfirm={() => acknowledge(true, rooms.map((r) => r.id))}
              onDifferent={(id, note) => acknowledge(false, [id], note)}
            />
          }
          checkedOut={checkedOut}
          onCheckout={checkout}
          busy={busy}
          error={error}
        />
      ) : (
        <>
          <h1 className="text-[28px] font-semibold leading-tight">
            {props.propertyName}
          </h1>
          <p className="mt-1 text-mute">{role === "crew" ? "Turnover checklist" : "Baseline walkthrough"}</p>

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
                  statusFor={(r) =>
                    role === "crew" ? crewStatus(progressOf(r.id), tasksOf(r)) : baselineStatus(progressOf(r.id), tasksOf(r))
                  }
                  onOpen={open}
                />
              </div>
            </>
          )}

          {validUntil && role !== "manager" && <p className="mt-8 text-[13px] text-mute">This link works until {validUntil}.</p>}
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

      {look && (
        <RoomLookAround
          token={token}
          room={look}
          onClose={() => setLook(null)}
          onReport={(featureId) => {
            setIssueFeature(featureId);
            setLook(null);
            setPendingTask(null);
            setCamera(INTENTS.issue);
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
          demo={props.demo}
          onRetake={() => {
            discard(review.shot);
            setCamera(review.intent);
          }}
          onCancel={() => {
            discard(review.shot);
            setPendingTask(null);
          }}
          task={pendingTask ? { id: pendingTask.id, label: pendingTask.label } : undefined}
          onRecorded={(event, shot) => recorded(event, shot, review.intent)}
          onQueue={props.demo ? undefined : queuePhoto}
          extra={review.intent.eventType === "issue_reported" && issueFeature ? { featureId: issueFeature } : undefined}
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
    </Wrapper>
  );
}
