"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { clearSessionCookie, isAuthenticated, setSessionCookie, updatePassword, verifyPassword } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { logInvestment, logLoanCreation, logLoanPayment } from "@/lib/ledger";
import { todayISOInColombo } from "@/lib/timezone";
import { saveMerchantCategory } from "@/lib/merchant";
import { loginRateLimiter } from "@/lib/rate-limit";
import { advanceDueDate } from "@/lib/recurrence";
import { logActivity } from "@/lib/activity";
import { formatLKR } from "@/lib/format";

export type LoginState = { error?: string } | null;

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  // Rate limit by IP. In-memory stopgap — see rate-limit.ts note.
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (loginRateLimiter(ip)) {
    return { error: "Too many attempts — wait a minute and try again" };
  }

  const password = String(formData.get("password") ?? "");

  const valid = await verifyPassword(password);

  if (!valid) {
    return { error: "Incorrect password" };
  }

  await setSessionCookie();
  redirect("/");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}

async function assertAuthed() {
  if (!(await isAuthenticated())) {
    throw new Error("Unauthorized");
  }
}

// ------------------------------------------------------------
// Transactions
// ------------------------------------------------------------

export type FormState = { error?: string; success?: boolean } | null;

export async function createTransaction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();

  const date = String(formData.get("date") ?? "");
  const amount = Number(formData.get("amount"));
  const type = String(formData.get("type") ?? "");
  const category = String(formData.get("category") ?? "") || null;
  const notes = String(formData.get("notes") ?? "") || null;
  const title = String(formData.get("title") ?? "").trim() || null;
  // Which bucket this touches: cash-in-hand or bank/card. Manual entries
  // default to cash; SMS entries are always inserted as "bank".
  const acctRaw = String(formData.get("account") ?? "cash");
  const account =
    acctRaw === "bank" ? "bank" : acctRaw === "savings" ? "savings" : "cash";
  const toAcctRaw = String(formData.get("to_account") ?? "");
  const toAccount = ["bank", "savings", "cash"].includes(toAcctRaw) ? toAcctRaw : null;
  // Per-transaction allowance override. Default ticked (counts toward the
  // allowance); unticking excludes this spend regardless of category.
  const countsTowardAllowance = formData.get("counts_toward_allowance") === "on";

  if (!date || !Number.isFinite(amount) || amount <= 0) {
    return { error: "Date and a positive amount are required" };
  }
  if (!["expense", "income", "savings", "transfer"].includes(type)) {
    return { error: "Invalid type" };
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("transactions").insert({
    date,
    amount,
    currency: "LKR",
    type,
    category,
    subcategory: null,
    title,
    source: "manual",
    raw_text: notes,
    account,
    to_account: type === "transfer" ? toAccount : null,
    counts_toward_allowance: countsTowardAllowance,
  });

  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteTransaction(formData: FormData) {
  await assertAuthed();
  const id = String(formData.get("id") ?? "");
  const supabase = getSupabase();
  await supabase.from("transactions").delete().eq("id", id);
  revalidatePath("/transactions");
  revalidatePath("/review");
  revalidatePath("/");
  // Return to where the delete came from (Review or All Transactions).
  redirect(String(formData.get("from") ?? "") === "transactions" ? "/transactions" : "/review");
}

// ------------------------------------------------------------
// SMS cancellation review
//
// A cancellation notice never auto-deletes anything — it only ever gets
// here (removed vs. ignored) through an explicit reviewer action. See
// src/lib/sms/cancellation.ts for how the pending entry and its candidates
// get created.
// ------------------------------------------------------------

/** "Remove this charge": delete the matched transaction the same way
 *  deleteTransaction does (a real delete — a cancelled charge was never a
 *  real financial event, so there's nothing to preserve an offsetting entry
 *  for), then resolve the cancellation entry. logActivity records what was
 *  removed and why, since the transaction row itself won't exist anymore. */
export async function removeCancelledCharge(formData: FormData) {
  await assertAuthed();
  const cancellationId = String(formData.get("cancellation_id") ?? "");
  const transactionId = String(formData.get("transaction_id") ?? "");
  const supabase = getSupabase();

  const { data: txn } = await supabase
    .from("transactions")
    .select("merchant, amount, date")
    .eq("id", transactionId)
    .maybeSingle();

  if (txn) {
    const t = txn as { merchant: string | null; amount: number; date: string };
    await logActivity(
      "removed_cancelled_charge",
      `Removed ${formatLKR(Number(t.amount))} at ${t.merchant ?? "unknown merchant"} on ${t.date} — matched an SMS cancellation notice.`
    );
    await supabase.from("transactions").delete().eq("id", transactionId);
  }

  // .eq("status", "pending") guards against double-submission resolving the
  // same entry twice (e.g. a double click).
  await supabase
    .from("sms_cancellations")
    .update({
      status: "resolved",
      outcome: "removed",
      matched_transaction_id: transactionId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", cancellationId)
    .eq("status", "pending");

  revalidatePath("/review");
  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/monthly");
  redirect("/review");
}

/** "Ignore notice": dismiss the cancellation entry without touching any
 *  transaction — used for the zero-candidate, too-many-candidates, or
 *  "none of these look right" cases. */
export async function ignoreCancellationNotice(formData: FormData) {
  await assertAuthed();
  const cancellationId = String(formData.get("cancellation_id") ?? "");
  const supabase = getSupabase();

  await supabase
    .from("sms_cancellations")
    .update({
      status: "resolved",
      outcome: "ignored",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", cancellationId)
    .eq("status", "pending");

  revalidatePath("/review");
  redirect("/review");
}

// ------------------------------------------------------------
// Review
// ------------------------------------------------------------

export async function confirmTransaction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const id = String(formData.get("id") ?? "");
  const supabase = getSupabase();

  const { data } = await supabase
    .from("transactions")
    .select("category, merchant")
    .eq("id", id)
    .single();

  const category = (data as { category: string | null; merchant: string | null } | null)?.category ?? null;
  const merchant = (data as { category: string | null; merchant: string | null } | null)?.merchant ?? null;

  // Block confirming while the category is missing or generic — otherwise the
  // merchant learner would propagate bad categorization to future SMS.
  if (!category || category === "Other" || category === "Other Income") {
    return {
      error: "Set a real category first — confirm is disabled until you fix it below.",
    };
  }

  await supabase.from("transactions").update({ needs_review: false }).eq("id", id);

  // Remember this merchant → category so future SMS from it auto-categorize.
  if (merchant) {
    await saveMerchantCategory(merchant, category);
  }

  revalidatePath("/review");
  return { success: true };
}

export async function updateTransaction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const id = String(formData.get("id") ?? "");
  const amount = Number(formData.get("amount"));
  const type = String(formData.get("type") ?? "");
  const category = String(formData.get("category") ?? "") || null;
  const date = String(formData.get("date") ?? "");
  const title = String(formData.get("title") ?? "").trim() || null;
  const acctRaw = String(formData.get("account") ?? "cash");
  const account =
    acctRaw === "bank" ? "bank" : acctRaw === "savings" ? "savings" : "cash";
  const toAcctRaw = String(formData.get("to_account") ?? "");
  const toAccount = ["bank", "savings", "cash"].includes(toAcctRaw) ? toAcctRaw : null;
  // Checkbox is only submitted for expenses; everything else keeps true.
  const countsTowardAllowance = formData.get("counts_toward_allowance") === "on";

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be a positive number" };
  }
  if (!["expense", "income", "savings", "transfer"].includes(type)) {
    return { error: "Invalid type" };
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("transactions")
    .update({
      amount,
      type,
      category,
      date,
      needs_review: false,
      account,
      title,
      to_account: type === "transfer" ? toAccount : null,
      counts_toward_allowance: countsTowardAllowance,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  // Remember the merchant → category mapping on a real (non-Other) category so
  // future SMS from this merchant auto-categorize without a review pass.
  if (category && category !== "Other" && category !== "Other Income") {
    const { data: tx } = await supabase
      .from("transactions")
      .select("merchant")
      .eq("id", id)
      .maybeSingle();
    const merchant = (tx as { merchant: string | null } | null)?.merchant ?? null;
    if (merchant) {
      await saveMerchantCategory(merchant, category);
    }
  }

  // Works identically from Review or All Transactions — refresh every view
  // that renders transactions or derived totals.
  revalidatePath("/review");
  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/monthly");
  return { success: true };
}

// ------------------------------------------------------------
// Opening balances
// ------------------------------------------------------------

export async function createOpeningBalance(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const label = String(formData.get("label") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const asOf = String(formData.get("as_of_date") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "cash");
  const kind =
    kindRaw === "bank" ? "bank" : kindRaw === "savings" ? "savings" : "cash";
  if (!label) return { error: "Label is required" };
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "A non-negative amount is required" };
  }
  if (!asOf) return { error: "Date is required" };

  const supabase = getSupabase();
  const { error } = await supabase.from("opening_balances").insert({
    label,
    amount,
    as_of_date: asOf,
    kind,
  });
  if (error) return { error: error.message };
  revalidatePath("/settings/opening-balances");
  return { success: true };
}

export async function updateOpeningBalance(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const asOf = String(formData.get("as_of_date") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "cash");
  const kind =
    kindRaw === "bank" ? "bank" : kindRaw === "savings" ? "savings" : "cash";
  if (!id) return { error: "Missing id" };
  if (!label) return { error: "Label is required" };
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "A non-negative amount is required" };
  }
  if (!asOf) return { error: "Date is required" };

  const supabase = getSupabase();
  const { error } = await supabase
    .from("opening_balances")
    .update({ label, amount, as_of_date: asOf, kind })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/opening-balances");
  return { success: true };
}

export async function deleteOpeningBalance(formData: FormData) {
  await assertAuthed();
  const supabase = getSupabase();
  await supabase
    .from("opening_balances")
    .delete()
    .eq("id", String(formData.get("id") ?? ""));
  redirect("/settings/opening-balances");
}

// ------------------------------------------------------------
// Allowance (monthly 4-bucket model: cut-points + default + overrides)
// ------------------------------------------------------------

export async function updateAllowanceDefault(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const id = String(formData.get("id") ?? "");
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "A positive amount is required" };
  }

  const supabase = getSupabase();
  const today = todayISOInColombo();

  // Preserve rate history: an allowance change is a NEW setting dated today,
  // leaving every older row intact. The only in-place update is a same-day
  // correction of a setting that already takes effect today.
  if (id) {
    const { data: row, error: fetchErr } = await supabase
      .from("allowance_settings")
      .select("effective_from")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) return { error: fetchErr.message };
    const effectiveFrom = (row as { effective_from?: string } | null | undefined)
      ?.effective_from;

    if (effectiveFrom === today) {
      const { error } = await supabase
        .from("allowance_settings")
        .update({ default_weekly_amount: amount })
        .eq("id", id);
      if (error) return { error: error.message };
      revalidatePath("/settings/allowance");
      return { success: true };
    }
    // Fall through: the active setting predates today — keep it untouched as
    // history and start a new row effective today.
  }

  const { error } = await supabase.from("allowance_settings").insert({
    default_weekly_amount: amount,
    effective_from: today,
  });
  if (error) return { error: error.message };
  revalidatePath("/settings/allowance");
  return { success: true };
}

