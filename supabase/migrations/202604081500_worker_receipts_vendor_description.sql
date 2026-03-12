-- Add vendor and description to worker_receipts.

alter table public.worker_receipts
  add column if not exists vendor text;

alter table public.worker_receipts
  add column if not exists description text;
