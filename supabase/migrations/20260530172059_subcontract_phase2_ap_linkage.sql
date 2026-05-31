-- Subcontract Phase 2 AP linkage.
-- Safe/idempotent:
-- - link AP bills to subcontractors/subcontracts
-- - add planned subcontract payment schedule items
-- - create an atomic schedule -> AP bill helper
-- No data is deleted and contract amounts remain committed cost only.

alter table if exists public.ap_bills
  add column if not exists subcontractor_id uuid;

alter table if exists public.ap_bills
  add column if not exists subcontract_id uuid;

do $$
begin
  if to_regclass('public.ap_bills') is not null
    and to_regclass('public.subcontractors') is not null
    and not exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'ap_bills'
        and constraint_name = 'ap_bills_subcontractor_id_fkey'
    )
  then
    alter table public.ap_bills
      add constraint ap_bills_subcontractor_id_fkey
      foreign key (subcontractor_id)
      references public.subcontractors(id)
      on delete set null
      not valid;
  end if;

  if to_regclass('public.ap_bills') is not null
    and to_regclass('public.subcontracts') is not null
    and not exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'ap_bills'
        and constraint_name = 'ap_bills_subcontract_id_fkey'
    )
  then
    alter table public.ap_bills
      add constraint ap_bills_subcontract_id_fkey
      foreign key (subcontract_id)
      references public.subcontracts(id)
      on delete set null
      not valid;
  end if;
end $$;

create index if not exists idx_ap_bills_subcontractor_id
  on public.ap_bills(subcontractor_id);

create index if not exists idx_ap_bills_subcontract_id
  on public.ap_bills(subcontract_id);

create table if not exists public.subcontract_payment_schedule (
  id uuid primary key default gen_random_uuid(),
  subcontract_id uuid not null references public.subcontracts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  title text not null,
  description text,
  amount numeric not null default 0,
  due_date date,
  status text not null default 'draft',
  ap_bill_id uuid references public.ap_bills(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcontract_payment_schedule_amount_nonnegative check (amount >= 0),
  constraint subcontract_payment_schedule_status_check check (
    status in ('draft', 'scheduled', 'billed', 'paid', 'cancelled', 'void')
  )
);

create index if not exists idx_subcontract_payment_schedule_project_id
  on public.subcontract_payment_schedule(project_id);

create index if not exists idx_subcontract_payment_schedule_subcontract_id
  on public.subcontract_payment_schedule(subcontract_id);

create index if not exists idx_subcontract_payment_schedule_subcontractor_id
  on public.subcontract_payment_schedule(subcontractor_id);

create index if not exists idx_subcontract_payment_schedule_ap_bill_id
  on public.subcontract_payment_schedule(ap_bill_id);

create unique index if not exists uq_subcontract_payment_schedule_ap_bill_id
  on public.subcontract_payment_schedule(ap_bill_id)
  where ap_bill_id is not null;

create or replace function public.set_subcontract_payment_schedule_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

notify pgrst, 'reload schema';

drop trigger if exists trg_subcontract_payment_schedule_updated_at
  on public.subcontract_payment_schedule;

create trigger trg_subcontract_payment_schedule_updated_at
  before update on public.subcontract_payment_schedule
  for each row
  execute function public.set_subcontract_payment_schedule_updated_at();

alter table public.subcontract_payment_schedule enable row level security;

drop policy if exists subcontract_payment_schedule_select_authenticated
  on public.subcontract_payment_schedule;
create policy subcontract_payment_schedule_select_authenticated
  on public.subcontract_payment_schedule
  for select
  to authenticated
  using (true);

drop policy if exists subcontract_payment_schedule_insert_authenticated
  on public.subcontract_payment_schedule;
create policy subcontract_payment_schedule_insert_authenticated
  on public.subcontract_payment_schedule
  for insert
  to authenticated
  with check (true);

drop policy if exists subcontract_payment_schedule_update_authenticated
  on public.subcontract_payment_schedule;
create policy subcontract_payment_schedule_update_authenticated
  on public.subcontract_payment_schedule
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists subcontract_payment_schedule_delete_authenticated
  on public.subcontract_payment_schedule;
create policy subcontract_payment_schedule_delete_authenticated
  on public.subcontract_payment_schedule
  for delete
  to authenticated
  using (true);

comment on table public.subcontract_payment_schedule is
  'Planned subcontract payable milestones. AP bills are the canonical payable/payment ledger.';

comment on column public.subcontract_payment_schedule.amount is
  'Planned payable milestone amount. This is not actual cost until represented by a non-void AP bill.';

comment on column public.ap_bills.subcontractor_id is
  'Optional Phase 2 link from AP bill to subcontractor.';

comment on column public.ap_bills.subcontract_id is
  'Optional Phase 2 link from AP bill to subcontract commitment.';

create or replace function public.create_ap_bill_from_subcontract_schedule(
  p_schedule_id uuid
)
returns table(ap_bill_id uuid, created boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_schedule public.subcontract_payment_schedule%rowtype;
  v_subcontract public.subcontracts%rowtype;
  v_subcontractor public.subcontractors%rowtype;
  v_bill_id uuid;
  v_notes text;
begin
  select *
    into v_schedule
    from public.subcontract_payment_schedule
    where id = p_schedule_id
    for update;

  if not found then
    raise exception 'Schedule item not found.';
  end if;

  if v_schedule.ap_bill_id is not null then
    ap_bill_id := v_schedule.ap_bill_id;
    created := false;
    return next;
    return;
  end if;

  if v_schedule.amount <= 0 then
    raise exception 'Schedule amount must be greater than 0.';
  end if;

  select *
    into v_subcontract
    from public.subcontracts
    where id = v_schedule.subcontract_id;

  if not found then
    raise exception 'Subcontract not found.';
  end if;

  select *
    into v_subcontractor
    from public.subcontractors
    where id = v_schedule.subcontractor_id;

  if not found then
    raise exception 'Subcontractor not found.';
  end if;

  v_notes := concat_ws(
    ' · ',
    nullif(v_subcontract.description, ''),
    nullif(v_subcontract.cost_code, ''),
    nullif(v_schedule.title, '')
  );

  insert into public.ap_bills (
    bill_type,
    vendor_name,
    project_id,
    issue_date,
    due_date,
    amount,
    paid_amount,
    balance_amount,
    status,
    category,
    notes,
    subcontractor_id,
    subcontract_id
  )
  values (
    'Vendor',
    coalesce(nullif(v_subcontractor.name, ''), 'Subcontractor'),
    v_schedule.project_id,
    current_date,
    v_schedule.due_date,
    round(v_schedule.amount::numeric, 2),
    0,
    round(v_schedule.amount::numeric, 2),
    'Draft',
    'Subcontract',
    nullif(v_notes, ''),
    v_schedule.subcontractor_id,
    v_schedule.subcontract_id
  )
  returning id into v_bill_id;

  update public.subcontract_payment_schedule
    set ap_bill_id = v_bill_id,
        status = 'billed',
        updated_at = now()
    where id = v_schedule.id;

  ap_bill_id := v_bill_id;
  created := true;
  return next;
end;
$$;
