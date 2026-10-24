import { describe, expect, it } from "vitest";
import { maskEmail, maskPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("accepts common US formats and international numbers", () => {
    expect(normalizePhone("(555) 123-4567")).toEqual({ ok: true, value: "+15551234567" });
    expect(normalizePhone("1 555 123 4567")).toEqual({ ok: true, value: "+15551234567" });
    expect(normalizePhone("+44 7700 900123")).toEqual({ ok: true, value: "+447700900123" });
  });
  it("treats blank as none and rejects the rest", () => {
    expect(normalizePhone("  ")).toEqual({ ok: true, value: null });
    expect(normalizePhone("12345").ok).toBe(false);
    expect(normalizePhone("+0123456789").ok).toBe(false);
  });
  it("masks for display", () => {
    expect(maskPhone("+15551234567")).toBe("•••• 4567");
    expect(maskEmail("maria@example.com")).toBe("m•••@example.com");
  });
});
