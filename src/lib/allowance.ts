import { getSupabase } from "@/lib/supabase";

export interface AllowanceSetting {
  id: string;
  default_weekly_amount: number;
  effective_from: string;
}

export interface CycleBucketConfig {
  bucketNumber: number; // 1..4
  startDay: number; // 1..31
}

export interface AllowanceOverride {
  id: string;
  year: number;
  month: number; // 1..12
  bucketNumber: number; // 1..4
  amount: number;
}

export interface ResolvedBucket {
  bucketNumber: number;
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
}

export interface BucketAllowance extends ResolvedBucket {
  amount: number;
  source: "default" | "override";
}

/** Days in a given month (month is 1-12). Handles leap years correctly. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Pure computation: turn cycle config into concrete calendar buckets for one
 * month. Each bucket starts on its configured start_day (clamped to the
 * month's length) and ends the day before the next bucket's start_day; the
 * last bucket ends on the final day of the month.
 */
export function computeBuckets(
  config: CycleBucketConfig[],
  year: number,
  month: number
): ResolvedBucket[] {
  const last = daysInMonth(year, month);
  const sorted = [...config].sort((a, b) => a.bucketNumber - b.bucketNumber);
  const starts = sorted.map((c) => Math.min(c.startDay, last));

  return sorted.map((c, i) => {
    const start = starts[i];
    const nextStart = i < starts.length - 1 ? starts[i + 1] : null;
    // End = day before next bucket's start; bucket 4 ends at month end.
    let end = nextStart !== null ? Math.min(nextStart - 1, last) : last;
    if (end < start) end = start - 1; // degenerate (clamped) bucket -> empty
    return {
      bucketNumber: c.bucketNumber,
      startDate: isoOf(year, month, start),
      endDate: isoOf(year, month, end),
    };
  });
}

