import { describe, expect, it, vi } from "vitest";
import { appendLedgerEvent, authorizeRoomAccess, type LedgerDb, type PhotoIndex, type Principal } from "./ledger";

const OWNER = "owner-1";
const PROPERTY = "00000000-0000-0000-0000-000000000001";
const ROOM = "00000000-0000-0000-0000-0000000000a1";
const SHA = "c".repeat(64);
const RESERVATION = "00000000-0000-0000-0000-0000000000c1";

function fakeDb() {
  const insertEvent = vi.fn(async () => ({ id: 1, seq: 1, rowHash: "h" }));
  const db = {
    getRoom: async (id: string) => (id === ROOM ? { id, propertyId: PROPERTY, ownerId: OWNER } : null),
    insertEvent,
    verifyChain: async () => ({ ok: true, checked: 0, firstBadId: null, reason: null }),
  } as LedgerDb;
  return { db, insertEvent };
}

const crew: Principal = { kind: "capability", claims: { role: "crew", propertyId: PROPERTY, reservationId: RESERVATION } };
const manager: Principal = { kind: "manager", userId: OWNER };
const payloadOf = (insertEvent: ReturnType<typeof vi.fn>) => insertEvent.mock.calls[0][0].payload;

describe("reservation stamping", () => {
  it("takes the reservation from the signed link", async () => {
    const { db, insertEvent } = fakeDb();
    await appendLedgerEvent(db, crew, { roomId: ROOM, eventType: "clean_start", payload: { note: "hi" } });
    expect(payloadOf(insertEvent)).toEqual({ note: "hi", reservationId: RESERVATION });
  });

  it("overwrites a reservation id the client tried to supply", async () => {
    const { db, insertEvent } = fakeDb();
    await appendLedgerEvent(db, crew, { roomId: ROOM, eventType: "clean_start", payload: { reservationId: "forged" } });
    expect(payloadOf(insertEvent).reservationId).toBe(RESERVATION);
  });

  it("removes a supplied reservation id when the link carries none", async () => {
    const { db, insertEvent } = fakeDb();
    const noStay: Principal = { kind: "capability", claims: { role: "crew", propertyId: PROPERTY } };
    await appendLedgerEvent(db, noStay, { roomId: ROOM, eventType: "clean_start", payload: { reservationId: "forged" } });
    expect(payloadOf(insertEvent)).toEqual({});
  });

  it("leaves manager payloads alone", async () => {
    const { db, insertEvent } = fakeDb();
    await appendLedgerEvent(db, manager, { roomId: ROOM, eventType: "inspection", payload: { a: 1 } });
    expect(payloadOf(insertEvent)).toEqual({ a: 1 });
  });
});

describe("photo fingerprints", () => {
  const input = { roomId: ROOM, eventType: "photo_verified", frameSha256: SHA };

  it("accepts a fingerprint whose photo is stored", async () => {
    const { db, insertEvent } = fakeDb();
    const photos: PhotoIndex = { exists: vi.fn(async () => true) };
    await appendLedgerEvent(db, crew, input, photos);
    expect(photos.exists).toHaveBeenCalledWith(PROPERTY, SHA);
    expect(insertEvent).toHaveBeenCalled();
  });

  it("refuses a fingerprint whose photo was never uploaded", async () => {
    const { db, insertEvent } = fakeDb();
    await expect(appendLedgerEvent(db, crew, input, { exists: async () => false })).rejects.toMatchObject({ status: 409 });
    expect(insertEvent).not.toHaveBeenCalled();
  });

  it("doesn't look for a photo when the event has none, or when storage is off", async () => {
    const { db } = fakeDb();
    const photos: PhotoIndex = { exists: vi.fn(async () => false) };
    await appendLedgerEvent(db, crew, { roomId: ROOM, eventType: "clean_start" }, photos);
    expect(photos.exists).not.toHaveBeenCalled();
    await appendLedgerEvent(db, crew, input); // no index: fingerprint-only mode
  });
});

describe("payload size", () => {
  it("rejects an oversized payload before touching the database", async () => {
    const { db, insertEvent } = fakeDb();
    await expect(
      appendLedgerEvent(db, crew, { roomId: ROOM, eventType: "clean_start", payload: { note: "x".repeat(3000) } }),
    ).rejects.toThrow();
    expect(insertEvent).not.toHaveBeenCalled();
  });
});

describe("authorizeRoomAccess", () => {
  const room = { id: ROOM, propertyId: PROPERTY, ownerId: OWNER };
  it("allows the owner and matching links, refuses everyone else", () => {
    expect(() => authorizeRoomAccess(manager, room)).not.toThrow();
    expect(() => authorizeRoomAccess(crew, room)).not.toThrow();
    expect(() => authorizeRoomAccess({ kind: "manager", userId: "x" }, room)).toThrow();
    expect(() => authorizeRoomAccess({ kind: "capability", claims: { role: "guest", propertyId: "other" } }, room)).toThrow();
    expect(() =>
      authorizeRoomAccess({ kind: "capability", claims: { role: "guest", propertyId: PROPERTY, roomIds: ["x"] } }, room),
    ).toThrow();
  });
});
