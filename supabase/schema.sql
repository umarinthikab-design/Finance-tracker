-- ============================================================
-- Personal Finance Tracker â€” Schema
-- Run this in the Supabase SQL Editor (or via supabase db push)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- transactions
-- ------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'LKR',
  type text not null check (type in ('expense', 'income', 'savings', 'transfer')),
  title text,
  category text,
  subcategory text,
  merchant text,
  source text not null default 'manual' check (source in ('manual', 'sms', 'email')),
  raw_text text,
  needs_review boolean not null default false,
  counts_toward_allowance boolean not null default true,
  account text not null default 'cash' check (account in ('cash', 'bank', 'savings')),
  to_account text check (to_account in ('cash', 'bank', 'savings')), -- transfer destination
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_date on public.transactions (date desc);
create index if not exists idx_transactions_type on public.transactions (type);
create index if not exists idx_transactions_category on public.transactions (category);
create index if not exists idx_transactions_needs_review on public.transactions (needs_review) where needs_review = true;
create index if not exists idx_transactions_merchant on public.transactions (merchant);

-- ------------------------------------------------------------
-- categories
-- ------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('expense', 'income', 'savings', 'transfer')),
  hidden boolean not null default false,
  -- Whether expenses in this category burn the weekly allowance. See
  -- migrations/20260906_add_categories_counts_toward_allowance.sql for the
  -- history: this column existed in production before it was ever declared
  -- here or in a migration.
  counts_toward_allowance boolean not null default true
);

-- ------------------------------------------------------------
-- loans  (payable = you owe; receivable = owed to you)
-- ------------------------------------------------------------
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  counterparty text not null,
  direction text not null check (direction in ('payable', 'receivable')),
  total_amount numeric(12, 2) not null default 0,
  paid numeric(12, 2) not null default 0,
  balance numeric(12, 2) generated always as (total_amount - paid) stored,
  notes text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- investments
-- ------------------------------------------------------------
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12, 2) not null default 0,
  date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- installments (recurring subscriptions / commitments)
-- ------------------------------------------------------------
create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12, 2) not null default 0,
  cycle text not null default 'monthly' check (cycle in ('monthly', 'yearly', 'weekly')),
  type text not null default 'expense' check (type in ('expense', 'income')),
  category text,
  anchor_day int check (anchor_day between 1 and 31), -- original recurrence day
  account text not null default 'cash' check (account in ('cash', 'bank', 'savings')),
  next_due_date date,
  held_for date, -- occurrence date skipped via "Hold for a month"
  created_at timestamptz not null default now()
);

-- Migration for existing databases (idempotent):
-- alter table public.installments add column if not exists held_for date;

-- ------------------------------------------------------------
-- savings_log (monthly allocation vs actual)
-- ------------------------------------------------------------
create table if not exists public.savings_log (
  id uuid primary key default gen_random_uuid(),
  month date not null, -- first day of month
  allocated numeric(12, 2) not null default 0,
  actual numeric(12, 2) not null default 0,
  cash_in_hand numeric(12, 2) not null default 0,
  cash_in_bank numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (month)
);

