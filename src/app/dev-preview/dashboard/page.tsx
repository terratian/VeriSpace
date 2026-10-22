import { notFound } from "next/navigation";
import { demoEnabled } from "@/lib/demo";
import AppHeader from "@/components/AppHeader";
import { OverviewPanel } from "@/components/dashboard/OverviewPanel";
import { StayCalendar } from "@/components/dashboard/StayCalendar";
import { calendarDays, dayCells, dayKeyInZone, occupancyPercent, weekCounts } from "@/lib/overview";

// Dev-only: the dashboard widgets with sample data, for checking both themes without signing in.
export default function Page() {
  if (!demoEnabled()) notFound();
  const now = Date.now();
  const at = (d: number) => new Date(now + d * 86_400_000).toISOString();
  const days = calendarDays(dayKeyInZone(new Date(), "UTC"), 14);
  const sets: [string, { startsAt: string; endsAt: string }[]][] = [
    ["Cedar Hollow Cabin", [{ startsAt: at(-1), endsAt: at(2) }, { startsAt: at(2), endsAt: at(5) }, { startsAt: at(8), endsAt: at(11) }]],
    ["Lakeview Loft", [{ startsAt: at(1), endsAt: at(4) }, { startsAt: at(6), endsAt: at(9) }]],
    ["Maple Street Duplex", []],
  ];
  const rows = sets.map(([name, stays], i) => ({ id: `p${i}`, name, cells: dayCells(stays, "UTC", days) }));
  return (
    <>
      <AppHeader email="preview@example.com" />
      <main className="mx-auto max-w-[1120px] space-y-8 px-4 py-8 sm:px-6">
        <OverviewPanel
          data={{ turnovers: { ready: 1, inProgress: 1, notStarted: 1 }, occupancy: occupancyPercent(rows.map((r) => r.cells)), week: weekCounts(rows.map((r) => r.cells)), damage: 2, days: 14 }}
        />
        <StayCalendar days={days} rows={rows} todayKey={days[0]} />
      </main>
    </>
  );
}
