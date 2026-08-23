-- Phase 3A: first-class Estimate revisions with immutable lineage.
-- Revisions are new Draft Estimate records. The source remains unchanged.

alter table public.estimates
  add column if not exists revision_root_id uuid,
  add column if not exists revision_number integer not null default 0,
  add column if not exists previous_revision_id uuid;

update public.estimates
set revision_root_id = id
where revision_root_id is null;

alter table public.estimates
  alter column revision_root_id set not null,
  drop constraint if exists estimates_number_key;

drop index if exists public.estimates_number_key;

alter table public.estimates
  add constraint estimates_revision_number_nonnegative
    check (revision_number >= 0),
  add constraint estimates_revision_shape_check
    check (
      (revision_number = 0 and revision_root_id = id and previous_revision_id is null)
      or
      (revision_number > 0 and revision_root_id <> id and previous_revision_id is not null)
    ),
  add constraint estimates_revision_root_id_fkey
    foreign key (revision_root_id) references public.estimates(id) on delete restrict,
  add constraint estimates_previous_revision_id_fkey
    foreign key (previous_revision_id) references public.estimates(id) on delete restrict,
  add constraint estimates_revision_root_number_key
    unique (revision_root_id, revision_number),
  add constraint estimates_number_revision_key
    unique (number, revision_number),
  add constraint estimates_previous_revision_key
    unique (previous_revision_id);

create index if not exists estimates_revision_root_id_idx
  on public.estimates (revision_root_id, revision_number desc);

create or replace function public.set_estimate_revision_defaults()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.revision_root_id is null then
    new.revision_root_id := new.id;
  end if;
  if new.revision_number is null then
    new.revision_number := 0;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_set_estimate_revision_defaults on public.estimates;
create trigger trg_set_estimate_revision_defaults
  before insert on public.estimates
  for each row execute function public.set_estimate_revision_defaults();

create or replace function public.prevent_estimate_lineage_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.revision_root_id is distinct from new.revision_root_id
    or old.revision_number is distinct from new.revision_number
    or old.previous_revision_id is distinct from new.previous_revision_id
    or old.number is distinct from new.number
  then
    raise exception using
      errcode = '55000',
      message = 'Estimate revision lineage is immutable.';
  end if;
  return new;
end
$function$;

drop trigger if exists trg_prevent_estimate_lineage_mutation on public.estimates;
create trigger trg_prevent_estimate_lineage_mutation
  before update on public.estimates
  for each row execute function public.prevent_estimate_lineage_mutation();

-- One copy engine owns both standalone duplication and revision creation.
-- The caller supplies lineage only for a revision. All content-copy and
-- downstream-reset behavior remains shared.
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

create or replace function public.duplicate_estimate_as_draft(p_source_estimate_id uuid)
returns table (
  estimate_id uuid,
  estimate_number text
)
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  return query
  select copied.estimate_id, copied.estimate_number
  from public.copy_estimate_as_draft_core(
    p_source_estimate_id,
    null,
    0,
    null
  ) as copied;
end
$function$;

create or replace function public.create_estimate_revision(p_source_estimate_id uuid)
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
  v_latest_revision_id uuid;
  v_latest_revision_number integer;
  v_next_revision_number integer;
begin
  if p_source_estimate_id is null then
    raise exception using errcode = '22023', message = 'Source Estimate is required.';
  end if;

  select e.*
  into v_source
  from public.estimates as e
  where e.id = p_source_estimate_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Source Estimate not found.';
  end if;
  if v_source.status not in ('Approved', 'Rejected', 'Converted') then
    raise exception using
      errcode = '55000',
      message = 'A revision can only be created from an Approved, Rejected, or Converted Estimate.';
  end if;

  -- The root row serializes every writer in this family. Combined with the
  -- unique lineage constraints, this prevents conflicting revision numbers.
  perform 1
  from public.estimates as root_estimate
  where root_estimate.id = v_source.revision_root_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Estimate revision root is missing.';
  end if;

  select e.id, e.revision_number
  into v_latest_revision_id, v_latest_revision_number
  from public.estimates as e
  where e.revision_root_id = v_source.revision_root_id
  order by e.revision_number desc
  limit 1;

  if v_latest_revision_id is distinct from v_source.id then
    raise exception using
      errcode = '55000',
      message = 'Create the next revision from the latest revision in this Estimate family.';
  end if;

  v_next_revision_number := v_latest_revision_number + 1;

  return query
  select copied.estimate_id, copied.estimate_number, copied.revision_number
  from public.copy_estimate_as_draft_core(
    v_source.id,
    v_source.revision_root_id,
    v_next_revision_number,
    v_source.id
  ) as copied;
end
$function$;

revoke all on function public.set_estimate_revision_defaults() from public;
revoke all on function public.set_estimate_revision_defaults() from anon;
revoke all on function public.set_estimate_revision_defaults() from authenticated;
revoke all on function public.prevent_estimate_lineage_mutation() from public;
revoke all on function public.prevent_estimate_lineage_mutation() from anon;
revoke all on function public.prevent_estimate_lineage_mutation() from authenticated;
revoke all on function public.copy_estimate_as_draft_core(uuid, uuid, integer, uuid) from public;
revoke all on function public.copy_estimate_as_draft_core(uuid, uuid, integer, uuid) from anon;
revoke all on function public.copy_estimate_as_draft_core(uuid, uuid, integer, uuid) from authenticated;
revoke all on function public.duplicate_estimate_as_draft(uuid) from public;
revoke all on function public.duplicate_estimate_as_draft(uuid) from anon;
revoke all on function public.duplicate_estimate_as_draft(uuid) from authenticated;
revoke all on function public.create_estimate_revision(uuid) from public;
revoke all on function public.create_estimate_revision(uuid) from anon;
revoke all on function public.create_estimate_revision(uuid) from authenticated;

grant execute on function public.copy_estimate_as_draft_core(uuid, uuid, integer, uuid) to service_role;
grant execute on function public.duplicate_estimate_as_draft(uuid) to service_role;
grant execute on function public.create_estimate_revision(uuid) to service_role;

notify pgrst, 'reload schema';
