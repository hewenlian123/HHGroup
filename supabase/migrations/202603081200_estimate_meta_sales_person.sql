-- Add sales_person to estimate_meta for Estimate Information
alter table public.estimate_meta
  add column if not exists sales_person text null default '';
