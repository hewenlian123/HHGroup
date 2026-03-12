-- Payment schedule milestones per estimate (General Contractor workflow)
create table if not exists public.estimate_payment_schedule (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  sort_order int not null default 0,
  title text not null default '',
  amount_type text not null check (amount_type in ('percent', 'fixed')),
  value numeric not null default 0,
  due_rule text not null default '',
  notes text null
);

create index if not exists estimate_payment_schedule_estimate_id_idx on public.estimate_payment_schedule (estimate_id);

alter table public.estimate_payment_schedule enable row level security;

drop policy if exists estimate_payment_schedule_select_all on public.estimate_payment_schedule;
create policy estimate_payment_schedule_select_all on public.estimate_payment_schedule for select to anon using (true);
drop policy if exists estimate_payment_schedule_insert_all on public.estimate_payment_schedule;
create policy estimate_payment_schedule_insert_all on public.estimate_payment_schedule for insert to anon with check (true);
drop policy if exists estimate_payment_schedule_update_all on public.estimate_payment_schedule;
create policy estimate_payment_schedule_update_all on public.estimate_payment_schedule for update to anon using (true) with check (true);
drop policy if exists estimate_payment_schedule_delete_all on public.estimate_payment_schedule;
create policy estimate_payment_schedule_delete_all on public.estimate_payment_schedule for delete to anon using (true);
