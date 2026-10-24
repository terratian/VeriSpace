import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { compareScans, pairFrames } from "./scanCompare";
import type { ScanFrame, ScanSet } from "./scan";

const frame = (index: number, yaw: number, pitch: number, sha: string): ScanFrame => ({ index, yaw, pitch, roll: 0, width: 320, height: 240, sha256: sha });
const set = (frames: ScanFrame[]): ScanSet => ({ scanId: "s", frames, complete: true, at: "2026-10-24T00:00:00Z", mode: "sensor", geo: null });

// A room-ish picture with gradients and a few shapes, optionally with something new on the wall.
async function picture(extra: boolean, bright = 1): Promise<Uint8Array> {
  const shapes = [`<rect x="0" y="0" width="320" height="240" fill="rgb(${120 * bright},${110 * bright},${100 * bright})"/>`, `<rect x="30" y="40" width="80" height="120" fill="rgb(${40 * bright},${60 * bright},${90 * bright})"/>`, `<circle cx="230" cy="70" r="30" fill="rgb(${220 * bright},${210 * bright},${180 * bright})"/>`, `<rect x="0" y="190" width="320" height="50" fill="rgb(${70 * bright},${50 * bright},${40 * bright})"/>`];
  if (extra) shapes.push(`<rect x="150" y="110" width="110" height="70" fill="rgb(10,10,10)"/>`);
  return new Uint8Array(await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">${shapes.join("")}</svg>`)).jpeg().toBuffer());
}

describe("pairFrames", () => {
  it("pairs by direction, not index, and skips directions with no match", () => {
    const now = [frame(0, 10, 0, "a"), frame(1, 180, 0, "b")];
    const before = [frame(5, 355, 0, "c"), frame(6, 90, 0, "d")];
    const pairs = pairFrames(now, before);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].before.sha256).toBe("c");
  });
});

describe("compareScans", () => {
  it("flags the direction where something changed, ignores a brightness change elsewhere", async () => {
    const images: Record<string, Uint8Array> = {
      old0: await picture(false),
      new0: await picture(true),
      old1: await picture(false),
      new1: await picture(false, 1.3),
    };
    const prev = set([frame(0, 0, 0, "old0"), frame(1, 90, 0, "old1")]);
    const cur = set([frame(0, 0, 0, "new0"), frame(1, 90, 0, "new1")]);
    const { results } = await compareScans(cur, prev, async (sha) => images[sha] ?? null);
    expect(results.find((r) => r.index === 0)?.changed).toBe(true);
    expect(results.find((r) => r.index === 1)?.changed).toBe(false);
  });
  it("skips frames whose photos can't be loaded", async () => {
    const { results } = await compareScans(set([frame(0, 0, 0, "n")]), set([frame(0, 0, 0, "o")]), async () => null);
    expect(results).toHaveLength(0);
  });
});
