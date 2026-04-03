-- Worker receipt uploads: pending approval before becoming a reimbursement.

create table if not exists public.worker_receipts (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  amount numeric not null default 0,
  receipt_url text,
  status text not null default 'Pending',
  rejection_reason text null,
  reimbursement_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists idx_worker_receipts_worker_id on public.worker_receipts (worker_id);
create index if not exists idx_worker_receipts_project_id on public.worker_receipts (project_id);
create index if not exists idx_worker_receipts_status on public.worker_receipts (status);
create index if not exists idx_worker_receipts_created_at on public.worker_receipts (created_at);

-- Link reimbursement after approval (optional FK when worker_reimbursements exists)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'worker_reimbursements') then
    if not exists (select 1 from pg_constraint where conname = 'worker_receipts_reimbursement_id_fkey') then
      alter table public.worker_receipts
        add constraint worker_receipts_reimbursement_id_fkey
        foreign key (reimbursement_id) references public.worker_reimbursements(id) on delete set null;
    end if;
  end if;
exception when others then null;
end $$;

alter table public.worker_receipts enable row level security;
drop policy if exists worker_receipts_select on public.worker_receipts;
create policy worker_receipts_select on public.worker_receipts for select to anon using (true);
drop policy if exists worker_receipts_insert on public.worker_receipts;
create policy worker_receipts_insert on public.worker_receipts for insert to anon with check (true);
drop policy if exists worker_receipts_update on public.worker_receipts;
create policy worker_receipts_update on public.worker_receipts for update to anon using (true) with check (true);
drop policy if exists worker_receipts_delete on public.worker_receipts;
create policy worker_receipts_delete on public.worker_receipts for delete to anon using (true);
