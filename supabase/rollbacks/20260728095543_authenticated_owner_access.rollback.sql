-- MANUAL EMERGENCY ROLLBACK ONLY.
-- Run only after setting this session value on the same database connection:
--   set hh.rollback_confirmation = 'ROLLBACK_AUTHENTICATED_OWNER_ACCESS_20260728095543';
-- This file intentionally leaves the transaction open for operator inspection.
-- The legacy PIN cannot be reconstructed automatically. This rollback does not
-- change PIN data, historical rows, receipt references, or Storage objects.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if current_setting('hh.rollback_confirmation', true)
    is distinct from 'ROLLBACK_AUTHENTICATED_OWNER_ACCESS_20260728095543'
  then
    raise exception
      'Explicit rollback confirmation is required for authenticated owner access';
  end if;
end
$$;

drop policy if exists attachments_insert_authenticated on public.attachments;
drop policy if exists attachments_update_authenticated on public.attachments;
drop policy if exists attachments_delete_authenticated on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists attachments_update on public.attachments;
drop policy if exists attachments_delete on public.attachments;

grant select, insert, update, delete on table public.attachments to anon, authenticated;
grant select, insert, update, delete on table public.subcontract_deductions to anon;

create policy attachments_insert
on public.attachments
for insert
to anon, authenticated
with check (true);

create policy attachments_update
on public.attachments
for update
to anon, authenticated
using (true);

create policy attachments_delete
on public.attachments
for delete
to anon, authenticated
using (true);

notify pgrst, 'reload schema';

-- Inspect policies and grants now. The operator must explicitly finish or roll
-- back this open transaction; normal migrations never execute this file.
