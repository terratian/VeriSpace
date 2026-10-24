import type { Metadata } from "next";
import Link from "next/link";
import { PricingHeadline, PricingIncluded, PricingTable } from "@/components/PricingBreakdown";
import { Logo } from "@/components/ui/primitives";
import { button } from "@/components/ui/styles";

export const metadata: Metadata = { title: "Pricing", description: "$9.99 per property per month. The first property is free for 3 months." };

const FAQ = [
  ["What counts as a property?", "One listing you set up in VeriSpace. Rooms, assets, crew and guests do not change the price."],
  ["When does the free period start?", "The day you add your first property. It ends 3 months later. Adding or removing other properties does not move it."],
  ["What if I archive a property?", "Archived properties are not billed. The free period belongs to your first property, so archiving it and adding another does not start a new one."],
  ["What happens if I stop paying?", "You keep read access and can always export a dispute packet. After a grace period, creating new links and new setup pauses. Your record is never deleted or locked."],
  ["Is tax included?", "Prices are before any sales tax that applies where you are."],
];

export default function PricingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="VeriSpace home">
          <Logo />
        </Link>
        <Link href="/login" className={button("secondary", "sm")}>
          Manager sign-in
        </Link>
      </header>
      <main className="mx-auto max-w-[1120px] px-4 pb-24 pt-10 sm:px-6">
        <h1 className="sr-only">Pricing</h1>
        <PricingHeadline />
        <section className="mt-12" aria-labelledby="examples">
          <h2 id="examples" className="mb-3 text-xl font-semibold">
            What you pay
          </h2>
          <PricingTable />
        </section>
        <section className="mt-12" aria-labelledby="included">
          <h2 id="included" className="mb-4 text-xl font-semibold">
            What is included
          </h2>
          <PricingIncluded />
        </section>
        <section className="mt-12 max-w-[70ch]" aria-labelledby="faq">
          <h2 id="faq" className="mb-3 text-xl font-semibold">
            Questions
          </h2>
          <dl className="divide-y divide-edge border-y border-edge">
            {FAQ.map(([q, a]) => (
              <div key={q} className="py-4">
                <dt className="text-[15px] font-semibold">{q}</dt>
                <dd className="mt-1 text-[15px] text-ash">{a}</dd>
              </div>
            ))}
          </dl>
        </section>
        <div className="mt-10">
          <Link href="/login" className={button("primary", "lg")}>
            Start free
          </Link>
        </div>
      </main>
    </div>
  );
}
