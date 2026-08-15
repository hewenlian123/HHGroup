-- MANUAL EMERGENCY REVERSAL ONLY.
--
-- Run only after setting this session value on the same database connection:
--   set hh.rollback_confirmation =
--     'ROLLBACK_WORKER_INVOICES_OWNER_ADMIN_ACCESS_20260815090325';
--
-- This reversal intentionally fails closed: browser access is removed while
-- server-only service-role CRUD remains available for guarded operational
-- reads and recovery. It restores no legacy anonymous/authenticated USING
-- (true) policy. The transaction remains open for operator inspection.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if current_setting('hh.rollback_confirmation', true)
    is distinct from 'ROLLBACK_WORKER_INVOICES_OWNER_ADMIN_ACCESS_20260815090325'
  then
    raise exception 'Explicit rollback confirmation is required for worker_invoices access';
  end if;

  if to_regclass('public.worker_invoices') is null then
    raise exception 'worker_invoices reversal requires public.worker_invoices';
  end if;
end
$$;

drop policy if exists "worker_invoices_owner_admin_all" on public.worker_invoices;

revoke all privileges on table public.worker_invoices from public;
revoke all privileges on table public.worker_invoices from anon;
revoke all privileges on table public.worker_invoices from authenticated;
revoke all privileges on table public.worker_invoices from service_role;

grant select, insert, update, delete on table public.worker_invoices to service_role;

notify pgrst, 'reload schema';

-- Inspect grants, RLS, and policies now. The operator must explicitly commit
-- or roll back this open transaction; normal migrations never execute it.
