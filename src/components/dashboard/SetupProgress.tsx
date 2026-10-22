import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui/primitives";
import { button } from "@/components/ui/styles";
import { nextStep, type SetupStep } from "@/lib/setup";

/** The property creation path, with what's done and what's next. Hidden once everything is in place. */
export function SetupProgress({ steps }: { steps: SetupStep[] }) {
  const next = nextStep(steps);
  if (!next) return null;
  const done = steps.filter((s) => s.done).length;
  return (
    <Panel className="mt-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">Set up this property</h2>
          <p className="mt-0.5 text-sm text-mute">
            {done} of {steps.length} steps done
          </p>
        </div>
        <Link href={next.href} className={button("primary", "md")}>
          {next.label}
        </Link>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-edge" role="presentation">
        <div className="h-full rounded-full bg-mint" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className="group flex items-start gap-2.5 rounded-lg py-1.5">
              {s.done ? (
                <Check className="mt-0.5 size-4 shrink-0 text-mint" aria-label="Done" />
              ) : (
                <Circle className={`mt-0.5 size-4 shrink-0 ${s.key === next.key ? "text-mint" : "text-mute"}`} aria-label="Not done" />
              )}
              <span>
                <span className={`block text-sm ${s.done ? "text-mute" : "text-white group-hover:text-mint"}`}>{s.label}</span>
                {!s.done && <span className="block text-[12px] text-mute">{s.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
