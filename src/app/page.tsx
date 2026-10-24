import Link from "next/link";
import { cookies } from "next/headers";
import { createSessionClient } from "@/lib/supabase/ssr-server";
import { Badge, Logo, Panel } from "@/components/ui/primitives";
import { button } from "@/components/ui/styles";

const EXAMPLE_ROWS = [
  { time: "10:51 AM", who: "Guest", what: "Departure photo", hash: "9f3a…c71e" },
  { time: "4:08 PM", who: "Guest", what: "Arrival photo", hash: "b204…5d90" },
  { time: "11:42 AM", who: "Crew", what: "Finished cleaning", hash: "e71c…0a3f" },
  { time: "11:40 AM", who: "Crew", what: "Verified photo", hash: "4c18…d2b7" },
];

const PILLARS = [
  {
    title: "A concierge for every feature",
    body: "Guides, manuals and product pages are attached to the hot tub, the lock or the TV they belong to, so guests find help in the room they are standing in.",
  },
  {
    title: "A checklist for every flip",
    body: "Crew work through a task list per room and photograph what matters. Each tick is recorded, and the record can't be edited afterwards.",
  },
  {
    title: "Evidence when it counts",
    body: "Every photo is fingerprinted on the phone and sealed into a time-stamped chain, so a claim shows when something changed and whose link recorded it.",
  },
];

/** The room as a 3D model with assets pinned to it. Illustrative artwork, not a real scan. */
function RoomTwin() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/hero-room.webp"
      alt="A living room drawn as a glowing 3D wireframe, with measured points pinned to it"
      width={916}
      height={560}
      className="mb-4 mt-4 w-full rounded-lg border border-edge"
    />
  );
}

const STEPS = [
  {
    title: "VeriService walks your crew through it",
    body: "After a turnover, cleaners open a link on their phone and photograph each room before they finish it. There is nothing to install and no account to make.",
  },
  {
    title: "VeriStay looks after your guests",
    body: "A link tied to the reservation is a concierge for check-in, the stay and checkout. Guests find help for what is in the room, and record how they found it.",
  },
  {
    title: "VeriSpace Suite keeps the record",
    body: "You set up each room once. Every entry after that is chained to the one before it and independently time-stamped, so changing or removing anything later shows.",
  },
];

/** Whether a manager is already signed in, so the page can lead straight back to their dashboard. */
async function signedIn(): Promise<boolean> {
  try {
    const { data } = await createSessionClient(await cookies()).auth.getUser();
    return Boolean(data.user);
  } catch {
    return false;
  }
}

export default async function Home() {
  const manager = await signedIn();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-4 sm:px-6">
        <Logo />
        <Link href={manager ? "/dashboard" : "/login"} className={button("secondary", "sm")}>
          {manager ? "Open dashboard" : "Manager sign-in"}
        </Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1120px] items-center gap-12 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div>
            <h1 className="max-w-[14ch] text-[40px] font-semibold leading-[1.02] sm:text-5xl lg:text-[56px]">
              Your property, room by room. Your crew, step by step.
            </h1>
            <p className="mt-5 max-w-[50ch] text-[17px] leading-relaxed text-ash">
              VeriSpace is BIM and GIS for short-term rentals, without the engineers. Describe each room once: its
              amenities, rules, cleaning needs and how-tos. Send a link to whoever you hire, and the app walks them
              through every flip with photo proof. Each stay and repair goes into a tamper-evident record, so you can
              show when damage happened and who was responsible.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={manager ? "/dashboard" : "/login"} className={button("primary", "lg")}>
                {manager ? "Open your dashboard" : "Sign in to manage properties"}
              </Link>
              <a href="#how" className={button("ghost", "lg")}>
                How it works
              </a>
            </div>
          </div>

          <Panel className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[17px] font-semibold text-white">Living room</p>
                <p className="text-[13px] text-mute">Example record</p>
              </div>
              <Badge tone="mint">Chain verified</Badge>
            </div>
            <RoomTwin />
            <ul className="divide-y divide-edge border-t border-edge">
              {EXAMPLE_ROWS.map((row) => (
                <li key={row.hash} className="flex items-baseline gap-3 py-2.5 text-sm">
                  <span className="w-[4.5rem] shrink-0 tabular-nums text-mute">{row.time}</span>
                  <span className="min-w-0 flex-1 truncate text-white">
                    {row.what}
                    <span className="ml-2 text-mute">{row.who}</span>
                  </span>
                  <span className="font-mono text-xs text-mute">{row.hash}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </section>

        <section className="border-t border-edge">
          <div className="mx-auto grid max-w-[1120px] gap-x-12 gap-y-8 px-4 py-14 sm:px-6 md:grid-cols-3">
            {PILLARS.map((p) => (
              <div key={p.title}>
                <h2 className="text-[17px] font-semibold">{p.title}</h2>
                <p className="mt-2 max-w-[40ch] text-[15px] leading-relaxed text-mute">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="border-t border-edge">
          <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6">
            <h2 className="max-w-[24ch] text-3xl font-semibold">Three people, one record</h2>
            <div className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.title} className="border-t border-edge pt-5">
                  <h3 className="text-[17px] font-semibold">{step.title}</h3>
                  <p className="mt-2 max-w-[40ch] text-[15px] leading-relaxed text-mute">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-edge">
        <div className="mx-auto max-w-[1120px] px-4 py-8 text-[13px] text-mute sm:px-6">
          VeriSpace is in early development. The example above is illustrative.
        </div>
      </footer>
    </div>
  );
}
