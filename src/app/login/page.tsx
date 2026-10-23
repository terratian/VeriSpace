import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safeNext";
import LoginForm from "@/components/LoginForm";
import { Logo, Panel } from "@/components/ui/primitives";
import { createSessionClient } from "@/lib/supabase/ssr-server";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const {
    data: { user },
  } = await createSessionClient(await cookies()).auth.getUser();
  if (user) redirect(safeNext(next));

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <Link href="/" aria-label="VeriSpace home" className="mb-8 self-start">
        <Logo />
      </Link>
      <Panel className="p-6">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mb-6 mt-1.5 text-sm text-mute">
          For property managers. Crew and guests don&apos;t need an account; they open the link you send them.
        </p>
        <LoginForm failed={Boolean(error)} next={safeNext(next)} />
      </Panel>
    </main>
  );
}
