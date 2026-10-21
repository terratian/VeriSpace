import { describe, expect, it } from "vitest";
import { computeReadiness, type ReadyEvent, type ReadyRoom } from "./readiness";

const HASH = "a".repeat(64);
const rooms: ReadyRoom[] = [
  { id: "r1", name: "Living room", items: [{ id: "i1", requiresPhoto: false }, { id: "i2", requiresPhoto: true }] },
  { id: "r2", name: "Kitchen", items: [] },
];
const ev = (room_id: string, event_type: string, payload: unknown = {}, frame_sha256: string | null = null): ReadyEvent => ({
  room_id,
  event_type,
  payload,
  frame_sha256,
});

describe("computeReadiness", () => {
  it("reports no rooms and not started", () => {
    expect(computeReadiness([], []).state).toBe("no_rooms");
    expect(computeReadiness(rooms, []).state).toBe("not_started");
  });

  it("is in progress until every room is finished and every task is recorded", () => {
    const events = [ev("r1", "clean_start"), ev("r1", "checklist_item", { itemId: "i1" }), ev("r2", "clean_end")];
    const result = computeReadiness(rooms, events);
    expect(result.state).toBe("in_progress");
    expect(result.rooms[0]).toMatchObject({ started: true, finished: false, itemsDone: 1, itemsTotal: 2, ready: false });
    expect(result.rooms[1]).toMatchObject({ finished: true, ready: true });
  });

  it("does not count a photo task without a photo fingerprint", () => {
    const events = [
      ev("r1", "checklist_item", { itemId: "i1" }),
      ev("r1", "checklist_item", { itemId: "i2" }),
      ev("r1", "clean_end"),
      ev("r2", "clean_end"),
    ];
    const result = computeReadiness(rooms, events);
    expect(result.rooms[0].itemsDone).toBe(1);
    expect(result.state).toBe("in_progress");
  });

  it("is ready when every room is finished with all tasks done", () => {
    const events = [
      ev("r1", "checklist_item", { itemId: "i1" }),
      ev("r1", "checklist_item", { itemId: "i2" }, HASH),
      ev("r1", "clean_end"),
      ev("r2", "clean_end"),
    ];
    expect(computeReadiness(rooms, events).state).toBe("ready");
  });

  it("counts a repeated task once and ignores unknown or malformed tasks", () => {
    const events = [
      ev("r1", "checklist_item", { itemId: "i1" }),
      ev("r1", "checklist_item", { itemId: "i1" }),
      ev("r1", "checklist_item", { itemId: "nope" }),
      ev("r1", "checklist_item", null),
      ev("r1", "checklist_item", { itemId: 7 }),
    ];
    expect(computeReadiness(rooms, events).rooms[0].itemsDone).toBe(1);
  });

  it("counts damage reports without blocking readiness", () => {
    const events = [ev("r2", "damage_report", { note: "chip" }), ev("r2", "clean_end"), ev("r1", "clean_end")];
    const result = computeReadiness([rooms[1]], events.filter((e) => e.room_id === "r2"));
    expect(result.damage).toBe(1);
    expect(result.state).toBe("ready");
  });
});
