import { AlertTriangle, ChevronDown } from "lucide-react";
import { sortContent, type RoomContent } from "@/lib/guide";

/** What the manager wrote about this room for guests. Allergen and health notes come first and stay open. */
export function RoomGuide({ content }: { content: RoomContent[] }) {
  if (content.length === 0) return null;
  const items = sortContent(content);
  const allergens = items.filter((i) => i.kind === "allergen");
  const rest = items.filter((i) => i.kind !== "allergen");

  return (
    <section aria-label="About this room" className="mt-6">
      {allergens.length > 0 && (
        <div className="rounded-xl border border-amber/40 bg-amber/10 p-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-amber">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Allergen and health notes
          </h2>
          <ul className="mt-2 space-y-3">
            {allergens.map((a) => (
              <li key={a.id}>
                <p className="font-medium text-white">{a.title}</p>
                {a.body && <p className="whitespace-pre-line text-[15px] text-ash">{a.body}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rest.length > 0 && (
        <div className={`border-t border-edge ${allergens.length > 0 ? "mt-4" : ""}`}>
          {rest.map((item) =>
            item.body ? (
              <details key={item.id} className="group border-b border-edge">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[16px] font-medium text-white [&::-webkit-details-marker]:hidden">
                  {item.title}
                  <ChevronDown className="size-4 shrink-0 text-mute transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="whitespace-pre-line pb-4 text-[15px] leading-relaxed text-ash">{item.body}</p>
              </details>
            ) : (
              <p key={item.id} className="min-h-12 border-b border-edge py-3 text-[16px] font-medium text-white">
                {item.title}
              </p>
            ),
          )}
        </div>
      )}
    </section>
  );
}
