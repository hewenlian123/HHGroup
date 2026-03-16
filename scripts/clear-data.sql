-- Clear all data from the database (keep schema).
-- Run in Supabase Dashboard → SQL Editor.
-- TRUNCATE bypasses RLS and is more reliable than DELETE.
-- If a relation "does not exist", comment out that line and run again.
-- After running, verify in Table Editor that project_tasks, punch_list, workers, projects show 0 rows.

-- Child tables first, then parents. CASCADE truncates dependent tables.
TRUNCATE TABLE commission_payment_records CASCADE;
TRUNCATE TABLE project_commissions CASCADE;
TRUNCATE TABLE expense_lines CASCADE;
TRUNCATE TABLE expenses CASCADE;
TRUNCATE TABLE labor_entries CASCADE;
TRUNCATE TABLE worker_receipts CASCADE;
TRUNCATE TABLE worker_reimbursement_payments CASCADE;
TRUNCATE TABLE worker_reimbursements CASCADE;
TRUNCATE TABLE worker_payments CASCADE;
TRUNCATE TABLE invoice_payments CASCADE;
TRUNCATE TABLE invoice_items CASCADE;
TRUNCATE TABLE deposits CASCADE;
TRUNCATE TABLE payments_received CASCADE;
TRUNCATE TABLE invoices CASCADE;
TRUNCATE TABLE site_photos CASCADE;
TRUNCATE TABLE project_budget_items CASCADE;
TRUNCATE TABLE project_change_order_items CASCADE;
TRUNCATE TABLE project_change_order_attachments CASCADE;
TRUNCATE TABLE project_change_orders CASCADE;
TRUNCATE TABLE project_tasks CASCADE;
TRUNCATE TABLE punch_list CASCADE;
TRUNCATE TABLE project_material_selections CASCADE;
TRUNCATE TABLE project_schedule CASCADE;
TRUNCATE TABLE inspection_log CASCADE;
TRUNCATE TABLE activity_logs CASCADE;
TRUNCATE TABLE estimate_meta CASCADE;
TRUNCATE TABLE estimate_items CASCADE;
TRUNCATE TABLE estimate_categories CASCADE;
TRUNCATE TABLE estimate_snapshots CASCADE;
TRUNCATE TABLE estimates CASCADE;
TRUNCATE TABLE material_catalog CASCADE;
TRUNCATE TABLE projects CASCADE;
TRUNCATE TABLE labor_workers CASCADE;
TRUNCATE TABLE workers CASCADE;
