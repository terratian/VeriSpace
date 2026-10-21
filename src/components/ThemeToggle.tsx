"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const read = () => document.documentElement.dataset.theme === "light";

/** Switches between the dark and light themes and remembers the choice on this device. */
export function ThemeToggle() {
  const light = useSyncExternalStore(subscribe, read, () => false);
  return (
    <button
      type="button"
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
      onClick={() => {
        const next = light ? "dark" : "light";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("vs-theme", next);
        } catch {}
      }}
      className="grid size-8 place-items-center rounded-lg text-mute hover:bg-white/5 hover:text-white"
    >
      {light ? <Moon className="size-4" aria-hidden="true" /> : <Sun className="size-4" aria-hidden="true" />}
    </button>
  );
}
