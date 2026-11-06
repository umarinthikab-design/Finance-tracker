import { getSupabase } from "@/lib/supabase";
import { nowInColombo } from "@/lib/timezone";
import { getAllowanceForRange, getAllowanceFlow } from "@/lib/allowance";
import { getMonthlyReport } from "@/lib/monthly";

export type Period = "week" | "month" | "year";

export interface PeriodRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  label: string;
}

export function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sun
  const diff = (day + 6) % 7; // days since Monday
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - diff);
  return date;
}

export function getPeriodRange(period: Period, now: Date = nowInColombo()): PeriodRange {
  if (period === "week") {
    const start = startOfWeek(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
      start: toISODate(start),
      end: toISODate(end),
      label: "This week",
    };
  }
  if (period === "year") {
    return {
      start: `${now.getFullYear()}-01-01`,
      end: `${now.getFullYear()}-12-31`,
      label: "This year",
    };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: toISODate(start),
    end: toISODate(end),
    label: "This month",
  };
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type TxnKind = "expense" | "income" | "savings" | "transfer";

export interface Transaction {
  id: string;
  title?: string | null;
  date: string;
  amount: number;
  currency: string;
  type: TxnKind;
  category: string | null;
  subcategory: string | null;
  merchant: string | null;
  source: "manual" | "sms" | "email";
  raw_text: string | null;
  needs_review: boolean;
  account: string; // "cash" | "bank" | "savings"
  counts_toward_allowance?: boolean | null;
  created_at: string;
}

export interface CategoryTotals {
  [category: string]: number;
}

/** One month's figures inside a year view (reuses the monthly report). */
export interface YearMonthSummary {
  month: number; // 1-12
  label: string; // "January 2026"
  income: number;
  expenses: number;
  savings: number;
  balance: number;
  allowanceIncome: number;
  allowanceBalance: number;
  needsReviewCount: number;
  txnCount: number;
}

export interface DashboardSummary {
  period: Period;
  label: string;
  start: string;
  end: string;
  income: number;
  expenses: number;
  savings: number;
  balance: number; // income - expenses - savings
  allowanceIncome: number; // income in the "Allowance" category
  allowanceBalance: number; // allowance income - total expenses
  expensesByCategory: CategoryTotals;
  incomeByCategory: CategoryTotals;
  transactionCount: number;
  needsReviewCount: number;
  // projected savings for the month (month period only)
  projectedMonthlySavings: number | null;
  projectedMonthlyExpenses: number | null;
  currentTotalBalance: number | null; // sum(opening_balances) + net flow since earliest as_of_date
  cashBalance: number | null; // cash-in-hand bucket of the split
  bankBalance: number | null; // bank/card bucket of the split
  savingsBalance: number | null; // savings bucket of the split
  allowanceCashLeft: number | null; // flow-tracked allowance left in cash pocket
  allowanceBankLeft: number | null; // flow-tracked allowance left in bank pocket
  months: YearMonthSummary[]; // per-month breakdown (year period only)
}

export async function getDashboardSummary(
  period: Period
): Promise<DashboardSummary> {
  const range = getPeriodRange(period);
  const now = nowInColombo();
  const supabase = getSupabase();

  // Opening balances (seed cash-in-hand / cash-in-bank). Current total balance
  // = sum(opening_balances.amount) + net transaction flow since the earliest
  // as_of_date, so historical balances are counted exactly once.
  const balances = await getBalances();
  const currentTotalBalance = balances?.total ?? null;
  const cashBalance = balances?.cash ?? null;
  const bankBalance = balances?.bank ?? null;
  const savingsBalance = balances?.savings ?? null;

  const { data: txns, error } = await supabase
    .from("transactions")
    .select("*")
    .gte("date", range.start)
    .lte("date", range.end)
    .order("date", { ascending: false });

  if (error) throw error;
  const list = (txns ?? []) as Transaction[];

  let income = 0;
  let expenses = 0;
  let savings = 0;
  const expensesByCategory: CategoryTotals = {};
  const incomeByCategory: CategoryTotals = {};

  // Allowance-eligible categories (strictly flagged true; batched once).
  const cats = await getCategories(true);
  const allowanceEligible = new Set(
    cats
      .filter((c) => c.counts_toward_allowance === true)
      .map((c) => c.name)
  );
  let allowanceEligibleExpenses = 0;

  for (const t of list) {
    const amt = Number(t.amount);
    if (t.type === "income") {
      income += amt;
      incomeByCategory[t.category ?? "Other"] =
        (incomeByCategory[t.category ?? "Other"] ?? 0) + amt;
    } else if (t.type === "expense") {
      expenses += amt;
      expensesByCategory[t.category ?? "Other"] =
        (expensesByCategory[t.category ?? "Other"] ?? 0) + amt;
      // Allowance burns from the spendable pockets (cash + bank) only —
      // an expense paid from savings comes out of the savings bucket and
      // must not deduct from the allowance. The per-transaction checkbox
      // (counts_toward_allowance) excludes a specific purchase even when
      // its category normally counts.
      if (
        t.category &&
        allowanceEligible.has(t.category) &&
        t.account !== "savings" &&
        t.counts_toward_allowance !== false
      ) {
        allowanceEligibleExpenses += amt;
      }
    } else if (t.type === "savings") {
      savings += amt;
    }
    // "transfer" (e.g. ATM withdrawal) moves bank -> cash; it is not
    // income, expense, or savings for period totals.
  }

  // Allowance is a computed weekly model (settings + overrides), not a
  // sum of "Allowance"-tagged transactions. Bills/commitments (categories
  // flagged counts_toward_allowance = false) don't burn it.
  const allowanceIncome = await getAllowanceForRange(range.start, range.end);
  const allowanceFlow = await getAllowanceFlow(range.start, range.end);
  const balance = income - expenses - savings;
  const allowanceBalance = allowanceIncome - allowanceEligibleExpenses;

  // Projected month: annualize the daily run-rate so far.
  let projectedMonthlyExpenses: number | null = null;
  let projectedMonthlySavings: number | null = null;
  if (period === "month") {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    if (dayOfMonth >= 1) {
      projectedMonthlyExpenses = Math.round((expenses / dayOfMonth) * daysInMonth * 100) / 100;
      const projectedIncome = Math.round((income / dayOfMonth) * daysInMonth * 100) / 100;
      projectedMonthlySavings =
        Math.round((projectedIncome - projectedMonthlyExpenses - savings) * 100) / 100;
    }
  }

  // Year view: list each month by reusing the existing monthly report so the
  // allowance figures resolve against each month's own active rate.
  let months: YearMonthSummary[] = [];
  if (period === "year") {
    const year = now.getFullYear();
    const reports = await Promise.all(
      Array.from({ length: 12 }, (_, i) => getMonthlyReport(`${year}-${i + 1}`))
    );
    months = reports.map((r, i) => ({
      month: i + 1,
      label: r.range.label,
      income: r.income,
      expenses: r.expenses,
      savings: r.savings,
      balance: r.balance,
      allowanceIncome: r.allowanceIncome,
      allowanceBalance: r.allowanceBalance,
      needsReviewCount: r.needsReviewCount,
      txnCount: r.txnCount,
    }));
  }

  return {
    period,
    label: range.label,
    start: range.start,
    end: range.end,
    income,
    expenses,
    savings,
    balance,
    allowanceIncome,
    allowanceBalance,
    expensesByCategory,
    incomeByCategory,
     transactionCount: list.length,
    needsReviewCount: list.filter((t) => t.needs_review).length,
    projectedMonthlySavings,
    projectedMonthlyExpenses,
    currentTotalBalance,
    cashBalance,
    bankBalance,
    savingsBalance,
    allowanceCashLeft: allowanceFlow.cash,
    allowanceBankLeft: allowanceFlow.bank,
    months,
  };
}

export async function getRecentTransactions(limit = 10): Promise<Transaction[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Transaction[];
}

export interface Category {
  name: string;
  type: string;
  hidden?: boolean;
  counts_toward_allowance?: boolean;
}

export async function getCategories(
  includeHidden = false
): Promise<Category[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("categories")
    .select("name, type, hidden, counts_toward_allowance")
    .order("name");
  if (!includeHidden) query = query.eq("hidden", false);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Category[];
}

export interface BalanceSplit {
  cash: number; // cash-in-hand bucket
  bank: number; // bank/card bucket
  savings: number; // savings bucket
  total: number; // cash + bank + savings
}

/**
 * Cash / bank / savings split of the current total balance.
 *
 * total = sum(opening_balances.amount) + net transaction flow since the
 * earliest opening balance's as_of_date (null if no balances seeded).
 *
 * Buckets:
 * - opening_balances.kind decides which bucket each seed belongs to
 *   ("cash" | "bank" | "savings").
 * - Income adds to the bucket in the transaction's `account` column;
 *   expenses draw from it.
 * - "savings"-type transactions MOVE money: they leave the source bucket
 *   (`account`: cash/bank) and land in the savings bucket.
 * - "transfer" transactions (ATM withdrawals) move amount from the bank
 *   bucket to the cash bucket — net zero on the total.
 */
export async function getBalances(): Promise<BalanceSplit | null> {
  const supabase = getSupabase();
  const { data: obRows, error: obError } = await supabase
    .from("opening_balances")
    .select("amount, kind, as_of_date")
    .order("as_of_date", { ascending: true });

  if (obError || !obRows || obRows.length === 0) return null;

  let cash = 0;
  let bank = 0;
  let savings = 0;
  for (const r of obRows as { amount: number; kind: string }[]) {
    const amt = Number(r.amount);
    if (r.kind === "cash") cash += amt;
    else if (r.kind === "savings") savings += amt;
    else bank += amt;
  }

  const earliest = (obRows as { as_of_date: string }[])[0].as_of_date;
  const { data: txns, error: txErr } = await supabase
    .from("transactions")
    .select("type, amount, account, to_account")
    .gte("date", earliest);
  if (txErr || !txns) throw txErr;

  const acct = (a: string | null) =>
    a === "bank" ? "bank" : a === "savings" ? "savings" : "cash";

  for (const t of txns as {
    type: string;
    amount: number;
    account: string | null;
    to_account?: string | null;
  }[]) {
    const amt = Number(t.amount);
    const src = acct(t.account);

    if (t.type === "transfer") {
      // FROM account -> TO account. Legacy rows (no to_account) keep the
      // original ATM shape: bank -> cash-in-hand.
      const to = acct((t as { to_account?: string | null }).to_account ?? null);
      const from = src;
      if (from === "cash") cash -= amt;
      else if (from === "savings") savings -= amt;
      else bank -= amt;
      if (to === "cash") cash += amt;
      else if (to === "savings") savings += amt;
      else bank += amt;
      continue;
    }

    if (t.type === "savings") {
      // Money moves from its source bucket INTO savings.
      if (src === "cash") cash -= amt;
      else bank -= amt;
      savings += amt;
      continue;
    }

    // income adds to the bucket; expenses leave the spendable flow.
    const delta = t.type === "income" ? amt : -amt;
    if (src === "bank") bank += delta;
    else if (src === "savings") savings += delta;
    else cash += delta;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  cash = round(cash);
  bank = round(bank);
  savings = round(savings);
  return { cash, bank, savings, total: round(cash + bank + savings) };
}

/** Current total balance (cash + bank). Null if no balances seeded. */
export async function getCurrentTotalBalance(): Promise<number | null> {
  const balances = await getBalances();
  return balances?.total ?? null;
}