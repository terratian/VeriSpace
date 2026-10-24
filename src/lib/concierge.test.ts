import { describe, expect, it } from "vitest";
import { searchAssets, stageFor } from "./concierge";

const at = (s: string) => new Date(s);
const start = at("2026-11-10T21:00:00Z");
const end = at("2026-11-13T16:00:00Z");

describe("stageFor", () => {
  it("is check in before and just after arrival", () => {
    expect(stageFor(at("2026-11-09T12:00:00Z"), start, end)).toBe("checkin");
    expect(stageFor(at("2026-11-10T23:00:00Z"), start, end)).toBe("checkin");
  });
  it("is the stay in between", () => expect(stageFor(at("2026-11-11T20:00:00Z"), start, end)).toBe("during"));
  it("is checkout for the last twelve hours", () => {
    expect(stageFor(at("2026-11-13T05:00:00Z"), start, end)).toBe("checkout");
    expect(stageFor(at("2026-11-13T03:00:00Z"), start, end)).toBe("during");
  });
  it("copes with an unknown stay", () => {
    expect(stageFor(at("2026-11-11T20:00:00Z"), null, null)).toBe("checkin");
    expect(stageFor(at("2026-11-11T20:00:00Z"), null, end)).toBe("during");
  });
});

describe("searchAssets", () => {
  const a = [
    { id: "1", name: "Cedar hot tub", roomId: "r1", roomName: "Deck", kind: "hot_tub" },
    { id: "2", name: "Smart TV", roomId: "r2", roomName: "Living room", kind: "tv" },
  ];
  it("matches name, kind and room, all words", () => {
    expect(searchAssets(a, "tub").map((x) => x.id)).toEqual(["1"]);
    expect(searchAssets(a, "hot tub deck").map((x) => x.id)).toEqual(["1"]);
    expect(searchAssets(a, "living tv").map((x) => x.id)).toEqual(["2"]);
    expect(searchAssets(a, "")).toHaveLength(2);
    expect(searchAssets(a, "pool")).toHaveLength(0);
  });
});
