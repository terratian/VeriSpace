"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { button, field, fieldLabel } from "@/components/ui/styles";

/** The guest's confirmation that the rooms are as the owner's record shows, or a note of what isn't. */
export function AckCard({
  rooms,
  done,
  onConfirm,
  onDifferent,
}: {
  rooms: { id: string; name: string }[];
  done: boolean;
  onConfirm: () => Promise<void>;
  onDifferent: (roomId: string, note: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="mt-6 flex items-center gap-2 rounded-xl border border-mint/40 bg-graphite px-4 py-3 text-sm">
        <Check className="size-4 shrink-0 text-mint" aria-hidden="true" />
        Thanks, your answer about the condition at arrival is recorded.
      </p>
    );
  }
  return (
    <section className="mt-6 rounded-xl border border-edge bg-graphite p-4" aria-labelledby="ack-title">
      <h2 id="ack-title" className="text-[15px] font-semibold">
        Is everything as it should be?
      </h2>
      <p className="mt-1 text-[13px] text-mute">After a look around: are the rooms in the condition the owner&apos;s record shows, apart from anything you&apos;ve already reported?</p>
      {!open ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button type="button" disabled={busy} onClick={() => run(onConfirm)} className={button("primary", "md")}>
            Yes, as shown
          </button>
          <button type="button" disabled={busy} onClick={() => setOpen(true)} className={button("secondary", "md")}>
            Something&apos;s different
          </button>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <div>
            <label htmlFor="ack-room" className={fieldLabel}>
              Which room?
            </label>
            <select id="ack-room" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={field}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ack-note" className={fieldLabel}>
              What is different?
            </label>
            <textarea id="ack-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className={button("secondary", "md")}>
              Back
            </button>
            <button
              type="button"
              disabled={busy || !note.trim()}
              onClick={() => run(() => onDifferent(roomId, note.trim()))}
              className={button("primary", "md")}
            >
              Send
            </button>
          </div>
          <p className="text-[13px] text-mute">A photo helps. Use &quot;Report a problem&quot; inside the room to add one.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-flag">
          {error}
        </p>
      )}
    </section>
  );
}
