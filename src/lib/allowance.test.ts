import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeBuckets, daysInMonth } from "@/lib/allowance";

// getActiveAllowanceSetting / getAllowanceForRange hit Supabase via getSupabase(),
// so we mock the client to return canned rows instead of a real database.
const mockSettings = vi.fn();
const mockOverrides = vi.fn();
const mockCycleConfig = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      if (table === "allowance_settings") {
        return {
          select: () => ({
            order: () => mockSettings(),
          }),
        };
      }
      if (table === "allowance_overrides") {
        return {
          select: () => ({
            order: () => ({
              order: () => ({
                order: () => mockOverrides(),
              }),
            }),
          }),
        };
      }
      if (table === "allowance_cycle_config") {
        return {
          select: () => ({
            order: () => mockCycleConfig(),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

const { getActiveAllowanceSetting, getAllowanceForRange } = await import(
  "@/lib/allowance"
);

const DEFAULT_CYCLE = [
  { bucket_number: 1, start_day: 1 },
  { bucket_number: 2, start_day: 9 },
  { bucket_number: 3, start_day: 17 },
  { bucket_number: 4, start_day: 24 },
];

beforeEach(() => {
  mockSettings.mockReset();
  mockOverrides.mockReset().mockReturnValue({ data: [], error: null });
  mockCycleConfig.mockReset().mockReturnValue({ data: DEFAULT_CYCLE, error: null });
});

describe("computeBuckets", () => {
  it("splits a 31-day month into four buckets ending on the day before the next start", () => {
    const buckets = computeBuckets(
      [
        { bucketNumber: 1, startDay: 1 },
        { bucketNumber: 2, startDay: 9 },
        { bucketNumber: 3, startDay: 17 },
        { bucketNumber: 4, startDay: 24 },
      ],
      2026,
      1 // January, 31 days
    );
    expect(buckets).toEqual([
      { bucketNumber: 1, startDate: "2026-01-01", endDate: "2026-01-08" },
      { bucketNumber: 2, startDate: "2026-01-09", endDate: "2026-01-16" },
      { bucketNumber: 3, startDate: "2026-01-17", endDate: "2026-01-23" },
      { bucketNumber: 4, startDate: "2026-01-24", endDate: "2026-01-31" },
    ]);
  });

  it("handles February in a non-leap year (28 days), clamping start days beyond month end", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    const buckets = computeBuckets(
      [
        { bucketNumber: 1, startDay: 1 },
        { bucketNumber: 2, startDay: 9 },
        { bucketNumber: 3, startDay: 17 },
        { bucketNumber: 4, startDay: 24 },
      ],
      2026,
      2
    );
    expect(buckets[3]).toEqual({
      bucketNumber: 4,
      startDate: "2026-02-24",
      endDate: "2026-02-28",
    });
  });

  it("handles February in a leap year (29 days)", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    const buckets = computeBuckets(
      [
        { bucketNumber: 1, startDay: 1 },
        { bucketNumber: 2, startDay: 9 },
        { bucketNumber: 3, startDay: 17 },
        { bucketNumber: 4, startDay: 24 },
      ],
      2028,
      2
    );
    expect(buckets[3]).toEqual({
      bucketNumber: 4,
      startDate: "2028-02-24",
      endDate: "2028-02-29",
    });
  });

  it("produces a degenerate empty bucket when a start day is clamped past the previous bucket's start", () => {
    // A start_day of 30 in a 28-day February clamps to 28, same as bucket 3
    // clamped to 28 too -> bucket should end up empty (end < start).
    const buckets = computeBuckets(
      [
        { bucketNumber: 1, startDay: 1 },
        { bucketNumber: 2, startDay: 28 },
        { bucketNumber: 3, startDay: 30 },
        { bucketNumber: 4, startDay: 31 },
      ],
      2026,
      2
    );
    // bucket 3 and 4 both clamp to day 28, so bucket 3 becomes empty.
    expect(buckets[2].startDate).toBe("2026-02-28");
    expect(buckets[2].endDate < buckets[2].startDate).toBe(true);
  });

  it("runs every month length across a full year without throwing and stays internally consistent", () => {
    for (let month = 1; month <= 12; month++) {
      const buckets = computeBuckets(DEFAULT_CYCLE.map((c) => ({
        bucketNumber: c.bucket_number,
        startDay: c.start_day,
      })), 2026, month);
      expect(buckets).toHaveLength(4);
      expect(buckets[3].endDate).toBe(
        `2026-${String(month).padStart(2, "0")}-${String(daysInMonth(2026, month)).padStart(2, "0")}`
      );
    }
  });
});

describe("getActiveAllowanceSetting", () => {
  it("resolves the only setting when there is just one", async () => {
    mockSettings.mockReturnValue({
      data: [{ id: "1", default_weekly_amount: 1000, effective_from: "2026-01-01" }],
      error: null,
    });
    const active = await getActiveAllowanceSetting("2026-06-15");
    expect(active?.default_weekly_amount).toBe(1000);
  });

  it("picks the most recent setting not after the given date, across a rate change", async () => {
    mockSettings.mockReturnValue({
      data: [
        { id: "1", default_weekly_amount: 1000, effective_from: "2026-01-01" },
        { id: "2", default_weekly_amount: 1500, effective_from: "2026-06-01" },
      ],
      error: null,
    });
    // Just before the change: old rate.
    expect((await getActiveAllowanceSetting("2026-05-31"))?.default_weekly_amount).toBe(1000);
    // Exactly on the effective date: new rate.
    expect((await getActiveAllowanceSetting("2026-06-01"))?.default_weekly_amount).toBe(1500);
    // Well after: new rate still.
    expect((await getActiveAllowanceSetting("2026-12-31"))?.default_weekly_amount).toBe(1500);
  });

  it("returns null when no setting is effective yet as of the given date", async () => {
    mockSettings.mockReturnValue({
      data: [{ id: "1", default_weekly_amount: 1000, effective_from: "2026-06-01" }],
      error: null,
    });
    expect(await getActiveAllowanceSetting("2026-01-01")).toBeNull();
  });
});

describe("getAllowanceForRange", () => {
  it("sums a single full month at a single rate to (roughly) the 4 buckets' worth", async () => {
    mockSettings.mockReturnValue({
      data: [{ id: "1", default_weekly_amount: 1400, effective_from: "2026-01-01" }],
      error: null,
    });
    const total = await getAllowanceForRange("2026-03-01", "2026-03-31");
    // 4 buckets * 1400 each, full month covered exactly.
    expect(total).toBe(5600);
  });

  it("resolves a different rate per month when the range spans a rate change", async () => {
    mockSettings.mockReturnValue({
      data: [
        { id: "1", default_weekly_amount: 1000, effective_from: "2026-01-01" },
        { id: "2", default_weekly_amount: 2000, effective_from: "2026-06-15" },
      ],
      error: null,
    });
    // May uses the old rate (1000/bucket), June uses the new rate (2000/bucket)
    // because the rate is resolved as-of each month's last day.
    const may = await getAllowanceForRange("2026-05-01", "2026-05-31");
    const june = await getAllowanceForRange("2026-06-01", "2026-06-30");
    expect(may).toBe(4000);
    expect(june).toBe(8000);
  });

  it("prorates a partial-month range by days within each bucket", async () => {
    mockSettings.mockReturnValue({
      data: [{ id: "1", default_weekly_amount: 700, effective_from: "2026-01-01" }],
      error: null,
    });
    // Bucket 1 of January is 2026-01-01..2026-01-08 (8 days). Asking for just
    // the first 4 days should yield half that bucket's amount.
    const total = await getAllowanceForRange("2026-01-01", "2026-01-04");
    expect(total).toBe(350);
  });

  it("applies a bucket override instead of the default rate for that month", async () => {
    mockSettings.mockReturnValue({
      data: [{ id: "1", default_weekly_amount: 1000, effective_from: "2026-01-01" }],
      error: null,
    });
    mockOverrides.mockReturnValue({
      data: [{ id: "o1", year: 2026, month: 3, bucket_number: 1, amount: 5000 }],
      error: null,
    });
    const total = await getAllowanceForRange("2026-03-01", "2026-03-31");
    // Bucket 1 overridden to 5000, buckets 2-4 stay at default 1000 each.
    expect(total).toBe(5000 + 1000 * 3);
  });
});
