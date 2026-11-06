-- Add "hold for a month" support to recurring items.
-- Run in the Supabase SQL editor (works with the existing installments rows).

alter table public.installments add column if not exists held_for date;