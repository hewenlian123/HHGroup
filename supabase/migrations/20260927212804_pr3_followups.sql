-- Follow-ups after 20260927120000 / 20260927130000.
-- Do not edit those migrations. Production already applied them.
--
-- 1. Production invoice_items.quantity is a plain NOT NULL column (default 1),
--    not a generated column. create_invoice_atomic / update_invoice_atomic write
--    only qty, so quantity stayed at 1. Keep the two columns equal, and make a
--    local generated quantity column into the same plain column production has.
-- 2. change_order_budget_reversals is an internal ledger. Lock it down.
-- The Supabase migration runner already wraps this file in a transaction.

set lock_timeout = '1s';
set statement_timeout = '30s';

-- squawk-ignore prefer-robust-stmts
do $convert_quantity$
declare
  generated_flag "char";
begin
  select a.attgenerated
  into generated_flag
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'invoice_items'
    and a.attname = 'quantity'
    and a.attnum > 0
    and not a.attisdropped;

  if generated_flag is null then
    raise exception 'public.invoice_items.quantity is missing';
  end if;

  if generated_flag <> '' then
    alter table public.invoice_items drop column quantity;
    alter table public.invoice_items
      add column quantity numeric not null default 1;
  end if;
end
$convert_quantity$;

comment on column public.invoice_items.quantity is
  'Plain copy of qty, kept equal by calc_invoice_item_amount. Not a generated column.';

-- qty wins when it is supplied. quantity wins only when qty is absent.
create or replace function public.calc_invoice_item_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.qty is distinct from old.qty and new.quantity is not distinct from old.quantity then
      new.quantity := new.qty;
    elsif new.quantity is distinct from old.quantity and new.qty is not distinct from old.qty then
      new.qty := new.quantity;
    elsif new.qty is not null then
      new.quantity := new.qty;
    elsif new.quantity is not null then
      new.qty := new.quantity;
    end if;
  else
    if new.qty is not null then
      new.quantity := new.qty;
    elsif new.quantity is not null then
      new.qty := new.quantity;
    end if;
  end if;

  new.amount := pg_catalog.round(
    coalesce(new.qty, 0) * coalesce(new.unit_price, 0),
    2
  );
  return new;
end;
$$;

update public.invoice_items
set qty = quantity
where qty is null
  and quantity is not null;

update public.invoice_items
set quantity = qty
where qty is not null
  and quantity is distinct from qty;

-- squawk-ignore prefer-robust-stmts
alter table public.change_order_budget_reversals enable row level security;

revoke all on table public.change_order_budget_reversals from public, anon, authenticated;

grant all on table public.change_order_budget_reversals to service_role;
