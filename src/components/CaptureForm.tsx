"use client";

import { useState } from "react";
import { hashFrame } from "@/lib/frameHasher";

export interface RoomOption {
  id: string;
  name: string;
}
export interface EventOption {
  value: string;
  label: string;
}

type Status =
  | { state: "idle" }
  | { state: "hashing" }
  | { state: "sending" }
  | { state: "done"; seq: number; rowHash: string }
  | { state: "error"; message: string };

/**
 * Snap-to-verify: the photo is hashed on this device (SHA-256) and only the hash is
 * recorded to the ledger. Storing the raw frame itself is a later milestone.
 */
export default function CaptureForm(props: {
  token: string;
  rooms: RoomOption[];
  events: EventOption[];
}) {
  const [roomId, setRoomId] = useState(props.rooms[0]?.id ?? "");
  const [eventType, setEventType] = useState(props.events[0]?.value ?? "");
  const [note, setNote] = useState("");
  const [hash, setHash] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ state: "idle" });

  async function onPhoto(file: File | undefined) {
    setHash(null);
    if (!file) return;
    setStatus({ state: "hashing" });
    try {
      setHash(await hashFrame(file));
      setStatus({ state: "idle" });
    } catch {
      setStatus({ state: "error", message: "Could not read that photo." });
    }
  }

  async function submit() {
    setStatus({ state: "sending" });
    try {
      const res = await fetch("/api/ledger", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${props.token}` },
        body: JSON.stringify({
          roomId,
          eventType,
          frameSha256: hash ?? undefined,
          payload: note ? { note } : {},
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "request failed");
      setStatus({ state: "done", seq: body.seq, rowHash: body.rowHash });
      setHash(null);
      setNote("");
    } catch (err) {
      setStatus({ state: "error", message: err instanceof Error ? err.message : "request failed" });
    }
  }

  const busy = status.state === "hashing" || status.state === "sending";
  const field = "w-full rounded-lg border border-line bg-panel px-3 py-2 text-white";

  return (
    <div className="space-y-5">
      <label className="block text-sm">
        Room
        <select className={field} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          {props.rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        Event
        <select className={field} value={eventType} onChange={(e) => setEventType(e.target.value)}>
          {props.events.map((e) => (
            <option key={e.value} value={e.value}>{e.label}</option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        Photo
        <input
          className={field}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => onPhoto(e.target.files?.[0])}
        />
      </label>
      {hash && (
        <p className="break-all font-mono text-xs text-mint">SHA-256 {hash}</p>
      )}

      <label className="block text-sm">
        Note (optional)
        <input className={field} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </label>

      <button
        onClick={submit}
        disabled={busy || !roomId || !eventType}
        className="w-full rounded-xl bg-mint px-4 py-3 font-bold text-obsidian disabled:opacity-50"
      >
        {status.state === "sending" ? "Recording…" : "Record to ledger"}
      </button>

      {status.state === "done" && (
        <p className="rounded-lg border border-mint/40 bg-mint/10 p-3 text-sm text-mint">
          Recorded as entry #{status.seq}. <span className="font-mono text-xs">{status.rowHash.slice(0, 16)}…</span>
        </p>
      )}
      {status.state === "error" && (
        <p role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-300">
          {status.message}
        </p>
      )}
    </div>
  );
}
