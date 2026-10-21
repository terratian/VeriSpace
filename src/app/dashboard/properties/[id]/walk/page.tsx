import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import CaptureApp from "@/components/capture/CaptureApp";
import { Breadcrumbs, DbError } from "@/components/ui/primitives";
import { describeDbError } from "@/lib/db-errors";
import { EMPTY_PROCEDURES } from "@/lib/guide";
import { BASELINE_EVENT, toFeature } from "@/lib/model";
import { storageConfigFromEnv } from "@/lib/storage";
import { createSessionClient } from "@/lib/supabase/ssr-server";
import { fmtDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Baseline walkthrough" };
export const dynamic = "force-dynamic";

/** The manager's own capture screen: photograph each room and feature as the property's baseline. */
export default async function WalkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();

  const supabase = createSessionClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // The capture screen talks to the ledger API with the manager's own session.
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
  if (error) {
    return (
      <div className="py-8">
        <DbError message={describeDbError(error)} />
      </div>
    );
  }
  if (!property) notFound();

  const nowIso = new Date().toISOString();
  const { data: inHouse } = await supabase
    .from("reservations")
    .select("ends_at")
    .eq("property_id", id)
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso)
    .limit(1)
    .maybeSingle();
  if (inHouse) {
    return (
      <div className="py-8">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Properties", href: "/dashboard" }, { label: property.name, href: `/dashboard/properties/${property.id}` }, { label: "Walkthrough" }]} />
        <p role="status" className="mt-6 max-w-[60ch] rounded-lg border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
          A guest is in house until {fmtDateTime(inHouse.ends_at, property.timezone as string)}. Baseline photos should show the unit as it should be, so the walkthrough waits until checkout.
        </p>
      </div>
    );
  }

  const rooms = (property.rooms ?? []) as { id: string; name: string }[];
  const roomIds = rooms.map((r) => r.id);
  const [featuresRes, eventsRes] = roomIds.length
    ? await Promise.all([
        supabase.from("room_features").select("id, room_id, kind, name, pos_x, pos_y, advertised, details").in("room_id", roomIds).order("created_at"),
        supabase.from("room_state_ledger").select("payload").in("room_id", roomIds).eq("event_type", BASELINE_EVENT).limit(2000),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const loadError = featuresRes.error ?? eventsRes.error;
  if (loadError) {
    return (
      <div className="py-8">
        <DbError message={describeDbError(loadError)} />
      </div>
    );
  }

  const features = ((featuresRes.data ?? []) as Parameters<typeof toFeature>[0][]).map(toFeature);
  const done = new Set(
    ((eventsRes.data ?? []) as { payload: { itemId?: unknown } | null }[]).map((e) => e.payload?.itemId).filter((v): v is string => typeof v === "string"),
  );

  return (
    <div className="py-6">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Properties", href: "/dashboard" },
          { label: property.name, href: `/dashboard/properties/${property.id}` },
          { label: "Walkthrough" },
        ]}
      />
      <CaptureApp
        embedded
        token={session.access_token}
        storageId={`walk-${property.id}`}
        role="manager"
        propertyName={property.name}
        guestName={null}
        endsAt={null}
        expiresAt={new Date(Date.now() + 3600_000).toISOString()}
        guide={EMPTY_PROCEDURES}
        storageEnabled={storageConfigFromEnv() !== null}
        rooms={rooms.map((r) => ({
          ...r,
          content: [],
          features: [],
          checklist: features.filter((f) => f.roomId === r.id).map((f) => ({ id: f.id, label: f.name, requiresPhoto: true })),
          doneItems: features.filter((f) => f.roomId === r.id && done.has(f.id)).map((f) => f.id),
        }))}
      />
    </div>
  );
}
