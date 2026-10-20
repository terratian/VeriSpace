import { z } from "zod";
import { fmtDateTime, zonedToUtc } from "./time";

export const SOURCES = ["airbnb", "vrbo", "direct", "other"] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_LABEL: Record<Source, string> = {
  airbnb: "Airbnb",
  vrbo: "Vrbo",
  direct: "Direct",
  other: "Other",
};

export const DEFAULT_CHECK_IN = "16:00";
export const DEFAULT_CHECK_OUT = "11:00";
export const MAX_STAY_DAYS = 365;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time");

export const stayFormSchema = z.object({
  propertyId: z.guid(),
  guestName: z.string().trim().max(120, "Guest name is too long"),
  source: z.enum(SOURCES),
  checkInDate: date,
  checkInTime: time,
  checkOutDate: date,
  checkOutTime: time,
});
export type StayForm = z.infer<typeof stayFormSchema>;

export type ResolvedStay = { ok: true; startsAt: Date; endsAt: Date } | { ok: false; error: string };

/** Turn the form's wall-clock fields into instants, using the property's time zone. */
export function resolveStay(
  form: Pick<StayForm, "checkInDate" | "checkInTime" | "checkOutDate" | "checkOutTime">,
  tz: string,
): ResolvedStay {
  const startsAt = zonedToUtc(form.checkInDate, form.checkInTime, tz);
  if (!startsAt) {
    return { ok: false, error: `${form.checkInDate} ${form.checkInTime} isn't a real time in ${tz}. The clocks skip forward then; pick another time.` };
  }
  const endsAt = zonedToUtc(form.checkOutDate, form.checkOutTime, tz);
  if (!endsAt) {
    return { ok: false, error: `${form.checkOutDate} ${form.checkOutTime} isn't a real time in ${tz}. The clocks skip forward then; pick another time.` };
  }
  if (endsAt <= startsAt) {
    return { ok: false, error: `Check-out must be after check-in (${fmtDateTime(startsAt, tz)}).` };
  }
  if (endsAt.getTime() - startsAt.getTime() > MAX_STAY_DAYS * 86_400_000) {
    return { ok: false, error: `Stays can be at most ${MAX_STAY_DAYS} days.` };
  }
  return { ok: true, startsAt, endsAt };
}

/** Postgres raises 23P01 (exclusion_violation) when a stay overlaps another at the same property. */
export const OVERLAP_ERROR_CODE = "23P01";
