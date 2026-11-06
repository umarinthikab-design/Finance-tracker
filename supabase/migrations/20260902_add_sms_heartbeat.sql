-- SMS capture heartbeat for the phone-side Tasker forwarder.
-- Run this in the Supabase SQL Editor.
create table if not exists public.sms_heartbeat (
  id integer primary key check (id = 1),
  last_seen_at timestamptz not null,
  attempts bigint not null default 0,
  last_method text,
  last_error text,
  last_dropped_body text,
  updated_at timestamptz not null default now()
);
-- Seed from the real last-SMS time, NOT now(): stamping now() here would
-- fake a fresh heartbeat and hide a dead forwarder for 48h.
insert into public.sms_heartbeat (id, last_seen_at, updated_at)
select 1, coalesce(max(created_at), now()), now()
from public.transactions
where source = 'sms'
on conflict (id) do nothing;