export async function updateAllowanceCycleAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();

  const days: number[] = [];
  for (let b = 1; b <= 4; b++) {
    const d = Number(formData.get(`start_day_${b}`));
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      return { error: `Bucket ${b} start day must be an integer between 1 and 31` };
    }
    days.push(d);
  }
  if (days[0] !== 1) return { error: "Bucket 1 must start on day 1" };
  for (let i = 1; i < days.length; i++) {
    if (days[i] <= days[i - 1]) {
      return { error: "Bucket start days must be strictly increasing" };
    }
  }

  const supabase = getSupabase();
  for (let b = 1; b <= 4; b++) {
    const { error } = await supabase
      .from("allowance_cycle_config")
      .update({ start_day: days[b - 1], updated_at: new Date().toISOString() })
      .eq("bucket_number", b);
    if (error) return { error: error.message };
  }
  revalidatePath("/settings/allowance");
  revalidatePath("/");
  revalidatePath("/monthly");
  return { success: true };
}

export async function upsertAllowanceOverride(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const bucketNumber = Number(formData.get("bucket_number"));
  const amount = Number(formData.get("amount"));

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "Enter a valid year" };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "Pick a month (1-12)" };
  }
  if (![1, 2, 3, 4].includes(bucketNumber)) {
    return { error: "Pick a bucket (Week 1-4)" };
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "A non-negative amount is required" };
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("allowance_overrides").upsert(
    { year, month, bucket_number: bucketNumber, amount },
    { onConflict: "year,month,bucket_number" }
  );
  if (error) return { error: error.message };
  revalidatePath("/settings/allowance");
  revalidatePath("/");
  revalidatePath("/monthly");
  return { success: true };
}

