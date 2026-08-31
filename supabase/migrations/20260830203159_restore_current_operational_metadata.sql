-- Restore current operational metadata that application read/write paths still
-- own. This migration is additive and intentionally leaves financial formulas,
-- totals, and workflow states unchanged.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.labor_payments
  add column if not exists applied_start_date date,
  add column if not exists applied_end_date date;

alter table public.labor_payments
  drop constraint if exists labor_payments_applied_date_range_check;

alter table public.labor_payments
  add constraint labor_payments_applied_date_range_check
  check (
    (applied_start_date is null and applied_end_date is null)
    or (
      applied_start_date is not null
      and applied_end_date is not null
      and applied_start_date <= applied_end_date
    )
  ) not valid;

commit;

-- Validate independently so existing rows are scanned under the lighter lock
-- PostgreSQL uses for VALIDATE CONSTRAINT, rather than in the add-constraint
-- transaction.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.labor_payments
  validate constraint labor_payments_applied_date_range_check;

commit;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.project_change_orders
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists cost_impact numeric;

alter table public.project_change_orders
  add column if not exists schedule_impact_days bigint;

alter table public.vendors
  add column if not exists status text;

alter table public.vendors
  alter column status set default 'active'::text;

update public.vendors
set status = 'active'
where status is null;

alter table public.vendors
  drop constraint if exists vendors_status_check;

alter table public.vendors
  add constraint vendors_status_check
  check (status is not null and status in ('active', 'inactive')) not valid;

commit;

-- Vendor validation is also independent from its constraint creation and
-- backfill transaction.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.vendors
  validate constraint vendors_status_check;

notify pgrst, 'reload schema';

commit;
