import { describe, expect, it } from "vitest";
import { requestOrigin } from "./origin";

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

describe("requestOrigin", () => {
  it("prefers the configured origin and trims trailing slashes", () => {
    expect(requestOrigin(h({ host: "evil.example" }), "https://verispace.app/")).toBe("https://verispace.app");
  });

  it("uses http for localhost and https elsewhere", () => {
    expect(requestOrigin(h({ host: "localhost:3030" }), undefined)).toBe("http://localhost:3030");
    expect(requestOrigin(h({ host: "app.example.com" }), undefined)).toBe("https://app.example.com");
  });

  it("honours proxy headers", () => {
    expect(
      requestOrigin(h({ host: "internal:3000", "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" }), undefined),
    ).toBe("https://app.example.com");
  });

  it("throws when it cannot tell", () => {
    expect(() => requestOrigin(h({}), undefined)).toThrow(/APP_ORIGIN/);
  });
});
