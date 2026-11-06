-- Card → account mapping for SMS capture.
-- ComBank card alerts include the card's last 4 digits ("...ending #8662").
-- This mapping decides which account (bank vs savings) an SMS transaction is
-- inserted against when a card number is captured. Unmapped cards keep the
-- existing default of 'bank'.
create table if not exists public.card_accounts (
  card_last4 text primary key check (card_last4 ~ '^[0-9]{4}$'),
  account text not null check (account in ('cash', 'bank', 'savings')),
  created_at timestamptz not null default now()
);