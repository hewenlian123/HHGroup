-- Guard migration: ensure order_index exists for estimate category inserts.
alter table public.estimate_categories
add column if not exists order_index integer default 0;
