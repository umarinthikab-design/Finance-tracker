import type { SmsRule, TxnType } from "./types";

/**
 * Known bank SMS sender IDs. Generic debit/credit rules only fire when the
 * sender matches one of these, so bare words like "debited"/"credited" in
 * promotional or summary messages from unknown senders don't false-positive.
 * Add your actual bank sender IDs here (e.g. "COMBANK", "HNB", "SAMPATH").
 */
export const KNOWN_BANK_SENDERS = ["combank", "commercial"];

/**
 * Rule registry for parsing bank SMS. Rules are tried in order.
 * Each rule matches on sender substring first, then applies regexes.
 * These are generic LKR-bank patterns; real (redacted) samples from
 * the user should be added to tighten them per bank.
 */
export const smsRules: SmsRule[] = [
  // --- ComBank card alerts ---------------------------------------------
  // "Purchase at PICKME RIDE ... for LKR 504.67 on 19/08/26 04:59 PM has been authorised on your debit card ending #8662."
  // Sender-agnostic: the phrasing is distinctive enough to match on content alone.
  {
    label: "ComBank card purchase",
    senders: [],
    patterns: [
      // Trailing "…ending #8662" is optional — messages without a card number
      // still match, they just carry no cardLast4 (account falls back to bank).
      /Purchase at (.+?)\s+for LKR ([\d,]+(?:\.\d{1,2})?)\s+on (\d{1,2}\/\d{1,2}\/\d{2,4})(?:\s+.*?\bending\b\s*#?\s*(\d{4}))?/i,
    ],
    fields: { merchant: "1", amount: "2", date: "3", cardLast4: "4" },
    defaults: { type: "expense" as TxnType, confidence: 0.95 },
    confidence: 0.95,
  },
  // "Withdrawal at ARPICO-DEHIWE RM DEHIWELA COLK for LKR 7,000.00 on 19/08/26 03:59 PM from card ending #8662."
  // An ATM withdrawal moves money bank -> cash-in-hand; it is NOT an expense.
  {
    label: "ComBank ATM withdrawal",
    senders: [],
    patterns: [
      /Withdrawal at (.+?)\s+for LKR ([\d,]+(?:\.\d{1,2})?)\s+on (\d{1,2}\/\d{1,2}\/\d{2,4})(?:\s+.*?\bending\b\s*#?\s*(\d{4}))?/i,
    ],
    fields: { merchant: "1", amount: "2", date: "3", cardLast4: "4" },
    defaults: {
      type: "transfer" as TxnType,
      category: "Cash Withdrawal",
      toAccount: "cash",
      confidence: 0.95,
    },
    confidence: 0.95,
  },

  // "YOUR TRANSACTION AT UBER ON YOUR CARD ENDING WITH 8662 HAS BEEN CANCELLED."
  // No amount, no date — only merchant + card. Not a transaction to insert:
  // routed (via `kind: "cancellation"`) to the cancellation-matching flow in
  // src/lib/sms/cancellation.ts, which reconciles it against a recent
  // SMS-sourced charge through the review queue.
  {
    label: "ComBank card cancellation",
    senders: [],
    kind: "cancellation",
    patterns: [
      /YOUR TRANSACTION AT (.+?) ON YOUR CARD ENDING WITH (\d{4}) HAS BEEN CANCELLED/i,
    ],
    fields: { merchant: "1", cardLast4: "2" },
    confidence: 0.95,
  },

  // --- Generic debit/credit alerts -------------------------------------
  // Only fire for known bank senders; low confidence so they always land in
  // the review queue rather than auto-inserting silently.
  {
    label: "Generic debit",
    senders: KNOWN_BANK_SENDERS,
    patterns: [
      // "Rs 1,234.56 debited ..." / "LKR 1,234.56 spent"
      /(?:Rs\.?|LKR|SLR)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:debited|debit|spent|payment)/i,
      // "... debited Rs 1,234.56 ..." / "... spent LKR 1,234.56"
      /(?:debited|debit|spent|payment)\s*(?:of|Rs\.?|LKR|SLR)\s*([\d,]+(?:\.\d{1,2})?)/i,
    ],
    fields: { amount: "1" },
    defaults: { type: "expense" as TxnType, category: "Other", confidence: 0.4 },
    confidence: 0.4,
  },
  {
    label: "Generic credit",
    senders: KNOWN_BANK_SENDERS,
    patterns: [
      /(?:credited|credit|received|deposited|refund)\s*(?:of|Rs\.?|LKR|SLR)\s*([\d,]+(?:\.\d{1,2})?)/i,
      /(?:Rs\.?|LKR|SLR)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:credited|credit|received|deposited|refund)/i,
    ],
    fields: { amount: "1" },
    defaults: { type: "income" as TxnType, category: "Other Income", confidence: 0.4 },
    confidence: 0.4,
  },

  // --- Withdrawals (ATM) ------------------------------------------------
  // Same treatment as the ComBank rule: cash withdrawal is a transfer from
  // the bank bucket to the cash bucket, not an expense.
  {
    label: "ATM withdrawal",
    senders: ["atm", "bank"],
    patterns: [
      /(?:withdraw(?:al)?|withdrew)\s*(?:of|Rs\.?|LKR|SLR)?\s*(?:Rs\.?|LKR|SLR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
      /(?:Rs\.?|LKR|SLR)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:withdraw(?:al)?|withdrawn|withdrew)/i,
    ],
    fields: { amount: "1" },
    defaults: {
      type: "transfer" as TxnType,
      category: "Cash Withdrawal",
      toAccount: "cash",
      confidence: 0.8,
    },
    confidence: 0.8,
  },

  // --- Transfers between own accounts -----------------------------------
  {
    label: "Transfer",
    senders: ["transfer", "ft"],
    patterns: [
      /(?:transfer(?:red)?|remitted)\s*(?:of|Rs\.?|LKR|SLR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    ],
    fields: { amount: "1" },
    defaults: { type: "savings" as TxnType, category: "Savings", confidence: 0.5 },
    confidence: 0.5,
  },

  // --- Fuel / POS / merchant hints --------------------------------------
  {
    label: "Fuel purchase",
    senders: ["fuel", "petro", "cpc", "lanka ioc"],
    patterns: [
      /([\d,]+(?:\.\d{1,2})?)\s*(?:L(?:itres?|trs?))?\s*(?:purchased|refuel)/i,
      /(?:purchase|refuel)(?:d)?\s*(?:of|at)?\s*Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i,
    ],
    fields: { amount: "1" },
    defaults: { type: "expense" as TxnType, category: "Fuel", confidence: 0.8 },
    confidence: 0.8,
  },
];

export interface RuleMatch {
  rule: SmsRule;
  values: Record<string, string>;
  confidence: number;
  rawMatch: string;
}

/** Transfer destination declared by a rule's defaults (ATM = cash). */
export function ruleToAccount(rule: SmsRule): string | null {
  return (rule.defaults as { toAccount?: string } | undefined)?.toAccount ?? null;
}

/** Find the first rule+pattern that fully matches the message body. */
export function matchRule(sender: string, body: string): RuleMatch | null {
  const senderLower = sender.toLowerCase();
  for (const rule of smsRules) {
    // Sender gate: if the rule lists senders, one must be a substring of sender.
    if (rule.senders.length > 0 && !rule.senders.some((s) => senderLower.includes(s))) {
      continue;
    }
    for (const pattern of rule.patterns) {
      const m = body.match(pattern);
      if (m) {
        const values: Record<string, string> = {};
        const groups = m.slice(1);
        // Named groups
        if (m.groups) Object.assign(values, m.groups);
        // Positional groups: assign by index as "1","2",...
        groups.forEach((g, i) => {
          if (g !== undefined) values[String(i + 1)] = g;
        });
        return {
          rule,
          values,
          confidence: rule.confidence,
          rawMatch: m[0],
        };
      }
    }
  }
  return null;
}

/** Normalise "1,234.56" / "1.234,56" style amounts to a number. */
export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[^0-9.,]/g, "");
  // Support both 1,234.56 and 1.234,56
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parse dates in common bank-SMS formats. Returns YYYY-MM-DD or null. */
export function parseSmsDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  let m = s.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;

  // DD/MM/YY or DD-MM-YY (assume 20xx)
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})(?!\d)/);
  if (m) return `20${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;

  // 12 Mar 2025 / 12 Mar 25 / Mar 12, 2025
  m = s.match(
    /(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4}|\d{2})/
  );
  if (m) {
    const month = monthNameToNum(m[2]);
    if (month) {
      const year = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${year}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }
  m = s.match(
    /([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4}|\d{2})/
  );
  if (m) {
    const month = monthNameToNum(m[1]);
    if (month) {
      const year = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${year}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    }
  }

  // No fallback for bare "DD/MM" — matching any two numbers risks pulling in
  // phone numbers, masked card digits, or account numbers. Return null and
  // let the caller default to today's Colombo date with needs_review = true.

  return null;
}

function monthNameToNum(name: string): number | null {
  const map: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  return map[name.toLowerCase()] ?? null;
}

/**
 * Merchant keyword hints → category. Used to auto-categorize expenses when a
 * merchant name is known. Patterns are substring-matched against the merchant
 * (case-insensitive), first match wins.
 */
const MERCHANT_HINTS: { keywords: string[]; category: string }[] = [
  { keywords: ["pickme", "uber", "power loop"], category: "Travel" },
  { keywords: ["lanka ioc", "cpc", "fuel", "petro", "cey petroleum"], category: "Fuel" },
  { keywords: ["keells", "cargills", "spar", "lanka sathosa", "ard", "food city", "supermarket", "grocery"], category: "Food" },
  { keywords: ["kfc", "mcdonald", "pizza", "kottu", "restaurant", "cafe", "coffee", "hotel"], category: "Food" },
  { keywords: ["cinema", "theater", "netflix", "spotify", "steam", "playstation"], category: "Entertainment" },
  { keywords: ["sports", "gym", "fitness", "nike", "adidas", "puma"], category: "Sports" },
  { keywords: ["clothing", "fashion", "max fashion", "ootd"], category: "Clothes" },
  { keywords: ["pharmacy", "medical", "hospital", "dental"], category: "Household" },
  { keywords: ["electrical", "hardware", "home"], category: "Household" },
];

export function hintCategory(merchant: string | null | undefined): string | null {
  if (!merchant) return null;
  const m = merchant.toLowerCase();
  for (const h of MERCHANT_HINTS) {
    if (h.keywords.some((k) => m.includes(k))) return h.category;
  }
  return null;
}