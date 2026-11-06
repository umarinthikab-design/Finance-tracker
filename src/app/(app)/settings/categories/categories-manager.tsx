"use client";

import { useActionState } from "react";
import {
  createCategoryAction,
  deleteCategoryAction,
  toggleCategoryVisibilityAction,
  toggleCategoryCountsAction,
  type FormState,
} from "@/app/actions";
import type { Category } from "@/lib/dashboard";

const TYPE_OPTIONS = ["expense", "income", "savings"] as const;

export function CategoriesManager({
  initial,
}: {
  initial: Category[];
}) {
  const [createState, createAction, creating] = useActionState<FormState, FormData>(
    createCategoryAction,
    null
  );
  const [deleteState, deleteAction, deleting] = useActionState<FormState, FormData>(
    deleteCategoryAction,
    null
  );
  const [toggleState, toggleAction, toggling] = useActionState<FormState, FormData>(
    toggleCategoryVisibilityAction,
    null
  );
  const [countsState, countsAction, togglingCounts] = useActionState<
    FormState,
    FormData
  >(toggleCategoryCountsAction, null);

  const visible = initial.filter((c) => !c.hidden);
  const hidden = initial
    .filter((c) => c.hidden)
    .sort((a, b) => a.name.localeCompare(b.name));

  const byType = (type: (typeof TYPE_OPTIONS)[number]) =>
    visible.filter((c) => c.type === type).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-semibold text-on-surface">Add a category</h3>
        <form action={createAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-on-surface-variant">
            Name
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Groceries"
              className="w-full rounded-md border border-outline-variant px-3 py-2 text-base outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-on-surface-variant">
            Type
            <select
              name="type"
              required
              className="w-full rounded-md border border-outline-variant px-3 py-2 text-base outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-60"
          >
            {creating ? "Adding…" : "Add"}
          </button>
        </form>
        {createState?.error ? (
          <p className="mt-2 text-sm text-expense">{createState.error}</p>
        ) : null}
        {createState?.success ? (
          <p className="mt-2 text-sm text-income">Category added.</p>
        ) : null}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-on-surface">Existing categories</h3>
        {visible.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">No categories yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-6">
            {TYPE_OPTIONS.map((type) => {
              const rows = byType(type);
              if (rows.length === 0) return null;
              return (
                <div key={type}>
                  <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                    {type}
                  </p>
                  <ul className="mt-1 divide-y divide-outline-variant rounded-lg border border-outline-variant">
                    {rows.map((c) => (
                      <li
                        key={c.name}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <span className="text-on-surface-variant">{c.name}</span>
                        <div className="flex items-center gap-1">
                          <form action={countsAction}>
                            <input type="hidden" name="name" value={c.name} />
                            <button
                              type="submit"
                              disabled={togglingCounts}
                              title="Counts toward weekly allowance — click to toggle"
                              className={`rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${
                                c.counts_toward_allowance !== false
                                  ? "text-income hover:bg-income/10 active:bg-income/20"
                                  : "text-outline hover:bg-surface-container active:bg-surface-container-high"
                              }`}
                            >
                              {c.counts_toward_allowance !== false
                                ? "Allowance ✓"
                                : "No allowance"}
                            </button>
                          </form>
                          <form action={toggleAction}>
                            <input type="hidden" name="name" value={c.name} />
                            <button
                              type="submit"
                              disabled={toggling}
                              className="rounded-md px-2.5 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high disabled:opacity-60"
                            >
                              {toggling ? "…" : "Hide"}
                            </button>
                          </form>
                          <form action={deleteAction}>
                            <input type="hidden" name="name" value={c.name} />
                            <button
                              type="submit"
                              disabled={deleting}
                              className="rounded-md px-2.5 py-1 text-xs font-medium text-expense hover:bg-expense/10 active:bg-expense/20 disabled:opacity-60"
                            >
                              {deleting ? "Removing…" : "Delete"}
                            </button>
                          </form>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {deleteState?.error ? (
          <p className="mt-2 text-sm text-expense">{deleteState.error}</p>
        ) : null}
        {deleteState?.success ? (
          <p className="mt-2 text-sm text-income">Category removed.</p>
        ) : null}
      </section>

      {hidden.length > 0 ? (
        <section>
          <details>
            <summary className="cursor-pointer select-none text-sm font-semibold text-on-surface-variant">
              Hidden ({hidden.length})
            </summary>
            <ul className="mt-2 divide-y divide-outline-variant rounded-lg border border-dashed border-outline-variant bg-surface-container-low">
              {hidden.map((c) => (
                <li
                  key={c.name}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2 text-outline">
                    {c.name}
                    <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                      {c.type}
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    <form action={toggleAction}>
                      <input type="hidden" name="name" value={c.name} />
                      <button
                        type="submit"
                        disabled={toggling}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high disabled:opacity-60"
                      >
                        {toggling ? "…" : "Unhide"}
                      </button>
                    </form>
                    <form action={deleteAction}>
                      <input type="hidden" name="name" value={c.name} />
                      <button
                        type="submit"
                        disabled={deleting}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-expense hover:bg-expense/10 active:bg-expense/20 disabled:opacity-60"
                      >
                        {deleting ? "Removing…" : "Delete"}
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      {toggleState?.error ? (
        <p className="text-sm text-expense">{toggleState.error}</p>
      ) : null}
      {countsState?.error ? (
        <p className="text-sm text-expense">{countsState.error}</p>
      ) : null}
    </div>
  );
}
