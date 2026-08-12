-- HH Group Production Security Baseline Closure rollback
-- Operator-only: this rollback restores only the immediately prior grant/policy posture.
-- It cannot run unless the operator explicitly sets the transactional confirmation variable.

begin;

do $$
begin
  if current_setting('hh.rollback_confirmation', true) is distinct from 'production-security-baseline-closure-20260812103821' then
    raise exception 'set hh.rollback_confirmation to production-security-baseline-closure-20260812103821 before rollback';
  end if;

  if to_regclass('public.audit_logs') is null
     or to_regclass('public.tmp_backup_worker_advances_haijun') is null
     or to_regclass('public.labor_workers') is null then
    raise exception 'rollback requires all three retained tables to exist';
  end if;
end
$$;

drop trigger if exists hh_sync_worker_to_labor_workers_projection_trigger on public.workers;
drop function if exists public.hh_sync_worker_to_labor_workers_projection();

-- Restore the documented immediate pre-release posture. This reopens legacy access and is
-- only for a time-limited, explicitly approved emergency rollback.
alter table public.audit_logs disable row level security;
revoke all privileges on table public.audit_logs from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.audit_logs to anon, authenticated, service_role;

alter table public.tmp_backup_worker_advances_haijun disable row level security;
revoke all privileges on table public.tmp_backup_worker_advances_haijun
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.tmp_backup_worker_advances_haijun
  to anon, authenticated, service_role;

revoke all privileges on table public.labor_workers from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.labor_workers to anon, authenticated, service_role;

drop policy if exists labor_workers_owner_admin_select on public.labor_workers;
drop policy if exists "dev full access" on public.labor_workers;
drop policy if exists "allow authenticated delete" on public.labor_workers;
drop policy if exists "allow authenticated insert" on public.labor_workers;
drop policy if exists "allow authenticated read" on public.labor_workers;
drop policy if exists "allow authenticated update" on public.labor_workers;

create policy "dev full access"
on public.labor_workers
for all
to anon
using (true)
with check (true);

create policy "allow authenticated read"
on public.labor_workers
for select
to authenticated
using (true);

create policy "allow authenticated insert"
on public.labor_workers
for insert
to authenticated
with check (true);

create policy "allow authenticated update"
on public.labor_workers
for update
to authenticated
using (true)
with check (true);

create policy "allow authenticated delete"
on public.labor_workers
for delete
to authenticated
using (true);

-- Operator reviews verification output, then either COMMIT or ROLLBACK manually.
