# finance-tracker

A personal finance tracker: manual entry + SMS-parsed bank alerts, an
allowance/budget system with historical rate tracking, loan and installment
ledgers, and monthly/yearly reporting.

## Stack

- **Next.js App Router** (v16, TypeScript, React 19), deployed on **Vercel**
  via GitHub.
- **Supabase** (Postgres) as the only datastore. No Supabase Auth — the app
  has a single password gate (`src/lib/auth.ts`, bcrypt hash in
  `app_settings`, signed session cookie). All DB access happens server-side
  with the **service role key** (`src/lib/supabase.ts`); RLS is intentionally
  disabled since nothing reaches Supabase from the client.
- **Currency**: LKR only, formatted via `formatLKR` (`src/lib/format.ts`) —
  always `Rs 1,234.56`, exactly 2 decimals. Don't reintroduce conditional
  decimal display (e.g. hiding `.00`).
- **Timezone**: `Asia/Colombo` (UTC+5:30, no DST) everywhere a "what day is
  it" decision matters — server clocks (Vercel) run UTC. Always go through
  `src/lib/timezone.ts` (`todayISOInColombo()`, `nowInColombo()`), never
  `new Date()` / server-locale defaults, for anything date-boundary-sensitive
  (which bucket a transaction falls in, what "today" is for a due date).

## Server actions (`src/app/actions.ts`)

This is a single `"use server"` file holding every mutation in the app
(transactions, loans, installments, investments, allowance settings/cycle/
overrides, categories, merchants, card accounts, password change).

**Every mutating action calls `assertAuthed()` as its first statement.**
This is the only authorization check in the app — there's no middleware and
no RLS — so it is load-bearing, not boilerplate. Any new server action you
add must call `await assertAuthed();` before doing anything else. It throws
`Error("Unauthorized")` rather than redirecting, so don't rely on
`redirect()` to guard a mutation.

Because the file has `"use server"` at the top, **every top-level export
must be an async function** (a Next.js server-action constraint) — a
synchronous helper cannot be exported from here. Pure/synchronous logic that
needs to be unit-tested (like the date math below) lives in `src/lib/` and is
imported into `actions.ts`, not defined inline.

### Recurring installment date math (`src/lib/recurrence.ts`)

`advanceDueDate(baseISO, cycle, anchorDay)` and its monthly/yearly helper
`addMonthsClamped(y, m, d, n)` advance a due date by one cycle. The
non-obvious part: they advance from the item's stored **anchor day**
(`installments.anchor_day`), not from the day-of-month of the current
occurrence. This prevents drift — e.g. a monthly item anchored on the 31st
that gets clamped to Feb 28 must jump back to Mar 31 next cycle, not Mar 28.
If you touch this logic, keep passing the anchor day through rather than
re-deriving it from the (possibly already-clamped) current due date.

## Allowance history model (`src/lib/allowance.ts`)

`allowance_settings` is an **append-only log** of `{ default_weekly_amount,
effective_from }` rows — it is a history, not a single mutable row.
`getActiveAllowanceSetting(asOfDate)` resolves the rate in effect on a given
date as "the most recent row with `effective_from <= asOfDate`".

**Never update an existing row's `amount`** unless its `effective_from` is
today — doing so silently rewrites every historical report that resolved
through that row. Changing a past or future rate means **inserting a new
row** dated `effective_from`. (The one exception, `updateAllowanceDefault`
in `actions.ts`, updates in place only when the existing row's
`effective_from` is today, matching this rule rather than bypassing it.)

`computeBuckets(config, year, month)` turns the 4 configured weekly buckets
(`allowance_cycle_config`) into concrete calendar date ranges for one month,
clamping each `startDay` to that month's length — this is where
February/leap-year handling lives. `getAllowanceForRange(start, end)`
resolves a possibly multi-month range by walking month-by-month, resolving
each month's rate independently (as of that month's last day) and prorating
partial bucket overlap by days — so a rate change mid-range only affects the
months on or after it took effect.

## Loan ledger delta logic (`src/lib/ledger.ts`)

`logLoanPayment({ loanId, newPaid })` logs **only the incremental change**
(`newPaid - oldPaid`) as a transaction each time it's called — never the full
`paid` amount. Logging the full amount on every update would double- (or
triple-, or quadruple-) count every prior payment. When the delta is
negative (a correction), it logs a **reversal transaction of the opposite
type** for `abs(delta)` (e.g. correcting a payable loan's `paid` downward
logs `income`, not a negative expense) — do not special-case negative deltas
as "no-ops" or skip logging them. A delta of exactly `0` logs nothing at all.

There is no separate loan-payment-history table; the transaction log
(`transactions` where `category = "Loans"`) *is* the history, so getting the
delta math right here is the only thing keeping loan totals from silently
drifting out of sync with the transaction ledger.

## SMS pipeline

1. **Regex rules first** (`src/lib/sms/rules.ts`): an ordered list of
   `SmsRule`s, each gated on a sender substring match, tried in order; first
   matching pattern wins. Rules carry their own `confidence`.
2. **LLM fallback below 0.85 confidence** (`src/lib/sms/llm.ts`, wired in
   `src/lib/sms/process.ts`): if regex found nothing, or found something with
   `confidence < 0.85`, `parseWithLLM` is called and the results merged
   (LLM fields preferred; falls back to the regex parse for fields the LLM
   missed).
3. The LLM call has a **hard timeout via `AbortController`**
   (`LLM_TIMEOUT_MS = 5000`, in `llm.ts`). This exists specifically to keep
   the `/api/sms-webhook` response time bounded — a slow response has
   previously caused the sending phone (MacroDroid forwarding a real bank
   SMS) to give up and lose the message entirely, which is far worse than a
   low-confidence parse landing in the review queue. **Don't remove or
   loosen this timeout** without understanding that tradeoff; if you need a
   longer LLM budget, the fix is to make the webhook return faster
   independently of the LLM call, not to extend the abort deadline.

