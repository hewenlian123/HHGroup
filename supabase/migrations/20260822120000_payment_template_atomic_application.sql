-- Phase 2A: restore reusable payment templates and apply them transactionally.
-- Template percentages are helpers only. Applied schedule rows are fixed-dollar,
-- tax-inclusive customer milestone amounts derived from the Estimate final total.

create table if not exists public.payment_schedule_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default ''
);

create table if not exists public.payment_schedule_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.payment_schedule_templates(id) on delete cascade,
  sort_order integer not null default 0,
  title text not null default '',
  amount_type text not null,
  value numeric not null default 0,
  due_rule text not null default '',
  notes text null,
  constraint payment_schedule_template_items_amount_type_check
    check (amount_type in ('percent', 'fixed')),
  constraint payment_schedule_template_items_value_nonnegative
    check (value >= 0)
);

create index if not exists payment_schedule_template_items_template_id_idx
  on public.payment_schedule_template_items (template_id);

alter table public.payment_schedule_templates enable row level security;
alter table public.payment_schedule_template_items enable row level security;

revoke all on table public.payment_schedule_templates from public;
revoke all on table public.payment_schedule_templates from anon;
revoke all on table public.payment_schedule_templates from authenticated;
revoke all on table public.payment_schedule_template_items from public;
revoke all on table public.payment_schedule_template_items from anon;
revoke all on table public.payment_schedule_template_items from authenticated;

grant select, insert, update, delete on table public.payment_schedule_templates to service_role;
grant select, insert, update, delete on table public.payment_schedule_template_items to service_role;

drop policy if exists payment_schedule_templates_select_all
  on public.payment_schedule_templates;
drop policy if exists payment_schedule_templates_insert_all
  on public.payment_schedule_templates;
drop policy if exists payment_schedule_templates_update_all
  on public.payment_schedule_templates;
drop policy if exists payment_schedule_templates_delete_all
  on public.payment_schedule_templates;
drop policy if exists payment_schedule_template_items_select_all
  on public.payment_schedule_template_items;
drop policy if exists payment_schedule_template_items_insert_all
  on public.payment_schedule_template_items;
drop policy if exists payment_schedule_template_items_update_all
  on public.payment_schedule_template_items;
drop policy if exists payment_schedule_template_items_delete_all
  on public.payment_schedule_template_items;

