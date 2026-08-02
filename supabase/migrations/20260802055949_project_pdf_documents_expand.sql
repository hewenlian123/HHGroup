-- Project PDF P0 expand migration.
--
-- This migration is deliberately expand-only:
-- - legacy document columns and rows remain in place;
-- - Storage objects are never rewritten or deleted;
-- - existing document RLS policies/grants are not contracted in this phase;
-- - the attachments bucket is private and receives no new client policies.

set lock_timeout = '5s';
set statement_timeout = '120s';

do $$
begin
  if to_regclass('public.documents') is null then
    raise exception 'Project PDF expand incompatible: public.documents is missing';
  end if;

  if to_regclass('public.projects') is null then
    raise exception 'Project PDF expand incompatible: public.projects is missing';
  end if;

  if to_regclass('public.role_permissions') is null then
    raise exception 'Project PDF expand incompatible: public.role_permissions is missing';
  end if;
end
$$;

alter table public.documents
  add column if not exists file_name text,
  add column if not exists file_path text,
  add column if not exists file_type text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists related_module text,
  add column if not exists related_id uuid,
  add column if not exists uploaded_by text,
  add column if not exists uploaded_at timestamptz,
  add column if not exists notes text;

-- ADD COLUMN IF NOT EXISTS does not validate a pre-existing column's type.
-- Abort before any backfill if a canonical or required key column is incompatible.
do $$
declare
  incompatible_columns text;
begin
  with expected(column_name, expected_type) as (
    values
      ('id', 'uuid'),
      ('project_id', 'uuid'),
      ('file_name', 'text'),
      ('file_path', 'text'),
      ('file_type', 'text'),
      ('mime_type', 'text'),
      ('size_bytes', 'bigint'),
      ('related_module', 'text'),
      ('related_id', 'uuid'),
      ('uploaded_by', 'text'),
      ('uploaded_at', 'timestamp with time zone'),
      ('notes', 'text')
  )
  select string_agg(
    format('%I expected %s, found %s', expected.column_name, expected.expected_type, actual.data_type),
    '; '
    order by expected.column_name
  )
  into incompatible_columns
  from expected
  left join information_schema.columns actual
    on actual.table_schema = 'public'
   and actual.table_name = 'documents'
   and actual.column_name = expected.column_name
  where actual.column_name is null
     or actual.data_type <> expected.expected_type;

  if incompatible_columns is not null then
    raise exception 'Project PDF expand incompatible documents column type(s): %', incompatible_columns;
  end if;

  select string_agg(
    format('%I expected text, found %s', column_name, data_type),
    '; '
    order by column_name
  )
  into incompatible_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'documents'
    and column_name in ('name', 'file_url', 'category')
    and data_type <> 'text';

  if incompatible_columns is not null then
    raise exception 'Project PDF expand incompatible legacy documents column type(s): %', incompatible_columns;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'documents'
      and column_name = 'created_at'
      and data_type not in ('timestamp with time zone', 'timestamp without time zone')
  ) then
    raise exception 'Project PDF expand incompatible legacy documents.created_at type';
  end if;
end
$$;

-- Backfill only missing canonical values. Dynamic legacy expressions allow the
-- same forward migration to accept both the local five-column legacy shape and
-- the verified Production shape that also contains documents.name.
do $$
declare
  name_source text;
  file_url_source text;
  category_source text;
  created_at_source text;
