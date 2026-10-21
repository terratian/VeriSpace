import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { signCapability, verifyCapability } from "./capability";

const SECRET = "test-secret-test-secret-test-secret-123";
const PROPERTY = "11111111-1111-1111-1111-111111111111";
const start = new Date("2026-11-01T16:00:00Z");
const end = new Date("2026-11-05T16:00:00Z");
const during = new Date("2026-11-02T12:00:00Z");

describe("capability links", () => {
  it("round-trips claims inside the window", async () => {
    const token = await signCapability(
      SECRET,
      { role: "guest", propertyId: PROPERTY, reservationId: "r1", roomIds: ["a", "b"] },
      { notBefore: start, expiresAt: end },
    );
    const result = await verifyCapability(SECRET, token, during);
    expect(result).toMatchObject({
      ok: true,
      claims: { role: "guest", propertyId: PROPERTY, reservationId: "r1", roomIds: ["a", "b"] },
    });
  });

  it("rejects a link before the reservation window opens", async () => {
    const token = await signCapability(SECRET, { role: "guest", propertyId: PROPERTY }, { notBefore: start, expiresAt: end });
    expect(await verifyCapability(SECRET, token, new Date("2026-10-31T00:00:00Z"))).toEqual({
      ok: false,
      reason: "not_yet_valid",
    });
  });

  it("rejects a link after the window closes", async () => {
    const token = await signCapability(SECRET, { role: "guest", propertyId: PROPERTY }, { notBefore: start, expiresAt: end });
    expect(await verifyCapability(SECRET, token, new Date("2026-11-06T00:00:00Z"))).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signCapability(SECRET, { role: "crew", propertyId: PROPERTY }, { notBefore: start, expiresAt: end });
    const result = await verifyCapability("another-secret-another-secret-12345", token, during);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a tampered token", async () => {
    const token = await signCapability(SECRET, { role: "guest", propertyId: PROPERTY }, { notBefore: start, expiresAt: end });
    const [h, p, s] = token.split(".");
    const forged = JSON.parse(Buffer.from(p, "base64url").toString());
    forged.role = "crew";
    const tampered = [h, Buffer.from(JSON.stringify(forged)).toString("base64url"), s].join(".");
    expect(await verifyCapability(SECRET, tampered, during)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects tokens with the wrong issuer or an unknown role", async () => {
    const key = new TextEncoder().encode(SECRET);
    const wrongIssuer = await new SignJWT({ role: "crew", propertyId: PROPERTY })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("someone-else")
      .setExpirationTime("1h")
      .sign(key);
    expect((await verifyCapability(SECRET, wrongIssuer)).ok).toBe(false);

    const badRole = await new SignJWT({ role: "admin", propertyId: PROPERTY })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("veri-space")
      .setExpirationTime("1h")
      .sign(key);
    expect((await verifyCapability(SECRET, badRole)).ok).toBe(false);
  });

  it("rejects the 'none' algorithm", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(
      JSON.stringify({ iss: "veri-space", role: "crew", propertyId: PROPERTY, exp: 4102444800 }),
    ).toString("base64url");
    expect((await verifyCapability(SECRET, `${header}.${body}.`)).ok).toBe(false);
  });

  it("refuses weak secrets and inverted windows when signing", async () => {
    await expect(
      signCapability("short", { role: "crew", propertyId: PROPERTY }, { notBefore: start, expiresAt: end }),
    ).rejects.toThrow(/at least 32/);
    await expect(
      signCapability(SECRET, { role: "crew", propertyId: PROPERTY }, { notBefore: end, expiresAt: start }),
    ).rejects.toThrow(/after notBefore/);
  });
});

describe("link labels", () => {
  it("carries who the link was issued to", async () => {
    const secret = "x".repeat(40);
    const token = await signCapability(secret, { role: "crew", propertyId: "p", label: "Maria, Sparkle Cleaning" }, { notBefore: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 60_000) });
    const r = await verifyCapability(secret, token);
    expect(r.ok && r.claims.label).toBe("Maria, Sparkle Cleaning");
  });
  it("is absent when none was given", async () => {
    const secret = "x".repeat(40);
    const token = await signCapability(secret, { role: "guest", propertyId: "p" }, { notBefore: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 60_000) });
    const r = await verifyCapability(secret, token);
    expect(r.ok && r.claims.label).toBeUndefined();
  });
});
