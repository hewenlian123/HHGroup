-- Emergency fail-closed rollback for R1B.1 Estimate grants closure.
--
-- The pre-R1B.1 ACL is known insecure and is intentionally never restored.
-- This recovery state removes authenticated direct reads while retaining the
-- minimum service_role access needed to inspect data and roll forward safely.

revoke all privileges on table
  public.estimates,
  public.estimate_meta,
  public.estimate_items,
  public.estimate_categories,
  public.estimate_snapshots,
  public.estimate_payment_schedule_items,
  public.estimate_templates
from public, anon, authenticated, service_role;

drop policy if exists estimates_owner_admin_select on public.estimates;
drop policy if exists estimate_meta_owner_admin_select on public.estimate_meta;
drop policy if exists estimate_items_owner_admin_select on public.estimate_items;
drop policy if exists estimate_categories_owner_admin_select on public.estimate_categories;
drop policy if exists estimate_snapshots_owner_admin_select on public.estimate_snapshots;
drop policy if exists estimate_payment_schedule_items_owner_admin_select
  on public.estimate_payment_schedule_items;

alter table public.estimates enable row level security;
alter table public.estimate_meta enable row level security;
alter table public.estimate_items enable row level security;
alter table public.estimate_categories enable row level security;
alter table public.estimate_snapshots enable row level security;
alter table public.estimate_payment_schedule_items enable row level security;
alter table public.estimate_templates enable row level security;

grant select, insert, update, delete on table
  public.estimates,
  public.estimate_meta,
  public.estimate_items,
  public.estimate_categories,
  public.estimate_payment_schedule_items,
  public.estimate_templates
to service_role;
grant select, insert on table public.estimate_snapshots to service_role;

revoke all privileges on sequence public.estimate_number_seq
from public, anon, authenticated, service_role;
grant usage on sequence public.estimate_number_seq to service_role;

revoke all on function public.next_estimate_number()
from public, anon, authenticated, service_role;
grant execute on function public.next_estimate_number() to service_role;
revoke all on function public.set_estimates_updated_at()
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
