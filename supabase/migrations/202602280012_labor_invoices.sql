-- Labor invoices (worker invoices with project splits and checklist)
create table if not exists public.labor_invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invoice_no text not null,
  worker_id uuid not null references public.workers(id) on delete cascade,
  invoice_date date not null default current_date,
  amount numeric not null default 0,
  memo text null,
  status text not null default 'draft',
  project_splits jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '{"verifiedWorker":false,"verifiedAmount":false,"verifiedAllocation":false,"verifiedAttachment":false}'::jsonb,
  confirmed_at timestamptz null,
  constraint labor_invoices_status_check check (status in ('draft', 'reviewed', 'confirmed', 'void'))
);

create unique index if not exists labor_invoices_invoice_no_key on public.labor_invoices (invoice_no);

drop trigger if exists trg_labor_invoices_updated_at on public.labor_invoices;
create trigger trg_labor_invoices_updated_at
before update on public.labor_invoices
for each row execute function public.set_updated_at();

-- Sequence for invoice numbers (LI-YYYY-NNN)
create sequence if not exists public.labor_invoice_no_seq;

-- RLS
alter table public.labor_invoices enable row level security;

drop policy if exists labor_invoices_select_all on public.labor_invoices;
create policy labor_invoices_select_all on public.labor_invoices for select to anon using (true);
drop policy if exists labor_invoices_insert_all on public.labor_invoices;
create policy labor_invoices_insert_all on public.labor_invoices for insert to anon with check (true);
drop policy if exists labor_invoices_update_all on public.labor_invoices;
create policy labor_invoices_update_all on public.labor_invoices for update to anon using (true) with check (true);
drop policy if exists labor_invoices_delete_all on public.labor_invoices;
create policy labor_invoices_delete_all on public.labor_invoices for delete to anon using (true);
