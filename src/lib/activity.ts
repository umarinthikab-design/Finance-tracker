import { getSupabase } from "@/lib/supabase";

/**
 * Append-only audit trail for actions that leave no other record once
 * they're done — e.g. a transaction removed via an SMS cancellation notice
 * (src/lib/sms/cancellation.ts): the transaction row is really gone, so this
 * is the only place "why is this transaction missing?" can still be
 * answered from. Tolerant of the table not being migrated yet (42P01), same
 * convention as card_accounts/merchant_categories — an audit-trail write
 * failing must never block the action it's describing.
 */
export async function logActivity(action: string, details?: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("activity_log")
    .insert({ action, details: details ?? null });
  if (error && error.code !== "42P01") {
    console.error(`[activity] log failed: ${error.message}`);
  }
}
