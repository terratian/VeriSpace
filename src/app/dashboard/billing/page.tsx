import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Badge, Breadcrumbs, DbError, EmptyState, Panel } from "@/components/ui/primitives";
import { PricingTable, money } from "@/components/PricingBreakdown";
import { billingStatus, PRICE_CENTS_PER_PROPERTY } from "@/lib/billing";
import { describeDbError } from "@/lib/db-errors";
import { createSessionClient } from "@/lib/supabase/ssr-server";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export default async function BillingPage() {
  const supabase = createSessionClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Only the account owner's own properties count; shared ones (as a co-manager) are billed to their owner.
  const { data, error } = await supabase.from("properties").select("id, name, created_at, archived_at").eq("owner_id", user.id).order("created_at");
  const archivedMissing = error?.code === "42703";
  const res = archivedMissing ? await supabase.from("properties").select("id, name, created_at").eq("owner_id", user.id).order("created_at") : { data, error };
  if (res.error) {
    return (
      <div className="py-8">
        <DbError message={describeDbError(res.error)} />
      </div>
    );
  }
  const rows = ((res.data ?? []) as { id: string; name: string; created_at: string; archived_at?: string | null }[]).map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: new Date(r.created_at),
    archivedAt: r.archived_at ? new Date(r.archived_at) : null,
  }));
  const status = billingStatus(rows);

  const line = (id: string, archived: boolean) => {
    if (archived) return { label: "Archived, not billed", tone: "neutral" as const, amount: money(0) };
    if (status.inFreeWindow && id === status.freePropertyId) return { label: `Free until ${fmtDate(status.freeUntil!)}`, tone: "mint" as const, amount: money(0) };
    return { label: "Billed monthly", tone: "neutral" as const, amount: money(PRICE_CENTS_PER_PROPERTY) };
  };

  return (
    <div className="py-8">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Properties", href: "/dashboard" }, { label: "Billing" }]} />
      <h1 className="mt-4 text-3xl font-semibold">Billing</h1>

      <Panel className="mt-6 max-w-[620px] p-5">
        <p className="text-[13px] text-mute">Each month at today&apos;s count</p>
        <p className="mt-1 text-[40px] font-semibold leading-none tabular-nums" data-testid="monthly-total">
          {money(status.monthlyCents)}
        </p>
        <p className="mt-3 text-[15px] text-ash">
          {status.activeCount === 0
            ? "You have no active properties."
            : status.inFreeWindow
              ? `${status.activeCount} active ${status.activeCount === 1 ? "property" : "properties"}. Your first is free for ${status.freeDaysLeft} more ${status.freeDaysLeft === 1 ? "day" : "days"}, until ${fmtDate(status.freeUntil!)}.`
              : `${status.activeCount} active ${status.activeCount === 1 ? "property" : "properties"} at ${money(PRICE_CENTS_PER_PROPERTY)} each.`}
        </p>
        <p className="mt-3 rounded-lg border border-edge px-3 py-2 text-[13px] text-mute">Payments aren&apos;t switched on yet, so nothing is being charged. When they are, you&apos;ll add a card here before your free period ends and we&apos;ll remind you first.</p>
      </Panel>

      <section className="mt-10" aria-labelledby="by-property">
        <h2 id="by-property" className="mb-3 text-xl font-semibold">
          By property
        </h2>
        {rows.length === 0 ? (
          <EmptyState title="No properties yet">Add a property to see how it is billed.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead>
                <tr className="text-[13px] text-mute">
                  <th className="px-2 py-2 font-medium">Property</th>
                  <th className="px-2 py-2 font-medium">Added</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">Per month</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const l = line(r.id, Boolean(r.archivedAt));
                  return (
                    <tr key={r.id} className="border-t border-edge text-[14px]">
                      <td className="px-2 py-3 text-white">{r.name}</td>
                      <td className="px-2 py-3 text-mute">{fmtDate(r.createdAt)}</td>
                      <td className="px-2 py-3">
                        <Badge tone={l.tone}>{l.label}</Badge>
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">{l.amount}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-edge text-[14px] font-semibold">
                  <td className="px-2 py-3" colSpan={3}>
                    Total
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">{money(status.monthlyCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="rules">
        <h2 id="rules" className="mb-3 text-xl font-semibold">
          How the price works
        </h2>
        <p className="mb-3 max-w-[64ch] text-[15px] text-ash">
          {money(PRICE_CENTS_PER_PROPERTY)} per active property per month. Your first property is free for 3 months from the day you added it. Archived properties are not billed. Crew links, guest links and co-managers are free.
        </p>
        <PricingTable />
      </section>
    </div>
  );
}
