import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Badge, Breadcrumbs, DbError, EmptyState } from "@/components/ui/primitives";
import { PrintButton } from "@/components/ui/PrintButton";
import { describeChange, type ChangeRow } from "@/lib/changes";
import { describeDbError } from "@/lib/db-errors";
import { byline } from "@/lib/issues";
import { eventLabel } from "@/lib/labels";
import { BASELINE_EVENT, STATUS_LABELS, type FeatureStatus } from "@/lib/model";
import { photoStoreFromEnv } from "@/lib/storage";
import { createSessionClient } from "@/lib/supabase/ssr-server";
import { fmtDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Unit condition record" };
export const dynamic = "force-dynamic";

interface Entry {
  id: number;
  seq: number;
  room_id: string;
  event_type: string;
  actor_role: string;
  created_at: string;
  payload: Record<string, unknown> | null;
  frame_sha256: string | null;
  row_hash: string;
}

const th = "px-2 py-2 text-left text-[12px] font-medium text-mute";
const td = "px-2 py-2 align-top text-[13px]";

/** A printable record of a unit's condition and everything done to it around one stay. */
export default async function CustodyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stay?: string }>;
}) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const { stay: stayParam } = await searchParams;

  const supabase = createSessionClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: property, error } = await supabase
    .from("properties")
    .select("id, name, address, timezone, rooms(id, name)")
    .eq("id", id)
    .order("created_at", { referencedTable: "rooms" })
    .maybeSingle();
  if (error) {
    return (
      <div className="py-8">
        <DbError message={describeDbError(error)} />
      </div>
    );
  }
  if (!property) notFound();

  const tz = property.timezone as string;
  const rooms = (property.rooms ?? []) as { id: string; name: string }[];
  const roomIds = rooms.map((r) => r.id);
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const base = `/dashboard/properties/${property.id}`;

  const { data: staysData } = await supabase
    .from("reservations")
    .select("id, starts_at, ends_at, guest_name")
    .eq("property_id", id)
    .lte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: false })
    .limit(20);
  const stays = (staysData ?? []) as { id: string; starts_at: string; ends_at: string; guest_name: string | null }[];
  const stay = stays.find((s) => s.id === stayParam) ?? stays[0] ?? null;

  const crumbs = (
    <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Properties", href: "/dashboard" }, { label: property.name, href: base }, { label: "Condition record" }]} />
  );
  if (!stay || roomIds.length === 0) {
    return (
      <div className="py-8">
        {crumbs}
        <div className="mt-8">
          <EmptyState title="Nothing to report yet">A record needs at least one room and one stay that has started.</EmptyState>
        </div>
      </div>
    );
  }

  const [entriesRes, featuresRes, ...chains] = await Promise.all([
    supabase
      .from("room_state_ledger")
      .select("id, seq, room_id, event_type, actor_role, created_at, payload, frame_sha256, row_hash")
      .in("room_id", roomIds)
      .order("created_at")
      .limit(3000),
    supabase.from("room_features").select("id, name").in("room_id", roomIds),
    ...roomIds.map((rid) => supabase.rpc("verify_room_chain", { p_room_id: rid })),
  ]);
  if (entriesRes.error) {
    return (
      <div className="py-8">
        <DbError message={describeDbError(entriesRes.error)} />
      </div>
    );
  }

  const entries = (entriesRes.data ?? []) as unknown as Entry[];

  // Independent timestamps: the signed proofs, and whether today's records still match the latest one.
  const { data: anchorData } = await supabase
    .from("ledger_anchors")
    .select("id, digest, heads, gen_time, created_at, tsa_url")
    .eq("property_id", id)
    .order("created_at", { ascending: false })
    .limit(10);
  const anchors = (anchorData ?? []) as { id: string; digest: string; heads: { roomId: string; seq: number; rowHash: string }[]; gen_time: string | null; created_at: string; tsa_url: string }[];
  const { data: changeData } = await supabase
    .from("config_audit")
    .select("id, table_name, op, old_row, new_row, actor_email, created_at")
    .eq("property_id", id)
    .order("id", { ascending: false })
    .limit(100);
  const changes = (changeData ?? []) as unknown as ChangeRow[];
  let anchorMatches: boolean | null = null;
  if (anchors[0]) {
    anchorMatches = true;
    for (const h of anchors[0].heads) {
      const { data: row } = await supabase.from("room_state_ledger").select("row_hash").eq("room_id", h.roomId).eq("seq", h.seq).maybeSingle();
      if ((row as { row_hash: string } | null)?.row_hash !== h.rowHash) anchorMatches = false;
    }
  }
  const featureName = new Map(((featuresRes.data ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name]));
  const seqOfId = new Map(entries.map((e) => [Number(e.id), e.seq]));
  const start = new Date(stay.starts_at).getTime();
  const end = new Date(stay.ends_at).getTime();

  // What the unit looked like going in: the latest baseline photo per room or feature before the stay.
  const latest = new Map<string, Entry>();
  for (const e of entries) {
    if (e.event_type !== BASELINE_EVENT || new Date(e.created_at).getTime() >= start) continue;
    latest.set(`${e.room_id}:${typeof e.payload?.itemId === "string" ? e.payload.itemId : "room"}`, e);
  }
  const baseline = [...latest.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Everything during the stay, plus anything filed against it afterwards (crew turnover, resolutions).
  const timeline = entries.filter((e) => {
    if (e.event_type === BASELINE_EVENT && !(new Date(e.created_at).getTime() >= start)) return false;
    const t = new Date(e.created_at).getTime();
    return e.payload?.reservationId === stay.id || (t >= start && t <= end);
  });

  const store = photoStoreFromEnv();
  const photoUrls = new Map<string, string>();
  if (store) {
    for (const e of [...baseline, ...timeline].filter((x) => x.frame_sha256).slice(0, 60)) {
      photoUrls.set(`${e.id}`, await store.signedUrl(property.id, e.frame_sha256 as string, 3600));
    }
  }

  const detail = (e: Entry): string => {
    const p = e.payload ?? {};
    const parts: string[] = [];
    const feat = typeof p.featureId === "string" ? featureName.get(p.featureId) : typeof p.itemId === "string" ? featureName.get(p.itemId) : undefined;
    if (feat) parts.push(feat);
    if (typeof p.label === "string") parts.push(p.label);
    if (e.event_type === "feature_status" && typeof p.status === "string") parts.push(STATUS_LABELS[p.status as FeatureStatus] ?? p.status);
    if (e.event_type === "issue_resolved" && typeof p.issueId === "number") parts.push(`resolves entry ${seqOfId.get(p.issueId) ?? "?"}`);
    if (typeof p.note === "string" && p.note) parts.push(p.note);
    return parts.join(": ") || "";
  };

  const Row = ({ e }: { e: Entry }) => {
    const url = photoUrls.get(`${e.id}`);
    return (
      <tr className="border-t border-edge break-inside-avoid">
        <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtDateTime(e.created_at, tz)}</td>
        <td className={td}>{roomName.get(e.room_id) ?? "Room"}</td>
        <td className={td}>
          <span className="text-white">{eventLabel(e.event_type)}</span>
          {detail(e) && <span className="block text-ash">{detail(e)}</span>}
        </td>
        <td className={td}>{byline(e.actor_role, e.payload)}</td>
        <td className={`${td} font-mono text-[11px]`}>
          <span className="block">#{e.seq}</span>
          {e.frame_sha256 && (
            <span className="block break-all" title={e.frame_sha256}>
              {e.frame_sha256.slice(0, 16)}
            </span>
          )}
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={`Photo for entry ${e.seq}`} className="mt-1 h-14 rounded border border-edge object-cover print:h-20" />
          )}
        </td>
      </tr>
    );
  };

  const Table = ({ rows }: { rows: Entry[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>When</th>
            <th className={th}>Room</th>
            <th className={th}>Entry</th>
            <th className={th}>By</th>
            <th className={th}>Entry no. and photo fingerprint</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <Row key={e.id} e={e} />
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="py-8">
      <div className="print:hidden">{crumbs}</div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4 print:mt-0">
        <div>
          <h1 className="text-3xl font-semibold">Unit condition record</h1>
          <p className="mt-1.5 text-ash">
            {property.name}
            {property.address ? `, ${property.address}` : ""}
          </p>
          <p className="mt-1 text-mute">
            Stay: {stay.guest_name || "Guest not named"}, {fmtDateTime(stay.starts_at, tz)} to {fmtDateTime(stay.ends_at, tz)}
          </p>
          <p className="mt-1 text-[13px] text-mute">Generated {new Date().toISOString().replace("T", " ").slice(0, 19)} UTC</p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <a className="rounded-md border border-edge px-3 py-2 text-[13px] text-white hover:border-mint" href={`/api/properties/${property.id}/packet?stay=${stay.id}`}>
            Download dispute packet
          </a>
          <PrintButton />
        </div>
      </div>

      {stays.length > 1 && (
        <nav aria-label="Choose a stay" className="mt-5 flex flex-wrap gap-2 print:hidden">
          {stays.map((s) => (
            <Link
              key={s.id}
              href={`${base}/custody?stay=${s.id}`}
              aria-current={s.id === stay.id ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-[13px] ${s.id === stay.id ? "border-mint bg-mint/10 text-white" : "border-edge text-mute hover:text-white"}`}
            >
              {s.guest_name || "Guest"}, {fmtDateTime(s.starts_at, tz).split(",")[0]}
            </Link>
          ))}
        </nav>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-[17px] font-semibold">Record integrity</h2>
        <p className="mb-3 max-w-[70ch] text-[13px] text-mute">
          Each room has its own chain of entries. Every entry includes the fingerprint of the one before it, so any later change to an entry breaks the chain from that point. The check below was run when this
          page was generated.
        </p>
        <table className="w-full max-w-[520px] border-collapse">
          <thead>
            <tr>
              <th className={th}>Room</th>
              <th className={th}>Entries</th>
              <th className={th}>Chain</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r, i) => {
              const res = chains[i] as { data: unknown; error: unknown };
              const row = (Array.isArray(res.data) ? res.data[0] : res.data) as { ok: boolean; checked: number | string } | undefined;
              return (
                <tr key={r.id} className="border-t border-edge">
                  <td className={td}>{r.name}</td>
                  <td className={`${td} tabular-nums`}>{entries.filter((e) => e.room_id === r.id).length}</td>
                  <td className={td}>{res.error || !row ? <Badge>Not checked</Badge> : row.ok ? <Badge tone="mint">Intact</Badge> : <Badge tone="red">Broken at entry {Number(row.checked)}</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-[17px] font-semibold">Independent timestamps</h2>
        <p className="mb-3 max-w-[70ch] text-[13px] text-mute">
          Once a day, the latest fingerprint of every room is signed with the time by an outside timestamp authority. The signed proof does not depend on this server&apos;s clock or database, so it shows the
          record existed in this form no later than that time.
        </p>
        {anchors.length === 0 ? (
          <p className="text-mute">No timestamps yet. The first one is added after the next daily run.</p>
        ) : (
          <>
            <p className="mb-3 text-[13px]">
              {anchorMatches ? <Badge tone="mint">Records match the latest timestamp</Badge> : <Badge tone="red">Records differ from the latest timestamp</Badge>}
            </p>
            <table className="w-full max-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className={th}>Signed time</th>
                  <th className={th}>Fingerprint</th>
                  <th className={th}>Proof</th>
                </tr>
              </thead>
              <tbody>
                {anchors.map((a) => (
                  <tr key={a.id} className="border-t border-edge">
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtDateTime(a.gen_time ?? a.created_at, tz)}</td>
                    <td className={`${td} font-mono text-[11px]`} title={a.digest}>
                      {a.digest.slice(0, 16)}
                    </td>
                    <td className={`${td} print:hidden`}>
                      <a className="text-mint underline" href={`/api/anchors/${a.id}`}>
                        Download .tsr
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 max-w-[70ch] text-[12px] text-mute">
              To check a proof yourself: <code>openssl ts -verify -digest &lt;fingerprint&gt; -sha256 -in proof.tsr -CAfile authority-ca.pem</code>
            </p>
          </>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-[17px] font-semibold">Changes to rooms, assets and checks</h2>
        <p className="mb-3 max-w-[70ch] text-[13px] text-mute">
          Every edit to this property&apos;s setup is logged by the database itself, with who made it and when, and the log can&apos;t be edited or erased. Baseline photos are ledger entries and can&apos;t be changed at all.
        </p>
        {changes.length === 0 ? (
          <p className="text-mute">No changes logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>When</th>
                  <th className={th}>Change</th>
                  <th className={th}>By</th>
                </tr>
              </thead>
              <tbody>
                {changes.slice(0, 40).map((c) => (
                  <tr key={String(c.id)} className="border-t border-edge break-inside-avoid">
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtDateTime(c.created_at, tz)}</td>
                    <td className={td}>{describeChange(c)}</td>
                    <td className={td}>{c.actor_email ?? "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {changes.length > 40 && <p className="mt-2 text-[12px] text-mute">Showing the latest 40. The dispute packet has all of them.</p>}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-[17px] font-semibold">Condition at the start (baseline)</h2>
        {baseline.length === 0 ? <p className="text-mute">No baseline photos were recorded before this stay.</p> : <Table rows={baseline} />}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-[17px] font-semibold">During and after the stay</h2>
        {timeline.length === 0 ? <p className="text-mute">No entries were recorded for this stay.</p> : <Table rows={timeline} />}
      </section>

      <p className="mt-8 max-w-[70ch] text-[12px] text-mute">
        What this record shows: who added each entry (by role, and by name where the link was issued to a named person), when the server received it, and a SHA-256 fingerprint of each photo taken on the
        device before upload. A photo matches the record if re-hashing the original file gives the same fingerprint. It does not by itself prove the photo shows what it claims.
      </p>
    </div>
  );
}
