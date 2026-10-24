import Link from "next/link";
import type { ReactNode } from "react";
import type { ModuleKey } from "@/lib/brand";
import { toneClasses, type Tone } from "./styles";

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-5 ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[14px] border border-edge bg-graphite ${className}`}>{children}</div>;
}

export function Logo({ className = "", module }: { className?: string; module?: ModuleKey }) {
  // The platform name stands alone; a module is shown as its own name (VeriService, VeriStay) or as "VeriSpace Suite".
  const word = module === "service" ? "VeriService" : module === "stay" ? "VeriStay" : "VeriSpace";
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-tight text-white ${className}`}>
      <svg width="24" height="24" viewBox="0 0 28 28" fill="none" stroke="#66FCF1" strokeWidth="1.7" aria-hidden="true">
        <path d="M14 2 25 8v12l-11 6L3 20V8z" />
        <path d="M3 8l11 6 11-6M14 14v12" />
      </svg>
      <span>
        {word}
        {module === "suite" && <span className="ml-1.5 font-normal text-mute">Suite</span>}
      </span>
    </span>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2 text-[13px] text-mute">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden="true">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-white hover:underline">
              {item.label}
            </Link>
          ) : (
            <span aria-current="page" className="text-ash">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-dashed border-edge px-6 py-10 text-center">
      <p className="font-medium text-white">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-sm text-mute">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** A section heading with an optional right-aligned action. */
export function SectionHeading({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-semibold">
        {title}
        {count !== undefined && <span className="ml-2 text-sm font-normal tabular-nums text-mute">{count}</span>}
      </h2>
      {children}
    </div>
  );
}

export function DbError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-[14px] border border-flag/40 bg-flag/10 px-5 py-4">
      <p className="font-medium text-flag">Couldn&apos;t load this page</p>
      <p className="mt-1 text-sm text-ash">{message}</p>
    </div>
  );
}
