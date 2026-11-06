"use client";

import { useActionState, useMemo, useState } from "react";
import {
  updateAllowanceDefault,
  updateAllowanceCycleAction,
  upsertAllowanceOverride,
  deleteAllowanceOverride,
  type FormState,
} from "@/app/actions";
import { formatLKR } from "@/lib/format";
import {
  bucketLabel,
  computeBuckets,
  type AllowanceSetting,
  type AllowanceOverride,
  type CycleBucketConfig,
  type ResolvedBucket,
} from "@/lib/allowance";

const inputCls =
  "w-full rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function AllowancePage({
  active,
  overrides,
  config,
  viewYear,
  viewMonth,
  buckets,
  overrideLabels,
}: {
  active: AllowanceSetting | null;
  overrides: AllowanceOverride[];
  config: CycleBucketConfig[];
  viewYear: number;
  viewMonth: number;
  buckets: ResolvedBucket[];
  overrideLabels: Record<string, string>;
}) {
  const [defaultState, defaultAction, savingDefault] = useActionState<
    FormState,
    FormData
  >(updateAllowanceDefault, null);
  const [cycleState, cycleAction, savingCycle] = useActionState<
    FormState,
    FormData
  >(updateAllowanceCycleAction, null);
  const [overrideState, overrideAction, savingOverride] = useActionState<
    FormState,
    FormData
  >(upsertAllowanceOverride, null);

  // Live month selection for the add-override form (labels recompute).
  const [ovMonth, setOvMonth] = useState(`${viewYear}-${String(viewMonth).padStart(2, "0")}`);
  const [ovBucket, setOvBucket] = useState(1);
  const ovYear = Number(ovMonth.slice(0, 4));
  const ovMon = Number(ovMonth.slice(5, 7));
  const liveBuckets = useMemo(
    () => computeBuckets(config, ovYear, ovMon),
    [config, ovYear, ovMon]
  );

  // Client-side mirror of the server validation for the cut-point editor.
  const [days, setDays] = useState<number[]>(() =>
    config.map((c) => c.startDay)
  );
  const cycleError = useMemo(() => {
    if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) {
      return "Start days must be integers between 1 and 31";
    }
    if (days[0] !== 1) return "Bucket 1 must start on day 1";
    for (let i = 1; i < days.length; i++) {
      if (days[i] <= days[i - 1]) return "Start days must be strictly increasing";
    }
    return null;
  }, [days]);

  // Current-month breakdown with amounts (default vs override).
  const breakdownAmounts = useMemo(() => {
    const map = new Map<number, { amount: number; source: "default" | "override" }>();
    for (const o of overrides) {
      if (o.year === viewYear && o.month === viewMonth) {
        map.set(o.bucketNumber, { amount: o.amount, source: "override" });
      }
    }
    return map;
  }, [overrides, viewYear, viewMonth]);
  const defaultAmt = Number(active?.default_weekly_amount ?? 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-headline-md text-on-surface">Allowance</h1>
      <p className="text-sm text-on-surface-variant">
        Each month is split into four buckets by the cut points below. Every
        bucket gets its override amount if one exists, otherwise the default.
        This is a budget figure — it is never logged as a transaction.
      </p>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-sm font-semibold text-on-surface">
          Bucket cut points
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          The day each bucket starts. A bucket ends the day before the next one
          starts; Week 4 ends at the month&apos;s last day.
        </p>
        <form action={cycleAction} className="mt-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((b) => (
              <label key={b} className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
                Bucket {b}
                <input
                  type="number"
                  name={`start_day_${b}`}
                  min="1"
                  max="31"
                  required
                  value={days[b - 1] ?? ""}
                  onChange={(e) =>
                    setDays((prev) => {
                      const next = [...prev];
                      next[b - 1] = Number(e.target.value);
                      return next;
                    })
                  }
                  className={inputCls}
                />
                <span className="text-on-surface-variant">
                  {(() => {
                    const rb = computeBuckets(
                      days.map((d, i) => ({ bucketNumber: i + 1, startDay: d })),
                      viewYear,
                      viewMonth
                    )[b - 1];
                    return rb.startDate <= rb.endDate
                      ? `${rb.startDate.slice(8)}–${rb.endDate.slice(8)} ${MONTH_NAMES[viewMonth - 1]}`
                      : "—";
                  })()}
                </span>
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={savingCycle || !!cycleError}
            className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-60"
          >
            {savingCycle ? "Saving…" : "Save cut points"}
          </button>
          {cycleError ? (
            <p className="mt-2 text-xs text-expense">{cycleError}</p>
          ) : null}
          {cycleState?.error ? (
            <p className="mt-2 text-sm text-expense">{cycleState.error}</p>
          ) : null}
          {cycleState?.success ? (
            <p className="mt-2 text-sm text-income">Cut points saved.</p>
          ) : null}
        </form>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-sm font-semibold text-on-surface">
          Default amount per bucket
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Used for every bucket without an override.
        </p>
        <form action={defaultAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={active?.id ?? ""} />
          <input
            type="number"
            name="amount"
            required
            min="0"
            step="0.01"
            defaultValue={active ? Number(active.default_weekly_amount) : ""}
            placeholder="Default amount (LKR)"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={savingDefault}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-60"
          >
            {savingDefault ? "Saving…" : "Save default"}
          </button>
          {defaultState?.error ? (
            <p className="text-sm text-expense sm:col-span-2">{defaultState.error}</p>
          ) : null}
          {defaultState?.success ? (
            <p className="text-sm text-income sm:col-span-2">Default saved.</p>
          ) : null}
        </form>
        {active ? (
          <p className="mt-2 text-xs text-on-surface-variant">
            Active since {active.effective_from}
          </p>
        ) : (
          <p className="mt-2 text-xs text-on-surface-variant">
            No active default yet — saving one makes it effective today.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-sm font-semibold text-on-surface">
          Bucket overrides
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          One-off amounts that replace the default for a specific bucket of a
          specific month.
        </p>

        {/* Current month overview */}
        <div className="mt-3 rounded-lg border border-outline-variant p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </p>
          <ul className="mt-2 divide-y divide-outline-variant">
            {buckets.map((b) => {
              const eff = breakdownAmounts.get(b.bucketNumber);
              const amount = eff?.amount ?? defaultAmt;
              return (
                <li key={b.bucketNumber} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-on-surface-variant">
                    {bucketLabel(b)}
                  </span>
                  <span className="font-medium text-on-surface">
                    {formatLKR(amount)}{" "}
                    <span className="text-xs font-normal text-on-surface-variant">
                      ({eff?.source ?? "default"})
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <form action={overrideAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
            Month
            <input
              type="month"
              name="month_picker"
              required
              value={ovMonth}
              onChange={(e) => setOvMonth(e.target.value || ovMonth)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
            Bucket
            <select
              name="bucket_number"
              value={ovBucket}
              onChange={(e) => setOvBucket(Number(e.target.value))}
              key={ovMonth}
              className={inputCls}
            >
              {liveBuckets.map((b) => (
                <option key={b.bucketNumber} value={b.bucketNumber}>
                  {bucketLabel(b)}
                </option>
              ))}
            </select>
          </label>
          {/* Real fields submitted */}
          <input type="hidden" name="year" value={ovYear} />
          <input type="hidden" name="month" value={ovMon} />
          <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
            Amount (LKR)
            <input
              type="number"
              name="amount"
              required
              min="0"
              step="0.01"
              placeholder="e.g. 20000"
              className={inputCls}
            />
          </label>
          <button
            type="submit"
            disabled={savingOverride}
            className="self-end rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-60 sm:col-span-2"
          >
            {savingOverride ? "Saving…" : "Set override"}
          </button>
          {overrideState?.error ? (
            <p className="text-sm text-expense sm:col-span-2">{overrideState.error}</p>
          ) : null}
          {overrideState?.success ? (
            <p className="text-sm text-income sm:col-span-2">Override saved.</p>
          ) : null}
        </form>

        {overrides.length === 0 ? (
          <p className="mt-4 text-sm text-on-surface-variant">No overrides yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-outline-variant">
            {overrides.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-on-surface">
                    {overrideLabels[`${o.year}-${o.month}-${o.bucketNumber}`] ??
                      `Week ${o.bucketNumber} (${MONTH_NAMES[o.month - 1]} ${o.year})`}
                  </p>
                  <p className="text-sm text-on-surface-variant">
                    {MONTH_NAMES[o.month - 1]} {o.year} · override
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold text-on-surface">
                    {formatLKR(Number(o.amount))}
                  </span>
                  <form action={deleteAllowanceOverride}>
                    <input type="hidden" name="id" value={o.id} />
                    <button
                      type="submit"
                      className="text-sm font-medium text-expense hover:text-expense"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
