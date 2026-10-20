import { describe, expect, it, vi } from "vitest";
import { CaptureError, messageFor, payloadFor, sendEvent, uploadShot } from "./captureClient";

const ROOM = "00000000-0000-0000-0000-0000000000a1";
const SHA = "d".repeat(64);
const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], { type: "image/jpeg" });
const shot = { blob, sha256: SHA, width: 1600, height: 1200, source: "camera" as const };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("uploadShot", () => {
  it("posts the raw photo with its room and fingerprint", async () => {
    const fetchFn = vi.fn(async () => json({ sha256: SHA, bytes: 6 }, 201));
    expect(await uploadShot("tok", ROOM, shot, fetchFn)).toBe("stored");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/uploads");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(blob);
    expect(init.headers).toMatchObject({
      authorization: "Bearer tok",
      "x-room-id": ROOM,
      "x-frame-sha256": SHA,
      "content-type": "image/jpeg",
    });
  });

  it("treats 501 as fingerprint-only mode", async () => {
    expect(await uploadShot("t", ROOM, shot, async () => json({ error: "x" }, 501))).toBe("skipped");
  });

  it("turns failures into plain-language errors", async () => {
    await expect(uploadShot("t", ROOM, shot, async () => json({ error: "x" }, 413))).rejects.toMatchObject({
      message: expect.stringMatching(/too large/),
      retryable: false,
      status: 413,
    });
    await expect(uploadShot("t", ROOM, shot, async () => json({}, 503))).rejects.toMatchObject({ retryable: true, status: 503 });
  });

  it("reports a dropped connection as retryable", async () => {
    const err = await uploadShot("t", ROOM, shot, async () => {
      throw new TypeError("Failed to fetch");
    }).catch((e) => e);
    expect(err).toBeInstanceOf(CaptureError);
    expect(err).toMatchObject({ retryable: true, status: 0, message: expect.stringMatching(/No connection/) });
  });
});

describe("sendEvent", () => {
  it("records a photo event with its fingerprint and capture details", async () => {
    const fetchFn = vi.fn(async () => json({ id: 7, seq: 3, rowHash: "abc" }, 201));
    const event = await sendEvent("tok", { roomId: ROOM, eventType: "photo_verified", shot, note: "  clean  " }, fetchFn);
    expect(event).toEqual({ id: 7, seq: 3, rowHash: "abc" });
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string)).toEqual({
      roomId: ROOM,
      eventType: "photo_verified",
      frameSha256: SHA,
      payload: { note: "clean", width: 1600, height: 1200, bytes: 6, source: "camera" },
    });
  });

  it("records an event with no photo", async () => {
    const fetchFn = vi.fn(async () => json({ id: 1, seq: 1, rowHash: "h" }, 201));
    await sendEvent("tok", { roomId: ROOM, eventType: "clean_start" }, fetchFn);
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.frameSha256).toBeUndefined();
    expect(body.payload).toEqual({});
  });

  it("marks a 409 as retryable so the photo can be uploaded again", async () => {
    await expect(
      sendEvent("t", { roomId: ROOM, eventType: "photo_verified", shot }, async () => json({ error: "photo has not been uploaded" }, 409)),
    ).rejects.toMatchObject({ status: 409, retryable: true });
  });

  it("explains an expired link", async () => {
    await expect(sendEvent("t", { roomId: ROOM, eventType: "clean_start" }, async () => json({}, 401))).rejects.toMatchObject({
      message: expect.stringMatching(/new one/),
      retryable: false,
    });
  });
});

describe("payloadFor", () => {
  it("drops empty notes and caps long ones", () => {
    expect(payloadFor({ roomId: ROOM, eventType: "x", note: "   " })).toEqual({});
    expect((payloadFor({ roomId: ROOM, eventType: "x", note: "n".repeat(900) }).note as string).length).toBe(500);
  });
});

describe("messageFor", () => {
  it("distinguishes a fingerprint mismatch from other 422s", () => {
    expect(messageFor(422, "photo does not match its fingerprint")).toMatch(/changed while uploading/);
    expect(messageFor(422, "x")).toMatch(/Check them/);
  });
});
