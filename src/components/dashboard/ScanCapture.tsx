"use client";

import { Camera, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { button } from "@/components/ui/styles";
import { CaptureError, sendEvent, uploadShot } from "@/lib/captureClient";
import { encodeJpeg } from "@/lib/encode";
import { hashFrame } from "@/lib/frameHasher";
import { SCAN_COMPLETE_EVENT, SCAN_FRAME_EVENT, angleDiff, lookDirection, lookDistance, matchTarget, roundLook, scanTargets, wrap360, type Look } from "@/lib/scan";

type Phase = "idle" | "starting" | "sweeping" | "saving" | "done";
interface Taken {
  blob: Blob;
  sha256: string;
  width: number;
  height: number;
  yaw: number;
  pitch: number;
  roll: number;
}
interface Orientation {
  alpha: number;
  beta: number;
  gamma: number;
  compass: boolean;
}

const MIN_FRAMES = 8;
const TARGETS = scanTargets();

/** Where a target sits on the dot map: angle is the yaw, distance from the centre grows as the view tilts down. */
function dot(t: Look, size: number) {
  const r = (48 - t.pitch * 0.5) * (size / 200);
  const a = (t.yaw * Math.PI) / 180;
  return { x: size / 2 + r * Math.sin(a), y: size / 2 - r * Math.cos(a) };
}

/**
 * Guided room scan. The person stands in the middle and turns on the spot; the phone's direction
 * sensors say where it points, and a photo is taken as each marker is reached. Every photo is hashed
 * on the phone, uploaded, and sealed in the room's ledger with its direction, then one closing entry
 * records the time and place. Without direction sensors it falls back to taking the photos in order.
 */
export default function ScanCapture({ roomId, roomName, token, demo = false }: { roomId: string; roomName: string; token: string; demo?: boolean }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const orient = useRef<Orientation | null>(null);
  const sawAbsolute = useRef(false);
  const startYaw = useRef<number | null>(null);
  const taken = useRef<Taken[]>([]);
  const done = useRef(new Set<number>());
  const sealed = useRef(new Set<number>());
  const busy = useRef(false);
  const steady = useRef({ at: 0, look: null as Look | null, t: 0 });
  const scanId = useRef(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "");
  const startedAt = useRef("");
  const geo = useRef<{ lat: number; lng: number; accuracy?: number } | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"sensor" | "manual">("sensor");
  const [look, setLook] = useState<Look | null>(null);
  const [count, setCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  async function start() {
    setError("");
    setPhase("starting");
    scanId.current ||= crypto.randomUUID();
    startedAt.current = new Date().toISOString();
    taken.current = [];
    done.current = new Set();
    sealed.current = new Set();
    startYaw.current = null;
    orient.current = null;
    setCount(0);
    setDoneCount(0);

    // iPhones ask for motion access, and only when it comes from a tap.
    try {
      const req = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
      if (typeof req === "function") await req.call(DeviceOrientationEvent);
    } catch {
      // Without it the scan falls back to photos in order.
    }

    const onOrientation = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return;
      const heading = e.webkitCompassHeading;
      const absolute = heading != null || e.absolute === true || e.type === "deviceorientationabsolute";
      if (e.type !== "deviceorientationabsolute" && sawAbsolute.current) return;
      if (e.type === "deviceorientationabsolute") sawAbsolute.current = true;
      orient.current = { alpha: heading != null ? wrap360(360 - heading) : e.alpha, beta: e.beta, gamma: e.gamma, compass: absolute };
    };
    window.addEventListener("deviceorientationabsolute", onOrientation as EventListener);
    window.addEventListener("deviceorientation", onOrientation as EventListener);
    cleanup.current = () => {
      window.removeEventListener("deviceorientationabsolute", onOrientation as EventListener);
      window.removeEventListener("deviceorientation", onOrientation as EventListener);
    };

    navigator.geolocation?.getCurrentPosition(
      (p) => {
        geo.current = { lat: Math.round(p.coords.latitude * 1e5) / 1e5, lng: Math.round(p.coords.longitude * 1e5) / 1e5, accuracy: Math.round(p.coords.accuracy) };
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't open the camera.");
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
      }
    } catch (err) {
      cleanup.current();
      setPhase("idle");
      setError(err instanceof DOMException && err.name === "NotAllowedError" ? "Camera access is blocked. Allow it in your browser settings and try again." : err instanceof Error ? err.message : "No camera could be opened.");
      return;
    }
    // Give the sensors a moment to report; if they never do, take photos in order.
    await new Promise((r) => setTimeout(r, 900));
    setMode(orient.current ? "sensor" : "manual");
    setPhase("sweeping");
  }
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);
  // The preview element changes between screens, so attach the camera to whichever one is showing.
  useEffect(() => {
    const v = video.current;
    if (v && stream.current && v.srcObject !== stream.current) {
      v.srcObject = stream.current;
      v.play().catch(() => {});
    }
  }, [phase]);

  const currentLook = useCallback((): Look | null => {
    const o = orient.current;
    if (!o) return null;
    const l = lookDirection(o.alpha, o.beta, o.gamma);
    if (o.compass) return l;
    if (startYaw.current === null) startYaw.current = l.yaw;
    return { yaw: wrap360(l.yaw - startYaw.current), pitch: l.pitch };
  }, []);

  const capture = useCallback(
    async (viaSensor: Look | null) => {
      const v = video.current;
      if (!v || !v.videoWidth || busy.current || taken.current.length >= 40) return;
      busy.current = true;
      try {
        const { blob, width, height } = await encodeJpeg(v, v.videoWidth, v.videoHeight);
        const sha256 = await hashFrame(blob);
        let at: Look;
        let targetIndex: number | null;
        if (viaSensor) {
          at = roundLook(viaSensor);
          targetIndex = matchTarget(viaSensor, TARGETS, done.current, 14);
        } else {
          const next = TARGETS.findIndex((_, i) => !done.current.has(i));
          targetIndex = next === -1 ? null : next;
          at = roundLook(targetIndex === null ? { yaw: 0, pitch: 0 } : TARGETS[targetIndex]);
        }
        taken.current.push({ blob, sha256, width, height, yaw: at.yaw, pitch: at.pitch, roll: 0 });
        if (targetIndex !== null) done.current.add(targetIndex);
        setCount(taken.current.length);
        setDoneCount(done.current.size);
        setFlash(true);
        setTimeout(() => setFlash(false), 160);
      } catch (err) {
        setError(err instanceof Error ? err.message : "That photo couldn't be captured.");
      } finally {
        busy.current = false;
      }
    },
    [],
  );

  // While sweeping: follow the phone's direction and take a photo when it holds still on a marker.
  useEffect(() => {
    if (phase !== "sweeping" || mode !== "sensor") return;
    const timer = setInterval(() => {
      const l = currentLook();
      if (!l) return;
      setLook(l);
      const now = Date.now();
      const s = steady.current;
      const speed = s.look && s.t ? lookDistance(s.look, l) / Math.max(0.05, (now - s.t) / 1000) : 999;
      steady.current = { look: l, t: now, at: speed < 18 ? s.at || now : 0 };
      const target = matchTarget(l, TARGETS, done.current, 8);
      if (target !== null && steady.current.at && now - steady.current.at > 350) capture(l);
    }, 100);
    return () => clearInterval(timer);
  }, [phase, mode, currentLook, capture]);

  async function finish() {
    stop();
    cleanup.current();
    setPhase("saving");
    setError("");
    const frames = taken.current;
    try {
      for (let i = 0; i < frames.length; i++) {
        setProgress(i);
        if (sealed.current.has(i)) continue;
        const f = frames[i];
        if (!demo) {
          const stored = await uploadShot(token, roomId, f);
          if (stored === "skipped") throw new CaptureError("Photo storage isn't set up yet, so this scan can't be sealed. Add the storage settings and try again.", false, 501);
          await sendEvent(token, {
            roomId,
            eventType: SCAN_FRAME_EVENT,
            shot: { sha256: f.sha256, width: f.width, height: f.height, blob: f.blob, source: "camera" },
            extra: { scanId: scanId.current, index: i, yaw: f.yaw, pitch: f.pitch, roll: f.roll },
          });
        } else {
          await new Promise((r) => setTimeout(r, 60));
        }
        sealed.current.add(i);
      }
      if (!demo) {
        await sendEvent(token, {
          roomId,
          eventType: SCAN_COMPLETE_EVENT,
          extra: {
            scanId: scanId.current,
            frames: frames.length,
            mode,
            compass: orient.current?.compass ?? false,
            startedAt: startedAt.current,
            endedAt: new Date().toISOString(),
            ...(geo.current ? { geo: geo.current } : {}),
          },
        });
      }
      setPhase("done");
      if (!demo) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The scan couldn't be saved. Try again.");
      setPhase("sweeping");
      // Frames already sealed stay sealed; saving again carries on from there.
    }
  }

  const nextTarget = look ? [...TARGETS.keys()].filter((i) => !done.current.has(i)).sort((a, b) => lookDistance(look, TARGETS[a]) - lookDistance(look, TARGETS[b]))[0] : undefined;
  const hint = (() => {
    if (mode === "manual") return doneCount === 0 ? "Face the main door and take a photo. Then turn a little to the right and repeat." : "Turn a little to the right and take the next photo.";
    if (!look || nextTarget === undefined) return "Hold the phone upright and turn slowly.";
    const t = TARGETS[nextTarget];
    const dy = angleDiff(look.yaw, t.yaw);
    const dp = t.pitch - look.pitch;
    const parts = [Math.abs(dy) > 6 && (dy > 0 ? `turn right ${Math.round(Math.abs(dy))}°` : `turn left ${Math.round(Math.abs(dy))}°`), Math.abs(dp) > 6 && (dp > 0 ? `tilt up ${Math.round(Math.abs(dp))}°` : `tilt down ${Math.round(Math.abs(dp))}°`)].filter(Boolean);
    return parts.length ? parts.join(", ").replace(/^./, (c) => c.toUpperCase()) : "Hold still";
  })();

  if (phase === "idle" || phase === "starting") {
    return (
      <div className="max-w-[560px]">
        <h2 className="text-lg font-semibold">Scan {roomName}</h2>
        <p className="mt-2 text-sm text-ash">
          Stand in the middle of the room and hold the phone upright. Turn slowly on the spot. The app takes a photo each time you reach a marker, a ring around the room plus the ceiling and floor. Each photo is fingerprinted on your phone and sealed in the room&apos;s record with its direction, the time and your location.
        </p>
        <video ref={video} playsInline muted className="hidden" />
        <button type="button" onClick={start} disabled={phase === "starting"} className={`${button("primary", "lg")} mt-5`}>
          {phase === "starting" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
          Start scan
        </button>
        {demo && <p className="mt-3 text-sm text-amber">Demo: photos are not saved.</p>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-flag/40 bg-flag/10 px-3 py-2 text-sm text-flag">{error}</p>}
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div role="status" className="max-w-[560px]">
        <p className="flex items-center gap-2 text-lg font-semibold text-mint">
          <CheckCircle2 className="size-5" aria-hidden="true" /> {demo ? "Scan finished (demo)" : "Scan sealed"}
        </p>
        <p className="mt-2 text-sm text-ash">{taken.current.length} photos were {demo ? "taken" : "sealed in the ledger"}.</p>
        <button type="button" onClick={() => setPhase("idle")} className={`${button("secondary", "md")} mt-4`}>
          Scan again
        </button>
      </div>
    );
  }

  const size = 160;
  return (
    <div className="max-w-[640px]">
      <div className="relative overflow-hidden rounded-[14px] border border-edge bg-black">
        <video ref={video} playsInline muted className="aspect-[3/4] w-full object-cover sm:aspect-video" />
        {flash && <div className="absolute inset-0 bg-white/70" aria-hidden="true" />}
        {phase === "sweeping" && (
          <>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute right-3 top-3 rounded-full bg-black/55" aria-label={`${doneCount} of ${TARGETS.length} markers reached`} role="img">
              {TARGETS.map((t, i) => {
                const p = dot(t, size);
                return <circle key={i} cx={p.x} cy={p.y} r={5} fill={done.current.has(i) ? "#66FCF1" : "none"} stroke="#66FCF1" strokeOpacity={done.current.has(i) ? 1 : 0.6} />;
              })}
              {look && (() => {
                const p = dot(look, size);
                return <circle cx={p.x} cy={p.y} r={9} fill="none" stroke="#fff" strokeWidth={2} />;
              })()}
            </svg>
            <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-8 text-center text-[17px] font-medium text-white">{hint}</p>
          </>
        )}
        {phase === "saving" && (
          <div className="absolute inset-0 grid place-items-center bg-black/75 text-center">
            <div>
              <Loader2 className="mx-auto size-6 animate-spin text-mint" aria-hidden="true" />
              <p className="mt-3 text-white">Sealing photo {Math.min(progress + 1, taken.current.length)} of {taken.current.length}</p>
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-sm text-mute" aria-live="polite">
        {count} photos taken{mode === "sensor" ? `, ${doneCount} of ${TARGETS.length} markers reached` : ""}.
        {mode === "manual" && " This phone doesn't report its direction, so photos are placed in order."}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={() => capture(mode === "sensor" ? currentLook() : null)} disabled={phase !== "sweeping"} className={button("secondary", "lg")}>
          <Camera className="size-4" aria-hidden="true" /> Take photo
        </button>
        <button type="button" onClick={finish} disabled={phase !== "sweeping" || count < MIN_FRAMES} className={button("primary", "lg")}>
          {count < MIN_FRAMES ? `Finish (need ${MIN_FRAMES - count} more)` : "Finish and seal"}
        </button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-flag/40 bg-flag/10 px-3 py-2 text-sm text-flag">{error}</p>}
    </div>
  );
}
