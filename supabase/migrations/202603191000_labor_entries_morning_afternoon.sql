-- Add morning/afternoon (AM/PM) flags to labor_entries for daily entry flow.
-- AM = half day, PM = half day; AM + PM = full day. One row per worker can store both.

alter table public.labor_entries
  add column if not exists morning boolean not null default false;

alter table public.labor_entries
  add column if not exists afternoon boolean not null default false;

comment on column public.labor_entries.morning is 'Morning (AM) half-day worked for this entry.';
comment on column public.labor_entries.afternoon is 'Afternoon (PM) half-day worked for this entry.';
