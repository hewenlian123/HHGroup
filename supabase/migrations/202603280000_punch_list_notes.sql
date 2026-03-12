-- Add notes to punch_list for issue-level notes.
alter table public.punch_list add column if not exists notes text null;
