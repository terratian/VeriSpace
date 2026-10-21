import { describe, expect, it } from "vitest";
import { EMPTY_PROGRESS, canFinish, crewStatus, taskIntent } from "./capture";
import { payloadFor } from "./captureClient";
import { doneItemIds } from "./readiness";

const started = { ...EMPTY_PROGRESS, started: true, photos: 1 };

describe("finishing a room with tasks", () => {
  it("needs every task recorded", () => {
    expect(canFinish(started, 0)).toBe(true);
    expect(canFinish(started, 2)).toBe(false);
  });
  it("still needs a start and a photo", () => {
    expect(canFinish({ ...started, started: false }, 0)).toBe(false);
    expect(canFinish({ ...started, photos: 0 }, 0)).toBe(false);
  });
  it("is false once the room is finished", () => {
    expect(canFinish({ ...started, finished: true }, 0)).toBe(false);
  });
  it("behaves as before when a room has no tasks", () => {
    expect(canFinish(started)).toBe(true);
  });
});

describe("crew status", () => {
  it("shows task progress once work has begun", () => {
    expect(crewStatus({ ...EMPTY_PROGRESS, started: true }, { done: 1, total: 3 })).toEqual({ label: "1 of 3 tasks", tone: "amber" });
  });
  it("counts a recorded task as started even before Start cleaning", () => {
    expect(crewStatus(EMPTY_PROGRESS, { done: 1, total: 3 }).tone).toBe("amber");
  });
  it("falls back to plain labels without tasks", () => {
    expect(crewStatus(EMPTY_PROGRESS)).toEqual({ label: "Not started", tone: "neutral" });
    expect(crewStatus({ ...EMPTY_PROGRESS, started: true }, { done: 0, total: 0 })).toEqual({ label: "In progress", tone: "amber" });
    expect(crewStatus({ ...EMPTY_PROGRESS, finished: true }, { done: 3, total: 3 })).toEqual({ label: "Done", tone: "mint" });
  });
});

describe("task events", () => {
  it("puts the task id and label in the payload", () => {
    expect(payloadFor({ roomId: "r", eventType: "checklist_item", itemId: "i1", itemLabel: "Strip the beds" })).toEqual({
      itemId: "i1",
      label: "Strip the beds",
    });
  });
  it("caps a long label", () => {
    const payload = payloadFor({ roomId: "r", eventType: "checklist_item", itemId: "i1", itemLabel: "x".repeat(500) });
    expect((payload.label as string).length).toBe(160);
  });
  it("adds nothing for events that aren't tasks", () => {
    expect(payloadFor({ roomId: "r", eventType: "clean_start" })).toEqual({});
  });
  it("titles the camera with the task and trims a long one", () => {
    expect(taskIntent("Strip the beds")).toMatchObject({ eventType: "checklist_item", title: "Strip the beds", noteRequired: false });
    expect(taskIntent("y".repeat(100)).title.length).toBeLessThanOrEqual(60);
  });
});

describe("which tasks count as recorded", () => {
  const items = [
    { id: "a", requiresPhoto: false },
    { id: "b", requiresPhoto: true },
  ];
  const hash = "f".repeat(64);
  it("counts a task once however often it was recorded", () => {
    const events = [
      { event_type: "checklist_item", payload: { itemId: "a" }, frame_sha256: null },
      { event_type: "checklist_item", payload: { itemId: "a" }, frame_sha256: null },
    ];
    expect([...doneItemIds(items, events)]).toEqual(["a"]);
  });
  it("needs a photo fingerprint for a photo task", () => {
    const without = [{ event_type: "checklist_item", payload: { itemId: "b" }, frame_sha256: null }];
    const withPhoto = [{ event_type: "checklist_item", payload: { itemId: "b" }, frame_sha256: hash }];
    expect(doneItemIds(items, without).size).toBe(0);
    expect([...doneItemIds(items, withPhoto)]).toEqual(["b"]);
  });
  it("ignores ids that aren't tasks of this room and other event types", () => {
    const events = [
      { event_type: "checklist_item", payload: { itemId: "zzz" }, frame_sha256: null },
      { event_type: "photo_verified", payload: { itemId: "a" }, frame_sha256: hash },
      { event_type: "checklist_item", payload: null, frame_sha256: null },
    ];
    expect(doneItemIds(items, events).size).toBe(0);
  });
});

describe("manager baseline", () => {
  it("titles a feature photo and records it as a baseline", async () => {
    const { taskIntent, baselineStatus, EMPTY_PROGRESS } = await import("./capture");
    expect(taskIntent("Cedar hot tub", "baseline_photo", "Record baseline")).toMatchObject({ eventType: "baseline_photo", saveLabel: "Record baseline" });
    expect(baselineStatus(EMPTY_PROGRESS)).toEqual({ label: "No photos yet", tone: "neutral" });
    expect(baselineStatus({ ...EMPTY_PROGRESS, photos: 1 }, { done: 1, total: 2 })).toEqual({ label: "1 of 2 features", tone: "amber" });
    expect(baselineStatus({ ...EMPTY_PROGRESS, photos: 1 }, { done: 2, total: 2 })).toEqual({ label: "Baselined", tone: "mint" });
  });
});
