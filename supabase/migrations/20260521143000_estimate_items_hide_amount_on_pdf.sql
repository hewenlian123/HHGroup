-- Per line item: hide unit price / line total on estimate preview & print PDF only.
alter table public.estimate_items
  add column if not exists hide_amount_on_pdf boolean not null default false;
