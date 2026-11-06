import { getSupabase } from "@/lib/supabase";
import { nowInColombo } from "@/lib/timezone";
import {
  getAllowanceForRange,
  getAllowanceBreakdown,
  getAllowanceEligibleSet,
} from "@/lib/allowance";

export interface MonthRange {
  year: number;
  month: number; // 1-12
  start: string; // YYYY-MM-01
  end: string; // YYYY-MM-{last}
  label: string; // "August 2026"
}

export function monthRange(year: number, month: number): MonthRange {
  const last = new Date(year, month, 0).getDate();
  return {
    year,
    month,
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
    label: new Date(year, month - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }),
  };
}

export function parseMonthParam(value: string | undefined): MonthRange {
  const now = nowInColombo();
  const m = value?.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return monthRange(now.getFullYear(), now.getMonth() + 1);
  const year = Number(m[1]);
  const month = Math.min(12, Math.max(1, Number(m[2])));
  return monthRange(year, month);
}

export interface MonthTxn {
  id: string;
  date: string;
  amount: number;
  type: "expense" | "income" | "savings" | "transfer";
  category: string | null;
  merchant: string | null;
  source: string;
  raw_text: string | null;
  needs_review: boolean;
  account: string | null;
  counts_toward_allowance?: boolean | null;
}

export interface MerchantTotal {
  merchant: string;
  amount: number;
  count: number;
}

export interface CategoryDelta {
  category: string;
  current: number;
  previous: number;
  delta: number;
}

export interface AllowanceBucketPerformance {
  bucketNumber: number;
  startDate: string;
  endDate: string;
  allocated: number;
  spent: number;
  source: "default" | "override";
  isCurrent: boolean;
}

export interface MonthlyReport {
  range: MonthRange;
  prevRange: MonthRange;
  income: number;
  expenses: number;
  savings: number;
  balance: number;
  allowanceIncome: number;
  allowanceBalance: number;
  needsReviewCount: number;
  txnCount: number;
  expensesByCategory: Record<string, number>;
  incomeByCategory: Record<string, number>;
  topMerchants: MerchantTotal[];
  categoryDeltas: CategoryDelta[];
  allowanceBuckets: AllowanceBucketPerformance[];
  vsPrev: {
    expenses: number;
    income: number;
    savings: number;
  };
}

async function fetchMonthTxns(supabase: ReturnType<typeof getSupabase>, start: string, end: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .gte("date", start)
    .lte("date", end);
  if (error) throw error;
  return (data ?? []) as MonthTxn[];
}

export async function getMonthlyReport(month: string | undefined): Promise<MonthlyReport> {
  const range = parseMonthParam(month);
  const prevStart = new Date(range.year, range.month - 2, 1);
  const prevRange = monthRange(prevStart.getFullYear(), prevStart.getMonth() + 1);

  const supabase = getSupabase();
  const [cur, prev] = await Promise.all([
    fetchMonthTxns(supabase, range.start, range.end),
    fetchMonthTxns(
      supabase,
      `${prevRange.year}-${String(prevRange.month).padStart(2, "0")}-01`,
      prevRange.end
    ),
  ]);

  let income = 0;
  let expenses = 0;
  let savings = 0;
  let allowanceEligibleExpenses = 0;
  const eligible = await getAllowanceEligibleSet();
  const expensesByCategory: Record<string, number> = {};
  const incomeByCategory: Record<string, number> = {};
  const merchantMap = new Map<string, { amount: number; count: number }>();

  for (const t of cur) {
    const amt = Number(t.amount);
    const cat = t.category ?? "Other";
    if (t.type === "income") {
      income += amt;
      incomeByCategory[cat] = (incomeByCategory[cat] ?? 0) + amt;
    } else if (t.type === "expense") {
      expenses += amt;
      expensesByCategory[cat] = (expensesByCategory[cat] ?? 0) + amt;
      if (
        t.category &&
        eligible.has(t.category) &&
        t.account !== "savings" &&
        t.counts_toward_allowance !== false
      )
        allowanceEligibleExpenses += amt;
      if (t.merchant) {
        const e = merchantMap.get(t.merchant) ?? { amount: 0, count: 0 };
        e.amount += amt;
        e.count += 1;
        merchantMap.set(t.merchant, e);
      }
    } else if (t.type === "savings") {
      savings += amt;
    }
    // "transfer" (ATM withdrawal) is a bank -> cash move, not a period total.
  }

  const topMerchants: MerchantTotal[] = [...merchantMap.entries()]
    .map(([merchant, v]) => ({ merchant, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  // Previous month totals + category deltas.
  let prevExpenses = 0;
  let prevIncome = 0;
  let prevSavings = 0;
  const prevByCat: Record<string, number> = {};
  for (const t of prev) {
    const amt = Number(t.amount);
    const cat = t.category ?? "Other";
    if (t.type === "expense") {
      prevExpenses += amt;
      prevByCat[cat] = (prevByCat[cat] ?? 0) + amt;
    } else if (t.type === "income") prevIncome += amt;
    else if (t.type === "savings") prevSavings += amt;
    // "transfer" excluded from previous-month totals too.
  }

  const allCats = new Set([...Object.keys(expensesByCategory), ...Object.keys(prevByCat)]);
  const categoryDeltas: CategoryDelta[] = [...allCats]
    .map((c) => ({
      category: c,
      current: expensesByCategory[c] ?? 0,
      previous: prevByCat[c] ?? 0,
      delta: (expensesByCategory[c] ?? 0) - (prevByCat[c] ?? 0),
    }))
    .sort((a, b) => b.current - a.current);

  // Allowance is a computed monthly-bucket model; bills/commitments
  // (flagged categories) don't burn it.
  const allowanceIncome = await getAllowanceForRange(range.start, range.end);

  // Per-bucket performance: real date ranges + allocated (override-aware)
  // + actual eligible spend inside each bucket's dates.
  const breakdown = await getAllowanceBreakdown(range.year, range.month);
  const todayStr = (() => {
    const n = nowInColombo();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();
  const allowanceBuckets: AllowanceBucketPerformance[] = breakdown.map((b) => {
    const spent = cur
      .filter(
        (t) =>
          t.type === "expense" &&
          t.date >= b.startDate &&
          t.date <= b.endDate &&
          eligible.has(t.category ?? "Other") &&
          t.account !== "savings" &&
          t.counts_toward_allowance !== false
      )
      .reduce((s, t) => s + Number(t.amount), 0);
    return {
      bucketNumber: b.bucketNumber,
      startDate: b.startDate,
      endDate: b.endDate,
      allocated: b.amount,
      spent: Math.round(spent * 100) / 100,
      source: b.source,
      isCurrent: todayStr >= b.startDate && todayStr <= b.endDate,
    };
  });

  return {
    range,
    prevRange,
    income,
    expenses,
    savings,
    balance: income - expenses - savings,
    allowanceIncome,
    allowanceBalance: allowanceIncome - allowanceEligibleExpenses,
    needsReviewCount: cur.filter((t) => t.needs_review).length,
    txnCount: cur.length,
    expensesByCategory,
    incomeByCategory,
    topMerchants,
    categoryDeltas,
    allowanceBuckets,
    vsPrev: { expenses: prevExpenses, income: prevIncome, savings: prevSavings },
  };
}