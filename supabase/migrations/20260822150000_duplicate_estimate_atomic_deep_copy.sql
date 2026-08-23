-- Phase 2B: one server-authoritative deep-copy contract for both
-- "Duplicate as Draft" and "Copy Previous Estimate".

create or replace function public.duplicate_estimate_as_draft(p_source_estimate_id uuid)
returns table (
  estimate_id uuid,
  estimate_number text
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_source public.estimates%rowtype;
  v_new_estimate_id uuid;
  v_new_estimate_number text;
  v_number_attempts integer := 0;
  v_estimate_total numeric;
  v_schedule_total numeric;
begin
  if p_source_estimate_id is null then
    raise exception using errcode = '22023', message = 'Source Estimate is required.';
  end if;

  -- Freeze the source document for the duration of this transaction so every
  -- copied row belongs to one consistent Estimate state.
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
      message = 'Source Estimate details are incomplete and cannot be duplicated.';
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

  -- customer_id is the only canonical customer/project-context relationship
  -- stored on an Estimate. It must still resolve; project labels remain copied
  -- descriptive context and are never relinked by name.
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

  -- Preserve the existing HH Estimate calculation contract exactly:
  -- line subtotal + stored tax - stored discount, clamped to a non-negative
  -- schedulable total and rounded to currency precision.
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

  loop
    v_new_estimate_number := public.next_estimate_number();
    exit when not exists (
      select 1 from public.estimates as e where e.number = v_new_estimate_number
    );
    v_number_attempts := v_number_attempts + 1;
    if v_number_attempts >= 100 then
      raise exception using
        errcode = '23505',
        message = 'Could not allocate a unique Estimate number.';
    end if;
  end loop;

  insert into public.estimates (
    number,
    client,
    project,
    status,
    approved_at,
    customer_id
  ) values (
    v_new_estimate_number,
    v_source.client,
    v_source.project,
    'Draft',
    null,
    v_source.customer_id
  )
  returning id into v_new_estimate_id;

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
    -- Match normal new-Estimate creation: the document date is today's UTC
    -- calendar date, while validity remains unset until explicitly selected.
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

  -- Milestones are copied as Estimate structure only. New identities and Draft
  -- state prevent paid/invoiced history from becoming a fact on the new record.
  -- HH has no authoritative relative milestone-date rule, so historical
  -- absolute due dates are cleared on the new Draft.
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

  -- Deliberately do not copy estimate_snapshots, projects.source_estimate_id,
  -- invoices, invoice items/payments, or any activity/history rows.
  estimate_id := v_new_estimate_id;
  estimate_number := v_new_estimate_number;
  return next;
end
$function$;

revoke all on function public.duplicate_estimate_as_draft(uuid) from public;
revoke all on function public.duplicate_estimate_as_draft(uuid) from anon;
revoke all on function public.duplicate_estimate_as_draft(uuid) from authenticated;
grant execute on function public.duplicate_estimate_as_draft(uuid) to service_role;

notify pgrst, 'reload schema';
