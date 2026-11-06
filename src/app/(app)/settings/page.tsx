import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export default async function SettingsPage() {
  await requireAuth();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-headline-md text-on-surface">Settings</h1>
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-lg font-semibold text-on-surface">Change password</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Used to sign in on this device and any other. Changing it here takes
          effect immediately — no redeploy needed.
        </p>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-lg font-semibold text-on-surface">Categories</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Add, rename (by re-adding), or remove transaction categories. Deleting a
          category in use is blocked until you reassign its transactions.
        </p>
        <div className="mt-3">
          <Link
            href="/settings/categories"
            className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70"
          >
            Manage categories
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-lg font-semibold text-on-surface">Allowance</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Set your default weekly allowance and one-off overrides for specific
          weeks. Computed weekly (Mon–Sun) — never logged as a transaction.
        </p>
        <div className="mt-3">
          <Link
            href="/settings/allowance"
            className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70"
          >
            Manage allowance
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-lg font-semibold text-on-surface">Merchant rules</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          What the system has learned from your corrections — merchants are
          auto-categorized in future SMS. Edit or delete any rule.
        </p>
        <div className="mt-3">
          <Link
            href="/settings/merchants"
            className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70"
          >
            Manage merchant rules
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-lg font-semibold text-on-surface">Card accounts</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Which physical debit card belongs to which account, so SMS purchases
          land on the right bucket instead of always the bank.
        </p>
        <div className="mt-3">
          <Link
            href="/settings/cards"
            className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70"
          >
            Manage card accounts
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-lg font-semibold text-on-surface">Opening balances</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Seed cash-in-hand / cash-in-bank starting balances for the dashboard
          current total balance.
        </p>
        <div className="mt-3 flex gap-3">
          <Link
            href="/settings/opening-balances"
            className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70"
          >
            Manage balances
          </Link>
        </div>
      </section>
    </main>
  );
}