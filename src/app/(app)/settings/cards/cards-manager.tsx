"use client";

import { useActionState } from "react";
import {
  upsertCardAccountAction,
  deleteCardAccountAction,
  type FormState,
} from "@/app/actions";
import type { CardAccountMapping } from "@/lib/card-accounts";

const ACCOUNT_OPTIONS = [
  ["savings", "Savings"],
  ["bank", "Card / Bank"],
  ["cash", "Cash"],
] as const;

const inputCls =
  "w-full rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary";

export function CardsManager({
  initial,
}: {
  initial: CardAccountMapping[];
}) {
  const [upsertState, upsertAction, upserting] = useActionState<FormState, FormData>(
    upsertCardAccountAction,
    null
  );
  const [deleteState, deleteAction, deleting] = useActionState<FormState, FormData>(
    deleteCardAccountAction,
    null
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-headline-md text-on-surface">Card accounts</h1>
      <p className="text-sm text-on-surface-variant">
        Which account each debit card belongs to. When a bank SMS names a
        card&apos;s last 4 digits (e.g. &ldquo;…ending #8662&rdquo;), matching
        purchases are recorded against that card&apos;s account instead of
        always defaulting to the bank bucket. Reissued card? Update the digits
        here — no code change needed.
      </p>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-sm font-semibold text-on-surface">Add / update a card</h2>
        <p className="mt-1 text-xs text-on-surface-variant">
          Sending the same 4 digits again updates the account that card maps to.
        </p>
        <form action={upsertAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-on-surface-variant">
            Card ending (last 4 digits)
            <input
              type="text"
              name="card_last4"
              required
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              placeholder="e.g. 8662"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-on-surface-variant">
            Account
            <select name="account" required className={inputCls}>
              {ACCOUNT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={upserting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-60"
          >
            {upserting ? "Saving…" : "Save"}
          </button>
        </form>
        {upsertState?.error ? (
          <p className="mt-2 text-sm text-expense">{upsertState.error}</p>
        ) : null}
        {upsertState?.success ? (
          <p className="mt-2 text-sm text-income">Card saved.</p>
        ) : null}
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-sm font-semibold text-on-surface">
          Registered cards ({initial.length})
        </h2>
        {initial.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">
            No cards registered yet. Future SMS purchases without a listed card
            keep defaulting to the bank bucket.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-outline-variant">
            {initial.map((m) => (
              <li key={m.card_last4} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-on-surface">
                    •••• {m.card_last4}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      m.account === "savings"
                        ? "bg-secondary-container text-secondary"
                        : m.account === "bank"
                          ? "bg-surface-container-highest text-on-surface-variant"
                          : "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    {m.account === "savings"
                      ? "Savings"
                      : m.account === "bank"
                        ? "Card / Bank"
                        : "Cash"}
                  </span>
                </div>
                <form action={deleteAction}>
                  <input type="hidden" name="card_last4" value={m.card_last4} />
                  <button
                    type="submit"
                    disabled={deleting}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-expense hover:bg-expense/10 active:bg-expense/20 disabled:opacity-60"
                  >
                    {deleting ? "…" : "Delete"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {deleteState?.error ? (
          <p className="mt-2 text-sm text-expense">{deleteState.error}</p>
        ) : null}
        {deleteState?.success ? (
          <p className="mt-2 text-sm text-income">Card removed.</p>
        ) : null}
      </section>

      <p className="text-xs text-on-surface-variant">
        Mappings apply to future SMS only. Past transactions keep the account
        they were saved with.
      </p>
    </main>
  );
}