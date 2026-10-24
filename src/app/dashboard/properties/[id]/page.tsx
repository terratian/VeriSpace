import { PhoneQr } from "@/components/dashboard/PhoneQr";
import { Box, FileText, ListChecks, Plus } from "lucide-react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ActivityList, type ActivityItem } from "@/components/dashboard/ActivityList";
import { AddRoomForm } from "@/components/dashboard/AddRoomForm";
import { AddStayForm } from "@/components/dashboard/AddStayForm";
import { UpkeepPanel, type IssueView } from "@/components/dashboard/UpkeepPanel";
import { SetupProgress } from "@/components/dashboard/SetupProgress";
import { ReadinessPanel } from "@/components/dashboard/ReadinessPanel";
import { DeletePropertyForm } from "@/components/dashboard/DeletePropertyForm";
import { TeamForms, type Member } from "@/components/dashboard/TeamForms";
import { PropertyForm } from "@/components/dashboard/PropertyForm";
import { RoomChain } from "@/components/dashboard/RoomChain";
import { StayRow, type StayData } from "@/components/dashboard/StayRow";
import type { ChainEntry } from "@/components/ChainStrip";
import { Badge, Breadcrumbs, DbError, EmptyState, Panel, SectionHeading } from "@/components/ui/primitives";
import { button } from "@/components/ui/styles";
import { describeDbError } from "@/lib/db-errors";
import { setupSteps } from "@/lib/setup";
import { openIssues, type LedgerEntry } from "@/lib/issues";
import { eventLabel } from "@/lib/labels";
import { photoStoreFromEnv } from "@/lib/storage";
import { computeReadiness, type ReadyEvent } from "@/lib/readiness";
import { createSessionClient } from "@/lib/supabase/ssr-server";
import { zoneAbbreviation } from "@/lib/time";
import { updateProperty } from "../../actions";

export const dynamic = "force-dynamic";

