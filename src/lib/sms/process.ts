import { getSupabase } from "@/lib/supabase";
import {
  parseAmount,
  parseSmsDate,
  matchRule,
  hintCategory,
  ruleToAccount,
} from "./rules";
import { parseWithLLM, isUselessSms } from "./llm";
import { getLearnedCategory, normalizeMerchant } from "@/lib/merchant";
import { todayISOInColombo } from "@/lib/timezone";
import { resolveAccountForCard } from "@/lib/card-accounts";
import { handleCancellationMessage } from "./cancellation";
import type { ParsedSms, SmsMessage, TxnType } from "./types";

export interface SmsWebhookResult {
  inserted: boolean;
  parsed: ParsedSms | null;
  transactionId?: string;
  method: "regex" | "llm" | "duplicate" | "dropped" | "error" | "cancellation";
  error?: string;
}

export async function processSmsMessage(msg: SmsMessage): Promise<SmsWebhookResult> {
  const supabase = getSupabase();

  // 1) Try regex rules first.
  const ruleMatch = matchRule(msg.sender, msg.body);

  // A cancellation notice isn't a transaction at all — no amount, often no
  // date — so it's routed to a dedicated matching flow instead of the
  // amount/type-based parsing below (which it could never satisfy).
  if (ruleMatch?.rule.kind === "cancellation") {
    return handleCancellationMessage(supabase, msg, ruleMatch);
  }

  let parsed: ParsedSms | null = null;

  if (ruleMatch) {
    const v = ruleMatch.values;
    const amount = parseAmount(v.amount ?? v[ruleMatch.rule.fields.amount ?? "1"] ?? "");
    const date = parseSmsDate(v.date ?? v[ruleMatch.rule.fields.date ?? ""] ?? "");
    const rawType = (v.type ?? ruleMatch.rule.fields.type ?? "") as string;
    const type: TxnType | null =
      rawType === "expense" ||
      rawType === "income" ||
      rawType === "savings" ||
      rawType === "transfer"
        ? rawType
        : (ruleMatch.rule.defaults?.type ?? null);
    const category =
      v.category ??
      (ruleMatch.rule.fields.category ? v[ruleMatch.rule.fields.category] : null) ??
      ruleMatch.rule.defaults?.category ??
      null;

    // If we have amount + type, it's usable.
    if (amount != null && type != null) {
      const confidence = ruleMatch.confidence;
      const merchant =
        v.merchant ??
        (ruleMatch.rule.fields.merchant
          ? v[ruleMatch.rule.fields.merchant]
          : null) ?? null;
      const cardLast4 =
        v.cardLast4 ??
        (ruleMatch.rule.fields.cardLast4
          ? v[ruleMatch.rule.fields.cardLast4]
          : null) ?? null;
      // A category is a real signal when it comes from a merchant hint or the
      // rule itself; falling through to the generic placeholder is a guess.
      const hintedCategory = hintCategory(merchant);
      const resolvedCategory =
        hintedCategory ??
        category ??
        (type === "expense" ? "Other" : type === "income" ? "Other Income" : null);
      const categoryIsGuessed =
        hintedCategory == null &&
        category == null &&
        (resolvedCategory === "Other" || resolvedCategory === "Other Income");
      // NOTE: a guessed "Other"/"Other Income" is an unresolved category, not a
      // confirmed one. It must NOT be treated as allowance-eligible even where
      // counts_toward_allowance defaults true elsewhere — allowance.ts already
      // keeps unknown-category spend out of pools, and that conservative
      // behavior is deliberately left unchanged.
      parsed = {
        amount: Math.round(amount * 100) / 100,
        type,
        category: resolvedCategory,
        date,
        merchant,
        toAccount: type === "transfer" ? ruleToAccount(ruleMatch.rule) : null,
        cardLast4,
        confidence,
        // No confidently-parsed date means we'll default to today; a guessed
        // category means the split is unresolved. Either way: review.
        needsReview: confidence < 0.85 || date === null || categoryIsGuessed,
        reason: `regex:${ruleMatch.rule.label}`,
      };
    }
  }

  // 2) Fall back to LLM if regex failed or gave low confidence.
  if (!parsed || parsed.confidence < 0.85) {
    const llmParsed = await parseWithLLM(msg);
    const llmUsable = !isUselessSms(llmParsed);

    if (parsed && !llmUsable) {
      // Regex parsed it but confidence was low and the LLM couldn't help:
      // keep the regex parse but flag for review.
      parsed = { ...parsed, needsReview: true };
    } else if (llmUsable) {
      // Merge: prefer LLM's fields, but keep regex amount/date if LLM missed them.
      const mergedCategory = llmParsed.category ?? parsed?.category ?? null;
      // parseWithLLM substitutes its own "Other"/"Other Income" placeholder
      // when it can't categorize, so a null/empty or placeholder merged
      // category is still a guess rather than a real signal.
      const categoryIsGuessed =
        !mergedCategory ||
        mergedCategory === "Other" ||
        mergedCategory === "Other Income";
      // Same allowance caveat as the regex path above: guessed placeholders
      // stay excluded from allowance pools (see allowance.ts).
      parsed = {
        amount: llmParsed.amount ?? parsed?.amount ?? null,
        type: llmParsed.type ?? parsed?.type ?? null,
        category: mergedCategory,
        date: llmParsed.date ?? parsed?.date ?? null,
        merchant: llmParsed.merchant ?? parsed?.merchant ?? null,
        cardLast4: parsed?.cardLast4 ?? null,
        confidence: Math.max(parsed?.confidence ?? 0, llmParsed.confidence),
        needsReview:
          llmParsed.confidence < 0.85 || parsed?.needsReview === true || categoryIsGuessed,
        reason: llmParsed.reason,
      };
    }
    // If neither regex nor LLM produced anything, parsed stays null.
  }

  // 3) If still no amount or no type, drop with a reason.
  if (!parsed || !parsed.amount || !parsed.type) {
    return {
      inserted: false,
      parsed,
      method: "dropped",
    };
  }

  // 3.5) Merchant auto-categorization: if we know this merchant, reuse the
  // category learned from previously confirmed transactions.
  if (parsed.merchant) {
    const learned = await getLearnedCategory(
      normalizeMerchant(parsed.merchant),
      parsed.type
    );
    if (learned) {
      parsed = {
        ...parsed,
        category: learned,
        confidence: 0.99,
        needsReview: false,
        reason: `merchant-learned:${learned}`,
      };
    }
  }

  // 4) Dedup: only treat as duplicate if an identical SMS arrived within the
  // last 2 minutes. Identical text outside that window is assumed to be a
  // genuine repeat purchase (e.g. same merchant + same amount, no unique ref).
  const dedupWindowStart = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: existing, error: dedupErr } = await supabase
    .from("transactions")
    .select("id, created_at")
    .eq("source", "sms")
    .eq("raw_text", msg.body)
    .gte("created_at", dedupWindowStart)
    .limit(1);

  if (dedupErr) {
    return { inserted: false, parsed, method: "error", error: dedupErr.message };
  }
  if (existing && existing.length > 0) {
    console.log(
      `[sms-webhook] duplicate dropped: sender=${msg.sender} body=${msg.body} matchedId=${(existing[0] as { id: string }).id}`
    );
    return {
      inserted: false,
      parsed,
      method: "duplicate",
      transactionId: (existing[0] as { id: string }).id,
    };
  }

  // 5) Insert. Bank SMS events touch the bucket for the account the alert
  // references — a card number resolves through card_accounts (registered in
  // Settings → Card accounts); no card or an unmapped one keeps the existing
  // default of "bank". Transfers are account -> cash by convention;
  // to_account is set explicitly on the parse.
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      date: parsed.date ?? todayISOInColombo(),
      amount: parsed.amount,
      currency: "LKR",
      type: parsed.type,
      category: parsed.category,
      subcategory: null,
      merchant: parsed.merchant ? normalizeMerchant(parsed.merchant) : null,
      source: "sms",
      raw_text: msg.body,
      needs_review: parsed.needsReview,
      account: await resolveAccountForCard(supabase, parsed.cardLast4),
      to_account: parsed.type === "transfer" ? parsed.toAccount ?? "cash" : null,
    })
    .select("id")
    .single();

  if (error) {
    return {
      inserted: false,
      parsed,
      method: "error",
      error: error.message,
    };
  }

  return {
    inserted: true,
    parsed,
    transactionId: (data as { id: string }).id,
    method: parsed.reason === "llm" ? "llm" : "regex",
  };
}