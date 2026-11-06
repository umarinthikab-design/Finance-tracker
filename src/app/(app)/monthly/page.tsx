import Link from "next/link";
import { getMonthlyReport } from "@/lib/monthly";
import { formatLKR } from "@/lib/format";
import { MonthNavigator } from "./month-navigator";

export const dynamic = "force-dynamic";

export default async function MonthlyPage({
  searchParams,
}: PageProps<"/monthly">) {
  const params = await searchParams;
  const month = typeof params.month === "string" ? params.month : undefined;
  const report = await getMonthlyReport(month);

  const expensesSorted = Object.entries(report.expensesByCategory).sort(
    (a, b) => b[1] - a[1]
  );
  const incomeSorted = Object.entries(report.incomeByCategory).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-md">Monthly close-out</h1>
          <p className="text-sm text-on-surface-variant">
            {report.range.start} → {report.range.end}
          </p>
        </div>
        <MonthNavigator label={report.range.label} />
      </header>

      {report.needsReviewCount > 0 ? (
        <Link
          href="/review"
          className="rounded-xl border border-outline bg-surface-container-low px-4 py-3 text-sm font-medium text-on-surface hover:bg-surface-container active:bg-surface-container-high hover:border-outline-variant"
        >
          {report.needsReviewCount} unreviewed transaction
          {report.needsReviewCount === 1 ? "" : "s"} in this month — confirm them
          before relying on these numbers
        </Link>
      ) : null}

      {/* Totals */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label="Income"
          value={formatLKR(report.income)}
          delta={report.income - report.vsPrev.income}
          tone="green"
        />
        <StatCard
          label="Expenses"
          value={formatLKR(report.expenses)}
          delta={report.expenses - report.vsPrev.expenses}
          tone="red"
        />
        <StatCard
          label="Savings"
          value={formatLKR(report.savings)}
          delta={report.savings - report.vsPrev.savings}
          tone="blue"
        />
        <StatCard label="Balance" value={formatLKR(report.balance)} tone="neutral" />
      </section>

      {/* Balance allowance */}
      <section className="rounded-xl border border-outline-variant p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Balance allowance</h2>
          <span
            className={`text-2xl font-semibold ${
              report.allowanceBalance >= 0 ? "text-income" : "text-expense"
            }`}
          >
            {formatLKR(report.allowanceBalance)}
          </span>
        </div>
        <p className="mt-1 text-sm text-on-surface-variant">
          Allowance income {formatLKR(report.allowanceIncome)} - expenses{" "}
          {formatLKR(report.expenses)}
        </p>
      </section>

      {/* vs previous month */}
      <section className="rounded-xl border border-outline-variant p-5">
        <h2 className="font-medium">
          vs {report.prevRange.label.toLowerCase()}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <VsBlock
            label="Expenses"
            cur={report.expenses}
            prev={report.vsPrev.expenses}
          />
          <VsBlock
            label="Income"
            cur={report.income}
            prev={report.vsPrev.income}
          />
          <VsBlock
            label="Savings"
            cur={report.savings}
            prev={report.vsPrev.savings}
          />
        </div>
      </section>

      {/* Biggest merchants */}
      <section className="rounded-xl border border-outline-variant p-5">
        <h2 className="font-medium">Biggest merchants</h2>
        {report.topMerchants.length === 0 ? (
          <p className="mt-3 text-sm text-on-surface-variant">No merchant data yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-outline-variant">
            {report.topMerchants.map((m) => (
              <li
                key={m.merchant}
                className="flex items-center justify-between py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{m.merchant}</p>
                  <p className="text-xs text-on-surface-variant">
                    {m.count} transaction{m.count === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="text-sm font-medium">{formatLKR(m.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Category breakdown with deltas */}
      <section className="grid gap-4 sm:grid-cols-2">
        <CategoryCard
          title="Expenses by category"
          rows={expensesSorted}
          deltas={Object.fromEntries(
            report.categoryDeltas.map((d) => [d.category, d.delta])
          )}
        />
        <CategoryCard title="Income by category" rows={incomeSorted} />
      </section>

      {/* Allowance performance: real bucket dates + allocated + spend */}
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
        <h2 className="font-headline-sm text-headline-sm text-on-surface">
          Allowance performance
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Actual bucket date ranges for {report.range.label}, with allocated
          amounts (including overrides) and eligible spend.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {report.allowanceBuckets.map((b) => {
            const pct =
              b.allocated > 0
                ? Math.min(100, Math.round((b.spent / b.allocated) * 100))
                : 0;
            const remaining = Math.round((b.allocated - b.spent) * 100) / 100;
            const over = remaining < 0;
            return (
              <div
                key={b.bucketNumber}
                className={`rounded-lg border p-4 ${
                  b.isCurrent
                    ? "border-primary"
                    : "border-outline-variant"
                } bg-surface-container-lowest`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-on-surface">
                    Week {b.bucketNumber} (
                    {b.startDate.slice(8)}–{b.endDate.slice(8)}{" "}
                    {report.range.label.split(" ")[0].slice(0, 3)})
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      b.isCurrent
                        ? "bg-primary text-on-primary"
                        : "border border-outline-variant text-on-surface-variant"
                    }`}
                  >
                    {b.isCurrent ? "Current" : "Cleared"}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="font-mono text-sm font-medium text-expense">
                    {formatLKR(b.spent)}
                  </span>
                  <span className="font-mono text-sm text-on-surface-variant line-through">
                    {formatLKR(b.allocated)}
                  </span>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-container-high">
                  <div
                    className={`h-full ${over ? "bg-expense" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p
                  className={`mt-2 text-right text-xs ${
                    over
                      ? "text-expense"
                      : "text-on-surface-variant"
                  }`}
                >
                  {b.source === "override" ? "Override · " : ""}
                  {over
                    ? `Over by ${formatLKR(Math.abs(remaining))}`
                    : `${formatLKR(remaining)} remaining`}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-center text-xs text-on-surface-variant">
        {report.txnCount} transaction{report.txnCount === 1 ? "" : "s"} in{" "}
        {report.range.label}
      </p>
    </main>
  );
}

function StatCard({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta?: number;
  tone: "green" | "red" | "blue" | "neutral";
}) {
  const tones: Record<string, string> = {
    green: "text-income",
    red: "text-expense",
    blue: "text-secondary",
    neutral: "",
  };
  return (
    <div className="rounded-xl border border-outline-variant p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
        {label}
      </p>
      <p className={`mt-1 text-xl font-semibold ${tones[tone]}`}>{value}</p>
      {delta !== undefined && delta !== 0 ? (
        <p
          className={`mt-1 text-xs font-medium ${
            delta > 0
              ? "text-expense"
              : "text-income"
          }`}
        >
          {delta > 0 ? "+" : ""}
          {formatLKR(delta)} vs last month
        </p>
      ) : null}
    </div>
  );
}

function VsBlock({
  label,
  cur,
  prev,
}: {
  label: string;
  cur: number;
  prev: number;
}) {
  const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  const color =
    pct === null
      ? ""
      : pct > 0
        ? "text-expense"
        : "text-income";
  return (
    <div className="rounded-lg bg-surface-container-low p-3">
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className="text-base font-semibold">{formatLKR(cur)}</p>
      <p className={`text-xs font-medium ${color}`}>
        {pct === null
          ? "no prior data"
          : pct === 0
            ? "same as last month"
            : `${pct > 0 ? "+" : ""}${pct}%`}
      </p>
    </div>
  );
}

function CategoryCard({
  title,
  rows,
  deltas,
}: {
  title: string;
  rows: [string, number][];
  deltas?: Record<string, number>;
}) {
  const max = rows.length ? rows[0][1] : 0;
  return (
    <div className="rounded-xl border border-outline-variant p-5">
      <h2 className="font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-on-surface-variant">No activity</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map(([cat, amount]) => {
            const d = deltas?.[cat];
            return (
              <li key={cat}>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span>{cat}</span>
                    {d !== undefined && d !== 0 ? (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          d > 0
                            ? "bg-expense/10 text-expense"
                            : "bg-income/10 text-income"
                        }`}
                      >
                        {d > 0 ? "+" : ""}
                        {formatLKR(d)}
                      </span>
                    ) : null}
                  </div>
                  <span className="font-medium">{formatLKR(amount)}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: max > 0 ? `${(amount / max) * 100}%` : "0%" }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}