/**
 * Time zone helpers built on Intl, no date library. Check-in and check-out are wall-clock times
 * at the property, so every conversion takes the property's IANA zone.
 */

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function wallClock(utcMs: number, tz: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour") % 24, mi: get("minute"), s: get("second") };
}

/** How far the zone's wall clock is ahead of UTC at this instant, in ms. */
function offsetMs(utcMs: number, tz: string): number {
  const w = wallClock(utcMs, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Convert a wall-clock date and time in `tz` to the matching instant.
 * Returns null for malformed input, impossible dates, or a time the zone skips (the spring-forward
 * gap). An ambiguous time (the fall-back hour) resolves to its first occurrence.
 */
export function zonedToUtc(date: string, time: string, tz: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dm || !tm || !isValidTimeZone(tz)) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];

  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;

  // Two passes settle the offset when the guess lands on the other side of a DST change.
  let guess = wall - offsetMs(wall, tz);
  guess = wall - offsetMs(guess, tz);

  const back = wallClock(guess, tz);
  if (back.y !== y || back.mo !== mo || back.d !== d || back.h !== h || back.mi !== mi) return null;
  return new Date(guess);
}

export function formatInZone(date: Date | string, tz: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...options }).format(new Date(date));
}

/** "Tue, Oct 20, 4:00 PM EDT" */
export const fmtDateTime = (date: Date | string, tz: string) =>
  formatInZone(date, tz, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

/** "Oct 20" */
export const fmtDay = (date: Date | string, tz: string) => formatInZone(date, tz, { month: "short", day: "numeric" });

/** "4:00 PM" */
export const fmtClock = (date: Date | string, tz: string) => formatInZone(date, tz, { hour: "numeric", minute: "2-digit" });

/** "EDT" */
export const zoneAbbreviation = (date: Date | string, tz: string) =>
  formatInZone(date, tz, { timeZoneName: "short" }).split(" ").pop() ?? tz;

/** Calendar nights between two instants, counted on the property's wall clock. */
export function nightsBetween(start: Date | string, end: Date | string, tz: string): number {
  const day = (d: Date | string) => {
    const w = wallClock(new Date(d).getTime(), tz);
    return Date.UTC(w.y, w.mo - 1, w.d);
  };
  return Math.round((day(end) - day(start)) / 86_400_000);
}

export type StayStatus = "upcoming" | "in-house" | "past";

export function stayStatus(now: Date, startsAt: Date | string, endsAt: Date | string): StayStatus {
  if (now < new Date(startsAt)) return "upcoming";
  if (now < new Date(endsAt)) return "in-house";
  return "past";
}

export function timeAgo(date: Date | string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(date).getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const COMMON_TIME_ZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "America/Toronto", label: "Eastern (Toronto)" },
  { value: "America/Mexico_City", label: "Central (Mexico City)" },
  { value: "America/Sao_Paulo", label: "Brasília (São Paulo)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Central Europe (Paris)" },
  { value: "Europe/Athens", label: "Eastern Europe (Athens)" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Bangkok", label: "Bangkok" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Pacific/Auckland", label: "Auckland" },
];
