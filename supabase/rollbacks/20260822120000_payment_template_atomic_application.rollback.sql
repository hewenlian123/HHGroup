drop function if exists public.apply_payment_schedule_template(uuid, uuid, text);

-- Preserve reusable template data during rollback. Empty tables created only by
-- Phase 2A can be removed; populated pre-existing tables are intentionally retained.
do $rollback$
begin
  if to_regclass('public.payment_schedule_template_items') is not null
    and to_regclass('public.payment_schedule_templates') is not null
    and not exists (select 1 from public.payment_schedule_template_items)
    and not exists (select 1 from public.payment_schedule_templates)
  then
    drop table public.payment_schedule_template_items;
    drop table public.payment_schedule_templates;
  end if;
end
$rollback$;