function isoOf(year: number, month: number, day: number): string {
  const d = Math.min(Math.max(day, 1), 31);
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, daysInMonth(year, month))).padStart(2, "0")}`;
}

/** Human label with real dates, e.g. "Week 3 (17–23 Aug)". */
export function bucketLabel(bucket: ResolvedBucket, opts?: { long?: boolean }): string {
  if (bucket.startDate > bucket.endDate) {
    return `Week ${bucket.bucketNumber} (—)`;
  }
  const s = new Date(`${bucket.startDate}T00:00:00`);
  const e = new Date(`${bucket.endDate}T00:00:00`);
  const fmtShort = new Intl.DateTimeFormat("en-GB", { day: "numeric" });
  const fmtLong = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  });
  return opts?.long
    ? `Week ${bucket.bucketNumber} (${fmtLong.format(s)} – ${fmtLong.format(e)})`
    : `Week ${bucket.bucketNumber} (${fmtShort.format(s)}–${fmtLong.format(e)})`;
}

export async function getCycleConfig(): Promise<CycleBucketConfig[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("allowance_cycle_config")
    .select("bucket_number, start_day")
    .order("bucket_number");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    bucketNumber: Number((r as { bucket_number: number }).bucket_number),
    startDay: Number((r as { start_day: number }).start_day),
  }));
}

/** Resolve this month's four buckets from the stored config. */
export async function resolveAllowanceBuckets(
  year: number,
  month: number
): Promise<ResolvedBucket[]> {
  const config = await getCycleConfig();
  return computeBuckets(config, year, month);
}

async function getAllAllowanceSettings(): Promise<AllowanceSetting[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("allowance_settings")
    .select("id, default_weekly_amount, effective_from")
    .order("effective_from", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AllowanceSetting[];
}

/**
 * The active setting as of a given date (Colombo): the most recent
 * `effective_from` <= `asOfDate`. Callers must pass the date they are
 * actually computing for — never assume "today" — so historical reports
 * keep the rate that was really in effect for their period.
 */
export async function getActiveAllowanceSetting(
  asOfDate: string
): Promise<AllowanceSetting | null> {
  const settings = await getAllAllowanceSettings();
  let active: AllowanceSetting | null = null;
  for (const s of settings) {
    if (s.effective_from <= asOfDate) active = s;
  }
  return active;
}

/** Last calendar day of a month as YYYY-MM-DD (used as the as-of date for
 *  a month's rate, so a mid-month change is resolved within that month). */
function lastDayISO(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
}

export async function getAllAllowanceOverrides(): Promise<AllowanceOverride[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("allowance_overrides")
    .select("id, year, month, bucket_number, amount")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .order("bucket_number");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const o = r as Record<string, unknown>;
    return {
      id: String(o.id),
      year: Number(o.year),
      month: Number(o.month),
      bucketNumber: Number(o.bucket_number),
      amount: Number(o.amount),
    };
  });
}

/**
 * Per-bucket breakdown for one month: each bucket gets its override amount
 * if one exists, otherwise the active default.
 */
export async function getAllowanceBreakdown(
  year: number,
  month: number
): Promise<BucketAllowance[]> {
  const [active, overrides, buckets] = await Promise.all([
    // Rate as of the END of the reported month, so a mid-month change is
    // resolved correctly for that same month and never rewritten later.
    getActiveAllowanceSetting(lastDayISO(year, month)),
    getAllAllowanceOverrides(),
    resolveAllowanceBuckets(year, month),
  ]);
  const key = (y: number, m: number, b: number) => `${y}-${m}-${b}`;
  const byBucket = new Map(
    overrides.map((o) => [key(o.year, o.month, o.bucketNumber), Number(o.amount)])
  );
  const def = Number(active?.default_weekly_amount ?? 0);

  return buckets.map((b) => {
    const overrideAmt = byBucket.get(key(year, month, b.bucketNumber));
    return {
      ...b,
      amount: overrideAmt ?? def,
      source: overrideAmt !== undefined ? "override" : "default",
    };
  });
}

function daysBetweenInclusive(startISO: string, endISO: string): number {
  const a = Date.parse(`${startISO}T00:00:00Z`);
  const b = Date.parse(`${endISO}T00:00:00Z`);
  return Math.floor((b - a) / 86_400_000) + 1;
}

function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const s = aStart > bStart ? aStart : bStart;
  const e = aEnd < bEnd ? aEnd : bEnd;
  if (s > e) return 0;
  return daysBetweenInclusive(s, e);
}

/**
 * Computed allowance income for an arbitrary period. Buckets are monthly,
 * so periods that partially cover buckets are prorated by days; a full
 * month view sums the buckets exactly. Never a transaction.
 */
export async function getAllowanceForRange(
  startISO: string,
  endISO: string
): Promise<number> {
  const [settings, overrides] = await Promise.all([
    getAllAllowanceSettings(),
    getAllAllowanceOverrides(),
  ]);
  const key = (y: number, m: number, b: number) => `${y}-${m}-${b}`;
  const byBucket = new Map(
    overrides.map((o) => [key(o.year, o.month, o.bucketNumber), Number(o.amount)])
  );
  // Resolve the rate inside the month loop so each month uses the setting
  // that was active at its end — a rate change mid-range doesn't bleed into
  // months before it took effect.
  const rateAsOf = (y: number, m: number): number => {
    const asOf = lastDayISO(y, m);
    let amt = 0;
    for (const s of settings) {
      if (s.effective_from <= asOf) amt = Number(s.default_weekly_amount);
    }
    return amt;
  };

  const startY = Number(startISO.slice(0, 4));
  const startM = Number(startISO.slice(5, 7));
  const endY = Number(endISO.slice(0, 4));
  const endM = Number(endISO.slice(5, 7));

  let total = 0;
  const config = await getCycleConfig();
  for (
    let y = startY, m = startM;
    y < endY || (y === endY && m <= endM);
    m === 12 ? (y += 1, (m = 1)) : (m += 1)
  ) {
    const def = rateAsOf(y, m);
    const buckets = computeBuckets(config, y, m);
    for (const b of buckets) {
      const days = overlapDays(startISO, endISO, b.startDate, b.endDate);
      if (days <= 0) continue;
      const bucketDays = daysBetweenInclusive(b.startDate, b.endDate);
      if (bucketDays <= 0) continue;
      const amt = byBucket.get(key(y, m, b.bucketNumber)) ?? def;
      total += (amt * days) / bucketDays;
    }
  }
  return Math.round(total * 100) / 100;
}

export interface AllowanceFlowSplit {
  cash: number;
  bank: number;
  combined: number;
}

/**
 * Categories whose expenses burn the allowance. Strictly `=== true` (not
 * `!== false`) so a category row with a null/undefined flag is treated as
 * NOT eligible, matching getDashboardSummary's and getAllowanceFlow's
 * category filters exactly rather than diverging on that edge case.
 */
export async function getAllowanceEligibleSet(): Promise<Set<string>> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("categories")
    .select("name, counts_toward_allowance");
  return new Set(
    ((data ?? []) as { name: string; counts_toward_allowance: boolean | null }[])
      .filter((c) => c.counts_toward_allowance === true)
      .map((c) => c.name)
  );
}

/**
 * Flow-tracked allowance split for a period.
 *
 * The allowance accrues continuously (each bucket drips its daily share)
 * into the BANK pool. ATM withdrawals (transfer) carry money from the bank
 * pool to the cash pool; expenses drain whichever pocket they were paid
 * from. What remains in each pool at period end is the allowance actually
 * left there.
 */
export async function getAllowanceFlow(
  startISO: string,
  endISO: string
): Promise<AllowanceFlowSplit> {
  const supabase = getSupabase();

  const startY = Number(startISO.slice(0, 4));
  const startM = Number(startISO.slice(5, 7));
  const endY = Number(endISO.slice(0, 4));
  const endM = Number(endISO.slice(5, 7));

  // Override-aware breakdown for every month the period touches.
  const bdCache = new Map<
    string,
    Awaited<ReturnType<typeof getAllowanceBreakdown>>
  >();
  await Promise.all(
    Array.from({ length: (endY - startY) * 12 + (endM - startM) + 1 }, (_, i) => {
      let y = startY;
      let m = startM + i;
      if (m > 12) {
        y += Math.floor((m - 1) / 12);
        m = ((m - 1) % 12) + 1;
      }
      return `${y}-${m}`;
    }).map(async (k) => {
      const [y, m] = k.split("-").map(Number);
      bdCache.set(k, await getAllowanceBreakdown(y, m));
    })
  );

  // Category->flag map fetched once, batched with the transaction fetch.
  const [{ data: txns }, { data: catRows }] = await Promise.all([
    supabase
      .from("transactions")
      .select("date, type, amount, account, to_account, category, counts_toward_allowance")
      .gte("date", startISO)
      .lte("date", endISO)
      .order("date"),
    supabase.from("categories").select("name, counts_toward_allowance"),
  ]);
  // Strictly counts_toward_allowance = true burns the pools; anything
  // unknown (null/uncategorized) is treated as a bill and ignored here.
  // Account balances in getBalances() still reflect the real outflow.
  const eligible = new Set(
    ((catRows ?? []) as { name: string; counts_toward_allowance: boolean | null }[])
      .filter((c) => c.counts_toward_allowance === true)
      .map((c) => c.name)
  );
  type FlowTxn = {
    type: string;
    amount: number;
    account: string | null;
    to_account?: string | null;
    category: string | null;
    counts_toward_allowance?: boolean | null;
  };
  const byDate = new Map<string, FlowTxn[]>();
  for (const t of (txns ?? []) as (FlowTxn & { date: string })[]) {
    const list = byDate.get(t.date) ?? [];
    list.push({
      type: t.type,
      amount: Number(t.amount),
      account: t.account,
      to_account: t.to_account,
      category: t.category,
      counts_toward_allowance: t.counts_toward_allowance,
    });
    byDate.set(t.date, list);
  }

  let bank = 0;
  let cash = 0;
  const cur = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  const round = (n: number) => Math.round(n * 100) / 100;

  while (cur <= end) {
    const y = cur.getFullYear();
    const mo = cur.getMonth() + 1;
    const dd = String(cur.getDate()).padStart(2, "0");
    const iso = `${y}-${String(mo).padStart(2, "0")}-${dd}`;
    const mk = `${y}-${mo}`;

    // Daily allowance accrual drips into the bank pool.
    for (const b of bdCache.get(mk) ?? []) {
      const days = daysBetweenInclusive(b.startDate, b.endDate);
      if (days > 0 && iso >= b.startDate && iso <= b.endDate) {
        bank += b.amount / days;
      }
    }

    for (const t of byDate.get(iso) ?? []) {
      const amt = Number(t.amount);
      const src =
        t.account === "bank" ? "bank" : t.account === "savings" ? "savings" : "cash";
      if (t.type === "transfer") {
        // FROM -> TO between any buckets. Only cash/bank sides touch the
        // allowance pools; savings was never part of the allowance.
        const to =
          t.to_account === "bank"
            ? "bank"
            : t.to_account === "savings"
              ? "savings"
              : "cash"; // legacy null fallback: bank -> cash (to=cash)
        if (src === "bank") bank -= amt;
        else if (src === "cash") cash -= amt;
        // src === "savings": outflow from savings, pools unaffected
        if (to === "bank") bank += amt;
        else if (to === "cash") cash += amt;
        // to === "savings": inflow into savings, pools unaffected
      } else if (t.type === "expense") {
        // Bills/commitments and uncategorized entries don't burn the
        // allowance — only explicitly flagged categories do — and a
        // per-transaction "count toward allowance" override excludes a
        // specific purchase even when its category normally counts.
        if (!t.category || !eligible.has(t.category)) continue;
        if (t.counts_toward_allowance === false) continue;
        if (src === "bank") bank -= amt;
        else if (src === "cash") cash -= amt;
        // savings-account expenses sit outside the allowance pools
      }
    }

    cur.setDate(cur.getDate() + 1);
  }

  cash = round(cash);
  bank = round(bank);
  return { cash, bank, combined: round(cash + bank) };
}
