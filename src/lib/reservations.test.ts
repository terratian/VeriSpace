import { describe, expect, it } from "vitest";
import { MAX_STAY_DAYS, resolveStay, stayFormSchema } from "./reservations";

const NY = "America/New_York";
const base = {
  checkInDate: "2026-10-24",
  checkInTime: "16:00",
  checkOutDate: "2026-10-27",
  checkOutTime: "11:00",
};

describe("resolveStay", () => {
  it("resolves wall-clock fields in the property's zone", () => {
    const r = resolveStay(base, NY);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.startsAt.toISOString()).toBe("2026-10-24T20:00:00.000Z");
      expect(r.endsAt.toISOString()).toBe("2026-10-27T15:00:00.000Z");
    }
  });

  it("gives the same wall-clock fields a different instant in another zone", () => {
    const r = resolveStay(base, "America/Los_Angeles");
    expect(r.ok && r.startsAt.toISOString()).toBe("2026-10-24T23:00:00.000Z");
  });

  it("allows a same-day stay as long as checkout is later", () => {
    expect(resolveStay({ ...base, checkOutDate: "2026-10-24", checkOutTime: "20:00" }, NY).ok).toBe(true);
  });

  it("rejects checkout at or before check-in", () => {
    expect(resolveStay({ ...base, checkOutDate: "2026-10-24", checkOutTime: "16:00" }, NY)).toMatchObject({ ok: false });
    expect(resolveStay({ ...base, checkOutDate: "2026-10-20" }, NY)).toMatchObject({ ok: false });
  });

  it("rejects a time the zone skips and says why", () => {
    const r = resolveStay({ ...base, checkInDate: "2027-03-14", checkInTime: "02:30", checkOutDate: "2027-03-16" }, NY);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/clocks skip forward/);
  });

  it("rejects absurdly long stays", () => {
    const r = resolveStay({ ...base, checkOutDate: "2028-10-27" }, NY);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain(String(MAX_STAY_DAYS));
  });
});

describe("stayFormSchema", () => {
  const valid = { propertyId: "00000000-0000-0000-0000-00000000000a", guestName: "  Jo Smith ", source: "airbnb", ...base };

  it("trims names and accepts known sources", () => {
    expect(stayFormSchema.parse(valid)).toMatchObject({ guestName: "Jo Smith", source: "airbnb" });
    expect(stayFormSchema.parse({ ...valid, guestName: "" }).guestName).toBe("");
  });

  it("rejects bad sources, dates, times and ids", () => {
    for (const bad of [
      { ...valid, source: "craigslist" },
      { ...valid, checkInDate: "10/24/2026" },
      { ...valid, checkInTime: "4pm" },
      { ...valid, propertyId: "nope" },
      { ...valid, guestName: "x".repeat(121) },
    ]) {
      expect(stayFormSchema.safeParse(bad).success).toBe(false);
    }
  });
});