export async function deleteAllowanceOverride(formData: FormData) {
  await assertAuthed();
  const supabase = getSupabase();
  await supabase
    .from("allowance_overrides")
    .delete()
    .eq("id", String(formData.get("id") ?? ""));
  redirect("/settings/allowance");
}

// ------------------------------------------------------------
// Loans
// ------------------------------------------------------------

export async function createLoan(formData: FormData) {
  await assertAuthed();
  const supabase = getSupabase();
  const direction = String(formData.get("direction") ?? "payable");
  const paid = Number(formData.get("paid")) || 0;
  const totalAmount = Number(formData.get("total_amount")) || 0;

  if (!Number.isFinite(paid) || paid < 0) {
    throw new Error("Already-paid amount must be a finite, non-negative number");
  }
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    throw new Error("Total amount must be a finite, non-negative number");
  }

  await supabase.from("loans").insert({
    counterparty: String(formData.get("counterparty") ?? ""),
    direction,
    total_amount: totalAmount,
    paid,
    notes: String(formData.get("notes") ?? "") || null,
  });

  // Any pre-existing `paid` amount logs immediately — payable as an expense,
  // receivable as income — so retroactively-created loans aren't invisible.
  await logLoanCreation({ direction, paid });
  redirect("/loans");
}

export async function updateLoanPaid(formData: FormData) {
  await assertAuthed();
  const supabase = getSupabase();
  const id = String(formData.get("id") ?? "");
  const newPaid = Number(formData.get("paid")) || 0;

  if (!Number.isFinite(newPaid) || newPaid < 0) {
    throw new Error("Paid amount must be a finite, non-negative number");
  }

  await logLoanPayment({ loanId: id, newPaid });
  await supabase.from("loans").update({ paid: newPaid }).eq("id", id);
  redirect("/loans");
}

