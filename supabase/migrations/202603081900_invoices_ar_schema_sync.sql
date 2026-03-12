-- AR schema sync: add columns expected by invoices-db.ts (createInvoice, recordInvoicePayment).
-- Project: rzublljldebswurgdqxp. Run in SQL Editor if production was created from a minimal schema.

-- Invoices: add columns used by createInvoice (notes, tax, totals)
alter table public.invoices add column if not exists notes text null;
alter table public.invoices add column if not exists tax_pct numeric not null default 0;
alter table public.invoices add column if not exists subtotal numeric not null default 0;
alter table public.invoices add column if not exists tax_amount numeric not null default 0;
alter table public.invoices add column if not exists paid_total numeric not null default 0;
alter table public.invoices add column if not exists balance_due numeric not null default 0;

-- Invoice payments: add columns used by recordInvoicePayment (paid_at, memo, status)
alter table public.invoice_payments add column if not exists paid_at date null;
alter table public.invoice_payments add column if not exists memo text null;
alter table public.invoice_payments add column if not exists status text not null default 'Posted';
alter table public.invoice_payments add column if not exists created_at timestamptz not null default now();
