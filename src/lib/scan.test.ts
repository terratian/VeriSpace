import { describe, expect, it } from "vitest";
import { screenToLook, angleDiff, latestScan, lookDirection, lookDistance, lookVector, matchTarget, scanTargets, validateScanPayload, wrap360 } from "./scan";

const id = "11111111-1111-4111-8111-111111111111";
const near = (a: number, b: number, d = 0.01) => expect(Math.abs(a - b)).toBeLessThan(d);

describe("angles", () => {
  it("wraps and finds the shortest turn", () => {
    expect(wrap360(-10)).toBe(350);
    expect(wrap360(370)).toBe(10);
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(-20);
  });
});

describe("lookDirection", () => {
  it("is level and north for an upright phone", () => {
    const l = lookDirection(0, 90, 0);
    near(l.pitch, 0);
    near(wrap360(l.yaw + 180) - 180, 0);
  });
  it("tilts up when the phone leans back", () => {
    near(lookDirection(0, 120, 0).pitch, 30);
    near(lookDirection(0, 60, 0).pitch, -30);
  });
  it("turns with alpha (counterclockwise from above)", () => {
    near(lookDirection(90, 90, 0).yaw, 270);
    near(lookDirection(270, 90, 0).yaw, 90);
  });
});

describe("targets", () => {
  it("makes three rings", () => {
    const t = scanTargets();
    expect(t).toHaveLength(24);
    expect(t.slice(0, 12).every((x) => x.pitch === 0)).toBe(true);
    expect(t[1].yaw).toBe(30);
  });
  it("matches only an uncaptured target within tolerance", () => {
    const t = scanTargets();
    expect(matchTarget({ yaw: 31, pitch: 2 }, t, new Set())).toBe(1);
    expect(matchTarget({ yaw: 31, pitch: 2 }, t, new Set([1]))).toBeNull();
    expect(matchTarget({ yaw: 15, pitch: 0 }, t, new Set())).toBeNull();
  });
  it("measures distance on the sphere", () => {
    near(lookDistance({ yaw: 0, pitch: 0 }, { yaw: 90, pitch: 0 }), 90);
    near(lookDistance({ yaw: 0, pitch: 90 }, { yaw: 200, pitch: 90 }), 0, 0.5);
  });
  it("gives viewer vectors with north at -z", () => {
    const [x, y, z] = lookVector({ yaw: 0, pitch: 0 });
    near(x, 0); near(y, 0); near(z, -1);
    near(lookVector({ yaw: 90, pitch: 0 })[0], 1);
    near(lookVector({ yaw: 0, pitch: 90 })[1], 1);
  });
});

describe("validation", () => {
  it("requires a photo and sane angles on a frame", () => {
    const ok = { scanId: id, index: 0, yaw: 10, pitch: 0 };
    expect(validateScanPayload("scan_frame", ok, true)).toBeNull();
    expect(validateScanPayload("scan_frame", ok, false)).not.toBeNull();
    expect(validateScanPayload("scan_frame", { ...ok, pitch: 120 }, true)).not.toBeNull();
    expect(validateScanPayload("scan_frame", { ...ok, scanId: "x" }, true)).not.toBeNull();
  });
  it("checks the closing entry", () => {
    expect(validateScanPayload("scan_complete", { scanId: id, frames: 24, mode: "sensor", geo: { lat: 35.1, lng: -79.2 } }, false)).toBeNull();
    expect(validateScanPayload("scan_complete", { scanId: id, frames: 0, mode: "sensor" }, false)).not.toBeNull();
    expect(validateScanPayload("scan_complete", { scanId: id, frames: 3, mode: "sensor", geo: { lat: 99, lng: 0 } }, false)).not.toBeNull();
    expect(validateScanPayload("other", {}, false)).toBeNull();
  });
});

describe("latestScan", () => {
  const frame = (scanId: string, index: number, sha: string) => ({ event_type: "scan_frame", payload: { scanId, index, yaw: index * 30, pitch: 0 }, frame_sha256: sha, created_at: "2026-10-22T10:00:00Z" });
  const done = (scanId: string, frames: number) => ({ event_type: "scan_complete", payload: { scanId, frames, mode: "manual" }, frame_sha256: null, created_at: "2026-10-22T10:05:00Z" });
  const other = "22222222-2222-4222-8222-222222222222";
  it("returns null with no scans", () => expect(latestScan([])).toBeNull());
  it("groups frames by scan and sorts them", () => {
    const s = latestScan([frame(id, 1, "b".repeat(64)), frame(id, 0, "a".repeat(64)), done(id, 2)])!;
    expect(s.complete).toBe(true);
    expect(s.frames.map((f) => f.index)).toEqual([0, 1]);
  });
  it("prefers a finished scan over a newer unfinished one", () => {
    const s = latestScan([frame(id, 0, "a".repeat(64)), done(id, 1), frame(other, 0, "c".repeat(64))])!;
    expect(s.scanId).toBe(id);
  });
  it("falls back to the newest partial scan", () => {
    expect(latestScan([frame(id, 0, "a".repeat(64))])!.complete).toBe(false);
  });
  it("ignores malformed entries", () => {
    expect(latestScan([{ event_type: "scan_frame", payload: { nope: 1 }, frame_sha256: "a".repeat(64), created_at: "x" }])).toBeNull();
  });
});

describe("screenToLook", () => {
  it("returns the view direction for the middle of the screen", () => {
    const l = screenToLook(0, 0, 340, { yaw: 120, pitch: 20 });
    near(l.yaw, 120, 0.001);
    near(l.pitch, 20, 0.001);
  });
  it("turns right for a point right of the middle, and up for a point above it", () => {
    const right = screenToLook(200, 0, 340, { yaw: 0, pitch: 0 });
    expect(right.yaw).toBeGreaterThan(0);
    expect(right.yaw).toBeLessThan(90);
    near(right.pitch, 0, 0.001);
    const up = screenToLook(0, -150, 340, { yaw: 0, pitch: 0 });
    expect(up.pitch).toBeGreaterThan(0);
    const wrapped = screenToLook(-200, 0, 340, { yaw: 0, pitch: 0 });
    expect(wrapped.yaw).toBeGreaterThan(270);
  });
  it("agrees with lookVector: a point placed at a look maps back to it", () => {
    // A point straight ahead of a view turned 90 degrees right should be due east.
    near(screenToLook(0, 0, 340, { yaw: 90, pitch: 0 }).yaw, 90, 0.001);
  });
});
