import { describe, expect, it } from "vitest";
import { verifyCapability } from "./capability";
import { CREW_LEAD_MS, GUEST_EARLY_MS, GUEST_GRACE_MS, issueLink, linkWindow, type Stay } from "./links";

const SECRET = "test-secret-test-secret-test-secret-123";
const stay: Stay = {
  id: "00000000-0000-0000-0000-0000000000c1",
  propertyId: "00000000-0000-0000-0000-00000000000a",
  startsAt: new Date("2026-10-24T20:00:00Z"),
  endsAt: new Date("2026-10-27T15:00:00Z"),
};

describe("linkWindow", () => {
  it("opens guest links shortly before check-in and closes shortly after checkout", () => {
    const w = linkWindow("guest", stay);
    expect(w.notBefore.getTime()).toBe(stay.startsAt.getTime() - GUEST_EARLY_MS);
    expect(w.expiresAt.getTime()).toBe(stay.endsAt.getTime() + GUEST_GRACE_MS);
  });

  it("opens crew links just before checkout and keeps them for the turnover", () => {
    const w = linkWindow("crew", stay, 6);
    expect(w.notBefore.getTime()).toBe(stay.endsAt.getTime() - CREW_LEAD_MS);
    expect(w.expiresAt.getTime()).toBe(stay.endsAt.getTime() + 6 * 3600_000);
  });
});

describe("issueLink", () => {
  it("returns a URL whose token verifies only inside the window", async () => {
    const link = await issueLink({ secret: SECRET, origin: "https://app.example", role: "guest", stay });
    expect(link.url.startsWith("https://app.example/guest/")).toBe(true);
    const token = link.url.split("/").pop()!;

    expect(await verifyCapability(SECRET, token, new Date("2026-10-20T00:00:00Z"))).toEqual({ ok: false, reason: "not_yet_valid" });
    expect(await verifyCapability(SECRET, token, new Date("2026-10-25T12:00:00Z"))).toMatchObject({
      ok: true,
      claims: { role: "guest", propertyId: stay.propertyId, reservationId: stay.id },
    });
    expect(await verifyCapability(SECRET, token, new Date("2026-10-28T00:00:00Z"))).toEqual({ ok: false, reason: "expired" });
  });

  it("builds crew URLs under /crew", async () => {
    const link = await issueLink({ secret: SECRET, origin: "http://localhost:3030", role: "crew", stay });
    expect(link.url.startsWith("http://localhost:3030/crew/")).toBe(true);
    expect(link.role).toBe("crew");
  });
});
