-- Subcontractors table. RLS with full access for anon (dev).

create table if not exists public.subcontractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.subcontractors enable row level security;

drop policy if exists subcontractors_select_all on public.subcontractors;
create policy subcontractors_select_all on public.subcontractors for select to anon using (true);
drop policy if exists subcontractors_insert_all on public.subcontractors;
create policy subcontractors_insert_all on public.subcontractors for insert to anon with check (true);
drop policy if exists subcontractors_update_all on public.subcontractors;
create policy subcontractors_update_all on public.subcontractors for update to anon using (true) with check (true);
drop policy if exists subcontractors_delete_all on public.subcontractors;
create policy subcontractors_delete_all on public.subcontractors for delete to anon using (true);
