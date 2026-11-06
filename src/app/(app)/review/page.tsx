import { getSupabase } from "@/lib/supabase";
import { getCategories } from "@/lib/dashboard";
import { normalizeMerchant } from "@/lib/merchant";
import { ReviewList, type ReviewTxn } from "./review-list";
import { CancellationReview, type CancellationEntry } from "./cancellation-review";

export const dynamic = "force-dynamic";

interface CancellationRow {
  id: string;
  merchant: string;
  card_last4: string | null;
  account: string;
  candidate_ids: string[] | null;
  too_many_matches: boolean;
  raw_text: string;
}

interface CandidateTxnRow {
  id: string;
  amount: number;
  date: string;
  merchant: string | null;
}

export default async function ReviewPage() {
  const supabase = getSupabase();
  // Hidden categories stay selectable here only if already set on the
  // transaction — edit-form filters the rest out.
  const categories = await getCategories(true);

  const { data: txns } = await supabase
    .from("transactions")
    .select("*")
    .eq("needs_review", true)
    .order("created_at", { ascending: false })
    .limit(50);

  // Merchants we already have an explicit mapping for — those we haven't seen
  // before get a "New merchant" cue on the review card.
  const { data: knownMerchants } = await supabase
    .from("merchant_categories")
    .select("merchant");
  const knownList = (knownMerchants ?? []).map((m) =>
    normalizeMerchant((m as { merchant: string }).merchant)
  );

  const list = (txns ?? []) as ReviewTxn[];

  // Pending SMS card-transaction cancellation notices. Tolerant of the table
  // not being migrated yet (42P01) so Review never breaks on a pending
  // schema change — same convention as card_accounts/merchant_categories.
  const { data: cancellationRows, error: cancellationErr } = await supabase
    .from("sms_cancellations")
    .select("id, merchant, card_last4, account, candidate_ids, too_many_matches, raw_text")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  const cancellations =
    cancellationErr?.code === "42P01" ? [] : ((cancellationRows ?? []) as CancellationRow[]);

  // Candidate transactions are re-fetched live in one batched query rather
  // than trusting the amount/date snapshotted at detection time — one
  // deleted through some other path (e.g. All Transactions) simply drops
  // out instead of showing stale/broken data.
  const allCandidateIds = Array.from(
    new Set(cancellations.flatMap((c) => c.candidate_ids ?? []))
  );
  const candidateMap = new Map<string, CandidateTxnRow>();
  if (allCandidateIds.length > 0) {
    const { data: candTxns } = await supabase
      .from("transactions")
      .select("id, amount, date, merchant")
      .in("id", allCandidateIds);
    for (const t of (candTxns ?? []) as CandidateTxnRow[]) {
      candidateMap.set(t.id, { id: t.id, amount: Number(t.amount), date: t.date, merchant: t.merchant });
    }
  }

  const cancellationEntries: CancellationEntry[] = cancellations.map((c) => ({
    id: c.id,
    merchant: c.merchant,
    cardLast4: c.card_last4,
    account: c.account,
    tooManyMatches: c.too_many_matches,
    rawText: c.raw_text,
    candidates: (c.candidate_ids ?? [])
      .map((id) => candidateMap.get(id))
      .filter((c): c is CandidateTxnRow => c !== undefined),
  }));

  const nothingToReview = list.length === 0 && cancellationEntries.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-headline-md text-on-surface">Review</h1>
      <p className="text-sm text-on-surface-variant">
        Confirm auto-captured transactions or correct them before they count.
      </p>

      {nothingToReview ? (
        <p className="rounded-xl border border-outline-variant p-5 text-sm text-on-surface-variant">
          Nothing to review — all caught up.
        </p>
      ) : (
        <>
          {cancellationEntries.length > 0 ? (
            <CancellationReview entries={cancellationEntries} />
          ) : null}
          {list.length > 0 ? (
            <ReviewList txns={list} categories={categories} knownMerchants={knownList} />
          ) : null}
        </>
      )}
    </main>
  );
}