begin
  name_source := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'documents' and column_name = 'name'
    ) then 'nullif(btrim(name), '''')'
    else 'null::text'
  end;

  file_url_source := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'documents' and column_name = 'file_url'
    ) then 'nullif(btrim(file_url), '''')'
    else 'null::text'
  end;

  category_source := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'documents' and column_name = 'category'
    ) then 'nullif(btrim(category), '''')'
    else 'null::text'
  end;

  created_at_source := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'documents' and column_name = 'created_at'
    ) then 'created_at::timestamptz'
    else 'null::timestamptz'
  end;

  execute format(
    $backfill$
      update public.documents
      set
        file_path = coalesce(
          case when btrim(file_path) <> '' then file_path end,
          %1$s
        ),
        file_name = coalesce(
          case when btrim(file_name) <> '' then file_name end,
          %2$s,
          nullif(regexp_replace(split_part(%1$s, '?', 1), '^.*/', ''), ''),
          'Document ' || id::text
        ),
        file_type = coalesce(
          case
            when file_type in (
              'Contract', 'Estimate', 'Invoice', 'Receipt', 'Subcontract',
              'Permit', 'Photo', 'Daily Log', 'Other'
            ) then file_type
          end,
          case
            when %3$s in (
              'Contract', 'Estimate', 'Invoice', 'Receipt', 'Subcontract',
              'Permit', 'Photo', 'Daily Log', 'Other'
            ) then %3$s
            else 'Other'
          end
        ),
        uploaded_at = coalesce(uploaded_at, %4$s, now())
      where file_path is null
         or btrim(file_path) = ''
         or file_name is null
         or btrim(file_name) = ''
         or file_type is null
         or file_type not in (
           'Contract', 'Estimate', 'Invoice', 'Receipt', 'Subcontract',
           'Permit', 'Photo', 'Daily Log', 'Other'
         )
         or uploaded_at is null
    $backfill$,
    file_url_source,
    name_source,
    category_source,
    created_at_source
  );
end
$$;

do $$
begin
  if exists (
    select 1
    from public.documents
    where file_path is null
       or btrim(file_path) = ''
       or file_name is null
       or btrim(file_name) = ''
       or file_type is null
       or uploaded_at is null
  ) then
    raise exception 'Project PDF expand incompatible: canonical document values could not be backfilled';
  end if;

  if exists (
    select 1
    from public.documents
    where file_path is not null
    group by file_path
    having count(*) > 1
  ) then
    raise exception 'Project PDF expand duplicate non-null documents.file_path values';
  end if;

  if exists (
    select 1
    from public.documents document
    left join public.projects project on project.id = document.project_id
    where document.project_id is not null
      and project.id is null
  ) then
    raise exception 'Project PDF expand incompatible: orphaned documents.project_id value';
  end if;
end
$$;

alter table public.documents
  alter column file_name set not null,
  alter column file_path set not null,
  alter column file_type set default 'Other',
  alter column file_type set not null,
  alter column uploaded_at set default now(),
  alter column uploaded_at set not null,
  alter column project_id drop not null;

alter table public.documents
  drop constraint if exists documents_size_bytes_nonnegative;
alter table public.documents
  add constraint documents_size_bytes_nonnegative
  check (size_bytes is null or size_bytes >= 0) not valid;
alter table public.documents
  validate constraint documents_size_bytes_nonnegative;

alter table public.documents
  drop constraint if exists documents_file_type_check;
alter table public.documents
  add constraint documents_file_type_check
  check (
    file_type in (
      'Contract', 'Estimate', 'Invoice', 'Receipt', 'Subcontract',
      'Permit', 'Photo', 'Daily Log', 'Other'
    )
  ) not valid;
alter table public.documents
  validate constraint documents_file_type_check;

-- Normalize the project foreign key without deleting or rewriting document rows.
do $$
declare
  constraint_record record;
  project_id_attribute smallint;
begin
  select attnum
  into project_id_attribute
  from pg_attribute
  where attrelid = 'public.documents'::regclass
    and attname = 'project_id'
    and not attisdropped;

  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.documents'::regclass
      and contype = 'f'
      and conkey = array[project_id_attribute]::smallint[]
  loop
    execute format(
      'alter table public.documents drop constraint %I',
      constraint_record.conname
    );
  end loop;

  alter table public.documents
    add constraint documents_project_id_fkey
    foreign key (project_id)
    references public.projects(id)
    on delete set null
    not valid;
end
$$;

alter table public.documents
  validate constraint documents_project_id_fkey;

create index if not exists idx_documents_project_id
  on public.documents (project_id);
create index if not exists idx_documents_file_type
  on public.documents (file_type);
create index if not exists idx_documents_related
  on public.documents (related_module, related_id);
create index if not exists idx_documents_uploaded_at
  on public.documents (uploaded_at desc);
create index if not exists idx_documents_file_name_lower
  on public.documents (lower(file_name));
create unique index if not exists ux_documents_file_path_not_null
  on public.documents (file_path)
  where file_path is not null;

-- The hardened handlers use a server-only service-role client after route-local
-- authentication and authorization. Grant only the route write target and the
-- read dependencies needed to preserve the existing PDF content. Compatibility
-- access remains unchanged.
grant select, insert, update, delete on table public.documents to service_role;
grant select on table
  public.project_material_selections,
  public.material_catalog,
  public.project_closeout_completion,
  public.project_closeout_punch,
  public.invoices,
  public.invoice_items,
  public.invoice_payments,
  public.project_change_orders,
  public.subcontract_bills,
  public.labor_entries,
  public.expense_lines,
  public.expenses,
  public.commissions,
  public.project_commissions
to service_role;

-- Owner remains allowed by the existing has_perm owner fallback. The owner-
-- approved phase policy explicitly keeps both mutation keys false for other roles.
update public.role_permissions
set perms = jsonb_set(
  jsonb_set(coalesce(perms, '{}'::jsonb), '{projects.update}', 'false'::jsonb, true),
  '{finance.manage}',
  'false'::jsonb,
  true
)
where role in ('admin', 'assistant');

-- Private by default, no MIME/size restriction, and no new Storage policies.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do update
set
  name = excluded.name,
  public = false;

alter table public.documents enable row level security;

comment on table public.documents is
  'Document metadata; legacy columns retained during the Project PDF expand phase.';
comment on column public.documents.file_path is
  'Unique non-null path within the private attachments Storage bucket.';
comment on column public.documents.related_id is
  'Optional related UUID; Project PDF handlers store their idempotency UUID here.';

notify pgrst, 'reload schema';
