import { describe, expect, it, vi } from "vitest";
import type { LedgerDb, Principal } from "./ledger";
import { MAX_PHOTO_BYTES, sha256Hex, type PhotoStore } from "./storage";
import { storePhoto, type UploadRequest } from "./uploads";

const PROPERTY = "00000000-0000-0000-0000-000000000001";
const OTHER_PROPERTY = "00000000-0000-0000-0000-000000000002";
const ROOM = "00000000-0000-0000-0000-0000000000a1";
const OWNER = "owner-1";

const db = {
  getRoom: async (id: string) => (id === ROOM ? { id, propertyId: PROPERTY, ownerId: OWNER } : null),
} as unknown as LedgerDb;

function fakeStore() {
  const put = vi.fn(async () => {});
  return { put, exists: async () => true, signedUrl: async () => "" } as PhotoStore & { put: typeof put };
}

const crew: Principal = { kind: "capability", claims: { role: "crew", propertyId: PROPERTY } };
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

async function request(overrides: Partial<UploadRequest> = {}, bytes = jpeg): Promise<UploadRequest> {
  return {
    roomId: ROOM,
    claimedSha256: await sha256Hex(bytes),
    declaredLength: bytes.byteLength,
    read: async () => bytes,
    ...overrides,
  };
}

describe("storePhoto", () => {
  it("stores a matching JPEG under the property and returns its fingerprint", async () => {
    const store = fakeStore();
    const req = await request();
    const result = await storePhoto(db, store, crew, req);
    expect(result).toEqual({ sha256: req.claimedSha256, bytes: jpeg.byteLength });
    expect(store.put).toHaveBeenCalledWith(PROPERTY, req.claimedSha256, jpeg);
  });

  it("answers 501 when storage isn't configured", async () => {
    await expect(storePhoto(db, null, crew, await request())).rejects.toMatchObject({ status: 501 });
  });

  it("rejects malformed room ids and fingerprints with 422", async () => {
    const store = fakeStore();
    for (const bad of [{ roomId: null }, { roomId: "nope" }, { claimedSha256: null }, { claimedSha256: "ABC" }]) {
      await expect(storePhoto(db, store, crew, await request(bad))).rejects.toMatchObject({ status: 422 });
    }
    expect(store.put).not.toHaveBeenCalled();
  });

  it("requires a declared length and enforces the size limit", async () => {
    const store = fakeStore();
    await expect(storePhoto(db, store, crew, await request({ declaredLength: null }))).rejects.toMatchObject({ status: 411 });
    await expect(storePhoto(db, store, crew, await request({ declaredLength: MAX_PHOTO_BYTES + 1 }))).rejects.toMatchObject({ status: 413 });
    // A body larger than it declared is caught after reading.
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    await expect(storePhoto(db, store, crew, await request({ declaredLength: 10 }, big))).rejects.toMatchObject({ status: 413 });
    expect(store.put).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown room and 403 for a link to another property", async () => {
    const store = fakeStore();
    await expect(
      storePhoto(db, store, crew, await request({ roomId: "00000000-0000-0000-0000-0000000000ff" })),
    ).rejects.toMatchObject({ status: 404 });
    const other: Principal = { kind: "capability", claims: { role: "crew", propertyId: OTHER_PROPERTY } };
    await expect(storePhoto(db, store, other, await request())).rejects.toMatchObject({ status: 403 });
    expect(store.put).not.toHaveBeenCalled();
  });

  it("lets the owning manager upload and refuses another manager", async () => {
    const store = fakeStore();
    await storePhoto(db, store, { kind: "manager", userId: OWNER }, await request());
    await expect(storePhoto(db, store, { kind: "manager", userId: "x" }, await request())).rejects.toMatchObject({ status: 403 });
  });

  it("refuses non-JPEG bytes with 415", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]);
    const store = fakeStore();
    await expect(storePhoto(db, store, crew, await request({}, png))).rejects.toMatchObject({ status: 415 });
    expect(store.put).not.toHaveBeenCalled();
  });

  it("refuses bytes that don't match the claimed fingerprint", async () => {
    const store = fakeStore();
    await expect(
      storePhoto(db, store, crew, await request({ claimedSha256: "b".repeat(64) })),
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/fingerprint/) });
    expect(store.put).not.toHaveBeenCalled();
  });
});
