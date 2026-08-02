-- Canonical Project Closeout reconciliation.
-- Local verification must prove the preflight before this is promoted anywhere.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Fail closed unless the canonical relations and their confirmed foreign keys are exact.
do $preflight$
declare
  v_table text;
  v_expected_columns text[];
  v_actual_columns text[];
begin
  foreach v_table in array array[
    'final_punch_lists',
    'final_punch_list_items',
    'warranties',
    'completion_certificates'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relkind = 'r'
    ) then
      raise exception using
        errcode = 'P0001',
        message = format('canonical Closeout table public.%I is missing or is not an ordinary table', v_table);
    end if;
  end loop;

  select pg_catalog.array_agg(
           a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod)
           order by a.attnum
         )
    into v_actual_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.final_punch_lists'::pg_catalog.regclass
    and a.attnum > 0
    and not a.attisdropped;
  v_expected_columns := array[
    'id:uuid', 'project_id:uuid', 'inspection_date:date', 'inspector:text',
    'notes:text', 'contractor_signature:text', 'client_signature:text',
    'created_at:timestamp without time zone'
  ];
  if v_actual_columns is distinct from v_expected_columns then
    raise exception using errcode = 'P0001', message = 'final_punch_lists column contract is incompatible';
  end if;

  select pg_catalog.array_agg(
           a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod)
           order by a.attnum
         )
    into v_actual_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.final_punch_list_items'::pg_catalog.regclass
    and a.attnum > 0
    and not a.attisdropped;
  if v_actual_columns not in (
    array['id:uuid', 'punch_list_id:uuid', 'item:text', 'status:text'],
    array['id:uuid', 'punch_list_id:uuid', 'item:text', 'status:text', 'position:integer']
  ) then
    raise exception using errcode = 'P0001', message = 'final_punch_list_items column contract is incompatible';
  end if;

  select pg_catalog.array_agg(
           a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod)
           order by a.attnum
         )
    into v_actual_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.warranties'::pg_catalog.regclass
    and a.attnum > 0
    and not a.attisdropped;
  v_expected_columns := array[
    'id:uuid', 'project_id:uuid', 'start_date:date', 'period_months:integer',
    'notes:text', 'created_at:timestamp without time zone'
  ];
  if v_actual_columns is distinct from v_expected_columns then
    raise exception using errcode = 'P0001', message = 'warranties column contract is incompatible';
  end if;

  select pg_catalog.array_agg(
           a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod)
           order by a.attnum
         )
    into v_actual_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.completion_certificates'::pg_catalog.regclass
    and a.attnum > 0
    and not a.attisdropped;
  v_expected_columns := array[
    'id:uuid', 'project_id:uuid', 'completion_date:date', 'contractor_name:text',
    'client_name:text', 'contractor_signature:text', 'client_signature:text',
    'created_at:timestamp without time zone'
  ];
  if v_actual_columns is distinct from v_expected_columns then
    raise exception using errcode = 'P0001', message = 'completion_certificates column contract is incompatible';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'final_punch_lists_project_id_fkey'
      and conrelid = 'public.final_punch_lists'::pg_catalog.regclass
      and pg_catalog.pg_get_constraintdef(oid, true) =
          'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'final_punch_list_items_punch_list_id_fkey'
      and conrelid = 'public.final_punch_list_items'::pg_catalog.regclass
      and pg_catalog.pg_get_constraintdef(oid, true) =
          'FOREIGN KEY (punch_list_id) REFERENCES final_punch_lists(id) ON DELETE CASCADE'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'warranties_project_id_fkey'
      and conrelid = 'public.warranties'::pg_catalog.regclass
      and pg_catalog.pg_get_constraintdef(oid, true) =
          'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'completion_certificates_project_id_fkey'
      and conrelid = 'public.completion_certificates'::pg_catalog.regclass
      and pg_catalog.pg_get_constraintdef(oid, true) =
          'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE'
  ) then
    raise exception using errcode = 'P0001', message = 'canonical Closeout foreign-key contract is incompatible';
  end if;

  if (select pg_catalog.count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'has_perm') <> 1
     or not exists (
       select 1
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'has_perm'
         and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_key text'
         and p.prorettype = 'boolean'::pg_catalog.regtype
         and p.provolatile = 's'
         and p.prosecdef
         and p.proconfig @> array['search_path=public']
     ) then
    raise exception using errcode = 'P0001', message = 'public.has_perm(text) contract is incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint con
    where con.conrelid = 'public.role_permissions'::pg_catalog.regclass
      and con.contype in ('p', 'u')
      and pg_catalog.pg_get_constraintdef(con.oid, true) in ('PRIMARY KEY (role)', 'UNIQUE (role)')
  ) then
    raise exception using errcode = 'P0001', message = 'role_permissions.role is not index-supported';
  end if;

  if (select count(*)
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename in (
          'final_punch_lists', 'final_punch_list_items',
          'warranties', 'completion_certificates'
        )) <> 16
     or exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('final_punch_lists', 'final_punch_list_items', 'warranties', 'completion_certificates')
      and not (
        roles = array['authenticated']::name[]
        and (
          (policyname = 'allow authenticated read' and cmd = 'SELECT' and qual = 'true' and with_check is null)
          or (policyname = 'allow authenticated insert' and cmd = 'INSERT' and qual is null and with_check = 'true')
          or (policyname = 'allow authenticated update' and cmd = 'UPDATE' and qual = 'true' and with_check is null)
          or (policyname = 'allow authenticated delete' and cmd = 'DELETE' and qual = 'true' and with_check is null)
        )
      )
  ) then
    raise exception using errcode = 'P0001', message = 'canonical Closeout table has an incompatible RLS policy';
  end if;

  if exists (select 1 from public.final_punch_lists where project_id is null)
     or exists (select 1 from public.warranties where project_id is null)
     or exists (select 1 from public.completion_certificates where project_id is null) then
    raise exception using errcode = '23502', message = 'canonical Closeout parent contains a null project_id';
  end if;

  if exists (select project_id from public.final_punch_lists group by project_id having count(*) > 1)
     or exists (select project_id from public.warranties group by project_id having count(*) > 1)
     or exists (select project_id from public.completion_certificates group by project_id having count(*) > 1) then
    raise exception using errcode = '23505', message = 'canonical Closeout parent contains duplicate project_id values';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.final_punch_list_items'::pg_catalog.regclass
      and attname = 'position' and not attisdropped
  ) and exists (select 1 from public.final_punch_list_items) then
    raise exception using errcode = 'P0001', message = 'unsafe item ordering: existing punch items have no position';
  end if;