-- ------------------------------------------------------------
-- allowance (monthly 4-bucket model: cut-points + default + overrides)
-- active setting = most recent effective_from <= today;
-- a bucket with an override row uses that amount instead.
-- ------------------------------------------------------------
create table if not exists public.allowance_settings (
  id uuid primary key default gen_random_uuid(),
  default_weekly_amount numeric(12, 2) not null,
  effective_from date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.allowance_cycle_config (
  id uuid primary key default gen_random_uuid(),
  bucket_number int not null check (bucket_number between 1 and 4),
  start_day int not null check (start_day between 1 and 31),
  updated_at timestamptz default now(),
  unique (bucket_number)
);

insert into public.allowance_cycle_config (bucket_number, start_day) values
  (1, 1),
  (2, 9),
  (3, 17),
  (4, 24)
on conflict (bucket_number) do nothing;

create table if not exists public.allowance_overrides (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null check (month between 1 and 12),
  bucket_number int not null check (bucket_number between 1 and 4),
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  unique (year, month, bucket_number)
);

-- ------------------------------------------------------------
-- Seed categories
-- ------------------------------------------------------------
insert into public.categories (name, type) values
  ('Allowance', 'income'),
  ('Salary', 'income'),
  ('Other Income', 'income'),
  ('Cash Withdrawal', 'transfer'),
  ('Food', 'expense'),
  ('Travel', 'expense'),
  ('Fuel', 'expense'),
  ('Sports', 'expense'),
  ('Entertainment', 'expense'),
  ('Clothes', 'expense'),
  ('Household', 'expense'),
  ('Loans', 'expense'),
  ('Investments', 'savings'),
  ('Savings', 'savings'),
  ('Installments', 'expense'),
  ('Other', 'expense')
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- App settings (key/value store, e.g. the password hash so it
-- can be changed at runtime from Settings without a redeploy)
-- ------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Seed: bcrypt hash of the initial app password. The plaintext value is the
-- APP_PASSWORD env var that was set at the time of the first migration â€”
-- it is intentionally NOT recorded here. The app reads this hash from the
-- table at runtime, never the env var, and the password can be changed in
-- Settings afterwards.
insert into public.app_settings (key, value) values
  ('password_hash', '$2b$10$MwsNEaf1AKAlLCSX5Jbg/u5YB3Eoxx24ztyi7fNScxJeLLLDtb/DC')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- Merchant â†’ category mapping (explicit learning).
-- Populated when a reviewer confirms a category for a new merchant on
-- the Review page. This becomes the authoritative source â€” checked
-- first by getLearnedCategory, ahead of inferring off history.
-- ------------------------------------------------------------
create table if not exists public.merchant_categories (
  merchant text primary key,
  category text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Opening balances (seed cash-in-hand / cash-in-bank buckets so the
-- dashboard can show a real "current total balance"). These are one-time
-- snapshots, NOT transactions — they must never enter the expense/income/
-- savings flow or they'd double-count against future transactions.
-- ------------------------------------------------------------
create table if not exists public.opening_balances (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  amount numeric(12, 2) not null default 0,
  as_of_date date not null default current_date,
  kind text not null default 'bank' check (kind in ('cash', 'bank', 'savings')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Card → account mapping (SMS capture).
-- Bank card alerts include the card's last 4 digits; this table maps those
-- digits to the account the spend was on, so SMS purchases land on the right
-- bucket (bank vs savings) instead of always defaulting to 'bank'.
-- ------------------------------------------------------------
create table if not exists public.card_accounts (
  card_last4 text primary key check (card_last4 ~ '^[0-9]{4}$'),
  account text not null check (account in ('cash', 'bank', 'savings')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- SMS capture heartbeat.
-- The phone's Tasker forwarder POSTs bank SMS to /api/sms-webhook. If it
-- silently dies (battery kill, disabled profile, sender-ID change) nothing is
-- inserted and the failure is invisible. Every authenticated webhook POST
-- bumps this single row, so "last SMS seen by the server" is always known and
-- the dashboard / /api/sms-health can flag a stale forwarder.
-- ------------------------------------------------------------
create table if not exists public.sms_heartbeat (
  id integer primary key check (id = 1),
  last_seen_at timestamptz not null,
  attempts bigint not null default 0,
  last_method text,
  last_error text,
  last_dropped_body text,
  updated_at timestamptz not null default now()
);
-- Seed from the real last-SMS time, not now(), so an already-dead forwarder
-- stays flagged instead of looking fresh for the first 48h.
insert into public.sms_heartbeat (id, last_seen_at, updated_at)
select 1, coalesce(max(created_at), now()), now()
from public.transactions
where source = 'sms'
on conflict (id) do nothing;
-- Supabase Auth). All DB access is done server-side in Next.js
-- with the service_role key, so RLS stays disabled. Never use
-- the anon key for writes, and never expose the service key.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- SMS card-transaction cancellation notices.
-- A cancellation SMS (e.g. "YOUR TRANSACTION AT UBER ON YOUR CARD ENDING
-- WITH 8662 HAS BEEN CANCELLED") carries no amount/date, so it can't be
-- auto-matched with confidence — it's filed here and reconciled from the
-- Review page against candidate SMS-sourced charges instead of ever being
-- auto-deleted. candidate_ids is a snapshot taken at detection time; the
-- review UI re-fetches those transactions live (so one deleted by some
-- other path simply drops out) rather than trusting stale amount/date here.
-- ------------------------------------------------------------
create table if not exists public.sms_cancellations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'cancellation' check (kind = 'cancellation'),
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  outcome text check (outcome in ('removed', 'ignored')),
  merchant text not null,
  card_last4 text,
  account text not null check (account in ('cash', 'bank', 'savings')),
  candidate_ids uuid[] not null default '{}',
  too_many_matches boolean not null default false,
  matched_transaction_id uuid,
  raw_text text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_sms_cancellations_pending
  on public.sms_cancellations (created_at desc) where status = 'pending';

-- ------------------------------------------------------------
-- Activity log: append-only audit trail for actions that would otherwise
-- leave no record once they're done, e.g. a transaction removed via an SMS
-- cancellation notice — the transaction row is really gone, so this is the
-- only place "why is this missing?" can still be answered from.
-- ------------------------------------------------------------
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_log_created_at on public.activity_log (created_at desc);