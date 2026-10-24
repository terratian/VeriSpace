import { after } from "next/server";
import { alertHook } from "@/lib/alertHook";
import { authenticate } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http";
import { appendLedgerEvent } from "@/lib/ledger";
import { photoStoreFromEnv } from "@/lib/storage";
import { supabaseLedgerDb } from "@/lib/supabase/server";

/** Append one event to a room's ledger. Crew/guest links or the owning manager. */
export async function POST(request: Request) {
  try {
    const principal = await authenticate(request);
    if (!principal) return Response.json({ error: "unauthorized" }, { status: 401 });
    // With storage configured, a photo fingerprint is only accepted once the photo is stored.
    const event = await appendLedgerEvent(supabaseLedgerDb(), principal, await readJson(request), photoStoreFromEnv() ?? undefined, {
      afterAppend: (info) => {
        const hook = alertHook(request.headers);
        after(() => hook?.(info));
      },
    });
    return Response.json(event, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
