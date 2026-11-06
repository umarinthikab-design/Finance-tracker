import { formatLKR } from "@/lib/format";
import { removeCancelledCharge, ignoreCancellationNotice } from "@/app/actions";

export interface CancellationCandidateView {
  id: string;
  amount: number;
  date: string;
  merchant: string | null;
}

export interface CancellationEntry {
  id: string;
  merchant: string;
  cardLast4: string | null;
  account: string;
  tooManyMatches: boolean;
  rawText: string;
  candidates: CancellationCandidateView[];
}

function accountLabel(account: string): string {
  return account === "savings" ? "Savings" : account === "cash" ? "Cash" : "Bank / Card";
}

function IgnoreButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      formAction={ignoreCancellationNotice}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
    >
      {label}
    </button>
  );
}

function CandidateRow({ candidate }: { candidate: CancellationCandidateView }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate">{candidate.merchant ?? "Unknown merchant"}</span>
      <span className="shrink-0 text-xs text-on-surface-variant">{candidate.date}</span>
      <span className="shrink-0 font-semibold">{formatLKR(candidate.amount)}</span>
    </div>
  );
}

/**
 * SMS card-transaction cancellation notices awaiting review. Distinct from
 * (and rendered above) the normal ReviewList — a cancellation notice isn't
 * a transaction to confirm, it's a request to remove one that already
 * exists, so it needs its own zero/one/many-candidate layouts instead of
 * ReviewList's confirm/correct-details flow.
 */
export function CancellationReview({ entries }: { entries: CancellationEntry[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-label-caps text-on-surface-variant">Cancellation notices</h2>
      <ul className="flex flex-col gap-4">
        {entries.map((entry) => {
          const cardSuffix = entry.cardLast4 ? ` on card •••${entry.cardLast4}` : "";
          return (
            <li
              key={entry.id}
              className="rounded-xl border border-outline-variant bg-surface-container-low p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-on-surface">{entry.merchant}</span>
                {entry.cardLast4 ? (
                  <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant">
                    card •••{entry.cardLast4}
                  </span>
                ) : null}
                <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-xs font-medium text-on-surface-variant">
                  {accountLabel(entry.account)}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 rounded bg-surface-container-lowest/70 p-2 text-xs text-on-surface-variant">
                {entry.rawText}
              </p>

              {entry.tooManyMatches ? (
                <div className="mt-3 flex flex-col gap-2">
                  <p className="text-sm text-on-surface-variant">
                    Too many recent charges match this merchant to pick from safely — check
                    manually.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="/transactions"
                      className="rounded-md border border-outline-variant px-3 py-1.5 text-sm font-medium text-on-surface hover:bg-surface-container active:bg-surface-container-high"
                    >
                      Search transactions
                    </a>
                    <form action={ignoreCancellationNotice}>
                      <input type="hidden" name="cancellation_id" value={entry.id} />
                      <IgnoreButton label="Ignore notice" />
                    </form>
                  </div>
                </div>
              ) : entry.candidates.length === 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                  <p className="text-sm text-on-surface-variant">
                    A cancellation notice for {entry.merchant}
                    {cardSuffix} arrived but no matching recent charge was found.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="/transactions"
                      className="rounded-md border border-outline-variant px-3 py-1.5 text-sm font-medium text-on-surface hover:bg-surface-container active:bg-surface-container-high"
                    >
                      Search transactions
                    </a>
                    <form action={ignoreCancellationNotice}>
                      <input type="hidden" name="cancellation_id" value={entry.id} />
                      <IgnoreButton label="Dismiss" />
                    </form>
                  </div>
                </div>
              ) : entry.candidates.length === 1 ? (
                <form action={removeCancelledCharge} className="mt-3 flex flex-col gap-2">
                  <input type="hidden" name="cancellation_id" value={entry.id} />
                  <input type="hidden" name="transaction_id" value={entry.candidates[0].id} />
                  <div className="rounded-lg border border-outline-variant px-3 py-2 text-sm">
                    <CandidateRow candidate={entry.candidates[0]} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="rounded-md bg-expense px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 active:opacity-70"
                    >
                      Remove this charge
                    </button>
                    <IgnoreButton label="Ignore notice" />
                  </div>
                </form>
              ) : (
                <form action={removeCancelledCharge} className="mt-3 flex flex-col gap-2">
                  <input type="hidden" name="cancellation_id" value={entry.id} />
                  <p className="text-sm text-on-surface-variant">
                    Multiple recent charges match — pick the one this notice refers to:
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {entry.candidates.map((c, i) => (
                      <li key={c.id}>
                        <label className="flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-sm has-[:checked]:border-primary">
                          <input
                            type="radio"
                            name="transaction_id"
                            value={c.id}
                            defaultChecked={i === 0}
                            className="h-4 w-4 shrink-0 accent-primary"
                          />
                          <span className="min-w-0 flex-1">
                            <CandidateRow candidate={c} />
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="rounded-md bg-expense px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 active:opacity-70"
                    >
                      Remove selected charge
                    </button>
                    <IgnoreButton label="Ignore notice" />
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
