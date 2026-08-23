-- R1B.1: normalize the existing Production Estimate objects to least privilege.
--
-- BEFORE (verified read-only against Production rzublljldebswurgdqxp):
--   * anon retained SELECT plus TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on six
--     legacy tables, and SELECT on estimate_payment_schedule_items;
--   * authenticated retained table-wide ALL on six legacy tables and SELECT on
--     estimate_payment_schedule_items;
--   * anon/authenticated retained SELECT/UPDATE/USAGE on estimate_number_seq and
--     EXECUTE on next_estimate_number().
--
-- AFTER:
--   * anon has no direct Estimate object access;
--   * authenticated has SELECT only on the six request-cookie SSR read tables,
--     restricted by is_owner_or_admin();
--   * service_role retains bounded server-only mutation/RPC support;
--   * estimate_snapshots remains append-only to normal application backends;
--   * no rows, financial values, constraints, or schema shape are changed.
--
-- The six approved R1A migrations independently close every new table and RPC
-- they create. Global default privileges are intentionally not changed here
-- because that would expand beyond the Estimate security surface.

do $$
declare
  target_table text;
  target_policy record;
begin
  foreach target_table in array array[
    'estimates',
    'estimate_meta',
    'estimate_items',
    'estimate_categories',
    'estimate_snapshots',
    'estimate_payment_schedule_items',
    'estimate_templates'
  ] loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'R1B.1 Estimate grants closure requires public.%', target_table;
    end if;

    execute format('alter table public.%I enable row level security', target_table);

    for target_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        target_policy.policyname,
        target_table
      );
    end loop;
  end loop;
end
$$;

revoke all privileges on table
  public.estimates,
  public.estimate_meta,
  public.estimate_items,
  public.estimate_categories,
  public.estimate_snapshots,
  public.estimate_payment_schedule_items,
  public.estimate_templates
from public, anon, authenticated, service_role;

-- Owner/admin request-cookie SSR reads. No direct authenticated writes.
grant select on table
  public.estimates,
  public.estimate_meta,
  public.estimate_items,
  public.estimate_categories,
  public.estimate_snapshots,
  public.estimate_payment_schedule_items
to authenticated;

create policy estimates_owner_admin_select
  on public.estimates for select to authenticated
  using ((select public.is_owner_or_admin()));

create policy estimate_meta_owner_admin_select
  on public.estimate_meta for select to authenticated
  using ((select public.is_owner_or_admin()));

create policy estimate_items_owner_admin_select
  on public.estimate_items for select to authenticated
  using ((select public.is_owner_or_admin()));

create policy estimate_categories_owner_admin_select
  on public.estimate_categories for select to authenticated
  using ((select public.is_owner_or_admin()));

create policy estimate_snapshots_owner_admin_select
  on public.estimate_snapshots for select to authenticated
  using ((select public.is_owner_or_admin()));

create policy estimate_payment_schedule_items_owner_admin_select
  on public.estimate_payment_schedule_items for select to authenticated
  using ((select public.is_owner_or_admin()));

-- Strict owner/admin server actions construct this server-only role.
grant select, insert, update, delete on table
  public.estimates,
  public.estimate_meta,
  public.estimate_items,
  public.estimate_categories,
  public.estimate_payment_schedule_items,
  public.estimate_templates
to service_role;

-- Historical snapshots are append-only evidence in normal application flows.
grant select, insert on table public.estimate_snapshots to service_role;

revoke all privileges on sequence public.estimate_number_seq
from public, anon, authenticated, service_role;
grant usage on sequence public.estimate_number_seq to service_role;

revoke all on function public.next_estimate_number()
from public, anon, authenticated, service_role;
grant execute on function public.next_estimate_number() to service_role;

-- Existing triggers do not need Data API EXECUTE grants at runtime.
revoke all on function public.set_estimates_updated_at()
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
