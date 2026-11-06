import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

export interface CardAccountMapping {
  card_last4: string;
  account: string;
}

/**
 * Registered card → account mappings for SMS capture. Used by the webhook to
 * route a purchase on a known card to the right account instead of always
 * defaulting to 'bank'. Tolerant of the table not being migrated yet (42P01).
 */
export async function getCardAccountMappings(): Promise<CardAccountMapping[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("card_accounts")
    .select("card_last4, account")
    .order("card_last4");
  if (error && error.code !== "42P01") throw error;
  return (data ?? []) as CardAccountMapping[];
}

/**
 * Which account a single SMS transaction lands on. If the alert carried a
 * card number (last 4 digits) and that card is registered here, use the
 * mapped account; otherwise keep the long-standing default of "bank".
 * Tolerant of the mapping table not being migrated yet (42P01). Shared by
 * both the normal purchase-insert flow (src/lib/sms/process.ts) and the
 * cancellation-matching flow (src/lib/sms/cancellation.ts) so a cancellation
 * notice resolves to the same account its original charge would have.
 */
export async function resolveAccountForCard(
  supabase: SupabaseClient,
  cardLast4: string | null | undefined
): Promise<string> {
  if (!cardLast4) return "bank";
  const { data, error } = await supabase
    .from("card_accounts")
    .select("account")
    .eq("card_last4", cardLast4)
    .maybeSingle();
  if (error) {
    if (error.code !== "42P01") console.error(`[sms] card lookup error: ${error.message}`);
    return "bank";
  }
  const account = (data as { account?: string } | null)?.account;
  return account ?? "bank";
}