-- MANUAL EMERGENCY ROLLBACK / SERVICE-RESTORATION CHECK ONLY.
-- Run only after setting this session value on the same database connection:
--   set hh.rollback_confirmation = 'ROLLBACK_PROJECT_PDF_DOCUMENTS_EXPAND';
--
-- The expand migration is backward compatible, so application rollback keeps
-- the canonical columns, constraints, indexes, private bucket, and permission
-- decisions in place. This script never deletes data or objects, never drops a
-- data-bearing column or index, and never restores anonymous access.
-- It intentionally leaves the transaction open for operator inspection.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if current_setting('hh.rollback_confirmation', true)
    is distinct from 'ROLLBACK_PROJECT_PDF_DOCUMENTS_EXPAND'
  then
    raise exception
      'Explicit rollback confirmation is required for Project PDF documents expand';
  end if;

  if to_regclass('public.documents') is null then
    raise exception 'Project PDF service restoration requires public.documents';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'documents'
      and column_name in (
        'file_name', 'file_path', 'file_type', 'mime_type', 'size_bytes',
        'related_module', 'related_id', 'uploaded_by', 'uploaded_at', 'notes'
      )
    group by table_schema, table_name
    having count(*) = 10
  ) then
    raise exception 'Project PDF service restoration requires the canonical documents expand state';
  end if;
end
$$;

-- Temporary service restoration for either the hardened handlers or the prior
-- deployment relies on retaining the expand schema and existing compatibility
-- policies. Reassert only the private bucket and scoped service-role access.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do update
set
  name = excluded.name,
  public = false;

grant select, insert, update, delete on table public.documents to service_role;

notify pgrst, 'reload schema';

-- Inspect the canonical columns, private bucket, service-role grant, row/object
-- counts, and application rollback now. Explicitly finish or roll back this open
-- transaction after inspection; normal migrations never execute this file.
