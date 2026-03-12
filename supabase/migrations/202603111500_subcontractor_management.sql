-- Subcontractor management: profiles, insurance expiration, W9 storage, retainage on subcontracts.

-- 1. Subcontractors: profile fields, insurance, W9
alter table public.subcontractors
  add column if not exists insurance_expiration_date date,
  add column if not exists w9_storage_path text,
  add column if not exists notes text;

-- 2. Subcontracts: retainage percentage (0–100), applied to progress bill amounts for tracking
alter table public.subcontracts
  add column if not exists retainage_pct numeric default 0;

comment on column public.subcontractors.insurance_expiration_date is 'Date insurance expires; used for alerts when within 30 days or past.';
comment on column public.subcontractors.w9_storage_path is 'Path in storage bucket (e.g. attachments) for W9 document.';
comment on column public.subcontracts.retainage_pct is 'Retainage percentage (0–100) applied to approved bill amounts for tracking holdback.';
