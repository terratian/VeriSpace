import { describe, expect, it } from "vitest";
import { hashFrame, sha256Hex } from "./frameHasher";

describe("frameHasher", () => {
  it("matches the standard SHA-256 test vector for 'abc'", async () => {
    const hex = await sha256Hex(new TextEncoder().encode("abc"));
    expect(hex).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("hashes the empty input", async () => {
    expect(await sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashes only the bytes of a sub-view, not the whole backing buffer", async () => {
    const backing = new TextEncoder().encode("xxabcxx");
    const view = backing.subarray(2, 5);
    expect(await sha256Hex(view)).toBe(await sha256Hex(new TextEncoder().encode("abc")));
  });

  it("hashes a Blob the same as its bytes", async () => {
    const blob = new Blob([new TextEncoder().encode("abc")]);
    expect(await hashFrame(blob)).toBe(await sha256Hex(new TextEncoder().encode("abc")));
  });

  it("produces different hashes when one byte changes", async () => {
    const a = await sha256Hex(new Uint8Array([1, 2, 3]));
    const b = await sha256Hex(new Uint8Array([1, 2, 4]));
    expect(a).not.toBe(b);
  });
});
