-- 202603081000_estimates.sql creates public.estimate_snapshots first.
-- 202603111200_estimate_snapshots.sql uses CREATE TABLE IF NOT EXISTS, so
-- meta_json, items_json, and summary_json are never added on a fresh reset.
-- Application reads and writes select and insert those columns.
-- ADD COLUMN IF NOT EXISTS is a no-op when the column already exists.
-- Do not SET DEFAULT, COMMENT, or otherwise rewrite an existing column.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.estimate_snapshots
  add column if not exists meta_json jsonb not null default '{}'::jsonb;

alter table public.estimate_snapshots
  add column if not exists items_json jsonb not null default '[]'::jsonb;

alter table public.estimate_snapshots
  add column if not exists summary_json jsonb not null default '{}'::jsonb;

commit;
