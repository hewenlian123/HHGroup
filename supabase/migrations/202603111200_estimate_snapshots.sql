-- Estimate snapshots / version history (Supabase-only)
-- Stores frozen copies of estimate meta/items/summary for version viewing and rollback.

create extension if not exists pgcrypto;

create table if not exists public.estimate_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  version integer not null,
  status_at_snapshot text not null default 'Draft',
  meta_json jsonb not null default '{}'::jsonb,
  items_json jsonb not null default '[]'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  frozen_payload jsonb not null default '{}'::jsonb,
  constraint estimate_snapshots_version_check check (version > 0)
);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'estimate_snapshots'
      and constraint_name = 'estimate_snapshots_estimate_version_unique'
  ) then
    alter table public.estimate_snapshots
      add constraint estimate_snapshots_estimate_version_unique unique (estimate_id, version);
  end if;
end $$;

create index if not exists estimate_snapshots_estimate_id_idx on public.estimate_snapshots (estimate_id);
create index if not exists estimate_snapshots_estimate_version_idx on public.estimate_snapshots (estimate_id, version desc);

alter table public.estimate_snapshots enable row level security;

-- Dev-friendly open anon (lock down later)
drop policy if exists estimate_snapshots_select_all on public.estimate_snapshots;
create policy estimate_snapshots_select_all on public.estimate_snapshots for select to anon using (true);
drop policy if exists estimate_snapshots_insert_all on public.estimate_snapshots;
create policy estimate_snapshots_insert_all on public.estimate_snapshots for insert to anon with check (true);
drop policy if exists estimate_snapshots_update_all on public.estimate_snapshots;
create policy estimate_snapshots_update_all on public.estimate_snapshots for update to anon using (true) with check (true);
drop policy if exists estimate_snapshots_delete_all on public.estimate_snapshots;
create policy estimate_snapshots_delete_all on public.estimate_snapshots for delete to anon using (true);

