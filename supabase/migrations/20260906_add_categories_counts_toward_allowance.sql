-- Formalize `categories.counts_toward_allowance`, which existed in the live
-- database but was never declared in schema.sql or any prior migration
-- (schema drift). Verified via the Supabase SQL editor before this migration
-- was written that no row currently has a null value:
--
--   select count(*) filter (where counts_toward_allowance is null) as null_count,
--          count(*) as total_categories
--   from categories;
--   -- null_count = 0, total_categories = 18 (16 true, 2 false)
--
-- so this is safe to apply directly as a NOT NULL constraint with no backfill
-- needed. The `add column if not exists` + explicit alters below are written
-- so this migration is a no-op if the column is somehow already exactly this
-- shape, and still converges an environment where the column is missing
-- entirely to the same end state.
alter table public.categories
  add column if not exists counts_toward_allowance boolean default true;

update public.categories
  set counts_toward_allowance = true
  where counts_toward_allowance is null;

alter table public.categories
  alter column counts_toward_allowance set default true,
  alter column counts_toward_allowance set not null;
