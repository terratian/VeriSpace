import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import ScanCapture from "@/components/dashboard/ScanCapture";
import { ScanViewerLoader } from "@/components/dashboard/ScanViewerLoader";
import { Breadcrumbs, DbError, EmptyState, Panel } from "@/components/ui/primitives";
import { button } from "@/components/ui/styles";
import { describeDbError } from "@/lib/db-errors";
import { SCAN_COMPLETE_EVENT, SCAN_FRAME_EVENT, latestScan } from "@/lib/scan";
import { photoStoreFromEnv, storageConfigFromEnv } from "@/lib/storage";
import { createSessionClient } from "@/lib/supabase/ssr-server";
import { fmtDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Room scan" };
export const dynamic = "force-dynamic";

/** Scan a room with the phone's camera and look around the sealed result. */
export default async function ScanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ room?: string }> }) {
  const { id } = await params;
  const { room: roomParam } = await searchParams;
  if (!z.guid().safeParse(id).success) notFound();

  const supabase = createSessionClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: property, error } = await supabase
    .from("properties")
    .select("id, name, timezone, rooms(id, name)")
    .eq("id", id)
    .order("created_at", { referencedTable: "rooms" })
    .maybeSingle();
  if (error) return <div className="py-8"><DbError message={describeDbError(error)} /></div>;
  if (!property) notFound();

  const rooms = (property.rooms ?? []) as { id: string; name: string }[];
  const room = rooms.find((r) => r.id === roomParam) ?? rooms[0];
  const crumbs = [
    { label: "Home", href: "/" },
    { label: "Properties", href: "/dashboard" },
    { label: property.name, href: `/dashboard/properties/${property.id}` },
    { label: "Room scan" },
  ];
  if (!room) {
    return (
      <div className="py-6">
        <Breadcrumbs items={crumbs} />
        <div className="mt-8">
          <EmptyState title="Add a room first" action={<Link href={`/dashboard/properties/${property.id}/setup?step=rooms`} className={button("secondary", "sm")}>Add rooms</Link>}>
            Scans belong to a room.
          </EmptyState>
        </div>
      </div>
    );
  }

  const evRes = await supabase
    .from("room_state_ledger")
    .select("event_type, payload, frame_sha256, created_at")
    .eq("room_id", room.id)
    .in("event_type", [SCAN_FRAME_EVENT, SCAN_COMPLETE_EVENT])
    .order("seq")
    .limit(500);
  const scan = evRes.error ? null : latestScan((evRes.data ?? []) as Parameters<typeof latestScan>[0]);
  const store = photoStoreFromEnv();
  const frames = scan && store
    ? await Promise.all(scan.frames.map(async (f) => ({ ...f, url: await store.signedUrl(property.id, f.sha256, 3600) })))
    : [];

  return (
    <div className="py-6">
      <Breadcrumbs items={crumbs} />
      <h1 className="mt-4 text-2xl font-semibold">Room scan</h1>
      <nav aria-label="Rooms" className="mt-4 flex flex-wrap gap-2">
        {rooms.map((r) => (
          <Link
            key={r.id}
            href={`/dashboard/properties/${property.id}/scan?room=${r.id}`}
            aria-current={r.id === room.id ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${r.id === room.id ? "border-mint text-mint" : "border-edge text-ash hover:text-white"}`}
          >
            {r.name}
          </Link>
        ))}
      </nav>

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">{room.name}</h2>
        {frames.length > 0 && scan ? (
          <>
            <ScanViewerLoader frames={frames} />
            <p className="mt-3 text-sm text-mute">
              {scan.complete ? "Sealed" : "Unfinished scan"} {fmtDateTime(scan.at, property.timezone as string)} · {scan.frames.length} photos
              {scan.mode === "manual" ? " · placed in order (no direction sensors)" : ""}
              {scan.geo ? ` · at ${scan.geo.lat}, ${scan.geo.lng}${scan.geo.accuracy ? ` (±${scan.geo.accuracy} m)` : ""}` : ""}
            </p>
          </>
        ) : scan && !store ? (
          <p className="text-sm text-mute">This room has a scan, but photo storage isn&apos;t set up, so it can&apos;t be shown.</p>
        ) : (
          <p className="text-sm text-mute">No scan of this room yet.</p>
        )}
      </section>

      <Panel className="mt-8 p-5">
        <ScanCapture key={room.id} roomId={room.id} roomName={room.name} token={session.access_token} />
        {storageConfigFromEnv() === null && (
          <p className="mt-4 text-sm text-amber">Photo storage isn&apos;t set up yet. Scans need it to be sealed.</p>
        )}
      </Panel>
    </div>
  );
}
