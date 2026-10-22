import { describe, expect, it } from "vitest";
import { pdfPathOk, safeUrl } from "./resources";

describe("safeUrl", () => {
  it("accepts web addresses", () => {
    expect(safeUrl(" https://example.com/manual ")).toBe("https://example.com/manual");
    expect(safeUrl("http://example.com")).toBe("http://example.com/");
  });
  it("rejects anything else", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "example.com", ""]) expect(safeUrl(bad)).toBeNull();
  });
});

describe("pdfPathOk", () => {
  const p = "11111111-1111-4111-8111-111111111111";
  it("needs the property's own folder and a .pdf", () => {
    expect(pdfPathOk(p, `${p}/abc.pdf`)).toBe(true);
    expect(pdfPathOk(p, `22222222-2222-4222-8222-222222222222/abc.pdf`)).toBe(false);
    expect(pdfPathOk(p, `${p}/abc.html`)).toBe(false);
    expect(pdfPathOk(p, `${p}/../x.pdf`)).toBe(false);
  });
});
