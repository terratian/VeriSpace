"use client";

import { useEffect, useState } from "react";

const HEX = "0123456789abcdef";
const DURATION_MS = 700;

function scramble(length: number): string {
  return Array.from({ length }, () => HEX[Math.floor(Math.random() * 16)]).join("");
}

/**
 * Shows a photo's SHA-256 resolving from noise into its real value, once, so the person sees what
 * their photo became. Under reduced motion it simply shows the value.
 */
export function Fingerprint({ hash }: { hash: string }) {
  const [shown, setShown] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? hash : scramble(hash.length),
  );

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(hash);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const resolved = Math.floor(t * hash.length);
      setShown(hash.slice(0, resolved) + scramble(hash.length - resolved));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  return (
    <p className="break-all font-mono text-xs leading-5 text-mint" aria-label={`SHA-256 fingerprint ${hash}`}>
      <span aria-hidden="true">{shown}</span>
    </p>
  );
}
