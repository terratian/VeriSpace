"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
export default function ScanViewer({ frames, initialFrameFov = 60 }: { frames: ViewerFrame[]; initialFrameFov?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [fov, setFov] = useState(75);
  const [frameFov, setFrameFov] = useState(initialFrameFov);
  const [height, setHeight] = useState(420);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight || 420));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, yaw, pitch };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const perPx = fov / (box.current?.clientHeight || 420);
    setYaw(d.yaw - (e.clientX - d.x) * perPx);
    setPitch(clamp(d.pitch + (e.clientY - d.y) * perPx, -89, 89));
  };
  const onUp = () => {
    drag.current = null;
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
        className="relative h-[420px] w-full cursor-grab touch-none select-none overflow-hidden rounded-[14px] border border-edge bg-black outline-none focus-visible:ring-2 focus-visible:ring-mint active:cursor-grabbing sm:h-[520px]"
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
        </div>
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
