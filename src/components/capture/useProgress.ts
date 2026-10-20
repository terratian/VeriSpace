"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyAction, parseProgress, type CaptureAction, type ProgressMap } from "@/lib/capture";

/**
 * Per-link progress (which rooms are started or done), kept in this browser so a reload doesn't lose
 * the checklist. It is a convenience: the ledger is the record. Storage can be blocked, so every
 * access is guarded and the checklist still works without it.
 */
export function useProgress(token: string) {
  const storageKey = `vs:progress:${token.slice(-20)}`;
  const [progress, setProgress] = useState<ProgressMap>({});
  const loaded = useRef(false);

  useEffect(() => {
    try {
      setProgress(parseProgress(window.localStorage.getItem(storageKey)));
    } catch {
      // Storage unavailable: start empty.
    }
    loaded.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(progress));
    } catch {
      // Ignore: progress simply won't survive a reload.
    }
  }, [progress, storageKey]);

  const bump = useCallback((key: string, action: CaptureAction) => setProgress((prev) => applyAction(prev, key, action)), []);
  return { progress, bump };
}
