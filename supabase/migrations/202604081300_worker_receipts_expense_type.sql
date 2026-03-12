-- Extend worker_receipts for public upload: worker_name, expense_type, notes.

alter table public.worker_receipts
  add column if not exists worker_name text;

alter table public.worker_receipts
  add column if not exists expense_type text default 'Other';

alter table public.worker_receipts
  add column if not exists notes text;

-- Backfill worker_name from workers when worker_id present and worker_name empty
update public.worker_receipts wr
set worker_name = w.name
from public.workers w
where wr.worker_id is not null and wr.worker_id = w.id
  and (wr.worker_name is null or trim(wr.worker_name) = '');

-- Allow inserts without worker_id when only worker_name is provided (public upload)
alter table public.worker_receipts alter column worker_id drop not null;

create index if not exists idx_worker_receipts_expense_type on public.worker_receipts (expense_type);
