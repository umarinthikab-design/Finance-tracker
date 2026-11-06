import { describe, it, expect } from "vitest";
import { addMonthsClamped, advanceDueDate } from "@/lib/recurrence";

describe("addMonthsClamped", () => {
  it("advances a full year from an anchor day of 31 with no drift, clamping in short months and returning to 31 in longer ones", () => {
    // Start 2026-01-31, add one month at a time for a full year.
    let y = 2026;
    let m = 1;
    const anchor = 31;
    const results: string[] = [];
    for (let i = 0; i < 12; i++) {
      const next = addMonthsClamped(y, m, anchor, 1);
      results.push(next);
      [y, m] = next.split("-").map(Number);
    }
    expect(results).toEqual([
      "2026-02-28", // Feb (non-leap): clamped
      "2026-03-31", // back to 31, no drift from the Feb clamp
      "2026-04-30", // Apr: clamped
      "2026-05-31",
      "2026-06-30", // Jun: clamped
      "2026-07-31",
      "2026-08-31",
      "2026-09-30", // Sep: clamped
      "2026-10-31",
      "2026-11-30", // Nov: clamped
      "2026-12-31",
      "2027-01-31",
    ]);
  });

  it("uses the anchor day, not the clamped previous day, on every step (no drift)", () => {
    // If it drifted, Feb 28 + 1mo would give Mar 28, not Mar 31.
    const marchResult = addMonthsClamped(2026, 2, 31, 1);
    expect(marchResult).toBe("2026-03-31");
  });

  it("lands on Feb 29 in a leap year", () => {
    expect(addMonthsClamped(2028, 1, 31, 1)).toBe("2028-02-29");
  });

  it("lands on Feb 28 in a non-leap year", () => {
    expect(addMonthsClamped(2026, 1, 31, 1)).toBe("2026-02-28");
  });

  it("adds 12 months for a yearly cycle, returning to the same day next year", () => {
    expect(addMonthsClamped(2026, 3, 15, 12)).toBe("2027-03-15");
  });

  it("rolls over the year boundary", () => {
    expect(addMonthsClamped(2026, 12, 31, 1)).toBe("2027-01-31");
  });
});

describe("advanceDueDate", () => {
  it("advances weekly cycles by exactly 7 days", () => {
    expect(advanceDueDate("2026-01-28", "weekly", null)).toBe("2026-02-04");
  });

  it("uses the stored anchor day for monthly cycles rather than the base date's day", () => {
    // Base date has been clamped to the 28th, but the item's real anchor is 31.
    expect(advanceDueDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
  });

  it("falls back to the base date's own day when no valid anchor is stored", () => {
    expect(advanceDueDate("2026-01-15", "monthly", null)).toBe("2026-02-15");
    expect(advanceDueDate("2026-01-15", "monthly", 0)).toBe("2026-02-15");
    expect(advanceDueDate("2026-01-15", "monthly", 32)).toBe("2026-02-15");
  });

  it("advances yearly cycles by 12 months using the anchor day", () => {
    expect(advanceDueDate("2026-02-28", "yearly", 29)).toBe("2027-02-28");
    // From a leap-year Feb 29 occurrence, +12mo clamps into the next
    // (non-leap) year's Feb 28.
    expect(advanceDueDate("2028-02-29", "yearly", 29)).toBe("2029-02-28");
  });
});
