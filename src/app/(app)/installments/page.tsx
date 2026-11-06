import { getSupabase } from "@/lib/supabase";
import { formatLKR } from "@/lib/format";
import { getCategories } from "@/lib/dashboard";
import {
  createInstallment,
  deleteInstallment,
  holdInstallmentAction,
  logRecurringAction,
  unholdInstallmentAction,
} from "@/app/actions";

export const dynamic = "force-dynamic";

interface RecurringItem {
  id: string;
  name: string;
  amount: number;
  cycle: "monthly" | "yearly" | "weekly";
  type: "expense" | "income";
  category: string | null;
  next_due_date: string | null;
  held_for: string | null;
}

export default async function RecurringPage() {
  const supabase = getSupabase();
  const categories = await getCategories();

  const { data: installments } = await supabase
    .from("installments")
    .select("*")
    .order("created_at", { ascending: false });

  const list = (installments ?? []) as RecurringItem[];

  const today = new Date();
  const monthly = list
    .filter((i) => i.cycle === "monthly")
    .reduce((acc, i) => acc + Number(i.amount), 0);
  const yearly = list
    .filter((i) => i.cycle === "yearly")
    .reduce((acc, i) => acc + Number(i.amount), 0);
  const weekly = list
    .filter((i) => i.cycle === "weekly")
    .reduce((acc, i) => acc + Number(i.amount), 0);
  const monthlyEquivalent = monthly + yearly / 12 + weekly * (52 / 12);

  // Group categories by type for the dropdown (only income for an income item,
  // only expense for an expense item).
  const expenseCats = categories.filter((c) => c.type === "expense");
  const incomeCats = categories.filter((c) => c.type === "income");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-headline-md text-on-surface">Recurring</h1>
        <p className="text-sm text-on-surface-variant">
          {formatLKR(monthly)}/mo + {formatLKR(yearly)}/yr + {formatLKR(weekly)}/wk
          effective (~{formatLKR(monthlyEquivalent)}/mo)
        </p>
      </div>

      <form
        action={createInstallment}
        className="grid gap-3 rounded-xl border border-outline-variant p-5 sm:grid-cols-2"
      >
        <input
          type="text"
          name="name"
          required
          placeholder="Name (e.g. Netflix, Loan EMI, Weekly allowance)"
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary sm:col-span-2"
        />
        <input
          type="number"
          name="amount"
          required
          min="0"
          step="0.01"
          placeholder="Amount (LKR)"
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        />
        <select
          name="cycle"
          defaultValue="monthly"
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        >
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
        <select
          name="type"
          defaultValue="expense"
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        >
          <option value="expense">Expense (money out)</option>
          <option value="income">Income (money in)</option>
        </select>
        <select
          name="category"
          defaultValue=""
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary sm:col-span-2"
        >
          <option value="">Default for this type</option>
          {expenseCats.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
          {incomeCats.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
          Paid with
          <select
            name="account"
            defaultValue="cash"
            className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
          >
            <option value="cash">Cash in hand</option>
            <option value="bank">Card / Bank</option>
            <option value="savings">Savings</option>
          </select>
        </label>
        <input
          type="date"
          name="next_due_date"
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 sm:col-span-2"
        >
          Add recurring item
        </button>
      </form>

      {list.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          No recurring items yet. Add one above.
        </p>
      ) : (
        <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
          {list.map((inst) => {
            const due = inst.next_due_date
              ? new Date(`${inst.next_due_date}T00:00:00`)
              : null;
            const overdue = due && due < today;
            // A hold stays visible until the next occurrence comes around.
            const heldActive =
              !!inst.held_for && (due === null || due > today);
            const heldMonth = inst.held_for
              ? new Date(`${inst.held_for}T00:00:00`).toLocaleDateString(
                  "en",
                  { month: "short" }
                )
              : null;
            return (
              <li key={inst.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-on-surface">{inst.name}</p>
                    <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant capitalize">
                      {inst.cycle}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        inst.type === "income"
                          ? "bg-income/10 text-income"
                          : "bg-expense/10 text-expense"
                      }`}
                    >
                      {inst.type}
                    </span>
                    {inst.category ? (
                      <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant">
                        {inst.category}
                      </span>
                    ) : null}
                    {overdue ? (
                      <span className="rounded-full bg-expense/10 px-2 py-0.5 text-xs font-medium text-expense">
                        Overdue
                      </span>
                    ) : null}
                    {heldActive ? (
                      <span className="rounded-full bg-secondary-container px-2 py-0.5 text-xs font-medium text-on-secondary-container">
                        Held · {heldMonth}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-on-surface-variant">
                    {inst.next_due_date
                      ? `Next due ${inst.next_due_date}`
                      : "No due date set"}
                    {heldActive ? ` \u00b7 skipped ${heldMonth} (no txn logged)` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-on-surface">
                    {formatLKR(Number(inst.amount))}
                  </span>
                  {!heldActive && inst.next_due_date ? (
                    <form action={holdInstallmentAction}>
                      <input type="hidden" name="id" value={inst.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-outline-variant px-2 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-low active:bg-surface-container"
                      >
                        Hold this month
                      </button>
                    </form>
                  ) : null}
                  {heldActive ? (
                    <form action={unholdInstallmentAction}>
                      <input type="hidden" name="id" value={inst.id} />
                      <button
                        type="submit"
                        className="rounded-md px-2 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-low active:bg-surface-container"
                      >
                        Undo hold
                      </button>
                    </form>
                  ) : null}
                  <form action={logRecurringAction}>
                    <input type="hidden" name="id" value={inst.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70"
                    >
                      Log now
                    </button>
                  </form>
                  <form action={deleteInstallment}>
                    <input type="hidden" name="id" value={inst.id} />
                    <button
                      type="submit"
                      className="rounded-md px-2 py-1.5 text-sm text-expense hover:bg-expense/10 active:bg-expense/20"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
