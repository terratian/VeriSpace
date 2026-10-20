function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

/** Read lazily so `next build` works without secrets and errors name the missing variable. */
export const env = {
  get supabaseUrl() { return required("NEXT_PUBLIC_SUPABASE_URL"); },
  get publishableKey() { return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"); },
  get serviceRoleKey() { return required("SUPABASE_SERVICE_ROLE_KEY"); },
  get capabilitySecret() { return required("CAPABILITY_SECRET"); },
  get appOrigin() { return process.env.APP_ORIGIN ?? "http://localhost:3000"; },
};
