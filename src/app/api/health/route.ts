import { demoEnabled } from "@/lib/demo";
/**
 * What this deployment has configured, with no secrets: booleans and the commit it was built from.
 * Open it after deploying to see at a glance what is missing.
 */
export const dynamic = "force-dynamic";

const set = (name: string) => Boolean(process.env[name]);

export function GET() {
  return Response.json({
    ok: true,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    configured: {
      supabaseUrl: set("NEXT_PUBLIC_SUPABASE_URL"),
      supabasePublishableKey: set("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      supabaseServiceRole: set("SUPABASE_SERVICE_ROLE_KEY"),
      capabilitySecret: set("CAPABILITY_SECRET"),
      alertEmail: set("RESEND_API_KEY") && set("ALERT_FROM_EMAIL"),
      alertSms: set("PLIVO_AUTH_ID") && set("PLIVO_AUTH_TOKEN") && set("PLIVO_FROM"),
      cronSecret: set("CRON_SECRET"),
      appOrigin: set("APP_ORIGIN"),
      photoStorage: set("STORAGE_ENDPOINT") && set("STORAGE_BUCKET") && set("STORAGE_ACCESS_KEY_ID") && set("STORAGE_SECRET_ACCESS_KEY"),
      demoPages: demoEnabled(),
    },
  });
}
