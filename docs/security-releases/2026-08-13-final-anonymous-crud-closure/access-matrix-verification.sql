-- Execute after the forward migration in an isolated local environment.
-- All mutation probes roll back. Do not use this file to test Production.

-- Helper pattern: each statement must be rejected at the Postgres privilege
-- boundary, not merely filtered by RLS to zero rows.
begin;
set local role anon;
do $$
declare
  statement_text text;
begin
  foreach statement_text in array array[
    'select 1 from public.cost_allocations limit 1',
    'insert into public.cost_allocations default values',
    'update public.cost_allocations set category = ''__security_probe__'' where false',
    'delete from public.cost_allocations where false',
    'select 1 from public.material_selections limit 1',
    'insert into public.material_selections (title) values (''__security_probe__'')',
    'update public.material_selections set title = ''__security_probe__'' where false',
    'delete from public.material_selections where false',
    'select 1 from public.material_selection_items limit 1',
    'insert into public.material_selection_items (selection_id, item_name) values (''00000000-0000-0000-0000-000000000001'', ''__security_probe__'')',
    'update public.material_selection_items set item_name = ''__security_probe__'' where false',
    'delete from public.material_selection_items where false'
  ] loop
    begin
      execute statement_text;
      raise exception 'anon unexpectedly executed: %', statement_text;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
end
$$;
rollback;

-- Non-owner authenticated users are also denied every direct operation.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","app_metadata":{"role":"member"}}',
  true
);
do $$
declare
  statement_text text;
begin
  foreach statement_text in array array[
    'select 1 from public.cost_allocations limit 1',
    'insert into public.cost_allocations default values',
    'update public.cost_allocations set category = ''__security_probe__'' where false',
    'delete from public.cost_allocations where false',
    'select 1 from public.material_selections limit 1',
    'insert into public.material_selections (title) values (''__security_probe__'')',
    'update public.material_selections set title = ''__security_probe__'' where false',
    'delete from public.material_selections where false',
    'select 1 from public.material_selection_items limit 1',
    'insert into public.material_selection_items (selection_id, item_name) values (''00000000-0000-0000-0000-000000000001'', ''__security_probe__'')',
    'update public.material_selection_items set item_name = ''__security_probe__'' where false',
    'delete from public.material_selection_items where false'
  ] loop
    begin
      execute statement_text;
      raise exception 'non-owner unexpectedly executed: %', statement_text;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
end
$$;
rollback;

-- Owner/admin has no direct Data API table grant. Owner/admin access is enforced
-- by the guarded Next.js server boundary before the service-role client is made.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","app_metadata":{"role":"owner"}}',
  true
);
do $$
declare
  statement_text text;
begin
  foreach statement_text in array array[
    'select 1 from public.cost_allocations limit 1',
    'insert into public.cost_allocations default values',
    'update public.cost_allocations set category = ''__security_probe__'' where false',
    'delete from public.cost_allocations where false',
    'select 1 from public.material_selections limit 1',
    'insert into public.material_selections (title) values (''__security_probe__'')',
    'update public.material_selections set title = ''__security_probe__'' where false',
    'delete from public.material_selections where false',
    'select 1 from public.material_selection_items limit 1',
    'insert into public.material_selection_items (selection_id, item_name) values (''00000000-0000-0000-0000-000000000001'', ''__security_probe__'')',
    'update public.material_selection_items set item_name = ''__security_probe__'' where false',
    'delete from public.material_selection_items where false'
  ] loop
    begin
      execute statement_text;
      raise exception 'owner unexpectedly executed direct table access: %', statement_text;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
end
$$;
rollback;

-- Service role is server-only. It can perform Material Selection CRUD, while
-- cost_allocations remains fully closed because no current service path needs it.
begin;
set local role service_role;
do $$
declare
  selection_id uuid;
  item_id uuid;
  statement_text text;
begin
  insert into public.material_selections (title, notes)
  values ('__security_probe__', 'created only inside rolled-back access matrix')
  returning id into selection_id;

  insert into public.material_selection_items (selection_id, item_name)
  values (selection_id, '__security_probe__')
  returning id into item_id;

  update public.material_selections
  set notes = 'updated only inside rolled-back access matrix'
  where id = selection_id;

  delete from public.material_selections where id = selection_id;

  if exists (select 1 from public.material_selection_items where id = item_id) then
    raise exception 'material selection cascade delete did not remove the probe item';
  end if;

  foreach statement_text in array array[
    'select 1 from public.cost_allocations limit 1',
    'insert into public.cost_allocations default values',
    'update public.cost_allocations set category = ''__security_probe__'' where false',
    'delete from public.cost_allocations where false'
  ] loop
    begin
      execute statement_text;
      raise exception 'service_role unexpectedly executed cost allocation access: %', statement_text;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
end
$$;
rollback;
