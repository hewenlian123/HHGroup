-- Add receipt_date to worker_receipts for explicit expense date.

alter table public.worker_receipts
  add column if not exists receipt_date date;

