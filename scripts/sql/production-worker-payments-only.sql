-- Production-safe worker_payments table bootstrap (idempotent).
-- Only CREATE / ALTER / POLICY additions. No drops, no data changes.

do $$
begin
  execute 'create extension if not exists "pgcrypto"';

  execute $sql$
    create table if not exists public.worker_payments (
      id uuid primary key default gen_random_uuid(),
      worker_id uuid not null,
      amount numeric not null check (amount >= 0),
      created_at timestamptz not null default now()
    )
  $sql$;

  -- Ensure required columns exist even if the table predates this script.
  execute 'alter table public.worker_payments add column if not exists worker_id uuid';
  execute 'alter table public.worker_payments add column if not exists amount numeric';
  execute 'alter table public.worker_payments add column if not exists created_at timestamptz';
  -- Canonical field used by app code (preferred over amount).
  execute 'alter table public.worker_payments add column if not exists total_amount numeric not null default 0';
  -- Optional metadata fields (safe additions).
  execute 'alter table public.worker_payments add column if not exists payment_method text';
  execute 'alter table public.worker_payments add column if not exists note text';
  execute 'alter table public.worker_payments add column if not exists labor_entry_ids uuid[]';

  -- Ensure defaults/constraints for required fields (safe: set only if missing).
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'worker_payments'
      and column_name = 'id'
  ) then
    execute 'alter table public.worker_payments add column id uuid primary key default gen_random_uuid()';
  end if;

  execute 'alter table public.worker_payments alter column created_at set default now()';

  -- Optional FK if workers table exists (safe with conditional DDL).
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'workers'
  ) then
    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'worker_payments'
        and c.conname = 'worker_payments_worker_id_fkey'
    ) then
      execute $sql$
        alter table public.worker_payments
          add constraint worker_payments_worker_id_fkey
          foreign key (worker_id) references public.workers(id)
          on update cascade on delete restrict
      $sql$;
    end if;
  end if;

  execute 'alter table public.worker_payments enable row level security';

  -- Minimal policies: allow authenticated + anon to read/insert (per request).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'worker_payments'
      and policyname = 'worker_payments_select_anon_auth'
  ) then
    execute $sql$
      create policy worker_payments_select_anon_auth
        on public.worker_payments
        for select
        to anon, authenticated
        using (true)
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'worker_payments'
      and policyname = 'worker_payments_insert_anon_auth'
  ) then
    execute $sql$
      create policy worker_payments_insert_anon_auth
        on public.worker_payments
        for insert
        to anon, authenticated
        with check (true)
    $sql$;
  end if;
end $$;

