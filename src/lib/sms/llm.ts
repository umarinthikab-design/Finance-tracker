import Anthropic from "@anthropic-ai/sdk";
import type { ParsedSms, SmsMessage, TxnType } from "./types";
import { parseAmount, parseSmsDate } from "./rules";

const SYSTEM_PROMPT = `You parse bank SMS alerts into structured transaction data.
Respond with ONLY valid JSON, no markdown, no commentary. Use this exact shape:
{"amount": 1234.56, "type": "expense"|"income"|"savings"|"transfer", "category": "Food|Travel|Fuel|Sports|Entertainment|Clothes|Household|Loans|Investments|Savings|Installments|Other|Other Income|Salary|Allowance|Cash Withdrawal|null", "merchant": "store name or null", "date": "YYYY-MM-DD or null", "confidence": 0.0-1.0, "needs_review": true|false}

Rules:
- amount is the transaction amount in LKR, always positive.
- type: expense for money leaving, income for money arriving, savings for transfers to own savings, transfer for ATM/cash withdrawals that move money from the bank account to cash-in-hand (bank -> cash; they do not spend anything).
- Prefer the most specific category. Unknown merchants default to "Other". ATM withdrawals use "Cash Withdrawal".
- date: use the transaction date in the SMS if present, else null.
- confidence: how sure you are of amount+type+category. >=0.9 if clear, 0.5-0.8 if some ambiguity, <0.5 if guess.
- needs_review: true if confidence < 0.85 or if this looks like a non-transaction message (OTP, balance enquiry, marketing).`;

const CATEGORIES = new Set([
  "Food", "Travel", "Fuel", "Sports", "Entertainment", "Clothes",
  "Household", "Loans", "Investments", "Savings", "Installments",
  "Other", "Other Income", "Salary", "Allowance",
]);

/** Hard cap on the LLM call so the webhook never blocks past this. */
const LLM_TIMEOUT_MS = 5000;

function sanitize(raw: string): string {
  // Strip code block fences and extract first JSON object.
  const withoutFences = raw.replace(/```(?:json)?/gi, "");
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end === -1) return "";
  return withoutFences.slice(start, end + 1);
}

export async function parseWithLLM(msg: SmsMessage): Promise<ParsedSms> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      amount: null,
      type: null,
      category: null,
      date: null,
      merchant: null,
      confidence: 0,
      needsReview: true,
      reason: "LLM not configured (ANTHROPIC_API_KEY missing)",
    };
  }

  const client = new Anthropic({ apiKey });
  const userContent = `Sender: ${msg.sender}\nReceived: ${msg.receivedAt ?? "unknown"}\nMessage: ${msg.body}`;

  // Bound the worst case: if Claude's API stalls, we still return within
  // LLM_TIMEOUT_MS so the webhook never hangs for the sender's HTTP client.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const resp = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      },
      { signal: controller.signal }
    );
    clearTimeout(timer);

    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const json = JSON.parse(sanitize(text)) as Record<string, unknown>;

    const amount = typeof json.amount === "number" ? json.amount : null;
    const rawType = typeof json.type === "string" ? json.type : "";
    const type: TxnType | null =
      rawType === "expense" ||
      rawType === "income" ||
      rawType === "savings" ||
      rawType === "transfer"
        ? rawType
        : null;
    const category =
      typeof json.category === "string" && CATEGORIES.has(json.category)
        ? json.category
        : type === "expense"
          ? "Other"
          : type === "income"
            ? "Other Income"
            : null;
    const merchant = typeof json.merchant === "string" ? json.merchant : null;
    const date =
      typeof json.date === "string" ? parseSmsDate(json.date) : null;
    const confidence = Math.min(
      1,
      Math.max(0, typeof json.confidence === "number" ? json.confidence : 0)
    );
    const needsReview =
      typeof json.needs_review === "boolean" ? json.needs_review : confidence < 0.85;

    return {
      amount: amount != null ? Math.round(amount * 100) / 100 : null,
      type,
      category,
      date,
      merchant,
      confidence,
      needsReview,
      reason: "llm",
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      amount: null,
      type: null,
      category: null,
      date: null,
      merchant: null,
      confidence: 0,
      needsReview: true,
      reason: `llm error: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

export function isUselessSms(p: ParsedSms): boolean {
  // OTPs, balance enquiries, and marketing messages have no amount.
  return p.amount == null && p.type == null && p.category == null;
}

export { parseAmount };