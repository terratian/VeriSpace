"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { button } from "./styles";

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied && !failed) return;
    const t = setTimeout(() => { setCopied(false); setFailed(false); }, 2000);
    return () => clearTimeout(t);
  }, [copied, failed]);

  return (
    <button
      type="button"
      className={button("secondary", "sm")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          setFailed(true);
        }
      }}
    >
      {copied ? <Check className="size-4 text-mint" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      {copied ? "Copied" : failed ? "Select and copy" : label}
    </button>
  );
}

/** Opens the phone's share sheet where the browser supports it; renders nothing elsewhere. */
export function ShareButton({ url, title }: { url: string; title: string }) {
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  if (!supported) return null;
  return (
    <button
      type="button"
      className={button("secondary", "sm")}
      onClick={() => navigator.share({ title, url }).catch(() => {})}
    >
      <Share2 className="size-4" aria-hidden="true" />
      Share
    </button>
  );
}
