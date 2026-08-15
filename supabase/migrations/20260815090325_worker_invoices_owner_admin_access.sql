-- Canonical worker_invoices access contract.
--
-- Authenticated owner/admin browser callers require direct CRUD for the Worker
-- Invoices workspace. Guarded server/report callers retain server-only
-- service-role CRUD. Anonymous and non-owner callers remain denied.

begin;

do $$
declare
  unexpected_policies text[];
  allowed_policies constant text[] := array[
    'worker_invoices_select_all',
    'worker_invoices_insert_all',
    'worker_invoices_update_all',
    'worker_invoices_delete_all',
    'allow authenticated read',
    'allow authenticated insert',
    'allow authenticated update',
    'allow authenticated delete',
    'worker_invoices_owner_admin_all'
  ];
begin
  if to_regclass('public.worker_invoices') is null then
    raise exception 'worker_invoices access contract requires public.worker_invoices';
  end if;

  if to_regprocedure('public.is_owner_or_admin()') is null then
    raise exception 'worker_invoices access contract requires public.is_owner_or_admin()';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.worker_invoices'::regclass
  ) then
    raise exception 'worker_invoices access contract requires RLS to remain enabled';
  end if;

  select array_agg(policyname order by policyname)
  into unexpected_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'worker_invoices'
    and policyname <> all (allowed_policies);

  if coalesce(array_length(unexpected_policies, 1), 0) > 0 then
    raise exception 'unexpected worker_invoices policy drift: %', unexpected_policies;
  end if;
end
$$;

-- Normalize table privileges before installing the single browser policy.
revoke all privileges on table public.worker_invoices from public;
revoke all privileges on table public.worker_invoices from anon;
revoke all privileges on table public.worker_invoices from authenticated;
revoke all privileges on table public.worker_invoices from service_role;

grant select, insert, update, delete on table public.worker_invoices to authenticated;
grant select, insert, update, delete on table public.worker_invoices to service_role;

-- Remove both historical anonymous policies and remote-schema authenticated
-- USING (true) policies. The target policy is dropped for idempotent re-entry.
drop policy if exists "worker_invoices_select_all" on public.worker_invoices;
drop policy if exists "worker_invoices_insert_all" on public.worker_invoices;
drop policy if exists "worker_invoices_update_all" on public.worker_invoices;
drop policy if exists "worker_invoices_delete_all" on public.worker_invoices;
drop policy if exists "allow authenticated read" on public.worker_invoices;
drop policy if exists "allow authenticated insert" on public.worker_invoices;
drop policy if exists "allow authenticated update" on public.worker_invoices;
drop policy if exists "allow authenticated delete" on public.worker_invoices;
drop policy if exists "worker_invoices_owner_admin_all" on public.worker_invoices;

create policy worker_invoices_owner_admin_all
on public.worker_invoices
for all
to authenticated
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

notify pgrst, 'reload schema';

commit;
