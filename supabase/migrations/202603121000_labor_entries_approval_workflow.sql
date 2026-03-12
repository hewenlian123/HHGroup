-- Labor / Timesheet Approval workflow: status and audit fields on labor_entries.
-- Only Approved and Locked entries count toward project labor cost.

-- Status: Draft | Submitted | Approved | Locked (default Draft for old records)
alter table public.labor_entries
  add column if not exists status text not null default 'Draft';

-- Audit fields for workflow
alter table public.labor_entries
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text;

-- Constraint: only allowed statuses
alter table public.labor_entries drop constraint if exists labor_entries_status_check;
alter table public.labor_entries
  add constraint labor_entries_status_check
  check (status in ('Draft', 'Submitted', 'Approved', 'Locked'));

-- Safe fallback: treat null or legacy values as Draft (so they don't count toward cost)
update public.labor_entries
set status = 'Draft'
where status is null
   or status not in ('Draft', 'Submitted', 'Approved', 'Locked');

-- Ensure default for new rows
alter table public.labor_entries
  alter column status set default 'Draft';

create index if not exists idx_labor_entries_status on public.labor_entries (status);

comment on column public.labor_entries.status is 'Draft | Submitted | Approved | Locked. Only Approved and Locked count toward project labor cost.';
comment on column public.labor_entries.submitted_at is 'When the entry was submitted for approval.';
comment on column public.labor_entries.approved_at is 'When the entry was approved.';
comment on column public.labor_entries.locked_at is 'When the entry was locked (read-only).';