interface RoomData {
  id: string;
  name: string;
  width_m: number | null;
  length_m: number | null;
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

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ settings?: string }> }) {
  const { id } = await params;
  const { settings } = await searchParams;
  if (!z.guid().safeParse(id).success) notFound();

  const supabase = createSessionClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Row Level Security hides other owners' properties, so a foreign id behaves like a missing one.
  const { data: property, error } = await supabase
    .from("properties")
    .select("id, name, address, timezone, rooms(id, name, width_m, length_m, room_state_ledger(count))")
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
  // Co-managers and alert contacts. Both need the newest migration; without it the section just shows empty.
  const [teamRes, memberRes] = await Promise.all([
    supabase.from("properties").select("owner_id, alert_email, alert_phone").eq("id", id).maybeSingle(),
    supabase.from("property_members").select("id, email").eq("property_id", id).order("created_at"),
  ]);
  const team = (teamRes.error ? null : teamRes.data) as { owner_id: string; alert_email: string | null; alert_phone: string | null } | null;
  const members = (memberRes.error ? [] : memberRes.data ?? []) as Member[];

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

  // How far setup has got. Each count is optional: a failed lookup (such as a migration not applied yet) counts as none.
  const head = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0, () => 0);
  const [featureCount, baselineCount, contentCount, taskCount, procRes] = roomIds.length
    ? await Promise.all([
        head(supabase.from("room_features").select("id", { count: "exact", head: true }).in("room_id", roomIds)),
        head(supabase.from("room_state_ledger").select("id", { count: "exact", head: true }).in("room_id", roomIds).eq("event_type", "baseline_photo")),
        head(supabase.from("room_content").select("id", { count: "exact", head: true }).in("room_id", roomIds)),
        head(supabase.from("room_checklist_items").select("id", { count: "exact", head: true }).in("room_id", roomIds)),
        supabase.from("properties").select("checkin_instructions, checkout_instructions, house_rules").eq("id", id).maybeSingle(),
      ])
    : [0, 0, 0, 0, null];
  const proc = procRes && !procRes.error ? (procRes.data as { checkin_instructions: string | null; checkout_instructions: string | null; house_rules: string | null } | null) : null;
  const steps = setupSteps(
    {
      rooms: rooms.length,
      roomsSized: rooms.filter((r) => r.width_m !== null && r.length_m !== null).length,
      features: featureCount,
      baselines: baselineCount,
      guideItems: contentCount + taskCount + (proc && (proc.checkin_instructions || proc.checkout_instructions || proc.house_rules) ? 1 : 0),
      stays: stays.length,
    },
    `/dashboard/properties/${property.id}`,
  );

  // Open problems, read from the ledger: a report with no later resolution pointing at it.
  const [issueRes, featureRes] = roomIds.length
    ? await Promise.all([
        supabase
          .from("room_state_ledger")
          .select("id, seq, room_id, event_type, actor_role, created_at, payload, frame_sha256")
          .in("room_id", roomIds)
          .in("event_type", ["issue_reported", "issue_resolved", "damage_report"])
          .order("created_at")
          .limit(1500),
        supabase.from("room_features").select("id, room_id, name").in("room_id", roomIds).order("created_at"),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const featureRows = featureRes.error ? [] : ((featureRes.data ?? []) as { id: string; room_id: string; name: string }[]);
  const photoStore = photoStoreFromEnv();
  const issues: IssueView[] = await Promise.all(
    openIssues(issueRes.error ? [] : ((issueRes.data ?? []) as unknown as LedgerEntry[]))
      .slice(0, 25)
      .map(async (i) => {
        const raw = ((issueRes.data ?? []) as unknown as LedgerEntry[]).find((e) => Number(e.id) === i.id);
        return {
          ...i,
          roomName: rooms.find((r) => r.id === i.roomId)?.name ?? "Room",
          featureName: featureRows.find((f) => f.id === i.featureId)?.name ?? null,
          payload: raw?.payload ?? null,
          photoUrl: photoStore && i.frameSha256 ? await photoStore.signedUrl(property.id, i.frameSha256, 3600) : null,
        };
      }),
  );

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
          <a href="?settings=1#settings" className={button("secondary", "sm")}>
            Settings and remove
          </a>
          <a href={`/dashboard/properties/${property.id}/guide`} className={button("secondary", "sm")}>
            <ListChecks className="size-4" aria-hidden="true" />
            Set up guide
          </a>
          <a href={`/dashboard/properties/${property.id}/setup`} className={button("secondary", "sm")}>
            <Box className="size-4" aria-hidden="true" />
            Model
          </a>
          <a href={`/dashboard/properties/${property.id}/custody`} className={button("secondary", "sm")}>
            <FileText className="size-4" aria-hidden="true" />
            Condition record
          </a>
        </div>
      </header>

      <SetupProgress steps={steps} />

      {readiness && turnover && (
        <ReadinessPanel
          readiness={readiness}
          stayLabel={`${turnover.guest_name?.trim() || "Guest"}, checkout ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: tz }).format(new Date(turnover.ends_at))}`}
        />
      )}

      <PhoneQr path={`/dashboard/properties/${property.id}/walk`} title="the walkthrough" />

      <details id="settings" className="mt-4" open={settings === "1" || undefined}>
        <summary className="inline cursor-pointer text-sm text-mint hover:underline">Property settings: rename, managers, alerts, remove property</summary>
        <Panel className="mt-3 p-5">
          <PropertyForm
            action={updateProperty}
            submitLabel="Save changes"
            propertyId={property.id}
            initial={{ name: property.name, address: property.address, timezone: tz }}
          />
          <TeamForms propertyId={property.id} isOwner={!team || team.owner_id === user.id} members={members} alertEmail={team?.alert_email ?? null} alertPhone={team?.alert_phone ?? null} />
          {(!team || team.owner_id === user.id) && <DeletePropertyForm propertyId={property.id} name={property.name} />}
        </Panel>
      </details>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-10">
          <section>
            <SectionHeading title="Issues and upkeep" count={issues.length} />
            <UpkeepPanel
              issues={issues}
              tz={tz}
              now={now}
              rooms={rooms.map((r) => ({ id: r.id, name: r.name, features: featureRows.filter((f) => f.room_id === r.id).map((f) => ({ id: f.id, name: f.name })) }))}
            />
          </section>

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
