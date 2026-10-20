import { describe, expect, it, vi } from "vitest";
import {
  LedgerAuthError,
  appendLedgerEvent,
  verifyRoomChain,
  type LedgerDb,
  type Principal,
} from "./ledger";

const OWNER = "owner-1";
const PROPERTY = "00000000-0000-0000-0000-000000000001";
const OTHER_PROPERTY = "00000000-0000-0000-0000-000000000002";
const ROOM = "00000000-0000-0000-0000-0000000000a1";
const ROOM_2 = "00000000-0000-0000-0000-0000000000b2";
const HASH = "a".repeat(64);

function fakeDb(overrides: Partial<LedgerDb> = {}): LedgerDb & { insertEvent: ReturnType<typeof vi.fn> } {
  const insertEvent = vi.fn(async () => ({ id: 1, seq: 1, rowHash: "h" }));
  return {
    getRoom: async (id) =>
      id === ROOM || id === ROOM_2 ? { id, propertyId: PROPERTY, ownerId: OWNER } : null,
    insertEvent,
    verifyChain: async () => ({ ok: true, checked: 3, firstBadId: null, reason: null }),
    ...overrides,
  } as LedgerDb & { insertEvent: ReturnType<typeof vi.fn> };
}

const manager: Principal = { kind: "manager", userId: OWNER };
const crew: Principal = { kind: "capability", claims: { role: "crew", propertyId: PROPERTY } };
const guest: Principal = { kind: "capability", claims: { role: "guest", propertyId: PROPERTY } };

describe("appendLedgerEvent", () => {
  it("lets crew record a verified photo and stores the actor role", async () => {
    const db = fakeDb();
    await appendLedgerEvent(db, crew, { roomId: ROOM, eventType: "photo_verified", frameSha256: HASH });
    expect(db.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: ROOM, actorRole: "crew", frameSha256: HASH }),
    );
  });

  it("lets guests record arrival scans but not crew events", async () => {
    const db = fakeDb();
    await appendLedgerEvent(db, guest, { roomId: ROOM, eventType: "guest_arrival_scan", frameSha256: HASH });
    await expect(
      appendLedgerEvent(db, guest, { roomId: ROOM, eventType: "clean_end" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("blocks a link from another property", async () => {
    const other: Principal = { kind: "capability", claims: { role: "crew", propertyId: OTHER_PROPERTY } };
    await expect(
      appendLedgerEvent(fakeDb(), other, { roomId: ROOM, eventType: "clean_start" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("blocks a room-scoped link from other rooms", async () => {
    const scoped: Principal = {
      kind: "capability",
      claims: { role: "crew", propertyId: PROPERTY, roomIds: [ROOM] },
    };
    const db = fakeDb();
    await appendLedgerEvent(db, scoped, { roomId: ROOM, eventType: "clean_start" });
    await expect(
      appendLedgerEvent(db, scoped, { roomId: ROOM_2, eventType: "clean_start" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("only lets the owning manager write", async () => {
    const db = fakeDb();
    await appendLedgerEvent(db, manager, { roomId: ROOM, eventType: "inspection" });
    await expect(
      appendLedgerEvent(db, { kind: "manager", userId: "someone-else" }, { roomId: ROOM, eventType: "inspection" }),
    ).rejects.toBeInstanceOf(LedgerAuthError);
  });

  it("returns 404 for unknown rooms", async () => {
    await expect(
      appendLedgerEvent(fakeDb(), manager, { roomId: "00000000-0000-0000-0000-0000000000ff", eventType: "x" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects malformed input before touching the database", async () => {
    const db = fakeDb();
    for (const bad of [
      { roomId: "not-a-uuid", eventType: "clean_start" },
      { roomId: ROOM, eventType: "Bad Event!" },
      { roomId: ROOM, eventType: "clean_start", frameSha256: "xyz" },
      { roomId: ROOM, eventType: "clean_start", frameSha256: "A".repeat(64) },
    ]) {
      await expect(appendLedgerEvent(db, crew, bad)).rejects.toThrow();
    }
    expect(db.insertEvent).not.toHaveBeenCalled();
  });
});

describe("verifyRoomChain", () => {
  it("is limited to the owning manager", async () => {
    const db = fakeDb();
    expect((await verifyRoomChain(db, manager, ROOM)).ok).toBe(true);
    await expect(verifyRoomChain(db, crew, ROOM)).rejects.toMatchObject({ status: 403 });
    await expect(
      verifyRoomChain(db, { kind: "manager", userId: "other" }, ROOM),
    ).rejects.toMatchObject({ status: 403 });
  });
});
