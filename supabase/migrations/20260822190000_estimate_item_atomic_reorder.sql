-- Phase 2C: one atomic, server-authoritative item reorder contract.
-- Only cost_code and sort_order may change; all Estimate item content and
-- financial inputs remain untouched.

create or replace function public.reorder_estimate_items(
  p_estimate_id uuid,
  p_expected_items jsonb,
  p_ordered_items jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_status text;
  v_current_items jsonb;
  v_current_ids uuid[];
  v_ordered_ids uuid[];
  v_target_cost_codes text[];
  v_updated_count integer := 0;
begin
  if p_estimate_id is null then
    raise exception using errcode = '22023', message = 'Estimate is required.';
  end if;
  if p_expected_items is null or jsonb_typeof(p_expected_items) <> 'array' then
    raise exception using errcode = '22023', message = 'Expected item order is required.';
  end if;
  if p_ordered_items is null or jsonb_typeof(p_ordered_items) <> 'array' then
    raise exception using errcode = '22023', message = 'Ordered items must be an array.';
  end if;

  select e.status
  into v_status
  from public.estimates as e
  where e.id = p_estimate_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Estimate not found.';
  end if;
  if v_status not in ('Draft', 'Sent') then
    raise exception using errcode = '55000', message = 'This Estimate cannot be reordered.';
  end if;

  -- Lock the complete authoritative item set before validating either order.
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object('id', locked.id, 'costCode', locked.cost_code)
        order by locked.sort_order, locked.id
      ),
      '[]'::jsonb
    ),
    coalesce(array_agg(locked.id order by locked.sort_order, locked.id), '{}'::uuid[])
  into v_current_items, v_current_ids
  from (
    select i.id, i.cost_code, i.sort_order
    from public.estimate_items as i
    where i.estimate_id = p_estimate_id
    order by i.sort_order, i.id
    for update
  ) as locked;

  if v_current_items <> p_expected_items then
    raise exception using
      errcode = '40001',
      message = 'Estimate items changed. Reload and try the reorder again.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_ordered_items) as entry(value)
    where jsonb_typeof(entry.value) <> 'object'
      or nullif(btrim(entry.value ->> 'id'), '') is null
      or nullif(btrim(entry.value ->> 'costCode'), '') is null
  ) then
    raise exception using errcode = '22023', message = 'Every ordered item needs an id and Section.';
  end if;

  select
    coalesce(array_agg(parsed.item_id order by parsed.ordinality), '{}'::uuid[]),
    coalesce(array_agg(parsed.cost_code order by parsed.ordinality), '{}'::text[])
  into v_ordered_ids, v_target_cost_codes
  from (
    select
      (entry.value ->> 'id')::uuid as item_id,
      btrim(entry.value ->> 'costCode') as cost_code,
      entry.ordinality
    from jsonb_array_elements(p_ordered_items) with ordinality as entry(value, ordinality)
  ) as parsed;

  if cardinality(v_ordered_ids) <> cardinality(v_current_ids)
    or cardinality(v_ordered_ids) <> (
      select count(distinct item_id)::integer from unnest(v_ordered_ids) as item_id
    )
    or not (v_ordered_ids @> v_current_ids and v_current_ids @> v_ordered_ids)
  then
    raise exception using
      errcode = '23514',
      message = 'Ordered items must contain every Estimate item exactly once.';
  end if;

  -- Reorder may target only an existing Section. Legacy item-backed Sections
  -- remain valid without silently creating or name-matching a new category.
  if exists (
    select 1
    from unnest(v_target_cost_codes) as target(cost_code)
    where not exists (
      select 1
      from public.estimate_categories as c
      where c.estimate_id = p_estimate_id
        and c.cost_code = target.cost_code
    )
      and not exists (
        select 1
        from public.estimate_items as i
        where i.estimate_id = p_estimate_id
          and i.cost_code = target.cost_code
      )
  ) then
    raise exception using errcode = '23503', message = 'Target Estimate Section does not exist.';
  end if;

  with desired as (
    select
      (entry.value ->> 'id')::uuid as item_id,
      btrim(entry.value ->> 'costCode') as cost_code,
      (entry.ordinality - 1)::integer as normalized_sort_order
    from jsonb_array_elements(p_ordered_items) with ordinality as entry(value, ordinality)
  )
  update public.estimate_items as item
  set
    cost_code = desired.cost_code,
    sort_order = desired.normalized_sort_order
  from desired
  where item.estimate_id = p_estimate_id
    and item.id = desired.item_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> cardinality(v_current_ids) then
    raise exception using errcode = '40001', message = 'Estimate item reorder did not complete.';
  end if;

  update public.estimates
  set updated_at = (current_timestamp at time zone 'UTC')::date
  where id = p_estimate_id;

  return v_updated_count;
end
$function$;

revoke all on function public.reorder_estimate_items(uuid, jsonb, jsonb) from public;
revoke all on function public.reorder_estimate_items(uuid, jsonb, jsonb) from anon;
revoke all on function public.reorder_estimate_items(uuid, jsonb, jsonb) from authenticated;
grant execute on function public.reorder_estimate_items(uuid, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
