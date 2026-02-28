-- Clean production reset (data only).
-- Keeps schema intact and clears rows with identity reset.

do $$
declare
  table_list text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
  into table_list
  from pg_tables
  where schemaname = 'public'
    and tablename = any (array[
      'projects',
      'workers',
      'labor_entries',
      'labor_invoices',
      'labor_payments',
      'expenses',
      'expense_lines',
      'invoices',
      'invoice_payments',
      'estimates',
      'estimate_items',
      'transactions',
      'bank_transactions',
      'commitments',
      'company_profile'
    ]);

  if table_list is not null then
    execute 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
  end if;
end $$;

-- Optional: clear uploaded branding files (uncomment if needed).
-- delete from storage.objects where bucket_id = 'branding';

