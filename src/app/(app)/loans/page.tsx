import { getSupabase } from "@/lib/supabase";
import { formatLKR } from "@/lib/format";
import { createLoan, deleteLoan, updateLoanPaid } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function LoansPage() {
  const supabase = getSupabase();
  const { data: loans } = await supabase
    .from("loans")
    .select("*")
    .order("created_at", { ascending: false });

  const list = (loans ?? []) as {
    id: string;
    counterparty: string;
    direction: "payable" | "receivable";
    total_amount: number;
    paid: number;
    balance: number;
    notes: string | null;
  }[];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-headline-md">Loans</h1>

      <form
        action={createLoan}
        className="grid gap-3 rounded-xl border border-outline-variant p-5 sm:grid-cols-2"
      >
        <input
          type="text"
          name="counterparty"
          required
          placeholder="Counterparty"
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        />
        <select
          name="direction"
          defaultValue="payable"
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        >
          <option value="payable">I owe them (payable)</option>
          <option value="receivable">They owe me (receivable)</option>
        </select>
        <input
          type="number"
          name="total_amount"
          required
          min="0"
          step="0.01"
          placeholder="Total amount (LKR)"
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        />
        <input
          type="number"
          name="paid"
          min="0"
          step="0.01"
          placeholder="Already paid (0)"
          defaultValue={0}
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        />
        <input
          type="text"
          name="notes"
          placeholder="Notes (optional)"
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary sm:col-span-2"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 sm:col-span-2"
        >
          Add loan
        </button>
      </form>

      {list.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No loans recorded yet.</p>
      ) : (
        <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
          {list.map((loan) => (
            <li key={loan.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{loan.counterparty}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      loan.direction === "receivable"
                        ? "bg-income/10 text-income"
                        : "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    {loan.direction === "receivable" ? "Receivable" : "Payable"}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-on-surface-variant">
                  {formatLKR(loan.balance)} remaining of {formatLKR(loan.total_amount)}
                  {loan.notes ? ` · ${loan.notes}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <form action={updateLoanPaid} className="flex items-center gap-1.5">
                  <input type="hidden" name="id" value={loan.id} />
                  <input
                    type="number"
                    name="paid"
                    min="0"
                    step="0.01"
                    defaultValue={loan.paid}
                    className="w-28 rounded-md border border-outline-variant px-2 py-1.5 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-outline-variant px-2 py-1.5 text-sm hover:bg-surface-container-low active:bg-surface-container"
                  >
                    Log payment
                  </button>
                </form>
                <form action={deleteLoan}>
                  <input type="hidden" name="id" value={loan.id} />
                  <button
                    type="submit"
                    className="rounded-md px-2 py-1.5 text-sm text-expense hover:bg-expense/10 active:bg-expense/20"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}