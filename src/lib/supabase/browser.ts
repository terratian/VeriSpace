import { createBrowserClient } from "@supabase/ssr";

// NEXT_PUBLIC_* values must be referenced literally so Next can inline them into the bundle.
export const createBrowserSupabase = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
