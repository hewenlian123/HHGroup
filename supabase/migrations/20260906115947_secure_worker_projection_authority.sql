set lock_timeout = '5s';
set statement_timeout = '60s';

-- Authorized session writes already pass workers RLS; the internal projection has no client DML grant.
-- Keep the projection transaction atomic without granting clients direct mirror access.
alter function public.hh_sync_worker_to_labor_workers_projection() security definer;
alter function public.hh_sync_worker_to_labor_workers_projection() set search_path = '';
alter function public.hh_sync_worker_to_labor_workers_projection() owner to postgres;
revoke all on function public.hh_sync_worker_to_labor_workers_projection() from public,anon,authenticated,service_role;

-- Existing permissive workers policies predate role-based actions. Preserve assistant reads,
-- while matching the active worker actions' owner/admin + live company write boundary.
create policy company_worker_insert_boundary on public.workers as restrictive for insert to authenticated
with check ((select private.can_manage_company()) and (select public.is_owner_or_admin()));
create policy company_worker_update_boundary on public.workers as restrictive for update to authenticated
using ((select private.can_manage_company()) and (select public.is_owner_or_admin()))
with check ((select private.can_manage_company()) and (select public.is_owner_or_admin()));
create policy company_worker_delete_boundary on public.workers as restrictive for delete to authenticated
using ((select private.can_manage_company()) and (select public.is_owner_or_admin()));
