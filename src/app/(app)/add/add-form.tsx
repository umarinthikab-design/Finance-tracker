"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createTransaction, type FormState } from "@/app/actions";

export function AddForm({
  categories,
}: {
  categories: { name: string; type: string }[];
}) {
  const [type, setType] = useState("expense");
  const [account, setAccount] = useState("cash");
  const [countsTowardAllowance, setCountsTowardAllowance] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("");

  // Staged amounts: type an amount, press + to add another line item; the
  // form submits ONE transaction whose amount is the sum of all of them.
  const [amounts, setAmounts] = useState<number[]>([]);
  const [amountInput, setAmountInput] = useState("");

  // A freshly typed amount that hasn't been staged with + yet still counts,
  // so entering a single amount and pressing Save just works.
  const typedNow = useMemo(() => {
    const n = Number(amountInput);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }, [amountInput]);

  const staged = useMemo(
    () => Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100,
    [amounts]
  );
  const grand = Math.round((staged + typedNow) * 100) / 100;

  const addAmount = () => {
    if (typedNow <= 0) return;
    setAmounts((prev) => [...prev, typedNow]);
    setAmountInput("");
  };

  const removeAmount = (idx: number) => {
    setAmounts((prev) => prev.filter((_, i) => i !== idx));
  };

  const filtered = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type]
  );

  const saveTimer = useRef<number | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Event-driven wrapper: on success show a small banner, clear the amounts
  // so the next entry can start immediately. No effects needed.
  const [state, action, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const res = await createTransaction(prev, formData);
      if (res?.success) {
        const amt = Number(formData.get("amount")) || 0;
        setSavedMsg(
          `Saved ${amt.toFixed(2)} LKR — ${type}${category ? ` · ${category}` : ""}`
        );
        setAmounts([]);
        setAmountInput("");
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => setSavedMsg(null), 5000);
      }
      return res;
    },
    null
  );

  const inputCls =
    "w-full rounded-md border border-outline-variant px-3 py-2 text-base outline-none bg-surface-container-lowest text-on-surface focus:border-primary";

  const reduce = useReducedMotion();

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-outline-variant p-5"
    >
      <AnimatePresence>
        {savedMsg ? (
          <motion.p
            key="saved-banner"
            role="status"
            initial={reduce ? false : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="rounded-lg border border-income/40 bg-income/10 px-3 py-2 text-sm font-medium text-income"
          >
            <span className="mr-1.5 inline-flex items-center justify-center rounded-full bg-income/20">
              <motion.svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                initial={reduce ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.18, ease: "easeOut", delay: 0.05 }}
              >
                <path d="M4 12l5 5L20 7" />
              </motion.svg>
            </span>
            {savedMsg}
          </motion.p>
        ) : null}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Date
          <input
            type="date"
            name="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={inputCls}
          />
        </label>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="block">Amount (LKR)</span>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addAmount();
                }
              }}
              className={inputCls}
            />
            <button
              type="button"
              onClick={addAmount}
              aria-label="Add amount to list"
              title="Add this amount to the list"
              disabled={typedNow <= 0}
              className="shrink-0 rounded-md bg-primary px-4 py-2 text-lg font-semibold leading-none text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Hidden real value submitted to the server action */}
      <input type="hidden" name="amount" value={grand || ""} />

      {amounts.length > 0 ? (
        <div className="rounded-lg border border-outline-variant p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Line items ({amounts.length})
          </p>
          <ul className="mt-2 divide-y divide-outline-variant">
            {amounts.map((a, i) => (
              <li key={`${a}-${i}`} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-on-surface-variant">#{i + 1}</span>
                <span className="flex items-center gap-3">
                  <span className="font-medium text-on-surface">
                    {a.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove amount ${a}`}
                    onClick={() => removeAmount(i)}
                    className="rounded-md px-2 py-0.5 text-xs font-medium text-expense hover:bg-expense/10 active:bg-expense/20"
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {typedNow > 0 ? (
            <p className="mt-1 text-xs text-on-surface-variant">
              +{typedNow.toFixed(2)} waiting — press + to stage it
            </p>
          ) : null}
          <p className="mt-2 flex justify-between border-t border-outline-variant pt-2 text-sm font-semibold text-on-surface">
            <span>Total (saved as one transaction)</span>
            <span>{grand.toFixed(2)} LKR</span>
          </p>
        </div>
      ) : (
        <p className="-mt-1 text-xs text-on-surface-variant">
          One amount? Press Save. Several receipts in one day? Press + after
          each one — they&apos;ll be recorded as a single transaction.
        </p>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Type
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["expense", "income", "savings", "transfer"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-md border px-3 py-2 text-sm font-medium capitalize ${
                type === t
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low active:bg-surface-container"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <input type="hidden" name="type" value={type} />
      </label>

      {type === "transfer" ? (
        <>
          <p className="text-xs text-on-surface-variant">
            Move money between your buckets. This does not count as an expense.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              From
              <select name="account" defaultValue="bank" className={inputCls}>
                <option value="cash">Cash in hand</option>
                <option value="bank">Bank / Card</option>
                <option value="savings">Savings</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              To
              <select name="to_account" defaultValue="cash" className={inputCls}>
                <option value="cash">Cash in hand</option>
                <option value="bank">Bank / Card</option>
                <option value="savings">Savings</option>
              </select>
            </label>
          </div>
        </>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Paid with
          <div className="grid grid-cols-3 gap-2">
            {([
              ["cash", "Cash"],
              ["bank", "Card / Bank"],
              ["savings", "Savings"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAccount(value)}
                className={`rounded-md border px-3 py-2 text-sm font-medium ${
                  account === value
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low active:bg-surface-container"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input type="hidden" name="account" value={account} />
        </label>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Category
        <select
          name="category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputCls}
        >
          <option value="">Select</option>
          {filtered.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {type === "expense" ? (
        <label className="flex items-start gap-2.5 rounded-lg border border-outline-variant p-3">
          <input
            type="checkbox"
            name="counts_toward_allowance"
            checked={countsTowardAllowance}
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

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Title
        <input
          type="text"
          name="title"
          placeholder="Optional — e.g. Groceries run, Bus fare"
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Notes
        <input
          type="text"
          name="notes"
          placeholder="Optional — e.g. Lunch at Kottu House"
          className={inputCls}
        />
      </label>

      {state?.error ? (
        <p className="text-sm text-expense">{state.error}</p>
      ) : null}

      <motion.button
        type="submit"
        disabled={pending || grand <= 0}
        title={grand <= 0 ? "Enter an amount first" : undefined}
        whileTap={reduce ? undefined : { scale: 0.97 }}
        transition={{ duration: 0.1 }}
        className="rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-60"
      >
        {pending
          ? "Saving…"
          : grand > 0
            ? `Save transaction (${grand.toFixed(2)} LKR)`
            : "Save transaction"}
      </motion.button>
    </form>
  );
}
