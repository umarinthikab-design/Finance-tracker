"use client";

import { useActionState, useMemo, useState } from "react";
import { updateTransaction } from "@/app/actions";

export function TransactionEditForm({
  transaction,
  categories,
  isNewMerchant,
}: {
  transaction: {
    id: string;
    date: string;
    amount: number;
    type: "expense" | "income" | "savings" | "transfer";
    category: string;
    merchant: string | null;
    account?: string | null;
    to_account?: string | null;
    title?: string | null;
    counts_toward_allowance?: boolean | null;
  };
  categories: { name: string; type: string; hidden?: boolean }[];
  isNewMerchant: boolean;
}) {
  const [state, action, pending] = useActionState(updateTransaction, null);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(transaction.type);
  // Tracked the same way `type` is, so the allowance checkbox can react to a
  // Savings pick exactly like the Add form does.
  const [account, setAccount] = useState<"cash" | "bank" | "savings">(() =>
    transaction.account === "savings"
      ? "savings"
      : transaction.account === "bank"
        ? "bank"
        : "cash"
  );
  const [countsTowardAllowance, setCountsTowardAllowance] = useState(
    transaction.counts_toward_allowance !== false
  );

  const onAccountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as "cash" | "bank" | "savings";
    setAccount(value);
    // Savings payments never count; anything else restores the default-on
    // checked state, matching the Add form.
    if (value === "savings") setCountsTowardAllowance(false);
    else setCountsTowardAllowance(true);
  };

  // Hidden categories are excluded from the picker unless they're already
  // set on this transaction (so correcting it doesn't lose the value).
  const filtered = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.type === type && (!c.hidden || c.name === transaction.category)
      ),
    [categories, type, transaction.category]
  );

  const inputCls =
    "w-full rounded-md border border-outline-variant px-2.5 py-1.5 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary";

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-on-surface-variant hover:text-on-surface active:text-on-surface"
      >
        {open ? "Hide correction" : "Correct details"}
      </button>

      {open ? (
        <form
          action={action}
          className="mt-2 grid gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest/70 p-3 sm:grid-cols-2"
        >
          <input type="hidden" name="id" value={transaction.id} />
          {isNewMerchant && transaction.merchant ? (
            <p className="text-xs font-medium text-on-surface-variant sm:col-span-2">
              Which category does “{transaction.merchant}” belong to?
            </p>
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-medium">
            Date
            <input
              type="date"
              name="date"
              defaultValue={transaction.date}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Title
            <input
              type="text"
              name="title"
              defaultValue={transaction.title ?? ""}
              placeholder="Optional title"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Amount
            <input
              type="number"
              name="amount"
              min="0"
              step="0.01"
              defaultValue={transaction.amount}
              required
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Type
            <select
              name="type"
              value={type}
              onChange={(e) =>
                setType(e.target.value as "expense" | "income" | "savings" | "transfer")
              }
              className={inputCls}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="savings">Savings</option>
              <option value="transfer">Transfer (bank &rarr; cash)</option>
            </select>
          </label>
          {type === "transfer" ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:col-span-2">
              <label className="flex flex-col gap-1 text-xs font-medium">
                From
                <select
                  name="account"
                  value={account}
                  onChange={onAccountChange}
                  className={inputCls}
                >
                  <option value="cash">Cash in hand</option>
                  <option value="bank">Bank / Card</option>
                  <option value="savings">Savings</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium">
                To
                <select
                  name="to_account"
                  defaultValue={
                    transaction.to_account === "savings"
                      ? "savings"
                      : transaction.to_account === "bank"
                        ? "bank"
                        : "cash"
                  }
                  className={inputCls}
                >
                  <option value="cash">Cash in hand</option>
                  <option value="bank">Bank / Card</option>
                  <option value="savings">Savings</option>
                </select>
              </label>
            </div>
          ) : (
            <label className="flex flex-col gap-1 text-xs font-medium">
              {type === "savings" ? "Into savings from" : "Paid with"}
              <select
                name="account"
                value={account}
                onChange={onAccountChange}
                className={inputCls}
              >
                <option value="cash">Cash</option>
                <option value="bank">Card / Bank</option>
                <option value="savings">Savings</option>
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium">
            Category
            <select name="category" defaultValue={transaction.category || ""} className={inputCls}>
              <option value="">Uncategorized</option>
              {filtered.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {type === "expense" ? (
            <label className="flex items-start gap-2.5 rounded-lg border border-outline-variant p-3 sm:col-span-2">
              <input
                type="checkbox"
                name="counts_toward_allowance"
                checked={countsTowardAllowance && account !== "savings"}
                disabled={account === "savings"}
                onChange={(e) => setCountsTowardAllowance(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium">Count toward allowance</span>
                <span className="block text-xs text-on-surface-variant">
                  {account === "savings"
                    ? "Savings payments never deduct from the allowance."
                    : "Untick for a purchase you don't want to use this period's allowance."}
                </span>
              </span>
            </label>
          ) : null}
          {state?.error ? (
            <p className="text-xs text-expense sm:col-span-2">{state.error}</p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-60 sm:col-span-2"
          >
            {pending ? "Saving…" : "Save correction"}
          </button>
        </form>
      ) : null}
    </div>
  );
}