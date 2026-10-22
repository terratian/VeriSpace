import CaptureApp from "@/components/capture/CaptureApp";
import type { RoomFeatureInfo } from "@/components/capture/RoomList";
import { Logo } from "@/components/ui/primitives";
import { EMPTY_PROCEDURES, toChecklistItem, toContent, type ChecklistItem, type Procedures, type RoomContent } from "@/lib/guide";
import { FEATURE_STATUS_EVENT, featureStatuses, stateOf, toFeature } from "@/lib/model";
import { doneItemIds } from "@/lib/readiness";
import { verifyCapability, type CapabilityRole } from "@/lib/capability";
import { env } from "@/lib/env";
import { BUCKET, type GuestResource, type ResourceRow } from "@/lib/resources";
import { storageConfigFromEnv } from "@/lib/storage";
import { serviceClient } from "@/lib/supabase/server";

const PROBLEMS = {
  expired: {
    title: "This link has expired",
    body: "Ask the property manager for a new one.",
  },
  not_yet_valid: {
    title: "This link isn't active yet",
    body: "It opens at the start of its time window. Try again then, or ask the property manager.",
  },
  invalid: {
    title: "This link isn't valid",
    body: "Check that you opened the whole link, or ask the property manager to send it again.",
  },
} as const;

function LinkProblem({ reason }: { reason: keyof typeof PROBLEMS }) {
  const { title, body } = PROBLEMS[reason];
  return (
    <main className="mx-auto max-w-[480px] px-5 py-16">
      <Logo className="text-[15px]" />
      <div role="alert" className="mt-12">
        <h1 className="text-[26px] font-semibold leading-tight">{title}</h1>
        <p className="mt-2 max-w-[40ch] text-ash">{body}</p>
      </div>
    </main>
  );
}

