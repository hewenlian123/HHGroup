drop trigger if exists trg_estimate_payment_schedule_total_on_meta on public.estimate_meta;
drop trigger if exists trg_estimate_payment_schedule_total_on_items on public.estimate_items;
drop trigger if exists trg_estimate_payment_schedule_total_on_schedule
  on public.estimate_payment_schedule_items;
drop function if exists public.assert_estimate_payment_schedule_total();

drop index if exists public.projects_source_estimate_id_unique;
