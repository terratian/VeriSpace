import { createServerClient } from "@supabase/ssr";
import type { cookies } from "next/headers";

/**
 * Supabase client acting as the signed-in user (publishable key + session cookies), so Row
 * Level Security applies. Use this in Server Components, Server Actions, and Route Handlers.
 * Use `serviceClient()` from ./server only for trusted server-side work that must bypass RLS.
 */
export function createSessionClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore: the proxy refreshes the session on each request.
          }
        },
      },
    },
  );
}
