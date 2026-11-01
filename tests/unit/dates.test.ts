import { describe, expect, it } from "vitest";
import { ageOn, formatDate, formatDateTime, formatTime, parseDateOnly, presetRange, previousRange, resolveDateRange } from "@/lib/dates";
import { friendlyDbError } from "@/lib/db-errors";

describe("dates", () => {
  it("parses only valid yyyy-MM-dd values", () => {
    expect(parseDateOnly("2025-02-28")).not.toBeNull();
    expect(parseDateOnly("2025-02-30")).toBeNull();
    expect(parseDateOnly("02/28/2025")).toBeNull();
  });

  it("formats timestamps in Asia/Manila time", () => {
    // 16:30 UTC is 00:30 the next day in Manila (UTC+8)
    expect(formatDateTime("2025-01-31T16:30:00Z", "yyyy-MM-dd HH:mm")).toBe("2025-02-01 00:30");
    expect(formatDate("2025-01-05")).toBe("Jan 5, 2025");
    expect(formatTime("18:05:00")).toBe("6:05 PM");
    expect(formatTime("00:15")).toBe("12:15 AM");
  });

  it("computes preset ranges", () => {
    const today = new Date(2025, 4, 15); // May 15, 2025
    expect(presetRange("this_month", today)).toEqual({ from: "2025-05-01", to: "2025-05-15" });
    expect(presetRange("last_month", today)).toEqual({ from: "2025-04-01", to: "2025-04-30" });
    expect(presetRange("last_year", today)).toEqual({ from: "2024-01-01", to: "2024-12-31" });
  });

  it("computes this week (Monday start) and the previous period", () => {
    const thursday = new Date(2025, 4, 15); // Thu May 15, 2025
    expect(presetRange("this_week", thursday)).toEqual({ from: "2025-05-12", to: "2025-05-15" });
    expect(previousRange({ from: "2025-05-01", to: "2025-05-15" })).toEqual({ from: "2025-04-16", to: "2025-04-30" });
    expect(previousRange({ from: "2025-03-01", to: "2025-03-01" })).toEqual({ from: "2025-02-28", to: "2025-02-28" });
  });

  it("rejects invalid custom ranges", () => {
    const resolved = resolveDateRange({ from: "2025-05-10", to: "2025-05-01" });
    expect(resolved.preset).toBe("this_month");
    const custom = resolveDateRange({ from: "2025-01-01", to: "2025-01-31" });
    expect(custom).toMatchObject({ from: "2025-01-01", to: "2025-01-31", preset: "custom" });
  });

  it("computes age", () => {
    expect(ageOn("2000-06-15", "2025-06-14")).toBe(24);
    expect(ageOn("2000-06-15", "2025-06-15")).toBe(25);
    expect(ageOn(null)).toBeNull();
  });
});

describe("friendlyDbError", () => {
  it("passes through business rule messages and hides internals", () => {
    expect(friendlyDbError({ code: "22023", message: "The effective date cannot be in the future." })).toBe(
      "The effective date cannot be in the future.",
    );
    expect(
      friendlyDbError({ code: "42501", message: "You do not have permission to perform this action (finance.post)." }),
    ).toBe("You do not have permission to perform this action.");
    expect(friendlyDbError({ code: "42501", message: "permission denied for table members" })).toBe(
      "You do not have permission to perform this action.",
    );
    expect(
      friendlyDbError({ code: "23505", message: 'duplicate key value violates unique constraint "attendance_records_unique_member"' }),
    ).toBe("This member is already recorded for this session.");
    expect(friendlyDbError({ code: "XX000", message: "internal" })).toBe("Something went wrong. Please try again.");
  });
});
