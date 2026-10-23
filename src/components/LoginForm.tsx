"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { button, field, fieldLabel } from "@/components/ui/styles";

export default function LoginForm({ failed, next = "/dashboard" }: { failed: boolean; next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(
    failed ? { tone: "error", text: "Sign-in didn't complete. Try again, or use an email link." } : null,
  );
  const [busy, setBusy] = useState<"google" | "email" | null>(null);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    setBusy("google");
    const { error } = await createBrowserSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) {
      setMessage({ tone: "error", text: error.message });
      setBusy(null);
    }
  }

  async function emailLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    // With a password this signs in directly: no email round trip, handy for testing on a phone.
    if (password) {
      const { error } = await createBrowserSupabase().auth.signInWithPassword({ email, password });
      if (error) {
        setMessage({ tone: "error", text: error.message });
        setBusy(null);
      } else {
        window.location.assign(next);
      }
      return;
    }
    const { error } = await createBrowserSupabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setMessage(error ? { tone: "error", text: error.message } : { tone: "ok", text: `Check ${email} for a sign-in link.` });
    setBusy(null);
  }

  return (
    <div className="space-y-5">
      <button onClick={google} disabled={busy !== null} className={`${button("secondary", "lg")} w-full`}>
        {busy === "google" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-mute" aria-hidden="true">
        <span className="h-px flex-1 bg-edge" />
        or
        <span className="h-px flex-1 bg-edge" />
      </div>

      <form onSubmit={emailLink} className="space-y-3">
        <div>
          <label htmlFor="email" className={fieldLabel}>
            Email
          </label>
          <input
            id="email"
            className={field}
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password" className={fieldLabel}>
            Password <span className="text-mute">(optional)</span>
          </label>
          <input
            id="password"
            className={field}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button disabled={busy !== null} className={`${button("primary", "lg")} w-full`}>
          {busy === "email" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {password ? "Sign in" : "Email me a sign-in link"}
        </button>
      </form>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.tone === "error" ? "border-flag/40 bg-flag/10 text-flag" : "border-mint/40 bg-mint/10 text-mint"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
