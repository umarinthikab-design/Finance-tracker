import Link from "next/link";
import {
  getDashboardSummary,
  getRecentTransactions,
  type Period,
} from "@/lib/dashboard";
import { formatLKR } from "@/lib/format";
import {
  getSmsHeartbeat,
  SMS_SILENCE_THRESHOLD_HOURS,
  formatHeartbeatAge,
} from "@/lib/sms-health";
import { PeriodSwitcher } from "./period-switcher";
import { ExportCsv } from "./export-csv";
import { ReviewBadge } from "./review-badge";
import { AnimatedNumber } from "@/components/animated-number";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: PageProps<"/">) {
  const params = await searchParams;
  const period: Period =
    params.period === "week" ? "week" : params.period === "year" ? "year" : "month";

  const summary = await getDashboardSummary(period);
  const recent = await getRecentTransactions(8);
  const smsHealth = await getSmsHeartbeat();

  const expensesSorted = Object.entries(summary.expensesByCategory).sort(
    (a, b) => b[1] - a[1]
  );
  const incomeSorted = Object.entries(summary.incomeByCategory).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-md">Dashboard</h1>
          <p className="text-sm text-on-surface-variant">
            {summary.label} · {summary.start} → {summary.end}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PeriodSwitcher period={period} />
        </div>
      </header>

      <section className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
          Export
        </p>
        <ExportCsv />
      </section>

      {summary.needsReviewCount > 0 ? (
        <Link
          href="/review"
          className="rounded-xl border border-outline bg-surface-container-low px-4 py-3 text-sm font-medium text-on-surface hover:bg-surface-container active:bg-surface-container-high hover:border-outline-variant"
        >
          {summary.needsReviewCount} transaction
          {summary.needsReviewCount === 1 ? "" : "s"} need review
        </Link>
      ) : null}

      {smsHealth.lastSmsAt !== null && smsHealth.hoursSince !== null &&
      smsHealth.hoursSince > SMS_SILENCE_THRESHOLD_HOURS ? (
        <Link
          href="/api/sms-health"
          className="rounded-xl border border-expense/40 bg-expense/10 px-4 py-3 text-sm font-medium text-expense hover:bg-expense/15 active:bg-expense/20"
        >
          No bank SMS auto-captured for {formatHeartbeatAge(smsHealth.hoursSince)} — the phone’s SMS forwarder may have stopped. Check details.
        </Link>
      ) : null}

      {/* Totals */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <StatCard label="Income" value={summary.income} tone="green" />
        <StatCard label="Expenses" value={summary.expenses} tone="red" />
        <StatCard label="Savings" value={summary.savings} tone="blue" />
        <StatCard label="Balance" value={summary.balance} tone="neutral" />
      </section>

      {summary.currentTotalBalance !== null ? (
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium text-on-surface">Current total balance</h2>
            <span className="text-2xl font-semibold text-on-surface">
              <AnimatedNumber value={summary.currentTotalBalance} />
            </span>
          </div>
          {summary.cashBalance !== null && summary.bankBalance !== null ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                  Cash in hand
                </p>
                <p className="mt-1 text-lg font-semibold text-on-surface">
                  <AnimatedNumber value={summary.cashBalance} />
                </p>
                {summary.allowanceCashLeft !== null ? (
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Allowance left{" "}
                    <span
                      className={`font-medium ${
                        summary.allowanceCashLeft < 0
                          ? "text-expense"
                          : "text-on-surface-variant"
                      }`}
                    >
                      <AnimatedNumber value={summary.allowanceCashLeft} />
                    </span>
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg border border-outline-variant bg-secondary-container p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-on-secondary-container">
                  Bank
                </p>
                <p className="mt-1 text-lg font-semibold text-on-surface">
                  <AnimatedNumber value={summary.bankBalance} />
                </p>
                {summary.allowanceBankLeft !== null ? (
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Allowance left{" "}
                    <span
                      className={`font-medium ${
                        summary.allowanceBankLeft < 0
                          ? "text-expense"
                          : "text-on-surface-variant"
                      }`}
                    >
                      <AnimatedNumber value={summary.allowanceBankLeft} />
                    </span>
                  </p>
                ) : null}
              </div>
              {summary.savingsBalance !== null ? (
                <div className="rounded-lg border border-savings bg-savings-container p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-on-savings-container">
                    Savings
                  </p>
                  <p className="mt-1 text-lg font-semibold text-on-surface">
                    <AnimatedNumber value={summary.savingsBalance} />
                  </p>
                  {summary.allowanceCashLeft !== null && summary.allowanceBankLeft !== null ? (
                    <p className="mt-1 text-xs text-on-surface-variant">
                      Allowance left (combined){" "}
                      <span
                        className={`font-medium ${
                          summary.allowanceCashLeft + summary.allowanceBankLeft < 0
                            ? "text-expense"
                            : "text-on-surface-variant"
                        }`}
                      >
                        <AnimatedNumber
                          value={
                            Math.round(
                              (summary.allowanceCashLeft + summary.allowanceBankLeft) * 100
                            ) / 100
                          }
                        />
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="hidden sm:block" />
              )}
            </div>
          ) : null}
          <p className="mt-2 text-sm text-on-surface-variant">
            Opening balances plus net transaction flow since your earliest
            opening-balance date.
          </p>
        </section>
      ) : (
        <section className="rounded-xl border border-outline-variant bg-surface-container-low p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium text-on-surface">Current total balance</h2>
            <span className="text-sm text-on-surface-variant">
              No opening balances seeded yet
            </span>
          </div>
          <p className="mt-1 text-sm text-on-surface-variant">
            <a
              className="text-primary underline"
              href="/settings/opening-balances"
            >
              Add opening balances
            </a>{" "}
            to track your real total balance.
          </p>
        </section>
      )}

      {/* Balance allowance */}
      <section className="rounded-xl border border-outline-variant p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Balance allowance</h2>
          <span
            className={`text-2xl font-semibold ${
              summary.allowanceBalance >= 0 ? "text-income" : "text-expense"
            }`}
          >
            <AnimatedNumber value={summary.allowanceBalance} />
          </span>
        </div>
        <p className="mt-1 text-sm text-on-surface-variant">
          Allowance income {formatLKR(summary.allowanceIncome)} - expenses{" "}
          {formatLKR(summary.expenses)}
        </p>
      </section>

      {/* Projected savings */}
      {period === "month" && summary.projectedMonthlyExpenses !== null && (
        <section className="rounded-xl border border-outline-variant p-5">
          <h2 className="font-medium">Projected for this month</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-on-surface-variant">Projected expenses</p>
              <p className="text-lg font-medium">
                {formatLKR(summary.projectedMonthlyExpenses)}
              </p>
            </div>
            <div>
              <p className="text-on-surface-variant">Projected savings</p>
              <p className="text-lg font-medium">
                {formatLKR(summary.projectedMonthlySavings ?? 0)}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Month-by-month breakdown (year view only) */}
      {period === "year" && summary.months.length > 0 ? (
        <section className="rounded-xl border border-outline-variant p-5">
          <h2 className="font-medium">Month by month</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Each month through the existing monthly report — allowance figures
            use the rate that was active that month.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-on-surface-variant">
                  <th className="py-1 pr-3 font-medium">Month</th>
                  <th className="py-1 pr-3 text-right font-medium">Income</th>
                  <th className="py-1 pr-3 text-right font-medium">Expenses</th>
                  <th className="py-1 pr-3 text-right font-medium">Savings</th>
                  <th className="py-1 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {summary.months.map((m) => (
                  <tr key={m.month} className="tabular-nums">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-on-surface">{m.label}</span>
                      {m.needsReviewCount > 0 ? (
                        <span className="ml-2 rounded-full bg-surface-container-high px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant">
                          {m.needsReviewCount} review
                          {m.needsReviewCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right text-income">
                      {formatLKR(m.income)}
                    </td>
                    <td className="py-2 pr-3 text-right text-expense">
                      {formatLKR(m.expenses)}
                    </td>
                    <td className="py-2 pr-3 text-right text-secondary">
                      {formatLKR(m.savings)}
                    </td>
                    <td className="py-2 text-right text-on-surface">
                      {formatLKR(m.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Category breakdown */}
      <section className="grid gap-4 sm:grid-cols-2">
        <CategoryCard title="Expenses by category" rows={expensesSorted} />
        <CategoryCard title="Income by category" rows={incomeSorted} />
      </section>

      {/* Recent transactions */}
      <section className="rounded-xl border border-outline-variant p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Recent transactions</h2>
          <Link href="/add" className="text-sm font-medium text-primary hover:underline active:underline">
            Add new
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-on-surface-variant">
            No transactions yet. Use “Add new” to record your first one.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-outline-variant">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      t.type === "expense"
                        ? "bg-expense"
                        : t.type === "income"
                          ? "bg-income"
                          : "bg-secondary"
                    }`}
                  />
                  <div>
                    <p className="text-sm font-medium">
                      {t.category ?? "Uncategorized"}
                      {t.needs_review && <ReviewBadge />}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {t.date}
                      {t.title ? ` · ${t.title}` : ""}
                      {t.raw_text ? ` · ${t.raw_text}` : ""}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-sm font-medium ${
                    t.type === "expense" ? "text-expense" : "text-income"
                  }`}
                >
                  {t.type === "expense" ? "-" : "+"}
                  {formatLKR(Number(t.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
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
      <p className={`mt-1 text-xl font-semibold ${tones[tone]}`}>
        <AnimatedNumber value={value} />
      </p>
    </div>
  );
}

function CategoryCard({
  title,
  rows,
}: {
  title: string;
  rows: [string, number][];
}) {
  const max = rows.length ? rows[0][1] : 0;
  return (
    <div className="rounded-xl border border-outline-variant p-5">
      <h2 className="font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-on-surface-variant">No activity</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map(([cat, amount]) => (
            <li key={cat}>
              <div className="flex items-center justify-between text-sm">
                <span>{cat}</span>
                <span className="font-medium">{formatLKR(amount)}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: max > 0 ? `${(amount / max) * 100}%` : "0%" }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}