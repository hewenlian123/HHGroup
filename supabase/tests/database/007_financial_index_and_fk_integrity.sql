begin;

select plan(8);

select ok(
  exists (
    select 1
    from pg_catalog.pg_index i
    where i.indexrelid = 'public.idx_payments_received_idempotency_key'::regclass
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indrelid = 'public.payments_received'::regclass
      and pg_catalog.pg_get_indexdef(i.indexrelid) ilike '%(idempotency_key)%where (idempotency_key is not null)'
  ),
  'Payment Received idempotency index is unique, valid, ready, immediate, and correctly shaped'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_index i
    where i.indexrelid = 'public.idx_invoice_payments_payment_received_id_unique'::regclass
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indrelid = 'public.invoice_payments'::regclass
      and pg_catalog.pg_get_indexdef(i.indexrelid) ilike '%(payment_received_id)%where (payment_received_id is not null)'
  ),
  'Invoice allocation identity index is unique, valid, ready, immediate, and correctly shaped'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_index i
    where i.indexrelid = 'public.idx_invoices_idempotency_key'::regclass
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indrelid = 'public.invoices'::regclass
      and pg_catalog.pg_get_indexdef(i.indexrelid) ilike '%(idempotency_key)%where (idempotency_key is not null)'
  ),
  'Invoice idempotency index is unique, valid, ready, immediate, and correctly shaped'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_index i
    where i.indexrelid = 'public.idx_expenses_worker_reimbursement_source'::regclass
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indrelid = 'public.expenses'::regclass
      and pg_catalog.pg_get_indexdef(i.indexrelid) ilike '%(source, source_id)%worker_reimbursement%source_id is not null%'
  ),
  'Reimbursement source identity index is unique, valid, ready, immediate, and correctly shaped'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_index i
    where i.indexrelid = 'public.idx_expenses_atomic_idempotency_group'::regclass
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indrelid = 'public.expenses'::regclass
      and pg_catalog.pg_get_indexdef(i.indexrelid) ilike '%(idempotency_key, idempotency_group_index)%where (idempotency_key is not null)'
  ),
  'Expense group idempotency index is unique, valid, ready, immediate, and correctly shaped'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_index i
    where i.indexrelid = 'public.idx_expenses_bank_transaction_source'::regclass
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indrelid = 'public.expenses'::regclass
      and pg_catalog.pg_get_indexdef(i.indexrelid) ilike '%(source, source_id)%bank_transaction%source_id is not null%'
  ),
  'Bank Expense source identity index is unique, valid, ready, immediate, and correctly shaped'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_index i
    where i.indexrelid = 'public.idx_bank_transactions_reconcile_idempotency_key'::regclass
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indrelid = 'public.bank_transactions'::regclass
      and pg_catalog.pg_get_indexdef(i.indexrelid) ilike '%(reconcile_idempotency_key)%where (reconcile_idempotency_key is not null)'
  ),
  'Bank reconciliation idempotency index is unique, valid, ready, immediate, and correctly shaped'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.estimate_snapshots'::regclass
      and c.conname = 'estimate_snapshots_estimate_id_fkey'
      and c.confdeltype = 'r'
      and c.convalidated
  ),
  'Estimate snapshot foreign key is validated and restrictive'
);

select * from finish();

rollback;
