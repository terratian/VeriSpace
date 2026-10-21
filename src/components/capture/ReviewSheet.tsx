"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { button, field, fieldLabel } from "@/components/ui/styles";
import { formatBytes, type Intent, type Shot } from "@/lib/capture";
import { CaptureError, sendEvent, uploadShot, type RecordedEvent } from "@/lib/captureClient";
import { Fingerprint } from "./Fingerprint";

/**
 * Shows the photo that was just taken and records it. Upload and ledger entry are separate steps so
 * that a dropped connection between them retries only what is missing.
 */
export function ReviewSheet({
  token,
  roomId,
  roomName,
  intent,
  shot,
  storageEnabled,
  onRetake,
  onCancel,
  onRecorded,
}: {
  token: string;
  roomId: string;
  roomName: string;
  intent: Intent;
  shot: Shot;
  storageEnabled: boolean;
  onRetake: () => void;
  onCancel: () => void;
  onRecorded: (event: RecordedEvent, shot: Shot) => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const uploaded = useRef(false);

  async function save() {
    if (intent.noteRequired && !note.trim()) {
      setError("Describe what is damaged before recording.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (!uploaded.current) {
        await uploadShot(token, roomId, shot);
        uploaded.current = true;
      }
      const event = await sendEvent(token, { roomId, eventType: intent.eventType, note, shot });
      onRecorded(event, shot);
    } catch (err) {
      if (err instanceof CaptureError) {
        // The ledger refused because the file isn't stored: upload it again on the next try.
        if (err.status === 409) uploaded.current = false;
        setError(err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
      setSaving(false);
    }
  }

  const size = [shot.width && shot.height ? `${shot.width} by ${shot.height} px` : null, formatBytes(shot.blob.size)]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-obsidian" role="dialog" aria-modal="true" aria-label={`${intent.title}, ${roomName}`}>
      <div className="min-h-0 flex-1 bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.url} alt="The photo you just took" className="h-full w-full object-contain" />
      </div>

      <div className="max-h-[62%] overflow-y-auto border-t border-edge bg-graphite px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <div className="mx-auto max-w-[448px]">
          <h2 className="text-[17px] font-semibold">{intent.title}</h2>
          <p className="text-[13px] text-mute">{roomName}</p>

          <div className="mt-3">
            <p className="mb-1 text-[13px] text-mute">Fingerprint, calculated on this phone</p>
            <Fingerprint hash={shot.sha256} />
            <p className="mt-1 text-[13px] text-mute">{size}</p>
          </div>

          <div className="mt-4">
            <label htmlFor="shot-note" className={fieldLabel}>
              {intent.noteLabel}
            </label>
            <textarea
              id="shot-note"
              rows={2}
              maxLength={500}
              required={intent.noteRequired}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={field}
            />
          </div>

          {!storageEnabled && (
            <p className="mt-3 text-[13px] text-mute">Photo storage isn&apos;t set up yet, so only this photo&apos;s fingerprint will be recorded.</p>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-flag/40 bg-flag/10 px-3 py-2 text-sm text-flag">
              {error}
            </p>
          )}

          <div className="mt-4 grid grid-cols-[auto_1fr] gap-3">
            <button type="button" onClick={onRetake} disabled={saving} className={button("secondary", "lg")}>
              Retake
            </button>
            <button type="button" onClick={save} disabled={saving} className={button("primary", "lg")}>
              {saving && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
              {saving ? "Recording" : intent.saveLabel}
            </button>
          </div>
          <button type="button" onClick={onCancel} disabled={saving} className="mt-3 w-full py-2 text-sm text-mute hover:text-white disabled:opacity-50">
            Discard this photo
          </button>
        </div>
      </div>
    </div>
  );
}
