import { PhoneQr } from "@/components/dashboard/PhoneQr";
import { Camera, Check } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { FloorPlan } from "@/components/dashboard/FloorPlan";
import { AssetEditor, ResourceManager, RoomEditor, type OwnerResource } from "@/components/dashboard/AssetEditor";
import { LayoutStudio, type EditorRoom } from "@/components/dashboard/LayoutStudio";
import { FeaturePlacer, RemoveFeatureButton, RoomLayoutForm, RoomPresetsForm, StatusForm } from "@/components/dashboard/ModelForms";
import { PropertyViewerLoader } from "@/components/dashboard/PropertyViewerLoader";
import { Badge, Breadcrumbs, DbError, EmptyState, Panel, SectionHeading } from "@/components/ui/primitives";
import { button } from "@/components/ui/styles";
import { describeDbError } from "@/lib/db-errors";
import {
  BASELINE_EVENT,
  FEATURE_LABELS,
  FEATURE_STATUS_EVENT,
  FT,
  STATUS_LABELS,
  featureStatuses,
  listingSummary,
  placeRooms,
  stateOf,
  toFeature,
  toFeet,
  type FeatureStatus,
} from "@/lib/model";
import { createSessionClient } from "@/lib/supabase/ssr-server";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const STEPS = [
  { key: "rooms", label: "Rooms" },
  { key: "layout", label: "Layout" },
  { key: "features", label: "Features" },
  { key: "baseline", label: "Baseline photos" },
  { key: "review", label: "Review" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

interface RoomRow {
  id: string;
  name: string;
  width_m: number | null;
  length_m: number | null;
  height_m: number | null;
  floor: number;
  plan_x: number | null;
  plan_y: number | null;
}

const tone = (s: FeatureStatus) => (s === "working" ? "mint" : s === "degraded" ? "amber" : "red");

export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const { step: stepParam } = await searchParams;
  const requestedStep = STEPS.find((s) => s.key === stepParam)?.key;

  const supabase = createSessionClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: property, error } = await supabase
    .from("properties")
    .select("id, name, timezone, rooms(id, name, width_m, length_m, height_m, floor, plan_x, plan_y)")
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
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rooms = (property.rooms ?? []) as unknown as RoomRow[];
  const step: StepKey = requestedStep ?? (rooms.length === 0 ? "rooms" : "layout");
  const roomIds = rooms.map((r) => r.id);
  const resourcesRes = roomIds.length
    ? await supabase.from("room_resources").select("id, room_id, feature_id, kind, title, url").in("room_id", roomIds).order("created_at")
    : { data: [], error: null };
  const resourceRows = (resourcesRes.error ? [] : (resourcesRes.data ?? [])) as { id: string; room_id: string; feature_id: string | null; kind: "link" | "pdf"; title: string; url: string | null }[];
  const resourcesFor = (roomId: string, featureId: string | null): OwnerResource[] =>
    resourceRows.filter((x) => x.room_id === roomId && x.feature_id === featureId);
  const [featuresRes, eventsRes] = roomIds.length
    ? await Promise.all([
        supabase.from("room_features").select("id, room_id, kind, name, pos_x, pos_y, advertised, details").in("room_id", roomIds).order("created_at"),
        supabase
          .from("room_state_ledger")
          .select("room_id, event_type, payload")
          .in("room_id", roomIds)
          .in("event_type", [FEATURE_STATUS_EVENT, BASELINE_EVENT])
          .order("seq")
          .limit(3000),
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
  const events = (eventsRes.data ?? []) as { room_id: string; event_type: string; payload: unknown }[];
  const statuses = featureStatuses(events);
  const statusMap = Object.fromEntries(features.map((f) => [f.id, stateOf(statuses, f.id).status]));

  const placed = placeRooms(
    rooms.map((r) => ({
      id: r.id,
      name: r.name,
      width: r.width_m === null ? null : Number(r.width_m),
      length: r.length_m === null ? null : Number(r.length_m),
      height: r.height_m === null ? null : Number(r.height_m),
      floor: r.floor,
      planX: r.plan_x === null ? null : Number(r.plan_x),
      planY: r.plan_y === null ? null : Number(r.plan_y),
    })),
  );

  const editorRooms: EditorRoom[] = placed.map((r) => ({
    id: r.id,
    name: r.name,
    x: Math.round(r.x / FT),
    y: Math.round(r.y / FT),
    w: Math.round(r.w / FT),
    d: Math.round(r.d / FT),
    h: Math.round(r.h / FT),
    floor: r.floor,
  }));

  const baselines = events.filter((e) => e.event_type === BASELINE_EVENT);
  const baselinedFeatures = new Set(
    baselines.map((e) => (e.payload as { itemId?: unknown } | null)?.itemId).filter((v): v is string => typeof v === "string"),
  );
  const baselinedRooms = new Set(baselines.map((e) => e.room_id));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));

  const base = `/dashboard/properties/${property.id}`;
  const listing = listingSummary(
    features.map((f) => ({ id: f.id, name: f.name, kind: f.kind, room: roomName.get(f.roomId) ?? "", advertised: f.advertised })),
    statuses,
  );

  return (
    <div className="py-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Properties", href: "/dashboard" },
          { label: property.name, href: base },
          { label: "Model" },
        ]}
      />
      <header className="mt-4">
        <h1 className="text-3xl font-semibold">Property model</h1>
        <p className="mt-1.5 max-w-[60ch] text-mute">
          Build {property.name} room by room. The record of each room becomes the listing guests see, so a feature that is out of service shows as out of service.
        </p>
      </header>

      <PhoneQr path={`${base}/walk`} title="the room-by-room walkthrough">
        Add rooms here, then scan this to photograph each one with your phone. Sign in if it asks.
      </PhoneQr>

      <nav aria-label="Setup steps" className="mt-6">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <Link
                href={`${base}/setup?step=${s.key}`}
                aria-current={s.key === step ? "step" : undefined}
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm transition-colors ${
                  s.key === step ? "border-mint bg-mint/10 text-white" : "border-edge text-mute hover:text-white"
                }`}
              >
                <span className="tabular-nums text-mint">{i + 1}</span>
                {s.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      {inHouse && (step === "layout" || step === "features" || step === "baseline") && (
        <p role="status" className="mt-6 rounded-lg border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
          A guest is in house until {fmtDateTime(inHouse.ends_at, property.timezone as string)}. Layout, features and baseline photos wait until checkout. You can still record a feature&apos;s status in Review.
        </p>
      )}

      {step === "rooms" && (
        <section className="mt-8 max-w-[640px]">
          <SectionHeading title="Rooms" count={rooms.length} />
          <p className="mb-4 text-sm text-mute">Add each space guests or crew will photograph. You can add more at any time.</p>
          {rooms.length > 0 && (
            <ul className="mb-5 space-y-2">
              {rooms.map((r) => (
                <li key={r.id}>
                  <RoomEditor id={r.id} name={r.name} scanHref={`${base}/scan?room=${r.id}`} />
                </li>
              ))}
            </ul>
          )}
          <Panel className="p-5">
            <RoomPresetsForm propertyId={property.id} existing={rooms.map((r) => r.name)} />
          </Panel>
        </section>
      )}

      {step !== "rooms" && (rooms.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Add rooms first" action={<Link href={`${base}/setup?step=rooms`} className={button("secondary", "sm")}>Add rooms</Link>}>
            The model is built room by room. Add the rooms first, then lay them out.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-8">
          {step === "layout" && (
            <section>
              <SectionHeading title="Lay out the space" />
              <LayoutStudio
                key={JSON.stringify(editorRooms)}
                rooms={editorRooms}
                features={features.map((f) => ({
                  id: f.id,
                  roomId: f.roomId,
                  name: f.name,
                  kind: f.kind,
                  x: f.x,
                  y: f.y,
                  advertised: f.advertised,
                  status: stateOf(statuses, f.id).status,
                  note: stateOf(statuses, f.id).note,
                }))}
              />
              <details className="mt-10">
                <summary className="inline cursor-pointer text-sm text-mute hover:text-white">Enter exact sizes, ceiling heights and floors</summary>
                <p className="mb-4 mt-3 max-w-[60ch] text-sm text-mute">Sizes are in feet. Leave position blank and rooms are arranged automatically.</p>
                <div className="grid gap-3 lg:grid-cols-2">
                  {rooms.map((r) => (
                    <Panel key={r.id} className="p-4">
                      <h2 className="mb-3 text-[15px] font-semibold">{r.name}</h2>
                      <RoomLayoutForm
                        room={{
                          id: r.id,
                          widthFt: toFeet(r.width_m === null ? null : Number(r.width_m)),
                          lengthFt: toFeet(r.length_m === null ? null : Number(r.length_m)),
                          heightFt: toFeet(r.height_m === null ? null : Number(r.height_m)),
                          floor: r.floor,
                          planXFt: toFeet(r.plan_x === null ? null : Number(r.plan_x)),
                          planYFt: toFeet(r.plan_y === null ? null : Number(r.plan_y)),
                        }}
                      />
                    </Panel>
                  ))}
                </div>
              </details>
            </section>
          )}

          {step === "features" && (
            <section>
              <SectionHeading title="Features in each room" count={features.length} />
              <p className="mb-4 max-w-[60ch] text-sm text-mute">
                Hot tub, fireplace, smart lock, Wi-Fi, appliances, the bed. Anything a guest relies on, or crew and maintenance need to know about.
              </p>
              <div className="space-y-4">
                {rooms.map((r) => {
                  const mine = features.filter((f) => f.roomId === r.id);
                  const p = placed.find((x) => x.id === r.id)!;
                  return (
                    <Panel key={r.id} className="p-5">
                      <h2 className="text-[17px] font-semibold">{r.name}</h2>
                      {mine.length > 0 && (
                        <ul className="mt-3 divide-y divide-edge border-y border-edge">
                          {mine.map((f) => (
                            <li key={f.id} className="py-2">
                              <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-white">{f.name}</p>
                                <p className="text-[13px] text-mute">
                                  {FEATURE_LABELS[f.kind]}
                                  {f.advertised ? "" : ", not shown to guests"}
                                </p>
                              </div>
                              <RemoveFeatureButton id={f.id} name={f.name} />
                              </div>
                              <AssetEditor
                                propertyId={property.id}
                                roomId={r.id}
                                feature={{ id: f.id, name: f.name, kind: f.kind, advertised: f.advertised, details: f.details }}
                                resources={resourcesFor(r.id, f.id)}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-4 border-t border-edge pt-4">
                        <ResourceManager propertyId={property.id} roomId={r.id} featureId={null} resources={resourcesFor(r.id, null)} />
                      </div>
                      <div className="mt-4">
                        <FeaturePlacer room={{ id: r.id, name: r.name, widthFt: p.w / 0.3048, lengthFt: p.d / 0.3048 }} features={mine} statuses={statusMap} />
                      </div>
                    </Panel>
                  );
                })}
              </div>
            </section>
          )}

          {step === "baseline" && (
            <section className="max-w-[640px]">
              <SectionHeading title="Baseline photos" />
              <p className="text-ash">
                Walk the property with your phone and photograph each room and each feature as it should be. Every photo is fingerprinted on the phone and recorded in that room&apos;s ledger, so
                later crew and guest photos can be checked against this record.
              </p>
              <Panel className="mt-5 p-5">
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-[12px] text-mute">Rooms with a baseline</dt>
                    <dd className="text-2xl font-semibold tabular-nums text-white">
                      {baselinedRooms.size} of {rooms.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] text-mute">Features with a baseline</dt>
                    <dd className="text-2xl font-semibold tabular-nums text-white">
                      {features.filter((f) => baselinedFeatures.has(f.id)).length} of {features.length}
                    </dd>
                  </div>
                </dl>
                <Link href={`${base}/walk`} className={`${button("primary", "lg")} mt-5 w-full sm:w-auto`}>
                  <Camera className="size-5" aria-hidden="true" />
                  Walk the property
                </Link>
                <p className="mt-3 text-[13px] text-mute">Open this on your phone. It needs camera access and photo storage to be set up.</p>
              </Panel>
            </section>
          )}

          {step === "review" && (
            <section className="space-y-10">
              <div>
                <SectionHeading title="3D view" />
                <PropertyViewerLoader
                  rooms={placed}
                  features={features.map((f) => ({
                    id: f.id,
                    roomId: f.roomId,
                    name: f.name,
                    kind: f.kind,
                    x: f.x,
                    y: f.y,
                    advertised: f.advertised,
                    status: stateOf(statuses, f.id).status,
                    note: stateOf(statuses, f.id).note,
                  }))}
                />
              </div>

              <div>
                <SectionHeading title="Listing as advertised" />
                <Panel className="p-5">
                  {features.filter((f) => f.advertised).length === 0 ? (
                    <p className="text-mute">No features are shown to guests yet. Add features in step 2.</p>
                  ) : (
                    <div className="space-y-4 text-sm">
                      {listing.unavailable.length + listing.limited.length === 0 ? (
                        <p className="flex items-center gap-2 text-mint">
                          <Check className="size-4" aria-hidden="true" />
                          Everything advertised is working.
                        </p>
                      ) : (
                        <>
                          {listing.unavailable.length > 0 && (
                            <div>
                              <Badge tone="red">Out of service</Badge>
                              <ul className="mt-2 space-y-1">
                                {listing.unavailable.map(({ feature, note }) => (
                                  <li key={feature.id} className="text-white">
                                    {feature.name} <span className="text-mute">in {feature.room}</span>
                                    {note && <span className="text-ash">, {note}</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {listing.limited.length > 0 && (
                            <div>
                              <Badge tone="amber">Needs attention</Badge>
                              <ul className="mt-2 space-y-1">
                                {listing.limited.map(({ feature, note }) => (
                                  <li key={feature.id} className="text-white">
                                    {feature.name} <span className="text-mute">in {feature.room}</span>
                                    {note && <span className="text-ash">, {note}</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                      <p className="text-mute">
                        {listing.available.length} working: {listing.available.map((a) => a.feature.name).join(", ") || "none"}.
                      </p>
                      <p className="text-[13px] text-mute">Guests see these statuses in their link. Update a status below and their view changes straight away.</p>
                    </div>
                  )}
                </Panel>
              </div>

              <div>
                <SectionHeading title="Feature status" count={features.length} />
                {features.length === 0 ? (
                  <EmptyState title="No features yet">Add features in step 2 to track their status.</EmptyState>
                ) : (
                  <div className="space-y-4">
                    {rooms.map((r) => {
                      const mine = features.filter((f) => f.roomId === r.id);
                      if (mine.length === 0) return null;
                      return (
                        <Panel key={r.id} className="p-5">
                          <h3 className="text-[15px] font-semibold">{r.name}</h3>
                          <ul className="mt-3 divide-y divide-edge border-y border-edge">
                            {mine.map((f) => {
                              const s = stateOf(statuses, f.id);
                              return (
                                <li key={f.id} className="py-3">
                                  <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span className="font-medium text-white">{f.name}</span>
                                    <Badge tone={tone(s.status)}>{STATUS_LABELS[s.status]}</Badge>
                                    {baselinedFeatures.has(f.id) && <Badge>Baseline photo</Badge>}
                                  </div>
                                  <StatusForm key={`${s.status}:${s.note}`} featureId={f.id} name={f.name} status={s.status} note={s.note} />
                                </li>
                              );
                            })}
                          </ul>
                        </Panel>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      ))}

      <div className="mt-10 flex justify-between gap-3">
        {STEPS.findIndex((s) => s.key === step) > 0 ? (
          <Link href={`${base}/setup?step=${STEPS[STEPS.findIndex((s) => s.key === step) - 1].key}`} className={button("ghost", "md")}>
            Back
          </Link>
        ) : (
          <span />
        )}
        {STEPS.findIndex((s) => s.key === step) < STEPS.length - 1 ? (
          <Link href={`${base}/setup?step=${STEPS[STEPS.findIndex((s) => s.key === step) + 1].key}`} className={button("primary", "md")}>
            Next
          </Link>
        ) : (
          <Link href={base} className={button("primary", "md")}>
            Done
          </Link>
        )}
      </div>
    </div>
  );
}