create or replace function public.apply_payment_schedule_template(
  p_estimate_id uuid,
  p_template_id uuid,
  p_mode text
)
returns table (
  applied_count integer,
  scheduled_total numeric,
  remaining_total numeric
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_estimate_status text;
  v_estimate_total numeric;
  v_existing_total numeric;
  v_template_total numeric;
  v_base_sort_order integer;
  v_applied_count integer;
begin
  if p_mode not in ('replace', 'merge') then
    raise exception using
      errcode = '22023',
      message = 'Payment template mode must be replace or merge.';
  end if;

  -- Serialize every template application and concurrent pricing/schedule write
  -- for this Estimate before reading any authoritative financial values.
  select e.status
  into v_estimate_status
  from public.estimates as e
  where e.id = p_estimate_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Estimate not found.';
  end if;

  if v_estimate_status not in ('Draft', 'Sent') then
    raise exception using
      errcode = '23514',
      message = 'Only Draft or Sent Estimates can change their payment schedule.';
  end if;

  if not exists (
    select 1
    from public.payment_schedule_templates as t
    where t.id = p_template_id
  ) then
    raise exception using errcode = 'P0002', message = 'Payment template not found.';
  end if;

  if not exists (
    select 1
    from public.payment_schedule_template_items as ti
    where ti.template_id = p_template_id
  ) then
    raise exception using errcode = '23514', message = 'Payment template has no milestones.';
  end if;

  -- This is the existing HH Estimate formula: line subtotal + tax - discount.
  -- Currency allocation follows the existing schedule convention of two decimals
  -- and never permits a negative schedulable total.
  select round(greatest(
    coalesce((
      select sum(coalesce(i.qty, 0) * coalesce(i.unit_cost, 0))
      from public.estimate_items as i
      where i.estimate_id = p_estimate_id
    ), 0)
    + coalesce((
      select m.tax - m.discount
      from public.estimate_meta as m
      where m.estimate_id = p_estimate_id
    ), 0),
    0
  ), 2)
  into v_estimate_total;

  if p_mode = 'replace' and exists (
    select 1
    from public.estimate_payment_schedule_items as p
    where p.estimate_id = p_estimate_id
      and (p.invoice_id is not null or p.status <> 'draft')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Linked or non-draft payment milestones cannot be replaced.';
  end if;

  select coalesce(sum(p.amount), 0), coalesce(max(p.sort_order) + 1, 0)
  into v_existing_total, v_base_sort_order
  from public.estimate_payment_schedule_items as p
  where p.estimate_id = p_estimate_id;

  with template_rows as (
    select
      ti.id,
      ti.title,
      ti.amount_type,
      ti.value,
      ti.due_rule,
      ti.notes,
      row_number() over (order by ti.sort_order, ti.id) - 1 as row_offset,
      count(*) over () as row_count,
      sum(case when ti.amount_type = 'percent' then ti.value else 0 end) over ()
        as percent_sum,
      count(*) filter (where ti.amount_type = 'fixed') over () as fixed_count
    from public.payment_schedule_template_items as ti
    where ti.template_id = p_template_id
  ), calculated as (
    select
      tr.*,
      round(
        case tr.amount_type
          when 'percent' then v_estimate_total * tr.value / 100
          else tr.value
        end,
        2
      ) as calculated_amount
    from template_rows as tr
  ), totaled as (
    select
      c.*,
      sum(c.calculated_amount) over () as calculated_total
    from calculated as c
  ), final_rows as (
    select
      t.*,
      case
        -- A percentage-only 100% template must land exactly on the authoritative
        -- Estimate final total after per-line currency rounding.
        when t.fixed_count = 0
          and abs(t.percent_sum - 100) <= 0.0001
          and t.row_offset = t.row_count - 1
        then round(t.calculated_amount + (v_estimate_total - t.calculated_total), 2)
        else t.calculated_amount
      end as final_amount
    from totaled as t
  )
  select coalesce(sum(fr.final_amount), 0)
  into v_template_total
  from final_rows as fr;

  if (case when p_mode = 'merge' then v_existing_total else 0 end) + v_template_total
    > v_estimate_total then
    raise exception using
      errcode = '23514',
      message = format(
        'Payment schedule total %s cannot exceed Estimate final total %s.',
        (case when p_mode = 'merge' then v_existing_total else 0 end) + v_template_total,
        v_estimate_total
      ),
      constraint = 'estimate_payment_schedule_total_not_exceeded';
  end if;

  if p_mode = 'replace' then
    delete from public.estimate_payment_schedule_items as p
    where p.estimate_id = p_estimate_id;
    v_base_sort_order := 0;
  end if;

  with template_rows as (
    select
      ti.id,
      ti.title,
      ti.amount_type,
      ti.value,
      ti.due_rule,
      ti.notes,
      row_number() over (order by ti.sort_order, ti.id) - 1 as row_offset,
      count(*) over () as row_count,
      sum(case when ti.amount_type = 'percent' then ti.value else 0 end) over ()
        as percent_sum,
      count(*) filter (where ti.amount_type = 'fixed') over () as fixed_count
    from public.payment_schedule_template_items as ti
    where ti.template_id = p_template_id
  ), calculated as (
    select
      tr.*,
      round(
        case tr.amount_type
          when 'percent' then v_estimate_total * tr.value / 100
          else tr.value
        end,
        2
      ) as calculated_amount
    from template_rows as tr
  ), totaled as (
    select c.*, sum(c.calculated_amount) over () as calculated_total
    from calculated as c
  ), final_rows as (
    select
      t.*,
      case
        when t.fixed_count = 0
          and abs(t.percent_sum - 100) <= 0.0001
          and t.row_offset = t.row_count - 1
        then round(t.calculated_amount + (v_estimate_total - t.calculated_total), 2)
        else t.calculated_amount
      end as final_amount
    from totaled as t
  )
  insert into public.estimate_payment_schedule_items (
    estimate_id,
    sort_order,
    title,
    description,
    amount,
    due_date,
    status,
    invoice_id
  )
  select
    p_estimate_id,
    v_base_sort_order + fr.row_offset::integer,
    coalesce(nullif(trim(fr.title), ''), 'Payment'),
    coalesce(nullif(trim(fr.due_rule), ''), nullif(trim(fr.notes), '')),
    fr.final_amount,
    null,
    'draft',
    null
  from final_rows as fr
  order by fr.row_offset;

  get diagnostics v_applied_count = row_count;

  select round(coalesce(sum(p.amount), 0), 2)
  into v_existing_total
  from public.estimate_payment_schedule_items as p
  where p.estimate_id = p_estimate_id;

  applied_count := v_applied_count;
  scheduled_total := v_existing_total;
  remaining_total := round(v_estimate_total - v_existing_total, 2);
  return next;
end
$function$;

revoke all on function public.apply_payment_schedule_template(uuid, uuid, text) from public;
revoke all on function public.apply_payment_schedule_template(uuid, uuid, text) from anon;
revoke all on function public.apply_payment_schedule_template(uuid, uuid, text) from authenticated;
grant execute on function public.apply_payment_schedule_template(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