export async function deleteLoan(formData: FormData) {
  await assertAuthed();
  const supabase = getSupabase();
  // Intentionally do NOT touch the transactions table here — deleting the loan
  // record shouldn't rewrite past financial history.
  await supabase.from("loans").delete().eq("id", String(formData.get("id") ?? ""));
  redirect("/loans");
}

// ------------------------------------------------------------
// Investments
// ------------------------------------------------------------

export async function createInvestment(formData: FormData) {
  await assertAuthed();
  const supabase = getSupabase();
  const amount = Number(formData.get("amount")) || 0;
  const date = String(formData.get("date") ?? todayISOInColombo());

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be a finite, non-negative number");
  }

  await supabase.from("investments").insert({
    name: String(formData.get("name") ?? ""),
    amount,
    date,
    notes: String(formData.get("notes") ?? "") || null,
  });

  // Log the investment as a savings transaction.
  await logInvestment({ amount, date });
  redirect("/investments");
}

export async function deleteInvestment(formData: FormData) {
  await assertAuthed();
  const supabase = getSupabase();
  // Intentionally do NOT touch the transactions table here — deleting the
  // investment record shouldn't rewrite past financial history.
  await supabase.from("investments").delete().eq("id", String(formData.get("id") ?? ""));
  redirect("/investments");
}

