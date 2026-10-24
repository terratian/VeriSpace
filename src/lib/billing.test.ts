import { describe, expect, it } from "vitest";
import { accessFor, addMonths, billingStatus, type BillingProperty } from "./billing";

const d = (s: string) => new Date(s);
const p = (id: string, created: string, archived: string | null = null): BillingProperty => ({ id, createdAt: d(created), archivedAt: archived ? d(archived) : null });

describe("billingStatus", () => {
  it("costs nothing with no properties", () => expect(billingStatus([], d("2026-11-01")).monthlyCents).toBe(0));
  it("makes the first property free for three months", () => {
    const s = billingStatus([p("a", "2026-11-01T00:00:00Z")], d("2027-01-15"));
    expect(s).toMatchObject({ billableCount: 0, monthlyCents: 0, inFreeWindow: true, freePropertyId: "a" });
    expect(s.freeDaysLeft).toBe(17);
  });
  it("bills $9.99 once the free period ends", () => {
    expect(billingStatus([p("a", "2026-11-01T00:00:00Z")], d("2027-02-01T00:00:00Z"))).toMatchObject({ billableCount: 1, monthlyCents: 999, inFreeWindow: false });
  });
  it("bills every additional property from day one", () => {
    const s = billingStatus([p("a", "2026-11-01T00:00:00Z"), p("b", "2026-11-20T00:00:00Z"), p("c", "2026-12-01T00:00:00Z")], d("2026-12-15"));
    expect(s).toMatchObject({ activeCount: 3, billableCount: 2, monthlyCents: 1998 });
  });
  it("does not bill archived properties", () => {
    const s = billingStatus([p("a", "2026-01-01T00:00:00Z"), p("b", "2026-02-01T00:00:00Z", "2026-06-01T00:00:00Z")], d("2026-09-01"));
    expect(s).toMatchObject({ activeCount: 1, billableCount: 1 });
  });
  it("gives no second free period for archiving the first and adding another", () => {
    const s = billingStatus([p("a", "2026-11-01T00:00:00Z", "2026-11-10T00:00:00Z"), p("b", "2026-11-12T00:00:00Z")], d("2026-11-20"));
    expect(s).toMatchObject({ freePropertyId: "a", inFreeWindow: false, billableCount: 1 });
  });
  it("handles month ends", () => expect(addMonths(d("2026-11-30T00:00:00Z"), 3).toISOString()).toBe("2027-02-28T00:00:00.000Z"));
});

describe("accessFor", () => {
  it("never locks records, and gives a grace period", () => {
    expect(accessFor("free")).toBe("full");
    expect(accessFor("past_due", 5)).toBe("grace");
    expect(accessFor("past_due", 20)).toBe("read_only");
    expect(accessFor("canceled")).toBe("read_only");
  });
});
