import { CaptureError, sendEvent, uploadShot, type EventInput } from "./captureClient";

/**
 * Entries that couldn't be sent for lack of signal, kept on the phone and sent when it's back.
 * Photos are fingerprinted on the phone when taken, so the fingerprint is already fixed. The ledger
 * stamps the time it receives each entry; the time the phone says it was taken is kept in the entry
 * as `capturedAt`, marked `queued`, so the two are never confused.
 */

export interface QueuedItem {
  id: string;
  token: string;
  input: EventInput;
  queuedAt: string;
  state: "waiting" | "failed";
  error?: string;
}

export interface QueueStore {
  all(): Promise<QueuedItem[]>;
  put(item: QueuedItem): Promise<void>;
  remove(id: string): Promise<void>;
}

export function memoryStore(): QueueStore {
  const m = new Map<string, QueuedItem>();
  return {
    all: async () => [...m.values()].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt)),
    put: async (i) => void m.set(i.id, i),
    remove: async (id) => void m.delete(id),
  };
}

const DB = "verispace-queue";
const STORE = "items";

/** IndexedDB-backed store, or null where the browser doesn't allow it. */
export function idbStore(): QueueStore | null {
  if (typeof indexedDB === "undefined") return null;
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const run = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };
  return {
    all: async () => ((await run("readonly", (s) => s.getAll())) as QueuedItem[]).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt)),
    put: async (i) => void (await run("readwrite", (s) => s.put(i))),
    remove: async (id) => void (await run("readwrite", (s) => s.delete(id))),
  };
}

/** What an entry looks like once queued: keeps only what's needed to send it, and marks it. */
export function queuedInput(input: EventInput, now = new Date()): EventInput {
  return {
    ...input,
    shot: input.shot ? { sha256: input.shot.sha256, width: input.shot.width, height: input.shot.height, blob: input.shot.blob, source: input.shot.source } : undefined,
    extra: { ...input.extra, capturedAt: now.toISOString(), queued: true },
  };
}

export async function enqueue(store: QueueStore, token: string, input: EventInput, now = new Date()): Promise<QueuedItem> {
  const item: QueuedItem = { id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`, token, input: queuedInput(input, now), queuedAt: now.toISOString(), state: "waiting" };
  await store.put(item);
  return item;
}

export interface FlushDeps {
  upload: typeof uploadShot;
  send: typeof sendEvent;
}
let flushing = false;

/** Send waiting entries in order. Stops at the first one that fails for lack of signal. */
export async function flushQueue(store: QueueStore, deps: FlushDeps = { upload: uploadShot, send: sendEvent }): Promise<{ sent: number; waiting: number; failed: number }> {
  if (flushing) return { sent: 0, waiting: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  try {
    for (const item of (await store.all()).filter((i) => i.state === "waiting")) {
      try {
        if (item.input.shot) await deps.upload(item.token, item.input.roomId, item.input.shot);
        await deps.send(item.token, item.input);
        await store.remove(item.id);
        sent++;
      } catch (err) {
        if (err instanceof CaptureError && err.retryable) break;
        await store.put({ ...item, state: "failed", error: err instanceof CaptureError ? err.message : "Couldn't be sent." });
      }
    }
  } finally {
    flushing = false;
  }
  const rest = await store.all();
  return { sent, waiting: rest.filter((i) => i.state === "waiting").length, failed: rest.filter((i) => i.state === "failed").length };
}
