import { Camera, Plus } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import {
  AddChecklistForm,
  AddContentForm,
  ProceduresForm,
  RemoveContentButton,
  RemoveTaskButton,
} from "@/components/dashboard/GuideForms";
import { Badge, Breadcrumbs, DbError, EmptyState, Panel } from "@/components/ui/primitives";
import { button } from "@/components/ui/styles";
import { describeDbError } from "@/lib/db-errors";
import { KIND_LABELS, toChecklistItem, toContent } from "@/lib/guide";
import { createSessionClient } from "@/lib/supabase/ssr-server";

export const dynamic = "force-dynamic";

const summary = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();

  const supabase = createSessionClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: property, error } = await supabase
    .from("properties")
    .select("id, name, checkin_instructions, checkout_instructions, house_rules, rooms(id, name)")
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

  const rooms = (property.rooms ?? []) as { id: string; name: string }[];
  const roomIds = rooms.map((r) => r.id);

  const [contentRes, itemsRes] = roomIds.length
    ? await Promise.all([
        supabase.from("room_content").select("id, room_id, kind, title, body").in("room_id", roomIds).order("created_at"),
        supabase.from("room_checklist_items").select("id, room_id, label, requires_photo").in("room_id", roomIds).order("created_at"),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const loadError = contentRes.error ?? itemsRes.error;
  if (loadError) {
    return (
      <div className="py-8">
        <DbError message={describeDbError(loadError)} />
      </div>
    );
  }

  const content = (contentRes.data ?? []) as { id: string; room_id: string; kind: string; title: string; body: string | null }[];
  const items = (itemsRes.data ?? []) as { id: string; room_id: string; label: string; requires_photo: boolean | null }[];

  return (
    <div className="py-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Properties", href: "/dashboard" },
          { label: property.name, href: `/dashboard/properties/${property.id}` },
          { label: "Guide" },
        ]}
      />

      <header className="mt-4">
        <h1 className="text-3xl font-semibold">Property guide</h1>
        <p className="mt-1.5 max-w-[62ch] text-mute">
          Write what guests need to know and what crew need to check, room by room. Guests see it on their link. Crew work through
          the checklist on theirs, and each task they complete goes into the ledger.
        </p>
      </header>

      <section className="mt-8">
        <h2 className="mb-3 text-[17px] font-semibold">Procedures</h2>
        <Panel className="p-5">
          <ProceduresForm
            propertyId={property.id}
            initial={{
              checkin: property.checkin_instructions ?? "",
              checkout: property.checkout_instructions ?? "",
              rules: property.house_rules ?? "",
            }}
          />
        </Panel>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-[17px] font-semibold">Rooms</h2>
        {rooms.length === 0 ? (
          <EmptyState
            title="No rooms yet"
            action={
              <Link href={`/dashboard/properties/${property.id}`} className={button("secondary", "md")}>
                Add rooms
              </Link>
            }
          >
            Add the rooms first, then describe each one here.
          </EmptyState>
        ) : (
          <div className="space-y-6">
            {rooms.map((room) => {
              const roomContent = content.filter((c) => c.room_id === room.id).map(toContent);
              const roomItems = items.filter((i) => i.room_id === room.id).map(toChecklistItem);
              return (
                <Panel key={room.id} className="p-5">
                  <h3 className="text-lg font-semibold">{room.name}</h3>

                  <div className="mt-5 grid gap-8 lg:grid-cols-2">
                    <section aria-label={`Guest information for ${room.name}`}>
                      <h4 className="font-medium">Guest information</h4>
                      <p className="mt-1 text-[13px] text-mute">Shown to guests and crew when they open this room.</p>

                      {roomContent.length > 0 && (
                        <ul className="mt-3 divide-y divide-edge border-y border-edge">
                          {roomContent.map((c) => (
                            <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-white">{c.title}</span>
                                  <Badge tone={c.kind === "allergen" ? "amber" : "neutral"}>{KIND_LABELS[c.kind]}</Badge>
                                </div>
                                {c.body && <p className="mt-1 whitespace-pre-line text-sm text-ash">{c.body}</p>}
                              </div>
                              <RemoveContentButton id={c.id} title={c.title} />
                            </li>
                          ))}
                        </ul>
                      )}

                      <details className="mt-3" open={roomContent.length === 0}>
                        <summary className={`${button("secondary", "sm")} ${summary}`}>
                          <Plus className="size-4" aria-hidden="true" />
                          Add information
                        </summary>
                        <div className="mt-3">
                          <AddContentForm roomId={room.id} />
                        </div>
                      </details>
                    </section>

                    <section aria-label={`Crew checklist for ${room.name}`}>
                      <h4 className="font-medium">Crew checklist</h4>
                      <p className="mt-1 text-[13px] text-mute">Crew tick these off during a turnover. A room can&apos;t be finished until they are all done.</p>

                      {roomItems.length > 0 && (
                        <ul className="mt-3 divide-y divide-edge border-y border-edge">
                          {roomItems.map((i) => (
                            <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                              <span className="flex min-w-0 items-center gap-2 text-white">
                                <span className="truncate">{i.label}</span>
                                {i.requiresPhoto && (
                                  <Badge tone="sky">
                                    <Camera className="size-3" aria-hidden="true" />
                                    Photo
                                  </Badge>
                                )}
                              </span>
                              <RemoveTaskButton id={i.id} label={i.label} />
                            </li>
                          ))}
                        </ul>
                      )}

                      <details className="mt-3" open={roomItems.length === 0}>
                        <summary className={`${button("secondary", "sm")} ${summary}`}>
                          <Plus className="size-4" aria-hidden="true" />
                          Add task
                        </summary>
                        <div className="mt-3">
                          <AddChecklistForm roomId={room.id} />
                        </div>
                      </details>
                    </section>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
