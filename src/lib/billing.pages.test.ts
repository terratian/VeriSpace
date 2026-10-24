import { describe, expect, it } from "vitest";
import { billingStatus, PRICE_CENTS_PER_PROPERTY } from "./billing";
import { money } from "../components/PricingBreakdown";

// The worked examples shown on /pricing and the landing page must match the rules in billing.ts.
describe("pricing page examples", () => {
  const at = (months: number) => new Date(Date.UTC(2026, 0 + months, 15));
  const props = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, createdAt: new Date(Date.UTC(2026, 0, 15, i)), archivedAt: null }));
  it("1 property is free in month 2 and $9.99 from month 4", () => {
    expect(money(billingStatus(props(1), at(1)).monthlyCents)).toBe("$0.00");
    expect(money(billingStatus(props(1), at(4)).monthlyCents)).toBe("$9.99");
  });
  it("3 properties cost $19.98 in the free period and $29.97 after", () => {
    expect(money(billingStatus(props(3), at(1)).monthlyCents)).toBe("$19.98");
    expect(money(billingStatus(props(3), at(5)).monthlyCents)).toBe("$29.97");
  });
  it("archiving the free property does not earn a second free period", () => {
    const all = [{ ...props(1)[0], archivedAt: at(1) }, { id: "new", createdAt: at(2), archivedAt: null }];
    expect(billingStatus(all, at(2)).monthlyCents).toBe(PRICE_CENTS_PER_PROPERTY);
  });
});
