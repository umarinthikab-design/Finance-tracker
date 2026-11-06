import { getSupabase } from "@/lib/supabase";
import { formatLKR } from "@/lib/format";
import { createInvestment, deleteInvestment } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const supabase = getSupabase();
  const { data: investments } = await supabase
    .from("investments")
    .select("*")
    .order("date", { ascending: false });

  const list = (investments ?? []) as {
    id: string;
    name: string;
    amount: number;
    date: string;
    notes: string | null;
  }[];

  const total = list.reduce((acc, i) => acc + Number(i.amount), 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-headline-md">Investments</h1>
        <span className="text-lg font-medium">{formatLKR(total)} total</span>
      </div>

      <form
        action={createInvestment}
        className="grid gap-3 rounded-xl border border-outline-variant p-5 sm:grid-cols-2"
      >
        <input
          type="text"
          name="name"
          required
          placeholder="Name (e.g. Unit Trust, Gold)"
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
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
        <input
          type="date"
          name="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        />
        <input
          type="text"
          name="notes"
          placeholder="Notes (optional)"
          className="rounded-md border border-outline-variant px-3 py-2 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 sm:col-span-2"
        >
          Add investment
        </button>
      </form>

      {list.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No investments recorded yet.</p>
      ) : (
        <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant">
          {list.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center justify-between p-4"
            >
              <div>
                <p className="font-medium">{inv.name}</p>
                <p className="mt-0.5 text-sm text-on-surface-variant">
                  {inv.date}
                  {inv.notes ? ` · ${inv.notes}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">{formatLKR(Number(inv.amount))}</span>
                <form action={deleteInvestment}>
                  <input type="hidden" name="id" value={inv.id} />
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