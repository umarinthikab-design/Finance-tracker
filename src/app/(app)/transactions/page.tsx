import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { formatLKR } from "@/lib/format";
import { getCategories } from "@/lib/dashboard";
import { TransactionEditForm } from "@/components/transaction-edit-form";
import { DeleteTransactionButton } from "./delete-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const VALID_TYPES = ["expense", "income", "savings", "transfer"];
const VALID_ACCOUNTS = ["cash", "bank", "savings"];

const PAGE_PARAM_KEYS = ["page", "from", "to", "type", "category", "account"] as const;

function buildPageHref(
  searchParams: Record<string, string | undefined>,
  page: number
): string {
  const params = new URLSearchParams();
  for (const k of PAGE_PARAM_KEYS) {
    const v = searchParams[k];
    if (v && !(k === "page" && page === 1)) params.set(k, k === "page" ? String(page) : v);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/transactions?${qs}` : "/transactions";
}

interface ListTxn {
  id: string;
  date: string;
  amount: number;
  type: "expense" | "income" | "savings" | "transfer";
  category: string | null;
  merchant: string | null;
  raw_text: string | null;
  source: string;
  account?: string | null;
  needs_review: boolean;
  title?: string | null;
  to_account?: string | null;
  counts_toward_allowance?: boolean | null;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const get = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  };

  const flat: Record<string, string | undefined> = {};
  for (const k of PAGE_PARAM_KEYS) flat[k] = get(k);

  const page = Math.max(1, Number(flat.page ?? 1) || 1);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(flat.from ?? "") ? flat.from : undefined;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(flat.to ?? "") ? flat.to : undefined;
  const type = VALID_TYPES.includes(flat.type ?? "") ? flat.type : undefined;
  const account = VALID_ACCOUNTS.includes(flat.account ?? "") ? flat.account : undefined;
  const category = flat.category;

  const supabase = getSupabase();

  let countQuery = supabase
    .from("transactions")
    .select("id", { count: "exact", head: true });
  if (from) countQuery = countQuery.gte("date", from);
  if (to) countQuery = countQuery.lte("date", to);
  if (type) countQuery = countQuery.eq("type", type);
  if (account) countQuery = countQuery.eq("account", account);
  if (category) countQuery = countQuery.eq("category", category);

  const { count } = await countQuery;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  let listQuery = supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE - 1);
  if (from) listQuery = listQuery.gte("date", from);
  if (to) listQuery = listQuery.lte("date", to);
  if (type) listQuery = listQuery.eq("type", type);
  if (account) listQuery = listQuery.eq("account", account);
  if (category) listQuery = listQuery.eq("category", category);

  const [{ data: rows }, categories] = await Promise.all([
    listQuery,
    getCategories(true),
  ]);
  const list = (rows ?? []) as ListTxn[];

  const hasFilters = !!(from || to || type || account || category);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-headline-md text-on-surface">
          All transactions
        </h1>
        <p className="text-sm text-on-surface-variant">
          {total} transaction{total === 1 ? "" : "s"}
          {hasFilters ? " matching filters" : ""} — edit or delete anything,
          anytime.
        </p>
      </div>

      {/* Filters — plain GET form, query params drive the server query */}
      <form
        method="get"
        className="grid grid-cols-1 gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:grid-cols-3"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
          From
          <input
            type="date"
            name="from"
            defaultValue={from ?? ""}
            className="rounded-md border border-outline-variant px-2.5 py-1.5 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
          To
          <input
            type="date"
            name="to"
            defaultValue={to ?? ""}
            className="rounded-md border border-outline-variant px-2.5 py-1.5 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
          Type
          <select
            name="type"
            defaultValue={type ?? ""}
            className="rounded-md border border-outline-variant px-2.5 py-1.5 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
          >
            <option value="">Any</option>
            {VALID_TYPES.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
          Account
          <select
            name="account"
            defaultValue={account ?? ""}
            className="rounded-md border border-outline-variant px-2.5 py-1.5 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
          >
            <option value="">Any</option>
            <option value="cash">Cash</option>
            <option value="bank">Card / Bank</option>
            <option value="savings">Savings</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
          Category
          <select
            name="category"
            defaultValue={category ?? ""}
            className="rounded-md border border-outline-variant px-2.5 py-1.5 text-sm outline-none bg-surface-container-lowest text-on-surface focus:border-primary"
          >
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
          <button
            type="submit"
            className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary hover:opacity-90 active:opacity-70"
          >
            Apply
          </button>
          {hasFilters ? (
            <Link
              href="/transactions"
              className="rounded-md px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {list.length === 0 ? (
        <p className="rounded-xl border border-outline-variant p-5 text-sm text-on-surface-variant">
          No transactions found.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((t) => {
            const label =
              t.title ??
              t.merchant ??
              (t.raw_text && t.source === "manual" ? t.raw_text : null) ??
              t.raw_text ??
              "(no description)";
            const subtitle = t.title && t.merchant ? t.merchant : null;
            return (
              <li
                key={t.id}
                className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-on-surface">
                        {label}
                      </span>
                      {t.needs_review ? (
                        <span className="rounded-full bg-surface-container-high text-on-surface-variant px-2 py-0.5 text-xs font-medium">
                          Needs review
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          t.type === "expense"
                            ? "bg-expense/10 text-expense"
                            : t.type === "income"
                              ? "bg-income/10 text-income"
                              : t.type === "transfer"
                                ? "bg-surface-container-highest text-on-surface-variant"
                                : "bg-secondary-container text-secondary"
                        }`}
                      >
                        {t.type}
                      </span>
                      <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant">
                        {t.to_account ? `${t.account === "savings" ? "Savings" : t.account === "bank" ? "Bank" : "Cash"} -> ${t.to_account === "savings" ? "Savings" : t.to_account === "bank" ? "Bank" : "Cash"}` : t.account === "savings" ? "Savings" : t.account === "bank" ? "Bank" : "Cash"}
                      </span>
                      <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant uppercase">
                        {t.source}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      {t.date}
                      {subtitle ? ` · ${subtitle}` : ""}
                      {t.category ? ` · ${t.category}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span
                      className={`text-lg font-semibold ${
                        t.type === "income"
                          ? "text-income"
                          : ""
                      }`}
                    >
                      {formatLKR(Number(t.amount))}
                    </span>
                    <DeleteTransactionButton id={t.id} />
                  </div>
                </div>
                <TransactionEditForm
                  transaction={{
                    id: t.id,
                    date: t.date,
                    amount: Number(t.amount),
                    type: t.type,
                    category: t.category ?? "",
                    merchant: t.merchant,
                    account: t.account,
                    to_account: t.to_account,
                    title: t.title,
                    counts_toward_allowance: t.counts_toward_allowance,
                  }}
                  categories={categories}
                  isNewMerchant={false}
                />
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          {safePage > 1 ? (
            <Link
              href={buildPageHref(flat, safePage - 1)}
              className="rounded-full border border-outline-variant px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-on-surface-variant">
            Page {safePage} of {totalPages}
          </span>
          {safePage < totalPages ? (
            <Link
              href={buildPageHref(flat, safePage + 1)}
              className="rounded-full border border-outline-variant px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </main>
  );
}
