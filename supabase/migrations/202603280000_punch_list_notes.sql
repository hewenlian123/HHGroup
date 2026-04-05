-- Add notes to punch_list for issue-level notes.
alter table if exists public.punch_list add column if not exists notes text null;