// ------------------------------------------------------------
// Installments / recurring items
// ------------------------------------------------------------

const TYPE_DEFAULT_CATEGORY: Record<string, string> = {
  expense: "Installments",
  income: "Allowance",
};

const normalizeAccount = (a: string | null | undefined) =>
  a === "bank" ? "bank" : a === "savings" ? "savings" : "cash";

export async function createInstallment(formData: FormData) {
  await assertAuthed();
  const supabase = getSupabase();
  const rawType = String(formData.get("type") ?? "expense");
  const type = rawType === "income" || rawType === "expense" ? rawType : "expense";
  const label = String(formData.get("amount") ?? "") || "0";
  const category =
    String(formData.get("category") ?? "").trim() ||
    TYPE_DEFAULT_CATEGORY[type];
  // NOTE: Recurring items are commitments, not events — we do NOT auto-create a
  // transaction here. The user logs one explicitly via "Log now" when it lands.
  const dueDate = String(formData.get("next_due_date") ?? "") || null;
  // Anchor day: the original day-of-month this item recurs on. Kept so that
  // short months (Feb) don't permanently drift the schedule (Jan 31 -> Feb 28
  // must go back to Mar 31, not Mar 28).
  const anchorDay = dueDate
    ? Number(dueDate.slice(8, 10))
    : Number(todayISOInColombo().slice(8, 10));
  const account = normalizeAccount(String(formData.get("account") ?? "cash"));
  await supabase.from("installments").insert({
    name: String(formData.get("name") ?? ""),
    amount: Number(label) || 0,
    cycle: String(formData.get("cycle") ?? "monthly"),
    type,
    category,
    next_due_date: dueDate,
    anchor_day: anchorDay,
    account,
  });
  redirect("/installments");
}

export async function logRecurringAction(formData: FormData) {
  await assertAuthed();
  const supabase = getSupabase();
  const id = String(formData.get("id") ?? "");
  const { data: row, error } = await supabase
    .from("installments")
    .select("name, amount, type, category, cycle, next_due_date, anchor_day, account, held_for")
    .eq("id", id)
    .single();
  if (error || !row) redirect("/installments");

  const r = row as {
    name: string;
    amount: number;
    type: string;
    category: string | null;
    cycle: string;
    next_due_date: string | null;
    anchor_day?: number | null;
    account?: string | null;
    held_for?: string | null;
  };

  // Log a transaction dated today (Colombo time) with the item's amount/type,
  // drawing from the bucket the item is configured against.
  await supabase.from("transactions").insert({
    date: todayISOInColombo(),
    amount: Number(r.amount),
    currency: "LKR",
    type: r.type as "expense" | "income" | "savings",
    category: r.category ?? TYPE_DEFAULT_CATEGORY[r.type as "expense" | "income"],
    source: "manual",
    account: normalizeAccount(r.account),
  });

  // Advance next_due_date by one cycle. When the item was held, advance from
  // the SKIPPED occurrence (restores the original schedule, no double-skip);
  // otherwise from the scheduled date (not today), so overdue logs don't drift
  // the schedule. Clamped against the item's ANCHOR DAY so short months don't
  // drift (Jan 31 -> Feb 28 -> Mar 31). A hold is always cleared on log.
  const baseISO = /^\d{4}-\d{2}-\d{2}$/.test(r.held_for ?? "")
    ? (r.held_for as string)
    : /^\d{4}-\d{2}-\d{2}$/.test(r.next_due_date ?? "")
      ? (r.next_due_date as string)
      : todayISOInColombo();
  const nextISO = advanceDueDate(baseISO, r.cycle, r.anchor_day);
  await supabase
    .from("installments")
    .update({ next_due_date: nextISO, held_for: null })
    .eq("id", id);
  redirect("/installments");
}

