import { describe, expect, it } from "vitest";
import { shortHash } from "./hash";

describe("shortHash", () => {
  it("keeps both ends of a long hash", () => {
    expect(shortHash("9f3a1111111111111111111111111111111111111111111111111111111dc71e")).toBe("9f3a…c71e");
  });
  it("leaves short strings alone", () => {
    expect(shortHash("abc")).toBe("abc");
  });
});
