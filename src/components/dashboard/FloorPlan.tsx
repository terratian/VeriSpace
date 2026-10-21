import type { PlacedRoom } from "@/lib/model";

/** Top-down plan of the rooms, one drawing per floor. */
export function FloorPlan({ rooms }: { rooms: PlacedRoom[] }) {
  if (rooms.length === 0) return null;
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
  return (
    <div className="space-y-4">
      {floors.map((floor) => {
        const rs = rooms.filter((r) => r.floor === floor);
        const minX = Math.min(...rs.map((r) => r.x));
        const minY = Math.min(...rs.map((r) => r.y));
        const maxX = Math.max(...rs.map((r) => r.x + r.w));
        const maxY = Math.max(...rs.map((r) => r.y + r.d));
        const pad = 0.6;
        return (
          <figure key={floor}>
            {floors.length > 1 && <figcaption className="mb-1 text-[12px] text-mute">Floor {floor}</figcaption>}
            <svg
              viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
              role="img"
              aria-label={`Floor plan${floors.length > 1 ? `, floor ${floor}` : ""}: ${rs.map((r) => r.name).join(", ")}`}
              className="max-h-[360px] w-full rounded-lg border border-edge bg-obsidian"
            >
              {rs.map((r) => (
                <g key={r.id}>
                  <rect x={r.x} y={r.y} width={r.w} height={r.d} strokeWidth="0.08" className="fill-slate-brand/60 stroke-mint" />
                  <text
                    x={r.x + r.w / 2}
                    y={r.y + r.d / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.max(0.35, Math.min(r.w, r.d) * 0.16)}
                    className="fill-ash"
                  >
                    {r.name}
                  </text>
                </g>
              ))}
            </svg>
          </figure>
        );
      })}
    </div>
  );
}
