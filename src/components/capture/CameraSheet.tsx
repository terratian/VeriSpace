"use client";

import { Camera, ImageUp, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Shot } from "@/lib/capture";
import { encodeJpeg } from "@/lib/encode";
import { hashFrame } from "@/lib/frameHasher";
import { button } from "@/components/ui/styles";

type Facing = "environment" | "user";

function Corner({ className }: { className: string }) {
  return <span aria-hidden="true" className={`absolute size-7 border-mint ${className}`} />;
}

/**
 * Full-screen camera. Grabs a frame from the live preview, or, when the browser won't open the
 * camera, falls back to the phone's own camera app through a file input. Either way the exact bytes
 * are hashed here, before anything else touches them.
 */
export function CameraSheet({ title, onShot, onClose }: { title: string; onShot: (shot: Shot) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [phase, setPhase] = useState<"starting" | "live" | "unavailable">("starting");
  const [reason, setReason] = useState("");
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [multiple, setMultiple] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let cancelled = false;
    setPhase("starting");

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase("unavailable");
        setReason(
          window.isSecureContext
            ? "This browser can't open the camera."
            : "The live camera needs a secure (https) connection.",
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        if (!cancelled) {
          setMultiple(cameras.length > 1);
          setPhase("live");
        }
      } catch (err) {
        if (cancelled) return;
        setPhase("unavailable");
        setReason(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera access is blocked. Allow it in your browser settings, or use your phone's camera app."
            : "No camera could be opened.",
        );
      }
    }
    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  async function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    setBusy(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);

    setProblem("");
    try {
      const { blob, width, height } = await encodeJpeg(video, video.videoWidth, video.videoHeight);
      // Hash the exact bytes that will be uploaded and recorded.
      const sha256 = await hashFrame(blob);
      onShot({ blob, sha256, width, height, url: URL.createObjectURL(blob), source: "camera" });
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "The photo couldn't be captured. Try again.");
      setBusy(false);
    }
  }

  /** A photo from the phone's camera app: decode it, then encode it the same way as a live frame. */
  async function onFile(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setProblem("");
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const { blob, width, height } = await encodeJpeg(bitmap, bitmap.width, bitmap.height);
        const sha256 = await hashFrame(blob);
        onShot({ blob, sha256, width, height, url: URL.createObjectURL(blob), source: "file" });
      } finally {
        bitmap.close();
      }
    } catch (err) {
      setProblem(err instanceof Error && err.message.includes("large") ? err.message : "That photo couldn't be read. Try taking it again.");
      setBusy(false);
    }
  }

  const fileInput = (
    <label className={`${button("secondary", "lg")} cursor-pointer`}>
      <ImageUp className="size-5" aria-hidden="true" />
      Use camera app
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={title}>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Camera preview"
          className={`absolute inset-0 h-full w-full object-cover ${phase === "live" ? "opacity-100" : "opacity-0"}`}
        />

        {phase === "live" && (
          <div className="pointer-events-none absolute inset-6">
            <Corner className="left-0 top-0 rounded-tl-sm border-l-2 border-t-2" />
            <Corner className="right-0 top-0 rounded-tr-sm border-r-2 border-t-2" />
            <Corner className="bottom-0 left-0 rounded-bl-sm border-b-2 border-l-2" />
            <Corner className="bottom-0 right-0 rounded-br-sm border-b-2 border-r-2" />
          </div>
        )}

        {phase === "unavailable" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
            <Camera className="size-10 text-mute" aria-hidden="true" />
            <p role="alert" className="max-w-xs text-ash">
              {reason}
            </p>
            {fileInput}
          </div>
        )}

        {phase === "starting" && (
          <p role="status" className="absolute inset-0 flex items-center justify-center text-mute">
            Opening camera…
          </p>
        )}

        {problem && (
          <p role="alert" className="absolute inset-x-4 bottom-4 rounded-lg border border-flag/40 bg-black/80 px-3 py-2 text-sm text-flag">
            {problem}
          </p>
        )}

        {flash && <div aria-hidden="true" className="absolute inset-0 bg-white" style={{ animation: "shutter 180ms ease-out forwards" }} />}

        <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
          <p className="text-sm font-medium text-white">{title}</p>
          <button onClick={onClose} aria-label="Close camera" className="grid size-11 place-items-center rounded-full bg-black/50 text-white">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {phase === "live" && (
        <div className="grid grid-cols-3 items-center bg-black px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
          <div>
            {multiple && (
              <button
                onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                aria-label="Switch camera"
                className="grid size-12 place-items-center rounded-full bg-white/10 text-white"
              >
                <RefreshCw className="size-5" aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            onClick={snap}
            disabled={busy}
            aria-label="Take photo"
            className="mx-auto grid size-[76px] place-items-center rounded-full border-4 border-white disabled:opacity-60"
          >
            <span className="size-[58px] rounded-full bg-white" />
          </button>
          <label className="ml-auto grid size-12 cursor-pointer place-items-center rounded-full bg-white/10 text-white">
            <ImageUp className="size-5" aria-hidden="true" />
            <span className="sr-only">Use camera app instead</span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
      )}
    </div>
  );
}
