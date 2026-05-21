-- Ensure estimate category ordering exists before the estimate composer writes section order.
-- Non-destructive: keeps existing categories and backfills only missing order values.

alter table public.estimate_categories
  add column if not exists order_index integer;

update public.estimate_categories
set order_index = 0
where order_index is null;

alter table public.estimate_categories
  alter column order_index set default 0,
  alter column order_index set not null;

create index if not exists estimate_categories_estimate_order_idx
  on public.estimate_categories (estimate_id, order_index);
