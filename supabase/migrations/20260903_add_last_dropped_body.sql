-- Add raw-body capture for dropped-event diagnostics.
-- The 09-02 migration added sms_heartbeat before last_dropped_body existed;
-- for tables created with the earlier schema, this backfills the column
-- WITHOUT touching anything else. Idempotent — safe to re-run.
-- Run this in the Supabase SQL Editor.
alter table public.sms_heartbeat
  add column if not exists last_dropped_body text;