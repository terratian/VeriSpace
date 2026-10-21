import { ChevronDown } from "lucide-react";
import type { Procedures } from "@/lib/guide";

const SECTIONS = [
  { key: "checkin", title: "Check-in" },
  { key: "checkout", title: "Checkout" },
  { key: "rules", title: "House rules" },
] as const;

/** The manager's check-in, checkout, and house-rule text, as collapsible rows. Empty sections are left out. */
export function GuestProcedures({ guide }: { guide: Procedures }) {
  const filled = SECTIONS.filter((s) => guide[s.key].trim());
  if (filled.length === 0) return null;
  return (
    <section aria-label="Your stay" className="mt-8">
      <h2 className="mb-2 text-[15px] font-semibold">Your stay</h2>
      <div className="border-t border-edge">
        {filled.map((s) => (
          <details key={s.key} className="group border-b border-edge">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between py-3 text-[16px] font-medium text-white [&::-webkit-details-marker]:hidden">
              {s.title}
              <ChevronDown className="size-4 text-mute transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="whitespace-pre-line pb-4 text-[15px] leading-relaxed text-ash">{guide[s.key]}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
