"use client";

import { useActionState, useState } from "react";
import {
  updateMerchantRuleAction,
  deleteMerchantRuleAction,
  type FormState,
} from "@/app/actions";
import type { MerchantRule } from "@/lib/merchant";

const inputCls =
  "w-full rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary";

export default function MerchantsManager({
  rules,
  categories,
}: {
  rules: MerchantRule[];
  categories: { name: string; type: string; hidden?: boolean }[];
}) {
  const [editMerchant, setEditMerchant] = useState<string | null>(null);
  const [updateState, updateAction, updating] = useActionState<FormState, FormData>(
    updateMerchantRuleAction,
    null
  );
  const [deleteState, deleteAction, deleting] = useActionState<FormState, FormData>(
    deleteMerchantRuleAction,
    null
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-headline-md text-on-surface">
        Merchant rules
      </h1>
      <p className="text-sm text-on-surface-variant">
        What the system has learned: when an SMS mentions one of these
        merchants, it is auto-categorized — matching also works when the bank
        adds branch or location text around the name. Deleting a rule makes
        future transactions from that merchant go through review again.
      </p>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-sm font-semibold text-on-surface">
          Learned mappings ({rules.length})
        </h2>
        {rules.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">
            Nothing learned yet. Confirm or correct a transaction with a
            merchant name and it will appear here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-outline-variant">
            {rules.map((r) => (
              <li key={r.merchant} className="py-3">
                {editMerchant === r.merchant ? (
                  <form
                    action={updateAction}
                    className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <input type="hidden" name="merchant" value={r.merchant} />
                    <input
                      type="text"
                      value={r.merchant}
                      disabled
                      className={`${inputCls} opacity-60`}
                    />
                    <select name="category" defaultValue={r.category} className={inputCls}>
                      {categories.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={updating}
                        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-60"
                      >
                        {updating ? "…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditMerchant(null)}
                        className="rounded-md px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-on-surface">
                        {r.merchant}
                      </p>
                      <p className="text-sm text-on-surface-variant">
                        &rarr; {r.category}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditMerchant(r.merchant)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
                      >
                        Edit
                      </button>
                      <form action={deleteAction}>
                        <input type="hidden" name="merchant" value={r.merchant} />
                        <button
                          type="submit"
                          disabled={deleting}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-expense hover:bg-expense/10 active:bg-expense/20 disabled:opacity-60"
                        >
                          {deleting ? "…" : "Delete"}
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {deleteState?.error ? (
          <p className="mt-2 text-sm text-expense">{deleteState.error}</p>
        ) : null}
        {updateState?.error ? (
          <p className="mt-2 text-sm text-expense">{updateState.error}</p>
        ) : null}
      </section>

      <p className="text-xs text-on-surface-variant">
        Tip: rules apply to future SMS automatically. Past transactions keep
        their category unless you edit them on the All Transactions page.
      </p>
    </main>
  );
}
