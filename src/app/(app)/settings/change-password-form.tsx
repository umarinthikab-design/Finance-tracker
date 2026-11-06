"use client";

import { useActionState } from "react";
import { changePasswordAction, type FormState } from "@/app/actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    changePasswordAction,
    null
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-on-surface-variant">
        Current password
        <input
          type="password"
          name="current"
          required
          autoComplete="current-password"
          className="rounded-md border border-outline-variant px-3 py-2 text-base outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-on-surface-variant">
        New password
        <input
          type="password"
          name="new"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-outline-variant px-3 py-2 text-base outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-on-surface-variant">
        Confirm new password
        <input
          type="password"
          name="confirm"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-outline-variant px-3 py-2 text-base outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        />
      </label>
      {state?.error ? (
        <p className="text-sm text-expense">{state.error}</p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-income">Password updated.</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-60"
      >
        {pending ? "Updating…" : "Change password"}
      </button>
    </form>
  );
}