import { describe, expect, it } from "vitest";
import { linkEmail, linkSms } from "./linkMessages";

const base = { name: "Maya Lopez", propertyName: "Cedar Hollow", url: "https://x.test/guest/abc", until: "Oct 26, 11:00 AM" };
describe("link messages", () => {
  it("greets by first name and carries the link and an opt-out", () => {
    const t = linkSms({ ...base, role: "guest" });
    expect(t).toContain("Hi Maya, welcome to Cedar Hollow");
    expect(t).toContain("https://x.test/guest/abc");
    expect(t).toContain("STOP");
    expect(t).toContain("VeriStay");
  });
  it("names the crew module and works without a name", () => {
    const t = linkSms({ ...base, role: "crew", name: null });
    expect(t).toContain("VeriService");
    expect(t.startsWith("Turnover")).toBe(true);
  });
  it("writes a matching email", () => {
    expect(linkEmail({ ...base, role: "guest" }).subject).toBe("Your stay at Cedar Hollow");
    expect(linkEmail({ ...base, role: "crew" }).text).toContain("VeriService");
  });
});
