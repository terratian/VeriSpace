import Link from "next/link";
import { Logo } from "@/components/ui/primitives";
import { button } from "@/components/ui/styles";

export default function AppHeader({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-obsidian/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="VeriSpace home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex items-center text-sm">
          <Link href="/dashboard" className="rounded-md px-3 py-1.5 text-white hover:bg-white/5">
            Properties
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden max-w-[240px] truncate text-[13px] text-mute sm:block">{email}</span>
          <form action="/auth/signout" method="post">
            <button className={button("ghost", "sm")}>Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
