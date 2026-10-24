/**
 * Billing rules (see docs/PRICING.md). Pure functions: no payment provider in here, so the rules
 * can be tested and the provider swapped. An account pays per active property (listing) per month.
 * The account's first property ever is free for three months from the day it was added.
 */

export const PRICE_CENTS_PER_PROPERTY = 999;
export const FREE_MONTHS = 3;

export interface BillingProperty {
  id: string;
  createdAt: Date;
  /** Archived or deleted properties are not billed. */
  archivedAt: Date | null;
}

export interface BillingStatus {
  activeCount: number;
  /** Properties that cost money right now. */
  billableCount: number;
  monthlyCents: number;
  /** The account's first property, which carries the free period. Null before the first property. */
  freePropertyId: string | null;
  freeUntil: Date | null;
  /** True while the free property is active and the free period has not ended. */
  inFreeWindow: boolean;
  /** Whole days left in the free period, or null when it doesn't apply. */
  freeDaysLeft: number | null;
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, lastDay));
  return out;
}

/**
 * `all` must include archived properties: the free grant belongs to the account's first property
 * ever, so archiving it and adding another does not earn a second free period.
 */
export function billingStatus(all: BillingProperty[], now: Date = new Date()): BillingStatus {
  const first = [...all].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;
  const active = all.filter((p) => !p.archivedAt || p.archivedAt.getTime() > now.getTime());
  const freeUntil = first ? addMonths(first.createdAt, FREE_MONTHS) : null;
  const firstActive = first ? active.some((p) => p.id === first.id) : false;
  const inFreeWindow = Boolean(freeUntil && firstActive && now.getTime() < freeUntil.getTime());
  const billableCount = Math.max(0, active.length - (inFreeWindow ? 1 : 0));
  return {
    activeCount: active.length,
    billableCount,
    monthlyCents: billableCount * PRICE_CENTS_PER_PROPERTY,
    freePropertyId: first?.id ?? null,
    freeUntil,
    inFreeWindow,
    freeDaysLeft: inFreeWindow && freeUntil ? Math.ceil((freeUntil.getTime() - now.getTime()) / 86_400_000) : null,
  };
}

/** What the account may do, by payment state. Records are never locked: evidence stays readable and exportable. */
export type AccessLevel = "full" | "grace" | "read_only";
export function accessFor(state: "free" | "active" | "past_due" | "canceled", daysPastDue = 0): AccessLevel {
  if (state === "free" || state === "active") return "full";
  if (state === "past_due") return daysPastDue <= 14 ? "grace" : "read_only";
  return "read_only";
}
