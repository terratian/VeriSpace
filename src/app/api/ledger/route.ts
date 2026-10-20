import { authenticate } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http";
import { appendLedgerEvent } from "@/lib/ledger";
import { supabaseLedgerDb } from "@/lib/supabase/server";

/** Append one event to a room's ledger. Crew/guest links or the owning manager. */
export async function POST(request: Request) {
  try {
    const principal = await authenticate(request);
    if (!principal) return Response.json({ error: "unauthorized" }, { status: 401 });
    const event = await appendLedgerEvent(supabaseLedgerDb(), principal, await readJson(request));
    return Response.json(event, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
