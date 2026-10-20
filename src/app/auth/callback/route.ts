import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeNext } from "@/lib/safeNext";
import { createSessionClient } from "@/lib/supabase/ssr-server";

/** OAuth / magic-link return point: swaps the one-time code for a session cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = createSessionClient(await cookies());
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=signin_failed", url.origin));
}
