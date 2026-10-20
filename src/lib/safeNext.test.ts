import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/dashboard?tab=rooms")).toBe("/dashboard?tab=rooms");
  });
  it("falls back for missing, absolute, protocol-relative, and backslash URLs", () => {
    for (const bad of [null, undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "dashboard"]) {
      expect(safeNext(bad)).toBe("/dashboard");
    }
  });
});
