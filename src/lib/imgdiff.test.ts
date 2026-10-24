import { describe, expect, it } from "vitest";
import { compareGrids, GRID } from "./imgdiff";

const base = () => Array.from({ length: GRID * GRID }, (_, i) => 80 + ((i * 37) % 90));
describe("compareGrids", () => {
  it("sees no change when only the exposure differs", () => {
    const a = base();
    const brighter = a.map((v) => v * 1.25 + 12);
    expect(compareGrids(a, brighter).changed).toBe(false);
  });
  it("sees no change in an identical photo", () => expect(compareGrids(base(), base()).cells).toHaveLength(0));
  it("flags a region that changed, and says where", () => {
    const a = base();
    const b = [...a];
    for (let y = 4; y < 9; y++) for (let x = 6; x < 11; x++) b[y * GRID + x] = 250 - a[y * GRID + x] * 0.2;
    const r = compareGrids(a, b);
    expect(r.changed).toBe(true);
    expect(r.cells.every((c) => c.x >= 5 && c.x <= 11 && c.y >= 3 && c.y <= 9)).toBe(true);
    expect(r.cells.length).toBeGreaterThan(10);
  });
  it("rejects mismatched sizes", () => expect(() => compareGrids([1, 2], [1])).toThrow());
});