end
$preflight$;

alter table public.final_punch_list_items add column if not exists position integer;

do $data_preflight$
begin
  if exists (
    select 1 from public.final_punch_list_items i
    where i.punch_list_id is null
       or i.position is null
       or i.status is null
       or i.position < 0
       or i.status not in ('pending', 'done')
       or not exists (select 1 from public.final_punch_lists p where p.id = i.punch_list_id)
  ) then
    raise exception using errcode = 'P0001', message = 'canonical punch item contains null, orphaned, negative, or invalid data';
  end if;

  if exists (
    select punch_list_id, position
    from public.final_punch_list_items
    group by punch_list_id, position
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'canonical punch items contain duplicate parent positions';
  end if;
end
$data_preflight$;

alter table public.final_punch_lists
  alter column project_id set not null,
  add constraint final_punch_lists_project_id_key unique (project_id);

alter table public.warranties
  alter column project_id set not null,
  add constraint warranties_project_id_key unique (project_id);

alter table public.completion_certificates
  alter column project_id set not null,
  add constraint completion_certificates_project_id_key unique (project_id);

alter table public.final_punch_list_items
  alter column punch_list_id set not null,
  alter column position set not null,
  alter column status set default 'pending',
  alter column status set not null,
  add constraint final_punch_list_items_position_check check (position >= 0),
  add constraint final_punch_list_items_status_check check (status in ('pending', 'done')),
  add constraint final_punch_list_items_punch_list_position_key unique (punch_list_id, position);

-- Replace broad authenticated CRUD policies with one permission-filtered read policy.
drop policy if exists "allow authenticated read" on public.final_punch_lists;
drop policy if exists "allow authenticated insert" on public.final_punch_lists;
drop policy if exists "allow authenticated update" on public.final_punch_lists;
drop policy if exists "allow authenticated delete" on public.final_punch_lists;
drop policy if exists "closeout projects.update read" on public.final_punch_lists;
create policy "closeout projects.update read" on public.final_punch_lists
  for select to authenticated
  using ((select public.has_perm('projects.update')));

drop policy if exists "allow authenticated read" on public.final_punch_list_items;
drop policy if exists "allow authenticated insert" on public.final_punch_list_items;
drop policy if exists "allow authenticated update" on public.final_punch_list_items;
drop policy if exists "allow authenticated delete" on public.final_punch_list_items;
drop policy if exists "closeout projects.update read" on public.final_punch_list_items;
create policy "closeout projects.update read" on public.final_punch_list_items
  for select to authenticated
  using ((select public.has_perm('projects.update')));

drop policy if exists "allow authenticated read" on public.warranties;
drop policy if exists "allow authenticated insert" on public.warranties;
drop policy if exists "allow authenticated update" on public.warranties;
drop policy if exists "allow authenticated delete" on public.warranties;
drop policy if exists "closeout projects.update read" on public.warranties;
create policy "closeout projects.update read" on public.warranties
  for select to authenticated
  using ((select public.has_perm('projects.update')));

drop policy if exists "allow authenticated read" on public.completion_certificates;
drop policy if exists "allow authenticated insert" on public.completion_certificates;
drop policy if exists "allow authenticated update" on public.completion_certificates;
drop policy if exists "allow authenticated delete" on public.completion_certificates;
drop policy if exists "closeout projects.update read" on public.completion_certificates;
create policy "closeout projects.update read" on public.completion_certificates
  for select to authenticated
  using ((select public.has_perm('projects.update')));

revoke all privileges on table public.final_punch_lists from anon, authenticated, service_role;
revoke all privileges on table public.final_punch_list_items from anon, authenticated, service_role;
revoke all privileges on table public.warranties from anon, authenticated, service_role;
revoke all privileges on table public.completion_certificates from anon, authenticated, service_role;

grant select on table public.final_punch_lists to authenticated;
grant select on table public.final_punch_list_items to authenticated;
grant select on table public.warranties to authenticated;
grant select on table public.completion_certificates to authenticated;

grant select, insert, update, delete on table public.final_punch_lists to service_role;
grant select, insert, delete on table public.final_punch_list_items to service_role;
grant select, insert, update, delete on table public.warranties to service_role;
grant select, insert, update, delete on table public.completion_certificates to service_role;

create or replace function public.replace_final_punch_list(
  p_project_id uuid,
  p_inspection_date date,
  p_inspector text,
  p_notes text,
  p_contractor_signature text,
  p_client_signature text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '15s'
as $function$
declare
  v_punch_list_id uuid;
begin
  if p_project_id is null then
    raise exception using errcode = '22023', message = 'invalid closeout input';
  end if;

  if p_items is null
     or pg_catalog.jsonb_typeof(p_items) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_items) > 200
     or pg_catalog.char_length(p_inspector) > 300
     or pg_catalog.char_length(p_notes) > 4000
     or pg_catalog.char_length(p_contractor_signature) > 2000
     or pg_catalog.char_length(p_client_signature) > 2000 then
    raise exception using errcode = '22023', message = 'invalid closeout input';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) as entry(value)
    where pg_catalog.jsonb_typeof(entry.value) is distinct from 'object'
       or not (entry.value ?& array['item', 'status'])
       or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(entry.value)) <> 2
       or pg_catalog.jsonb_typeof(entry.value -> 'item') is distinct from 'string'
       or pg_catalog.jsonb_typeof(entry.value -> 'status') is distinct from 'string'
       or pg_catalog.char_length(entry.value ->> 'item') > 1000
       or (entry.value ->> 'status') not in ('pending', 'done')
  ) then
    raise exception using errcode = '22023', message = 'invalid closeout input';
  end if;

  perform 1
  from public.projects
  where id = p_project_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'project not found';
  end if;

  insert into public.final_punch_lists (
    project_id,
    inspection_date,
    inspector,
    notes,
    contractor_signature,
    client_signature
  ) values (
    p_project_id,
    p_inspection_date,
    p_inspector,
    p_notes,
    p_contractor_signature,
    p_client_signature
  )
  on conflict (project_id) do update set
    inspection_date = excluded.inspection_date,
    inspector = excluded.inspector,
    notes = excluded.notes,
    contractor_signature = excluded.contractor_signature,
    client_signature = excluded.client_signature
  returning id into v_punch_list_id;

  delete from public.final_punch_list_items
  where punch_list_id = v_punch_list_id;

  insert into public.final_punch_list_items (punch_list_id, item, status, position)
  select
    v_punch_list_id,
    entry.value ->> 'item',
    entry.value ->> 'status',
    (entry.ordinality - 1)::integer
  from pg_catalog.jsonb_array_elements(p_items) with ordinality as entry(value, ordinality);

  return v_punch_list_id;
