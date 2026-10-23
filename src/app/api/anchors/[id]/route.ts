import { cookies } from "next/headers";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/ssr-server";

/** Download the signed timestamp proof (.tsr) for one anchor. Row-level security limits it to the owner. */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) return Response.json({ error: "Not found" }, { status: 404 });
  const supabase = createSessionClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const { data } = await supabase.from("ledger_anchors").select("reply_b64, digest").eq("id", id).maybeSingle();
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  const row = data as { reply_b64: string; digest: string };
  return new Response(Buffer.from(row.reply_b64, "base64"), {
    headers: { "content-type": "application/timestamp-reply", "content-disposition": `attachment; filename="verispace-${row.digest.slice(0, 12)}.tsr"` },
  });
}