/** Verifies a magic link on the server, then hands the capture screens what they need. */
export default async function LinkGate({ token, role }: { token: string; role: CapabilityRole }) {
  const result = await verifyCapability(env.capabilitySecret, token);
  if (!result.ok || result.claims.role !== role) {
    return <LinkProblem reason={result.ok ? "invalid" : result.reason} />;
  }

  const { claims } = result;
  const db = serviceClient();

  let roomQuery = db.from("rooms").select("id, name").eq("property_id", claims.propertyId).order("name");
  if (claims.roomIds) roomQuery = roomQuery.in("id", claims.roomIds);

  const [roomsRes, propertyRes, stayRes] = await Promise.all([
    roomQuery,
    db.from("properties").select("name").eq("id", claims.propertyId).maybeSingle(),
    claims.reservationId
      ? db.from("reservations").select("guest_name, ends_at").eq("id", claims.reservationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (roomsRes.error) throw new Error(roomsRes.error.message);

  // The stay only adds a greeting and a default photo type, so a failed lookup isn't fatal.
  const stay = stayRes.error ? null : (stayRes.data as { guest_name: string | null; ends_at: string } | null);
  const rooms = (roomsRes.data ?? []) as { id: string; name: string }[];
  const roomIds = rooms.map((r) => r.id);

  // The guide is optional: if its migration isn't applied yet these queries fail and the screens still work.
  let guide: Procedures = EMPTY_PROCEDURES;
  const contentByRoom = new Map<string, RoomContent[]>();
  const tasksByRoom = new Map<string, ChecklistItem[]>();
  const doneByRoom = new Map<string, string[]>();
  const featuresByRoom = new Map<string, RoomFeatureInfo[]>();
  const resourcesByRoom = new Map<string, GuestResource[]>();
  const resourcesByFeature = new Map<string, GuestResource[]>();

  if (roomIds.length > 0) {
    if (role === "guest") {
      const [procRes, contentRes] = await Promise.all([
        db.from("properties").select("checkin_instructions, checkout_instructions, house_rules").eq("id", claims.propertyId).maybeSingle(),
        db.from("room_content").select("id, room_id, kind, title, body").in("room_id", roomIds).order("created_at"),
      ]);
      if (!procRes.error && procRes.data) {
        const p = procRes.data as { checkin_instructions: string | null; checkout_instructions: string | null; house_rules: string | null };
        guide = { checkin: p.checkin_instructions ?? "", checkout: p.checkout_instructions ?? "", rules: p.house_rules ?? "" };
      }
      // Guides and links. A PDF gets a signed address that lasts a few hours, so the file stays private.
      const resRes = await db.from("room_resources").select("id, room_id, feature_id, kind, title, url, storage_path").in("room_id", roomIds).order("created_at");
      if (!resRes.error) {
        for (const row of (resRes.data ?? []) as ResourceRow[]) {
          let url = row.url;
          if (row.kind === "pdf" && row.storage_path) {
            const signed = await db.storage.from(BUCKET).createSignedUrl(row.storage_path, 6 * 3600);
            url = signed.data?.signedUrl ?? null;
          }
          if (!url) continue;
          const item: GuestResource = { id: row.id, title: row.title, kind: row.kind, url };
          const map = row.feature_id ? resourcesByFeature : resourcesByRoom;
          const key = row.feature_id ?? row.room_id;
          map.set(key, [...(map.get(key) ?? []), item]);
        }
      }
      // Features guests can use, with their current status read from the ledger.
      const featRes = await db
        .from("room_features")
        .select("id, room_id, kind, name, pos_x, pos_y, advertised, details")
        .in("room_id", roomIds)
        .eq("advertised", true)
        .order("created_at");
      if (!featRes.error && (featRes.data ?? []).length > 0) {
        const evRes = await db
          .from("room_state_ledger")
          .select("event_type, payload")
          .in("room_id", roomIds)
          .eq("event_type", FEATURE_STATUS_EVENT)
          .order("seq");
        const statuses = featureStatuses(evRes.error ? [] : ((evRes.data ?? []) as { event_type: string; payload: unknown }[]));
        for (const row of (featRes.data ?? []) as Parameters<typeof toFeature>[0][]) {
          const f = toFeature(row);
          const s = stateOf(statuses, f.id);
          featuresByRoom.set(f.roomId, [...(featuresByRoom.get(f.roomId) ?? []), { id: f.id, name: f.name, kind: f.kind, status: s.status, note: s.note, resources: resourcesByFeature.get(f.id) }]);
        }
      }
      if (!contentRes.error) {
        for (const row of (contentRes.data ?? []) as { id: string; room_id: string; kind: string; title: string; body: string | null }[]) {
          contentByRoom.set(row.room_id, [...(contentByRoom.get(row.room_id) ?? []), toContent(row)]);
        }
      }
    } else {
      const itemsRes = await db
        .from("room_checklist_items")
        .select("id, room_id, label, requires_photo")
        .in("room_id", roomIds)
        .order("created_at");
      if (!itemsRes.error) {
        for (const row of (itemsRes.data ?? []) as { id: string; room_id: string; label: string; requires_photo: boolean | null }[]) {
          tasksByRoom.set(row.room_id, [...(tasksByRoom.get(row.room_id) ?? []), toChecklistItem(row)]);
        }
        // Tasks already recorded for this stay, so a reopened link shows them ticked.
        if (claims.reservationId && tasksByRoom.size > 0) {
          const evRes = await db
            .from("room_state_ledger")
            .select("room_id, event_type, payload, frame_sha256")
            .in("room_id", roomIds)
            .eq("event_type", "checklist_item")
            .eq("payload->>reservationId", claims.reservationId);
          if (!evRes.error) {
            const events = (evRes.data ?? []) as { room_id: string; event_type: string; payload: unknown; frame_sha256: string | null }[];
            for (const [id, items] of tasksByRoom) {
              doneByRoom.set(id, [...doneItemIds(items, events.filter((e) => e.room_id === id))]);
            }
          }
        }
      }
    }
  }

  return (
    <CaptureApp
      token={token}
      role={role}
      propertyName={(propertyRes.data as { name: string } | null)?.name ?? "Your property"}
      guestName={stay?.guest_name ?? null}
      endsAt={stay?.ends_at ?? null}
      expiresAt={result.expiresAt.toISOString()}
      rooms={rooms.map((r) => ({
        ...r,
        content: contentByRoom.get(r.id) ?? [],
        resources: resourcesByRoom.get(r.id) ?? [],
        features: featuresByRoom.get(r.id) ?? [],
        checklist: tasksByRoom.get(r.id) ?? [],
        doneItems: doneByRoom.get(r.id) ?? [],
      }))}
      guide={guide}
      storageEnabled={storageConfigFromEnv() !== null}
    />
  );
}
