"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function LoginForm({ failed }: { failed: boolean }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(failed ? "Sign-in failed. Please try again." : null);
  const [busy, setBusy] = useState(false);

  const redirectTo = () => `${window.location.origin}/auth/callback`;

  async function google() {
    setBusy(true);
    const { error } = await createBrowserSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) { setMessage(error.message); setBusy(false); }
  }

  async function emailLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createBrowserSupabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setMessage(error ? error.message : "Check your email for a sign-in link.");
    setBusy(false);
  }

  const field = "w-full rounded-lg border border-line bg-panel px-3 py-2 text-white";
  return (
    <div className="space-y-6">
      <button
        onClick={google}
        disabled={busy}
        className="w-full rounded-xl bg-mint px-4 py-3 font-bold text-obsidian disabled:opacity-50"
      >
        Continue with Google
      </button>
      <form onSubmit={emailLink} className="space-y-3">
        <label className="block text-sm">
          Or get an email link
          <input
            className={field}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button
          disabled={busy}
          className="w-full rounded-xl border border-line bg-slate-brand px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          Send link
        </button>
      </form>
      {message && <p role="status" className="text-sm text-mint">{message}</p>}
    </div>
  );
}
