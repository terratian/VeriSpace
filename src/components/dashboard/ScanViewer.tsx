"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { screenToLook, type Look, type Pin } from "@/lib/scan";

export interface ViewerFrame {
  index: number;
  yaw: number;
  pitch: number;
  roll: number;
  width: number | null;
  height: number | null;
  url: string;
}

const R = 1000; // sphere radius in CSS pixels; only the ratios matter
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Look around a scanned room. Each photo is laid on an imaginary sphere at the direction the phone
 * was pointing. It uses CSS 3D rather than WebGL, so photos load straight from storage without
 * cross-origin setup. Photos are overlapped and feathered, not stitched.
 */
const PIN_COLOR = { working: "#66FCF1", degraded: "#FBBF24", out_of_service: "#F87171" } as const;

export default function ScanViewer({
  frames,
  pins = [],
  placingLabel,
  onPlace,
  onPinClick,
  initialFrameFov = 60,
}: {
  frames: ViewerFrame[];
  pins?: Pin[];
  /** Set while the owner is placing an asset: the next click on the room places it. */
  placingLabel?: string | null;
  onPlace?: (look: Look) => void;
  onPinClick?: (pin: Pin) => void;
  initialFrameFov?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [fov, setFov] = useState(75);
  const [frameFov, setFrameFov] = useState(initialFrameFov);
  const [height, setHeight] = useState(420);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight || 420));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) d.moved = true;
    const perPx = fov / (box.current?.clientHeight || 420);
    setYaw(d.yaw - (e.clientX - d.x) * perPx);
    setPitch(clamp(d.pitch + (e.clientY - d.y) * perPx, -89, 89));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    // A tap, not a drag, while placing an asset: work out which direction in the room was tapped.
    if (d && !d.moved && placingLabel && onPlace && e.type === "pointerup") {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const persp = rect.height / 2 / Math.tan((fov * Math.PI) / 360);
      onPlace(screenToLook(e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2, persp, { yaw, pitch }));
    }
  };
  const onKey = useCallback((e: React.KeyboardEvent) => {
    const step = 8;
    if (e.key === "ArrowLeft") setYaw((v) => v - step);
    else if (e.key === "ArrowRight") setYaw((v) => v + step);
    else if (e.key === "ArrowUp") setPitch((v) => clamp(v + step, -89, 89));
    else if (e.key === "ArrowDown") setPitch((v) => clamp(v - step, -89, 89));
    else return;
    e.preventDefault();
  }, []);

  const perspective = height / 2 / Math.tan((fov * Math.PI) / 360);
  const frameW = 2 * R * Math.tan((frameFov * Math.PI) / 360);

  return (
    <div>
      <div
        ref={box}
        tabIndex={0}
        role="application"
        aria-label="Room view. Drag or use the arrow keys to look around."
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        onWheel={(e) => setFov((v) => clamp(v + e.deltaY * 0.05, 35, 110))}
        className={`relative h-[420px] w-full ${placingLabel ? "cursor-crosshair" : "cursor-grab"} touch-none select-none overflow-hidden rounded-[14px] border border-edge bg-black outline-none focus-visible:ring-2 focus-visible:ring-mint sm:h-[520px]`}
        style={{ perspective: `${perspective}px` }}
      >
        <div
          data-testid="scan-scene"
          className="absolute left-1/2 top-1/2 size-0"
          style={{ transformStyle: "preserve-3d", transform: `translateZ(${perspective}px) rotateX(${-pitch}deg) rotateY(${-yaw}deg)` }}
        >
          {frames.map((f) => {
            const h = f.width && f.height ? (frameW * f.height) / f.width : frameW * 1.33;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={f.index}
                src={f.url}
                alt=""
                draggable={false}
                data-yaw={f.yaw}
                data-pitch={f.pitch}
                className="absolute"
                style={{
                  width: frameW,
                  maxWidth: "none",
                  height: h,
                  left: -frameW / 2,
                  top: -h / 2,
                  backfaceVisibility: "hidden",
                  transform: `rotateY(${-f.yaw}deg) rotateX(${f.pitch}deg) translateZ(${-R}px) rotateZ(${-f.roll}deg)`,
                  WebkitMaskImage: "radial-gradient(ellipse at center, #000 52%, transparent 100%)",
                  maskImage: "radial-gradient(ellipse at center, #000 52%, transparent 100%)",
                }}
              />
            );
          })}
          {pins.map((pin) => {
            const color = PIN_COLOR[pin.status ?? "working"];
            return (
              <button
                key={pin.id}
                type="button"
                aria-label={pin.label}
                onClick={() => onPinClick?.(pin)}
                className="absolute"
                style={{
                  left: -150,
                  top: -90,
                  width: 300,
                  height: 180,
                  transform: `rotateY(${-pin.yaw}deg) rotateX(${pin.pitch}deg) translateZ(${-R * 0.95}px)`,
                  background: "none",
                  border: 0,
                  cursor: onPinClick ? "pointer" : "inherit",
                }}
              >
                <span style={{ position: "absolute", left: 0, right: 0, top: 0, textAlign: "center" }}>
                  <span style={{ display: "inline-block", maxWidth: 300, padding: "6px 16px", borderRadius: 14, background: "rgba(11,12,16,.88)", border: `3px solid ${color}`, color: "#E8EAED", font: "600 36px ui-monospace, Menlo, monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {pin.label}
                  </span>
                </span>
                <span style={{ position: "absolute", left: 148, top: 62, width: 4, height: 70, background: color }} />
                <span style={{ position: "absolute", left: 128, top: 128, width: 44, height: 44, borderRadius: 22, background: color, boxShadow: `0 0 0 8px ${color}55` }} />
              </button>
            );
          })}
        </div>
        {placingLabel && (
          <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-mint px-3 py-1.5 text-sm font-medium text-obsidian">
            Tap where the {placingLabel} is
          </p>
        )}
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs text-ash">
          Drag to look around. Scroll to zoom.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-mute">
        <label className="flex items-center gap-2">
          Photo coverage
          <input type="range" min={40} max={90} value={frameFov} onChange={(e) => setFrameFov(Number(e.target.value))} className="accent-mint" />
          <span className="tabular-nums text-ash">{frameFov}°</span>
        </label>
        <span>If photos leave gaps or overlap too much, adjust this.</span>
      </div>
    </div>
  );
}
