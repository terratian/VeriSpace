import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { createSessionClient } from "@/lib/supabase/ssr-server";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { data: { user } } = await createSessionClient(await cookies()).auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-widest text-mint">VeriSpace</p>
      <h1 className="mb-8 mt-2 text-2xl font-black text-white">Manager sign-in</h1>
      <LoginForm failed={Boolean(error)} />
    </main>
  );
}
