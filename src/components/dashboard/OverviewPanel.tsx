import { Panel } from "@/components/ui/primitives";

interface Segment {
  label: string;
  value: number;
  className: string;
}

function Ring({ segments, center, caption }: { segments: Segment[]; center: string; caption: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-[104px] shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={`${caption}: ${segments.map((s) => `${s.value} ${s.label}`).join(", ")}`}>
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" className="stroke-edge" />
          {total > 0 &&
            segments.map((s) => {
              const len = (s.value / total) * c;
              const el = (
                <circle
                  key={s.label}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  strokeWidth="10"
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                  className={s.className}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <span className="absolute inset-0 grid place-items-center text-2xl font-semibold text-white">{center}</span>
      </div>
      <ul className="space-y-1 text-[13px]">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span aria-hidden="true" className={`size-2 rounded-full ${s.className.replace("stroke-", "bg-")}`} />
            <span className="text-mute">{s.label}</span>
            <span className="tabular-nums text-white">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface OverviewData {
  turnovers: { ready: number; inProgress: number; notStarted: number };
  occupancy: number;
  week: { arrivals: number; departures: number; turns: number };
  damage: number;
  days: number;
}

export function OverviewPanel({ data }: { data: OverviewData }) {
  const t = data.turnovers;
  const tracked = t.ready + t.inProgress + t.notStarted;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Panel className="p-5">
        <h2 className="mb-4 text-[15px] font-semibold">Turnovers</h2>
        <Ring
          caption="Turnovers"
          center={`${t.ready}/${tracked}`}
          segments={[
            { label: "Ready", value: t.ready, className: "stroke-mint" },
            { label: "In progress", value: t.inProgress, className: "stroke-amber" },
            { label: "Not started", value: t.notStarted, className: "stroke-mute" },
          ]}
        />
        <p className="mt-3 text-[12px] text-mute">Latest checkout at each property, from crew entries in the ledger.</p>
      </Panel>
      <Panel className="p-5">
        <h2 className="mb-4 text-[15px] font-semibold">Occupancy</h2>
        <Ring
          caption="Occupancy"
          center={`${data.occupancy}%`}
          segments={[
            { label: "Occupied", value: data.occupancy, className: "stroke-sky" },
            { label: "Vacant", value: 100 - data.occupancy, className: "stroke-mute" },
          ]}
        />
        <p className="mt-3 text-[12px] text-mute">Nights booked over the next {data.days} days.</p>
      </Panel>
      <Panel className="p-5">
        <h2 className="mb-4 text-[15px] font-semibold">Next 7 days</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {[
            ["Arrivals", data.week.arrivals],
            ["Departures", data.week.departures],
            ["Same-day turns", data.week.turns],
            ["Damage reports", data.damage],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-[12px] text-mute">{label}</dt>
              <dd className={`text-2xl font-semibold tabular-nums ${label === "Damage reports" && (value as number) > 0 ? "text-flag" : "text-white"}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[12px] text-mute">Damage reports are from the latest turnovers.</p>
      </Panel>
    </div>
  );
}
