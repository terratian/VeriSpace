import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { LedgerAuthError, authorizeRoomAccess } from "@/lib/ledger";
import { SCAN_COMPLETE_EVENT, SCAN_FRAME_EVENT, latestScan } from "@/lib/scan";
import { photoStoreFromEnv } from "@/lib/storage";
import { serviceClient, supabaseLedgerDb } from "@/lib/supabase/server";

/**
 * The look-around view of one room for a guest or crew link: the newest sealed scan's photos (signed,
 * short-lived addresses) and the pins of assets the owner chose to show guests.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const principal = await authenticate(request);
    if (!principal) return Response.json({ error: "unauthorized" }, { status: 401 });
    const roomId = z.guid().safeParse(new URL(request.url).searchParams.get("room"));
    if (!roomId.success) throw new LedgerAuthError("room not found", 404);
    const room = await supabaseLedgerDb().getRoom(roomId.data);
    if (!room) throw new LedgerAuthError("room not found", 404);
    authorizeRoomAccess(principal, room);

    const store = photoStoreFromEnv();
    if (!store) return Response.json({ frames: [], pins: [] });
    const db = serviceClient();
    const { data } = await db
      .from("room_state_ledger")
      .select("event_type, payload, frame_sha256, created_at")
      .eq("room_id", room.id)
      .in("event_type", [SCAN_FRAME_EVENT, SCAN_COMPLETE_EVENT])
      .order("seq")
      .limit(1000);
    const scan = latestScan((data ?? []) as Parameters<typeof latestScan>[0]);
    if (!scan || !scan.complete) return Response.json({ frames: [], pins: [] });

    const frames = await Promise.all(scan.frames.map(async (f) => ({ ...f, url: await store.signedUrl(room.propertyId, f.sha256, 3600) })));
    const { data: pinRows } = await db
      .from("room_feature_pins")
      .select("id, feature_id, yaw, pitch, room_features!inner(name, advertised)")
      .eq("room_id", room.id)
      .eq("scan_id", scan.scanId);
    const pins = ((pinRows ?? []) as unknown as { id: string; feature_id: string; yaw: number | string; pitch: number | string; room_features: { name: string; advertised: boolean } }[])
      .filter((p) => p.room_features.advertised)
      .map((p) => ({ id: p.id, featureId: p.feature_id, label: p.room_features.name, yaw: Number(p.yaw), pitch: Number(p.pitch), status: "working" as const }));
    return Response.json({ frames, pins });
  } catch (err) {
    return errorResponse(err);
  }
}
