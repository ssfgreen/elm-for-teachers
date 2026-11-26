/**
 * A workspace's spend by day, for the Usage section on Preferences. Days, weeks and months are UK
 * ones (Europe/London, so summer time is right), and a week starts on Monday. A day is written
 * `YYYY-MM-DD`; day arithmetic is done on those strings at UTC midnight, so it never meets a
 * clocks change.
 */
import { z } from "zod";

export const UsageRange = z.enum(["week", "month", "all"]);
export type UsageRange = z.infer<typeof UsageRange>;

export interface UsageDay {
  /** A UK day, `YYYY-MM-DD`. */
  day: string;
  gbp: number;
}

export interface UsageReport {
  range: UsageRange;
  /** The first day shown; null for all time when nothing has been used yet. */
  from: string | null;
  /** Today, in the UK. */
  to: string;
  /** Every day from `from` to `to`, a day without use at £0. */
  days: UsageDay[];
  /** What the range cost. */
  total_gbp: number;
  /** What the workspace has cost in all, the sum the budget counts. */
  spent_gbp: number;
  budget_gbp: number;
}

/** A model call's time and its stored cost: null for a call from before costs were stored, which counts as £0. */
export interface CostedCall {
  at: string;
  cost_gbp: number | null;
}

const UK = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

/** The UK day an instant falls on. */
export function ukDay(at: string | Date): string {
  const parts = Object.fromEntries(UK.formatToParts(typeof at === "string" ? new Date(at) : at).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const utc = (day: string) => new Date(`${day}T00:00:00.000Z`);

export function addDays(day: string, n: number): string {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The first day of the range that holds `today`: its Monday, the 1st of its month, or null for all time. */
export function rangeStart(range: UsageRange, today: string): string | null {
  if (range === "week") return addDays(today, -((utc(today).getUTCDay() + 6) % 7));
  if (range === "month") return `${today.slice(0, 8)}01`;
  return null;
}

/**
 * Calls at or after this instant hold every call on `day` or later, in UK time: midnight UTC a
 * day early, since UK midnight is never before 23:00 UTC of the day before. For the query.
 */
export function earliestAt(day: string): string {
  return `${addDays(day, -1)}T00:00:00.000Z`;
}

/**
 * The calls' cost per UK day, from the range's first day (for all time, the first day with a call)
 * to today. Calls outside those days are left out.
 */
export function dailyUsage(calls: readonly CostedCall[], range: UsageRange, now: Date): Pick<UsageReport, "from" | "to" | "days" | "total_gbp"> {
  const to = ukDay(now);
  const byDay = new Map<string, number>();
  for (const c of calls) {
    const day = ukDay(c.at);
    byDay.set(day, (byDay.get(day) ?? 0) + (c.cost_gbp ?? 0));
  }
  const first = [...byDay.keys()].sort()[0];
  const from = rangeStart(range, to) ?? (first !== undefined && first <= to ? first : null);
  const days: UsageDay[] = [];
  if (from !== null) for (let day = from; day <= to; day = addDays(day, 1)) days.push({ day, gbp: byDay.get(day) ?? 0 });
  return { from, to, days, total_gbp: days.reduce((sum, d) => sum + d.gbp, 0) };
}
