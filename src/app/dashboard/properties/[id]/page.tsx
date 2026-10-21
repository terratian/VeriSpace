import { Box, ListChecks, Plus } from "lucide-react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ActivityList, type ActivityItem } from "@/components/dashboard/ActivityList";
import { AddRoomForm } from "@/components/dashboard/AddRoomForm";
import { AddStayForm } from "@/components/dashboard/AddStayForm";
import { ReadinessPanel } from "@/components/dashboard/ReadinessPanel";
import { PropertyForm } from "@/components/dashboard/PropertyForm";
import { RoomChain } from "@/components/dashboard/RoomChain";
import { StayRow, type StayData } from "@/components/dashboard/StayRow";
import type { ChainEntry } from "@/components/ChainStrip";
import { Badge, Breadcrumbs, DbError, EmptyState, Panel, SectionHeading } from "@/components/ui/primitives";
import { button } from "@/components/ui/styles";
import { describeDbError } from "@/lib/db-errors";
import { eventLabel } from "@/lib/labels";
import { computeReadiness, type ReadyEvent } from "@/lib/readiness";
import { createSessionClient } from "@/lib/supabase/ssr-server";
import { zoneAbbreviation } from "@/lib/time";
import { updateProperty } from "../../actions";

export const dynamic = "force-dynamic";

