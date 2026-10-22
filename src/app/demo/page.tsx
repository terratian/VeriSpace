import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo, Panel } from "@/components/ui/primitives";
import { demoEnabled } from "@/lib/demo";

export const metadata: Metadata = { title: "Demo", robots: { index: false, follow: false } };

const PAGES = [
  { href: "/dev-preview/dashboard", title: "Owner dashboard", body: "Turnover and occupancy metrics and the 14-day stay calendar, with sample properties." },
  { href: "/dev-preview/layout?demo=1", title: "Layout studio", body: "Drag and resize rooms on a plan and watch the 3D model follow." },
  { href: "/dev-preview/model", title: "3D property model", body: "Rooms as boxes with features pinned inside. Green is working, red is out of service." },
  { href: "/dev-preview?role=manager&demo=1", title: "Owner baseline walkthrough", body: "The phone screen an owner uses to photograph each room and feature." },
  { href: "/dev-preview?role=crew&demo=1", title: "Crew checklist", body: "Room tasks, photo tasks, and problem reports on a phone." },
  { href: "/dev-preview?role=guest&demo=1", title: "Guest link", body: "What a guest sees: procedures, allergen notes, features and their status." },
];

/** A public tour of every screen with sample data and nothing saved. Open it on a phone for the capture screens. */
export default function DemoPage() {
  if (!demoEnabled()) notFound();
  return (
    <main className="mx-auto max-w-[720px] px-5 py-10">
      <Logo />
      <h1 className="mt-8 text-3xl font-semibold">Demo</h1>
      <p className="mt-2 text-mute">Sample data only. Nothing here is saved, so it works without signing in. The real owner screens are under Properties after you sign in.</p>
      <ul className="mt-6 space-y-3">
        {PAGES.map((p) => (
          <li key={p.href}>
            <Link href={p.href}>
              <Panel className="p-4 transition-colors hover:border-mint/50">
                <p className="font-medium text-white">{p.title}</p>
                <p className="mt-1 text-sm text-mute">{p.body}</p>
              </Panel>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-mute">
        <Link href="/api/health" className="underline underline-offset-2 hover:text-white">
          Deployment check
        </Link>{" "}
        shows which settings this server has.
      </p>
    </main>
  );
}
