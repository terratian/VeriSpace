import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/ssr-server";

export async function POST(request: Request) {
  await createSessionClient(await cookies()).auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
