import { describe, expect, it } from "vitest";
import { anchorDigest, parseTimestampReply, stampDigest, timestampRequest } from "./anchor";

const D = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("timestamp request", () => {
  it("matches what OpenSSL builds for the same digest", () => {
    expect(hex(timestampRequest(D))).toBe("30390201013031300d060960864801650304020105000420" + D + "0101ff");
  });
  it("adds a nonce when given one", () => {
    expect(timestampRequest(D, Uint8Array.from([1, 2])).length).toBe(timestampRequest(D).length + 4);
  });
  it("rejects a bad digest", () => expect(() => timestampRequest("abc")).toThrow());
});

describe("anchor digest", () => {
  const a = { roomId: "a", seq: 3, rowHash: "x" };
  const b = { roomId: "b", seq: 1, rowHash: "y" };
  it("ignores order but changes with any head", () => {
    expect(anchorDigest([a, b])).toBe(anchorDigest([b, a]));
    expect(anchorDigest([a, b])).not.toBe(anchorDigest([a, { ...b, rowHash: "z" }]));
    expect(anchorDigest([a, b])).not.toBe(anchorDigest([{ ...a, seq: 4 }, b]));
  });
});

// status granted, then a token containing a GeneralizedTime 2026-10-23 12:34:56Z
const gt = Buffer.from("20261023123456Z");
const token = Buffer.concat([Buffer.from([0x30, 0x13, 0x18, gt.length]), gt]);
const reply = Uint8Array.from(Buffer.concat([Buffer.from([0x30, 5 + token.length, 0x30, 0x03, 0x02, 0x01, 0x00]), token]));
const refused = Uint8Array.from([0x30, 0x05, 0x30, 0x03, 0x02, 0x01, 0x02]);

describe("timestamp reply", () => {
  it("reads a granted reply and its time", () => {
    const r = parseTimestampReply(reply);
    expect(r.granted).toBe(true);
    expect(r.genTime?.toISOString()).toBe("2026-10-23T12:34:56.000Z");
    expect(r.token?.length).toBe(token.length);
  });
  it("reports a refusal", () => {
    const r = parseTimestampReply(refused);
    expect(r.granted).toBe(false);
    expect(r.status).toBe(2);
  });
  it("survives garbage", () => expect(parseTimestampReply(Uint8Array.from([1, 2, 3])).granted).toBe(false));
  it("stamps through a fetch and throws on refusal", async () => {
    const ok = await stampDigest("https://tsa.test", D, async () => new Response(reply as unknown as BodyInit));
    expect(ok.genTime).not.toBeNull();
    await expect(stampDigest("https://tsa.test", D, async () => new Response(refused as unknown as BodyInit))).rejects.toThrow(/refused/);
    await expect(stampDigest("https://tsa.test", D, async () => new Response("no", { status: 500 }))).rejects.toThrow(/500/);
  });
});
