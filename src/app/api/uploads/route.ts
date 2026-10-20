import { authenticate } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { photoStoreFromEnv } from "@/lib/storage";
import { supabaseLedgerDb } from "@/lib/supabase/server";
import { storePhoto } from "@/lib/uploads";

/**
 * Upload one JPEG photo. The body is the raw image; metadata travels in headers:
 *   x-room-id        the room the photo belongs to
 *   x-frame-sha256   the SHA-256 the device computed (the server re-checks it)
 * Crew and guest links and the owning manager may upload.
 */
export async function POST(request: Request) {
  try {
    const principal = await authenticate(request);
    if (!principal) return Response.json({ error: "unauthorized" }, { status: 401 });

    const length = request.headers.get("content-length");
    const result = await storePhoto(supabaseLedgerDb(), photoStoreFromEnv(), principal, {
      roomId: request.headers.get("x-room-id"),
      claimedSha256: request.headers.get("x-frame-sha256"),
      declaredLength: length !== null && /^\d+$/.test(length) ? Number(length) : null,
      read: async () => new Uint8Array(await request.arrayBuffer()),
    });
    return Response.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
