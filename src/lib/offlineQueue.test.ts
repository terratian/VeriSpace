import { describe, expect, it, vi } from "vitest";
import { CaptureError } from "./captureClient";
import { enqueue, flushQueue, memoryStore } from "./offlineQueue";

const input = { roomId: "r", eventType: "clean_start" };
const photo = { roomId: "r", eventType: "photo_verified", shot: { sha256: "a".repeat(64), blob: new Blob(["x"]), source: "camera" as const, width: 1, height: 1 } };
const ok = { id: 1, seq: 1, rowHash: "h" };

describe("offline queue", () => {
  it("marks queued entries with the phone's capture time", async () => {
    const store = memoryStore();
    const item = await enqueue(store, "tok", input, new Date("2026-10-24T01:02:03Z"));
    expect(item.input.extra).toMatchObject({ capturedAt: "2026-10-24T01:02:03.000Z", queued: true });
  });
  it("sends in order, uploading photos first, and clears what was sent", async () => {
    const store = memoryStore();
    await enqueue(store, "tok", photo, new Date(1));
    await enqueue(store, "tok", input, new Date(2));
    const calls: string[] = [];
    const r = await flushQueue(store, { upload: vi.fn(async () => (calls.push("upload"), "stored" as const)), send: vi.fn(async (_t, i) => (calls.push(i.eventType), ok)) });
    expect(calls).toEqual(["upload", "photo_verified", "clean_start"]);
    expect(r).toEqual({ sent: 2, waiting: 0, failed: 0 });
    expect(await store.all()).toHaveLength(0);
  });
  it("keeps everything and stops when there is still no signal", async () => {
    const store = memoryStore();
    await enqueue(store, "tok", input, new Date(1));
    await enqueue(store, "tok", input, new Date(2));
    const send = vi.fn(async () => { throw new CaptureError("No connection", true, 0); });
    const r = await flushQueue(store, { upload: vi.fn(), send });
    expect(send).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ sent: 0, waiting: 2, failed: 0 });
  });
  it("sets aside an entry the server rejects and carries on", async () => {
    const store = memoryStore();
    await enqueue(store, "tok", input, new Date(1));
    await enqueue(store, "tok", input, new Date(2));
    let n = 0;
    const send = vi.fn(async () => { if (n++ === 0) throw new CaptureError("This link isn't valid any more.", false, 401); return ok; });
    const r = await flushQueue(store, { upload: vi.fn(), send });
    expect(r).toEqual({ sent: 1, waiting: 0, failed: 1 });
    expect((await store.all())[0]).toMatchObject({ state: "failed", error: "This link isn't valid any more." });
  });
});
