import { cookies } from "next/headers";
import { z } from "zod";
import { buildPacket, stayEntryIds, type ExportRow } from "@/lib/packet/build";
import { BASELINE_EVENT } from "@/lib/model";
import { photoStoreFromEnv } from "@/lib/storage";
import { createSessionClient } from "@/lib/supabase/ssr-server";

/**
 * A dispute packet for one stay: the property's ledger in re-verifiable form, the photos for that stay,
 * the signed timestamps, and a checker anyone can run. Owner only (row-level security).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PHOTOS = 40;
const MAX_PHOTO_BYTES = 8_000_000;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) return Response.json({ error: "Not found" }, { status: 404 });
  const stayParam = new URL(request.url).searchParams.get("stay");

  const supabase = createSessionClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });

  const { data: property } = await supabase.from("properties").select("id, name, address, timezone, rooms(id, name)").eq("id", id).order("created_at", { referencedTable: "rooms" }).maybeSingle();
  if (!property) return Response.json({ error: "Not found" }, { status: 404 });
  const rooms = ((property as { rooms?: { id: string; name: string }[] }).rooms ?? []) as { id: string; name: string }[];

  type Stay = { id: string; guest_name: string | null; starts_at: string; ends_at: string };
  let stay = null as Stay | null;
  if (stayParam && z.guid().safeParse(stayParam).success) {
    const { data } = await supabase.from("reservations").select("id, guest_name, starts_at, ends_at").eq("id", stayParam).eq("property_id", id).maybeSingle();
    stay = (data as Stay | null) ?? null;
  }

  const rows: Record<string, ExportRow[]> = {};
  for (const r of rooms) {
    const { data, error } = await supabase.rpc("ledger_export_rows", { p_room_id: r.id });
    if (error) return Response.json({ error: error.message.includes("ledger_export_rows") ? "Run the newest database migration (ledger_export_rows) first." : error.message }, { status: 500 });
    rows[r.id] = (data ?? []) as ExportRow[];
  }

  // Which photos belong to this stay: its own entries and the baselines before it.
  const all = rooms.flatMap((r) =>
    rows[r.id].map((x) => ({ id: x.id, room_id: r.id, event_type: x.event_type, created: Date.parse(x.created_at_text.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")), payload: safeJson(x.payload_text), frame: x.frame_sha256 })),
  );
  const keep = stay ? stayEntryIds(all, { id: stay.id, start: Date.parse(stay.starts_at), end: Date.parse(stay.ends_at) }, BASELINE_EVENT) : new Set(all.map((e) => String(e.id)));
  const wanted = [...new Set(all.filter((e) => e.frame && keep.has(String(e.id))).map((e) => e.frame as string))].slice(0, MAX_PHOTOS);

  const photos = new Map<string, Uint8Array>();
  const store = photoStoreFromEnv();
  if (store) {
    for (const sha of wanted) {
      try {
        const res = await fetch(await store.signedUrl(id, sha, 300));
        if (!res.ok) continue;
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length <= MAX_PHOTO_BYTES) photos.set(sha, buf);
      } catch {
        /* listed as not available in the packet */
      }
    }
  }

  const { data: anchorData } = await supabase.from("ledger_anchors").select("id, digest, heads, gen_time, tsa_url, reply_b64").eq("property_id", id).order("created_at");
  const anchors = ((anchorData ?? []) as { id: string; digest: string; heads: { roomId: string; seq: number; rowHash: string }[]; gen_time: string | null; tsa_url: string; reply_b64: string }[]).map((a) => ({
    ...a,
    reply: new Uint8Array(Buffer.from(a.reply_b64, "base64")),
  }));

  const { data: changeData } = await supabase.from("config_audit").select("id, table_name, row_id, op, old_row, new_row, actor_id, actor_email, created_at").eq("property_id", id).order("id").limit(5000);
  const zip = buildPacket({ changes: changeData ?? [], property: property as never, stay, rooms, rows, anchors, photos, wantedPhotos: wanted, generatedAt: new Date() });
  const slug = String((property as { name: string }).name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "property";
  return new Response(zip as unknown as BodyInit, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="verispace-packet-${slug}.zip"` } });
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}
