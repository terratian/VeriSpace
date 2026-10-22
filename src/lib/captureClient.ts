import type { Shot } from "./capture";

/** A failed capture step, with wording that tells the person what to do. */
export class CaptureError extends Error {
  constructor(
    message: string,
    /** True when trying the same thing again may work. */
    readonly retryable: boolean,
    /** HTTP status, or 0 when the request never reached the server. */
    readonly status: number,
  ) {
    super(message);
  }
}

export interface RecordedEvent {
  id: number;
  seq: number;
  rowHash: string;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export function messageFor(status: number, serverMessage?: string): string {
  switch (status) {
    case 401:
      return "This link isn't valid any more. Ask the property manager for a new one.";
    case 403:
      return "This link doesn't allow that.";
    case 404:
      return "That room no longer exists.";
    case 409:
      return "The photo didn't finish uploading. Try again.";
    case 413:
      return "That photo is too large to upload. Retake it.";
    case 415:
      return "Only JPEG photos can be recorded. Retake it.";
    case 422:
      return serverMessage?.includes("fingerprint")
        ? "The photo changed while uploading. Retake it."
        : "Those details couldn't be recorded. Check them and try again.";
    case 503:
      return serverMessage ?? "The service isn't fully set up yet.";
    default:
      return "Something went wrong on our side. Try again in a moment.";
  }
}

async function send(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchFn(url, init);
  } catch {
    throw new CaptureError("No connection. Check your signal and try again.", true, 0);
  }
}

async function failure(res: Response): Promise<CaptureError> {
  let serverMessage: string | undefined;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
      serverMessage = (body as { error: string }).error;
    }
  } catch {
    // Not JSON: fall back to the status text below.
  }
  return new CaptureError(messageFor(res.status, serverMessage), res.status >= 500 || res.status === 409, res.status);
}

/** Send the photo to storage. "skipped" means this deployment keeps fingerprints only. */
export async function uploadShot(
  token: string,
  roomId: string,
  shot: Pick<Shot, "blob" | "sha256">,
  fetchFn: FetchFn = fetch,
): Promise<"stored" | "skipped"> {
  const res = await send(fetchFn, "/api/uploads", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "image/jpeg",
      "x-room-id": roomId,
      "x-frame-sha256": shot.sha256,
    },
    body: shot.blob,
  });
  if (res.status === 501) return "skipped";
  if (!res.ok) throw await failure(res);
  return "stored";
}

export interface EventInput {
  roomId: string;
  eventType: string;
  note?: string;
  /** The checklist task this entry records, for crew ticking off a room's tasks. */
  itemId?: string;
  itemLabel?: string;
  shot?: Pick<Shot, "sha256" | "width" | "height" | "blob" | "source">;
}

/** The ledger payload: only what describes the capture. The server adds the reservation. */
export function payloadFor(input: EventInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const note = input.note?.trim();
  if (note) payload.note = note.slice(0, 500);
  if (input.itemId) {
    payload.itemId = input.itemId;
    if (input.itemLabel) payload.label = input.itemLabel.slice(0, 160);
  }
  if (input.shot) {
    if (input.shot.width) payload.width = input.shot.width;
    if (input.shot.height) payload.height = input.shot.height;
    payload.bytes = input.shot.blob.size;
    payload.source = input.shot.source;
  }
  return payload;
}

let demoSeq = 0;
/** A stand-in for the ledger in the public demo: nothing is sent or saved. */
export async function demoEvent(): Promise<RecordedEvent> {
  await new Promise((r) => setTimeout(r, 250));
  demoSeq += 1;
  return { id: demoSeq, seq: demoSeq, rowHash: "0".repeat(64) };
}

export async function sendEvent(token: string, input: EventInput, fetchFn: FetchFn = fetch): Promise<RecordedEvent> {
  const res = await send(fetchFn, "/api/ledger", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      roomId: input.roomId,
      eventType: input.eventType,
      frameSha256: input.shot?.sha256,
      payload: payloadFor(input),
    }),
  });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as RecordedEvent;
}
