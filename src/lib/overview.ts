/**
 * Calendar and headline numbers for the dashboard. Everything works on local calendar-day keys
 * ("2026-10-21") so a stay lands on the day it starts and ends in its property's own time zone.
 */

export type DayState = "vacant" | "occupied" | "arrival" | "departure" | "turn";

export interface DayCell {
  state: DayState;
  /** A guest sleeps here that night: some stay starts on or before the day and ends after it. */
  night: boolean;
}

export interface StaySpan {
  startsAt: string;
  endsAt: string;
}

export function dayKeyInZone(date: Date | string, tz: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function calendarDays(startKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(startKey, i));
}

export function dayCells(stays: StaySpan[], tz: string, days: string[]): DayCell[] {
  const spans = stays.map((s) => ({ start: dayKeyInZone(s.startsAt, tz), end: dayKeyInZone(s.endsAt, tz) }));
  return days.map((day) => {
    const arrival = spans.some((s) => s.start === day);
    const departure = spans.some((s) => s.end === day);
    const night = spans.some((s) => s.start <= day && day < s.end);
    const spanning = spans.some((s) => s.start < day && day < s.end);
    const state: DayState = arrival && departure ? "turn" : arrival ? "arrival" : departure ? "departure" : spanning ? "occupied" : "vacant";
    return { state, night };
  });
}

/** Share of property-nights with a guest, as a whole percent. */
export function occupancyPercent(rows: DayCell[][]): number {
  const total = rows.reduce((n, r) => n + r.length, 0);
  if (total === 0) return 0;
  const occupied = rows.reduce((n, r) => n + r.filter((c) => c.night).length, 0);
  return Math.round((occupied / total) * 100);
}

export function weekCounts(rows: DayCell[][], days = 7): { arrivals: number; departures: number; turns: number } {
  let arrivals = 0;
  let departures = 0;
  let turns = 0;
  for (const row of rows) {
    for (const c of row.slice(0, days)) {
      if (c.state === "arrival" || c.state === "turn") arrivals++;
      if (c.state === "departure" || c.state === "turn") departures++;
      if (c.state === "turn") turns++;
    }
  }
  return { arrivals, departures, turns };
}
