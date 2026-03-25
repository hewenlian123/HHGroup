-- Ensure Commission tables are visible to anon clients.
--
-- Production remote schema currently has only "allow authenticated *" policies for:
-- - public.project_commissions
-- - public.commission_payment_records
--
-- Server Components sometimes run without service role in production, which causes anon reads
-- to return zero rows under RLS. This migration adds permissive anon policies so the
-- Commission UI can display newly created records consistently.

do $$
begin
  if to_regclass('public.project_commissions') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'project_commissions'
        and policyname = 'project_commissions_all_anon'
    ) then
      create policy "project_commissions_all_anon"
      on public.project_commissions
      as permissive
      for all
      to anon
      using (true)
      with check (true);
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.commission_payment_records') is not null then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'commission_payment_records'
        and policyname = 'commission_payment_records_all_anon'
    ) then
      create policy "commission_payment_records_all_anon"
      on public.commission_payment_records
      as permissive
      for all
      to anon
      using (true)
      with check (true);
    end if;
  end if;
end $$;

