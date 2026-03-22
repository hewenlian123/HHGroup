-- Performance: indexes for frequently filtered/sorted columns and FKs used in JOINs.

-- Expenses list: order by expense_date desc, filter by id
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON public.expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON public.expenses (created_at DESC);

-- Expense lines: filter by expense_id (JOIN / list by expense)
CREATE INDEX IF NOT EXISTS idx_expense_lines_expense_id ON public.expense_lines (expense_id);

-- Worker reimbursements: filter by status (pending)
CREATE INDEX IF NOT EXISTS idx_worker_reimbursements_status ON public.worker_reimbursements (status);

-- Labor: entries filtered by date range and status (schema varies: entry_date vs work_date)
DO $idx$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'labor_entries' AND column_name = 'entry_date'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_labor_entries_entry_date ON public.labor_entries (entry_date)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'labor_entries' AND column_name = 'work_date'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_labor_entries_work_date ON public.labor_entries (work_date)';
  END IF;
END $idx$;
CREATE INDEX IF NOT EXISTS idx_labor_entries_status ON public.labor_entries (status);
CREATE INDEX IF NOT EXISTS idx_labor_entries_worker_id ON public.labor_entries (worker_id);

-- Labor invoices: list order and status filter
CREATE INDEX IF NOT EXISTS idx_labor_invoices_created_at ON public.labor_invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_labor_invoices_status ON public.labor_invoices (status);

-- Labor payments: filter by worker and date
CREATE INDEX IF NOT EXISTS idx_labor_payments_worker_id ON public.labor_payments (worker_id);
CREATE INDEX IF NOT EXISTS idx_labor_payments_payment_date ON public.labor_payments (payment_date);
