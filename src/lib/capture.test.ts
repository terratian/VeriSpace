import { describe, expect, it } from "vitest";
import {
  EMPTY_PROGRESS,
  INTENTS,
  applyAction,
  canFinish,
  crewStatus,
  formatBytes,
  guestStatus,
  parseProgress,
  progressKey,
  scaleToFit,
} from "./capture";
import { ROLE_EVENTS } from "./ledger";

describe("scaleToFit", () => {
  it("shrinks the long side and keeps the aspect ratio", () => {
    expect(scaleToFit(4000, 3000)).toEqual({ width: 2048, height: 1536 });
    expect(scaleToFit(3000, 4000)).toEqual({ width: 1536, height: 2048 });
  });
  it("never enlarges", () => {
    expect(scaleToFit(1280, 720)).toEqual({ width: 1280, height: 720 });
    expect(scaleToFit(2048, 1000)).toEqual({ width: 2048, height: 1000 });
  });
});

describe("formatBytes", () => {
  it("picks a readable unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("2 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("progress", () => {
  it("tracks a crew room from start to finish", () => {
    const key = progressKey("crew", "r1");
    let map = {};
    expect(canFinish(EMPTY_PROGRESS)).toBe(false);
    map = applyAction(map, key, "start");
    expect(canFinish((map as Record<string, typeof EMPTY_PROGRESS>)[key])).toBe(false); // no photo yet
    map = applyAction(map, key, "photo");
    const p = (map as Record<string, typeof EMPTY_PROGRESS>)[key];
    expect(canFinish(p)).toBe(true);
    expect(crewStatus(p)).toEqual({ label: "In progress", tone: "amber" });
    map = applyAction(map, key, "finish");
    const done = (map as Record<string, typeof EMPTY_PROGRESS>)[key];
    expect(canFinish(done)).toBe(false);
    expect(crewStatus(done)).toEqual({ label: "Done", tone: "mint" });
  });

  it("does not mutate the previous map", () => {
    const before = applyAction({}, "r1", "photo");
    const after = applyAction(before, "r1", "photo");
    expect(before.r1.photos).toBe(1);
    expect(after.r1.photos).toBe(2);
  });

  it("keeps arrival and departure separate for guests", () => {
    expect(progressKey("guest", "r1", "arrival")).not.toBe(progressKey("guest", "r1", "departure"));
    expect(guestStatus({ ...EMPTY_PROGRESS, photos: 1 })).toEqual({ label: "1 photo", tone: "mint" });
    expect(guestStatus({ ...EMPTY_PROGRESS, photos: 3 }).label).toBe("3 photos");
    expect(guestStatus(EMPTY_PROGRESS).tone).toBe("neutral");
  });

  it("parses saved progress defensively", () => {
    expect(parseProgress(null)).toEqual({});
    expect(parseProgress("not json")).toEqual({});
    expect(parseProgress("[1,2]")).toEqual({});
    expect(parseProgress('{"r1":{"started":true,"photos":2,"damage":-5,"finished":"yes"},"r2":7}')).toEqual({
      r1: { started: true, finished: false, photos: 2, damage: 0 },
    });
  });
});

describe("intents", () => {
  it("only use event types the matching role is allowed to write", () => {
    expect(ROLE_EVENTS.crew).toContain(INTENTS.crewPhoto.eventType);
    expect(ROLE_EVENTS.crew).toContain(INTENTS.crewDamage.eventType);
    expect(ROLE_EVENTS.guest).toContain(INTENTS.guestArrival.eventType);
    expect(ROLE_EVENTS.guest).toContain(INTENTS.guestDeparture.eventType);
    expect(ROLE_EVENTS.crew).toContain("clean_start");
    expect(ROLE_EVENTS.crew).toContain("clean_end");
  });
});
