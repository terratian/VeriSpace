import { LedgerAuthError, authorizeRoomAccess, type LedgerDb, type Principal } from "./ledger";
import { MAX_PHOTO_BYTES, isJpeg, sha256Hex, type PhotoStore } from "./storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

export interface UploadRequest {
  roomId: string | null;
  claimedSha256: string | null;
  declaredLength: number | null;
  read: () => Promise<Uint8Array>;
}

/**
 * Store one photo. The server hashes the bytes itself and refuses the upload unless the hash matches
 * what the device claimed, so a fingerprint in the ledger always describes a file that exists.
 */
export async function storePhoto(
  db: LedgerDb,
  store: PhotoStore | null,
  principal: Principal,
  req: UploadRequest,
): Promise<{ sha256: string; bytes: number }> {
  if (!store) throw new LedgerAuthError("photo storage is not configured", 501);
  if (!req.roomId || !UUID.test(req.roomId)) throw new LedgerAuthError("x-room-id must be a room id", 422);
  if (!req.claimedSha256 || !SHA256.test(req.claimedSha256)) {
    throw new LedgerAuthError("x-frame-sha256 must be a lowercase SHA-256", 422);
  }
  if (req.declaredLength === null) throw new LedgerAuthError("content-length is required", 411);
  if (req.declaredLength > MAX_PHOTO_BYTES) throw new LedgerAuthError("photo is too large", 413);

  const room = await db.getRoom(req.roomId);
  if (!room) throw new LedgerAuthError("room not found", 404);
  authorizeRoomAccess(principal, room);

  const bytes = await req.read();
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new LedgerAuthError("photo is too large", 413);
  if (!isJpeg(bytes)) throw new LedgerAuthError("photos must be JPEG images", 415);

  const actual = await sha256Hex(bytes);
  if (actual !== req.claimedSha256) throw new LedgerAuthError("photo does not match its fingerprint", 422);

  await store.put(room.propertyId, actual, bytes);
  return { sha256: actual, bytes: bytes.byteLength };
}
