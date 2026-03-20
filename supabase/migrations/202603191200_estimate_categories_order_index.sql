-- Persist Cost Breakdown category order per estimate
alter table public.estimate_categories
  add column if not exists order_index integer not null default 0;

create index if not exists estimate_categories_estimate_order_idx
  on public.estimate_categories (estimate_id, order_index);
