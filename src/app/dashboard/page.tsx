import type { Metadata } from "next";
import { ChevronRight, Plus } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActivityList, type ActivityItem } from "@/components/dashboard/ActivityList";
import { OverviewPanel, type OverviewData } from "@/components/dashboard/OverviewPanel";
import { StayCalendar, type CalendarRow } from "@/components/dashboard/StayCalendar";
import { PropertyForm } from "@/components/dashboard/PropertyForm";
import { Badge, Breadcrumbs, DbError, EmptyState, Panel, SectionHeading } from "@/components/ui/primitives";
import { button } from "@/components/ui/styles";
import { describeDbError } from "@/lib/db-errors";
import { calendarDays, dayCells, dayKeyInZone, occupancyPercent, weekCounts } from "@/lib/overview";
import { computeReadiness, type ReadyEvent } from "@/lib/readiness";
import { SOURCE_LABEL, type Source } from "@/lib/reservations";
import { createSessionClient } from "@/lib/supabase/ssr-server";
import { fmtDateTime, fmtDay, nightsBetween } from "@/lib/time";
import { addProperty } from "./actions";

export const metadata: Metadata = { title: "Properties" };
export const dynamic = "force-dynamic";

interface StayRow {
  id: string;
  starts_at: string;
  ends_at: string;
  guest_name: string | null;
  source: Source;
}
interface PropertyRow {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  rooms: { id: string; name: string }[];
  reservations: StayRow[];
}
interface LedgerRow {
  id: number;
  seq: number;
  event_type: string;
  actor_role: string;
  created_at: string;
  frame_sha256: string | null;
  rooms: { name: string; properties: { name: string } | null } | null;
}

