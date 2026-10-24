import Link from "next/link";
import { cookies } from "next/headers";
import { createSessionClient } from "@/lib/supabase/ssr-server";
import { Badge, Logo, Panel } from "@/components/ui/primitives";
import { button } from "@/components/ui/styles";
import { PricingHeadline, PricingTable } from "@/components/PricingBreakdown";

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

const MODULE_CARDS = [
  {
    who: "Owners and managers",
    module: "VeriSpace Suite",
    line: "Set up once. Know the state of every room.",
    steps: ["Add each room with a panorama or scan", "Photograph appliances and supplies, attach guides and manuals", "Set the rules and the checks your crew must complete", "Get alerts, before and after comparisons and dispute packets"],
    opens: "On your computer or phone",
  },
  {
    who: "Flip crew",
    module: "VeriService",
    line: "Step by step, with proof.",
    steps: ["Open a link. No app, no account", "One task at a time, in the order you set", "A photo where you asked for one", "Finish the room, go to the next"],
    opens: "A link on their phone",
  },
  {
    who: "Guests",
    module: "VeriStay",
    line: "Your stay, looked after.",
    steps: ["Check in: how to get in, the house rules, a look around", "During the stay: tap a pin in the room for help with the hot tub, TV or oven", "Report a problem in a tap", "Check out: what to do, then done"],
    opens: "A link tied to the reservation",
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
        <div className="flex items-center gap-2">
          <Link href="/pricing" className={button("ghost", "sm")}>
            Pricing
          </Link>
          <Link href={manager ? "/dashboard" : "/login"} className={button("secondary", "sm")}>
            {manager ? "Open dashboard" : "Manager sign-in"}
          </Link>
        </div>
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
            <h2 className="max-w-[26ch] text-3xl font-semibold">One record. One platform. Everyone who touches the property.</h2>
            <p className="mt-3 max-w-[60ch] text-[17px] text-ash">The owner, the crew and the guests each get their own screens and their own flow, built from what you set up once and written to the same record.</p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {MODULE_CARDS.map((c) => (
                <Panel key={c.module} className="flex flex-col p-5">
                  <p className="text-[13px] font-medium uppercase tracking-wide text-mute">{c.who}</p>
                  <h3 className="mt-1 text-xl font-semibold">{c.module}</h3>
                  <p className="mt-1 text-[15px] text-mint">{c.line}</p>
                  <ol className="mt-4 flex-1 space-y-2.5 text-[15px] leading-snug text-ash">
                    {c.steps.map((st, i) => (
                      <li key={st} className="flex gap-3">
                        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-edge text-[11px] text-mute">{i + 1}</span>
                        {st}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-5 border-t border-edge pt-3 text-[13px] text-mute">{c.opens}</p>
                </Panel>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="border-t border-edge">
          <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6">
            <h2 className="text-3xl font-semibold">Simple pricing</h2>
            <div className="mt-6">
              <PricingHeadline />
            </div>
            <div className="mt-8 max-w-[860px]">
              <PricingTable />
            </div>
            <Link href="/pricing" className={`${button("secondary", "md")} mt-6`}>
              See what is included
            </Link>
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