/** "Hold for a month": skip the current occurrence without logging a
 *  transaction (e.g. income didn't arrive this month). Advances the schedule
 *  by one cycle and remembers which occurrence was skipped so it can be
 *  shown in the UI and un-held. */
export async function holdInstallmentAction(formData: FormData) {
  await assertAuthed();
  const supabase = getSupabase();
  const id = String(formData.get("id") ?? "");
  const { data: row, error } = await supabase
    .from("installments")
    .select("cycle, next_due_date, anchor_day")
    .eq("id", id)
    .single();
  if (error || !row) redirect("/installments");

  const r = row as {
    cycle: string;
    next_due_date: string | null;
    anchor_day?: number | null;
  };
  const occurrence =
    /^\d{4}-\d{2}-\d{2}$/.test(r.next_due_date ?? "")
      ? (r.next_due_date as string)
      : todayISOInColombo();
  const nextISO = advanceDueDate(occurrence, r.cycle, r.anchor_day);
  await supabase
    .from("installments")
    .update({ next_due_date: nextISO, held_for: occurrence })
    .eq("id", id);
  redirect("/installments");
}

/** Undo a hold: restore the skipped occurrence as next due and clear the
 *  hold marker (the item shows as due again, typically overdue). */
export async function unholdInstallmentAction(formData: FormData) {
  await assertAuthed();
  const supabase = getSupabase();
  const id = String(formData.get("id") ?? "");
  const { data: row } = await supabase
    .from("installments")
    .select("held_for")
    .eq("id", id)
    .single();
  const heldFor = (row as { held_for?: string | null } | null)?.held_for;
  await supabase
    .from("installments")
    .update({ next_due_date: heldFor ?? null, held_for: null })
    .eq("id", id);
  redirect("/installments");
}

export async function deleteInstallment(formData: FormData) {
  await assertAuthed();
  const supabase = getSupabase();
  await supabase.from("installments").delete().eq("id", String(formData.get("id") ?? ""));
  redirect("/installments");
}

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("new") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) {
    return { error: "New password must be at least 8 characters" };
  }
  if (next !== confirm) {
    return { error: "New password and confirmation do not match" };
  }
  if (!(await verifyPassword(current))) {
    return { error: "Current password is incorrect" };
  }

  await updatePassword(next);
  return { success: true };
}

// ------------------------------------------------------------
// Categories
// ------------------------------------------------------------

const VALID_CATEGORY_TYPES = ["expense", "income", "savings"] as const;

export async function createCategoryAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const countsTowardAllowance = formData.get("counts_toward_allowance") === "on";

  if (!name) return { error: "Category name is required" };
  if (!VALID_CATEGORY_TYPES.includes(type as (typeof VALID_CATEGORY_TYPES)[number])) {
    return { error: "Invalid category type" };
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("categories")
    .insert({ name, type, counts_toward_allowance: countsTowardAllowance });
  if (error) {
    // Surface duplicate-key violations cleanly instead of a raw Postgres error.
    if (error.code === "23505") {
      return { error: `A category named "${name}" already exists` };
    }
    return { error: error.message };
  }

  revalidatePath("/settings/categories");
  return { success: true };
}

