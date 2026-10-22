import Link from "next/link";
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

/** An illustrative wireframe of a room with assets pinned to it. Not a real scan. */
function RoomTwin() {
  return (
    <svg viewBox="0 0 520 300" role="img" aria-label="Wireframe of a living room with a sofa and a fireplace pinned" className="mb-4 mt-4 w-full">
      <defs>
        <pattern id="twin-grid" width="40" height="20" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V20" fill="none" stroke="#66FCF1" strokeOpacity=".14" />
        </pattern>
      </defs>
      <g fill="none" stroke="#66FCF1" strokeWidth="1.4" strokeLinejoin="round">
        <path d="M260 96 460 186 260 276 60 186z" fill="url(#twin-grid)" strokeOpacity=".6" />
        <path d="M60 186V96L260 6 460 96V186M260 6V96" strokeOpacity=".8" />
        <path d="M190 176 250 206 190 236 130 206z" strokeOpacity=".9" />
        <path d="M130 206v-20l60-30 60 30v20M190 236v-20M130 186l60 30 60-30" strokeOpacity=".9" />
        <path d="M330 80h90v58h-90z" strokeOpacity=".5" />
        <path d="M340 120h70" strokeOpacity=".5" />
      </g>
      <g fontFamily="ui-monospace, Menlo, monospace" fontSize="11">
        <line x1="190" y1="196" x2="190" y2="132" stroke="#66FCF1" />
        <circle cx="190" cy="196" r="4" fill="#66FCF1" />
        <rect x="136" y="108" width="108" height="24" rx="5" fill="#0B0C10" stroke="#66FCF1" strokeOpacity=".6" />
        <text x="146" y="124" fill="#C5C6C7">Sofa · baseline</text>
        <line x1="375" y1="110" x2="375" y2="62" stroke="#66FCF1" />
        <circle cx="375" cy="110" r="4" fill="#66FCF1" />
        <rect x="312" y="38" width="126" height="24" rx="5" fill="#0B0C10" stroke="#66FCF1" strokeOpacity=".6" />
        <text x="322" y="54" fill="#C5C6C7">Fireplace · working</text>
      </g>
    </svg>
  );
}

const STEPS = [
  {
    title: "Crew photograph each room",
    body: "After a turnover, cleaners open a link on their phone and photograph each room before they finish it. There is nothing to install and no account to make.",
  },
  {
    title: "Guests record their arrival",
    body: "A link tied to the reservation lets guests photograph what they find at check-in, so existing wear is on the record before anyone touches it.",
  },
  {
    title: "Every entry is chained to the last",
    body: "Each record carries the fingerprint of the one before it. Change or remove anything later and the chain stops verifying.",
  },
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-4 sm:px-6">
        <Logo />
        <Link href="/login" className={button("secondary", "sm")}>
          Manager sign-in
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
              <Link href="/login" className={button("primary", "lg")}>
                Sign in to manage properties
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
