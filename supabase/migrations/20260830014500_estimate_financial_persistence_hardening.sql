-- P0: make an Estimate's header, financial metadata, document style, and
-- optional category labels one server-authoritative transaction. The web
-- action has already authenticated an owner/admin; this function is therefore
-- intentionally callable only by the server's service_role client.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function public.update_estimate_meta_atomic(
  p_estimate_id uuid,
  p_patch jsonb
)
returns table (
  estimate_id uuid,
  updated_at date
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estimate public.estimates%rowtype;
  v_meta public.estimate_meta%rowtype;
  v_category_names jsonb;
  v_namespace jsonb;
  v_field text;
  v_number numeric;
  v_category_base_order integer;
begin
  if p_estimate_id is null then
    raise exception using errcode = '22023', message = 'Estimate is required.';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'Estimate patch must be an object.';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_patch) as patch_key(key)
    where patch_key.key not in (
      'customer_id',
      'client_name',
      'client_phone',
      'client_email',
      'client_address',
      'project_name',
      'project_site_address',
      'tax',
      'discount',
      'overhead_pct',
      'profit_pct',
      'estimate_date',
      'valid_until',
      'notes',
      'document_notes',
      'sales_person',
      'document_style',
      'category_names'
    )
  ) then
    raise exception using errcode = '22023', message = 'Estimate patch contains an unknown field.';
  end if;

  -- This lock serializes status checks, category allocation, and every pricing
  -- edit made through this contract.
  select e.*
  into v_estimate
  from public.estimates as e
  where e.id = p_estimate_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Estimate not found.';
  end if;
  if v_estimate.status not in ('Draft', 'Sent') then
    raise exception using
      errcode = '55000',
      message = 'Only Draft or Sent Estimates can be edited.';
  end if;

  select m.*
  into v_meta
  from public.estimate_meta as m
  where m.estimate_id = p_estimate_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'Estimate details are incomplete.';
  end if;

  if p_patch ? 'customer_id' then
    if jsonb_typeof(p_patch -> 'customer_id') not in ('string', 'null')
      or (
        jsonb_typeof(p_patch -> 'customer_id') = 'string'
        and (
          btrim(p_patch ->> 'customer_id') = ''
          or btrim(p_patch ->> 'customer_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
    then
      raise exception using errcode = '22023', message = 'Customer id must be a UUID or null.';
    end if;
  end if;

  foreach v_field in array array[
    'client_name', 'client_phone', 'client_email', 'client_address',
    'project_name', 'project_site_address', 'notes', 'sales_person'
  ] loop
    if p_patch ? v_field and jsonb_typeof(p_patch -> v_field) <> 'string' then
      raise exception using errcode = '22023', message = format('%s must be a string.', v_field);
    end if;
  end loop;

  -- JSON numbers exclude NaN and Infinity. Preserve the existing Estimate
  -- contract: negative finite values are not rejected by this persistence path.
  foreach v_field in array array['tax', 'discount', 'overhead_pct', 'profit_pct'] loop
    if p_patch ? v_field then
      if jsonb_typeof(p_patch -> v_field) <> 'number' then
        raise exception using
          errcode = '22023',
          message = format('%s must be a finite number.', v_field);
      end if;
      v_number := (p_patch ->> v_field)::numeric;
    end if;
  end loop;

  foreach v_field in array array['estimate_date', 'valid_until'] loop
    if p_patch ? v_field and jsonb_typeof(p_patch -> v_field) not in ('string', 'null') then
      raise exception using errcode = '22023', message = format('%s must be an ISO date or null.', v_field);
    end if;
    if p_patch ? v_field and jsonb_typeof(p_patch -> v_field) = 'string' then
      if p_patch ->> v_field !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception using errcode = '22023', message = format('%s must be an ISO date or null.', v_field);
      end if;
      perform (p_patch ->> v_field)::date;
    end if;
  end loop;

  if p_patch ? 'document_style'
    and (
      jsonb_typeof(p_patch -> 'document_style') <> 'string'
      or p_patch ->> 'document_style' not in ('proposal', 'itemized')
    )
  then
    raise exception using errcode = '22023', message = 'Document style is invalid.';
  end if;

  if p_patch ? 'document_notes' then
    if jsonb_typeof(p_patch -> 'document_notes') <> 'array'
      or exists (
        select 1
        from jsonb_array_elements(p_patch -> 'document_notes') as note(value)
        where jsonb_typeof(note.value) <> 'object'
          or jsonb_typeof(note.value -> 'id') <> 'string'
          or jsonb_typeof(note.value -> 'type') <> 'string'
          or jsonb_typeof(note.value -> 'title') <> 'string'
          or jsonb_typeof(note.value -> 'body') <> 'string'
          or note.value ->> 'type' not in (
            'exclusions', 'assumptions', 'payment_terms', 'warranty', 'schedule_note', 'custom'
          )
      )
    then
      raise exception using errcode = '22023', message = 'Document notes are invalid.';
    end if;
  end if;

  if p_patch ? 'category_names' then
    if jsonb_typeof(p_patch -> 'category_names') <> 'array'
      or exists (
        select 1
        from jsonb_array_elements(p_patch -> 'category_names') as category(value)
        where jsonb_typeof(category.value) <> 'object'
          or jsonb_typeof(category.value -> 'cost_code') <> 'string'
          or jsonb_typeof(category.value -> 'display_name') <> 'string'
          or btrim(category.value ->> 'cost_code') = ''
          or category.value ->> 'cost_code' = '__hh'
      )
      or (
        select count(*) <> count(distinct btrim(category.value ->> 'cost_code'))
        from jsonb_array_elements(p_patch -> 'category_names') as category(value)
      )
    then
      raise exception using errcode = '22023', message = 'Category names must be unique valid entries.';
    end if;
  end if;

  v_category_names := case
    when jsonb_typeof(v_meta.cost_category_names) = 'object' then v_meta.cost_category_names
    else '{}'::jsonb
  end;
  if p_patch ? 'document_style' then
    v_namespace := case
      when jsonb_typeof(v_category_names -> '__hh') = 'object' then v_category_names -> '__hh'
      else '{}'::jsonb
    end;
    v_category_names := jsonb_set(
      v_category_names,
      '{__hh}',
      v_namespace || jsonb_build_object('documentStyle', p_patch ->> 'document_style'),
      true
    );
  end if;

  -- A retry of an intentionally empty patch is a read-only success: it must
  -- not change updated_at or manufacture any secondary writes.
  if p_patch = '{}'::jsonb then
    estimate_id := v_estimate.id;
    updated_at := v_estimate.updated_at;
    return next;
    return;
  end if;

  update public.estimate_meta as m
  set
    client_name = case when p_patch ? 'client_name' then p_patch ->> 'client_name' else m.client_name end,
    client_phone = case when p_patch ? 'client_phone' then p_patch ->> 'client_phone' else m.client_phone end,
    client_email = case when p_patch ? 'client_email' then p_patch ->> 'client_email' else m.client_email end,
    client_address = case when p_patch ? 'client_address' then p_patch ->> 'client_address' else m.client_address end,
    project_name = case when p_patch ? 'project_name' then p_patch ->> 'project_name' else m.project_name end,
    project_site_address = case when p_patch ? 'project_site_address' then p_patch ->> 'project_site_address' else m.project_site_address end,
    tax = case when p_patch ? 'tax' then (p_patch ->> 'tax')::numeric else m.tax end,
    discount = case when p_patch ? 'discount' then (p_patch ->> 'discount')::numeric else m.discount end,
    overhead_pct = case when p_patch ? 'overhead_pct' then (p_patch ->> 'overhead_pct')::numeric else m.overhead_pct end,
    profit_pct = case when p_patch ? 'profit_pct' then (p_patch ->> 'profit_pct')::numeric else m.profit_pct end,
    estimate_date = case when p_patch ? 'estimate_date' then (p_patch ->> 'estimate_date')::date else m.estimate_date end,
    valid_until = case when p_patch ? 'valid_until' then (p_patch ->> 'valid_until')::date else m.valid_until end,
    notes = case when p_patch ? 'notes' then p_patch ->> 'notes' else m.notes end,
    document_notes = case when p_patch ? 'document_notes' then p_patch -> 'document_notes' else m.document_notes end,
    sales_person = case when p_patch ? 'sales_person' then p_patch ->> 'sales_person' else m.sales_person end,
    cost_category_names = v_category_names
  where m.estimate_id = p_estimate_id;

  update public.estimates as e
  set
    customer_id = case
      when not (p_patch ? 'customer_id') then e.customer_id
      when jsonb_typeof(p_patch -> 'customer_id') = 'null' then null
      else (p_patch ->> 'customer_id')::uuid
    end,
    client = case
      when p_patch ? 'client_name' and nullif(btrim(p_patch ->> 'client_name'), '') is not null
        then p_patch ->> 'client_name'
      else e.client
    end,
    project = case
      when p_patch ? 'project_name' and nullif(btrim(p_patch ->> 'project_name'), '') is not null
        then p_patch ->> 'project_name'
      else e.project
    end,
    updated_at = (current_timestamp at time zone 'UTC')::date
  where e.id = p_estimate_id
  returning e.id, e.updated_at into estimate_id, updated_at;

  if p_patch ? 'category_names' then
    select coalesce(max(c.order_index) + 1, 0)
    into v_category_base_order
    from public.estimate_categories as c
    where c.estimate_id = p_estimate_id;

    with supplied as (
      select
        btrim(category.value ->> 'cost_code') as cost_code,
        category.value ->> 'display_name' as display_name,
        category.ordinality
      from jsonb_array_elements(p_patch -> 'category_names') with ordinality as category(value, ordinality)
    ),
    new_categories as (
      select
        supplied.cost_code,
        supplied.display_name,
        row_number() over (order by supplied.ordinality) - 1 as new_offset
      from supplied
      where not exists (
        select 1
        from public.estimate_categories as existing
        where existing.estimate_id = p_estimate_id
          and existing.cost_code = supplied.cost_code
      )
    ),
    rows_to_upsert as (
      select
        supplied.cost_code,
        supplied.display_name,
        existing.order_index
      from supplied
      join public.estimate_categories as existing
        on existing.estimate_id = p_estimate_id
       and existing.cost_code = supplied.cost_code
      union all
      select
        new_categories.cost_code,
        new_categories.display_name,
        v_category_base_order + new_categories.new_offset
      from new_categories
    )
    insert into public.estimate_categories (
      estimate_id,
      cost_code,
      display_name,
      order_index
    )
    select
      p_estimate_id,
      rows_to_upsert.cost_code,
      rows_to_upsert.display_name,
      rows_to_upsert.order_index
    from rows_to_upsert
    on conflict on constraint estimate_categories_pkey do update
    set display_name = excluded.display_name;
  end if;

  return next;
end
$$;
