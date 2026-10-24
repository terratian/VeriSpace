import { FREE_MONTHS, PRICE_CENTS_PER_PROPERTY } from "@/lib/billing";
import { Panel } from "@/components/ui/primitives";

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const PRICE = money(PRICE_CENTS_PER_PROPERTY);

/** Worked examples of the price, so nobody has to do the arithmetic. Matches billingStatus() in src/lib/billing.ts. */
const EXAMPLES: { who: string; when: string; bill: string; note: string }[] = [
  { who: "1 property", when: "first 3 months", bill: money(0), note: "The first property is free for 3 months. No card needed." },
  { who: "1 property", when: "month 4 onward", bill: PRICE, note: "One listing, one price." },
  { who: "3 properties", when: "first 3 months", bill: money(2 * PRICE_CENTS_PER_PROPERTY), note: "The first is free for 3 months; the other two are billed." },
  { who: "3 properties", when: "month 4 onward", bill: money(3 * PRICE_CENTS_PER_PROPERTY), note: "Three listings." },
];

export function PricingHeadline() {
  return (
    <div>
      <p className="text-[56px] font-semibold leading-none tracking-tight">
        {PRICE}
        <span className="ml-2 text-xl font-normal text-mute">per property, per month</span>
      </p>
      <p className="mt-3 max-w-[48ch] text-[17px] text-ash">
        Your first property is <strong className="text-white">free for {FREE_MONTHS} months</strong>, with no card. Crew links, guest links and co-managers are always free and unlimited.
      </p>
    </div>
  );
}

export function PricingTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-left">
        <thead>
          <tr className="text-[13px] text-mute">
            <th className="px-2 py-2 font-medium">Your account</th>
            <th className="px-2 py-2 font-medium">When</th>
            <th className="px-2 py-2 font-medium">Per month</th>
            <th className="px-2 py-2 font-medium">Why</th>
          </tr>
        </thead>
        <tbody>
          {EXAMPLES.map((e) => (
            <tr key={`${e.who}-${e.when}`} className="border-t border-edge text-[14px]">
              <td className="px-2 py-3 text-white">{e.who}</td>
              <td className="px-2 py-3 text-ash">{e.when}</td>
              <td className="px-2 py-3 font-semibold tabular-nums text-white">{e.bill}</td>
              <td className="px-2 py-3 text-mute">{e.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const INCLUDED = [
  ["All three modules", "VeriSpace Suite for you, VeriService for your crew, VeriStay for your guests."],
  ["Unlimited links", "As many crew and guest links as you need. Price follows listings, not people or stays."],
  ["Co-managers", "Add family or a partner by email, at no cost."],
  ["Independent timestamps and dispute packets", "Included on every property."],
  ["Your records stay yours", "If a payment fails you can still read and export everything. Nothing is held back."],
];

export function PricingIncluded() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {INCLUDED.map(([title, body]) => (
        <li key={title}>
          <Panel className="h-full p-4">
            <p className="text-[15px] font-semibold">{title}</p>
            <p className="mt-1 text-[14px] text-mute">{body}</p>
          </Panel>
        </li>
      ))}
    </ul>
  );
}
