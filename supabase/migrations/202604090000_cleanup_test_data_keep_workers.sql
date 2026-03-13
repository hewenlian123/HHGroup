-- One-time cleanup: remove all records from test/demo tables.
-- Workers table is NOT touched. No schema changes. No storage bucket deletion.
-- Run manually when you want a clean production reset (e.g. Supabase SQL Editor or migration).

do $$
begin
  -- 1. Commission payment records (refs project_commissions)
  delete from public.commission_payment_records;
exception when undefined_table then null;
end $$;

do $$
begin
  delete from public.project_commissions;
exception when undefined_table then null;
end $$;

  -- 2. Expense lines (refs expenses, project_id)
do $$
begin
  delete from public.expense_lines;
exception when undefined_table then null;
end $$;

do $$
begin
  delete from public.expenses;
exception when undefined_table then null;
end $$;

  -- 3. Labor entries (refs workers + projects; we keep workers)
do $$
begin
  delete from public.labor_entries;
exception when undefined_table then null;
end $$;

  -- 4. Worker receipts (refs workers + projects; we keep workers)
do $$
begin
  delete from public.worker_receipts;
exception when undefined_table then null;
end $$;

  -- 5. Invoice payments and items (refs invoices)
do $$
begin
  delete from public.invoice_payments;
exception when undefined_table then null;
end $$;

do $$
begin
  delete from public.invoice_items;
exception when undefined_table then null;
end $$;

do $$
begin
  delete from public.invoices;
exception when undefined_table then null;
end $$;

  -- 6. AP bill payments and bills
do $$
begin
  delete from public.ap_bill_payments;
exception when undefined_table then null;
end $$;

do $$
begin
  delete from public.ap_bills;
exception when undefined_table then null;
end $$;

  -- 7. Site photos
do $$
begin
  delete from public.site_photos;
exception when undefined_table then null;
end $$;

  -- 8. Change orders: budget items, items, then orders
do $$
begin
  delete from public.project_budget_items;
exception when undefined_table then null;
end $$;

do $$
begin
  delete from public.project_change_order_items;
exception when undefined_table then null;
end $$;

do $$
begin
  delete from public.project_change_order_attachments;
exception when undefined_table then null;
end $$;

do $$
begin
  delete from public.project_change_orders;
exception when undefined_table then null;
end $$;

  -- 9. Project tasks (refs projects, workers; we keep workers)
do $$
begin
  delete from public.project_tasks;
exception when undefined_table then null;
end $$;

  -- 10. Punch list
do $$
begin
  delete from public.punch_list;
exception when undefined_table then null;
end $$;

  -- 11. Material selections
do $$
begin
  delete from public.project_material_selections;
exception when undefined_table then null;
end $$;

  -- 12. Documents
do $$
begin
  delete from public.documents;
exception when undefined_table then null;
end $$;

  -- 13. Project schedule, activity logs (if exist)
do $$
begin
  delete from public.project_schedule;
exception when undefined_table then null;
end $$;

do $$
begin
  delete from public.activity_logs;
exception when undefined_table then null;
end $$;

  -- 14. Projects last (many tables reference projects)
do $$
begin
  delete from public.projects;
exception when undefined_table then null;
end $$;

-- workers table is intentionally NOT modified.