### Card-to-account mapping (`card_accounts`)

SMS purchases that carry a card number route to the correct `account`
(`cash` | `bank` | `savings`) by matching the card's last 4 digits against
the `card_accounts` table (managed at Settings → Card accounts). No card
number, or a card number with no mapping row, falls back to `"bank"` — the
long-standing default before this table existed. The lookup
(`resolveAccountForCard` in `src/lib/sms/process.ts`, and
`src/lib/card-accounts.ts` for the settings UI) is tolerant of the table not
existing yet (Postgres error code `42P01`), so don't remove that guard
casually. `resolveAccountForCard` itself lives in `card-accounts.ts` (moved
there from `process.ts`) specifically so both the normal purchase-insert
flow and the cancellation flow below can share it.

### Card-transaction cancellations (`sms_cancellations`)

A cancellation SMS ("YOUR TRANSACTION AT UBER ON YOUR CARD ENDING WITH 8662
HAS BEEN CANCELLED") carries no amount and often no date — it can never be
parsed as a transaction, so it's matched via a rule with `kind:
"cancellation"` (`src/lib/sms/rules.ts`) and routed *before* the normal
amount/type parsing in `process.ts`, straight to
`src/lib/sms/cancellation.ts`. It is never auto-deleted or auto-inserted as
anything — it only ever produces a pending row in `sms_cancellations`,
resolved from the Review page (`src/app/(app)/review/cancellation-review.tsx`,
actions `removeCancelledCharge`/`ignoreCancellationNotice` in `actions.ts`).

Matching (`findCancellationCandidates`) narrows by `type = "expense"`,
`source = "sms"`, the resolved `account`, and a
`CANCELLATION_MATCH_WINDOW_HOURS` (24h) recency window at the SQL level,
then fuzzy-matches merchant in JS via `merchantsMatch`
(`src/lib/merchant.ts` — the same word-boundary rule `getLearnedCategory`
uses, exposed as a plain boolean so a short cancellation merchant like
"UBER" matches a fuller stored one like "UBER 852 LK"). Above
`MAX_CANCELLATION_CANDIDATES` (5) matches, nothing is listed — the entry is
flagged `too_many_matches` instead, since that many hits usually means the
matching logic itself needs attention, not the user.

On "Remove this charge," the matched transaction is genuinely deleted (same
as `deleteTransaction` — a cancelled charge was never a real financial
event, unlike a loan-payment correction, so there's no reversal entry to
preserve) and the removal is recorded via `logActivity`
(`src/lib/activity.ts`, backed by `activity_log`) — the only place left to
answer "why is this transaction missing?" once the row itself is gone.
`logActivity` didn't exist before this feature; it's a small, generic,
tolerant-of-missing-table helper in the same style as the rest of this file.

## Allowance-eligible vs. plain expense totals

Three places (`src/lib/dashboard.ts`'s `getDashboardSummary`,
`src/lib/monthly.ts`'s `getMonthlyReport`, and `src/lib/allowance.ts`'s
`getAllowanceFlow`) each total "expenses" two ways from the same transaction
list, using the same three-condition per-transaction filter — currently
duplicated rather than shared, so a change to one needs to be checked
against the other two:

- **Plain `expenses`**: every `type === "expense"` transaction, unfiltered.
- **`allowanceEligibleExpenses`**: the subset that actually burns the
  allowance — excludes (a) any transaction on the `savings` account, (b) any
  transaction with the per-transaction `counts_toward_allowance === false`
  override, and (c) any transaction whose category isn't itself flagged
  `counts_toward_allowance === true` on the `categories` row.

All three call sites build that eligible-*category* set the same way now:
strictly `=== true`, so a category row with a null/undefined flag is treated
as not eligible everywhere. `monthly.ts` used to go through
`getAllowanceEligibleSet()` (also in `allowance.ts`), which filtered
`!== false` instead — lenient, silently including null/undefined as
eligible — and so could disagree with the other two on any category whose
`counts_toward_allowance` wasn't a real boolean. That helper was tightened
to `=== true` to match; if you touch any of the three filters, keep them
identical rather than reintroducing that drift.

Also worth knowing: `categories.counts_toward_allowance` doesn't appear in
`supabase/schema.sql` or in any committed migration — only
`transactions.counts_toward_allowance` is declared there (`not null default
true`). The categories column the app reads/writes must have been added
directly against the live database, so its nullability/default aren't
verifiable from this repo; if you're touching this area, confirm the actual
column constraint in Supabase rather than assuming it matches
`transactions`.

`allowanceBalance` is computed from the eligible subset; `balance` is
computed from the plain total. Don't conflate the two, and if you add a
fourth place that needs this split, prefer extracting the shared predicate
rather than copy-pasting it a fourth time.

## Testing

Vitest (`npm test` / `npm run test:watch`), configured in
`vitest.config.ts` with `vite-tsconfig-paths` so `@/...` imports resolve the
same as in the app. No real Supabase calls in tests — mock `@/lib/supabase`'s
`getSupabase()` per test file (see `src/lib/allowance.test.ts`,
`src/lib/ledger.test.ts`, `src/lib/dashboard.test.ts` for the pattern: a
`from(table)` switch returning chainable stubs that end in a `vi.fn()` you
control per test). Coverage is intentionally narrow — it targets the logic
above that has non-obvious behavior and has already broken once:
allowance rate history/proration, loan ledger deltas, installment date
drift, the allowance-eligible expense filter, and the SMS regex rules. It is
not meant to be exhaustive; extend it when you touch one of those areas, not
as a general coverage mandate.
