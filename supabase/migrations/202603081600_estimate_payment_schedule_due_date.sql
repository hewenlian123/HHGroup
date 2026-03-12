-- Add optional due_date to estimate_payment_schedule for contractor-style schedule
alter table public.estimate_payment_schedule
  add column if not exists due_date date null;