export async function deleteCategoryAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "No category specified" };

  const supabase = getSupabase();
  // Don't hard-delete if transactions use this category — that would orphan
  // historical rows and corrupt past category rollups.
  const { count, error: countError } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("category", name);
  if (countError) return { error: countError.message };

  if ((count ?? 0) > 0) {
    return {
      error: `${count} transaction(s) use this category — reassign or remove them first`,
    };
  }

  const { error } = await supabase.from("categories").delete().eq("name", name);
  if (error) return { error: error.message };

  revalidatePath("/settings/categories");
  return { success: true };
}

export async function toggleCategoryVisibilityAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "No category specified" };

  const supabase = getSupabase();
  const { data: row } = await supabase
    .from("categories")
    .select("hidden")
    .eq("name", name)
    .single();
  if (!row) return { error: `Category "${name}" not found` };

  const nextHidden = !(row as { hidden: boolean | null }).hidden;
  const { error } = await supabase
    .from("categories")
    .update({ hidden: nextHidden })
    .eq("name", name);
  if (error) return { error: error.message };

  revalidatePath("/settings/categories");
  revalidatePath("/add");
  revalidatePath("/review");
  return { success: true };
}

export async function toggleCategoryCountsAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "No category specified" };

  const supabase = getSupabase();
  const { data: row } = await supabase
    .from("categories")
    .select("counts_toward_allowance")
    .eq("name", name)
    .single();
  if (!row) return { error: `Category "${name}" not found` };

  const next = !(row as { counts_toward_allowance: boolean | null })
    .counts_toward_allowance;
  const { error } = await supabase
    .from("categories")
    .update({ counts_toward_allowance: next })
    .eq("name", name);
  if (error) return { error: error.message };

  revalidatePath("/settings/categories");
  revalidatePath("/");
  revalidatePath("/monthly");
  return { success: true };
}

// ------------------------------------------------------------
// Merchant rules (learned merchant -> category mappings)
// ------------------------------------------------------------

export async function updateMerchantRuleAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const merchant = String(formData.get("merchant") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  if (!merchant) return { error: "No merchant specified" };
  if (!category) return { error: "Pick a category" };

  const supabase = getSupabase();
  const { error } = await supabase
    .from("merchant_categories")
    .upsert({ merchant, category }, { onConflict: "merchant" });
  if (error) return { error: error.message };
  revalidatePath("/settings/merchants");
  return { success: true };
}

export async function deleteMerchantRuleAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const merchant = String(formData.get("merchant") ?? "").trim();
  if (!merchant) return { error: "No merchant specified" };

  const supabase = getSupabase();
  const { error } = await supabase
    .from("merchant_categories")
    .delete()
    .eq("merchant", merchant);
  if (error) return { error: error.message };
  revalidatePath("/settings/merchants");
  return { success: true };
}

// ------------------------------------------------------------
// Card accounts (SMS card-last-4 -> account mappings)
// ------------------------------------------------------------

const VALID_CARD_ACCOUNTS = ["cash", "bank", "savings"] as const;

export async function upsertCardAccountAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const cardLast4 = String(formData.get("card_last4") ?? "").trim();
  const account = String(formData.get("account") ?? "");
  if (!/^\d{4}$/.test(cardLast4)) {
    return { error: "Card ending must be exactly 4 digits" };
  }
  if (!VALID_CARD_ACCOUNTS.includes(account as (typeof VALID_CARD_ACCOUNTS)[number])) {
    return { error: "Invalid account" };
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("card_accounts")
    .upsert({ card_last4: cardLast4, account }, { onConflict: "card_last4" });
  if (error) return { error: error.message };
  revalidatePath("/settings/cards");
  return { success: true };
}

export async function deleteCardAccountAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await assertAuthed();
  const cardLast4 = String(formData.get("card_last4") ?? "").trim();
  if (!cardLast4) return { error: "No card specified" };

  const supabase = getSupabase();
  const { error } = await supabase
    .from("card_accounts")
    .delete()
    .eq("card_last4", cardLast4);
  if (error) return { error: error.message };
  revalidatePath("/settings/cards");
  return { success: true };
}