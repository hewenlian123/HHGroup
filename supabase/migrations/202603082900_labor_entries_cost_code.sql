-- Add optional cost_code to labor_entries for grouping on project labor page.

alter table public.labor_entries
  add column if not exists cost_code text null;
