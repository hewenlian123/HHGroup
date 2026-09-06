-- Global Finance/Labor/Contacts use strict owner/admin actions and middleware.
-- Legacy permissive authenticated=true policies cannot substitute for that role boundary.
set lock_timeout = '5s';
set statement_timeout = '60s';

-- Read the trusted live Auth role too: downgrading app_metadata revokes an old owner JWT immediately.
create or replace function private.can_manage_company()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_org_admin(private.company_organization_id())
    and exists(select 1 from auth.users u where u.id = auth.uid()
      and not coalesce(u.is_anonymous,false)
      and u.raw_app_meta_data->>'role' in ('owner','admin'));
$$;
revoke all on function private.can_manage_company() from public,anon;
grant execute on function private.can_manage_company() to authenticated;

-- Follow the existing explicit single-company table inventory from 20260906112422.
-- Exceptions are existing product calls, not new roles:
-- workers SELECT: /api/upload-receipt/options resolves worker IDs/names for company assistants.
-- worker_receipts INSERT: /api/upload-receipt/submit uses the validated intake-only policy.
do $$
declare target_table text;
begin
  for target_table in
    select tablename from pg_catalog.pg_policies
    where schemaname='public' and policyname='company_membership_boundary'
      and tablename not in ('workers','worker_receipts')
  loop
    execute format('create policy company_administrator_boundary on public.%I as restrictive for all to authenticated using ((select private.can_manage_company())) with check ((select private.can_manage_company()))',target_table);
  end loop;
end;
$$;

-- Receipt intake does not grant financial review, edits or deletion, even with a stale privileged JWT.
alter policy worker_receipts_owner_admin_select on public.worker_receipts
using ((select private.can_manage_company()));
alter policy worker_receipts_owner_admin_insert on public.worker_receipts
with check ((select private.can_manage_company()));
alter policy worker_receipts_owner_admin_update on public.worker_receipts
using ((select private.can_manage_company())) with check ((select private.can_manage_company()));
alter policy worker_receipts_owner_admin_delete on public.worker_receipts
using ((select private.can_manage_company()));

-- A company assistant can only upload a validated worker-receipts object. Financial objects remain private.
alter policy company_financial_storage_boundary on storage.objects
using (bucket_id not in ('expense-attachments','payment-attachments','receipts','worker-receipts')
  or private.can_manage_company())
with check (bucket_id not in ('expense-attachments','payment-attachments','receipts','worker-receipts')
  or (bucket_id='worker-receipts' and private.can_access_company())
  or private.can_manage_company());
notify pgrst,'reload schema';
