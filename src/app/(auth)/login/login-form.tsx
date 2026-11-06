"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    loginAction,
    null
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Password
        <input
          type="password"
          name="password"
          required
          autoFocus
          className="rounded-md border border-outline-variant px-3 py-2 text-base outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
        />
      </label>
      {state?.error ? (
        <p className="text-sm text-expense">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}