import { alertWorthy, sendAlerts } from "@/lib/alerts";
import type { AppendHooks } from "@/lib/ledger";
import { requestOrigin } from "@/lib/origin";
import { serviceClient } from "@/lib/supabase/server";

/** After an entry is recorded, tell the owner about problems. Failures are logged, never raised. */
export function alertHook(headers: Headers): AppendHooks["afterAppend"] {
  return async ({ room, eventType, payload, actorRole }) => {
    if (!alertWorthy(eventType, payload)) return;
    const db = serviceClient();
    const [{ data: property }, { data: roomRow }] = await Promise.all([
      db.from("properties").select("name, owner_id, alert_email, alert_phone").eq("id", room.propertyId).maybeSingle(),
      db.from("rooms").select("name").eq("id", room.id).maybeSingle(),
    ]);
    if (!property) return;
    const p = property as { name: string; owner_id: string; alert_email: string | null; alert_phone: string | null };
    let email = p.alert_email;
    if (!email) {
      const { data } = await db.auth.admin.getUserById(p.owner_id);
      email = data.user?.email ?? null;
    }
    const res = await sendAlerts(
      {
        propertyName: p.name,
        roomName: (roomRow as { name: string } | null)?.name ?? "a room",
        eventType,
        note: typeof payload.note === "string" ? payload.note : undefined,
        category: typeof payload.category === "string" ? payload.category : undefined,
        byRole: actorRole,
        link: `${requestOrigin(headers)}/dashboard/properties/${room.propertyId}`,
      },
      { email, phone: p.alert_phone },
    );
    if (res.email === "failed" || res.sms === "failed") console.error("alert delivery failed", res);
  };
}
