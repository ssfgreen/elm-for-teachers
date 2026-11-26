import { describe, expect, it } from "vitest";
import { addDays, dailyUsage, earliestAt, rangeStart, ukDay } from "./usageDaily.js";

describe("ukDay", () => {
  it("puts a call on its UK day across midnight in summer time (BST, UTC+1)", () => {
    expect(ukDay("2026-07-01T22:59:59.000Z")).toBe("2026-07-01");
    expect(ukDay("2026-07-01T23:00:00.000Z")).toBe("2026-07-02");
  });

  it("puts a call on its UK day across midnight in winter (GMT, UTC)", () => {
    expect(ukDay("2026-11-12T23:59:59.000Z")).toBe("2026-11-12");
    expect(ukDay("2026-11-13T00:00:00.000Z")).toBe("2026-11-13");
  });

  it("gets the day the clocks go back right: 25 hours, from 23:00 UTC the day before", () => {
    expect(ukDay("2026-10-24T22:59:00.000Z")).toBe("2026-10-24");
    expect(ukDay("2026-10-24T23:30:00.000Z")).toBe("2026-10-25");
    expect(ukDay("2026-10-25T23:30:00.000Z")).toBe("2026-10-25");
    expect(ukDay("2026-10-26T00:00:00.000Z")).toBe("2026-10-26");
  });

  it("gets the day the clocks go forward right: 23 hours, to 23:00 UTC", () => {
    expect(ukDay("2026-03-29T00:30:00.000Z")).toBe("2026-03-29");
    expect(ukDay("2026-03-29T22:59:00.000Z")).toBe("2026-03-29");
    expect(ukDay("2026-03-29T23:00:00.000Z")).toBe("2026-03-30");
  });
});

describe("rangeStart", () => {
  it("starts a week on Monday", () => {
    expect(rangeStart("week", "2026-11-13")).toBe("2026-11-09"); // a Friday
    expect(rangeStart("week", "2026-11-15")).toBe("2026-11-09"); // a Sunday
    expect(rangeStart("week", "2026-11-16")).toBe("2026-11-16"); // a Monday
    expect(rangeStart("week", "2026-03-03")).toBe("2026-03-02"); // across the end of February
  });

  it("starts a month on its 1st, and all time nowhere", () => {
    expect(rangeStart("month", "2026-11-13")).toBe("2026-11-01");
    expect(rangeStart("all", "2026-11-13")).toBeNull();
  });

  it("counts days across a clocks change and a month end", () => {
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("queries from a day early, so a call just after UK midnight in summer is in", () => {
    const at = earliestAt("2026-07-02");
    expect("2026-07-01T23:00:00.000Z" >= at).toBe(true);
  });
});

describe("dailyUsage", () => {
  const calls = [
    { at: "2026-10-24T22:30:00.000Z", cost_gbp: 1 }, // Sat 24th, 23:30 BST
    { at: "2026-10-24T23:30:00.000Z", cost_gbp: 2 }, // Sun 25th, 00:30 BST
    { at: "2026-10-25T23:30:00.000Z", cost_gbp: 4 }, // Sun 25th, 23:30 GMT
    { at: "2026-10-26T09:00:00.000Z", cost_gbp: 8 }, // Mon 26th
    { at: "2026-10-27T09:00:00.000Z", cost_gbp: null }, // before costs were stored
  ];

  it("buckets by UK day across the day the clocks go back", () => {
    const u = dailyUsage(calls, "all", new Date("2026-10-27T12:00:00.000Z"));
    expect(u.days).toEqual([
      { day: "2026-10-24", gbp: 1 },
      { day: "2026-10-25", gbp: 6 },
      { day: "2026-10-26", gbp: 8 },
      { day: "2026-10-27", gbp: 0 },
    ]);
    expect(u).toMatchObject({ from: "2026-10-24", to: "2026-10-27", total_gbp: 15 });
  });

  it("gives this week from Monday to today, with the days before it left out and empty days at £0", () => {
    const u = dailyUsage(calls, "week", new Date("2026-10-28T12:00:00.000Z"));
    expect(u.days).toEqual([
      { day: "2026-10-26", gbp: 8 },
      { day: "2026-10-27", gbp: 0 },
      { day: "2026-10-28", gbp: 0 },
    ]);
    expect(u.total_gbp).toBe(8);
  });

  it("gives this month from the 1st, and today is a UK day at a midnight edge", () => {
    // 23:30 UTC on 31 October is 23:30 GMT: still October. An hour later it is November.
    expect(dailyUsage(calls, "month", new Date("2026-10-31T23:30:00.000Z"))).toMatchObject({ from: "2026-10-01", to: "2026-10-31", total_gbp: 15 });
    expect(dailyUsage(calls, "month", new Date("2026-11-01T00:30:00.000Z"))).toMatchObject({ from: "2026-11-01", to: "2026-11-01", total_gbp: 0 });
    // In summer, 23:30 UTC on 30 September is already 1 October in the UK.
    const sept = [{ at: "2026-09-30T22:30:00.000Z", cost_gbp: 3 }];
    expect(dailyUsage(sept, "month", new Date("2026-09-30T23:30:00.000Z"))).toMatchObject({ from: "2026-10-01", days: [{ day: "2026-10-01", gbp: 0 }], total_gbp: 0 });
  });

  it("counts a call from before costs were stored as £0", () => {
    const u = dailyUsage([{ at: "2026-11-02T10:00:00.000Z", cost_gbp: null }], "all", new Date("2026-11-02T12:00:00.000Z"));
    expect(u).toEqual({ from: "2026-11-02", to: "2026-11-02", days: [{ day: "2026-11-02", gbp: 0 }], total_gbp: 0 });
  });

  it("gives no days for all time when nothing has been used", () => {
    expect(dailyUsage([], "all", new Date("2026-11-13T12:00:00.000Z"))).toEqual({ from: null, to: "2026-11-13", days: [], total_gbp: 0 });
  });
});
