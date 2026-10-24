"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventInput } from "@/lib/captureClient";
import { enqueue, flushQueue, idbStore, type QueuedItem, type QueueStore } from "@/lib/offlineQueue";

/** Entries saved on this phone for lack of signal, and sending them when it returns. */
export function useOfflineQueue(enabled: boolean, onSent?: (n: number) => void) {
  const store = useRef<QueueStore | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [failed, setFailed] = useState<QueuedItem[]>([]);
  const [sending, setSending] = useState(false);
  const sentCb = useRef(onSent);
  sentCb.current = onSent;

  const refresh = useCallback(async () => {
    if (!store.current) return;
    try {
      const all = await store.current.all();
      setWaiting(all.filter((i) => i.state === "waiting").length);
      setFailed(all.filter((i) => i.state === "failed"));
    } catch {
      /* storage unavailable: nothing to show */
    }
  }, []);

  const flush = useCallback(async () => {
    if (!store.current) return;
    setSending(true);
    try {
      const r = await flushQueue(store.current);
      if (r.sent) sentCb.current?.(r.sent);
    } catch {
      /* try again later */
    } finally {
      setSending(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    try {
      store.current = idbStore();
    } catch {
      store.current = null;
    }
    void refresh().then(() => flush());
    const online = () => void flush();
    window.addEventListener("online", online);
    const timer = window.setInterval(() => void flush(), 30_000);
    return () => {
      window.removeEventListener("online", online);
      window.clearInterval(timer);
    };
  }, [enabled, flush, refresh]);

  const add = useCallback(
    async (token: string, input: EventInput): Promise<boolean> => {
      if (!store.current) return false;
      try {
        await enqueue(store.current, token, input);
        await refresh();
        return true;
      } catch {
        return false;
      }
    },
    [refresh],
  );

  const discard = useCallback(
    async (id: string) => {
      await store.current?.remove(id);
      await refresh();
    },
    [refresh],
  );

  return { waiting, failed, sending, add, flush, discard };
}
