"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { saveLayoutBatch } from "@/app/dashboard/model-actions";
import { PropertyViewerLoader } from "@/components/dashboard/PropertyViewerLoader";
import type { ViewerFeature } from "@/components/dashboard/PropertyViewer";
import { FT, type PlacedRoom } from "@/lib/model";

/** A room on the plan, in feet. */
export interface EditorRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  floor: number;
}

const snap = (n: number) => Math.round(n);
const MIN = 3;
const toMeters = (rooms: EditorRoom[]): PlacedRoom[] => rooms.map((r) => ({ id: r.id, name: r.name, x: r.x * FT, y: r.y * FT, w: r.w * FT, d: r.d * FT, h: r.h * FT, floor: r.floor }));

type Drag = { id: string; mode: "move" | "resize"; sx: number; sy: number; orig: EditorRoom };

/**
 * Lay out the property by dragging rooms on a plan and pulling their corners. The 3D model beside it
 * updates when you let go, and the layout is saved. Arrow keys move the selected room (Shift for
 * five feet); Alt with the arrows resizes it.
 */
export function LayoutStudio({ rooms: initial, features, demo = false }: { rooms: EditorRoom[]; features: ViewerFeature[]; demo?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const floors = useMemo(() => [...new Set(initial.map((r) => r.floor))].sort((a, b) => a - b), [initial]);
  const [floor, setFloor] = useState(floors[0] ?? 0);
  const [rooms, setRooms] = useState(initial);
  const [committed, setCommitted] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const live = useRef(rooms);
  const drag = useRef<Drag | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const saveSeq = useRef(0);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (keyTimer.current && clearTimeout(keyTimer.current)), []);

  const update = (next: EditorRoom[]) => {
    live.current = next;
    setRooms(next);
  };

  async function commit(next: EditorRoom[]) {
    setCommitted(next);
    if (demo) {
      setStatus({ kind: "saved", message: "Demo: not saved" });
      return;
    }
    const seq = ++saveSeq.current;
    setStatus({ kind: "saving" });
    const fd = new FormData();
    fd.set("rooms", JSON.stringify(next.map((r) => ({ roomId: r.id, x: r.x, y: r.y, w: r.w, d: r.d }))));
    try {
      const res = await saveLayoutBatch(null, fd);
      if (seq !== saveSeq.current) return;
      setStatus(res?.ok ? { kind: "saved", message: "Saved" } : { kind: "error", message: res?.error ?? "Couldn't save the layout." });
    } catch {
      if (seq === saveSeq.current) setStatus({ kind: "error", message: "Couldn't save the layout. Check your connection." });
    }
  }

  // The view frames the saved layout, so it holds still while a room is being dragged.
  const view = useMemo(() => {
    const rs = committed.filter((r) => r.floor === floor);
    const pad = 10;
    const minX = Math.min(...rs.map((r) => r.x), 0) - pad;
    const minY = Math.min(...rs.map((r) => r.y), 0) - pad;
    const maxX = Math.max(...rs.map((r) => r.x + r.w), 40) + pad;
    const maxY = Math.max(...rs.map((r) => r.y + r.d), 30) + pad;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [committed, floor]);

  const point = (e: { clientX: number; clientY: number }) => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return { x: 0, y: 0 };
    const p = el.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(m.inverse());
    return { x: q.x, y: q.y };
  };

  function down(e: React.PointerEvent<SVGGElement>, r: EditorRoom, mode: Drag["mode"]) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    drag.current = { id: r.id, mode, sx: p.x, sy: p.y, orig: r };
    setSelected(r.id);
  }
  function move(e: React.PointerEvent<SVGGElement>) {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    const dx = p.x - d.sx;
    const dy = p.y - d.sy;
    update(
      live.current.map((r) =>
        r.id !== d.id
          ? r
          : d.mode === "move"
            ? { ...r, x: snap(d.orig.x + dx), y: snap(d.orig.y + dy) }
            : { ...r, w: Math.max(MIN, snap(d.orig.w + dx)), d: Math.max(MIN, snap(d.orig.d + dy)) },
      ),
    );
  }
  function up() {
    if (!drag.current) return;
    drag.current = null;
    void commit(live.current);
  }
  function key(e: React.KeyboardEvent<SVGGElement>, r: EditorRoom) {
    const step = e.shiftKey ? 5 : 1;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    update(live.current.map((x) => (x.id !== r.id ? x : e.altKey ? { ...x, w: Math.max(MIN, x.w + d[0]), d: Math.max(MIN, x.d + d[1]) } : { ...x, x: x.x + d[0], y: x.y + d[1] })));
    if (keyTimer.current) clearTimeout(keyTimer.current);
    keyTimer.current = setTimeout(() => void commit(live.current), 600);
  }

  const fs = view.w / 48;
  const onFloor = rooms.filter((r) => r.floor === floor);
  const sel = rooms.find((r) => r.id === selected);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[60ch] text-sm text-mute">Drag a room to move it and pull its corner to resize. Each grid square is 5 feet. Select a room and use the arrow keys for fine moves (Alt with arrows resizes).</p>
          <p role="status" aria-live="polite" className={`text-sm ${status.kind === "error" ? "text-flag" : status.kind === "saved" ? "text-mint" : "text-mute"}`}>
            {status.kind === "saving" ? "Saving…" : (status.message ?? "")}
          </p>
        </div>
        {floors.length > 1 && (
          <div role="tablist" aria-label="Floors" className="mb-2 flex gap-2">
            {floors.map((f) => (
              <button key={f} type="button" role="tab" aria-selected={f === floor} onClick={() => setFloor(f)} className={`h-8 rounded-full border px-3 text-[13px] ${f === floor ? "border-mint bg-mint/10 text-white" : "border-edge text-mute"}`}>
                Floor {f}
              </button>
            ))}
          </div>
        )}
        <svg
          ref={svg}
          data-testid="layout-plan"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="w-full touch-none select-none rounded-[14px] border border-edge bg-obsidian"
          style={{ aspectRatio: `${view.w} / ${view.h}`, maxHeight: 520 }}
          onPointerDown={() => setSelected(null)}
          role="group"
          aria-label="Floor plan. Rooms can be dragged."
        >
          <defs>
            <pattern id={`${uid}-grid`} width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M5 0H0V5" fill="none" strokeWidth="0.08" className="stroke-edge" />
            </pattern>
          </defs>
          <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={`url(#${uid}-grid)`} />
          {onFloor.map((r) => {
            const active = selected === r.id;
            const h = Math.max(1.2, fs * 1.6);
            return (
              <g
                key={r.id}
                data-room={r.name}
                tabIndex={0}
                role="button"
                aria-label={`${r.name}, ${Math.round(r.w)} by ${Math.round(r.d)} feet. Drag or use arrow keys to move.`}
                onPointerDown={(e) => down(e, r, "move")}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onFocus={() => setSelected(r.id)}
                onKeyDown={(e) => key(e, r)}
                className="cursor-grab outline-none active:cursor-grabbing"
              >
                <rect x={r.x} y={r.y} width={r.w} height={r.d} strokeWidth={active ? 0.35 : 0.2} className={`fill-slate-brand/70 ${active ? "stroke-mint" : "stroke-ash/60"}`} />
                <text x={r.x + r.w / 2} y={r.y + r.d / 2 - fs * 0.2} textAnchor="middle" fontSize={fs} className="pointer-events-none fill-white font-medium">
                  {r.name}
                </text>
                <text x={r.x + r.w / 2} y={r.y + r.d / 2 + fs * 1.1} textAnchor="middle" fontSize={fs * 0.8} className="pointer-events-none fill-mute">
                  {Math.round(r.w)} × {Math.round(r.d)} ft
                </text>
                <rect
                  data-handle="true"
                  x={r.x + r.w - h}
                  y={r.y + r.d - h}
                  width={h}
                  height={h}
                  rx={h * 0.2}
                  className="cursor-nwse-resize fill-mint"
                  onPointerDown={(e) => down(e as unknown as React.PointerEvent<SVGGElement>, r, "resize")}
                />
              </g>
            );
          })}
        </svg>
        {sel && (
          <p className="mt-2 text-sm text-ash">
            {sel.name}: {Math.round(sel.w)} by {Math.round(sel.d)} ft, {Math.round(sel.h)} ft ceiling, at {Math.round(sel.x)}, {Math.round(sel.y)}
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-[15px] font-semibold">3D model</h3>
        <PropertyViewerLoader rooms={toMeters(committed)} features={features} />
      </div>
    </div>
  );
}
