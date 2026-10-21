import Link from "next/link";
import type { DayState } from "@/lib/overview";
import type { DayCell } from "@/lib/overview";

export interface CalendarRow {
  id: string;
  name: string;
  cells: DayCell[];
}

const STYLE: Record<DayState, { box: string; label: string }> = {
  vacant: { box: "border border-edge", label: "Vacant" },
  occupied: { box: "bg-sky/35", label: "Guest in house" },
  arrival: { box: "bg-mint", label: "Arrival" },
  departure: { box: "bg-amber", label: "Departure" },
  turn: { box: "bg-flag", label: "Same-day turn" },
};

const LEGEND: DayState[] = ["occupied", "arrival", "departure", "turn"];

/** Properties down the side, days across: stays at a glance, like a turnover board. */
export function StayCalendar({ days, rows, todayKey }: { days: string[]; rows: CalendarRow[]; todayKey: string }) {
  const fmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div>
      <div className="overflow-x-auto rounded-[14px] border border-edge bg-graphite">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Stays by property for the next {days.length} days</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-40 min-w-40 bg-graphite px-4 py-3 text-[12px] font-medium text-mute">
                Property
              </th>
              {days.map((d) => {
                const date = new Date(`${d}T00:00:00Z`);
                const today = d === todayKey;
                return (
                  <th key={d} scope="col" className={`px-0.5 py-2 text-center text-[11px] font-medium ${today ? "text-mint" : "text-mute"}`}>
                    <span className="sr-only">{fmt.format(date)}</span>
                    <span aria-hidden="true" className="block leading-tight">
                      {fmt.format(date).slice(0, 1)}
                      <span className="block tabular-nums">{date.getUTCDate()}</span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-edge">
                <th scope="row" className="sticky left-0 z-10 bg-graphite px-4 py-2.5 text-[14px] font-medium">
                  <Link href={`/dashboard/properties/${r.id}`} className="block max-w-36 truncate text-white hover:text-mint">
                    {r.name}
                  </Link>
                </th>
                {r.cells.map((c, i) => (
                  <td key={days[i]} className="px-0.5 py-2 text-center">
                    <span title={`${STYLE[c.state].label}, ${days[i]}`} className={`mx-auto block size-5 rounded-md ${STYLE[c.state].box} ${days[i] === todayKey ? "ring-1 ring-mint/60" : ""}`}>
                      <span className="sr-only">{STYLE[c.state].label}</span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-mute">
        {LEGEND.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-3 rounded ${STYLE[s].box}`} />
            {STYLE[s].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
