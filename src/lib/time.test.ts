import { describe, expect, it } from "vitest";
import {
  fmtClock,
  fmtDateTime,
  isValidTimeZone,
  nightsBetween,
  stayStatus,
  timeAgo,
  zonedToUtc,
  zoneAbbreviation,
} from "./time";

const NY = "America/New_York";

describe("zonedToUtc", () => {
  it("converts summer time (EDT, UTC-4)", () => {
    expect(zonedToUtc("2026-10-20", "16:00", NY)?.toISOString()).toBe("2026-10-20T20:00:00.000Z");
  });

  it("converts winter time (EST, UTC-5)", () => {
    expect(zonedToUtc("2026-11-02", "11:00", NY)?.toISOString()).toBe("2026-11-02T16:00:00.000Z");
  });

  it("handles zones east of UTC and half-hour offsets", () => {
    expect(zonedToUtc("2026-10-20", "16:00", "Europe/Paris")?.toISOString()).toBe("2026-10-20T14:00:00.000Z");
    expect(zonedToUtc("2026-10-20", "16:00", "Asia/Kolkata")?.toISOString()).toBe("2026-10-20T10:30:00.000Z");
  });

  it("handles a zone with no daylight saving", () => {
    expect(zonedToUtc("2026-07-01", "12:00", "America/Phoenix")?.toISOString()).toBe("2026-07-01T19:00:00.000Z");
  });

  it("rejects a time skipped by the spring-forward jump", () => {
    expect(zonedToUtc("2026-03-08", "02:30", NY)).toBeNull();
    expect(zonedToUtc("2026-03-08", "03:30", NY)?.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("resolves the repeated fall-back hour to its first occurrence", () => {
    expect(zonedToUtc("2026-11-01", "01:30", NY)?.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("handles a check-in before and a check-out after the November change", () => {
    const start = zonedToUtc("2026-10-31", "16:00", NY)!;
    const end = zonedToUtc("2026-11-02", "11:00", NY)!;
    // Oct 31 16:00 EDT to Nov 2 11:00 EST: 44 real hours, because the clocks fall back once.
    expect(start.toISOString()).toBe("2026-10-31T20:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-02T16:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(44 * 3600_000);
    expect(nightsBetween(start, end, NY)).toBe(2);
  });

  it("rejects malformed input, impossible dates, and unknown zones", () => {
    expect(zonedToUtc("2026-02-31", "10:00", NY)).toBeNull();
    expect(zonedToUtc("2026-13-01", "10:00", NY)).toBeNull();
    expect(zonedToUtc("20261020", "10:00", NY)).toBeNull();
    expect(zonedToUtc("2026-10-20", "25:00", NY)).toBeNull();
    expect(zonedToUtc("2026-10-20", "10:00", "Mars/Olympus")).toBeNull();
  });

  it("round-trips through the formatter", () => {
    const utc = zonedToUtc("2026-12-25", "09:15", "America/Los_Angeles")!;
    expect(fmtClock(utc, "America/Los_Angeles")).toBe("9:15 AM");
  });
});

describe("formatting", () => {
  it("formats in the property's zone, not the server's", () => {
    const instant = new Date("2026-10-20T20:00:00Z");
    expect(fmtDateTime(instant, NY)).toBe("Tue, Oct 20, 4:00 PM EDT");
    expect(fmtDateTime(instant, "America/Los_Angeles")).toBe("Tue, Oct 20, 1:00 PM PDT");
    expect(zoneAbbreviation(instant, NY)).toBe("EDT");
  });

  it("counts nights on the wall clock across a DST change", () => {
    const start = zonedToUtc("2026-10-30", "16:00", NY)!;
    const end = zonedToUtc("2026-11-03", "11:00", NY)!;
    expect(nightsBetween(start, end, NY)).toBe(4);
  });

  it("validates zone names", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("stayStatus and timeAgo", () => {
  const start = new Date("2026-10-20T20:00:00Z");
  const end = new Date("2026-10-23T15:00:00Z");

  it("classifies stays relative to now", () => {
    expect(stayStatus(new Date("2026-10-20T19:59:59Z"), start, end)).toBe("upcoming");
    expect(stayStatus(start, start, end)).toBe("in-house");
    expect(stayStatus(end, start, end)).toBe("past");
  });

  it("describes recency", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(timeAgo(new Date("2026-10-20T11:59:30Z"), now)).toBe("just now");
    expect(timeAgo(new Date("2026-10-20T11:50:00Z"), now)).toBe("10 min ago");
    expect(timeAgo(new Date("2026-10-20T09:00:00Z"), now)).toBe("3 hr ago");
    expect(timeAgo(new Date("2026-10-18T12:00:00Z"), now)).toBe("2 days ago");
    expect(timeAgo(new Date("2026-10-19T12:00:00Z"), now)).toBe("1 day ago");
  });
});
