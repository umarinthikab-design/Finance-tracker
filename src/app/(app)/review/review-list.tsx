"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmTransaction, deleteTransaction, type FormState } from "@/app/actions";
import { formatLKR } from "@/lib/format";
import { TransactionEditForm as EditForm } from "@/components/transaction-edit-form";
import { ConfirmButton } from "./confirm-button";
import { normalizeMerchant } from "@/lib/merchant";

export interface ReviewTxn {
  id: string;
  date: string;
  amount: number;
  type: "expense" | "income" | "savings" | "transfer";
  category: string | null;
  source: string;
  merchant: string | null;
  raw_text: string | null;
  account?: string | null;
  title?: string | null;
  counts_toward_allowance?: boolean | null;
}

/**
 * Review queue with additive bulk actions: select rows (or select all) and
 * confirm them in one pass. Each row still has its own Confirm / Delete /
 * Correct-details controls, unchanged.
 */
export function ReviewList({
  txns,
  categories,
  knownMerchants,
}: {
  txns: ReviewTxn[];
  categories: { name: string; type: string; hidden?: boolean }[];
  knownMerchants: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const knownSet = new Set(knownMerchants);
  const blocked = (t: ReviewTxn) =>
    !t.category || t.category === "Other" || t.category === "Other Income";

  const selectable = txns.filter((t) => !blocked(t));
  const allSelected =
    selectable.length > 0 && selectable.every((t) => selected.has(t.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const t of selectable) next.delete(t.id);
      } else {
        for (const t of selectable) next.add(t.id);
      }
      return next;
    });

  const confirmSelected = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setResult(null);
    let confirmed = 0;
    let failed = 0;
    for (const id of selected) {
      const fd = new FormData();
      fd.set("id", id);
      const res: FormState = await confirmTransaction({}, fd);
      if (res?.success) {
        confirmed += 1;
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        failed += 1;
      }
    }
    setBusy(false);
    if (confirmed > 0) {
      setResult(
        failed > 0
          ? `Confirmed ${confirmed} — ${failed} still need a category set first.`
          : `Confirmed ${confirmed} transaction${confirmed === 1 ? "" : "s"}.`
      );
    } else {
      setResult("Nothing could be confirmed — set a category on those rows first.");
    }
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            disabled={selectable.length === 0 || busy}
            className="h-4 w-4 accent-primary"
          />
          Select all
          <span className="text-xs font-normal text-on-surface-variant">
            ({selectable.length} confirmable)
          </span>
        </label>
        <button
          type="button"
          onClick={confirmSelected}
          disabled={selected.size === 0 || busy}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-50"
        >
          {busy
            ? "Confirming…"
            : `Confirm selected (${selected.size})`}
        </button>
      </div>

      {result ? (
        <p role="status" className="text-sm text-on-surface-variant">
          {result}
        </p>
      ) : null}

      <ul className="flex flex-col gap-4">
        {txns.map((t) => {
          const isBlocked = blocked(t);
          const isNewMerchant =
            !!t.merchant &&
            !knownSet.has(normalizeMerchant(t.merchant));
          return (
            <li
              key={t.id}
              className="rounded-xl border border-outline-variant bg-surface-container-low p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    disabled={isBlocked || busy}
                    title={
                      isBlocked
                        ? "Set a real category first (use Correct details below)"
                        : undefined
                    }
                    className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {t.category ? (
                        <span className="font-medium text-on-surface">{t.category}</span>
                      ) : (
                        <span className="font-medium text-on-surface-variant">Uncategorized</span>
                      )}
                      {isNewMerchant ? (
                        <span className="rounded-full bg-secondary-container px-2 py-0.5 text-xs font-medium text-secondary">
                          New merchant
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          t.type === "expense"
                            ? "bg-expense/10 text-expense"
                            : t.type === "income"
                              ? "bg-income/10 text-income"
                              : t.type === "transfer"
                                ? "bg-surface-container-highest text-on-surface-variant"
                                : "bg-secondary-container text-secondary"
                        }`}
                      >
                        {t.type}
                      </span>
                      <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant uppercase">
                        {t.source}
                      </span>
                      {t.account ? (
                        <span
                          title="Account this was recorded against (card mapping for SMS)"
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            t.account === "savings"
                              ? "bg-secondary-container text-secondary"
                              : t.account === "cash"
                                ? "bg-surface-container-highest text-on-surface-variant"
                                : "bg-surface-container-high text-on-surface-variant"
                          }`}
                        >
                          {t.account === "savings"
                            ? "Savings"
                            : t.account === "cash"
                              ? "Cash"
                              : "Bank / Card"}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-lg font-semibold">
                      {formatLKR(Number(t.amount))}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">{t.date}</p>
                    {t.raw_text ? (
                      <p className="mt-2 line-clamp-3 rounded bg-surface-container-lowest/70 p-2 text-xs text-on-surface-variant">
                        {t.raw_text}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <ConfirmButton id={t.id} category={t.category} />
                  <form action={deleteTransaction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      className="rounded-md px-3 py-1.5 text-sm text-expense hover:bg-expense/10 active:bg-expense/20"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
              <EditForm
                transaction={{
                  id: t.id,
                  date: t.date,
                  amount: Number(t.amount),
                  type: t.type,
                  category: t.category ?? "",
                  merchant: t.merchant ?? null,
                  account: t.account,
                  title: t.title,
                  counts_toward_allowance: t.counts_toward_allowance,
                }}
                categories={categories}
                isNewMerchant={isNewMerchant}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}