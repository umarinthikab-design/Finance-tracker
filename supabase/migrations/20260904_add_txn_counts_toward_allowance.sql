-- Per-transaction allowance override.
-- An expense deducts from the allowance only when all hold:
--   type = expense AND account != 'savings' AND category is allowance-eligible
--   AND counts_toward_allowance = true (this flag).
-- Default true preserves existing behaviour for all current rows.
alter table public.transactions
  add column if not exists counts_toward_allowance boolean not null default true;