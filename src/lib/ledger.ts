import { getSupabase } from "@/lib/supabase";
import { todayISOInColombo } from "@/lib/timezone";

/**
 * Ledger helpers — the single place that turns loan/investment lifecycle
 * events into transactions. Kept separate from the server actions so the
 * DB behavior can be verified directly.
 */

export async function logLoanCreation(opts: {
  direction: string;
  paid: number;
  date?: string;
}) {
  if (opts.paid <= 0) return;
  const supabase = getSupabase();
  // Both directions log what has already moved: payable = expense, receivable
  // = income — so a retroactively-created loan with a starting `paid` amount
  // isn't invisible in transaction history.
  await supabase.from("transactions").insert({
    date: opts.date ?? todayISOInColombo(),
    amount: opts.paid,
    currency: "LKR",
    type: opts.direction === "payable" ? "expense" : "income",
    category: "Loans",
    subcategory: null,
    merchant: null,
    source: "manual",
    needs_review: false,
  });
}

export async function logLoanPayment(opts: {
  loanId: string;
  newPaid: number;
  date?: string;
}): Promise<{ delta: number; type: "expense" | "income" | null }> {
  const supabase = getSupabase();
  const { data: loan } = await supabase
    .from("loans")
    .select("paid, direction")
    .eq("id", opts.loanId)
    .single();

  const oldPaid = Number((loan as { paid?: number })?.paid ?? 0);
  const direction = String((loan as { direction?: string })?.direction ?? "payable");
  const delta = opts.newPaid - oldPaid;

  if (delta === 0) return { delta: 0, type: null };

  // A higher `paid` logs the extra movement; correcting downward logs the
  // reversal (opposite type), so history stays in sync with the loan.
  const base: "expense" | "income" = direction === "payable" ? "expense" : "income";
  const type: "expense" | "income" = delta > 0 ? base : base === "expense" ? "income" : "expense";
  await supabase.from("transactions").insert({
    date: opts.date ?? todayISOInColombo(),
    amount: Math.abs(delta),
    currency: "LKR",
    type,
    category: "Loans",
    subcategory: null,
    merchant: null,
    source: "manual",
    needs_review: false,
  });
  return { delta, type };
}

export async function logInvestment(opts: {
  amount: number;
  date?: string;
}) {
  if (opts.amount <= 0) return;
  const supabase = getSupabase();
  await supabase.from("transactions").insert({
    date: opts.date ?? todayISOInColombo(),
    amount: opts.amount,
    currency: "LKR",
    type: "savings",
    category: "Investments",
    subcategory: null,
    merchant: null,
    source: "manual",
    needs_review: false,
  });
}