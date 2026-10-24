import { cookies } from "next/headers";
import { z } from "zod";
import { compareScans } from "@/lib/scanCompare";
import { SCAN_COMPLETE_EVENT, SCAN_FRAME_EVENT, scanHistory } from "@/lib/scan";
import { photoStoreFromEnv } from "@/lib/storage";
import { createSessionClient } from "@/lib/supabase/ssr-server";

/** Compare a room's newest finished scan with the one before it. Managers only (row-level security). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const roomId = new URL(request.url).searchParams.get("room") ?? "";
  if (!z.guid().safeParse(roomId).success) return Response.json({ error: "Not found" }, { status: 404 });
  const supabase = createSessionClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });

  const { data: room } = await supabase.from("rooms").select("id, property_id").eq("id", roomId).maybeSingle();
  if (!room) return Response.json({ error: "Not found" }, { status: 404 });
  const store = photoStoreFromEnv();
  if (!store) return Response.json({ error: "Photo storage isn't set up, so scans can't be compared." }, { status: 503 });

  const { data } = await supabase.from("room_state_ledger").select("event_type, payload, frame_sha256, created_at").eq("room_id", roomId).in("event_type", [SCAN_FRAME_EVENT, SCAN_COMPLETE_EVENT]).order("seq").limit(1000);
  const finished = scanHistory((data ?? []) as Parameters<typeof scanHistory>[0]).filter((s) => s.complete);
  if (finished.length < 2) return Response.json({ error: "Needs two finished scans of this room." }, { status: 422 });
  const [previous, current] = finished.slice(-2);

  const propertyId = (room as { property_id: string }).property_id;
  const load = async (sha: string) => {
    try {
      const res = await fetch(await store.signedUrl(propertyId, sha, 300));
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    } catch {
      return null;
    }
  };
  const { results, unpaired } = await compareScans(current, previous, load);
  const withUrls = await Promise.all(
    results.map(async (r) => ({
      ...r,
      beforeUrl: r.changed ? await store.signedUrl(propertyId, r.beforeSha, 1800) : null,
      nowUrl: r.changed ? await store.signedUrl(propertyId, r.nowSha, 1800) : null,
    })),
  );
  return Response.json({ current: { at: current.at }, previous: { at: previous.at }, compared: results.length, unpaired, results: withUrls });
}
