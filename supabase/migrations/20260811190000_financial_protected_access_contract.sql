-- Production access repair for protected financial data.
-- Browser access is owner/admin-only. service_role stays server-only. The
-- subcontractor tables retain owner/admin CRUD because approved application
-- workflows create and maintain those records.

do $$
declare
  target_table text;
  target_policy record;
  target_tables text[] := array[
    'invoices',
    'invoice_items',
    'invoice_payments',
    'payments_received',
    'payment_received_attachments',
    'deposits',
    'ap_bills',
    'ap_bill_payments',
    'subcontract_payments',
    'expense_lines',
    'commissions',
    'commission_payments',
    'subcontractors',
    'subcontracts'
  ];
begin
  if to_regprocedure('public.is_owner_or_admin()') is null then
    raise exception 'financial access repair requires public.is_owner_or_admin()';
  end if;

  foreach target_table in array target_tables loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'financial access repair requires public.%', target_table;
    end if;

    if not (
      select relrowsecurity
      from pg_class
      where oid = format('public.%I', target_table)::regclass
    ) then
      raise exception 'financial access repair requires RLS on public.%', target_table;
    end if;

    execute format('revoke all privileges on table public.%I from public', target_table);
    execute format('revoke all privileges on table public.%I from anon', target_table);
    execute format('revoke all privileges on table public.%I from authenticated', target_table);
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      target_table
    );
    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      target_table
    );

    for target_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and roles && array['anon', 'authenticated', 'public']::name[]
    loop
      execute format('drop policy if exists %I on public.%I', target_policy.policyname, target_table);
    end loop;

    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_owner_or_admin())) with check ((select public.is_owner_or_admin()))',
      'financial_owner_admin_' || target_table,
      target_table
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';
