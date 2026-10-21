import { describe, expect, it } from "vitest";
import { addDays, calendarDays, dayCells, dayKeyInZone, occupancyPercent, weekCounts } from "./overview";

describe("day keys", () => {
  it("uses the property's own zone", () => {
    expect(dayKeyInZone("2026-10-22T02:00:00Z", "America/New_York")).toBe("2026-10-21");
    expect(dayKeyInZone("2026-10-22T02:00:00Z", "UTC")).toBe("2026-10-22");
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(calendarDays("2026-02-27", 3)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });
});

describe("calendar cells", () => {
  const days = calendarDays("2026-10-20", 6);
  const stays = [{ startsAt: "2026-10-21T20:00:00Z", endsAt: "2026-10-23T15:00:00Z" }];
  it("marks arrival, occupied, departure and vacant", () => {
    expect(dayCells(stays, "UTC", days).map((c) => c.state)).toEqual(["vacant", "arrival", "occupied", "departure", "vacant", "vacant"]);
  });
  it("counts nights, not the departure day", () => {
    expect(dayCells(stays, "UTC", days).map((c) => c.night)).toEqual([false, true, true, false, false, false]);
  });
  it("marks a same-day changeover as a turn", () => {
    const back = [...stays, { startsAt: "2026-10-23T20:00:00Z", endsAt: "2026-10-25T15:00:00Z" }];
    expect(dayCells(back, "UTC", days)[3].state).toBe("turn");
  });
});

describe("headline numbers", () => {
  it("computes occupancy as a percent of property-nights", () => {
    const row = dayCells([{ startsAt: "2026-10-20T20:00:00Z", endsAt: "2026-10-22T10:00:00Z" }], "UTC", calendarDays("2026-10-20", 4));
    expect(occupancyPercent([row])).toBe(50);
    expect(occupancyPercent([])).toBe(0);
  });
  it("counts arrivals, departures and turns in the first week", () => {
    const days = calendarDays("2026-10-20", 14);
    const row = dayCells(
      [
        { startsAt: "2026-10-20T20:00:00Z", endsAt: "2026-10-22T10:00:00Z" },
        { startsAt: "2026-10-22T20:00:00Z", endsAt: "2026-10-24T10:00:00Z" },
        { startsAt: "2026-10-30T20:00:00Z", endsAt: "2026-11-01T10:00:00Z" },
      ],
      "UTC",
      days,
    );
    expect(weekCounts([row])).toEqual({ arrivals: 2, departures: 2, turns: 1 });
  });
});
