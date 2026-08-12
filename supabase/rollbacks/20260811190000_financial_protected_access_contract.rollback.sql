-- Manual emergency rollback for 20260811190000_financial_protected_access_contract.sql.
--
-- This is a deliberately narrow access rollback: it restores authenticated
-- application access only and never reinstates anonymous access or policies.
-- It therefore preserves Receipt Security and must not be used as a generic
-- historical-policy replay. The operator must inspect the resulting policy
-- fingerprint and either COMMIT or ROLLBACK the open transaction.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  target_table text;
  target_tables text[] := array[
    'invoices', 'invoice_items', 'invoice_payments', 'payments_received',
    'payment_received_attachments', 'deposits', 'ap_bills', 'ap_bill_payments',
    'subcontract_payments', 'expense_lines', 'commissions', 'commission_payments',
    'subcontractors', 'subcontracts'
  ];
begin
  if current_setting('hh.rollback_confirmation', true)
       is distinct from 'ROLLBACK_FINANCIAL_PROTECTED_ACCESS_CONTRACT_20260811190000' then
    raise exception 'set hh.rollback_confirmation before running this rollback';
  end if;

  foreach target_table in array target_tables loop
    if to_regclass(format('public.%I', target_table)) is null
       or not (select relrowsecurity from pg_class where oid = format('public.%I', target_table)::regclass) then
      raise exception 'financial rollback requires RLS-protected public.%', target_table;
    end if;

    if (select array_agg(policyname::text order by policyname)
        from pg_policies
        where schemaname = 'public' and tablename = target_table)
       is distinct from array['financial_owner_admin_' || target_table] then
      raise exception 'financial rollback stopped: public.% policy fingerprint differs', target_table;
    end if;
  end loop;
end
$$;

do $$
declare
  target_table text;
  target_policy record;
  target_tables text[] := array[
    'invoices', 'invoice_items', 'invoice_payments', 'payments_received',
    'payment_received_attachments', 'deposits', 'ap_bills', 'ap_bill_payments',
    'subcontract_payments', 'expense_lines', 'commissions', 'commission_payments',
    'subcontractors', 'subcontracts'
  ];
begin
  foreach target_table in array target_tables loop
    for target_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and roles && array['anon', 'authenticated', 'public']::name[]
    loop
      execute format('drop policy if exists %I on public.%I', target_policy.policyname, target_table);
    end loop;

    execute format('revoke all privileges on table public.%I from public', target_table);
    execute format('revoke all privileges on table public.%I from anon', target_table);
    execute format('revoke all privileges on table public.%I from authenticated', target_table);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', target_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', target_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'financial_authenticated_emergency_' || target_table,
      target_table
    );
  end loop;
end
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'invoices', 'invoice_items', 'invoice_payments', 'payments_received',
    'payment_received_attachments', 'deposits', 'ap_bills', 'ap_bill_payments',
    'subcontract_payments', 'expense_lines', 'commissions', 'commission_payments',
    'subcontractors', 'subcontracts'
  ] loop
    if has_table_privilege('anon', format('public.%I', target_table), 'select') then
      raise exception 'financial rollback must not restore anonymous public.% access', target_table;
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';

-- Intentionally no COMMIT. Inspect the authenticated-only policy fingerprint,
-- then explicitly COMMIT to retain this emergency rollback or ROLLBACK it.
