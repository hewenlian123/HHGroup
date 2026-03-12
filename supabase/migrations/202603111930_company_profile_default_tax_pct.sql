-- Add default tax percent to company_profile.

alter table public.company_profile
  add column if not exists default_tax_pct numeric null default 0;