interface RoomData {
  id: string;
  name: string;
  room_state_ledger: { count: number }[];
}
interface LedgerData {
  id: number;
  seq: number;
  room_id: string;
  event_type: string;
  actor_role: string;
  created_at: string;
  frame_sha256: string | null;
}

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();

  const supabase = createSessionClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Row Level Security hides other owners' properties, so a foreign id behaves like a missing one.
  const { data: property, error } = await supabase
    .from("properties")
    .select("id, name, address, timezone, rooms(id, name, room_state_ledger(count))")
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

  const rooms = (property.rooms ?? []) as unknown as RoomData[];
  const roomIds = rooms.map((r) => r.id);
  const now = new Date();
  const tz = property.timezone as string;
  const zoneLabel = `${tz.replace(/_/g, " ")}, ${zoneAbbreviation(now, tz)}`;

  const [staysRes, ledgerRes] = await Promise.all([
    supabase.from("reservations").select("id, starts_at, ends_at, guest_name, source").eq("property_id", id).order("starts_at"),
    roomIds.length
      ? supabase
          .from("room_state_ledger")
          .select("id, seq, room_id, event_type, actor_role, created_at, frame_sha256")
          .in("room_id", roomIds)
          .order("created_at", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [] as LedgerData[], error: null }),
  ]);
  if (staysRes.error) {
    return (
      <div className="py-8">
        <DbError message={describeDbError(staysRes.error)} />
      </div>
    );
  }

  const stays = (staysRes.data ?? []) as unknown as StayData[];
  const live = stays.filter((s) => new Date(s.ends_at) > now);
  const past = stays.filter((s) => new Date(s.ends_at) <= now).reverse().slice(0, 8);

  // Readiness follows the stay whose turnover crew most recently worked: the latest ended stay, else the next one.
  const turnover = past[0] ?? live[0] ?? null;
  let readiness = null as ReturnType<typeof computeReadiness> | null;
  if (turnover && rooms.length > 0) {
    const [itemsRes, eventsRes] = await Promise.all([
      supabase.from("room_checklist_items").select("id, room_id, requires_photo").in("room_id", roomIds),
      supabase
        .from("room_state_ledger")
        .select("room_id, event_type, payload, frame_sha256")
        .in("room_id", roomIds)
        .in("event_type", ["clean_start", "clean_end", "checklist_item", "damage_report"])
        .eq("payload->>reservationId", turnover.id)
        .limit(1000),
    ]);
    // If the guide migration isn't applied the item query fails; readiness then rests on finished rooms alone.
    const items = itemsRes.error ? [] : ((itemsRes.data ?? []) as { id: string; room_id: string; requires_photo: boolean | null }[]);
    readiness = computeReadiness(
      rooms.map((r) => ({
        id: r.id,
        name: r.name,
        items: items.filter((i) => i.room_id === r.id).map((i) => ({ id: i.id, requiresPhoto: !!i.requires_photo })),
      })),
      eventsRes.error ? [] : ((eventsRes.data ?? []) as unknown as ReadyEvent[]),
    );
  }

  const ledger = (ledgerRes.data ?? []) as unknown as LedgerData[];
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const entriesByRoom = new Map<string, ChainEntry[]>();
  for (const row of [...ledger].reverse()) {
    const list = entriesByRoom.get(row.room_id) ?? [];
    list.push({ seq: row.seq, label: eventLabel(row.event_type), role: row.actor_role });
    entriesByRoom.set(row.room_id, list);
  }
  const activity: ActivityItem[] = ledger.slice(0, 12).map((r) => ({
    id: r.id,
    seq: r.seq,
    eventType: r.event_type,
    actorRole: r.actor_role,
    createdAt: r.created_at,
    hash: r.frame_sha256,
    room: roomName.get(r.room_id) ?? "a room",
  }));

  const summary = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";

  return (
    <div className="py-8">
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Properties", href: "/dashboard" }, { label: property.name }]}
      />

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold">{property.name}</h1>
          <p className="mt-1.5 text-mute">{property.address || "No address added"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{zoneLabel}</Badge>
          <a href={`/dashboard/properties/${property.id}/guide`} className={button("secondary", "sm")}>
            <ListChecks className="size-4" aria-hidden="true" />
            Set up guide
          </a>
          <a href={`/dashboard/properties/${property.id}/setup`} className={button("secondary", "sm")}>
            <Box className="size-4" aria-hidden="true" />
            Model
          </a>
        </div>
      </header>

      {readiness && turnover && (
        <ReadinessPanel
          readiness={readiness}
          stayLabel={`${turnover.guest_name?.trim() || "Guest"}, checkout ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: tz }).format(new Date(turnover.ends_at))}`}
        />
      )}

      <details className="mt-4">
        <summary className="inline cursor-pointer text-sm text-mute hover:text-white">Property settings</summary>
        <Panel className="mt-3 p-5">
          <PropertyForm
            action={updateProperty}
            submitLabel="Save changes"
            propertyId={property.id}
            initial={{ name: property.name, address: property.address, timezone: tz }}
          />
        </Panel>
      </details>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-10">
          <section>
            <SectionHeading title="Stays" count={live.length} />
            <details className="mb-4" open={stays.length === 0}>
              <summary className={`${button("secondary", "sm")} ${summary}`}>
                <Plus className="size-4" aria-hidden="true" />
                Add stay
              </summary>
              <Panel className="mt-3 p-5">
                <AddStayForm propertyId={property.id} zoneLabel={zoneLabel} />
              </Panel>
            </details>

            {live.length === 0 ? (
              <EmptyState title="No upcoming stays">
                Add a stay, then create the guest and crew links for it.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-edge overflow-hidden rounded-[14px] border border-edge bg-graphite">
                {live.map((s) => (
                  <StayRow key={s.id} stay={s} tz={tz} now={now} />
                ))}
              </ul>
            )}

            {past.length > 0 && (
              <details className="mt-4">
                <summary className="inline cursor-pointer text-sm text-mute hover:text-white">Past stays ({past.length})</summary>
                <ul className="mt-3 divide-y divide-edge overflow-hidden rounded-[14px] border border-edge bg-graphite">
                  {past.map((s) => (
                    <StayRow key={s.id} stay={s} tz={tz} now={now} />
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section>
            <SectionHeading title="Recent activity" />
            <ActivityList
              items={activity}
              now={now}
              empty="Create a crew link for a stay and take a photo from it. The entry appears here."
            />
          </section>
        </div>

        <aside>
          <SectionHeading title="Rooms" count={rooms.length} />
          {rooms.length === 0 ? (
            <EmptyState title="No rooms yet">Add the rooms crew and guests will photograph, such as Living room or Kitchen.</EmptyState>
          ) : (
            <div className="space-y-3">
              {rooms.map((r) => (
                <Panel key={r.id} className="p-4">
                  <RoomChain
                    roomId={r.id}
                    name={r.name}
                    entries={entriesByRoom.get(r.id) ?? []}
                    total={r.room_state_ledger?.[0]?.count ?? 0}
                  />
                </Panel>
              ))}
            </div>
          )}
          <Panel className="mt-3 p-4">
            <AddRoomForm propertyId={property.id} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