export default async function Dashboard() {
  const supabase = createSessionClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  // Row Level Security limits every query here to the signed-in owner's rows.
  const [propertiesRes, activityRes, ledgerCountRes] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, address, timezone, rooms(id, name), reservations(id, starts_at, ends_at, guest_name, source)")
      .gte("reservations.ends_at", now.toISOString())
      .order("created_at")
      .order("starts_at", { referencedTable: "reservations" })
      .limit(2, { referencedTable: "reservations" }),
    supabase
      .from("room_state_ledger")
      .select("id, seq, event_type, actor_role, created_at, frame_sha256, rooms(name, properties(name))")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("room_state_ledger").select("id", { count: "exact", head: true }),
  ]);

  if (propertiesRes.error) {
    return (
      <div className="py-8">
        <DbError message={describeDbError(propertiesRes.error)} />
      </div>
    );
  }

  const properties = (propertiesRes.data ?? []) as unknown as PropertyRow[];

  // Calendar and metrics: stays from a week back (for the latest turnover) to two weeks ahead.
  const DAYS = 14;
  const windowStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const windowEnd = new Date(now.getTime() + (DAYS + 1) * 86_400_000).toISOString();
  const windowRes = properties.length
    ? await supabase
        .from("reservations")
        .select("id, property_id, starts_at, ends_at")
        .gte("ends_at", windowStart)
        .lte("starts_at", windowEnd)
        .order("starts_at")
    : { data: [], error: null };
  const windowStays = (windowRes.error ? [] : (windowRes.data ?? [])) as unknown as { id: string; property_id: string; starts_at: string; ends_at: string }[];

  const days = calendarDays(properties[0] ? dayKeyInZone(now, properties[0].timezone) : dayKeyInZone(now, "UTC"), DAYS);
  const calendarRows: CalendarRow[] = properties.map((p) => ({
    id: p.id,
    name: p.name,
    cells: dayCells(
      windowStays.filter((s) => s.property_id === p.id).map((s) => ({ startsAt: s.starts_at, endsAt: s.ends_at })),
      p.timezone,
      days,
    ),
  }));

  // Each property's latest checkout in the past week is its current turnover.
  const turnoverOf = new Map<string, string>();
  for (const s of windowStays) {
    if (new Date(s.ends_at) <= now) turnoverOf.set(s.property_id, s.id);
  }
  const roomIds = properties.flatMap((p) => p.rooms.map((r) => r.id));
  const turnoverIds = [...new Set(turnoverOf.values())];
  const [itemsRes, eventsRes] =
    roomIds.length && turnoverIds.length
      ? await Promise.all([
          supabase.from("room_checklist_items").select("id, room_id, requires_photo").in("room_id", roomIds),
          supabase
            .from("room_state_ledger")
            .select("room_id, event_type, payload, frame_sha256")
            .in("room_id", roomIds)
            .in("event_type", ["clean_start", "clean_end", "checklist_item", "damage_report"])
            .in("payload->>reservationId", turnoverIds)
            .limit(2000),
        ])
      : [null, null];
  const items = itemsRes && !itemsRes.error ? ((itemsRes.data ?? []) as { id: string; room_id: string; requires_photo: boolean | null }[]) : [];
  const events = eventsRes && !eventsRes.error ? ((eventsRes.data ?? []) as unknown as (ReadyEvent & { payload: { reservationId?: string } | null })[]) : [];
  const turnovers = { ready: 0, inProgress: 0, notStarted: 0 };
  let damage = 0;
  for (const p of properties) {
    const stayId = turnoverOf.get(p.id);
    if (!stayId || p.rooms.length === 0) continue;
    const r = computeReadiness(
      p.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        items: items.filter((i) => i.room_id === room.id).map((i) => ({ id: i.id, requiresPhoto: !!i.requires_photo })),
      })),
      events.filter((e) => e.payload?.reservationId === stayId),
    );
    damage += r.damage;
    if (r.state === "ready") turnovers.ready++;
    else if (r.state === "in_progress") turnovers.inProgress++;
    else turnovers.notStarted++;
  }
  const overview: OverviewData = {
    turnovers,
    occupancy: occupancyPercent(calendarRows.map((r) => r.cells)),
    week: weekCounts(calendarRows.map((r) => r.cells)),
    damage,
    days: DAYS,
  };

  const roomCount = properties.reduce((n, p) => n + p.rooms.length, 0);
  const ledgerCount = ledgerCountRes.count ?? 0;
  const activity: ActivityItem[] = ((activityRes.data ?? []) as unknown as LedgerRow[]).map((r) => ({
    id: r.id,
    seq: r.seq,
    eventType: r.event_type,
    actorRole: r.actor_role,
    createdAt: r.created_at,
    hash: r.frame_sha256,
    room: r.rooms?.name ?? "a room",
    property: r.rooms?.properties?.name,
  }));

  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  return (
    <div className="py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Properties" }]} />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Properties</h1>
          <p className="mt-1.5 text-mute">
            {properties.length === 0
              ? "Add a property to start recording turnovers and stays."
              : `${plural(properties.length, "property", "properties")}, ${plural(roomCount, "room")}, ${plural(ledgerCount, "ledger entry", "ledger entries")}.`}
          </p>
        </div>
        <details className="group w-full sm:w-auto" open={properties.length === 0}>
          <summary className={`${button("primary", "md")} cursor-pointer list-none sm:ml-auto [&::-webkit-details-marker]:hidden`}>
            <Plus className="size-4" aria-hidden="true" />
            Add property
          </summary>
          <Panel className="mt-3 p-5 sm:absolute sm:right-6 sm:z-10 sm:w-[560px] sm:shadow-2xl sm:shadow-black/60">
            <PropertyForm action={addProperty} submitLabel="Add property" />
          </Panel>
        </details>
      </div>

      {properties.length > 0 && (
        <>
          <section className="mt-8" aria-label="Overview">
            <OverviewPanel data={overview} />
          </section>
          <section className="mt-8">
            <SectionHeading title={`Next ${DAYS} days`} />
            <StayCalendar days={days} rows={calendarRows} todayKey={days[0]} />
          </section>
        </>
      )}

      <section className="mt-10">
        {properties.length > 0 && <SectionHeading title="Properties" count={properties.length} />}
        {properties.length === 0 ? (
          <EmptyState title="No properties yet">
            A property holds your rooms and stays. Crew and guest links are made from its stays.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-edge overflow-hidden rounded-[14px] border border-edge bg-graphite">
            {properties.map((p) => {
              const current = p.reservations.find((s) => new Date(s.starts_at) <= now);
              const next = p.reservations.find((s) => new Date(s.starts_at) > now);
              return (
                <li key={p.id}>
                  <Link
                    href={`/dashboard/properties/${p.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-white/[0.03] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[17px] font-semibold text-white">{p.name}</p>
                      <p className="truncate text-[13px] text-mute">
                        {p.address ? `${p.address}, ` : ""}
                        {plural(p.rooms.length, "room")}
                      </p>
                    </div>
                    <div className="order-last col-span-2 min-w-0 text-sm sm:order-none sm:col-span-1">
                      {current ? (
                        <p className="truncate">
                          <Badge tone="sky" className="mr-2">
                            In house
                          </Badge>
                          <span className="text-white">{current.guest_name || "Guest"}</span>
                          <span className="text-mute"> until {fmtDateTime(current.ends_at, p.timezone)}</span>
                        </p>
                      ) : next ? (
                        <p className="truncate">
                          <span className="text-mute">Next: </span>
                          <span className="text-white">
                            {fmtDay(next.starts_at, p.timezone)} to {fmtDay(next.ends_at, p.timezone)}
                          </span>
                          <span className="text-mute">
                            , {next.guest_name || "guest"} ({SOURCE_LABEL[next.source] ?? next.source}),{" "}
                            {plural(nightsBetween(next.starts_at, next.ends_at, p.timezone), "night")}
                          </span>
                        </p>
                      ) : (
                        <p className="text-mute">No upcoming stays</p>
                      )}
                    </div>
                    <ChevronRight className="size-5 text-mute" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <SectionHeading title="Recent activity" />
        <ActivityList
          items={activity}
          showProperty
          now={now}
          empty="When crew or guests record a photo from their link, it shows up here."
        />
      </section>
    </div>
  );
}
