"use client";

import { useActionState } from "react";
import { confirmTransaction } from "@/app/actions";

export function ConfirmButton({
  id,
  category,
}: {
  id: string;
  category: string | null;
}) {
  const [state, action, pending] = useActionState(confirmTransaction, null);

  // Confirm is meaningless while the category is missing/generic — the
  // merchant learner would propagate bad categorization otherwise.
  const blocked =
    !category || category === "Other" || category === "Other Income";

  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={blocked || pending}
        title={
          blocked
            ? "Set a real category first (use Correct details below)"
            : undefined
        }
        className={`rounded-md px-3 py-1.5 text-sm font-medium text-on-primary ${
          blocked
            ? "cursor-not-allowed bg-surface-container-highest"
            : "bg-primary hover:opacity-90 active:opacity-70"
        }`}
      >
        {pending ? "Confirming…" : "Confirm"}
      </button>
      {state?.error ? (
        <p className="max-w-[11rem] text-xs text-expense">{state.error}</p>
      ) : null}
    </form>
  );
}