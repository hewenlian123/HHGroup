-- Add status, paid_at, created_at to estimate_payment_schedule for payment tracking
alter table public.estimate_payment_schedule
  add column if not exists status text not null default 'pending' check (status in ('pending', 'paid', 'overdue')),
  add column if not exists paid_at timestamptz null,
  add column if not exists created_at timestamptz not null default now();
