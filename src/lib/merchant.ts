import { getSupabase } from "@/lib/supabase";

/**
 * Merchant auto-categorization.
 *
 * Source order:
 *   1) Explicit mapping in `merchant_categories` (learned when you confirm
 *      or correct a transaction carrying that merchant). Matching is fuzzy:
 *      a learned "Caravan Fresh" also matches "CARAVAN FRESH DEHIWELA COL 05"
 *      and vice versa, as long as one name contains the other (min 4 chars).
 *   2) The most recently CONFIRMED transaction for this exact merchant — a
 *      fallback so pre-existing data still auto-categorizes before any
 *      explicit mapping exists.
 */

/**
 * Minimum length for a fuzzy (substring) merchant match. Short names are too
 * collision-prone ("Uber" would match "Ruberoid Hardware"), so they only match
 * exactly, never as substrings.
 */
const MIN_FUZZY_LEN = 6;

/**
 * True when `sub` occurs in `norm` bounded on both sides by non-word
 * characters (or the string edge). "caravan fresh" matches
 * "CARAVAN FRESH DEHIWELA COL 05", but "uber" never matches "ruberoid".
 */
function containsAtWordBoundary(norm: string, sub: string): boolean {
  let idx = norm.indexOf(sub);
  while (idx !== -1) {
    const before = idx === 0 ? null : norm[idx - 1];
    const after = idx + sub.length >= norm.length ? null : norm[idx + sub.length];
    const bOk = before === null || !/\w/.test(before);
    const aOk = after === null || !/\w/.test(after);
    if (bOk && aOk) return true;
    idx = norm.indexOf(sub, idx + 1);
  }
  return false;
}

export async function getLearnedCategory(
  merchant: string,
  type: string
): Promise<string | null> {
  const supabase = getSupabase();

  // 1) Explicit mapping (canonical), with case-insensitive substring matching.
  // Resilient to the table not being migrated yet (42P01) so the SMS webhook
  // never breaks on a pending schema change.
  const { data: rows, error } = await supabase
    .from("merchant_categories")
    .select("merchant, category");
  if (error && error.code !== "42P01") throw error;

  if (rows && rows.length > 0) {
    const norm = merchant.toLowerCase().trim();

    // Exact (case-insensitive) wins first.
    const exact = rows.find(
      (r) => r.merchant.toLowerCase().trim() === norm
    );
    if (exact?.category) return exact.category;

    // Otherwise the LONGEST learned name contained in the incoming name
    // (or containing it) at a word boundary — e.g. learned "Caravan Fresh"
    // matches "CARAVAN FRESH DEHIWELA COL 05", but unrelated names sharing a
    // substring mid-word don't.
    let best: { len: number; cat: string } | null = null;
    for (const r of rows) {
      const m = r.merchant.toLowerCase().trim();
      if (m.length < MIN_FUZZY_LEN || !r.category) continue;
      const contained =
        containsAtWordBoundary(norm, m) || containsAtWordBoundary(m, norm);
      if (contained && (!best || m.length > best.len)) {
        best = { len: m.length, cat: r.category };
      }
    }
    if (best) return best.cat;
  }

  // 2) Fall back to the most recent confirmed transaction for this merchant.
  const { data, error: histErr } = await supabase
    .from("transactions")
    .select("category")
    .eq("merchant", merchant)
    .eq("type", type)
    .eq("needs_review", false)
    .not("category", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (histErr || !data || data.length === 0) return null;
  return (data[0] as { category: string }).category;
}

/** Persist the explicit merchant → category mapping when you confirm or
 * correct a transaction carrying a merchant. */
export async function saveMerchantCategory(
  merchant: string,
  category: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("merchant_categories")
    .upsert({ merchant, category }, { onConflict: "merchant" });
  if (error && error.code !== "42P01") throw error;
}

export async function deleteMerchantCategory(merchant: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("merchant_categories")
    .delete()
    .eq("merchant", merchant);
  if (error && error.code !== "42P01") throw error;
}

export interface MerchantRule {
  merchant: string;
  category: string;
}

export async function getMerchantCategories(): Promise<MerchantRule[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("merchant_categories")
    .select("merchant, category")
    .order("merchant");
  if (error && error.code !== "42P01") throw error;
  return (data ?? []) as MerchantRule[];
}

/** Extract a canonical merchant key from the raw SMS merchant string. */
export function normalizeMerchant(merchant: string): string {
  return merchant.replace(/\s+/g, " ").trim();
}

/**
 * True when two merchant strings should be treated as the same business —
 * the same fuzzy rule as getLearnedCategory's mapping lookup above, exposed
 * standalone for callers that need a plain yes/no (e.g. reconciling an SMS
 * cancellation notice's short merchant, "UBER", against a stored charge's
 * fuller one, "UBER 852 LK"). Exact match (case-insensitive, trimmed) always
 * matches; otherwise one side must contain the other at a word boundary AND
 * be at least MIN_FUZZY_LEN long, so a short name only ever matches by being
 * found inside a longer one — never the reverse — avoiding collisions like
 * "uber" inside "ruberoid".
 */
export function merchantsMatch(a: string, b: string): boolean {
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normB.length >= MIN_FUZZY_LEN && containsAtWordBoundary(normB, normA)) return true;
  if (normA.length >= MIN_FUZZY_LEN && containsAtWordBoundary(normA, normB)) return true;
  return false;
}
