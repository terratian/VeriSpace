import { describe, expect, it } from "vitest";
import { cameraHeightFromCeiling, estimateRoom, floorPoint } from "./roomshape";

const near = (a: number, b: number, tol = 0.05) => expect(Math.abs(a - b)).toBeLessThan(tol);
const deg = (r: number) => (r * 180) / Math.PI;

// A camera 4.5 ft up looking at the floor corner of a 12 x 16 ft room, standing at its centre.
const corner = (east: number, north: number, h = 4.5) => ({ yaw: (deg(Math.atan2(east, north)) + 360) % 360, pitch: -deg(Math.atan(h / Math.hypot(east, north))) });

describe("floorPoint", () => {
  it("finds a corner from its angle", () => {
    const p = floorPoint(corner(6, 8), 4.5)!;
    near(p.east, 6);
    near(p.north, 8);
  });
  it("won't guess from a view near the horizon", () => expect(floorPoint({ yaw: 10, pitch: -1 }, 4.5)).toBeNull());
});

describe("estimateRoom", () => {
  const corners = [corner(6, 8), corner(6, -8), corner(-6, -8), corner(-6, 8)];
  it("measures a rectangular room", () => {
    const r = estimateRoom({ floor: corners, cameraHeight: 4.5 })!;
    near(r.width, 12);
    near(r.length, 16);
    near(r.area, 192, 0.5);
  });
  it("still works when the person stood off-centre", () => {
    const off = [corner(10, 3), corner(10, -13), corner(-2, -13), corner(-2, 3)];
    const r = estimateRoom({ floor: off, cameraHeight: 4.5 })!;
    near(r.width, 12);
    near(r.length, 16);
  });
  it("is the same whatever order the corners were tapped in", () => {
    const r = estimateRoom({ floor: [corners[2], corners[0], corners[3], corners[1]], cameraHeight: 4.5 })!;
    near(r.width, 12);
    near(r.length, 16);
  });
  it("scales with the camera height", () => {
    const wrong = estimateRoom({ floor: corners, cameraHeight: 5.4 })!;
    near(wrong.width / 12, 5.4 / 4.5, 0.01);
  });
  it("needs three usable corners", () => {
    expect(estimateRoom({ floor: corners.slice(0, 2), cameraHeight: 4.5 })).toBeNull();
    expect(estimateRoom({ floor: [...corners.slice(0, 2), { yaw: 10, pitch: 0 }], cameraHeight: 4.5 })).toBeNull();
  });
  it("reads ceiling height from a corner marked above a floor corner", () => {
    // Ceiling at 9 ft: the wall corner at (6, 8), 10 ft out, is seen atan((9 - 4.5) / 10) above the horizon.
    const c = corner(6, 8);
    const ceiling = { yaw: c.yaw, pitch: deg(Math.atan((9 - 4.5) / 10)) };
    near(estimateRoom({ floor: corners, ceiling, cameraHeight: 4.5 })!.height!, 9, 0.05);
  });
  it("uses a known ceiling height when no corner is marked", () => {
    expect(estimateRoom({ floor: corners, cameraHeight: 4.5, ceilingHeight: 8 })!.height).toBe(8);
  });
  it("corrects the camera height when the ceiling height is known", () => {
    // Really held at 5 ft in a 9 ft room, but the owner entered 4.5.
    const c = corner(6, 8, 5);
    const ceiling = { yaw: c.yaw, pitch: deg(Math.atan((9 - 5) / 10)) };
    const floor = [corner(6, 8, 5), corner(6, -8, 5), corner(-6, -8, 5), corner(-6, 8, 5)];
    const r = estimateRoom({ floor, ceiling, cameraHeight: 4.5, ceilingHeight: 9 })!;
    near(r.cameraHeight, 5, 0.01);
    near(r.width, 12, 0.05);
  });
});

describe("cameraHeightFromCeiling", () => {
  it("returns null for different corners", () => {
    expect(cameraHeightFromCeiling(9, { yaw: 0, pitch: -20 }, { yaw: 90, pitch: 20 })).toBeNull();
  });
});
