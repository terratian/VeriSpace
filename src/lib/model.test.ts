import { describe, expect, it } from "vitest";
import { featureSchema, featureStatuses, layoutSchema, listingSummary, placeRooms, stateOf, toFeet } from "./model";

const room = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id, width: null, length: null, height: null, floor: 0, planX: null, planY: null, ...over });

describe("placeRooms", () => {
  it("keeps saved positions", () => {
    const [r] = placeRooms([room("a", { planX: 10, planY: 5, width: 3, length: 2 })]);
    expect(r).toMatchObject({ x: 10, y: 5, w: 3, d: 2 });
  });
  it("packs unplaced rooms left to right, then wraps to a new row", () => {
    const placed = placeRooms([room("a", { width: 6, length: 4 }), room("b", { width: 6, length: 3 }), room("c", { width: 6, length: 5 })]);
    expect(placed[0].x).toBe(0);
    expect(placed[1].x).toBeCloseTo(6.4);
    expect(placed[2].x).toBe(0);
    expect(placed[2].y).toBeCloseTo(4.4);
  });
  it("packs each floor on its own", () => {
    const placed = placeRooms([room("a"), room("b", { floor: 1 })]);
    expect(placed[1].x).toBe(0);
    expect(placed[1].floor).toBe(1);
  });
  it("uses a default size when none is set", () => {
    expect(placeRooms([room("a")])[0]).toMatchObject({ w: 4, d: 4, h: 2.7 });
  });
});

describe("feature status from the ledger", () => {
  const ev = (featureId: string, status: string, note = "") => ({ event_type: "feature_status", payload: { featureId, status, note } });
  it("takes the latest entry per feature", () => {
    const s = featureStatuses([ev("f1", "out_of_service", "pump"), ev("f2", "degraded"), ev("f1", "working")]);
    expect(stateOf(s, "f1").status).toBe("working");
    expect(stateOf(s, "f2").status).toBe("degraded");
  });
  it("defaults to working", () => {
    expect(stateOf(featureStatuses([]), "nope")).toEqual({ status: "working", note: "" });
  });
  it("ignores other events and malformed payloads", () => {
    const s = featureStatuses([
      { event_type: "clean_end", payload: { featureId: "f1", status: "out_of_service" } },
      ev("f1", "exploded"),
      { event_type: "feature_status", payload: null },
    ]);
    expect(s.size).toBe(0);
  });
});

describe("listing summary", () => {
  const f = (id: string, advertised = true) => ({ id, name: id, kind: "hot_tub" as const, room: "Deck", advertised });
  it("splits advertised features by current status and skips hidden ones", () => {
    const statuses = featureStatuses([
      { event_type: "feature_status", payload: { featureId: "tub", status: "out_of_service", note: "pump" } },
      { event_type: "feature_status", payload: { featureId: "fire", status: "degraded" } },
    ]);
    const s = listingSummary([f("tub"), f("fire"), f("tv"), f("sensor", false)], statuses);
    expect(s.unavailable.map((x) => x.feature.id)).toEqual(["tub"]);
    expect(s.unavailable[0].note).toBe("pump");
    expect(s.limited.map((x) => x.feature.id)).toEqual(["fire"]);
    expect(s.available.map((x) => x.feature.id)).toEqual(["tv"]);
  });
});

describe("forms", () => {
  const id = "00000000-0000-0000-0000-0000000000a1";
  it("treats blank layout fields as not set", () => {
    const r = layoutSchema.parse({ roomId: id, width: "12", length: "", height: "", floor: "", planX: "", planY: "" });
    expect(r).toMatchObject({ width: 12, length: null, height: null, floor: 0, planX: null });
  });
  it("rejects absurd sizes and fractional floors", () => {
    expect(layoutSchema.safeParse({ roomId: id, width: "9999" }).success).toBe(false);
    expect(layoutSchema.safeParse({ roomId: id, floor: "1.5" }).success).toBe(false);
  });
  it("validates a feature", () => {
    expect(featureSchema.safeParse({ roomId: id, kind: "hot_tub", name: "Hot tub", x: "0.3", y: "0.8", advertised: true, details: "" }).success).toBe(true);
    expect(featureSchema.safeParse({ roomId: id, kind: "rocket", name: "x", x: 0, y: 0, advertised: true, details: "" }).success).toBe(false);
    expect(featureSchema.safeParse({ roomId: id, kind: "tv", name: "  ", x: 0, y: 0, advertised: true, details: "" }).success).toBe(false);
    expect(featureSchema.safeParse({ roomId: id, kind: "tv", name: "TV", x: 2, y: 0, advertised: true, details: "" }).success).toBe(false);
  });
  it("converts meters to feet for the form", () => {
    expect(toFeet(3.048)).toBe(10);
    expect(toFeet(null)).toBeNull();
  });
});
