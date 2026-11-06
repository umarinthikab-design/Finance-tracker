-- SMS card-transaction cancellation notices: reconciled against existing
-- SMS-sourced charges from the review queue, never auto-deleted. See
-- schema.sql for the full table comment.
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

-- Append-only audit trail (e.g. "removed this transaction, here's why").
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_log_created_at on public.activity_log (created_at desc);
