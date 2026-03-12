-- Payment methods table for settings/lists Supabase-backed management.

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null unique,
  status text not null default 'active',
  notes text null,
  constraint payment_methods_status_check check (status in ('active', 'inactive'))
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_payment_methods_updated_at on public.payment_methods;
create trigger trg_payment_methods_updated_at
before update on public.payment_methods
for each row execute function public.set_updated_at();

alter table public.payment_methods enable row level security;

drop policy if exists payment_methods_select_all on public.payment_methods;
create policy payment_methods_select_all on public.payment_methods for select to anon using (true);
drop policy if exists payment_methods_insert_all on public.payment_methods;
create policy payment_methods_insert_all on public.payment_methods for insert to anon with check (true);
drop policy if exists payment_methods_update_all on public.payment_methods;
create policy payment_methods_update_all on public.payment_methods for update to anon using (true) with check (true);
drop policy if exists payment_methods_delete_all on public.payment_methods;
create policy payment_methods_delete_all on public.payment_methods for delete to anon using (true);
