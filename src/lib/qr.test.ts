import { describe, expect, it } from "vitest";
import { qrDataUrl } from "./qr";

describe("qrDataUrl", () => {
  it("makes a PNG image address", async () => {
    const url = await qrDataUrl("https://example.com/dashboard/properties/x/scan?room=y");
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    expect(url.length).toBeGreaterThan(500);
  });
});
