import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAccountForCard } from "@/lib/card-accounts";
import { merchantsMatch, normalizeMerchant } from "@/lib/merchant";
import type { RuleMatch } from "./rules";
import type { SmsMessage } from "./types";
import type { SmsWebhookResult } from "./process";

/**
 * How far back a cancellation notice may match an existing SMS-sourced
 * charge. Named/tunable rather than inlined in case real-world cancellation
 * delays turn out to need a longer (or shorter) window.
 */
export const CANCELLATION_MATCH_WINDOW_HOURS = 24;

/**
 * Above this many candidates, something is more likely wrong with the
 * merchant-matching logic itself than that there are genuinely 6+ recent
 * same-merchant charges on one account — don't present an unreasonable
 * list, flag for manual review instead.
 */
export const MAX_CANCELLATION_CANDIDATES = 5;

/** Same window used elsewhere in the pipeline (process.ts) to dedup a
 *  retried/duplicate webhook POST of the identical SMS body. */
const DEDUP_WINDOW_MS = 2 * 60 * 1000;

export interface CancellationCandidate {
  id: string;
  amount: number;
  date: string;
  merchant: string | null;
}

interface CandidateRow {
  id: string;
  amount: number;
  date: string;
  merchant: string | null;
  created_at: string;
}

/**
 * Find recent SMS-sourced expense transactions on the resolved account that
 * plausibly match the cancellation notice's merchant. Returns `tooMany` (and
 * an empty candidate list) instead of a long list when the match count
 * exceeds MAX_CANCELLATION_CANDIDATES.
 */
export async function findCancellationCandidates(
  supabase: SupabaseClient,
  opts: { merchant: string; account: string }
): Promise<{ candidates: CancellationCandidate[]; tooMany: boolean }> {
  const cutoff = new Date(Date.now() - CANCELLATION_MATCH_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  // Transactions already linked to a *resolved* cancellation notice are
  // excluded even if they somehow still exist — normally moot (a "removed"
  // resolution deletes the row, which already drops it from the query
  // below), but this stays correct even if that ever changes.
  const { data: linkedRows } = await supabase
    .from("sms_cancellations")
    .select("matched_transaction_id")
    .eq("status", "resolved")
    .not("matched_transaction_id", "is", null);
  const linkedIds = new Set(
    ((linkedRows ?? []) as { matched_transaction_id: string }[]).map(
      (r) => r.matched_transaction_id
    )
  );

  // Narrowed by type/source/account/time at the DB level (cheap, exact);
  // merchant fuzzy-matching isn't expressible in SQL here, so it happens in
  // JS below over this already-small window instead of over the whole table.
  const { data, error } = await supabase
    .from("transactions")
    .select("id, amount, date, merchant, created_at")
    .eq("type", "expense")
    .eq("source", "sms")
    .eq("account", opts.account)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const matched = ((data ?? []) as CandidateRow[])
    .filter((t) => !linkedIds.has(t.id))
    .filter((t) => t.merchant && merchantsMatch(opts.merchant, t.merchant));

  if (matched.length > MAX_CANCELLATION_CANDIDATES) {
    return { candidates: [], tooMany: true };
  }
  return {
    candidates: matched.map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      date: t.date,
      merchant: t.merchant,
    })),
    tooMany: false,
  };
}

/** Handle a parsed "cancellation"-kind SMS: resolve the account, find
 *  candidate charges, and file a pending review entry — never touches
 *  `transactions` itself (see src/app/actions.ts for the review-driven
 *  removal/ignore actions that do). */
export async function handleCancellationMessage(
  supabase: SupabaseClient,
  msg: SmsMessage,
  ruleMatch: RuleMatch
): Promise<SmsWebhookResult> {
  const v = ruleMatch.values;
  const rawMerchant = v.merchant ?? (ruleMatch.rule.fields.merchant ? v[ruleMatch.rule.fields.merchant] : null);
  const cardLast4 = v.cardLast4 ?? (ruleMatch.rule.fields.cardLast4 ? v[ruleMatch.rule.fields.cardLast4] : null);

  if (!rawMerchant) {
    return {
      inserted: false,
      parsed: null,
      method: "dropped",
      error: "cancellation notice matched but had no merchant",
    };
  }
  const merchant = normalizeMerchant(rawMerchant);

  // Dedup a retried/duplicate webhook POST of the identical cancellation SMS
  // (same convention as the transaction-insert path in process.ts): an
  // identical body within the last 2 minutes is treated as a resend, not a
  // second real cancellation.
  const dedupWindowStart = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  const { data: existing, error: dedupErr } = await supabase
    .from("sms_cancellations")
    .select("id, created_at")
    .eq("raw_text", msg.body)
    .gte("created_at", dedupWindowStart)
    .limit(1);
  if (dedupErr) {
    return { inserted: false, parsed: null, method: "error", error: dedupErr.message };
  }
  if (existing && existing.length > 0) {
    return { inserted: false, parsed: null, method: "duplicate" };
  }

  const account = await resolveAccountForCard(supabase, cardLast4);
  const { candidates, tooMany } = await findCancellationCandidates(supabase, { merchant, account });

  const { data: inserted, error: insertErr } = await supabase
    .from("sms_cancellations")
    .insert({
      status: "pending",
      merchant,
      card_last4: cardLast4,
      account,
      candidate_ids: candidates.map((c) => c.id),
      too_many_matches: tooMany,
      raw_text: msg.body,
    })
    .select("id")
    .single();

  if (insertErr) {
    return { inserted: false, parsed: null, method: "error", error: insertErr.message };
  }

  return {
    inserted: true,
    parsed: null,
    transactionId: (inserted as { id: string }).id,
    method: "cancellation",
  };
}