end
$function$;

revoke execute on function public.replace_final_punch_list(uuid, date, text, text, text, text, jsonb) from public;
revoke execute on function public.replace_final_punch_list(uuid, date, text, text, text, text, jsonb) from anon;
revoke execute on function public.replace_final_punch_list(uuid, date, text, text, text, text, jsonb) from authenticated;
grant execute on function public.replace_final_punch_list(uuid, date, text, text, text, text, jsonb) to service_role;

-- Accept and remove only the exact, empty historical Closeout tables from clean replay.
do $legacy_preflight$
declare
  v_table text;
  v_oid oid;
  v_rows bigint;
  v_expected_count integer;
  v_actual_columns text[];
  v_expected_columns text[];
begin
  foreach v_table in array array[
    'project_closeout_punch',
    'project_closeout_warranty',
    'project_closeout_completion'
  ] loop
    select c.oid into v_oid
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_table;

    if v_oid is null then
      continue;
    end if;

    if (select relkind from pg_catalog.pg_class where oid = v_oid) <> 'r' then
      raise exception using errcode = 'P0001', message = format('legacy Closeout name public.%I is not an ordinary table', v_table);
    end if;

    execute format('lock table public.%I in access exclusive mode', v_table);
    execute format('select count(*) from public.%I', v_table) into v_rows;
    if v_rows <> 0 then
      raise exception using
        errcode = 'P0001',
        message = format('legacy Closeout table public.%I contains data', v_table);
    end if;

    select pg_catalog.array_agg(
             a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text
             order by a.attnum
           )
      into v_actual_columns
    from pg_catalog.pg_attribute a
    where a.attrelid = v_oid and a.attnum > 0 and not a.attisdropped;

    if v_table = 'project_closeout_punch' then
      v_expected_columns := array[
        'id:uuid:true', 'project_id:uuid:true', 'inspection_date:date:false',
        'inspector:text:false', 'notes:text:false', 'contractor_signature:text:false',
        'client_signature:text:false', 'items:jsonb:true',
        'created_at:timestamp with time zone:true', 'updated_at:timestamp with time zone:true'
      ];
      v_expected_count := 3;
    elsif v_table = 'project_closeout_warranty' then
      v_expected_columns := array[
        'id:uuid:true', 'project_id:uuid:true', 'start_date:date:false',
        'period_months:integer:true', 'notes:text:false',
        'created_at:timestamp with time zone:true', 'updated_at:timestamp with time zone:true'
      ];
      v_expected_count := 3;
    else
      v_expected_columns := array[
        'id:uuid:true', 'project_id:uuid:true', 'completion_date:date:false',
        'contractor_name:text:false', 'client_name:text:false',
        'contractor_signature:text:false', 'client_signature:text:false',
        'created_at:timestamp with time zone:true', 'updated_at:timestamp with time zone:true'
      ];
      v_expected_count := 3;
    end if;

    if v_actual_columns is distinct from v_expected_columns then
      raise exception using errcode = 'P0001', message = format('legacy Closeout table public.%I has an incompatible schema', v_table);
    end if;

    if (select count(*) from pg_catalog.pg_constraint where conrelid = v_oid) <> v_expected_count
       or not exists (
         select 1 from pg_catalog.pg_constraint
         where conrelid = v_oid and contype = 'p'
           and pg_catalog.pg_get_constraintdef(oid, true) = 'PRIMARY KEY (id)'
       )
       or not exists (
         select 1 from pg_catalog.pg_constraint
         where conrelid = v_oid and contype = 'u'
           and pg_catalog.pg_get_constraintdef(oid, true) = 'UNIQUE (project_id)'
       )
       or not exists (
         select 1 from pg_catalog.pg_constraint
         where conrelid = v_oid and contype = 'f'
           and pg_catalog.pg_get_constraintdef(oid, true) =
               'FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE'
       ) then
      raise exception using errcode = 'P0001', message = format('legacy Closeout table public.%I has unexpected constraints', v_table);
    end if;

    if (select count(*) from pg_catalog.pg_indexes where schemaname = 'public' and tablename = v_table) <> 3 then
      raise exception using errcode = 'P0001', message = format('legacy Closeout table public.%I has unexpected indexes', v_table);
    end if;

    if exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = v_table
        and not (
          policyname in (v_table || '_select', v_table || '_insert', v_table || '_update')
          and roles = array['anon']::name[]
          and (
            (cmd = 'SELECT' and policyname = v_table || '_select' and qual = 'true' and with_check is null)
            or (cmd = 'INSERT' and policyname = v_table || '_insert' and qual is null and with_check = 'true')
            or (cmd = 'UPDATE' and policyname = v_table || '_update' and qual = 'true' and with_check = 'true')
          )
        )
    ) or (select count(*) from pg_catalog.pg_policies where schemaname = 'public' and tablename = v_table) <> 3 then
      raise exception using errcode = 'P0001', message = format('legacy Closeout table public.%I has an unexpected policy', v_table);
    end if;

    if exists (
      select 1 from pg_catalog.pg_constraint
      where confrelid = v_oid and conrelid <> v_oid
    ) or exists (
      select 1 from pg_catalog.pg_trigger
      where tgrelid = v_oid and not tgisinternal
    ) or exists (
      select 1
      from pg_catalog.pg_depend d
      join pg_catalog.pg_rewrite r on d.classid = 'pg_rewrite'::pg_catalog.regclass and r.oid = d.objid
      where d.refobjid = v_oid and r.ev_class <> v_oid
    ) or exists (
      select 1
      from pg_catalog.pg_depend d
      where d.refobjid = v_oid
        and d.classid = 'pg_proc'::pg_catalog.regclass
    ) or exists (
      select 1 from pg_catalog.pg_publication_rel where prrelid = v_oid
    ) or exists (
      select 1 from pg_catalog.pg_depend
      where objid = v_oid and deptype = 'e'
    ) then
      raise exception using errcode = 'P0001', message = format('unexpected dependency on legacy Closeout table public.%I', v_table);
    end if;

    execute format('revoke all privileges on table public.%I from public, anon, authenticated, service_role', v_table);
    execute format('drop policy %I on public.%I', v_table || '_select', v_table);
    execute format('drop policy %I on public.%I', v_table || '_insert', v_table);
    execute format('drop policy %I on public.%I', v_table || '_update', v_table);
  end loop;
end
$legacy_preflight$;

drop table if exists public.project_closeout_punch;
drop table if exists public.project_closeout_warranty;
drop table if exists public.project_closeout_completion;

do $final_assertions$
begin
  if pg_catalog.to_regclass('public.project_closeout_punch') is not null
     or pg_catalog.to_regclass('public.project_closeout_warranty') is not null
     or pg_catalog.to_regclass('public.project_closeout_completion') is not null then
    raise exception using errcode = 'P0001', message = 'legacy Closeout removal did not complete';
  end if;
end
$final_assertions$;

notify pgrst, 'reload schema';

commit;
