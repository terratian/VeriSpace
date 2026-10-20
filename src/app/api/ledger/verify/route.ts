import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { verifyRoomChain } from "@/lib/ledger";
import { supabaseLedgerDb } from "@/lib/supabase/server";

/** Re-compute a room's hash chain. Owning manager only. */
export async function GET(request: Request) {
  try {
    const principal = await authenticate(request);
    if (!principal) return Response.json({ error: "unauthorized" }, { status: 401 });
    const roomId = z.guid().parse(new URL(request.url).searchParams.get("roomId"));
    return Response.json(await verifyRoomChain(supabaseLedgerDb(), principal, roomId));
  } catch (err) {
    return errorResponse(err);
  }
}
