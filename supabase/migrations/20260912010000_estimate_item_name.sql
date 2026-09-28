-- Independent item name. Existing detailed descriptions remain byte-for-byte unchanged.
alter table public.estimate_items add column if not exists item_name text not null default '';
update public.estimate_items
set item_name = split_part("desc", E'\n', 1)
where item_name is null or item_name = '';

create or replace function public.copy_estimate_as_draft_core(
  p_source_estimate_id uuid,
  p_revision_root_id uuid,
  p_revision_number integer,
  p_previous_revision_id uuid
)
returns table (
  estimate_id uuid,
  estimate_number text,
  revision_number integer
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_source public.estimates%rowtype;
  v_new_estimate_id uuid := gen_random_uuid();
  v_new_estimate_number text;
  v_new_revision_root_id uuid;
  v_number_attempts integer := 0;
  v_estimate_total numeric;
  v_schedule_total numeric;
begin
  if p_source_estimate_id is null then
    raise exception using errcode = '22023', message = 'Source Estimate is required.';
  end if;
  if p_revision_number is null or p_revision_number < 0 then
    raise exception using errcode = '22023', message = 'Revision number is invalid.';
  end if;
  if p_revision_number = 0
    and (p_revision_root_id is not null or p_previous_revision_id is not null)
  then
    raise exception using errcode = '22023', message = 'Standalone copies cannot inherit lineage.';
  end if;
  if p_revision_number > 0
    and (p_revision_root_id is null or p_previous_revision_id is null)
  then
    raise exception using errcode = '22023', message = 'Revision lineage is incomplete.';
  end if;

  select e.*
  into v_source
  from public.estimates as e
  where e.id = p_source_estimate_id
  for share;

  if not found then
    raise exception using errcode = 'P0002', message = 'Source Estimate not found.';
  end if;

  perform 1
  from public.estimate_meta as m
  where m.estimate_id = p_source_estimate_id
  for share;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Source Estimate details are incomplete and cannot be copied.';
  end if;

  perform 1
  from public.estimate_categories as c
  where c.estimate_id = p_source_estimate_id
  for share;

  perform 1
  from public.estimate_items as i
  where i.estimate_id = p_source_estimate_id
  for share;

  perform 1
  from public.estimate_payment_schedule_items as p
  where p.estimate_id = p_source_estimate_id
  for share;

  if v_source.customer_id is not null then
    perform 1
    from public.customers as c
    where c.id = v_source.customer_id
    for key share;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'Source Estimate customer relationship is no longer valid.';
    end if;
  end if;

  -- Preserve the existing HH Estimate financial contract exactly. Milestone
  -- amounts remain tax-inclusive fixed-dollar amounts.
  select
    round(greatest(
      coalesce((
        select sum(coalesce(i.qty, 0) * coalesce(i.unit_cost, 0))
        from public.estimate_items as i
        where i.estimate_id = p_source_estimate_id
      ), 0)
      + coalesce((
        select m.tax - m.discount
        from public.estimate_meta as m
        where m.estimate_id = p_source_estimate_id
      ), 0),
      0
    ), 2),
    round(coalesce((
      select sum(p.amount)
      from public.estimate_payment_schedule_items as p
      where p.estimate_id = p_source_estimate_id
    ), 0), 2)
  into v_estimate_total, v_schedule_total;

  if v_schedule_total > v_estimate_total then
    raise exception using
      errcode = '23514',
      message = format(
        'Payment schedule total %s cannot exceed Estimate final total %s.',
        v_schedule_total,
        v_estimate_total
      ),
      constraint = 'estimate_payment_schedule_total_not_exceeded';
  end if;

  if p_revision_number > 0 then
    v_new_estimate_number := v_source.number;
    v_new_revision_root_id := p_revision_root_id;
  else
    v_new_revision_root_id := v_new_estimate_id;
    loop
      v_new_estimate_number := public.next_estimate_number();
      exit when not exists (
        select 1
        from public.estimates as e
        where e.number = v_new_estimate_number
          and e.revision_number = 0
      );
      v_number_attempts := v_number_attempts + 1;
      if v_number_attempts >= 100 then
        raise exception using
          errcode = '23505',
          message = 'Could not allocate a unique Estimate number.';
      end if;
    end loop;
  end if;

  insert into public.estimates (
    id,
    number,
    client,
    project,
    status,
    approved_at,
    customer_id,
    revision_root_id,
    revision_number,
    previous_revision_id
  ) values (
    v_new_estimate_id,
    v_new_estimate_number,
    v_source.client,
    v_source.project,
    'Draft',
    null,
    v_source.customer_id,
    v_new_revision_root_id,
    p_revision_number,
    p_previous_revision_id
  );

  insert into public.estimate_meta (
    estimate_id,
    client_name,
    client_phone,
    client_email,
    client_address,
    project_name,
    project_site_address,
    cost_category_names,
    tax,
    discount,
    overhead_pct,
    profit_pct,
    estimate_date,
    valid_until,
    notes,
    sales_person,
    document_notes
  )
  select
    v_new_estimate_id,
    m.client_name,
    m.client_phone,
    m.client_email,
    m.client_address,
    m.project_name,
    m.project_site_address,
    m.cost_category_names,
    m.tax,
    m.discount,
    m.overhead_pct,
    m.profit_pct,
    (current_timestamp at time zone 'UTC')::date,
    null::date,
    m.notes,
    m.sales_person,
    m.document_notes
  from public.estimate_meta as m
  where m.estimate_id = p_source_estimate_id;

  insert into public.estimate_categories (
    estimate_id,
    cost_code,
    display_name,
    order_index
  )
  select
    v_new_estimate_id,
    c.cost_code,
    c.display_name,
    c.order_index
  from public.estimate_categories as c
  where c.estimate_id = p_source_estimate_id
  order by c.order_index, c.cost_code;

  insert into public.estimate_items (
    estimate_id,
    cost_code,
    "desc",
    item_name,
    qty,
    unit,
    unit_cost,
    markup_pct,
    sort_order,
    status,
    hide_amount_on_pdf
  )
  select
    v_new_estimate_id,
    i.cost_code,
    i."desc",
    i.item_name,
    i.qty,
    i.unit,
    i.unit_cost,
    i.markup_pct,
    i.sort_order,
    i.status,
    i.hide_amount_on_pdf
  from public.estimate_items as i
  where i.estimate_id = p_source_estimate_id
  order by i.sort_order, i.id;

  -- Copy schedule structure only: new IDs, Draft state, no invoice/payment
  -- linkage, and no stale absolute due dates.
  insert into public.estimate_payment_schedule_items (
    estimate_id,
    title,
    description,
    amount,
    due_date,
    status,
    invoice_id,
    sort_order
  )
  select
    v_new_estimate_id,
    p.title,
    p.description,
    p.amount,
    null::date,
    'draft',
    null,
    p.sort_order
  from public.estimate_payment_schedule_items as p
  where p.estimate_id = p_source_estimate_id
  order by p.sort_order, p.id;

  -- Deliberately do not copy snapshots, projects.source_estimate_id,
  -- invoices, invoice payments, activity, or delivery/history evidence.
  estimate_id := v_new_estimate_id;
  estimate_number := v_new_estimate_number;
  revision_number := p_revision_number;
  return next;
end
$function$;

notify pgrst, 'reload schema';
