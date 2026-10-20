import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { createSessionClient } from "@/lib/supabase/ssr-server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const {
    data: { user },
  } = await createSessionClient(await cookies()).auth.getUser();
  if (!user) redirect("/login");

  return (
    <>
      <AppHeader email={user.email ?? "Signed in"} />
      <main className="mx-auto max-w-[1120px] px-4 pb-24 sm:px-6">{children}</main>
    </>
  );
}
