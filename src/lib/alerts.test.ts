import { describe, expect, it, vi } from "vitest";
import { alertText, alertWorthy, sendAlerts } from "./alerts";

const ctx = { propertyName: "Cabin", roomName: "Den", eventType: "issue_reported", note: "Smoke alarm beeping", category: "safety", byRole: "guest", link: "https://x.test/p" };
const env = { RESEND_API_KEY: "rk", ALERT_FROM_EMAIL: "VeriSpace <a@x.test>", PLIVO_AUTH_ID: "id", PLIVO_AUTH_TOKEN: "tok", PLIVO_FROM: "15550001111" };

describe("alerts", () => {
  it("alerts on problems and on a guest saying the room is not as shown, not on routine entries", () => {
    expect(alertWorthy("issue_reported", {})).toBe(true);
    expect(alertWorthy("damage_report", {})).toBe(true);
    expect(alertWorthy("condition_ack", { agrees: false })).toBe(true);
    expect(alertWorthy("condition_ack", { agrees: true })).toBe(false);
    expect(alertWorthy("clean_end", {})).toBe(false);
  });
  it("marks safety problems", () => {
    const t = alertText(ctx);
    expect(t.subject).toMatch(/^Safety:/);
    expect(t.sms).toContain("SAFETY");
    expect(t.body).toContain("Smoke alarm beeping");
    expect(t.sms.length).toBeLessThanOrEqual(300);
  });
  it("sends email and text when configured", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    const r = await sendAlerts(ctx, { email: "o@x.test", phone: "+15551234567" }, f, env);
    expect(r).toEqual({ email: "sent", sms: "sent" });
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe("https://api.resend.com/emails");
    expect(calls[1][0]).toContain("api.plivo.com/v1/Account/id/Message/");
    expect(JSON.parse(calls[1][1].body as string).dst).toBe("15551234567");
  });
  it("skips channels without keys or contacts, and rejects a malformed number", async () => {
    const f = vi.fn();
    expect(await sendAlerts(ctx, { email: "o@x.test", phone: "+15551234567" }, f, {})).toEqual({ email: "skipped", sms: "skipped" });
    expect(await sendAlerts(ctx, { phone: "555-1234" }, f, env)).toEqual({ email: "skipped", sms: "skipped" });
    expect(f).not.toHaveBeenCalled();
  });
  it("reports a failed delivery without throwing", async () => {
    const r = await sendAlerts(ctx, { email: "o@x.test", phone: "+15551234567" }, async () => { throw new Error("down"); }, env);
    expect(r).toEqual({ email: "failed", sms: "failed" });
  });
});
