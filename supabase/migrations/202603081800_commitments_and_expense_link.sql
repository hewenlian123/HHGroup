-- Commitments table (PO/Subcontract/Other) + optional expense link column
-- project_financial_snapshots: derived from projects.snapshot_* so no separate table.

create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  commitment_date date not null default current_date,
  vendor_name text not null default '',
  commitment_type text not null check (commitment_type in ('PO', 'Subcontract', 'Other')),
  amount numeric not null default 0,
  status text not null default 'Open' check (status in ('Open', 'Closed')),
  notes text null
);

create index if not exists commitments_project_id_idx on public.commitments (project_id);
create index if not exists commitments_commitment_date_idx on public.commitments (commitment_date desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_commitments_updated_at on public.commitments;
create trigger trg_commitments_updated_at
  before update on public.commitments
  for each row execute function public.set_updated_at();

alter table public.commitments enable row level security;

drop policy if exists commitments_select_all on public.commitments;
create policy commitments_select_all on public.commitments for select to anon using (true);
drop policy if exists commitments_insert_all on public.commitments;
create policy commitments_insert_all on public.commitments for insert to anon with check (true);
drop policy if exists commitments_update_all on public.commitments;
create policy commitments_update_all on public.commitments for update to anon using (true) with check (true);
drop policy if exists commitments_delete_all on public.commitments;
create policy commitments_delete_all on public.commitments for delete to anon using (true);

-- Allow attachments for commitments
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'attachments') then
    if exists (select 1 from information_schema.table_constraints where table_schema = 'public' and table_name = 'attachments' and constraint_name = 'attachments_entity_type_check') then
      alter table public.attachments drop constraint attachments_entity_type_check;
    end if;
    alter table public.attachments add constraint attachments_entity_type_check check (entity_type in ('subcontractor', 'bill', 'expense', 'commitment'));
  end if;
end $$;
