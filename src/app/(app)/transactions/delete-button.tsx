"use client";

import { deleteTransaction } from "@/app/actions";

export function DeleteTransactionButton({ id }: { id: string }) {
  return (
    <form
      action={deleteTransaction}
      onSubmit={(e) => {
        if (!window.confirm("Delete this transaction? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="from" value="transactions" />
      <button
        type="submit"
        className="rounded-md px-3 py-1.5 text-sm text-expense hover:bg-expense/10 active:bg-expense/20"
      >
        Delete
      </button>
    </form>
  );
}
