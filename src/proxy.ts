import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/update-session";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Only manager-facing routes. Crew/guest magic-link pages and the API don't use cookie sessions.
export const config = { matcher: ["/dashboard/:path*", "/login"] };
