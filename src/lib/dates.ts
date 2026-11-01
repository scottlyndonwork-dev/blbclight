import { TZDate } from "@date-fns/tz";
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";

export const CHURCH_TIMEZONE = "Asia/Manila";

/** The current moment in Asia/Manila. */
export function nowManila(): TZDate {
  return new TZDate(Date.now(), CHURCH_TIMEZONE);
}

/** Today's calendar date in Asia/Manila as yyyy-MM-dd. */
export function todayManila(): string {
  return format(nowManila(), "yyyy-MM-dd");
}

/** Parses a yyyy-MM-dd string; returns null when invalid. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

export function toDateOnly(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Formats a yyyy-MM-dd date for display, e.g. "Jan 5, 2025". */
export function formatDate(value: string | null | undefined, pattern = "MMM d, yyyy"): string {
  const d = parseDateOnly(value?.slice(0, 10));
  return d ? format(d, pattern) : "—";
}

/** Formats a timestamp in Manila time, e.g. "Jan 5, 2025, 9:30 AM". */
export function formatDateTime(value: string | null | undefined, pattern = "MMM d, yyyy, h:mm a"): string {
  if (!value) return "—";
  const d = new Date(value);
  if (!isValid(d)) return "—";
  return format(new TZDate(d, CHURCH_TIMEZONE), pattern);
}

/** Formats a time of day ("09:00:00") as "9:00 AM". */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export type DateRange = { from: string; to: string };

export const RANGE_PRESETS = {
  this_week: "This week",
  this_month: "This month",
  last_month: "Last month",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  this_year: "This year",
  last_year: "Last year",
} as const;

export type RangePreset = keyof typeof RANGE_PRESETS;

export function presetRange(preset: RangePreset, today: Date = parseISO(todayManila())): DateRange {
  switch (preset) {
    case "this_week":
      return { from: toDateOnly(startOfWeek(today, { weekStartsOn: 1 })), to: toDateOnly(today) };
    case "this_month":
      return { from: toDateOnly(startOfMonth(today)), to: toDateOnly(today) };
    case "last_month": {
      const last = subMonths(today, 1);
      return { from: toDateOnly(startOfMonth(last)), to: toDateOnly(endOfMonth(last)) };
    }
    case "last_30_days":
      return { from: toDateOnly(subDays(today, 29)), to: toDateOnly(today) };
    case "last_90_days":
      return { from: toDateOnly(subDays(today, 89)), to: toDateOnly(today) };
    case "this_year":
      return { from: toDateOnly(startOfYear(today)), to: toDateOnly(today) };
    case "last_year": {
      const ly = new Date(today.getFullYear() - 1, 0, 1);
      return { from: toDateOnly(startOfYear(ly)), to: toDateOnly(endOfYear(ly)) };
    }
  }
}

/** The period of the same length that ends the day before `range` starts. */
export function previousRange(range: DateRange): DateRange {
  const from = parseISO(range.from);
  const days = differenceInCalendarDays(parseISO(range.to), from) + 1;
  return { from: toDateOnly(subDays(from, days)), to: toDateOnly(subDays(from, 1)) };
}

type ParamValue = string | string[] | undefined;

/**
 * Resolves a date range from URL search params, falling back to a preset.
 * Invalid or reversed ranges fall back to the default.
 */
export function resolveDateRange(
  params: { from?: ParamValue; to?: ParamValue; range?: ParamValue },
  fallback: RangePreset = "this_month",
): DateRange & { preset: RangePreset | "custom" } {
  const first = (v: ParamValue) => (Array.isArray(v) ? v[0] : v);
  const preset = first(params.range);
  if (preset && preset in RANGE_PRESETS) {
    return { ...presetRange(preset as RangePreset), preset: preset as RangePreset };
  }
  const from = parseDateOnly(first(params.from));
  const to = parseDateOnly(first(params.to));
  if (from && to && from <= to && to <= addDays(parseISO(todayManila()), 366)) {
    return { from: toDateOnly(from), to: toDateOnly(to), preset: "custom" };
  }
  return { ...presetRange(fallback), preset: fallback };
}

export function weekStart(date: string): string {
  const d = parseDateOnly(date);
  return d ? toDateOnly(startOfWeek(d, { weekStartsOn: 1 })) : date;
}

/** Age in whole years on the given date. */
export function ageOn(birthdate: string | null | undefined, on: string = todayManila()): number | null {
  const b = parseDateOnly(birthdate);
  const d = parseDateOnly(on);
  if (!b || !d) return null;
  let age = d.getFullYear() - b.getFullYear();
  const m = d.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--;
  return age;
}
