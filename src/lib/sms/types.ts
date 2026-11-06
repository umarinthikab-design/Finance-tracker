export type TxnType = "expense" | "income" | "savings" | "transfer";

export interface ParsedSms {
  amount: number | null;
  type: TxnType | null;
  category: string | null;
  date: string | null; // YYYY-MM-DD
  merchant: string | null;
  toAccount?: string | null; // transfer destination (transfers only)
  cardLast4?: string | null; // last 4 digits of the card on the alert
  confidence: number; // 0..1
  needsReview: boolean;
  reason: string;
}

export interface SmsMessage {
  sender: string;
  body: string;
  receivedAt?: string; // ISO timestamp from Tasker
}

export interface SmsRule {
  /** Sender match patterns (substring, case-insensitive). Empty = applies to any sender. */
  senders: string[];
  /** Regexes tried in order; first full match wins. Must capture groups. */
  patterns: RegExp[];
  /** Map from capture group name -> field. */
  fields: {
    amount?: string;
    type?: string;
    category?: string;
    date?: string;
    merchant?: string;
    cardLast4?: string;
  };
  /** Fixed values applied after regex (e.g. always expense). */
  defaults?: Partial<ParsedSms>;
  /** 0..1, how much we trust this rule. */
  confidence: number;
  /** Human label, e.g. "Commercial Bank debit alert" */
  label: string;
  /**
   * When set, this rule doesn't describe a transaction to insert at all —
   * it's routed to a dedicated flow instead of the normal parse → insert
   * path. "cancellation": a card-transaction cancellation notice, handled
   * by src/lib/sms/cancellation.ts (matched against a recent SMS-sourced
   * charge via the review queue, never auto-deleted).
   */
  kind?: "cancellation";
}