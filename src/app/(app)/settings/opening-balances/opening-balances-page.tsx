"use client";

import { useActionState, useState } from "react";
import {
  createOpeningBalance,
  updateOpeningBalance,
  deleteOpeningBalance,
  type FormState,
} from "@/app/actions";
import { todayISOInColombo } from "@/lib/timezone";
import { formatLKR } from "@/lib/format";

interface OpeningBalance {
  id: string;
  label: string;
  amount: number;
  as_of_date: string;
  kind?: string | null;
}

const inputCls =
  "w-full rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary";

export default function OpeningBalancesPage({
  balances,
}: {
  balances: OpeningBalance[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createState, createAction, creating] = useActionState<FormState, FormData>(
    createOpeningBalance,
    null
  );
  const [updateState, updateAction, updating] = useActionState<FormState, FormData>(
    updateOpeningBalance,
    null
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-headline-md text-on-surface">Opening balances</h1>
      <p className="text-sm text-on-surface-variant">
        Seed your cash-in-hand / cash-in-bank starting balances. Pick which
        bucket each balance belongs to — the dashboard splits your current
        total into Cash in hand and Bank using it. These are one-time
        snapshots — they do not enter the expense/income/savings flow.
      </p>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-sm font-semibold text-on-surface">Add a balance</h2>
        <form action={createAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            name="label"
            required
            placeholder="e.g. Cash in hand"
            className={inputCls}
          />
          <input
            type="number"
            name="amount"
            required
            min="0"
            step="0.01"
            placeholder="Amount (LKR)"
            className={inputCls}
          />
          <select
            name="kind"
            defaultValue="cash"
            className={inputCls}
          >
            <option value="cash">Cash in hand</option>
            <option value="bank">Bank / Card</option>
            <option value="savings">Savings</option>
          </select>
          <input
            type="date"
            name="as_of_date"
            required
            defaultValue={todayISOInColombo()}
            className={inputCls}
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-60 sm:col-span-2"
          >
            {creating ? "Adding…" : "Add balance"}
          </button>
          {createState?.error ? (
            <p className="text-sm text-expense sm:col-span-3">{createState.error}</p>
          ) : null}
          {createState?.success ? (
            <p className="text-sm text-income sm:col-span-3">Balance added.</p>
          ) : null}
        </form>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-sm font-semibold text-on-surface">Existing balances</h2>
        {balances.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">No opening balances yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-outline-variant">
            {balances.map((b) => (
              <li key={b.id} className="py-3">
                {editingId === b.id ? (
                  <form action={updateAction} className="grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={b.id} />
                    <input
                      type="text"
                      name="label"
                      required
                      defaultValue={b.label}
                      className={inputCls}
                    />
                    <input
                      type="number"
                      name="amount"
                      required
                      min="0"
                      step="0.01"
                      defaultValue={b.amount}
                      className={inputCls}
                    />
                    <select
                      name="kind"
                      defaultValue={b.kind ?? "cash"}
                      className={inputCls}
                    >
                      <option value="cash">Cash in hand</option>
                      <option value="bank">Bank / Card</option>
                      <option value="savings">Savings</option>
                    </select>
                    <input
                      type="date"
                      name="as_of_date"
                      required
                      defaultValue={b.as_of_date}
                      className={inputCls}
                    />
                    <button
                      type="submit"
                      disabled={updating}
                      className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-60 sm:col-span-2"
                    >
                      {updating ? "Saving…" : "Save"}
                    </button>
                    {updateState?.error ? (
                      <p className="text-sm text-expense sm:col-span-2">{updateState.error}</p>
                    ) : null}
                  </form>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-on-surface">{b.label}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            b.kind === "cash"
                              ? "bg-surface-container-high text-on-surface-variant"
                              : "bg-secondary-container text-secondary"
                          }`}
                        >
                          {b.kind === "savings" ? "Savings" : b.kind === "cash" ? "Cash" : "Bank"}
                        </span>
                      </div>
                      <p className="text-sm text-on-surface-variant">as of {b.as_of_date}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold text-on-surface">
                        {formatLKR(Number(b.amount))}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingId(b.id)}
                        className="text-sm font-medium text-on-surface-variant hover:text-on-surface active:text-on-surface"
                      >
                        Edit
                      </button>
                      <form action={deleteOpeningBalance}>
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="text-sm font-medium text-expense hover:text-expense"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-on-surface-variant">
        Total seeded: {formatLKR(balances.reduce((s, b) => s + Number(b.amount), 0))}
      </p>
    </main>
  );
}
