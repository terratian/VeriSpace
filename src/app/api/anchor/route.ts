import { anchorProperty, DEFAULT_TSA } from "@/lib/anchorRun";
import { serviceClient } from "@/lib/supabase/server";

/**
 * Timestamps every property's records with an outside authority. Run daily by the host's scheduler,
 * which sends `Authorization: Bearer $CRON_SECRET`. Does nothing without that secret.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set. Add it in the hosting settings and redeploy." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed" }, { status: 401 });

  const db = serviceClient();
  const { data, error } = await db.from("properties").select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const tsa = process.env.TSA_URL || DEFAULT_TSA;
  const results = [];
  for (const p of (data ?? []) as { id: string }[]) results.push(await anchorProperty(db, p.id, tsa));
  return Response.json({ tsa, results });
}
