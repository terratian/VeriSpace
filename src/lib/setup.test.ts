import { describe, expect, it } from "vitest";
import { nextStep, setupSteps } from "./setup";

const none = { rooms: 0, roomsSized: 0, features: 0, baselines: 0, guideItems: 0, stays: 0 };

describe("setup progress", () => {
  it("starts at the rooms", () => {
    const steps = setupSteps(none, "/p");
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(nextStep(steps)?.key).toBe("rooms");
    expect(nextStep(steps)?.href).toBe("/p/setup?step=rooms");
  });
  it("needs every room sized before the layout counts", () => {
    expect(setupSteps({ ...none, rooms: 3, roomsSized: 2 }, "/p")[1].done).toBe(false);
    expect(setupSteps({ ...none, rooms: 3, roomsSized: 3 }, "/p")[1].done).toBe(true);
  });
  it("moves on to the first step that isn't done", () => {
    const steps = setupSteps({ rooms: 2, roomsSized: 2, features: 4, baselines: 0, guideItems: 0, stays: 0 }, "/p");
    expect(nextStep(steps)?.key).toBe("baseline");
  });
  it("is finished when everything exists", () => {
    expect(nextStep(setupSteps({ rooms: 1, roomsSized: 1, features: 1, baselines: 1, guideItems: 1, stays: 1 }, "/p"))).toBeNull();
  });
});
