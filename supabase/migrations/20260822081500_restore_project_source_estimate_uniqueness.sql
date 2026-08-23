-- One estimate can fund at most one canonical project budget.
-- Fail closed if historical duplicates exist so they can be reviewed instead of silently discarded.
do $$
begin
  if exists (
    select 1
    from public.projects
    where source_estimate_id is not null
    group by source_estimate_id
    having count(*) > 1
  ) then
    raise exception
      'Cannot enforce projects.source_estimate_id uniqueness while duplicate links exist.';
  end if;
end
$$;

create unique index if not exists projects_source_estimate_id_unique
  on public.projects (source_estimate_id)
  where source_estimate_id is not null;

-- Keep fixed-dollar payment schedules inside the estimate contract value even when
-- pricing rows and schedule rows are written concurrently or outside the web action.
create or replace function public.assert_estimate_payment_schedule_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_estimate_id uuid;
  estimate_total numeric;
  scheduled_total numeric;
begin
  target_estimate_id := case when tg_op = 'DELETE' then old.estimate_id else new.estimate_id end;

  -- Serialize financial writes for one estimate before calculating the aggregate.
  perform 1
  from public.estimates
  where id = target_estimate_id
  for update;

  select
    greatest(
      coalesce((
        select sum(coalesce(i.qty, 0) * coalesce(i.unit_cost, 0))
        from public.estimate_items as i
        where i.estimate_id = target_estimate_id
      ), 0)
      + coalesce((
        select m.tax - m.discount
        from public.estimate_meta as m
        where m.estimate_id = target_estimate_id
      ), 0),
      0
    ),
    coalesce((
      select sum(coalesce(p.amount, 0))
      from public.estimate_payment_schedule_items as p
      where p.estimate_id = target_estimate_id
    ), 0)
  into estimate_total, scheduled_total;

  if scheduled_total > estimate_total then
    raise exception using
      errcode = '23514',
      message = format(
        'Payment schedule total %s cannot exceed estimate total %s.',
        scheduled_total,
        estimate_total
      ),
      constraint = 'estimate_payment_schedule_total_not_exceeded';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function public.assert_estimate_payment_schedule_total() from public;
revoke all on function public.assert_estimate_payment_schedule_total() from anon;
revoke all on function public.assert_estimate_payment_schedule_total() from authenticated;

drop trigger if exists trg_estimate_payment_schedule_total_on_schedule
  on public.estimate_payment_schedule_items;
create constraint trigger trg_estimate_payment_schedule_total_on_schedule
  after insert or update or delete on public.estimate_payment_schedule_items
  deferrable initially immediate
  for each row execute function public.assert_estimate_payment_schedule_total();

drop trigger if exists trg_estimate_payment_schedule_total_on_items
  on public.estimate_items;
create constraint trigger trg_estimate_payment_schedule_total_on_items
  after insert or update or delete on public.estimate_items
  deferrable initially immediate
  for each row execute function public.assert_estimate_payment_schedule_total();

drop trigger if exists trg_estimate_payment_schedule_total_on_meta
  on public.estimate_meta;
create constraint trigger trg_estimate_payment_schedule_total_on_meta
  after insert or update or delete on public.estimate_meta
  deferrable initially immediate
  for each row execute function public.assert_estimate_payment_schedule_total();
