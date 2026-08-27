-- Verify the hard-delete migration after it is applied to local Docker Supabase.

do $verify$
declare
  v_name text;
begin
  foreach v_name in array array[
    'project_tasks',
    'project_schedule',
    'punch_list',
    'material_catalog',
    'project_material_selections',
    'material_selections',
    'material_selection_items',
    'project_closeout_punch',
    'final_punch_lists',
    'final_punch_list_items'
  ] loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', v_name)) is not null then
      raise exception 'retired table public.% still exists', v_name;
    end if;
  end loop;

  if pg_catalog.to_regprocedure(
    'public.replace_final_punch_list(uuid,date,text,text,text,text,jsonb)'
  ) is not null then
    raise exception 'retired function public.replace_final_punch_list still exists';
  end if;

  if exists (
    select 1
    from storage.buckets
    where id in ('punch-photos', 'material-images')
  ) then
    raise exception 'retired storage bucket still exists';
  end if;

  if exists (
    select 1
    from storage.objects
    where bucket_id in ('punch-photos', 'material-images')
  ) then
    raise exception 'retired storage object still exists';
  end if;

  if pg_catalog.to_regclass('public.warranties') is null
     or pg_catalog.to_regclass('public.completion_certificates') is null then
    raise exception 'a canonical shared Closeout warranty/completion table is missing';
  end if;
end
$verify$;

select 'retired project modules verified' as result;
